const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const dbService = require('./dbService');
const aiService = require('./aiService');

const execFileAsync = promisify(execFile);

const UPLOADS_WHATSAPP_ROOT = path.join(__dirname, '..', 'data', 'uploads', 'whatsapp');

/**
 * Serviço de Processamento Multimodal (Áudio, Vídeo, Imagem e Documento)
 * Adaptado do fluxo "Automatas.tech - Atendimento Leads" para Node.js nativo:
 * - Áudio -> Groq Whisper (whisper-large-v3, pt)
 * - Vídeo -> FFmpeg extrai áudio -> Groq Whisper com timestamps -> LLM seleciona 1-5 momentos-chave -> FFmpeg extrai frames JPEG
 * - Imagem & Documento (PDF) -> Salva em disco + converte base64 para análise visual
 * - Análise de Lote Visual -> OpenRouter Multimodal (Gemini 2.5 Flash / Qwen fallback) gera laudo técnico de usinagem
 */
class MediaProcessorService {
  ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  getGroqApiKey() {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    return (cfg.groqApiKey || process.env.GROQ_API_KEY || '').trim();
  }

  extensionFromMime(mimeType, fallback = 'bin') {
    const m = String(mimeType || '').toLowerCase();
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
    if (m.includes('wav')) return 'wav';
    if (m.includes('mp4')) return 'mp4';
    if (m.includes('quicktime') || m.includes('mov')) return 'mov';
    if (m.includes('webm')) return 'webm';
    if (m.includes('pdf')) return 'pdf';
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('dxf')) return 'dxf';
    if (m.includes('dwg')) return 'dwg';
    return fallback;
  }

  /**
   * Transcreve áudio via Groq Whisper API (whisper-large-v3)
   */
  async transcreverAudioGroq(buffer, fileName = 'audio.ogg', mimeType = 'audio/ogg', withTimestamps = false) {
    const groqKey = this.getGroqApiKey();
    if (!groqKey) {
      console.warn('[MediaProcessor] GROQ_API_KEY não configurada. Transcrição de áudio ignorada.');
      return {
        sucesso: false,
        text: '',
        segments: [],
        duration: 0,
        aviso: 'GROQ_API_KEY não configurada'
      };
    }

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType || 'audio/ogg' });
    form.append('file', blob, fileName);
    form.append('model', 'whisper-large-v3');
    form.append('language', 'pt');

    if (withTimestamps) {
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
    } else {
      form.append('response_format', 'json');
    }

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`
      },
      body: form,
      signal: AbortSignal.timeout(45000)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error?.message || `Erro HTTP ${resp.status} na transcrição Groq Whisper`);
    }

    const segments = Array.isArray(data.segments) ? data.segments : [];
    const duration =
      data.duration || (segments.length > 0 ? segments[segments.length - 1].end : 10);

    return {
      sucesso: true,
      text: (data.text || '').trim(),
      segments,
      duration
    };
  }

  /**
   * Processa áudio recebido: salva em disco e transcreve via Groq Whisper
   */
  async processarAudio({ phone, buffer, mimeType = 'audio/ogg', originalName }) {
    const safePhone = String(phone || 'sem_telefone').replace(/\D/g, '') || 'sem_telefone';
    const ext = this.extensionFromMime(mimeType, 'ogg');
    const fileName = originalName || `${Date.now()}_audio.${ext}`;
    const folder = path.join(UPLOADS_WHATSAPP_ROOT, safePhone, 'audio');
    this.ensureDir(folder);

    const fullPath = path.join(folder, fileName);
    fs.writeFileSync(fullPath, buffer);
    const publicUrl = `/uploads/whatsapp/${safePhone}/audio/${fileName}`;

    let transcription = '';
    try {
      const resGroq = await this.transcreverAudioGroq(buffer, fileName, mimeType, false);
      transcription = resGroq.text || '';
    } catch (err) {
      console.error('[MediaProcessor] Erro ao transcrever áudio:', err.message);
    }

    return {
      messageType: 'audio',
      fileName,
      mimeType,
      fileSize: buffer.length,
      url: publicUrl,
      fullDiskPath: fullPath,
      transcription,
      content: transcription || '[Áudio recebido — não foi possível transcrever automaticamente]',
      hasVisualMedia: false
    };
  }

  /**
   * Processa imagem ou documento (PDF/foto/desenho): salva em disco e prepara base64
   */
  async processarImagemOuDocumento({ phone, buffer, mimeType, messageType = 'image', originalName, caption = '' }) {
    const safePhone = String(phone || 'sem_telefone').replace(/\D/g, '') || 'sem_telefone';
    const isDoc = messageType === 'document';
    const subFolder = isDoc ? 'document' : 'image';
    const defaultExt = isDoc ? 'pdf' : 'jpg';
    const ext = originalName && originalName.includes('.')
      ? path.extname(originalName).replace('.', '').toLowerCase()
      : this.extensionFromMime(mimeType, defaultExt);

    const cleanBaseName = originalName
      ? path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_')
      : `${Date.now()}_${messageType}.${ext}`;
    const fileName = `${Date.now()}_${cleanBaseName}`;

    const folder = path.join(UPLOADS_WHATSAPP_ROOT, safePhone, subFolder);
    this.ensureDir(folder);

    const fullPath = path.join(folder, fileName);
    fs.writeFileSync(fullPath, buffer);
    const publicUrl = `/uploads/whatsapp/${safePhone}/${subFolder}/${fileName}`;

    const effectiveMime = mimeType || (isDoc ? 'application/pdf' : 'image/jpeg');
    const isVisualSupported =
      effectiveMime.startsWith('image/') ||
      effectiveMime === 'application/pdf';

    return {
      messageType,
      fileName,
      mimeType: effectiveMime,
      fileSize: buffer.length,
      url: publicUrl,
      fullDiskPath: fullPath,
      base64: isVisualSupported ? buffer.toString('base64') : '',
      content: caption || `[${isDoc ? 'Documento' : 'Imagem'} enviado: ${cleanBaseName}]`,
      hasVisualMedia: isVisualSupported
    };
  }

  /**
   * Usa LLM rápida via OpenRouter para selecionar 1 a 5 timestamps-chave de um vídeo técnico de peça/usinagem
   */
  async selecionarTimestampsVideo(formattedTimeline, duration) {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    const apiKey = cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
    if (!apiKey || !formattedTimeline) {
      // Fallback determinístico: início, meio e fim
      const d = Math.max(1, Number(duration) || 10);
      if (d <= 4) return [Number((d / 2).toFixed(1))];
      return [
        Number((d * 0.2).toFixed(1)),
        Number((d * 0.5).toFixed(1)),
        Number((d * 0.8).toFixed(1))
      ];
    }

    try {
      const { parsed } = await aiService.executarChamadaOpenRouterComFallback({
        apiKey,
        modeloPrincipal: cfg.modeloRoteador || 'google/gemini-2.5-flash',
        modeloFallback: cfg.modeloEconomico || 'qwen/qwen3.8-max-prime',
        timeoutMs: 25000,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `Você é um analisador de vídeos técnicos da Nardelli Usinagem.
