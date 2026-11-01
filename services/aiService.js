const dbService = require('./dbService');

/**
 * Serviço de Integração com Modelos de IA via OpenRouter
 * - JEV System One (TypeSafe AI) para triagem, classificação de complexidade e roteamento enxuto de tokens
 * - Claude 3.5 Sonnet (Anthropic) para raciocínio profundo de engenharia e cálculo de orçamentos
 */
class AIService {
  constructor() {
    this.openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  /**
   * Extração segura e robusta de JSON, imune a preâmbulos ou explicações de modelos como Claude
   */
  extrairJSON(rawText) {
    if (!rawText) throw new Error('A resposta da IA veio vazia');
    try {
      return JSON.parse(rawText.trim());
    } catch (e) {}

    const matchBloco = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (matchBloco) {
      try {
        return JSON.parse(matchBloco[1].trim());
      } catch (e) {}
    }

    const primeiro = rawText.indexOf('{');
    const ultimo = rawText.lastIndexOf('}');
    if (primeiro !== -1 && ultimo > primeiro) {
      try {
        return JSON.parse(rawText.slice(primeiro, ultimo + 1));
      } catch (e) {}
    }

    throw new Error('A resposta da IA não contém um formato JSON válido: ' + rawText.slice(0, 150));
  }

  /**
   * Mapeia aliases e nomes comerciais para os IDs oficiais da OpenRouter
   */
  normalizarIdModelo(modelo) {
    if (!modelo || typeof modelo !== 'string') return 'anthropic/claude-sonnet-5.5';
    const m = modelo.trim().toLowerCase();
    if (m.includes('qwen') && (m.includes('3.8') || m.includes('pro') || m.includes('max'))) {
      if (m.includes('flash')) return 'qwen/qwen3.8-flash';
      return 'qwen/qwen3.8-max-prime';
    }
    if (m === 'claude 5.5' || m.includes('claude-sonnet-5.5') || m.includes('sonnet 5.5') || m.includes('claude 3.5')) {
      return 'anthropic/claude-sonnet-5.5';
    }
    if (m.includes('gemini-2.5-flash') || m.includes('gemini 2.5')) {
      return 'google/gemini-2.5-flash';
    }
    if (m.includes('gemini-3.8-flash') || m.includes('gemini 3.8')) {
      return 'google/gemini-3.8-flash';
    }
    return modelo.trim();
  }

  /**
   * Executa chamada com contingência automática (fallback) caso o provedor principal falhe
   */
  async executarChamadaOpenRouterComFallback({
    apiKey,
    modeloPrincipal,
    modeloFallback = 'qwen/qwen3.8-max-prime',
    messages,
    timeoutMs = 60000,
    temperature = 0.2
  }) {
    const chamar = async (modeloAlvo, msgsAlvo) => {
      const idModelo = this.normalizarIdModelo(modeloAlvo);
      const reqBody = {
        model: idModelo,
        messages: msgsAlvo || messages,
        response_format: { type: 'json_object' },
        temperature
      };

      // Se for Qwen, utiliza minimal reasoning para respostas rápidas sem estourar timeout
      if (idModelo.toLowerCase().includes('qwen')) {
        reqBody.reasoning = { effort: 'minimal' };
      }

      const resp = await fetch(this.openRouterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://nardelliusinagem.com.br',
          'X-Title': 'Nardelli Usinagem Orçamentos'
        },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        let detalhe = errData.error?.message || `Erro HTTP ${resp.status} do provedor`;
        if (errData.error?.metadata?.raw) {
          try {
            const rawClean = String(errData.error.metadata.raw).replace(/^data:\s*/, '').trim();
            const rawParsed = JSON.parse(rawClean);
            if (rawParsed.message) detalhe += `: ${rawParsed.message}`;
            else if (rawParsed.error?.message) detalhe += `: ${rawParsed.error.message}`;
          } catch (_) {
            detalhe += `: ${errData.error.metadata.raw}`;
          }
        }
        console.error(`[AI Service] ❌ Resposta de erro da OpenRouter (${idModelo}):`, detalhe);
        throw new Error(detalhe);
      }

      const data = await resp.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      const parsed = this.extrairJSON(rawText);
      return { parsed, usage: data.usage || null, modeloUsado: idModelo };
    };

    // 1. Execução no modelo principal
    try {
      const res = await chamar(modeloPrincipal);
      return {
        ...res,
        usouFallback: false
      };
    } catch (errPrincipal) {
      console.warn(`[AI Service] ⚠️ Modelo principal (${modeloPrincipal}) falhou: ${errPrincipal.message}`);

      const idFallback = this.normalizarIdModelo(modeloFallback);
      const idPrincipalNorm = this.normalizarIdModelo(modeloPrincipal);

      // 2. Acionamento automático do modelo de contingência (Qwen 3.8 Pro)
      if (idFallback && idFallback !== idPrincipalNorm) {
        console.log(`[AI Service] 🔄 Ativando modelo de contingência/fallback: ${idFallback}...`);
        try {
          const resFallback = await chamar(idFallback);
          return {
            ...resFallback,
            usouFallback: true,
            motivoFallback: errPrincipal.message
          };
        } catch (errFallback) {
          console.error(`[AI Service] ❌ Modelo de fallback (${idFallback}) com anexos também falhou: ${errFallback.message}`);

          // 3. Se falhou e continha anexos multimídia (imagem/documento) que possam ter sido rejeitados
          // pela infraestrutura do provedor, tenta recuperação em modo texto técnico para não deixar o usuário sem resposta
          const temAnexos = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url' || c.type === 'document'));
          if (temAnexos) {
            console.log(`[AI Service] 🔄 Tentando recuperação de contingência em modo texto para ${idFallback}...`);
            try {
              const msgsTextoPuro = messages.map(m => {
                if (Array.isArray(m.content)) {
                  const textos = m.content.map(c => {
                    if (c.type === 'text') return c.text;
                    if (c.type === 'image_url') return '[Desenho técnico anexado pelo cliente]';
                    if (c.type === 'document') return '[Documento PDF do projeto anexado pelo cliente]';
                    return '';
                  }).filter(Boolean).join('\n\n');
                  return { role: m.role, content: textos };
                }
                return m;
              });

              const resRecuperacao = await chamar(idFallback, msgsTextoPuro);
              return {
                ...resRecuperacao,
                usouFallback: true,
                motivoFallback: `${errPrincipal.message} (anexos processados em modo texto técnico)`
              };
            } catch (errTexto) {
              console.error(`[AI Service] ❌ Recuperação texto também falhou: ${errTexto.message}`);
            }
          }

          throw new Error(`Falha no modelo principal (${modeloPrincipal}: ${errPrincipal.message}) e no modelo de contingência (${idFallback}: ${errFallback.message})`);
        }
      }

      throw new Error(`Falha na análise com a IA (${modeloPrincipal}): ${errPrincipal.message}`);
    }
  }

  /**
   * Valida, detecta magic-bytes e formata anexos para os padrões estritos da OpenRouter
   */
  prepararAnexosParaOpenRouter(arquivos) {
    if (!arquivos || !Array.isArray(arquivos) || arquivos.length === 0) return [];
    const itens = [];

    for (const arq of arquivos) {
      if (!arq) continue;

      let base64 = arq.base64 || '';
      let mimeInformado = (arq.mediaType || arq.tipo || '').toLowerCase();
      const nome = (arq.nome || '').toLowerCase();

      // Se for caminho de arquivo local ou relativo e não tiver base64, tenta ler do disco
      if (!base64 && arq.url && (arq.url.startsWith('/') || arq.url.includes('localhost') || arq.url.startsWith('file://'))) {
        try {
          const fs = require('fs');
          const path = require('path');
          let cleanPath = arq.url.replace(/^file:\/\//, '').replace(/^https?:\/\/[^/]+/, '');
          let localPath = path.resolve(__dirname, '..', cleanPath.replace(/^\//, ''));
          if (fs.existsSync(localPath)) {
            base64 = fs.readFileSync(localPath).toString('base64');
          }
        } catch (e) {
          console.warn('[AI Service] Não foi possível ler anexo local:', arq.url, e.message);
        }
      }

      if (base64) {
        // Detecta o MIME TYPE REAL inspecionando os Magic Bytes binários
        const head = base64.slice(0, 40).trim();
        let mimeReal = null;

        if (head.startsWith('JVBERi')) {
          mimeReal = 'application/pdf';
        } else if (head.startsWith('iVBORw0KGgo')) {
          mimeReal = 'image/png';
        } else if (head.startsWith('/9j/')) {
          mimeReal = 'image/jpeg';
        } else if (head.startsWith('R0lGOD')) {
          mimeReal = 'image/gif';
        } else if (head.startsWith('UklGR')) {
          mimeReal = 'image/webp';
        }

        if (mimeReal === 'application/pdf' || mimeInformado.includes('pdf') || nome.endsWith('.pdf')) {
          itens.push({
            type: 'document',
            document: {
              url: `data:application/pdf;base64,${base64}`
            }
          });
        } else if (mimeReal && mimeReal.startsWith('image/')) {
          itens.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeReal};base64,${base64}`
            }
          });
        } else if (mimeInformado.startsWith('image/')) {
          itens.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeInformado.includes('png') ? 'image/png' : 'image/jpeg'};base64,${base64}`
            }
          });
        } else {
          itens.push({
            type: 'text',
            text: `[Arquivo técnico anexado: "${arq.nome || 'desenho técnico'}" (${mimeInformado || 'formato de desenho mecânico'})]`
          });
        }
      } else if (arq.url && !arq.url.includes('localhost')) {
        if (nome.endsWith('.pdf') || mimeInformado.includes('pdf')) {
          itens.push({
            type: 'document',
            document: { url: arq.url }
          });
        } else {
          itens.push({
            type: 'image_url',
            image_url: { url: arq.url }
          });
        }
      } else if (arq.nome) {
        itens.push({
          type: 'text',
          text: `[Arquivo técnico anexado: "${arq.nome}"]`
        });
      }
    }

