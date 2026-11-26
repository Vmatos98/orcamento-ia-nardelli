const dbService = require('./dbService');
const aiService = require('./aiService');
const metaWhatsappService = require('./metaWhatsappService');
const mediaProcessorService = require('./mediaProcessorService');

/**
 * Orquestrador Nativo do Chatbot Nardelli Usinagem (WhatsApp Cloud API + JEV Gatekeeper)
 *
 * Fluxo completo (adaptado de "Automatas.tech - Atendimento Leads" + JEV):
 * 1. Recebe mensagens (texto, áudio transcrito, vídeo com frames + transcrição, imagens, PDFs)
 * 2. Agrupa mensagens sequenciais do mesmo telefone via Debounce configurável
 * 3. Verifica pausa de IA por atendimento humano (reativa automaticamente após 2h sem interação humana)
 * 4. Se o lote tiver mídias visuais (fotos/PDFs/frames), gera laudo técnico multimodal
 * 5. Aciona o JEV (Validador de Coleta) para:
 *    - Extrair/atualizar todos os dados estruturados da peça
 *    - Validar os 4 requisitos obrigatórios (Descrição, Dimensões/Desenho, Material, Quantidade)
 *    - Indicar à LLM exatamente quais dados ainda faltam
 *    - Indicar ao sistema quando TODOS os dados obrigatórios estão completos
 * 6. Quando pronto_para_orcamento = true:
 *    - Monta automaticamente o pré-orçamento via aiService.gerarPreviaOrcamento + cálculo BDI Nardelli
 *    - Registra na fila PENDENTE_REVISAO com origem 'whatsapp'
 *    - Confirma ao cliente o número do orçamento gerado
 * 7. Quando faltam dados:
 *    - LLM conversacional (Principal + Fallback + Contingência Humana) responde ao cliente pedindo APENAS o que falta
 */
class ChatbotService {
  constructor() {
    // Buffer de debounce por telefone: Map<phone, { items: [], timer: Timeout, meta: {} }>
    this.debounceBuffers = new Map();
    // Lock por telefone para evitar processamento concorrente da mesma conversa
    this.processingLocks = new Set();
  }

  getDebounceMs() {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    const val = Number(cfg.chatbotDebounceMs ?? process.env.CHATBOT_DEBOUNCE_MS ?? 6000);
    return isNaN(val) ? 6000 : Math.max(0, val);
  }

  /**
   * Busca conversa ativa por telefone ou cria uma nova estrutura
   */
  async obterOuCriarConversa({ phone, waId = null, senderName = 'Cliente WhatsApp', canalOrigem = 'whatsapp', phoneNumberId }) {
    const cleanPhone = metaWhatsappService.normalizePhone(phone) || String(phone || '').replace(/\D/g, '');
    let conversa = await dbService.getConversaByTelefone(cleanPhone);

    if (!conversa) {
      conversa = {
        id: 'conv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        cliente: {
          nome: senderName || 'Cliente WhatsApp',
          telefone: cleanPhone,
          empresa: ''
        },
        status: 'coletando_dados',
        orcamentoId: null,
        orcamentoNumero: null,
        descricaoServico: '',
        canalOrigem,
        phoneNumberId: phoneNumberId || null,
        waId: waId || null,
        aiEnabled: true,
        lastHumanInteraction: null,
        ultimaMensagemClienteEm: new Date().toISOString(),
        arquivos: [],
        jevState: {
          dadosColetados: {
            descricao_peca_servico: null,
            tipo_servico: null,
            dimensoes_medidas: null,
            possui_desenho_ou_foto_tecnica: false,
            possui_modelagem_3d: null,
            incluir_modelagem_3d: false,
            material: null,
            quantidade: null,
            unidade: 'PÇ',
            nome_cliente: senderName !== 'Cliente WhatsApp' ? senderName : null,
            empresa: null,
            prazo_urgencia: null,
            tratamento_termico: null,
            tolerancias_observacoes: null,
            endereco_frete: null
          },
          checklistObrigatorio: {
            descricao_ok: false,
            dimensoes_ou_desenho_ok: false,
            material_ok: false,
            quantidade_ok: false
          },
          dadosFaltantes: ['descricao_peca_servico', 'dimensoes_ou_desenho', 'material', 'quantidade'],
          prontoParaOrcamento: false,
          resumoTecnico: '',
          laudosVisuais: []
        },
        mensagens: []
      };
      await dbService.saveConversa(conversa);
    } else {
      // Atualiza nome se ainda for genérico
      if (
        senderName &&
        senderName !== 'Cliente WhatsApp' &&
        (!conversa.cliente?.nome || conversa.cliente.nome === 'Cliente WhatsApp')
      ) {
        conversa.cliente.nome = senderName;
      }
      if (phoneNumberId && !conversa.phoneNumberId) {
        conversa.phoneNumberId = phoneNumberId;
      }
      if (waId && !conversa.waId) {
        conversa.waId = waId;
      }
      if (!conversa.arquivos) conversa.arquivos = [];
      if (conversa.aiEnabled === undefined) conversa.aiEnabled = true;
      if (!conversa.jevState) {
        conversa.jevState = {
          dadosColetados: {},
          checklistObrigatorio: {
            descricao_ok: false,
            dimensoes_ou_desenho_ok: false,
            material_ok: false,
            quantidade_ok: false
          },
          dadosFaltantes: ['descricao_peca_servico', 'dimensoes_ou_desenho', 'material', 'quantidade'],
          prontoParaOrcamento: false,
          resumoTecnico: '',
          laudosVisuais: []
        };
      }
    }