Analise a transcrição com timestamps (duração total: ${duration}s) de um cliente mostrando uma peça, equipamento, dano, desgaste ou medição.
Identifique de 1 a 5 momentos exatos (em segundos) onde o cliente mostra detalhes importantes da peça, medidas, danos ou explica o serviço.

RETORNE EXCLUSIVAMENTE UM JSON:
{
  "timestamps": [2.5, 7.0, 11.4],
  "reason": "Descrição curta dos momentos escolhidos"
}`
          },
          {
            role: 'user',
            content: formattedTimeline
          }
        ]
      });

      const valid = Array.from(
        new Set(
          (parsed?.timestamps || [])
            .map((t) => Number(parseFloat(t).toFixed(1)))
            .filter((t) => !isNaN(t) && t >= 0 && t <= duration)
        )
      ).sort((a, b) => a - b);

      if (valid.length > 0) return valid.slice(0, 5);
    } catch (err) {
      console.warn('[MediaProcessor] Falha ao selecionar timestamps via LLM, usando fallback:', err.message);
    }

    const d = Math.max(1, Number(duration) || 10);
    return [Number((d * 0.25).toFixed(1)), Number((d * 0.65).toFixed(1))];
  }

  /**
   * Processa vídeo recebido:
   * 1) Salva MP4
   * 2) Extrai áudio com FFmpeg
   * 3) Transcreve com timestamps via Groq Whisper
   * 4) Seleciona 1-5 momentos-chave
   * 5) Extrai frames JPEG com FFmpeg para análise multimodal
   */
  async processarVideo({ phone, buffer, mimeType = 'video/mp4', caption = '' }) {
    const safePhone = String(phone || 'sem_telefone').replace(/\D/g, '') || 'sem_telefone';
    const ts = Date.now();
    const videoFileName = `${ts}_video.mp4`;
    const videoFolder = path.join(UPLOADS_WHATSAPP_ROOT, safePhone, 'video');
    const framesFolder = path.join(UPLOADS_WHATSAPP_ROOT, safePhone, 'frames');
    const tempFolder = path.join(UPLOADS_WHATSAPP_ROOT, safePhone, 'temp');

    this.ensureDir(videoFolder);
    this.ensureDir(framesFolder);
    this.ensureDir(tempFolder);

    const videoFullPath = path.join(videoFolder, videoFileName);
    fs.writeFileSync(videoFullPath, buffer);
    const videoPublicUrl = `/uploads/whatsapp/${safePhone}/video/${videoFileName}`;

    let fullTranscription = '';
    let duration = 10;
    let extractedFrames = [];

    try {
      const audioFullPath = path.join(tempFolder, `${ts}_temp_audio.mp3`);
      // Extrai faixa de áudio (ignora erro se o vídeo não tiver trilha de áudio)
      let hasAudio = true;
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-i', videoFullPath,
          '-vn',
          '-ar', '16000',
          '-ac', '1',
          '-c:a', 'libmp3lame',
          audioFullPath
        ], { timeout: 30000 });
      } catch (audioErr) {
        hasAudio = false;
        console.warn('[MediaProcessor] Vídeo sem áudio ou FFmpeg indisponível para áudio:', audioErr.message);
      }

      let formattedTimeline = '';
      if (hasAudio && fs.existsSync(audioFullPath)) {
        const audioBuf = fs.readFileSync(audioFullPath);
        try {
          const groqRes = await this.transcreverAudioGroq(audioBuf, `${ts}_audio.mp3`, 'audio/mpeg', true);
          fullTranscription = groqRes.text || '';
          duration = groqRes.duration || 10;
          if (groqRes.segments && groqRes.segments.length > 0) {
            formattedTimeline = groqRes.segments
              .map((s) => `[${Number(s.start).toFixed(1)}s -> ${Number(s.end).toFixed(1)}s]: "${String(s.text || '').trim()}"`)
              .join('\n');
          }
        } catch (errGroq) {
          console.warn('[MediaProcessor] Falha na transcrição do vídeo:', errGroq.message);
        } finally {
          try { fs.unlinkSync(audioFullPath); } catch (_) {}
        }
      }

      const selectedTimestamps = await this.selecionarTimestampsVideo(formattedTimeline, duration);

      // Extrai frames JPEG nos timestamps escolhidos
      for (let i = 0; i < selectedTimestamps.length; i++) {
        const sec = selectedTimestamps[i];
        const frameFileName = `${ts}_frame_${i + 1}_${String(sec).replace('.', '_')}s.jpg`;
        const frameFullPath = path.join(framesFolder, frameFileName);
        try {
          await execFileAsync('ffmpeg', [
            '-y',
            '-ss', String(sec),
            '-i', videoFullPath,
            '-vframes', '1',
            '-q:v', '3',
            frameFullPath
          ], { timeout: 15000 });

          if (fs.existsSync(frameFullPath)) {
            const frameBuf = fs.readFileSync(frameFullPath);
            extractedFrames.push({
              id: `frame_${ts}_${i + 1}`,
              nome: frameFileName,
              tipo: 'image/jpeg',
              url: `/uploads/whatsapp/${safePhone}/frames/${frameFileName}`,
              base64: frameBuf.toString('base64'),
              timestamp: sec
            });
          }
        } catch (frameErr) {
          console.warn(`[MediaProcessor] Falha ao extrair frame em ${sec}s:`, frameErr.message);
        }
      }
    } catch (err) {
      console.error('[MediaProcessor] Erro no pipeline de vídeo:', err.message);
    }

    const combinedText = [
      caption ? `Legenda do vídeo: ${caption}` : '',
      fullTranscription ? `Transcrição do áudio do vídeo: ${fullTranscription}` : ''
    ].filter(Boolean).join('\n') || '[Vídeo técnico enviado pelo cliente]';

    return {
      messageType: 'video',
      fileName: videoFileName,
      mimeType,
      fileSize: buffer.length,
      url: videoPublicUrl,
      fullDiskPath: videoFullPath,
      transcription: fullTranscription,
      content: combinedText,
      extractedFrames,
      hasVisualMedia: extractedFrames.length > 0
    };
  }

  /**
   * Analisa um lote de mídias visuais (fotos, desenhos técnicos, PDFs, frames de vídeo)
   * usando modelo multimodal via OpenRouter para extrair medidas, material, tipo de peça e danos.
   */
  async analisarLoteVisual({ arquivos = [], textoCliente = '', historicoRecente = '' }) {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    const apiKey = cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
    if (!apiKey || !arquivos.length) return null;

    const anexosPreparados = aiService.prepararAnexosParaOpenRouter(arquivos);
    if (!anexosPreparados.length) return null;

    const userContent = [
      {
        type: 'text',
        text: `Analise os arquivos técnicos enviados pelo cliente (fotos de peças, desenhos mecânicos, PDFs ou frames de vídeo) para a Nardelli Usinagem.