    return itens;
  }

  /**
   * Poda Inteligente do Catálogo (Token Pruning)
   * Reduz drasticamente o consumo de tokens de entrada ao enviar apenas máquinas
   * e insumos relevantes ao tipo de serviço identificado.
   */
  filtrarCatalogoRelevante(setor, insumos, maquinas) {
    let maquinasFiltradas = [];
    let insumosFiltrados = [];

    const norm = (s) => (s || '').toLowerCase();

    switch (setor) {
      case 'CALDEIRARIA_SOLDA':
        maquinasFiltradas = maquinas.filter(m =>
          norm(m.categoria).includes('solda') ||
          norm(m.categoria).includes('corte') ||
          norm(m.categoria).includes('conformação') ||
          norm(m.categoria).includes('manutenção') ||
          norm(m.categoria).includes('superficial') ||
          norm(m.nome).includes('solda') ||
          norm(m.nome).includes('plasma') ||
          norm(m.nome).includes('maçarico') ||
          norm(m.nome).includes('guilhotina') ||
          norm(m.nome).includes('prensa') ||
          norm(m.nome).includes('serra')
        );
        insumosFiltrados = insumos.filter(i =>
          norm(i.nome).includes('eletrodo') ||
          norm(i.nome).includes('disco') ||
          norm(i.nome).includes('gás') ||
          norm(i.nome).includes('tinta') ||
          norm(i.nome).includes('thinner') ||
          norm(i.nome).includes('chapa') ||
          norm(i.nome).includes('estopa') ||
          norm(i.nome).includes('aço')
        );
        break;

      case 'USINAGEM_CONVENCIONAL':
        maquinasFiltradas = maquinas.filter(m =>
          norm(m.categoria).includes('torneamento') ||
          norm(m.categoria).includes('fresamento') ||
          norm(m.categoria).includes('furação') ||
          norm(m.categoria).includes('retífica') ||
          norm(m.categoria).includes('corte') ||
          norm(m.categoria).includes('manutenção') ||
          norm(m.nome).includes('torno') ||
          norm(m.nome).includes('fresadora') ||
          norm(m.nome).includes('plaina') ||
          norm(m.nome).includes('mandrilhadora') ||
          norm(m.nome).includes('furadeira') ||
          norm(m.nome).includes('retífica') ||
          norm(m.nome).includes('serra')
        );
        insumosFiltrados = insumos.filter(i =>
          norm(i.nome).includes('aço') ||
          norm(i.nome).includes('inserto') ||
          norm(i.nome).includes('broca') ||
          norm(i.nome).includes('fresa') ||
          norm(i.nome).includes('rebolo') ||
          norm(i.nome).includes('óleo') ||
          norm(i.nome).includes('chaveta') ||
          norm(i.nome).includes('lixa')
        );
        break;

      case 'USINAGEM_CNC':
        maquinasFiltradas = maquinas.filter(m =>
          norm(m.categoria).includes('cnc') ||
          norm(m.categoria).includes('centros') ||
          norm(m.categoria).includes('retífica') ||
          norm(m.nome).includes('cnc') ||
          norm(m.nome).includes('centro de usinagem') ||
          norm(m.nome).includes('eletroerosão') ||
          norm(m.nome).includes('retífica') ||
          norm(m.nome).includes('serra')
        );
        insumosFiltrados = insumos.filter(i =>
          norm(i.nome).includes('inserto') ||
          norm(i.nome).includes('fresa') ||
          norm(i.nome).includes('broca') ||
          norm(i.nome).includes('aço') ||
          norm(i.nome).includes('grafite') ||
          norm(i.nome).includes('bastão')
        );
        break;

      case 'TRATAMENTO_TERMICO_RECUPERACAO':
        maquinasFiltradas = maquinas.filter(m =>
          norm(m.categoria).includes('térmico') ||
          norm(m.categoria).includes('superficial') ||
          norm(m.categoria).includes('solda') ||
          norm(m.categoria).includes('retífica') ||
          norm(m.categoria).includes('torneamento') ||
          norm(m.nome).includes('forno') ||
          norm(m.nome).includes('têmpera') ||
          norm(m.nome).includes('jateamento') ||
          norm(m.nome).includes('solda') ||
          norm(m.nome).includes('retífica') ||
          norm(m.nome).includes('torno')
        );
        insumosFiltrados = insumos.filter(i =>
          norm(i.nome).includes('têmpera') ||
          norm(i.nome).includes('cementação') ||
          norm(i.nome).includes('óleo') ||
          norm(i.nome).includes('eletrodo') ||
          norm(i.nome).includes('disco') ||
          norm(i.nome).includes('rebolo')
        );
        break;

      default:
        // Caso geral
        maquinasFiltradas = maquinas;
        insumosFiltrados = insumos;
        break;
    }

    if (maquinasFiltradas.length < 5) maquinasFiltradas = maquinas.slice(0, 15);
    if (insumosFiltrados.length < 8) insumosFiltrados = insumos.slice(0, 20);

    return { maquinasFiltradas, insumosFiltrados };
  }

  /**
   * Identifica e decompõe orçamentos que possuem mais de uma peça fabricada junta (conjunto)
   */
  detectarMultiplasPecas(descricao = '', categoria = '', observacoes = '') {
    const textoOriginal = `${descricao || ''} ${observacoes || ''} ${categoria || ''}`.toLowerCase();

    // Higieniza expressões geométricas de usinagem (recursos da peça) para não confundir com peças fabricadas avulsas
    const texto = textoOriginal
      .replace(/\brasgo(s)?\s+(de\s+)?chaveta(s)?\b/g, 'recurso_rasgo_chaveta')
      .replace(/\bcanal(is)?\s+(de\s+)?chaveta(s)?\b/g, 'recurso_canal_chaveta')
      .replace(/\balojamento(s)?\s+(de\s+)?chaveta(s)?\b/g, 'recurso_alojamento_chaveta')
      .replace(/\bsede(s)?\s+(de\s+)?rolamento(s)?\b/g, 'recurso_sede_rolamento')
      .replace(/\balojamento(s)?\s+(de\s+)?rolamento(s)?\b/g, 'recurso_alojamento_rolamento')
      .replace(/\bfuro(s)?\s+(de\s+)?fixação\b/g, 'recurso_furo_fixacao')
      .replace(/\brebaixo(s)?\s+para\s+ret[ií]fica\b/g, 'recurso_rebaixo_retifica');

    // Palavras-chave fortes de conjunto mecânico ou montagem
    const temPalavraConjunto = /\b(conjunto|subconjunto|montagem|acoplamento|bipartid[oa])\b/i.test(texto);

    // Tipos comuns de peças industriais primárias
    const tiposPecas = [
      'eixo', 'bucha', 'mancal', 'flange', 'tampa', 'polia', 'engrenagem',
      'corpo', 'êmbolo', 'embolo', 'haste', 'carcaça', 'carcaca',
      'sapata', 'disco', 'anel', 'tambor', 'rolete', 'luva', 'fuso'
    ];

    const pecasEncontradas = [];
    for (const tipo of tiposPecas) {
      const regex = new RegExp(`\\b(${tipo}s?)\\b`, 'i');
      if (regex.test(texto)) {
        pecasEncontradas.push(tipo);
      }
    }

    // Padrões conectores entre peças diferentes
    const temConexaoMultipla = /\b(e|\+|\/|com|junto\s+com|além\s+de)\b/i.test(texto) && pecasEncontradas.length >= 2;
    const temNumeracaoSeparada = /(\d+)\s*(eixo|bucha|flange|tampa|pino|polia|haste).+(\d+)\s*(eixo|bucha|flange|tampa|pino|polia|haste)/i.test(texto);
    const temItensMarcados = /(item\s*1|peça\s*1|1\)|1º).+(item\s*2|peça\s*2|2\)|2º)/i.test(texto);

    const ehMulti = temPalavraConjunto || temConexaoMultipla || temNumeracaoSeparada || temItensMarcados || pecasEncontradas.length >= 3;

    if (!ehMulti) {
      return {
        ehConjuntoMultiPecas: false,
        pecasIdentificadas: []
      };
    }

    // Estrutura peças identificadas com roteiro inicial
    const pecas = [];

    // Caso 1: Eixo e Bucha / Mancal (combinação muito frequente na indústria mecânica)
    if (texto.includes('eixo') && (texto.includes('bucha') || texto.includes('mancal'))) {
      const matchQtdEixo = texto.match(/(\d+)\s*eixo/i);
      const matchQtdBucha = texto.match(/(\d+)\s*bucha/i);
      const qtdEixo = matchQtdEixo ? parseInt(matchQtdEixo[1]) : 1;
      const qtdBucha = matchQtdBucha ? parseInt(matchQtdBucha[1]) : 2;

      pecas.push({
        id: 'peca_1',
        nome: 'Eixo Usinado de Precisão',
        tipo: 'eixo',
        quantidade: qtdEixo,
        materialSugerido: texto.includes('4140') ? 'Aço Liga SAE 4140 Beneficiado' : (texto.includes('inox') ? 'Aço Inox AISI 304' : 'Aço SAE 1045'),
        etapasProducao: [
          '1. Serra Fita (Corte de tarugo bruto)',
          '2. Torno Mecânico (Desbaste e usinagem cilíndrica dos colos)',
          '3. Fresadora Ferramenteira (Rasgos de chaveta)',
          '4. Retífica Cilíndrica (Acabamento centesimal h6)'
        ]
      });

      pecas.push({
        id: 'peca_2',
        nome: 'Buchas de Deslizamento / Mancal',
        tipo: 'bucha',
        quantidade: qtdBucha,
        materialSugerido: texto.includes('bronze') ? 'Bronze TM-23 (SAE 660)' : 'Nylon / Poliacetal Industrial',
        etapasProducao: [
          '1. Serra Fita (Corte do tarugo de bronze)',
          '2. Torno Mecânico (Torneamento externo, furação e mandrilhamento interno)'
        ]
      });
    } else if (texto.includes('flange') && (texto.includes('tampa') || texto.includes('corpo'))) {
      pecas.push({
        id: 'peca_1',
        nome: 'Flange de Acoplamento',
        tipo: 'flange',
        quantidade: 1,
        materialSugerido: 'Aço Carbono SAE 1045',
        etapasProducao: [
          '1. Serra Fita (Corte de tarugo bruto)',
          '2. Torno Mecânico (Faceamento e torneamento dos diâmetros)',
          '3. Furadeira Radial (Furação de fixação em círculo PCD)'
        ]
      });

      pecas.push({
        id: 'peca_2',
        nome: 'Tampa / Fechamento',
        tipo: 'tampa',
        quantidade: 1,
        materialSugerido: 'Aço Carbono SAE 1020',
        etapasProducao: [
          '1. Serra Fita / Oxicorte (Corte do disco bruto)',
          '2. Torno Mecânico (Usinagem do rebaixo e canal de vedação)',
          '3. Furadeira Radial (Furação coordenada de fechamento)'
        ]
      });
    } else {
      // Caso genérico quando há 2 ou mais componentes detectados
      const pecasDistintas = [...new Set(pecasEncontradas)].slice(0, 3);
      pecasDistintas.forEach((p, idx) => {
        const nomeCapital = p.charAt(0).toUpperCase() + p.slice(1);
        pecas.push({
          id: `peca_${idx + 1}`,
          nome: `${nomeCapital} do Conjunto`,
          tipo: p,
          quantidade: 1,
          materialSugerido: p === 'bucha' ? 'Bronze TM-23 (SAE 660)' : (p === 'engrenagem' ? 'Aço Liga SAE 4140' : 'Aço SAE 1045'),
          etapasProducao: [
            `1. Serra Fita (Corte de tarugo de ${nomeCapital})`,
            `2. Torno Mecânico / Centro CNC (Desbaste e usinagem dimensional)`,
            `3. Bancada / Acabamento (Ajuste e rebarbação)`
          ]
        });
      });
    }

    // Se for conjunto ou possui mais de uma peça acoplada, adiciona a etapa final de montagem / ajuste
    if (pecas.length >= 2 || (temPalavraConjunto && pecas.length >= 1)) {
      pecas.push({
        id: 'montagem_final',
        nome: 'Montagem, Ajuste e Acoplamento Final',
        tipo: 'montagem',
        quantidade: 1,
        materialSugerido: 'Conjunto Montado',
        etapasProducao: [
          '1. Bancada de Manutenção / Metrologia (Ajuste entre peças, checagem de folga radial/axial e controle de qualidade)'
        ]
      });
    } else if (pecas.length === 0) {
      return {
        ehConjuntoMultiPecas: false,
        pecasIdentificadas: []
      };
    }

    return {
      ehConjuntoMultiPecas: pecas.length >= 2,
      pecasIdentificadas: pecas
    };
  }

  /**
   * ETAPA 1: Triagem de Complexidade e Roteamento via JEV System One (ou simulador inteligente)
   */
  async analisarComplexidadeComJev({
    descricao,
    observacoes,
    categoria,
    quantidade,
    prazo,
    material,
    tratamentoTermico,
    durezaDesejada,
    detalhesTermico,
    temArquivos,
    apiKey,
    orcamentosHistorico = []
  }) {
    const qtd = Math.max(1, Number(quantidade) || 1);
    const temTermico = tratamentoTermico && tratamentoTermico !== 'Nenhum';

    const aprendizadoHabilitado = dbService.isModeloAprendizagemAtivo();
    let secaoHistorico = '';
    if (!aprendizadoHabilitado) {
      secaoHistorico = `\nMODELO DE APRENDIZAGEM DESATIVADO NO .ENV: O uso de orçamentos históricos como referência está desativado pelo administrador (.env: USAR_MODELO_APRENDIZAGEM=false). NÃO utilize referências anteriores. Calcule o orçamento de forma 100% autônoma a partir do zero com base apenas nas máquinas e insumos cadastrados. Defina OBRIGATORIAMENTE: "id_orcamento_referencia": null, "motivo_referencia": null e "aprendizado_chave": null.\n`;
    } else if (orcamentosHistorico && orcamentosHistorico.length > 0) {
      const itensResumidos = orcamentosHistorico.slice(0, 10).map(o =>
        `• [ID: "${o.id}"] #${o.numero}: "${(o.descricao || '').slice(0, 80)}" | Mat: ${o.material || 'N/A'} | Maqs: ${(o.maquinas || []).slice(0, 3).join(', ')} | Ajustes: ${o.ajustesHumano || 'Aprovado'}`
      ).join('\n');
      secaoHistorico = `\nBASE DE CONHECIMENTO INDUSTRIAL (ORÇAMENTOS REAIS ANTERIORES VALIDADOS/CALIBRADOS POR ENGENHEIRO):\n${itensResumidos}\n`;
    } else {
      secaoHistorico = `\nBASE DE CONHECIMENTO VAZIA: Não há orçamentos históricos validados no momento. Defina OBRIGATORIAMENTE: "id_orcamento_referencia": null, "motivo_referencia": null e "aprendizado_chave": null.\n`;
    }

    // Se a chave OpenRouter estiver configurada, chamamos a API
    if (apiKey) {
      try {
        const promptJev = `Você é o classificador, roteador industrial e consultor de similaridade JEV (System One) da Nardelli Usinagem.
Sua missão é tripla:
1. DECIDIR O MODELO IDEAL para cálculo da proposta:
- "anthropic/claude-sonnet-5.5": Modelo padrão e principal de engenharia para cálculo de propostas técnicas, peças sob medida, conjuntos de múltiplas peças, desenhos técnicos anexados, tolerâncias centesimais (h6/h7), peças pesadas, multieixo CNC e tratamentos térmicos.
- "google/gemini-2.5-flash": Alternativa ultra-rápida para peças unitárias simples e diretas.

2. RECONHECER MÚLTIPLAS PEÇAS FABRICADAS JUNTAS (CONJUNTO INDUSTRIAL):
Verifique se a solicitação possui MAIS DE UMA PEÇA a ser fabricada e montada/entregue junta (ex: conjunto eixo + bucha, carcaça + tampa, flange + pino, conjunto soldado/montado).
Se sim, defina "eh_conjunto_multi_pecas": true e liste em "pecas_identificadas" cada peça com nome, quantidade e material.
Se for peça única simples, defina "eh_conjunto_multi_pecas": false e "pecas_identificadas": [].

3. CONSULTA RÁPIDA DE SIMILARIDADE:
Verifique na BASE DE CONHECIMENTO abaixo se existe algum orçamento anterior que seja tecnicamente similar ao serviço solicitado (mesma peça/geometria, família de material ou operações similares).
Se encontrar um similar relevante que ajude a IA a evitar retrabalho, preencha "id_orcamento_referencia", "motivo_referencia" e "aprendizado_chave".
Se nenhum for similar ou a base estiver vazia, retorne null em "id_orcamento_referencia".
${secaoHistorico}
DADOS DA SOLICITAÇÃO TÉCNICA:
- Peça / Serviço: "${descricao}"
- Categoria da Peça: "${categoria || 'Usinagem Geral'}"
- Quantidade: ${qtd} peça(s)
- Prazo Solicitado: "${prazo || 'Padrão'}"
- Material Informado pelo Cliente: "${material && material.trim() ? material : 'NÃO ESPECIFICADO'}"
- Tratamento Térmico: "${tratamentoTermico || 'Nenhum'}" (Dureza: "${durezaDesejada || 'N/A'}", Detalhes: "${detalhesTermico || 'N/A'}")
- Observações adicionais: "${observacoes || 'Nenhuma'}"
- Possui arquivos/desenhos anexados: ${temArquivos ? 'SIM' : 'NÃO'}

Responda SOMENTE um JSON no formato:
{
  "complexidade": "BAIXA" | "MEDIA" | "ALTA",
  "setor_principal": "USINAGEM_CONVENCIONAL" | "USINAGEM_CNC" | "CALDEIRARIA_SOLDA" | "TRATAMENTO_TERMICO_RECUPERACAO" | "GERAL",
  "modelo_recomendado": "anthropic/claude-sonnet-5.5" | "google/gemini-2.5-flash",
  "justificativa": "frase curta explicando por que o JEV selecionou este modelo",
  "eh_conjunto_multi_pecas": true | false,
  "pecas_identificadas": [
    { "nome": "string", "qtd": number, "material": "string" }
  ],
  "id_orcamento_referencia": "ID_do_orcamento_ou_null",
  "motivo_referencia": "motivo técnico da similaridade ou null",
  "aprendizado_chave": "o que replicar das horas/insumos aprovados ou null",
  "tokens_poupados_estimativa": 70
}`;

        const config = dbService.getConfig();
        const modeloJev = config.modeloRoteador || 'google/gemini-2.5-flash';

        const resp = await fetch(this.openRouterUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://nardelliusinagem.com.br',
            'X-Title': 'Nardelli Usinagem Orçamentos'
          },
          body: JSON.stringify({
            model: modeloJev,
            messages: [{ role: 'user', content: promptJev }],
            max_tokens: 380,
            temperature: 0.1
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (resp.ok) {
          const data = await resp.json();
          const rawText = data.choices?.[0]?.message?.content || '';
          const parsed = this.extrairJSON(rawText);
          if (!aprendizadoHabilitado && parsed) {
            parsed.id_orcamento_referencia = null;
            parsed.motivo_referencia = null;
            parsed.aprendizado_chave = null;
          }
          return parsed;
        }
      } catch (err) {
        console.warn('JEV via OpenRouter indisponível, usando fallback de classificação heurística:', err.message);
      }
    }

    // Heurística local de System 1 (quando offline ou sem chave)
    const text = (descricao + ' ' + (observacoes || '') + ' ' + (categoria || '') + ' ' + (material || '') + ' ' + (tratamentoTermico || '')).toLowerCase();
    let complexidade = 'BAIXA';
    let setor = 'USINAGEM_CONVENCIONAL';
    let modelo = 'anthropic/claude-sonnet-5.5';
    let justificativa = 'Geometria simples de fabricação direta.';

    // Detecção local de múltiplas peças
    const multiPecasInfo = this.detectarMultiplasPecas(descricao, categoria, observacoes);

    if (temTermico || text.includes('têmpera') || text.includes('forno') || text.includes('cementação') || text.includes('dureza') || text.includes('revenimento')) {
      setor = 'TRATAMENTO_TERMICO_RECUPERACAO';
      complexidade = 'ALTA';
      modelo = 'anthropic/claude-sonnet-5.5';
      justificativa = `Requer tratamento térmico (${tratamentoTermico}${durezaDesejada ? ' / ' + durezaDesejada : ''}) com forno industrial e controle metalúrgico.`;
    } else if (text.includes('solda') || text.includes('caldeiraria') || text.includes('estrutura') || text.includes('chapa')) {
      setor = 'CALDEIRARIA_SOLDA';
      complexidade = text.includes('recupera') || text.includes('eixo') ? 'MEDIA' : 'BAIXA';
      modelo = 'anthropic/claude-sonnet-5.5';
      justificativa = 'Trabalho de caldeiraria e união por soldagem.';
    } else if (text.includes('cnc') || text.includes('centro de usinagem') || text.includes('molde') || text.includes('matriz')) {
      setor = 'USINAGEM_CNC';
      complexidade = 'ALTA';
      modelo = 'anthropic/claude-sonnet-5.5';
      justificativa = 'Exige programação CNC, usinagem multieixo e tolerâncias estreitas.';
    } else if (multiPecasInfo.ehConjuntoMultiPecas) {
      complexidade = 'MEDIA';
      modelo = 'anthropic/claude-sonnet-5.5';
      justificativa = `Conjunto industrial com ${multiPecasInfo.pecasIdentificadas.length} peças fabricadas juntas. Requer roteamento ordenado de etapas de usinagem por componente.`;
    } else if (temArquivos || text.includes('desenho') || text.includes('tolerância') || text.includes('conjunto') || qtd > 10) {
      complexidade = 'MEDIA';
      modelo = 'anthropic/claude-sonnet-5.5';
      justificativa = 'Análise de desenho técnico com cotas e especificações funcionais.';
    }

    if (complexidade !== 'BAIXA') {
      modelo = 'anthropic/claude-sonnet-5.5';
    }

    // Busca local inteligente de similaridade com histórico validado
    const matchSimilar = this.buscarCasoSimilarLocal(descricao, material, categoria, orcamentosHistorico);

    return {
      complexidade,
      setor_principal: setor,
      modelo_recomendado: modelo,
      justificativa,
      eh_conjunto_multi_pecas: multiPecasInfo.ehConjuntoMultiPecas,
      pecas_identificadas: multiPecasInfo.pecasIdentificadas,
      id_orcamento_referencia: aprendizadoHabilitado && matchSimilar ? matchSimilar.id_orcamento_referencia : null,
      motivo_referencia: aprendizadoHabilitado && matchSimilar ? matchSimilar.motivo_referencia : null,
      aprendizado_chave: aprendizadoHabilitado && matchSimilar ? matchSimilar.aprendizado_chave : null,
      tokens_poupados_estimativa: 70
    };
  }

  /**
   * Mecanismo de busca local por similaridade semântica para quando offline
   */
  buscarCasoSimilarLocal(descricao, material, categoria, orcamentosHistorico) {
    if (!dbService.isModeloAprendizagemAtivo()) return null;
    if (!orcamentosHistorico || orcamentosHistorico.length === 0) return null;

    const stopWords = new Set(['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'ao', 'ele', 'das', 'à', 'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'você', 'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'numa', 'pelos', 'elas', 'qual', 'nós', 'lhe', 'deles', 'essas', 'esses', 'pelas', 'este', 'dele']);

    const extrairTermos = (str) => {
      return (str || '')
        .toLowerCase()
        .replace(/[^\w\sáéíóúãõâêîôûç]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !stopWords.has(t));
    };

    const termosQuery = new Set([
      ...extrairTermos(descricao),
      ...extrairTermos(material),
      ...extrairTermos(categoria)
    ]);

    let melhorCaso = null;
    let melhorScore = 0;

    for (const caso of orcamentosHistorico) {
      const termosCaso = new Set([
        ...extrairTermos(caso.descricao),
        ...extrairTermos(caso.material),
        ...extrairTermos(caso.categoria)
      ]);

      let score = 0;
      for (const t of termosQuery) {
        if (termosCaso.has(t)) {
          if (t.match(/\d+/) || ['eixo', 'engrenagem', 'bucha', 'polia', 'flange', 'mancal', 'solda', 'chaveta', 'cilindro', 'bronze', 'inox'].includes(t)) {
            score += 3;
          } else {
            score += 1;
          }
        }
      }

      if (score > melhorScore) {
        melhorScore = score;
        melhorCaso = caso;
      }
    }

    if (melhorCaso && melhorScore >= 3) {
      return {
        id_orcamento_referencia: melhorCaso.id,
        motivo_referencia: `Similaridade técnica identificada com Orçamento #${melhorCaso.numero} (${melhorCaso.categoria || 'peça afim'} em ${melhorCaso.material || 'material similar'}).`,
        aprendizado_chave: `Replicar tempos de máquina e insumos validados pelo orçamentista no Orçamento #${melhorCaso.numero}.`
      };
    }

    return null;
  }

  /**
   * ETAPA 2: Geração do Orçamento Técnico Detalhado com Claude 3.5 Sonnet
   */
  async gerarPreviaOrcamento({
    descricao,
    observacoes,
    arquivos,
    modoForcado,
    categoria,
    quantidade,
    prazo,
    material,
    tratamentoTermico,
    durezaDesejada,
    detalhesTermico
  }) {
    const config = dbService.getConfig();
    const apiKey = config.openrouterApiKey;
    const todosInsumos = dbService.getInsumos();
    const todasMaquinas = dbService.getMaquinas();
    const qtd = Math.max(1, Number(quantidade) || 1);

    // 0. Busca orçamentos históricos validados por humanos para aprendizado ativo (se ativo no .env)
    const aprendizadoAtivo = dbService.isModeloAprendizagemAtivo();
    const historicoValidados = aprendizadoAtivo ? await dbService.getOrcamentosValidadosParaTreino(15) : [];

    // 1. Triagem, Roteamento e Consulta Rápida de Similaridade com JEV System One
    const triagem = await this.analisarComplexidadeComJev({
      descricao,
      observacoes,
      categoria,
      quantidade: qtd,
      prazo,
      material,
      tratamentoTermico,
      durezaDesejada,
      detalhesTermico,
      temArquivos: arquivos && arquivos.length > 0,
      apiKey,
      orcamentosHistorico: historicoValidados
    });

    // 2. Se JEV identificou similaridade com caso validado, carrega os dados completos se existir na base real
    let orcRef = null;
    let referenciaHistorica = null;
    if (aprendizadoAtivo && triagem.id_orcamento_referencia && historicoValidados && historicoValidados.length > 0) {
      orcRef = await dbService.getOrcamentoById(triagem.id_orcamento_referencia);
      const ehValidoNoHistorico = orcRef && historicoValidados.some(v => v.id === orcRef.id);
      if (orcRef && ehValidoNoHistorico) {
        referenciaHistorica = {
          usouReferencia: true,
          orcamentoId: orcRef.id,
          orcamentoNumero: orcRef.numero,
          descricao: orcRef.descricaoServico,
          categoria: orcRef.categoriaPeca || categoria,
          material: orcRef.materialDefinido || orcRef.materialPeca || material,
          quantidade: orcRef.quantidadePecas || 1,
          motivoJev: triagem.motivo_referencia || 'Similaridade técnica identificada pelo JEV',
          aprendizadoChave: triagem.aprendizado_chave || 'Replicar proporções de máquinas e insumos aprovados',
          ajustesPrevios: orcRef.ajustesHumano?.resumo || null,
          maquinasAprovadas: orcRef.itensMaquina || [],
          insumosAprovados: orcRef.itensInsumo || []
        };
      }
    }

    // 2. Modelo ideal decidido autonomamente pelo JEV System One (padrão Claude Sonnet 5.5)
    const modeloEscolhido = modoForcado || config.modeloGerador || triagem.modelo_recomendado || 'anthropic/claude-sonnet-5.5';

    // 2. Aplicação de Poda de Catálogo para economizar tokens
    let catalogoUso = { maquinasFiltradas: todasMaquinas, insumosFiltrados: todosInsumos };
    if (config.otimizarTokens) {
      catalogoUso = this.filtrarCatalogoRelevante(triagem.setor_principal, todosInsumos, todasMaquinas);
    }

    const nomesInsumosCatalogo = catalogoUso.insumosFiltrados.map(i => `${i.nome} [${i.unidade}] (R$ ${i.preco.toFixed(2)})`).join('; ');
    const nomesMaquinasCatalogo = catalogoUso.maquinasFiltradas.map(m =>
      `- ${m.nome}\n  * Categoria: ${m.categoria || 'Usinagem'} | Capacidade/Dimensões: ${m.capacidade || 'N/A'}\n  * Limites/Aplicação: ${m.descricao || ''} ${m.observacoes || ''}\n  * Taxa Normal: R$ ${m.normal.toFixed(2)}/h (50%: R$ ${m.h50.toFixed(2)}/h, 100%: R$ ${m.h100.toFixed(2)}/h)`
    ).join('\n');

    let blocoAprendizadoJev = '';
    if (referenciaHistorica && orcRef) {
      const maqsRefStr = (orcRef.itensMaquina || []).map(m => `  * ${m.nome || m.maquina}: ${m.horas}h (${m.descricao || ''})`).join('\n');
      const insRefStr = (orcRef.itensInsumo || []).map(i => `  * ${i.nome}: ${i.qtd} ${i.unidade || ''} (R$ ${Number(i.preco || 0).toFixed(2)})`).join('\n');
      const ajusteStr = orcRef.ajustesHumano?.resumo ? `\n- Ajustes que o orçamentista realizou no histórico: "${orcRef.ajustesHumano.resumo}"` : '';

      blocoAprendizadoJev = `
======================================================================
REFERÊNCIA REAL APROVADA PELA ENGENHARIA NARDELLI (APRENDIZADO ATIVO JEV):
O roteador JEV identificou alta similaridade com o Orçamento #${orcRef.numero}:
- Serviço Similar Aprovado: "${orcRef.descricaoServico}"
- Matéria-prima Aprovada: "${orcRef.materialDefinido || orcRef.materialPeca || 'N/A'}"
- Operações e Horas de Máquina que o Orçamentista Validou:
${maqsRefStr}
- Insumos Validados pelo Engenheiro:
${insRefStr}${ajusteStr}

DIRETRIZ DE APRENDIZADO INDUSTRIAL:
Considere os tempos, máquinas e consumos deste caso aprovado como PADRÃO OURO. Replique proporcionalmente para este novo serviço, evitando que o usuário precise fazer correções manuais novamente!
======================================================================
`;
    }

    const promptSistema = `Você é o Orçamentista Técnico Sênior e Engenheiro Chefe de Produção da Nardelli Usinagem & Caldeiraria (Aracaju/SE).
Sua missão é calcular com rigor de engenharia mecânica e precisão comercial os insumos, matérias-primas e horas de máquina necessárias para executar o serviço solicitado, escolhendo a máquina ideal com base nas dimensões da peça e operações necessárias.
${blocoAprendizadoJev}
CATÁLOGO DE MÁQUINAS DISPONÍVEIS NA OFICINA COM DIMENSÕES E CAPACIDADES:
${nomesMaquinasCatalogo}

CATÁLOGO DE INSUMOS DISPONÍVEIS:
${nomesInsumosCatalogo}

REGRAS DE ENGENHARIA PARA SELEÇÃO DA MÁQUINA IDEAL (CONFORME DIMENSÕES E CARACTERÍSTICAS):
1. PEÇAS CILÍNDRICAS (Eixos, buchas, flanges, rolos, pinos):
   - Avalie sempre o DIÂMETRO (Ø) e COMPRIMENTO (L) da peça:
     * Pequeno porte (Ø <= 400mm e L <= 1000mm, peso <= 80-600kg): Selecionar "Torno Universal Ø400 x 1000mm (IMOR PRN 320)" ou "Torno Mecânico Universal Ø440 x 1000mm (NARDINI Mascote MS 220)".
     * Médio porte (Ø até 650-660mm e L até 2200mm, flanges até Ø850mm, peso até 1000-2000kg): Selecionar "Torno Mecânico Universal Ø650 x 2200mm (ROMI I40-A)" ou "Torno Mecânico Universal Ø660 x 2200mm (TIMEMASTER CDS 660)".
     * Grande porte / Pesado (L > 2200mm até 4000mm, OU Ø > 650mm até 800mm / 1000mm na cava, peso até 3000kg): OBRIGATÓRIO selecionar "Torno Pesado Universal Ø800 x 4000mm (TIMEMASTER CW800)".
     * Peças seriadas ou perfis complexos CNC (Ø até 400mm x 970mm): Selecionar "Torno CNC Logic 195III (NARDINI Logic 195III)".
2. RASGOS DE CHAVETA, RANHURAS E ENGRENAGENS:
   - Rasgo de chaveta INTERNO (furos de engrenagens, polias, cubos, acoplamentos): Selecione OBRIGATORIAMENTE a "Plaina Limadora 650mm para Rasgos Internos (ZOCCA 650)". Se for cego ou material temperado > 50 HRC: "Eletroerosão por Penetração Tanque 800x500mm (INFRESA ONA GORKA 200)".
   - Rasgo de chaveta EXTERNO (em eixos cilíndricos): Selecionar "Fresadora Ferramenteira Universal 1370x320mm (VIRTUAL ZX6332B)".
   - Engrenagens dentes retos/helicoidais e estrias: Selecionar "Fresadora Universal Nº 2 com Divisor e Mesa Giratória 45° (NATAL FU2-40)".
3. PEÇAS PRISMÁTICAS, MULTIEIXOS E ESTRUTURAS PESADAS:
   - Fresamento 3D, furações coordenadas ou peças com 4º eixo: "Centro de Usinagem Vertical CNC 508x508x508mm c/ 4º Eixo (CINCINNATI Arrow 500)" ou "Centro de Usinagem Vertical CNC 762x406x508mm (ROMI Discovery 760)".
   - Carcaças de redutores, caixas de mancais bipartidos, cabeçotes e mandrilhamento de furos profundos (peças até 4 toneladas, mesa 1000x800mm): Selecionar "Mandrilhadora Horizontal Fuso Ø80mm Mesa 1000x800mm (WARSZAWA CWC 80)".
   - Furação de chapas grossas, flanges e sapatas com brocas pesadas até Ø60mm: "Furadeira Radial Industrial Cone Morse 5 Ø60mm (NARDINI FNR 80)".
4. ACABAMENTO CENTESIMAL E TOLERÂNCIAS RIGOROSAS:
   - Sedes de rolamento cilíndricas com tolerância centesimal (h6, h7, k6) e acabamento retificado: Incluir operação de acabamento na "Retífica Cilíndrica Universal Ø360 x 750mm (SULMECÂNICA RUAP 750)".
   - Superfícies planas retificadas com tolerância centesimal e faces paralelas: "Retífica Plana Tangencial 640 x 360 x 300mm (FERDMAT UNIVERSAL T60)".
5. RECUPERAÇÃO MECÂNICA:
   - Recuperação de eixos desgastados: 1º Soldagem MIG/MAG ou Eletrodo para enchimento -> 2º Torno mecânico para desbaste do sobremetal -> 3º Retífica cilíndrica para acabamento h6.
6. TRATAMENTO TÉRMICO & ACABAMENTO SUPERFICIAL:
   - Se Tratamento Térmico for diferente de 'Nenhum' (ex: Têmpera, Cementação, Revenimento, Alívio de Tensões, Normalização):
     * MÁQUINAS OBRIGATÓRIAS:
       - Incluir "Forno Elétrico de Tratamento Térmico até 1050°C (SANCHIS Mufla Industrial)" ou "Forno Mufla Elétrico de Alta Temperatura até 1200°C (JB 1200)" (R$ 42,95/h) com ciclo térmico completo (aquecimento gradual, patamar de austenitização/manutenção e resfriamento em meio apropriado).
       - Incluir operação pós-térmica de "Jateamento Abrasivo e Acabamento Superficial" (R$ 20,00/h) para decapagem mecânica de carepas de oxidação.
     * INSUMOS OBRIGATÓRIOS:
       - Se processo envolver Têmpera: incluir "ÓLEO TÊMPERA 1037/22L" (R$ 13,33/kg).
       - Se processo for Cementação: incluir "PÓ PARA CEMENTAÇÃO" (R$ 100,00/kg).
     * Se houver dureza especificada (ex: 55-60 HRC): citar na descrição da operação do forno os patamares técnicos para atingir a dureza.
7. CORTE DE BRUTO:
   - Para tarugos maciços até Ø330mm: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)". Para chapas até 8mm: "Guilhotina Mecânica de Chapas 2000 x 8mm (NEWTON TM10)". Para corte térmico até 19mm: "Corte Térmico Plasma Manual e Semiautomático até 19mm (HYPERTHERM Powermax 65)".
8. QUANTIDADE E ESCALA DE PRODUÇÃO:
   - Quantidade total: ${qtd} peça(s).
   - Insumos de matéria-prima (kg de tarugo, kg de óleo, etc.) e consumo de pastilhas/brocas devem ser proporcionais ao número total de peças.
   - O tempo de preparação (setup) das máquinas é executado uma única vez, enquanto o tempo de usinagem/ciclo multiplica pela quantidade de peças.
9. GEOMETRIA ECONÔMICA DA MATÉRIA-PRIMA BRUTA (MÍNIMO CAVACO & EFICIÊNCIA DE CUSTOS):
   - Avalie sempre o perfil geométrico do componente antes de definir a barra bruta:
     * PEÇAS RETANGULARES, PRISMÁTICAS, MARTELINHOS OU BLOCOS (ex: peças de largura 10mm e altura 29,45mm): NUNCA especifique tarugo redondo gigante (ex: Ø45mm) para transformar 80% do metal em cavaco! Especifique **BARRA CHATA** ou **BARRA QUADRADA** comercial com sobremetal enxuto de 2 a 4mm (ex: para martelinho 29,45x10mm, usar **BARRA CHATA SAE 1045 1.1/4" x 1/2"** [~31,75 x 12,7mm] ou 32x12mm, que pesa apenas ~3,1 kg/m).
     * PORCAS E FIXADORES SEXTAVADOS (ex: porca chave 19,05mm / 3/4"): OBRIGATÓRIO usar **BARRA SEXTAVADA** comercial (ex: Barra Sextavada SAE 1045 3/4", que pesa ~2,04 kg/m), economizando material e tempo de fresamento.
     * CÁLCULO RIGOROSO DE PESO DE METAL: Calcule o comprimento unitário de corte da barra (comprimento da peça + 3 a 5mm de serra), multiplique pelo peso linear em kg/m e pela quantidade total de peças. Jamais superestime a quantidade de metal bruto além da geometria real!


DIRETRIZES TÉCNICAS ADICIONAIS:
1. SELEÇÃO E SUGESTÃO DA MATÉRIA-PRIMA (MUITO IMPORTANTE):
   - SE O CLIENTE ESPECIFICOU UM MATERIAL (campo 'Material Especificado pelo Cliente' informado):
     * Respeite rigorosamente a especificação do cliente (ex: se pediu Aço Inox 316, Aço Liga 4140, Bronze, etc.).
     * Preencha "materialDefinido" com o material do cliente e "materialOrigem": "cliente".
   - SE O MATERIAL NÃO FOI ESPECIFICADO (definir pela IA):
     * DEFINA AUTONOMAMENTE O MATERIAL IDEAL PARA A PEÇA com base em engenharia mecânica:
       - Buchas de atrito / mancais de deslizamento: Bronze TM-23 (SAE 660) ou Poliacetal.
       - Engrenagens, pinhões, eixos motrizes de alto esforço/torque, peças sujeitas a impacto ou têmpera direta: Aço Liga Beneficiado (SAE 4140 / 4340; ou SAE 8620 para cementação).
       - Eixos de uso geral, pinos, flanges, polias simples: Aço Carbono SAE 1045 (ou SAE 1020 para conjuntos soldados/caldeiraria).
       - Ambientes corrosivos, químicos, alimentícios, marinhos: Aço Inox AISI 304 ou AISI 316.
       - Matrizes, navalhas, punções, lâminas de corte a frio: Aço Ferramenta (D2 / VC131 / VND).
       - Carcaças pesadas, volantes de motor, flanges de grande porte: Ferro Fundido Nodular FE 50007.
       - Componentes leves: Alumínio Estrutural 6061-T6.
   - CATÁLOGO DE INSUMOS VS. SUGESTÃO DE MATERIAL IDEAL NÃO LISTADO:
     * Você pode seguir a lista de insumos cadastrados se nela houver a matéria-prima ideal para a peça.
     * CONTUDO, SE O MATERIAL IDEAL PARA O BOM FUNCIONAMENTO DA PEÇA NÃO ESTIVER LISTADO NO CATÁLOGO DE INSUMOS, VOCÊ DEVE SUGERIR ELE! Não force um material inferior ou inadequado do catálogo só porque está cadastrado.
     * Ao sugerir um material ideal não listado no catálogo:
       - Adicione o item no array "insumos" com nome técnico padronizado (ex: "BARRA REDONDA AÇO LIGA SAE 4140 BENEFICIADO Ø80MM", "BUCHA BRONZE TM-23 (SAE 660) Ø120x80MM", "CHAPA AÇO INOX AISI 304 ESP. 1/2\"", etc.).
       - Dimensione com sobremetal (~5 a 10mm) e unidade adequada (KG, PÇ ou M).
       - Atribua um preço unitário de mercado realista e condizente (ex: Aço 1045 ~R$ 25/kg, Aço 4140 ~R$ 38-42/kg, Aço 4340 ~R$ 48/kg, Inox 304 ~R$ 55/kg, Inox 316 ~R$ 75-85/kg, Bronze TM-23 ~R$ 85-95/kg, Aço D2 ~R$ 95-120/kg, Alumínio ~R$ 50/kg).
       - Preencha "materialOrigem": "sugerido_ideal" (ou "catalogo" se o item estava cadastrado no catálogo).
       - Preencha "materialDefinido": nome do material (ex: "Aço Liga SAE 4140 Beneficiado").
       - Preencha "justificativaMaterial": justificativa técnica concisa de engenharia explicando por que esse material foi selecionado.
2. OPERAÇÕES E ROTEIRO SEQUENCIAL: No campo "descricao", liste o passo a passo sequencial da operação daquela máquina (ex: "Fixação em placa 4 castanhas, centragem com relógio comparador, desbaste cilíndrico de Ø95 para Ø80mm e faceamento").
3. HORAS: Estime tempos realistas de preparação (setup) + usinagem/operação considerando o lote de ${qtd} peça(s).
4. REGIME: Use 'normal' na maioria dos casos, ou 'h50'/'h100' apenas para urgência/horas extras justificadas.
5. MÚLTIPLAS PEÇAS FABRICADAS JUNTAS (CONJUNTOS INDUSTRIAIS):
   - Se a solicitação contiver mais de uma peça a ser fabricada junta (ex: conjunto eixo + buchas, carcaça + tampa, flange + pino, conjunto soldado/montado):
     * Marque "ehConjuntoMultiPecas": true.
     * Preencha o array "pecas" com cada componente individual identificado:
       [
         {
           "id": "peca_1",
           "nome": "string descritiva (ex: Eixo de Moenda Ø180x2400mm)",
           "material": "string (matéria-prima deste componente)",
           "quantidade": number,
           "etapasProducao": ["1. Serra Fita (Corte)", "2. Torno Timemaster (Desbaste e acabamento)", ...]
         },
         ...
       ]
     * No array "operacoes", CADA OPERAÇÃO DEVE CONTER OBRIGATORIAMENTE:
       - "peca": nome da peça correspondente a esta operação (ex: "Eixo", "Buchas" ou "Montagem e Ajuste Final").
       - "etapa": número sequencial da etapa DENTRO DO FLUXO DAQUELA PEÇA (1, 2, 3...).
       - "ordemProducao": índice sequencial geral da produção (1, 2, 3, 4, 5...).
       - "maquina": máquina do catálogo.
       - "descricao": detalhe da operação para aquela peça.
     * ORDENAÇÃO CRONOLÓGICA DAS ETAPAS PARA CADA PEÇA:
       1º Corte do bruto (Serra Fita)
       2º Torneamento / desbaste e conformação geométrica (Torno Mecânico ou Centro de Usinagem CNC)
       3º Operações secundárias (Fresadora para chavetas / Plaina para rasgos internos)
       4º Tratamento térmico (se aplicável: Forno Mufla + Jateamento)
       5º Retífica centesimal (Retífica Cilíndrica ou Retífica Plana)
       6º Para conjuntos montados: Etapa final na Bancada Mecânica para montagem, ajuste das peças fabricadas juntas e controle de qualidade.
   - Se for peça única, preencha "ehConjuntoMultiPecas": false e "pecas": [].

Responda EXCLUSIVAMENTE um objeto JSON válido (sem texto introdutório, sem markdown) no seguinte formato exato:
{
  "ehConjuntoMultiPecas": boolean,
  "pecas": [
    {
      "id": "string",
      "nome": "string",
      "material": "string",
      "quantidade": number,
      "etapasProducao": ["string"]
    }
  ],
  "materialDefinido": "string (nome da matéria-prima adotada, ex: 'Aço Liga SAE 4140 Beneficiado')",
  "materialOrigem": "cliente | catalogo | sugerido_ideal",
  "justificativaMaterial": "string (justificativa técnica clara da escolha desta matéria-prima)",
  "insumos": [
    { "nome": "string", "qtd": number, "unidade": "string", "preco": number }
  ],
  "operacoes": [
    {
      "peca": "string (nome da peça correspondente, ex: 'Eixo', 'Buchas' ou 'Montagem Final')",
      "etapa": number,
      "ordemProducao": number,
      "maquina": "string (deve ser o nome exato ou identificador de uma máquina do catálogo)",
      "descricao": "string detalhada com sequência técnica",
      "regime": "normal|h50|h100",
      "horas": number,
      "valorHora": number
    }
  ],
  "moEscritorio": number,
  "observacoesTecnicas": "string com considerações de tolerância, acabamento e setup",
  "diasEntregaEstimados": number
}`;

    // Chamada real ao OpenRouter se apiKey estiver presente
    if (apiKey) {
      try {
        const anexosFormatados = this.prepararAnexosParaOpenRouter(arquivos);

        const promptTexto = `SOLICITAÇÃO DE ORÇAMENTO TÉCNICO:
- Peça / Serviço: ${descricao}
- Categoria da Peça: ${categoria || 'Usinagem Geral'}
- Quantidade: ${qtd} peça(s)
- Prazo Desejado pelo Cliente: ${prazo || 'Padrão da oficina'}
- Material Especificado pelo Cliente: ${material && material.trim() ? material : 'NÃO ESPECIFICADO (Definir autonomamente a melhor matéria-prima técnica para a peça, sugerindo opção ideal mesmo que não conste no catálogo)'}
- Tratamento Térmico Requerido: ${tratamentoTermico || 'Nenhum'}
- Dureza Desejada: ${durezaDesejada || 'N/A'}
- Detalhes do Térmico: ${detalhesTermico || 'N/A'}
- Observações adicionais do cliente/orçamentista: ${observacoes || 'Nenhuma'}`;

        const userContent = [
          ...anexosFormatados,
          { type: 'text', text: promptTexto }
        ];

        const modeloFallback = config.modeloEconomico || 'qwen/qwen3.8-max-prime';

        const { parsed, usage, modeloUsado, usouFallback, motivoFallback } = await this.executarChamadaOpenRouterComFallback({
          apiKey,
          modeloPrincipal: modeloEscolhido,
          modeloFallback,
          messages: [
            { role: 'system', content: promptSistema },
            { role: 'user', content: userContent }
          ],
          timeoutMs: 60000
        });

        const nomeAmigavel = modeloUsado.includes('qwen') ? 'Qwen 3.8 Pro' : (modeloUsado.includes('claude') ? 'Anthropic Claude Sonnet 5.5' : modeloUsado);

        return {
          sucesso: true,
          origemIA: usouFallback ? `OpenRouter Fallback (${nomeAmigavel})` : `OpenRouter Live (${nomeAmigavel})`,
          triagemJev: triagem,
          referenciaHistorica,
          modelo: modeloUsado,
          usouFallback: !!usouFallback,
          avisoFallback: usouFallback ? `O modelo principal (${this.normalizarIdModelo(modeloEscolhido)}) oscilou no provedor (${motivoFallback}). O cálculo foi concluído com sucesso pelo modelo de contingência (${nomeAmigavel}).` : null,
          resultado: this.normalizarResultadoComCatalogo(parsed, todosInsumos, todasMaquinas),
          tokensUtilizados: usage || null
        };
      } catch (err) {
        console.error('Erro na chamada à IA da OpenRouter:', err);
        throw new Error(`Falha na análise com a IA (${modeloEscolhido}): ${err.message}`);
      }
    } else {
      throw new Error('Chave da API OpenRouter não configurada. Configure sua chave em Configurações > Modelos de IA.');
    }
  }

  /**
   * Refinamento / Correção Interativa da Prévia com IA
   */
  async refinarPreviaComIA({ orcamentoAtual, instrucaoUsuario }) {
    const config = dbService.getConfig();
    const apiKey = config.openrouterApiKey;
    const todosInsumos = dbService.getInsumos();
    const todasMaquinas = dbService.getMaquinas();

    const nomesMaquinas = todasMaquinas.map(m => `- ${m.nome} (Taxa: R$ ${m.normal.toFixed(2)}/h)`).join('\n');
    const promptSistema = `Você é o Orçamentista Técnico e Engenheiro Chefe da Nardelli Usinagem. O usuário está revisando uma proposta de orçamento e solicitou alterações ou refinamentos específicos.
Receba a proposta atual e a instrução de alteração do usuário. Aplique os ajustes solicitados com precisão técnica de usinagem, mantendo coerência com as máquinas disponíveis na oficina:

CATÁLOGO DE MÁQUINAS:
${nomesMaquinas}

DIRETRIZES:
1. Se o usuário pediu para mudar tipo de material ou dimensões da matéria-prima (ex: mudar de barra redonda para barra chata), atualize o array "insumos" com o nome técnico, dimensões e peso em kg condizentes.
2. Se o usuário pediu para ajustar máquinas, horas ou etapas de fabricação, atualize "operacoes" mantendo os campos: peca, etapa, ordemProducao, maquina, descricao, regime, horas, valorHora.
3. Resuma claramente o que foi alterado em "justificativaAjuste".

Responda EXCLUSIVAMENTE um JSON no formato:
{
  "insumos": [{ "nome": "string", "qtd": number, "unidade": "string", "preco": number }],
  "operacoes": [{ "peca": "string", "etapa": number, "ordemProducao": number, "maquina": "string", "descricao": "string", "regime": "normal|h50|h100", "horas": number, "valorHora": number }],
  "moEscritorio": number,
  "justificativaAjuste": "resumo claro do que foi modificado",
  "materialDefinido": "string (opcional)",
  "justificativaMaterial": "string (opcional)"
}`;

    if (apiKey) {
      try {
        const modeloPrincipal = config.modeloGerador || 'anthropic/claude-sonnet-5.5';
        const modeloFallback = config.modeloEconomico || 'qwen/qwen3.8-max-prime';

        const { parsed, modeloUsado, usouFallback, motivoFallback } = await this.executarChamadaOpenRouterComFallback({
          apiKey,
          modeloPrincipal,
          modeloFallback,
          messages: [
            { role: 'system', content: promptSistema },
            {
              role: 'user',
              content: `SOLICITAÇÃO ORIGINAL / DESCRIÇÃO: "${orcamentoAtual.descricaoServico || ''}"
QUANTIDADE: ${orcamentoAtual.quantidadePecas || 1} peça(s)

PROPOSTA ATUAL:
${JSON.stringify({
  material: orcamentoAtual.materialDefinido || orcamentoAtual.materialPeca,
  insumos: orcamentoAtual.itensInsumo,
  operacoes: orcamentoAtual.itensMaquina,
  moEscritorio: orcamentoAtual.moEscritorio
}, null, 2)}

INSTRUÇÃO DE AJUSTE / RECÁLCULO DO USUÁRIO:
"${instrucaoUsuario}"`
            }
          ],
          timeoutMs: 60000
        });

        const nomeAmigavel = modeloUsado.includes('qwen') ? 'Qwen 3.8 Pro' : (modeloUsado.includes('claude') ? 'Anthropic Claude Sonnet 5.5' : modeloUsado);

        return {
          sucesso: true,
          origemIA: usouFallback ? `OpenRouter Fallback (${nomeAmigavel})` : `OpenRouter Live (${nomeAmigavel})`,
          modelo: modeloUsado,
          usouFallback: !!usouFallback,
          avisoFallback: usouFallback ? `O modelo principal oscilou no provedor (${motivoFallback}). O recálculo foi concluído pelo modelo de contingência (${nomeAmigavel}).` : null,
          resultado: this.normalizarResultadoComCatalogo(parsed, todosInsumos, todasMaquinas)
        };
      } catch (e) {
        console.error('Erro ao refinar com IA:', e);
        throw new Error(`Falha ao refinar proposta com a IA: ${e.message}`);
      }
    } else {
      throw new Error('Chave da API OpenRouter não configurada.');
    }
  }

  /**
   * Vincula nomes sugeridos aos preços oficiais do catálogo da Nardelli
   */
  normalizarResultadoComCatalogo(resultado, todosInsumos, todasMaquinas) {
    const norm = s => (s || '').trim().toLowerCase();

    const insumosNormalizados = (resultado.insumos || []).map(it => {
      const match = todosInsumos.find(i => norm(i.nome) === norm(it.nome) || norm(i.nome).includes(norm(it.nome)) || norm(it.nome).includes(norm(i.nome)));
      let precoItem = match ? match.preco : Number(it.preco);
      const itemLower = norm(it.nome);

      // Se for material sugerido e não cadastrado, garantir preço de mercado unitário realista
      if (!match && (!precoItem || precoItem <= 0)) {
        if (itemLower.includes('bronze')) precoItem = 85.0;
        else if (itemLower.includes('316')) precoItem = 75.0;
        else if (itemLower.includes('inox') || itemLower.includes('304')) precoItem = 55.0;
        else if (itemLower.includes('4340')) precoItem = 48.0;
        else if (itemLower.includes('4140') || itemLower.includes('liga')) precoItem = 38.0;
        else if (itemLower.includes('d2') || itemLower.includes('ferramenta') || itemLower.includes('vc131') || itemLower.includes('vnd')) precoItem = 95.0;
        else if (itemLower.includes('aluminio') || itemLower.includes('alumínio')) precoItem = 50.0;
        else if (itemLower.includes('nylon') || itemLower.includes('poliacetal') || itemLower.includes('pom') || itemLower.includes('teflon')) precoItem = 45.0;
        else if (itemLower.includes('ferro fundido') || itemLower.includes('nodular')) precoItem = 28.0;
        else if (itemLower.includes('1045') || itemLower.includes('1020') || itemLower.includes('carbono')) precoItem = 25.0;
        else if (itemLower.includes('eletrodo')) precoItem = 28.0;
        else if (itemLower.includes('óleo') || itemLower.includes('oleo')) precoItem = 13.5;
        else if (itemLower.includes('cimento') || itemLower.includes('cementação') || itemLower.includes('pó')) precoItem = 100.0;
        else precoItem = 25.0;
      }

      // Inferência inteligente de unidade de medida caso venha ausente ou genérica
      let unidFinal = match ? match.unidade : (it.unidade || '').trim().toUpperCase();
      if (!unidFinal || unidFinal === 'UN') {
        if (itemLower.includes('aço') || itemLower.includes('barra') || itemLower.includes('tarugo') || itemLower.includes('bronze') || itemLower.includes('eletrodo') || itemLower.includes('chapa') || itemLower.includes('pó')) {
          unidFinal = 'KG';
        } else if (itemLower.includes('inserto') || itemLower.includes('pastilha') || itemLower.includes('disco') || itemLower.includes('broca') || itemLower.includes('fresa') || itemLower.includes('macho') || itemLower.includes('parafuso')) {
          unidFinal = 'PÇ';
        } else if (itemLower.includes('óleo') || itemLower.includes('oleo') || itemLower.includes('tinta') || itemLower.includes('líquido') || itemLower.includes('liquido')) {
          unidFinal = 'L';
        } else if (itemLower.includes('corte') || itemLower.includes('fita') || itemLower.includes('gás') || itemLower.includes('gas')) {
          unidFinal = 'MIN';
        } else {
          unidFinal = unidFinal || 'UN';
        }
      }

      const qtdFinal = Number(it.qtd || it.quantidade || 1);

      return {
        nome: match ? match.nome : it.nome,
        qtd: qtdFinal,
        unidade: unidFinal,
        preco: Number(precoItem.toFixed(4)),
        subtotal: Number((qtdFinal * precoItem).toFixed(2))
      };
    });

    let ordemSeq = 1;
    const operacoesNormalizadas = (resultado.operacoes || []).map((op, idx) => {
      const opNome = norm(op.maquina || op.nome);
      // Busca exata ou por inclusão
      let match = todasMaquinas.find(m => norm(m.nome) === opNome || norm(m.id) === opNome);
      if (!match) {
        match = todasMaquinas.find(m => norm(m.nome).includes(opNome) || opNome.includes(norm(m.nome)));
      }
      if (!match && opNome) {
        // Busca por modelo ou palavra-chave específica
        if (opNome.includes('cw800') || opNome.includes('pesado') || opNome.includes('4000') || opNome.includes('800')) {
          match = todasMaquinas.find(m => m.id === 'maq_torno_800_4000');
        } else if (opNome.includes('romi i40') || opNome.includes('i40-a') || opNome.includes('650 x 2200')) {
          match = todasMaquinas.find(m => m.id === 'maq_torno_650_2200_romi');
        } else if (opNome.includes('plaina') || opNome.includes('limadora') || opNome.includes('rasgo interno') || opNome.includes('zocca')) {
          match = todasMaquinas.find(m => m.id === 'maq_plaina_limadora');
        } else if (opNome.includes('mandrilhadora') || opNome.includes('cwc') || opNome.includes('fuso 80') || opNome.includes('warszawa')) {
          match = todasMaquinas.find(m => m.id === 'maq_mandrilhadora');
        } else if (opNome.includes('retífica cilíndrica') || opNome.includes('retifica cilindrica') || opNome.includes('ruap')) {
          match = todasMaquinas.find(m => m.id === 'maq_retifica_cilindrica');
        } else if (opNome.includes('retífica plana') || opNome.includes('retifica plana') || opNome.includes('ferdmat')) {
          match = todasMaquinas.find(m => m.id === 'maq_retifica_plana');
        } else if (opNome.includes('cincinnati') || opNome.includes('arrow') || opNome.includes('4º eixo')) {
          match = todasMaquinas.find(m => m.id === 'maq_cnc_cincinnati');
        } else if (opNome.includes('discovery') || opNome.includes('romi 760')) {
          match = todasMaquinas.find(m => m.id === 'maq_cnc_romi');
        } else if (opNome.includes('cnc logic') || opNome.includes('torno cnc')) {
          match = todasMaquinas.find(m => m.id === 'maq_torno_cnc');
        } else if (opNome.includes('universal') && opNome.includes('engrenagem') || opNome.includes('natal')) {
          match = todasMaquinas.find(m => m.id === 'maq_fresadora_universal');
        } else if (opNome.includes('ferramenteira') || opNome.includes('zx6332')) {
          match = todasMaquinas.find(m => m.id === 'maq_fresadora_ferramenteira');
        } else if (opNome.includes('furadeira radial') || opNome.includes('fnr') || opNome.includes('radial 60')) {
          match = todasMaquinas.find(m => m.id === 'maq_furadeira_radial');
        } else if (opNome.includes('forno') || opNome.includes('têmpera') || opNome.includes('cementação') || opNome.includes('mufla')) {
          match = todasMaquinas.find(m => m.id === 'maq_forno_horizontal');
        } else if (opNome.includes('serra fita') || opNome.includes('ronemak') || opNome.includes('serra')) {
          match = todasMaquinas.find(m => m.id === 'maq_serra_fita_horiz');
        } else if (opNome.includes('solda') || opNome.includes('mig') || opNome.includes('eletrodo')) {
          match = todasMaquinas.find(m => m.id === 'maq_solda_mig_tig_eletr');
        } else if (opNome.includes('prensa')) {
          match = todasMaquinas.find(m => m.id === 'maq_prensa_180t');
        } else if (opNome.includes('plasma') || opNome.includes('maçarico') || opNome.includes('oxicorte')) {
          match = todasMaquinas.find(m => m.id === 'maq_corte_plasma');
        } else if (opNome.includes('jateamento')) {
          match = todasMaquinas.find(m => m.id === 'maq_jateamento');
        } else if (opNome.includes('bancada') || opNome.includes('manutenção') || opNome.includes('peritagem')) {
          match = todasMaquinas.find(m => m.id === 'maq_manutencao_bancada');
        } else if (opNome.includes('torno')) {
          match = todasMaquinas.find(m => m.id === 'maq_torno_650_2200_romi') || todasMaquinas[0];
        }
      }

      const regime = ['normal', 'h50', 'h100'].includes(op.regime) ? op.regime : 'normal';
      let valorHora = match ? match[regime] : (Number(op.valorHora) || 25.0);
      let multiplicador = 1.0; // match já possui taxa calculada para o regime
      if (!match) {
        multiplicador = regime === 'h50' ? 1.5 : regime === 'h100' ? 2.0 : 1.0;
      }
      const horas = Number(op.horas || op.horasEstimadas || 1);
      const peca = (op.peca && op.peca.trim()) ? op.peca.trim() : (resultado.ehConjuntoMultiPecas ? `Peça ${idx + 1}` : 'Peça Principal');
      const etapa = Number(op.etapa) || (idx + 1);
      const ordemProducao = Number(op.ordemProducao) || ordemSeq++;

      return {
        peca,
        etapa,
        ordemProducao,
        nome: match ? match.nome : (op.maquina || 'MÁQUINA/BANCADA'),
        descricao: op.descricao || 'Operação técnica de usinagem/manutenção',
        regime,
        horas,
        valorHora,
        subtotal: Number((horas * valorHora * (match ? 1 : multiplicador)).toFixed(2))
      };
    });

    // Ordena as operações respeitando a sequência cronológica global
    operacoesNormalizadas.sort((a, b) => (a.ordemProducao || 0) - (b.ordemProducao || 0));

    // Determina se é conjunto de múltiplas peças
    const pecasDistintas = [...new Set(operacoesNormalizadas.map(o => o.peca).filter(p => p && p !== 'Peça Principal'))];
    const ehConjunto = !!resultado.ehConjuntoMultiPecas || pecasDistintas.length > 1;

    let pecasFinais = resultado.pecas || [];
    if (ehConjunto && (!pecasFinais || pecasFinais.length === 0)) {
      const pecasMap = new Map();
      operacoesNormalizadas.forEach(op => {
        if (!pecasMap.has(op.peca)) {
          pecasMap.set(op.peca, {
            id: 'peca_' + (pecasMap.size + 1),
            nome: op.peca,
            material: resultado.materialDefinido || '',
            quantidade: 1,
            etapasProducao: []
          });
        }
        pecasMap.get(op.peca).etapasProducao.push(`${op.etapa}ª Etapa: ${op.nome} (${op.horas}h)`);
      });
      pecasFinais = Array.from(pecasMap.values());
    }

    return {
      ehConjuntoMultiPecas: ehConjunto,
      pecas: pecasFinais,
      materialDefinido: resultado.materialDefinido || '',
      materialOrigem: resultado.materialOrigem || 'catalogo',
      justificativaMaterial: resultado.justificativaMaterial || '',
      insumos: insumosNormalizados,
      operacoes: operacoesNormalizadas,
      moEscritorio: Number(resultado.moEscritorio || 0),
      observacoesTecnicas: resultado.observacoesTecnicas || 'Prévia gerada com base nos parâmetros padrão da oficina Nardelli.',
      diasEntregaEstimados: resultado.diasEntregaEstimados || 5
    };
  }

  /**
   * Gerador de Demonstração Offline com Seleção de Máquinas Baseada em Dimensões e Recursos
   */
  gerarPreviaSimulada(descricao, observacoes, setor, todosInsumos, todasMaquinas, extras = {}) {
    const {
      categoria = 'Usinagem Geral',
      quantidade = 1,
      prazo = '',
      material = '',
      tratamentoTermico = 'Nenhum',
      durezaDesejada = '',
      detalhesTermico = ''
    } = extras;

    const qtd = Math.max(1, Number(quantidade) || 1);
    const temTermico = tratamentoTermico && tratamentoTermico !== 'Nenhum';

    // Detecção prévia de múltiplas peças no texto
    const multiPecasInfo = this.detectarMultiplasPecas(descricao, categoria, observacoes);

    // Se o JEV identificou um caso similar anterior aprovado por humano E a solicitação atual NÃO for um conjunto de múltiplas peças
    if (!multiPecasInfo.ehConjuntoMultiPecas && extras.referenciaHistorica && extras.referenciaHistorica.maquinasAprovadas?.length > 0) {
      const ref = extras.referenciaHistorica;
      const refQtd = Math.max(1, Number(ref.quantidade) || 1);
      const fatorEscala = qtd / refQtd;

      const operacoesCalibradas = ref.maquinasAprovadas.map(m => {
        const hOrig = Number(m.horas) || 1;
        const horasCalculadas = Number((hOrig * (0.3 + 0.7 * fatorEscala)).toFixed(1)) || hOrig;
        const vHora = Number(m.valorHora) || 25.0;
        return {
          nome: m.nome || m.maquina,
          descricao: m.descricao ? `${m.descricao} (Calibrado com histórico #${ref.orcamentoNumero})` : `Operação calibrada com histórico #${ref.orcamentoNumero}`,
          regime: m.regime || 'normal',
          horas: horasCalculadas,
          valorHora: vHora,
          subtotal: Number((horasCalculadas * vHora).toFixed(2))
        };
      });

      const insumosCalibrados = (ref.insumosAprovados || []).map(i => {
        const qtdOrig = Number(i.qtd) || 1;
        const qtdCalculada = Number((qtdOrig * fatorEscala).toFixed(2)) || qtdOrig;
        const pUnit = Number(i.preco) || 15.0;
        return {
          nome: i.nome,
          qtd: qtdCalculada,
          unidade: i.unidade || 'UN',
          preco: pUnit,
          subtotal: Number((qtdCalculada * pUnit).toFixed(2))
        };
      });

      return {
        materialDefinido: ref.material || (material ? material : 'Aço Conforme Histórico'),
        materialOrigem: 'referencia_historica_jev',
        justificativaMaterial: `Matéria-prima e processos calibrados a partir do Orçamento #${ref.orcamentoNumero} validado pela equipe técnica.`,
        insumos: insumosCalibrados,
        operacoes: operacoesCalibradas,
        moEscritorio: 0,
        observacoesTecnicas: `🎯 [Aprendizado Ativo JEV] Calibrado com base no Orçamento #${ref.orcamentoNumero} (${(ref.descricao || '').slice(0, 65)}). ${ref.motivoJev || ''}${ref.ajustesPrevios ? ` | Calibrações prévias: ${ref.ajustesPrevios}` : ''}`,
        diasEntregaEstimados: Math.max(3, Math.min(15, Math.ceil(4 + 1.5 * qtd)))
      };
    }

    const text = (descricao + ' ' + (observacoes || '') + ' ' + categoria + ' ' + material + ' ' + (tratamentoTermico || '')).toLowerCase();

    // Extração de dimensões aproximadas do texto para decisão de engenharia
    const matchComprimento = text.match(/(\d+)\s*(mm|m)\b/) || text.match(/x\s*(\d+)\s*mm/);
    const matchDiametro = text.match(/ø\s*(\d+)/) || text.match(/diametro\s*(\d+)/) || text.match(/diâmetro\s*(\d+)/);

    let comprimentoMm = 0;
    let diametroMm = 0;

    if (matchComprimento) {
      comprimentoMm = Number(matchComprimento[1]);
      if (matchComprimento[2] === 'm') comprimentoMm *= 1000;
    }
    if (matchDiametro) {
      diametroMm = Number(matchDiametro[1]);
    }

    // Verificação de Múltiplas Peças Fabricadas Juntas (Conjunto Mecânico Industrial)
    if (multiPecasInfo.ehConjuntoMultiPecas) {
      const operacoesMulti = [];
      const insumosMulti = [];
      let ordemGlobal = 1;

      // Cenário 1: Eixo e Buchas
      if (text.includes('eixo') && (text.includes('bucha') || text.includes('mancal'))) {
        const pecaEixo = multiPecasInfo.pecasIdentificadas.find(p => p.tipo === 'eixo') || { nome: 'Eixo Usinado de Precisão', quantidade: 1 };
        const pecaBucha = multiPecasInfo.pecasIdentificadas.find(p => p.tipo === 'bucha') || { nome: 'Buchas de Deslizamento', quantidade: 2 };

        // 1. ROTEIRO DA PEÇA 1: EIXO
        operacoesMulti.push({
          peca: pecaEixo.nome,
          etapa: 1,
          ordemProducao: ordemGlobal++,
          nome: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)",
          descricao: `Corte de tarugo bruto em Aço Liga SAE 4140 para o ${pecaEixo.nome} com sobremetal`,
          regime: "normal",
          horas: Number((0.5 * pecaEixo.quantidade).toFixed(1)),
          valorHora: 20.73,
          subtotal: Number((0.5 * pecaEixo.quantidade * 20.73).toFixed(2))
        });

        const tornoEixo = (comprimentoMm > 2200 || diametroMm > 650)
          ? "Torno Pesado Universal Ø800 x 4000mm (TIMEMASTER CW800)"
          : "Torno Mecânico Universal Ø650 x 2200mm (ROMI I40-A)";
        const taxaTornoEixo = (comprimentoMm > 2200 || diametroMm > 650) ? 31.00 : 23.96;

        operacoesMulti.push({
          peca: pecaEixo.nome,
          etapa: 2,
          ordemProducao: ordemGlobal++,
          nome: tornoEixo,
          descricao: `Setup em placa 4 castanhas, desbaste cilíndrico dos diâmetros e colos do ${pecaEixo.nome}`,
          regime: "normal",
          horas: Number((1.5 + 1.2 * pecaEixo.quantidade).toFixed(1)),
          valorHora: taxaTornoEixo,
          subtotal: Number(((1.5 + 1.2 * pecaEixo.quantidade) * taxaTornoEixo).toFixed(2))
        });

        operacoesMulti.push({
          peca: pecaEixo.nome,
          etapa: 3,
          ordemProducao: ordemGlobal++,
          nome: "Fresadora Ferramenteira Universal 1370x320mm (VIRTUAL ZX6332B)",
          descricao: `Fresamento de rasgos de chaveta padronizados DIN 6885 no ${pecaEixo.nome}`,
          regime: "normal",
          horas: Number((0.8 * pecaEixo.quantidade).toFixed(1)),
          valorHora: 23.88,
          subtotal: Number((0.8 * pecaEixo.quantidade * 23.88).toFixed(2))
        });

        operacoesMulti.push({
          peca: pecaEixo.nome,
          etapa: 4,
          ordemProducao: ordemGlobal++,
          nome: "Retífica Cilíndrica Universal Ø360 x 750mm (SULMECÂNICA RUAP 750)",
          descricao: `Retífica cilíndrica centesimal dos colos do ${pecaEixo.nome} com tolerância ISO h6`,
          regime: "normal",
          horas: Number((1.0 * pecaEixo.quantidade).toFixed(1)),
          valorHora: 24.96,
          subtotal: Number((1.0 * pecaEixo.quantidade * 24.96).toFixed(2))
        });

        // 2. ROTEIRO DA PEÇA 2: BUCHAS
        operacoesMulti.push({
          peca: pecaBucha.nome,
          etapa: 1,
          ordemProducao: ordemGlobal++,
          nome: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)",
          descricao: `Corte de ${pecaBucha.quantidade} tarugo(s) de Bronze TM-23 para as buchas`,
          regime: "normal",
          horas: Number((0.3 * pecaBucha.quantidade).toFixed(1)),
          valorHora: 20.73,
          subtotal: Number((0.3 * pecaBucha.quantidade * 20.73).toFixed(2))
        });

        operacoesMulti.push({
          peca: pecaBucha.nome,
          etapa: 2,
          ordemProducao: ordemGlobal++,
          nome: "Torno Mecânico Universal Ø650 x 2200mm (ROMI I40-A)",
          descricao: `Torneamento externo, furação concêntrica, mandrilhamento interno e canal de lubrificação (${pecaBucha.quantidade} pçs)`,
          regime: "normal",
          horas: Number((1.0 + 0.8 * pecaBucha.quantidade).toFixed(1)),
          valorHora: 23.96,
          subtotal: Number(((1.0 + 0.8 * pecaBucha.quantidade) * 23.96).toFixed(2))
        });

        // 3. ROTEIRO DO CONJUNTO: MONTAGEM E AJUSTE FINAL
        operacoesMulti.push({
          peca: "Montagem e Ajuste Final",
          etapa: 1,
          ordemProducao: ordemGlobal++,
          nome: "Manutenção Mecânica / Bancada / Peritagem",
          descricao: `Ajuste e montagem de acoplamento das buchas no eixo, conferência de folga centesimal com relógio comparador e proteção anticorrosiva`,
          regime: "normal",
          horas: 1.2,
          valorHora: 17.43,
          subtotal: 20.92
        });

        // Insumos separados por peça
        insumosMulti.push({
          nome: "BARRA REDONDA AÇO LIGA SAE 4140 BENEFICIADO",
          qtd: Number((16.0 * pecaEixo.quantidade).toFixed(1)),
          unidade: "KG",
          preco: 38.0,
          subtotal: Number((16.0 * pecaEixo.quantidade * 38.0).toFixed(2))
        });
        insumosMulti.push({
          nome: "BUCHA / TARUGO BRONZE TM-23 SAE 660",
          qtd: Number((6.0 * pecaBucha.quantidade).toFixed(1)),
          unidade: "KG",
          preco: 85.0,
          subtotal: Number((6.0 * pecaBucha.quantidade * 85.0).toFixed(2))
        });
        insumosMulti.push({
          nome: "INSERTO TORNEAMENTO TNMG 220408-TF IC907",
          qtd: 60,
          unidade: "MIN",
          preco: 0.1667,
          subtotal: 10.00
        });
        insumosMulti.push({
          nome: "ÓLEO PROTETIVO DESAGUANTE",
          qtd: 100,
          unidade: "ML",
          preco: 0.009,
          subtotal: 0.90
        });

        return {
          ehConjuntoMultiPecas: true,
          pecas: multiPecasInfo.pecasIdentificadas,
          materialDefinido: "Aço Liga SAE 4140 + Bronze TM-23",
          materialOrigem: "sugerido_ideal",
          justificativaMaterial: "Conjunto mecânico composto por Eixo em Aço Liga 4140 Beneficiado (alta resistência torcional) e Buchas em Bronze TM-23 (antifricção e deslizamento ideal).",
          insumos: insumosMulti,
          operacoes: operacoesMulti,
          moEscritorio: 0,
          observacoesTecnicas: `🧩 [Conjunto de Múltiplas Peças] Roteiro ordenado sequencialmente para cada componente (Eixo, Buchas e Montagem final em bancada).`,
          diasEntregaEstimados: 7
        };
      } else {
        // Cenário 2: Outros conjuntos com 2 ou mais peças
        multiPecasInfo.pecasIdentificadas.forEach((peca) => {
          if (peca.id === 'montagem_final') {
            operacoesMulti.push({
              peca: peca.nome,
              etapa: 1,
              ordemProducao: ordemGlobal++,
              nome: "Manutenção Mecânica / Bancada / Peritagem",
              descricao: `Montagem e ajuste dimensional dos componentes fabricados juntos, checagem dimensional e acabamento final`,
              regime: "normal",
              horas: 1.0,
              valorHora: 17.43,
              subtotal: 17.43
            });
          } else {
            operacoesMulti.push({
              peca: peca.nome,
              etapa: 1,
              ordemProducao: ordemGlobal++,
              nome: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)",
              descricao: `Corte de matéria-prima bruta para ${peca.nome}`,
              regime: "normal",
              horas: 0.5,
              valorHora: 20.73,
              subtotal: 10.37
            });
            operacoesMulti.push({
              peca: peca.nome,
              etapa: 2,
              ordemProducao: ordemGlobal++,
              nome: "Torno Mecânico Universal Ø650 x 2200mm (ROMI I40-A)",
              descricao: `Usinagem de desbaste e conformação dimensional de ${peca.nome}`,
              regime: "normal",
              horas: 1.8,
              valorHora: 23.96,
              subtotal: 43.13
            });
            insumosMulti.push({
              nome: peca.materialSugerido?.includes('Bronze') ? "BUCHA / TARUGO BRONZE TM-23 SAE 660" : "BARRA REDONDA AÇO 1045",
              qtd: 8.0,
              unidade: "KG",
              preco: peca.materialSugerido?.includes('Bronze') ? 85.0 : 25.0,
              subtotal: peca.materialSugerido?.includes('Bronze') ? 680.0 : 200.0
            });
          }
        });

        insumosMulti.push({
          nome: "INSERTO TORNEAMENTO TNMG 220408-TF IC907",
          qtd: 45,
          unidade: "MIN",
          preco: 0.1667,
          subtotal: 7.50
        });

        return {
          ehConjuntoMultiPecas: true,
          pecas: multiPecasInfo.pecasIdentificadas,
          materialDefinido: "Aços e Ligas Específicas por Componente",
          materialOrigem: "sugerido_ideal",
          justificativaMaterial: "Matérias-primas dimensionadas de acordo com a função mecânica de cada peça do conjunto.",
          insumos: insumosMulti,
          operacoes: operacoesMulti,
          moEscritorio: 0,
          observacoesTecnicas: `🧩 [Conjunto de Múltiplas Peças] Roteiro de fabricação gerado com ordenação de etapas por componente.`,
          diasEntregaEstimados: 6
        };
      }
    }

    // Se o serviço é solda/caldeiraria
    if (setor === 'CALDEIRARIA_SOLDA' || text.includes('solda') || text.includes('caldeiraria')) {
      const operacoesSolda = [
        {
          nome: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)",
          descricao: "Corte das barras e perfis brutos no esquadro com sobremetal",
          regime: "normal",
          horas: Number((0.6 + 0.4 * qtd).toFixed(1)),
          valorHora: 20.73,
          subtotal: Number(((0.6 + 0.4 * qtd) * 20.73).toFixed(2))
        },
        {
          nome: "Soldagem MIG/MAG 440A, TIG e Eletrodo (ESAB EM 455i)",
          descricao: "Ponteamento, soldagem contínua em chanfro estrutural e desbaste de escória",
          regime: "normal",
          horas: Number((1.5 * qtd).toFixed(1)),
          valorHora: 29.09,
          subtotal: Number(((1.5 * qtd) * 29.09).toFixed(2))
        },
        {
          nome: "Manutenção Mecânica / Bancada / Peritagem",
          descricao: "Acabamento de solda, esquadrejamento, controle dimensional e pintura técnica protetiva",
          regime: "normal",
          horas: Number((1.0 * qtd).toFixed(1)),
          valorHora: 17.43,
          subtotal: Number(((1.0 * qtd) * 17.43).toFixed(2))
        }
      ];

      if (temTermico) {
        operacoesSolda.push({
          nome: "Forno Elétrico de Tratamento Térmico até 1050°C (SANCHIS Mufla Industrial)",
          descricao: `Tratamento térmico de ${tratamentoTermico}: alívio de tensões pós-soldagem com patamar térmico de 600°C e resfriamento lento em forno`,
          regime: "normal",
          horas: 3.5,
          valorHora: 42.95,
          subtotal: Number((3.5 * 42.95).toFixed(2))
        });
        operacoesSolda.push({
          nome: "Jateamento Abrasivo e Acabamento Superficial",
          descricao: "Jateamento com microesferas abrasivas para remoção de carepas e limpeza para pintura",
          regime: "normal",
          horas: 0.8,
          valorHora: 20.00,
          subtotal: 16.00
        });
      }

      return {
        insumos: [
          { nome: "ELETRODO CONARCO 7018 1/8\"", qtd: 3.0 * qtd, unidade: "KG", preco: 28.0, subtotal: 84.0 * qtd },
          { nome: "DISCO DE CORTE 7\" TYROLIT", qtd: Math.max(2, 1 * qtd), unidade: "PÇ", preco: 5.5, subtotal: 5.5 * Math.max(2, 1 * qtd) },
          { nome: "DISCO DESBASTE 7\" TYROLIT", qtd: Math.max(1, 1 * qtd), unidade: "PÇ", preco: 14.5, subtotal: 14.5 * Math.max(1, 1 * qtd) },
          { nome: "GÁS GLP + OXIGÊNIO", qtd: 20 * qtd, unidade: "MIN", preco: 0.4569, subtotal: Number((20 * qtd * 0.4569).toFixed(2)) },
          { nome: "TINTA ESMALTE INDUSTRIAL", qtd: 1, unidade: "LITRO", preco: 50.0, subtotal: 50.0 }
        ],
        operacoes: operacoesSolda,
        moEscritorio: 0,
        observacoesTecnicas: "Processo qualificado de caldeiraria e soldagem estrutural com consumíveis homologados.",
        diasEntregaEstimados: temTermico ? 7 : 4
      };
    }

    // Usinagem mecânica: seleção por dimensão
    let tornoEscolhido = "Torno Mecânico Universal Ø650 x 2200mm (ROMI I40-A)";
    let taxaTorno = 23.96;

    // Se peça grande (L > 2200mm ou Ø > 650mm)
    if (comprimentoMm > 2200 || diametroMm > 650 || text.includes('pesado') || text.includes('grande')) {
      tornoEscolhido = "Torno Pesado Universal Ø800 x 4000mm (TIMEMASTER CW800)";
      taxaTorno = 31.00;
    } else if (diametroMm > 0 && diametroMm <= 400 && comprimentoMm > 0 && comprimentoMm <= 1000) {
      tornoEscolhido = "Torno Universal Ø400 x 1000mm (IMOR PRN 320)";
      taxaTorno = 23.96;
    }

    // Horas de torno: setup inicial (1.0h) + usinagem por peça (1.5h * qtd)
    const horasTorno = Number((1.0 + 1.5 * qtd).toFixed(1));

    const operacoes = [
      {
        nome: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)",
        descricao: `Corte de ${qtd} tarugo(s) de matéria-prima (${material}) com sobremetal de 10mm para faceamento`,
        regime: "normal",
        horas: Number((0.4 + 0.3 * qtd).toFixed(1)),
        valorHora: 20.73,
        subtotal: Number(((0.4 + 0.3 * qtd) * 20.73).toFixed(2))
      },
      {
        nome: tornoEscolhido,
        descricao: `Setup em placa 4 castanhas, centragem com relógio comparador, desbaste cilíndrico e torneamento de precisão (${qtd} pçs)`,
        regime: "normal",
        horas: horasTorno,
        valorHora: taxaTorno,
        subtotal: Number((horasTorno * taxaTorno).toFixed(2))
      }
    ];

    // Se tiver rasgo de chaveta interno (polia, cubo, engrenagem)
    if (text.includes('interno') || text.includes('polia') || text.includes('cubo') || text.includes('engrenagem') || categoria.toLowerCase().includes('polia') || categoria.toLowerCase().includes('engrenagem')) {
      const horasPlaina = Number((0.5 + 0.5 * qtd).toFixed(1));
      operacoes.push({
        nome: "Plaina Limadora 650mm para Rasgos Internos (ZOCCA 650)",
        descricao: `Abertura de rasgo de chaveta interno padronizado DIN 6885 com bedame retificado (${qtd} pçs)`,
        regime: "normal",
        horas: horasPlaina,
        valorHora: 21.84,
        subtotal: Number((horasPlaina * 21.84).toFixed(2))
      });
    } else if (text.includes('chaveta') || text.includes('rasgo')) {
      const horasFresa = Number((0.5 + 0.5 * qtd).toFixed(1));
      operacoes.push({
        nome: "Fresadora Ferramenteira Universal 1370x320mm (VIRTUAL ZX6332B)",
        descricao: `Fresamento de rasgo de chaveta externo com fresa de topo de metal duro (${qtd} pçs)`,
        regime: "normal",
        horas: horasFresa,
        valorHora: 23.88,
        subtotal: Number((horasFresa * 23.88).toFixed(2))
      });
    }

    // Se tiver tratamento térmico solicitado
    if (temTermico) {
      const horasForno = qtd > 5 ? 4.5 : 3.0;
      const descForno = `Tratamento térmico de ${tratamentoTermico}: rampa gradual até 860°C, patamar de austenitização de 90min, resfriamento controlado e revenimento a 220°C para dureza ${durezaDesejada || '55-60 HRC'}${detalhesTermico ? ' (' + detalhesTermico + ')' : ''}`;
      
      operacoes.push({
        nome: "Forno Elétrico de Tratamento Térmico até 1050°C (SANCHIS Mufla Industrial)",
        descricao: descForno,
        regime: "normal",
        horas: horasForno,
        valorHora: 42.95,
        subtotal: Number((horasForno * 42.95).toFixed(2))
      });

      const horasJato = Number((0.4 + 0.3 * qtd).toFixed(1));
      operacoes.push({
        nome: "Jateamento Abrasivo e Acabamento Superficial",
        descricao: `Jateamento com microesferas abrasivas para decapagem de carepas de oxidação pós-forno (${qtd} pçs)`,
        regime: "normal",
        horas: horasJato,
        valorHora: 20.00,
        subtotal: Number((horasJato * 20.00).toFixed(2))
      });
    }

    // Se tiver sede de rolamento ou tolerância h6/h7
    if (text.includes('rolamento') || text.includes('h6') || text.includes('h7') || text.includes('retifica') || text.includes('retífica')) {
      const horasRet = Number((0.5 + 0.8 * qtd).toFixed(1));
      operacoes.push({
        nome: "Retífica Cilíndrica Universal Ø360 x 750mm (SULMECÂNICA RUAP 750)",
        descricao: `Retificação centesimal dos colos com tolerância ISO h6 e rugosidade Ra 0.4 (${qtd} pçs)`,
        regime: "normal",
        horas: horasRet,
        valorHora: 24.96,
        subtotal: Number((horasRet * 24.96).toFixed(2))
      });
    }

    // Bancada de acabamento e controle dimensional
    const horasBancada = Number((0.4 + 0.3 * qtd).toFixed(1));
    operacoes.push({
      nome: "Manutenção Mecânica / Bancada / Peritagem",
      descricao: `Rebarbação, controle dimensional rigoroso com micrômetro externo e aplicação de óleo desaguante protetivo (${qtd} pçs)`,
      regime: "normal",
      horas: horasBancada,
      valorHora: 17.43,
      subtotal: Number((horasBancada * 17.43).toFixed(2))
    });

    // Decisão e Sugestão de Matéria-Prima Ideal
    const materialCliente = material && material.trim() && !material.toLowerCase().includes('definir pela ia');
    let materialDefinido = '';
    let materialOrigem = 'catalogo';
    let justificativaMaterial = '';
    let nomeMaterial = 'B. RED. AÇO 1045 Ø1"X75MM (ACB. Ø24,95X70MM)';
    let precoKg = 25.0;
    let pesoPorPecaKg = 2.0;

    if (materialCliente) {
      materialDefinido = material;
      materialOrigem = 'cliente';
      justificativaMaterial = `Matéria-prima especificada diretamente pelo cliente: ${material}.`;
      if (material.includes('4140') || material.includes('4340') || material.includes('Liga')) {
        nomeMaterial = 'BARRA REDONDA AÇO LIGA SAE 4140 BENEFICIADO';
        precoKg = 38.0;
      } else if (material.includes('Inox') || material.includes('304') || material.includes('316')) {
        nomeMaterial = material.includes('316') ? 'BARRA REDONDA INOX AISI 316L' : 'BARRA REDONDA INOX AISI 304';
        precoKg = material.includes('316') ? 75.0 : 55.0;
      } else if (material.includes('Bronze')) {
        nomeMaterial = 'BUCHA / TARUGO BRONZE TM-23 SAE 660';
        precoKg = 85.0;
      } else if (material.includes('Ferro Fundido')) {
        nomeMaterial = 'TARUGO FERRO FUNDIDO NODULAR FE 50007';
        precoKg = 28.0;
      } else if (material.includes('D2') || material.includes('Ferramenta')) {
        nomeMaterial = 'BLOCO / TARUGO AÇO FERRAMENTA D2 (VC131)';
        precoKg = 95.0;
      } else if (material.includes('Alumínio') || material.includes('Aluminio')) {
        nomeMaterial = 'BARRA REDONDA ALUMÍNIO 6061-T6';
        precoKg = 50.0;
      } else if (material.includes('Nylon') || material.includes('Poliacetal')) {
        nomeMaterial = 'TARUGO REDONDO POLIACETAL (POM) INDUSTRIAL';
        precoKg = 45.0;
      } else {
        nomeMaterial = 'B. RED. AÇO 1045 Ø1"X75MM (ACB. Ø24,95X70MM)';
        precoKg = 25.0;
      }
    } else {
      // IA define com base na engenharia e aplicação da peça
      if (text.includes('bucha') || text.includes('mancal') || text.includes('deslizamento') || text.includes('atrito') || text.includes('bronze')) {
        materialDefinido = 'Bronze TM-23 (SAE 660)';
        justificativaMaterial = 'Para buchas e mancais de deslizamento, o Bronze TM-23 (SAE 660) é a matéria-prima ideal devido às suas excelentes propriedades antifricção, autolubrificação e resistência ao desgaste contínuo.';
        nomeMaterial = 'BUCHA / TARUGO BRONZE TM-23 SAE 660';
        precoKg = 85.0;
        pesoPorPecaKg = 2.2;
      } else if (text.includes('engrenag') || text.includes('pinhão') || text.includes('pinhao') || text.includes('coroa') || text.includes('eixo motriz') || text.includes('estriado') || (temTermico && (durezaDesejada.toLowerCase().includes('hrc') || text.includes('têmpera') || text.includes('tempera')))) {
        if (tratamentoTermico.toLowerCase().includes('cement')) {
          materialDefinido = 'Aço Liga SAE 8620 (Para Cementação)';
          justificativaMaterial = 'Para engrenagens e peças que passam por cementação, o Aço SAE 8620 permite atingir alta dureza superficial com núcleo tenaz, absorvendo impactos severos sem fratura.';
          nomeMaterial = 'BARRA REDONDA AÇO LIGA SAE 8620';
          precoKg = 36.0;
        } else {
          materialDefinido = 'Aço Liga SAE 4140 Beneficiado';
          justificativaMaterial = 'Para eixos de transmissão de alta rotação e engrenagens submetidas a esforços de torção e flexão, o Aço Liga SAE 4140 beneficiado oferece superior resistência à fadiga e limite de escoamento muito superior ao aço carbono comum.';
          nomeMaterial = 'BARRA REDONDA AÇO LIGA SAE 4140 BENEFICIADO';
          precoKg = 38.0;
        }
        pesoPorPecaKg = 2.5;
      } else if (text.includes('inox') || text.includes('corros') || text.includes('alimento') || text.includes('quimic') || text.includes('marin') || text.includes('vapor')) {
        const quer316 = text.includes('316') || text.includes('marinho') || text.includes('acido') || text.includes('ácido');
        materialDefinido = quer316 ? 'Aço Inox AISI 316L' : 'Aço Inox AISI 304';
        justificativaMaterial = `Para trabalho em contato com fluidos agressivos ou risco de oxidação, o ${materialDefinido} assegura máxima passivação e resistência à corrosão intergranular.`;
        nomeMaterial = quer316 ? 'BARRA REDONDA INOX AISI 316L' : 'BARRA REDONDA INOX AISI 304';
        precoKg = quer316 ? 75.0 : 55.0;
      } else if (text.includes('matriz') || text.includes('faca') || text.includes('estampo') || text.includes('punção') || text.includes('puncao') || text.includes('navalha')) {
        materialDefinido = 'Aço Ferramenta VC131 / D2';
        justificativaMaterial = 'Para ferramentas de corte e conformação, o Aço Ferramenta D2 (alto carbono e alto cromo) proporciona retenção de fio duradoura e resistência extrema ao desgaste por abrasão.';
        nomeMaterial = 'BLOCO / TARUGO AÇO FERRAMENTA D2 (VC131)';
        precoKg = 95.0;
      } else if (text.includes('carcaça') || text.includes('carcaca') || text.includes('fundido') || text.includes('volante') || (text.includes('polia') && (text.includes('pesada') || text.includes('grande')))) {
        materialDefinido = 'Ferro Fundido Nodular FE 50007';
        justificativaMaterial = 'O Ferro Fundido Nodular FE 50007 é a escolha indicada por combinar amortecimento vibracional com elevada resistência à tração e ductilidade superior ao ferro fundido cinzento.';
        nomeMaterial = 'TARUGO FERRO FUNDIDO NODULAR FE 50007';
        precoKg = 28.0;
      } else if (text.includes('alumínio') || text.includes('aluminio') || text.includes('leve')) {
        materialDefinido = 'Alumínio Estrutural 6061-T6';
        justificativaMaterial = 'O Alumínio 6061-T6 combina baixo peso específico com excelente usinabilidade e ótima resistência mecânica estrutural.';
        nomeMaterial = 'BARRA REDONDA ALUMÍNIO 6061-T6';
        precoKg = 50.0;
      } else if (text.includes('nylon') || text.includes('poliacetal') || text.includes('pom') || text.includes('teflon') || text.includes('polímero')) {
        materialDefinido = 'Poliacetal (POM) Industrial';
        justificativaMaterial = 'O Poliacetal oferece excelente estabilidade dimensional, baixo atrito e alta resistência ao impacto para componentes poliméricos de precisão.';
        nomeMaterial = 'TARUGO REDONDO POLIACETAL (POM) INDUSTRIAL';
        precoKg = 45.0;
      } else if (text.includes('solda') || text.includes('caldeiraria') || text.includes('estrutura') || text.includes('chapa') || text.includes('perfil')) {
        materialDefinido = 'Aço Carbono Estrutural SAE 1020';
        justificativaMaterial = 'Para união por solda e caldeiraria pesada, o Aço SAE 1020 tem soldabilidade excelente sem endurecimento frágil na zona termicamente afetada.';
        nomeMaterial = 'BARRA REDONDA AÇO CARBONO SAE 1020';
        precoKg = 22.0;
      } else {
        materialDefinido = 'Aço Carbono SAE 1045';
        justificativaMaterial = 'O Aço Carbono SAE 1045 é a matéria-prima padrão e mais equilibrada para eixos e peças usinadas industriais em geral, garantindo boa tenacidade e usinabilidade.';
        const item1045 = todosInsumos.find(i => (i.nome || '').includes('1045'));
        nomeMaterial = item1045 ? item1045.nome : 'B. RED. AÇO 1045 Ø1"X75MM (ACB. Ø24,95X70MM)';
        precoKg = item1045 ? item1045.preco : 25.0;
      }

      // Verifica se o material já consta no catálogo cadastrado
      const norm = s => (s || '').toLowerCase();
      const noCatalogo = todosInsumos.some(i => norm(i.nome).includes(norm(materialDefinido)) || norm(nomeMaterial) === norm(i.nome));
      materialOrigem = noCatalogo ? 'catalogo' : 'sugerido_ideal';
    }

    const insumos = [
      { nome: nomeMaterial, qtd: Number((pesoPorPecaKg * qtd).toFixed(1)), unidade: "KG", preco: precoKg, subtotal: Number((pesoPorPecaKg * qtd * precoKg).toFixed(2)) },
      { nome: "INSERTO TORNEAMENTO TNMG 220408-TF IC907", qtd: 45 * qtd, unidade: "MIN", preco: 0.1667, subtotal: Number((45 * qtd * 0.1667).toFixed(2)) },
      { nome: "INSERTO 2MM CORTE E CANAL INTERNO DGN 2002J IC908", qtd: 15 * qtd, unidade: "MIN", preco: 0.4167, subtotal: Number((15 * qtd * 0.4167).toFixed(2)) }
    ];

    if (temTermico) {
      if (tratamentoTermico.toLowerCase().includes('cement')) {
        insumos.push({
          nome: "PÓ PARA CEMENTAÇÃO",
          qtd: Number((1.5 * qtd).toFixed(1)),
          unidade: "KG",
          preco: 100.0,
          subtotal: Number((1.5 * qtd * 100.0).toFixed(2))
        });
      } else {
        insumos.push({
          nome: "ÓLEO TÊMPERA 1037/22L",
          qtd: Number((3.0 * qtd).toFixed(1)),
          unidade: "KG",
          preco: 13.33,
          subtotal: Number((3.0 * qtd * 13.33).toFixed(2))
        });
      }
    }

    insumos.push({
      nome: "ÓLEO PROTETIVO DESAGUANTE",
      qtd: 50 * qtd,
      unidade: "ML",
      preco: 0.009,
      subtotal: Number((50 * qtd * 0.009).toFixed(2))
    });

    const prazoNum = parseInt(prazo);
    const diasEstimados = !isNaN(prazoNum) ? prazoNum : (temTermico ? (qtd > 5 ? 10 : 7) : (qtd > 5 ? 6 : 4));

    const origemRotulo = materialOrigem === 'cliente'
      ? 'Especificada pelo cliente'
      : (materialOrigem === 'sugerido_ideal' ? 'Sugestão da IA - Matéria-prima ideal para a peça (não listada no catálogo)' : 'Selecionada do catálogo de insumos');

    return {
      materialDefinido,
      materialOrigem,
      justificativaMaterial,
      insumos,
      operacoes,
      moEscritorio: 0,
      observacoesTecnicas: `Proposta técnica Nardelli Usinagem. Lote de ${qtd} peça(s). Matéria-prima: ${materialDefinido} (${origemRotulo}). ${justificativaMaterial}${temTermico ? ' Tratamento térmico: ' + tratamentoTermico + (durezaDesejada ? ' (' + durezaDesejada + ')' : '') : ''}.`,
      diasEntregaEstimados: diasEstimados
    };
  }
}

module.exports = new AIService();