    return conversa;
  }

  /**
   * Pausa a IA quando um atendente humano responde (via WhatsApp Business App echo ou Dashboard)
   */
  async registrarInteracaoHumana({ phone, texto, origem = 'atendente_app' }) {
    const cleanPhone = metaWhatsappService.normalizePhone(phone);
    if (!cleanPhone) return null;

    const conversa = await this.obterOuCriarConversa({ phone: cleanPhone });
    conversa.aiEnabled = false;
    conversa.lastHumanInteraction = new Date().toISOString();
    conversa.status = 'atendimento_humano';

    if (texto) {
      conversa.mensagens.push({
        id: 'm_hum_' + Date.now(),
        remetente: 'atendente',
        texto,
        origem,
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
    }

    return await dbService.saveConversa(conversa);
  }

  /**
   * Enfileira mensagem recebida da Meta no buffer de debounce por telefone
   */
  enfileirarMensagem(item) {
    const cleanPhone = metaWhatsappService.normalizePhone(item.phone);
    if (!cleanPhone) return;

    const debounceMs = this.getDebounceMs();
    let entry = this.debounceBuffers.get(cleanPhone);

    if (!entry) {
      entry = { items: [], timer: null };
      this.debounceBuffers.set(cleanPhone, entry);
    }

    entry.items.push({ ...item, phone: cleanPhone });

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    entry.timer = setTimeout(() => {
      const lote = entry.items.slice();
      this.debounceBuffers.delete(cleanPhone);
      this.processarLote(cleanPhone, lote, { enviarViaMeta: true }).catch((err) => {
        console.error(`[Chatbot] Erro no processamento do lote de ${cleanPhone}:`, err);
      });
    }, debounceMs);
  }

  /**
   * Verifica se a IA está habilitada (reativa automaticamente se passou > 2h desde a última interação humana)
   */
  verificarIAHabilitada(conversa) {
    if (conversa.aiEnabled === false) {
      if (conversa.lastHumanInteraction) {
        const diffHoras = (Date.now() - new Date(conversa.lastHumanInteraction).getTime()) / (1000 * 60 * 60);
        if (diffHoras >= 2) {
          conversa.aiEnabled = true;
          return true;
        }
      }
      return false;
    }
    return true;
  }

  /**
   * Processa um lote consolidado de mensagens/mídias de um cliente
   * Usado tanto pelo webhook Meta (após debounce) quanto pelo Simulador Web (imediato)
   */
  async processarLote(phone, itensLote = [], opcoes = {}) {
    const { enviarViaMeta = true, modoSimulador = false } = opcoes;
    const cleanPhone = metaWhatsappService.normalizePhone(phone) || String(phone || '').replace(/\D/g, '');

    if (!itensLote || itensLote.length === 0) return null;

    if (!modoSimulador && dbService.isContatoPermitidoChatbot && !dbService.isContatoPermitidoChatbot(cleanPhone).permitido) {
      console.log(`[Chatbot JEV Filtro Teste] Lote ignorado para ${cleanPhone} (fora da lista de contatos de teste).`);
      return null;
    }

    // Aguarda brevemente se houver lock concorrente no mesmo número
    if (this.processingLocks.has(cleanPhone)) {
      await new Promise((r) => setTimeout(r, 800));
    }
    this.processingLocks.add(cleanPhone);

    try {
      const primeiro = itensLote[0];
      const conversa = await this.obterOuCriarConversa({
        phone: cleanPhone,
        waId: primeiro.waId || null,
        senderName: primeiro.senderName || 'Cliente WhatsApp',
        canalOrigem: modoSimulador ? 'simulador_web' : 'whatsapp',
        phoneNumberId: primeiro.phoneNumberId
      });

      const agoraHora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const textosLote = [];
      const novosArquivosVisuais = [];
      let novosItensProcessados = 0;

      // 1. Registra cada item recebido no histórico da conversa e coleta arquivos (com deduplicação por messageId)
      for (const item of itensLote) {
        if (item.messageId && (conversa.mensagens || []).some(m => m.id === item.messageId)) {
          continue;
        }
        novosItensProcessados++;
        const tipo = item.messageType || 'text';
        const texto = String(item.content || '').trim();

        if (texto) {
          textosLote.push(tipo === 'audio' ? `[Áudio transcrito]: ${texto}` : texto);
        }

        // Anexos visuais (imagem, PDF ou frames extraídos de vídeo)
        if (tipo === 'video' && Array.isArray(item.extractedFrames)) {
          item.extractedFrames.forEach((frame) => {
            novosArquivosVisuais.push(frame);
            conversa.arquivos.push({
              id: frame.id,
              nome: frame.nome,
              tipo: frame.tipo,
              url: frame.url,
              origem: 'video_frame'
            });
          });
        } else if ((tipo === 'image' || tipo === 'document') && item.url) {
          const arqObj = {
            id: `arq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            nome: item.fileName || `anexo_${tipo}`,
            tipo: item.mimeType || (tipo === 'document' ? 'application/pdf' : 'image/jpeg'),
            url: item.url,
            base64: item.base64 || ''
          };
          if (item.hasVisualMedia) {
            novosArquivosVisuais.push(arqObj);
          }
          conversa.arquivos.push({
            id: arqObj.id,
            nome: arqObj.nome,
            tipo: arqObj.tipo,
            url: arqObj.url
          });
        }

        conversa.mensagens.push({
          id: item.messageId || 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
          remetente: 'cliente',
          texto: texto || `[Mídia recebida: ${tipo}]`,
          tipoMidia: tipo,
          mediaUrl: item.url || null,
          hora: agoraHora
        });
      }

      if (novosItensProcessados === 0) {
        return {
          sucesso: true,
          duplicado: true,
          conversa,
          respostaBot: null
        };
      }

      conversa.ultimaMensagemClienteEm = new Date().toISOString();
      const textoConsolidado = textosLote.join('\n').trim();
      if (textoConsolidado) {
        conversa.descricaoServico = [conversa.descricaoServico, textoConsolidado].filter(Boolean).join('\n');
      }

      // 2. Verifica se a IA está pausada (atendimento humano assumiu)
      const iaAtiva = this.verificarIAHabilitada(conversa);
      if (!iaAtiva) {
        await dbService.saveConversa(conversa);
        return {
          sucesso: true,
          iaPausada: true,
          conversa,
          respostaBot: null
        };
      }

      // 3. Se o lote contém mídias visuais (fotos, desenhos, PDFs, frames de vídeo), roda análise multimodal
      let laudoVisual = null;
      if (novosArquivosVisuais.length > 0) {
        const historicoRecente = conversa.mensagens
          .slice(-8)
          .map((m) => `${m.remetente === 'cliente' ? 'Cliente' : 'Assistente'}: ${m.texto}`)
          .join('\n');

        laudoVisual = await mediaProcessorService.analisarLoteVisual({
          arquivos: novosArquivosVisuais,
          textoCliente: textoConsolidado,
          historicoRecente
        });

        if (laudoVisual) {
          if (!Array.isArray(conversa.jevState.laudosVisuais)) {
            conversa.jevState.laudosVisuais = [];
          }
          conversa.jevState.laudosVisuais.push({
            data: new Date().toISOString(),
            ...laudoVisual
          });
        }
      }

      // 4. JEV GATEKEEPER: avalia completude dos dados obrigatórios e indica à LLM o que falta
      const avaliacaoJev = await this.avaliarCompletudeComJev({
        conversa,
        textoNovo: textoConsolidado,
        laudoVisual
      });

      // Atualiza estado JEV na conversa
      conversa.jevState = {
        ...conversa.jevState,
        dadosColetados: avaliacaoJev.dados_coletados,
        checklistObrigatorio: avaliacaoJev.checklist_obrigatorio,
        dadosFaltantes: avaliacaoJev.dados_faltantes,
        perguntasSugeridas: avaliacaoJev.perguntas_sugeridas_llm,
        prontoParaOrcamento: avaliacaoJev.pronto_para_orcamento,
        confianca: avaliacaoJev.confianca,
        resumoTecnico: avaliacaoJev.resumo_tecnico_consolidado,
        atualizadoEm: new Date().toISOString()
      };

      // Atualiza dados de cliente extraídos pelo JEV (se informados)
      if (avaliacaoJev.dados_coletados?.nome_cliente) {
        conversa.cliente.nome = avaliacaoJev.dados_coletados.nome_cliente;
      }
      if (avaliacaoJev.dados_coletados?.empresa) {
        conversa.cliente.empresa = avaliacaoJev.dados_coletados.empresa;
      }

      let respostaBot = '';
      let orcamentoGerado = null;

      // 5A. Cliente pediu explicitamente atendimento humano
      if (avaliacaoJev.quer_falar_com_humano) {
        conversa.aiEnabled = false;
        conversa.lastHumanInteraction = new Date().toISOString();
        conversa.status = 'atendimento_humano';
        respostaBot =
          'Perfeito! Já estou transferindo seu atendimento para um de nossos especialistas da Nardelli Usinagem. Em instantes ele falará com você por aqui!';
      }
      // 5B. JEV CONFIRMOU: TODOS OS DADOS OBRIGATÓRIOS FORAM COLETADOS -> GERA ORÇAMENTO AUTOMATICAMENTE
      else if (avaliacaoJev.pronto_para_orcamento && !conversa.orcamentoId) {
        orcamentoGerado = await this.gerarOrcamentoAutomatico({
          conversa,
          avaliacaoJev
        });

        conversa.orcamentoId = orcamentoGerado.id;
        conversa.orcamentoNumero = orcamentoGerado.numero;
        conversa.status = 'orcamento_gerado';

        respostaBot = await this.gerarRespostaConfirmacaoOrcamento({
          conversa,
          avaliacaoJev,
          orcamento: orcamentoGerado
        });
      }
      // 5C. AINDA FALTAM DADOS OBRIGATÓRIOS (ou orçamento já foi gerado e cliente mandou complemento)
      else {
        conversa.status = conversa.orcamentoId ? 'orcamento_gerado' : 'coletando_dados';
        const resLLM = await this.gerarRespostaConversacional({
          conversa,
          avaliacaoJev,
          laudoVisual,
          textoNovo: textoConsolidado
        });

        if (resLLM.falhaTotal) {
          conversa.aiEnabled = false;
          conversa.lastHumanInteraction = new Date().toISOString();
          conversa.status = 'falha_ia_atendimento_humano';
          respostaBot =
            'Olá! Recebemos suas informações aqui na Nardelli Usinagem. Nosso assistente automático está com alta demanda no momento, mas já direcionei seu pedido para um de nossos técnicos continuar seu atendimento em instantes!';
        } else {
          respostaBot = resLLM.texto;
        }
      }

      // 6. Registra resposta do bot no histórico
      conversa.mensagens.push({
        id: 'm_bot_' + Date.now(),
        remetente: 'bot',
        texto: respostaBot,
        jevSnapshot: {
          pronto: avaliacaoJev.pronto_para_orcamento,
          faltantes: avaliacaoJev.dados_faltantes
        },
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });

      await dbService.saveConversa(conversa);

      // 7. Envia resposta via Meta WhatsApp Cloud API (se não for simulador web)
      let envioMeta = null;
      if (enviarViaMeta && !modoSimulador) {
        try {
          envioMeta = await metaWhatsappService.sendTextMessage({
            to: conversa.waId || cleanPhone,
            text: respostaBot,
            phoneNumberId: conversa.phoneNumberId
          });
        } catch (errMeta) {
          console.error(`[Chatbot] Falha ao enviar resposta via Meta API para ${cleanPhone}:`, errMeta.message);
        }
      }

      return {
        sucesso: true,
        conversa,
        jev: avaliacaoJev,
        laudoVisual,
        orcamentoGerado,
        respostaBot,
        envioMeta
      };
    } finally {
      this.processingLocks.delete(cleanPhone);
    }
  }

  /**
   * JEV GATEKEEPER (System One — Coleta & Validação de Dados para Orçamento)
   * Garante determinísticamente se todos os dados obrigatórios foram coletados,
   * indica à LLM quais faltam e sinaliza ao sistema quando pode montar o orçamento.
   */
  async avaliarCompletudeComJev({ conversa, textoNovo, laudoVisual }) {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    const apiKey = cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
    const dadosAnteriores = conversa.jevState?.dadosColetados || {};

    const historicoTexto = (conversa.mensagens || [])
      .slice(-14)
      .map((m) => `${m.remetente === 'cliente' ? 'Cliente' : 'Assistente'}: ${m.texto}`)
      .join('\n');

    const laudoStr = laudoVisual ? JSON.stringify(laudoVisual, null, 2) : 'Nenhuma mídia visual nova neste turno.';
    const totalArquivos = (conversa.arquivos || []).length;

    // Fallback heurístico local caso não haja chave OpenRouter configurada
    if (!apiKey) {
      return this.avaliarCompletudeHeuristicaLocal({ dadosAnteriores, textoNovo, totalArquivos, arquivos: conversa.arquivos || [] });
    }

    const promptSistema = `Você é o JEV (System One — Validador de Coleta Técnica) da Nardelli Usinagem.
Sua função NÃO é conversar com o cliente, mas sim AUDITAR e ESTRUTURAR todos os dados já coletados na conversa, verificar os 4 requisitos OBRIGATÓRIOS para orçamento de usinagem e informar à LLM exatamente o que ainda falta perguntar.

OS 4 REQUISITOS OBRIGATÓRIOS PARA LIBERAR O ORÇAMENTO:
1. descricao_ok: Tipo de peça ou serviço claro (ex: fabricação de eixo, recuperação de mancal, bucha, engrenagem, flange, solda, retífica, tratamento térmico, etc.).
2. dimensoes_ou_desenho_ok: Medidas/dimensões principais informadas (ex: diâmetro, comprimento, módulo/dentes, espessura) OU desenho técnico/PDF/foto legível anexada com medidas (ou cliente confirmou que vai trazer a amostra física para medição na oficina).
3. material_ok: Material da peça informado (ex: aço 1045, 4140, inox 304/316, bronze, alumínio, ferro fundido, tecnil, etc.) OU cliente informou explicitamente que fornece o material / peça para recuperação.
4. quantidade_ok: Quantidade de peças/conjuntos informada (número >= 1).

MODELAGEM 3D (DADO COMPLEMENTAR IMPORTANTE):
- Verifique se o cliente já informou se possui o arquivo/modelagem 3D da peça (ex: STEP, IGES, STL, SolidWorks) ou se precisará que a Nardelli faça a modelagem 3D.
- Se informou que JÁ POSSUI ou enviou arquivo 3D -> "possui_modelagem_3d": true, "incluir_modelagem_3d": false.
- Se informou que NÃO POSSUI desenho/modelagem 3D e precisa fazer -> "possui_modelagem_3d": false, "incluir_modelagem_3d": true.
- Se ainda não comentou sobre modelagem 3D -> mantenha "possui_modelagem_3d": null (ou preserve o valor anterior).

REGRAS DE AUDITORIA:
- Preserve e acumule todos os dados já coletados em turnos anteriores; só sobrescreva se o cliente corrigir algo.
- Se um dado obrigatório estiver ambíguo ou ausente, marque o respectivo item do checklist como false e inclua-o em "dados_faltantes".
- Em "perguntas_sugeridas_llm", escreva perguntas curtas, objetivas e amigáveis em português para a LLM coletar os itens faltantes (se faltar mais de um, agrupe de forma leve).
- Marque "pronto_para_orcamento": true SOMENTE se todos os 4 itens de "checklist_obrigatorio" forem true.
- Se o cliente pedir explicitamente para falar com um atendente/vendedor humano, marque "quer_falar_com_humano": true.

RETORNE EXCLUSIVAMENTE UM JSON VÁLIDO NO FORMATO:
{
  "dados_coletados": {
    "descricao_peca_servico": "string ou null",
    "tipo_servico": "FABRICACAO | RECUPERACAO | MANUTENCAO | TRATAMENTO_TERMICO | OUTRO | null",
    "dimensoes_medidas": "string ou null",
    "possui_desenho_ou_foto_tecnica": true | false,
    "possui_modelagem_3d": true | false | null,
    "incluir_modelagem_3d": true | false,
    "material": "string ou null",
    "quantidade": number ou null,
    "unidade": "PÇ | CJ | KG | UN",
    "nome_cliente": "string ou null",
    "empresa": "string ou null",
    "prazo_urgencia": "string ou null",
    "tratamento_termico": "string ou null",
    "tolerancias_observacoes": "string ou null",
    "endereco_frete": "string ou null"
  },
  "checklist_obrigatorio": {
    "descricao_ok": true | false,
    "dimensoes_ou_desenho_ok": true | false,
    "material_ok": true | false,
    "quantidade_ok": true | false
  },
  "dados_faltantes": ["lista dos campos obrigatórios faltantes em português claro"],
  "perguntas_sugeridas_llm": ["perguntas diretas para a LLM fazer ao cliente"],
  "pronto_para_orcamento": true | false,
  "confianca": 0.0,
  "resumo_tecnico_consolidado": "Descrição técnica completa e limpa pronta para o motor de cálculo de orçamento",
  "quer_falar_com_humano": false
}`;

    const promptUsuario = `[DADOS JÁ COLETADOS EM TURNOS ANTERIORES]
${JSON.stringify(dadosAnteriores, null, 2)}

[TOTAL DE ARQUIVOS/FOTOS/DESENHOS ANEXADOS NA CONVERSA]: ${totalArquivos}

[LAUDO VISUAL DAS MÍDIAS DESTE TURNO]
${laudoStr}

[HISTÓRICO RECENTE DA CONVERSA]
${historicoTexto}

[ÚLTIMA MENSAGEM DO CLIENTE]
${textoNovo || '(apenas mídia enviada)'}`;

    try {
      const { parsed } = await aiService.executarChamadaOpenRouterComFallback({
        apiKey,
        modeloPrincipal: cfg.modeloRoteador || 'google/gemini-2.5-flash',
        modeloFallback: cfg.modeloEconomico || 'qwen/qwen3.8-max-prime',
        timeoutMs: 30000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: promptSistema },
          { role: 'user', content: promptUsuario }
        ]
      });

      return this.normalizarResultadoJev(parsed, dadosAnteriores);
    } catch (err) {
      console.error('[JEV Gatekeeper] Erro na chamada OpenRouter, usando heurística local:', err.message);
      return this.avaliarCompletudeHeuristicaLocal({ dadosAnteriores, textoNovo, totalArquivos, arquivos: conversa.arquivos || [] });
    }
  }

  /**
   * Trava determinística em código: garante que pronto_para_orcamento só é true
   * quando TODOS os 4 requisitos obrigatórios do checklist forem verdadeiros.
   */
  normalizarResultadoJev(parsed = {}, dadosAnteriores = {}) {
    const dc = {
      ...dadosAnteriores,
      ...(parsed.dados_coletados || {})
    };

    const chkRaw = parsed.checklist_obrigatorio || {};
    const checklist = {
      descricao_ok: Boolean(chkRaw.descricao_ok && dc.descricao_peca_servico),
      dimensoes_ou_desenho_ok: Boolean(
        chkRaw.dimensoes_ou_desenho_ok && (dc.dimensoes_medidas || dc.possui_desenho_ou_foto_tecnica)
      ),
      material_ok: Boolean(chkRaw.material_ok && dc.material),
      quantidade_ok: Boolean(chkRaw.quantidade_ok && Number(dc.quantidade) >= 1)
    };

    const faltantes = [];
    if (!checklist.descricao_ok) faltantes.push('Descrição da peça ou serviço');
    if (!checklist.dimensoes_ou_desenho_ok) faltantes.push('Dimensões/medidas (ou foto/desenho técnico legível)');
    if (!checklist.material_ok) faltantes.push('Material da peça');
    if (!checklist.quantidade_ok) faltantes.push('Quantidade de peças');

    const pronto =
      checklist.descricao_ok &&
      checklist.dimensoes_ou_desenho_ok &&
      checklist.material_ok &&
      checklist.quantidade_ok;

    return {
      dados_coletados: dc,
      checklist_obrigatorio: checklist,
      dados_faltantes: faltantes,
      perguntas_sugeridas_llm: Array.isArray(parsed.perguntas_sugeridas_llm)
        ? parsed.perguntas_sugeridas_llm
        : faltantes.map((f) => `Poderia informar: ${f}?`),
      pronto_para_orcamento: pronto,
      confianca: Number(parsed.confianca) || (pronto ? 0.9 : 0.6),
      resumo_tecnico_consolidado:
        parsed.resumo_tecnico_consolidado ||
        [
          dc.descricao_peca_servico,
          dc.dimensoes_medidas ? `Medidas: ${dc.dimensoes_medidas}` : '',
          dc.material ? `Material: ${dc.material}` : '',
          dc.quantidade ? `Qtd: ${dc.quantidade} ${dc.unidade || 'PÇ'}` : ''
        ]
          .filter(Boolean)
          .join(' | '),
      quer_falar_com_humano: Boolean(parsed.quer_falar_com_humano)
    };
  }

  /**
   * Fallback heurístico local para o JEV (útil em testes offline sem API key)
   */
  avaliarCompletudeHeuristicaLocal({ dadosAnteriores = {}, textoNovo = '', totalArquivos = 0, arquivos = [] }) {
    const t = String(textoNovo || '').toLowerCase();
    const dc = { ...dadosAnteriores };

    if (!dc.descricao_peca_servico && t.length > 8) {
      if (/eixo|bucha|engrenag|flange|polia|mancal|cilindro|pino|rosca|solda|usinag|recupera|fabric/.test(t)) {
        dc.descricao_peca_servico = textoNovo.trim();
      }
    }
    if (!dc.dimensoes_medidas) {
      const mMedida = textoNovo.match(/(\d+(?:[.,]\d+)?\s*(?:mm|cm|m|pol|"|ø)|ø\s*\d+)/i);
      if (mMedida) dc.dimensoes_medidas = textoNovo.trim();
    }
    if (totalArquivos > 0) {
      dc.possui_desenho_ou_foto_tecnica = true;
    }
    const temArquivo3d = (arquivos || []).some(a => /\.(step|stp|igs|iges|stl|sldprt|dwg|dxf)$/i.test(a.nome || ''));
    if (temArquivo3d || /(?:j[aá]\s+tenho|possuo|segue|tenho\s+o)\s+(?:a\s+)?(?:modelagem|modelo\s*3d|arquivo\s*3d|step|stl|cad)/i.test(t)) {
      dc.possui_modelagem_3d = true;
      dc.incluir_modelagem_3d = false;
    } else if (/(?:n[aã]o\s+tenho|n[aã]o\s+possuo|sem)\s+(?:a\s+)?(?:modelagem|modelo\s*3d|desenho\s*3d|projeto\s*3d)|(?:fazer|incluir|precis[oa]\s+de)\s+(?:a\s+)?modelagem\s*3d/i.test(t)) {
      dc.possui_modelagem_3d = false;
      dc.incluir_modelagem_3d = true;
    }
    if (!dc.material) {
      const mMat = textoNovo.match(/(a[cç]o\s*\d+|inox\s*\d*l?|bronze(?:\s*tm-?\d+)?|alum[ií]nio|ferro\s*fundido|lat[aã]o|tecnil|nylon|cobre|sae\s*\d+|1045|4140|4340|8620|304|316)/i);
      if (mMat) dc.material = mMat[0];
    }
    if (!dc.quantidade) {
      const mQtd = textoNovo.match(/(\d+)\s*(?:pe[cç]as?|p[cç]s?|unidades?|un\b|conjuntos?|cj\b|eixos?|buchas?|engrenagens?|flanges?|polias?)/i);
      if (mQtd) dc.quantidade = parseInt(mQtd[1], 10);
    }

    const checklist = {
      descricao_ok: Boolean(dc.descricao_peca_servico),
      dimensoes_ou_desenho_ok: Boolean(dc.dimensoes_medidas || dc.possui_desenho_ou_foto_tecnica),
      material_ok: Boolean(dc.material),
      quantidade_ok: Boolean(Number(dc.quantidade) >= 1)
    };

    return this.normalizarResultadoJev(
      {
        dados_coletados: dc,
        checklist_obrigatorio: checklist,
        pronto_para_orcamento:
          checklist.descricao_ok &&
          checklist.dimensoes_ou_desenho_ok &&
          checklist.material_ok &&
          checklist.quantidade_ok,
        quer_falar_com_humano: /falar com (?:atendente|humano|vendedor|pessoa)/i.test(t)
      },
      dadosAnteriores
    );
  }

  /**
   * Gera resposta conversacional natural para o WhatsApp guiada estritamente pelo JEV
   * Com contingência automática: Modelo Principal -> Modelo Reserva -> Fallback Humano
   */
  async gerarRespostaConversacional({ conversa, avaliacaoJev, laudoVisual, textoNovo }) {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    const apiKey = cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';

    if (!apiKey) {
      const faltantes = avaliacaoJev.dados_faltantes || [];
      if (faltantes.length > 0) {
        return {
          falhaTotal: false,
          texto: `Olá! Recebi sua mensagem aqui na Nardelli Usinagem. Para montarmos seu orçamento certinho, poderia me informar: ${faltantes.join(', ')}?`
        };
      }
      return {
        falhaTotal: false,
        texto: 'Recebi sua mensagem! Nossa equipe técnica já está analisando seu pedido.'
      };
    }

    const historico = (conversa.mensagens || [])
      .slice(-10)
      .map((m) => ({
        role: m.remetente === 'cliente' ? 'user' : 'assistant',
        content: m.texto
      }));

    const systemPrompt = `Você é o assistente técnico-comercial de WhatsApp da *Nardelli Usinagem & Caldeiraria* (Aracaju/SE).
Seu objetivo é atender clientes com simpatia, agilidade e clareza para coletar os dados necessários para montagem de orçamento de usinagem, caldeiraria, solda, retífica e tratamento térmico.

[ESTADO ATUAL AUDITADO PELO JEV]
- Dados já coletados: ${JSON.stringify(avaliacaoJev.dados_coletados)}
- Dados OBRIGATÓRIOS que ainda faltam: ${JSON.stringify(avaliacaoJev.dados_faltantes)}
- Sugestão de perguntas do JEV: ${JSON.stringify(avaliacaoJev.perguntas_sugeridas_llm)}
- Orçamento já gerado nesta conversa?: ${conversa.orcamentoNumero ? `Sim (#${conversa.orcamentoNumero})` : 'Não'}
${laudoVisual ? `- Laudo visual das fotos/desenhos recebidos agora: ${laudoVisual.resumo_visual}` : ''}

[REGRAS MANDATÓRIAS]
1. NUNCA passe preços, valores ou prazos fechados no chat — informe sempre que o orçamento final passa pela validação da nossa equipe técnica.
2. NUNCA repita perguntas sobre dados que já estão preenchidos em "Dados já coletados".
3. Peça EXCLUSIVAMENTE os itens listados em "Dados OBRIGATÓRIOS que ainda faltam", de forma natural, curta e direta (estilo WhatsApp — máximo 3 a 4 linhas). Se ainda estiver coletando dimensões/desenho e "possui_modelagem_3d" estiver null, aproveite para perguntar brevemente se já possui modelagem 3D ou se precisará incluir no orçamento.
4. Se o cliente enviou foto, vídeo, áudio ou PDF, confirme brevemente o que você entendeu dele antes de pedir os dados faltantes.
5. Se o orçamento já foi gerado (#${conversa.orcamentoNumero || ''}), agradeça o complemento e informe que já foi anexado à conversa para a equipe técnica.
6. Retorne APENAS o texto da mensagem de WhatsApp (sem JSON, sem markdown excessivo).`;

    const chamarModeloTexto = async (modelo) => {
      const idModelo = aiService.normalizarIdModelo(modelo);
      const body = {
        model: idModelo,
        messages: [{ role: 'system', content: systemPrompt }, ...historico],
        temperature: 0.3
      };
      if (idModelo.toLowerCase().includes('qwen')) {
        body.reasoning = { effort: 'minimal' };
      }

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://nardelliusinagem.com.br',
          'X-Title': 'Nardelli Usinagem Chatbot'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const text = (data.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new Error('Resposta vazia da LLM');
      return text;
    };

    try {
      const texto = await chamarModeloTexto(cfg.modeloRoteador || 'google/gemini-2.5-flash');
      return { falhaTotal: false, texto };
    } catch (err1) {
      console.warn('[Chatbot LLM] Modelo principal falhou, acionando reserva:', err1.message);
      try {
        const texto = await chamarModeloTexto(cfg.modeloEconomico || 'qwen/qwen3.8-max-prime');
        return { falhaTotal: false, texto };
      } catch (err2) {
        console.error('[Chatbot LLM] Modelo reserva também falhou:', err2.message);
        return { falhaTotal: true, texto: '' };
      }
    }
  }

  /**
   * Monta automaticamente o pré-orçamento no sistema assim que o JEV confirma que todos os dados foram coletados
   */
  async gerarOrcamentoAutomatico({ conversa, avaliacaoJev }) {
    const dc = avaliacaoJev.dados_coletados || {};
    const cfg = dbService.getConfig();
    const qtdFinal = Math.max(1, Number(dc.quantidade) || 1);
    const unidFinal = (dc.unidade || 'PÇ').toUpperCase();

    const observacoesPartes = [
      `Gerado automaticamente pelo Chatbot WhatsApp (JEV) — Conversa ${conversa.id}`,
      dc.material ? `Material: ${dc.material}` : '',
      dc.dimensoes_medidas ? `Medidas: ${dc.dimensoes_medidas}` : '',
      dc.tratamento_termico ? `Tratamento Térmico: ${dc.tratamento_termico}` : '',
      dc.prazo_urgencia ? `Prazo desejado: ${dc.prazo_urgencia}` : '',
      dc.tolerancias_observacoes ? `Tolerâncias/Obs: ${dc.tolerancias_observacoes}` : ''
    ].filter(Boolean);

    const descricaoFinal =
      avaliacaoJev.resumo_tecnico_consolidado ||
      conversa.descricaoServico ||
      dc.descricao_peca_servico ||
      'Serviço de usinagem via WhatsApp';

    const novoOrcamento = {
      id: 'orc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      origem: 'whatsapp',
      canalOrigem: conversa.canalOrigem === 'simulador_web' ? 'simulador_jev' : 'whatsapp_meta_jev',
      status: 'PENDENTE_REVISAO',
      visualizado: false,
      dataCriacao: new Date().toISOString(),
      cliente: {
        nome: dc.empresa
          ? `${dc.empresa}${dc.nome_cliente ? ` (${dc.nome_cliente})` : ''}`
          : dc.nome_cliente || conversa.cliente?.nome || 'Cliente WhatsApp',
        tel: conversa.cliente?.telefone || '',
        email: '',
        endereco: dc.endereco_frete || '',
        contato: dc.nome_cliente || conversa.cliente?.nome || ''
      },
      descricaoServico: descricaoFinal,
      quantidadePecas: qtdFinal,
      unidadePeca: unidFinal,
      materialPeca: dc.material || '',
      prazoDesejado: dc.prazo_urgencia || '',
      tratamentoTermico: dc.tratamento_termico || 'Nenhum',
      possuiModelagem3D: dc.possui_modelagem_3d === true,
      incluirModelagem3D: dc.incluir_modelagem_3d === true,
      observacoes: observacoesPartes.join(' | '),
      arquivos: (conversa.arquivos || []).map((a, idx) => ({
        id: a.id || `arq_${idx}`,
        nome: a.nome || `anexo_${idx + 1}`,
        tipo: a.tipo || 'image/jpeg',
        url: a.url || ''
      })),
      itensInsumo: [],
      itensMaquina: [],
      moEscritorio: 40.0,
      frete: { distKm: 0, viagens: 1, pecas: qtdFinal, valorTotal: 0 },
      parcelamento: { prazoMeses: 0 },
      analiseIA: null,
      totais: {}
    };

    // Aciona o motor de engenharia (JEV System One + Claude / Qwen) para pré-calcular insumos e horas
    try {
      const resultadoIA = await aiService.gerarPreviaOrcamento({
        descricao: descricaoFinal,
        observacoes: novoOrcamento.observacoes,
        arquivos: novoOrcamento.arquivos,
        quantidade: qtdFinal,
        material: dc.material || '',
        prazo: dc.prazo_urgencia || '',
        tratamentoTermico: dc.tratamento_termico || 'Nenhum',
        possuiModelagem3D: dc.possui_modelagem_3d === true,
        incluirModelagem3D: dc.incluir_modelagem_3d === true
      });

      if (resultadoIA && resultadoIA.sucesso) {
        const resDados = resultadoIA.resultado;
        novoOrcamento.itensInsumo = resDados.insumos || [];
        novoOrcamento.itensMaquina = resDados.operacoes || [];
        novoOrcamento.moEscritorio = resDados.moEscritorio || 40.0;
        novoOrcamento.ehConjuntoMultiPecas = !!resDados.ehConjuntoMultiPecas;
        novoOrcamento.pecas = resDados.pecas || [];
        novoOrcamento.analiseIA = {
          complexidade: resultadoIA.triagemJev?.complexidade || 'MEDIA',
          setor: resultadoIA.triagemJev?.setor_principal || 'GERAL',
          modelo: resultadoIA.modelo,
          observacaoTecnica: resDados.observacoesTecnicas,
          ehConjuntoMultiPecas: !!resDados.ehConjuntoMultiPecas,
          pecas: resDados.pecas || [],
          dataAnalise: new Date().toISOString()
        };
        novoOrcamento.referenciaHistorica = resultadoIA.referenciaHistorica || null;
        novoOrcamento.totais = this.calcularTotaisOrcamento(novoOrcamento, cfg);
        novoOrcamento.versaoOriginalIA = {
          itensInsumo: JSON.parse(JSON.stringify(novoOrcamento.itensInsumo || [])),
          itensMaquina: JSON.parse(JSON.stringify(novoOrcamento.itensMaquina || [])),
          moEscritorio: novoOrcamento.moEscritorio,
          ehConjuntoMultiPecas: !!resDados.ehConjuntoMultiPecas,
          pecas: resDados.pecas || [],
          totais: JSON.parse(JSON.stringify(novoOrcamento.totais || {})),
          geradoEm: new Date().toISOString()
        };
      }
    } catch (errIA) {
      console.warn('[Chatbot] Aviso ao pré-calcular orçamento com IA:', errIA.message);
    }

    return await dbService.saveOrcamento(novoOrcamento);
  }

  /**
   * Mensagem de confirmação enviada ao cliente após o JEV liberar e montar o pré-orçamento
   */
  async gerarRespostaConfirmacaoOrcamento({ conversa, avaliacaoJev, orcamento }) {
    const dc = avaliacaoJev.dados_coletados || {};
    const nome = dc.nome_cliente || conversa.cliente?.nome || '';
    const saudacao = nome && nome !== 'Cliente WhatsApp' ? `Perfeito, ${nome}!` : 'Perfeito!';

    const resumoLinhas = [
      dc.descricao_peca_servico ? `• *Serviço/Peça:* ${dc.descricao_peca_servico}` : '',
      dc.dimensoes_medidas ? `• *Medidas:* ${dc.dimensoes_medidas}` : (dc.possui_desenho_ou_foto_tecnica ? '• *Medidas:* Conforme desenho/foto anexada' : ''),
      dc.material ? `• *Material:* ${dc.material}` : '',
      dc.quantidade ? `• *Quantidade:* ${dc.quantidade} ${dc.unidade || 'PÇ'}` : ''
    ].filter(Boolean).join('\n');

    return `${saudacao} Já coletei todas as informações necessárias e gerei seu pré-orçamento *#${orcamento.numero}* aqui na Nardelli Usinagem:\n\n${resumoLinhas}\n\nNossa equipe técnica já recebeu o pedido para validação final e em breve retornaremos por aqui com os valores e prazo de entrega!`;
  }

  /**
   * Cálculo comercial Nardelli (mesmas fórmulas de BDI de routes/inbound.js)
   */
  calcularTotaisOrcamento(orc, cfg) {
    const num = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    };

    let totalInsumos = 0;
    (orc.itensInsumo || []).forEach((i) => {
      totalInsumos += num(i.qtd) * num(i.preco);
    });

    let totalMaquina = 0;
    (orc.itensMaquina || []).forEach((m) => {
      const mult = m.regime === 'h50' ? 1.5 : m.regime === 'h100' ? 2.0 : 1.0;
      totalMaquina += num(m.horas) * num(m.valorHora) * mult;
    });

    const moEscritorio = num(orc.moEscritorio);
    const totalMO = totalMaquina + moEscritorio;

    const mp = (orc.margensPersonalizadas && orc.margensPersonalizadas.ativa) ? orc.margensPersonalizadas : {};
    const despFixasInsumo = mp.despFixasInsumo !== undefined ? num(mp.despFixasInsumo) : num(cfg.despFixasInsumo);
    const impostoInsumo = mp.impostoInsumo !== undefined ? num(mp.impostoInsumo) : num(cfg.impostoInsumo);
    const lucroInsumo = mp.lucroInsumo !== undefined ? num(mp.lucroInsumo) : num(cfg.lucroInsumo);
    const mcInsumo = despFixasInsumo + impostoInsumo + lucroInsumo;
    const taxaInsumo = 1 - mcInsumo;
    const valorInsumoComMargem = taxaInsumo > 0 ? totalInsumos / taxaInsumo : totalInsumos;

    const despFixasMO = mp.despFixasMO !== undefined ? num(mp.despFixasMO) : num(cfg.despFixasMO);
    const impostoMO = mp.impostoMO !== undefined ? num(mp.impostoMO) : num(cfg.impostoMO);
    const lucroMO = mp.lucroMO !== undefined ? num(mp.lucroMO) : num(cfg.lucroMO);
    const mcMO = despFixasMO + impostoMO + lucroMO;
    const taxaMO = 1 - mcMO;
    const valorMOComMargem = taxaMO > 0 ? totalMO / taxaMO : totalMO;

    const distKm = num(orc.frete?.distKm);
    const viagens = num(orc.frete?.viagens) || 1;
    const pecas = Math.max(num(orc.frete?.pecas) || 1, 1);
    const freteTotal = (distKm * num(cfg.custoKm) * 2 * viagens) / pecas;

    const semDesconto = valorInsumoComMargem + valorMOComMargem + freteTotal;
    const margemDesc = mp.margemDesconto !== undefined ? num(mp.margemDesconto) : num(cfg.margemDesconto);
    const comDesconto = semDesconto * (1 + margemDesc);

    const prazoMeses = num(orc.parcelamento?.prazoMeses);
    const jurosMensal = mp.jurosMensal !== undefined ? num(mp.jurosMensal) : num(cfg.jurosMensal);
    const precoAPrazo = comDesconto * (1 + prazoMeses * jurosMensal);
    const totalFinal = prazoMeses > 0 ? precoAPrazo : comDesconto;

    const qtdPecas = Math.max(1, num(orc.quantidadePecas) || 1);
    return {
      totalInsumos: Number(totalInsumos.toFixed(2)),
      valorInsumoComMargem: Number(valorInsumoComMargem.toFixed(2)),
      totalMO: Number(totalMO.toFixed(2)),
      valorMOComMargem: Number(valorMOComMargem.toFixed(2)),
      freteTotal: Number(freteTotal.toFixed(2)),
      semDesconto: Number(semDesconto.toFixed(2)),
      comDesconto: Number(comDesconto.toFixed(2)),
      precoAPrazo: Number(precoAPrazo.toFixed(2)),
      totalFinal: Number(totalFinal.toFixed(2)),
      quantidadePecas: qtdPecas,
      unidadePeca: (orc.unidadePeca || 'PÇ').toUpperCase(),
      valorUnitarioPeca: Number((totalFinal / qtdPecas).toFixed(2))
    };
  }
}

module.exports = new ChatbotService();