[CONTEXTO RECENTE DA CONVERSA]
${historicoRecente || 'Início do atendimento.'}

[MENSAGEM / TRANSCRIÇÃO ENVIADA JUNTO]
${textoCliente || '(sem texto adicional)'}

Extraia TODAS as informações técnicas visíveis com precisão. Retorne EXCLUSIVAMENTE um JSON válido:
{
  "resumo_visual": "Descrição técnica objetiva do que aparece nas imagens/PDFs/frames",
  "tipo_peca_identificada": "string ou null",
  "servico_sugerido": "FABRICACAO | RECUPERACAO | MANUTENCAO | TRATAMENTO_TERMICO | OUTRO",
  "medidas_encontradas": "Lista de cotas/diâmetros/comprimentos/roscas visíveis ou null se não houver cotas legíveis",
  "desenho_tecnico_legivel": true | false,
  "material_identificado": "string ou null (se indicado no desenho/legenda ou evidente)",
  "quantidade_identificada": number ou null,
  "observacoes_tecnicas": "Tolerâncias, acabamentos, danos/desgastes, tratamentos térmicos ou alertas de legibilidade"
}`
      },
      ...anexosPreparados
    ];

    try {
      const { parsed } = await aiService.executarChamadaOpenRouterComFallback({
        apiKey,
        modeloPrincipal: cfg.modeloRoteador || 'google/gemini-2.5-flash',
        modeloFallback: cfg.modeloEconomico || 'qwen/qwen3.8-max-prime',
        timeoutMs: 45000,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'Você é um engenheiro mecânico especialista em leitura de desenhos técnicos, peças industriais e inspeção visual para usinagem pesada e convencional. Responda apenas em JSON válido.'
          },
          {
            role: 'user',
            content: userContent
          }
        ]
      });
      return parsed;
    } catch (err) {
      console.error('[MediaProcessor] Falha na análise visual multimodal do lote:', err.message);
      return null;
    }
  }
}

module.exports = new MediaProcessorService();
