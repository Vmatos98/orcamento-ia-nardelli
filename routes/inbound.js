const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const aiService = require('../services/aiService');
const chatbotService = require('../services/chatbotService');
const metaWhatsappService = require('../services/metaWhatsappService');

/**
 * ROTA DE ENTRADA DO CHATBOT (INBOUND WEBHOOK)
 * Esta rota foi desenhada especificamente para receber solicitações vindas de:
 * - Bots de WhatsApp (Typebot, Evolution API, Baileys, Z-API, n8n, etc.)
 * - Formulários de site ou chat de autoatendimento
 * 
 * O fluxo:
 * 1. O cliente conversa com o bot no WhatsApp e envia fotos/desenho e o que precisa
 * 2. O bot dispara um POST neste endpoint com os dados estruturados
 * 3. O sistema cria o orçamento com status "PENDENTE_REVISAO" e origem "chatbot"
 * 4. Opcionalmente já roda a prévia de IA (Jev + Claude 3.5 Sonnet)
 * 5. O funcionário da Nardelli vê na fila do dashboard, revisa, valida os custos e aprova!
 */
router.post('/chatbot', async (req, res) => {
  try {
    const {
      cliente,
      descricao,
      observacoes,
      arquivos = [],
      origem = 'chatbot_whatsapp',
      processarComIA = true,
      prazoSolicitado,
      quantidade = 1,
      unidade = 'PÇ',
      material = '',
      tratamentoTermico = 'Nenhum',
      possuiModelagem3D = false,
      incluirModelagem3D = false,
      detalhesModelagem3D = '',
      conversaId
    } = req.body;

    if (!descricao || descricao.trim() === '') {
      return res.status(400).json({
        sucesso: false,
        erro: 'O campo "descricao" do serviço/peça é obrigatório.'
      });
    }

    const config = dbService.getConfig();
    const qtdFinal = Math.max(1, Number(quantidade) || 1);
    const unidFinal = (unidade || 'PÇ').toUpperCase();

    // 1. Monta o objeto base do orçamento recebido
    const novoOrcamento = {
      id: 'orc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      origem: 'chatbot',
      canalOrigem: origem,
      status: 'PENDENTE_REVISAO',
      visualizado: false,
      dataCriacao: new Date().toISOString(),
      cliente: {
        nome: cliente?.nome || 'Cliente via Chatbot',
        tel: cliente?.tel || cliente?.telefone || '',
        email: cliente?.email || '',
        endereco: cliente?.endereco || '',
        contato: cliente?.contato || cliente?.nome || ''
      },
      descricaoServico: descricao,
      quantidadePecas: qtdFinal,
      unidadePeca: unidFinal,
      materialPeca: material || '',
      tratamentoTermico: tratamentoTermico || 'Nenhum',
      possuiModelagem3D: !!possuiModelagem3D,
      incluirModelagem3D: !!incluirModelagem3D,
      detalhesModelagem3D: detalhesModelagem3D || '',
      observacoes: observacoes ? `${observacoes}${prazoSolicitado ? ` | Prazo desejado: ${prazoSolicitado}` : ''}` : (prazoSolicitado ? `Prazo desejado: ${prazoSolicitado}` : ''),
      arquivos: arquivos.map((a, idx) => ({
        id: 'arq_' + idx,
        nome: a.nome || `anexo_${idx + 1}.jpg`,
        tipo: a.tipo || a.mediaType || 'image/jpeg',
        url: a.url || '',
        base64: a.base64 || ''
      })),
      itensInsumo: [],
      itensMaquina: [],
      moEscritorio: 40.0,
      frete: { distKm: 0, viagens: 1, pecas: qtdFinal, valorTotal: 0 },
      parcelamento: { prazoMeses: 0 },
      analiseIA: null,
      totais: {
        totalInsumos: 0,
        valorInsumoComMargem: 0,
        totalMO: 0,
        valorMOComMargem: 0,
        freteTotal: 0,
        semDesconto: 0,
        comDesconto: 0,
        precoAPrazo: 0,
        totalFinal: 0
      }
    };

    // 2. Se configurado para gerar a prévia com IA automaticamente
    if (processarComIA) {
      try {
        const resultadoIA = await aiService.gerarPreviaOrcamento({
          descricao,
          observacoes: novoOrcamento.observacoes,
          arquivos: novoOrcamento.arquivos,
          quantidade: qtdFinal,
          prazo: prazoSolicitado || '',
          material,
          tratamentoTermico,
          possuiModelagem3D: !!possuiModelagem3D,
          incluirModelagem3D: !!incluirModelagem3D,
          detalhesModelagem3D: detalhesModelagem3D || ''
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

          // Calcula os totais com as fórmulas Nardelli
          const totaisIniciais = calcularTotaisOrcamento(novoOrcamento, config);
          novoOrcamento.totais = totaisIniciais;

          // Snapshot da versão original para aprendizado humano
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
        console.warn('Aviso: Não foi possível pré-processar com IA automaticamente, registrado para revisão manual:', errIA.message);
      }
    }

    // 3. Salva no banco de dados persistente
    const salvo = await dbService.saveOrcamento(novoOrcamento);

    // 4. Registra no histórico de conversas do Chatbot
    let conversa;
    if (conversaId) {
      conversa = await dbService.getConversaById(conversaId);
    }
    if (!conversa) {
      conversa = {
        id: 'conv_' + Date.now().toString(36),
        cliente: {
          nome: novoOrcamento.cliente.nome,
          telefone: novoOrcamento.cliente.tel,
          empresa: novoOrcamento.cliente.nome
        },
        descricaoServico: descricao,
        status: 'orcamento_gerado',
        orcamentoId: salvo.id,
        orcamentoNumero: salvo.numero,
        ultimaMensagemClienteEm: new Date().toISOString(),
        canalOrigem: 'whatsapp',
        mensagens: [
          { id: 'm1', remetente: 'cliente', texto: descricao, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) },
          { id: 'm2', remetente: 'bot', texto: `Entendido! Criei o pré-orçamento #${salvo.numero}. Nossa equipe técnica está revisando os parâmetros e retornará com os valores.`, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
        ]
      };
    } else {
      conversa.orcamentoId = salvo.id;
      conversa.orcamentoNumero = salvo.numero;
      conversa.status = 'orcamento_gerado';
      conversa.mensagens.push({
        id: 'm_' + Date.now(),
        remetente: 'bot',
        texto: `Pré-orçamento #${salvo.numero} gerado com sucesso. Aguardando revisão técnica.`,
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
    }
    await dbService.saveConversa(conversa);

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Orçamento recebido do chatbot com sucesso e aguardando revisão da equipe técnica.',
      orcamentoId: salvo.id,
      numero: salvo.numero,
      status: salvo.status,
      origem: 'whatsapp',
      conversaId: conversa.id,
      dataCriacao: salvo.dataCriacao,
      resumo: {
        cliente: salvo.cliente.nome,
        totalEstimado: salvo.totais?.totalFinal || 0,
        itensInsumoQtd: salvo.itensInsumo?.length || 0,
        operacoesQtd: salvo.itensMaquina?.length || 0,
        complexidadeIA: salvo.analiseIA?.complexidade || 'A DEFINIR'
      }
    });

  } catch (error) {
    console.error('Erro na rota inbound do chatbot:', error);
    return res.status(500).json({
      sucesso: false,
      erro: 'Falha interna ao processar requisição inbound do chatbot.',
      detalhes: error.message
    });
  }
});

/**
 * Função utilitária para avaliar a janela de 24h da Meta para WhatsApp
 */
function avaliarJanelaMeta24h(conversa, texto = '') {
  let ultimaData = conversa.ultimaMensagemClienteEm ? new Date(conversa.ultimaMensagemClienteEm).getTime() : null;

  if (!ultimaData && Array.isArray(conversa.mensagens)) {
    const ultMsg = conversa.mensagens.slice().reverse().find(m => m.remetente === 'cliente');
    if (ultMsg) {
      ultimaData = Date.now() - 3600000; // fallback para 1h se sem timestamp explícito
    }
  }

  if (!ultimaData) {
    ultimaData = Date.now();
  }

  const agora = Date.now();
  const msPassados = agora - ultimaData;
  const horasPassadas = msPassados / (1000 * 60 * 60);
  const expirada = horasPassadas >= 24;

  let horasRestantes = Math.max(0, 24 - horasPassadas);
  const h = Math.floor(horasRestantes);
  const m = Math.floor((horasRestantes - h) * 60);
  const tempoRestanteStr = expirada ? `Expirada há ${Math.floor(horasPassadas - 24)}h` : `${h}h ${m}m restantes`;

  // Limpa o número de telefone para o WhatsApp Web (DDI 55 + DDD + Numero)
  let fone = (conversa.cliente?.telefone || '').replace(/\D/g, '');
  if (fone && fone.length <= 11 && !fone.startsWith('55')) {
    fone = '55' + fone;
  }

  const linkWhatsAppWeb = fone ? `https://web.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(texto || '')}` : '';

  return {
    expirada,
    horasPassadas: Number(horasPassadas.toFixed(2)),
    tempoRestanteStr,
    telefoneLimpo: fone,
    linkWhatsAppWeb,
    motivo: expirada
      ? 'A última mensagem do cliente foi recebida há mais de 24 horas. Para evitar cobrança de taxa de conversa iniciada pela Meta (WhatsApp Business API), use o WhatsApp Web para envio manual gratuito.'
      : 'Janela de atendimento da Meta ativa (gratuita). Respostas dentro de 24h não incorrem em custos de template.'
  };
}

// Rotas de Gestão de Conversas do Chatbot
router.get('/conversas', async (req, res) => {
  try {
    const conversas = await dbService.getConversas();
    const comJanela = conversas.map(c => ({
      ...c,
      janelaMeta: avaliarJanelaMeta24h(c)
    }));
    res.json({ sucesso: true, conversas: comJanela });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.get('/conversas/:id', async (req, res) => {
  try {
    const conversa = await dbService.getConversaById(req.params.id);
    if (!conversa) return res.status(404).json({ sucesso: false, erro: 'Conversa não encontrada' });
    res.json({
      sucesso: true,
      conversa: {
        ...conversa,
        janelaMeta: avaliarJanelaMeta24h(conversa)
      }
    });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.delete('/conversas/:id', async (req, res) => {
  try {
    const ok = await dbService.deleteConversa(req.params.id);
    res.json({ sucesso: true, removido: ok });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.delete('/conversas', async (req, res) => {
  try {
    await dbService.clearConversas();
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.post('/conversas/:id/mensagem', async (req, res) => {
  try {
    const { texto, remetente = 'cliente', viaWhatsAppWeb = false } = req.body;
    const conversa = await dbService.getConversaById(req.params.id);
    if (!conversa) return res.status(404).json({ sucesso: false, erro: 'Conversa não encontrada' });

    const statusJanela = avaliarJanelaMeta24h(conversa, texto);

    // Se for atendente/bot e a janela estiver expirada, mas NÃO for via WhatsApp Web:
    if (remetente !== 'cliente' && statusJanela.expirada && !viaWhatsAppWeb) {
      return res.json({
        sucesso: true,
        aviso: 'janela_24h_expirada',
        mensagemExplicativa: statusJanela.motivo,
        linkWhatsAppWeb: statusJanela.linkWhatsAppWeb,
        conversa: {
          ...conversa,
          janelaMeta: statusJanela
        }
      });
    }

    const novaMsg = {
      id: 'm_' + Date.now(),
      remetente,
      texto,
      viaWhatsAppWeb: !!viaWhatsAppWeb,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    conversa.mensagens.push(novaMsg);

    // Se foi o cliente falando, atualiza a janela de 24h e o histórico do pedido
    let envioMeta = null;
    if (remetente === 'cliente') {
      conversa.ultimaMensagemClienteEm = new Date().toISOString();
      conversa.descricaoServico = (conversa.descricaoServico ? conversa.descricaoServico + ' ' : '') + texto;
    } else if (remetente === 'atendente') {
      // Atendente humano assumiu pelo painel -> pausa IA e dispara pela Meta Cloud API se dentro da janela de 24h
      conversa.aiEnabled = false;
      conversa.lastHumanInteraction = new Date().toISOString();
      if (!viaWhatsAppWeb && (conversa.waId || conversa.cliente?.telefone)) {
        try {
          envioMeta = await metaWhatsappService.sendTextMessage({
            to: conversa.waId || conversa.cliente.telefone,
            text: texto,
            phoneNumberId: conversa.phoneNumberId
          });
        } catch (errMeta) {
          console.warn('[Inbound] Aviso ao enviar resposta do atendente via Meta API:', errMeta.message);
          envioMeta = { sucesso: false, erro: errMeta.message };
        }
      }
    }

    const salva = await dbService.saveConversa(conversa);
    res.json({
      sucesso: true,
      envioMeta,
      conversa: {
        ...salva,
        janelaMeta: avaliarJanelaMeta24h(salva)
      }
    });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

/**
 * Pausar ou reativar a IA em uma conversa específica
 */
router.post('/conversas/:id/toggle-ia', async (req, res) => {
  try {
    const conversa = await dbService.getConversaById(req.params.id);
    if (!conversa) return res.status(404).json({ sucesso: false, erro: 'Conversa não encontrada' });

    const novoEstado = req.body.aiEnabled !== undefined ? Boolean(req.body.aiEnabled) : !(conversa.aiEnabled !== false);
    conversa.aiEnabled = novoEstado;
    if (!novoEstado) {
      conversa.lastHumanInteraction = new Date().toISOString();
      conversa.status = 'atendimento_humano';
    } else if (conversa.status === 'atendimento_humano' || conversa.status === 'falha_ia_atendimento_humano') {
      conversa.status = conversa.orcamentoId ? 'orcamento_gerado' : 'coletando_dados';
    }

    const salva = await dbService.saveConversa(conversa);
    res.json({
      sucesso: true,
      aiEnabled: salva.aiEnabled,
      conversa: {
        ...salva,
        janelaMeta: avaliarJanelaMeta24h(salva)
      }
    });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

/**
 * Simulador Interativo Multi-Turnos do Chatbot JEV (mesmo motor da Meta Cloud API, sem envio externo)
 */
router.post('/simular', async (req, res) => {
  try {
    const {
      telefone = '5579999990001',
      nome = 'Cliente Simulador',
      mensagem = '',
      tipoMidia = 'text'
    } = req.body;

    if (!String(mensagem || '').trim()) {
      return res.status(400).json({ sucesso: false, erro: 'Envie uma mensagem para simular.' });
    }

    const resultado = await chatbotService.processarLote(
      telefone,
      [
        {
          phone: telefone,
          senderName: nome,
          messageType: tipoMidia,
          content: String(mensagem).trim(),
          hasVisualMedia: false
        }
      ],
      { enviarViaMeta: false, modoSimulador: true }
    );

    res.json({
      sucesso: true,
      respostaBot: resultado?.respostaBot || '',
      jev: resultado?.jev || null,
      orcamentoGerado: resultado?.orcamentoGerado
        ? {
            id: resultado.orcamentoGerado.id,
            numero: resultado.orcamentoGerado.numero,
            totalEstimado: resultado.orcamentoGerado.totais?.totalFinal || 0
          }
        : null,
      conversa: resultado?.conversa || null
    });
  } catch (e) {
    console.error('[Simulador JEV] Erro:', e);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.post('/conversas/:id/gerar-orcamento', async (req, res) => {
  try {
    const conversa = await dbService.getConversaById(req.params.id);
    if (!conversa) return res.status(404).json({ sucesso: false, erro: 'Conversa não encontrada' });

    // Cria o orçamento com base no histórico da conversa e dados coletados pelo JEV
    const descricoes = conversa.mensagens.filter(m => m.remetente === 'cliente').map(m => m.texto).join('. ');
    const config = dbService.getConfig();
    const dc = conversa.jevState?.dadosColetados || {};
    const qtdFinal = Math.max(1, Number(dc.quantidade) || 1);

    const novoOrcamento = {
      id: 'orc_' + Date.now().toString(36),
      origem: 'whatsapp',
      canalOrigem: 'whatsapp',
      status: 'PENDENTE_REVISAO',
      dataCriacao: new Date().toISOString(),
      cliente: {
        nome: dc.empresa ? `${dc.empresa}${dc.nome_cliente ? ` (${dc.nome_cliente})` : ''}` : (dc.nome_cliente || conversa.cliente?.nome || 'Cliente WhatsApp'),
        tel: conversa.cliente?.telefone || '',
        email: '',
        endereco: dc.endereco_frete || 'Aracaju/SE',
        contato: dc.nome_cliente || conversa.cliente?.nome || ''
      },
      descricaoServico: conversa.jevState?.resumoTecnico || conversa.descricaoServico || descricoes,
      quantidadePecas: qtdFinal,
      unidadePeca: (dc.unidade || 'PÇ').toUpperCase(),
      materialPeca: dc.material || '',
      tratamentoTermico: dc.tratamento_termico || 'Nenhum',
      possuiModelagem3D: dc.possui_modelagem_3d === true,
      incluirModelagem3D: dc.incluir_modelagem_3d === true,
      observacoes: `Gerado a partir da conversa WhatsApp (${conversa.id})`,
      arquivos: conversa.arquivos || [],
      itensInsumo: [],
      itensMaquina: [],
      moEscritorio: 40.0,
      frete: { distKm: 0, viagens: 1, pecas: qtdFinal, valorTotal: 0 },
      parcelamento: { prazoMeses: 0 },
      totais: {}
    };

  try {
    const resIA = await aiService.gerarPreviaOrcamento({
      descricao: novoOrcamento.descricaoServico,
      observacoes: novoOrcamento.observacoes,
      arquivos: novoOrcamento.arquivos,
      quantidade: qtdFinal,
      material: dc.material || '',
      tratamentoTermico: dc.tratamento_termico || 'Nenhum',
      possuiModelagem3D: dc.possui_modelagem_3d === true,
      incluirModelagem3D: dc.incluir_modelagem_3d === true
    });

    if (resIA && resIA.sucesso) {
      novoOrcamento.itensInsumo = resIA.resultado.insumos || [];
      novoOrcamento.itensMaquina = resIA.resultado.operacoes || [];
      novoOrcamento.moEscritorio = resIA.resultado.moEscritorio || 40.0;
      novoOrcamento.analiseIA = {
        complexidade: resIA.triagemJev?.complexidade || 'MEDIA',
        setor: resIA.triagemJev?.setor_principal || 'GERAL',
        modelo: resIA.modelo,
        observacaoTecnica: resIA.resultado.observacoesTecnicas
      };
      novoOrcamento.referenciaHistorica = resIA.referenciaHistorica || null;
      novoOrcamento.totais = calcularTotaisOrcamento(novoOrcamento, config);
      novoOrcamento.versaoOriginalIA = {
        itensInsumo: JSON.parse(JSON.stringify(novoOrcamento.itensInsumo || [])),
        itensMaquina: JSON.parse(JSON.stringify(novoOrcamento.itensMaquina || [])),
        moEscritorio: novoOrcamento.moEscritorio,
        totais: JSON.parse(JSON.stringify(novoOrcamento.totais || {})),
        geradoEm: new Date().toISOString()
      };
    }
  } catch (e) {
    console.warn('Erro ao processar IA na conversão:', e.message);
  }

    const salvo = await dbService.saveOrcamento(novoOrcamento);
    conversa.orcamentoId = salvo.id;
    conversa.orcamentoNumero = salvo.numero;
    conversa.status = 'orcamento_gerado';
    conversa.mensagens.push({
      id: 'm_' + Date.now(),
      remetente: 'bot',
      texto: `Orçamento #${salvo.numero} criado com sucesso pela equipe técnica.`,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });
    await dbService.saveConversa(conversa);

    res.json({ sucesso: true, orcamento: salvo, conversa });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

/**
 * Documentação da API de Inbound para integração
 */
router.get('/docs', (req, res) => {
  res.json({
    titulo: 'API de Inbound para Chatbot — Nardelli Usinagem',
    versao: '1.0.0',
    endpoint: '/api/inbound/chatbot',
    metodo: 'POST',
    descricao: 'Recebe mensagens e orçamentos iniciados pelo cliente em canais como WhatsApp, Telegram ou formulários Web.',
    headers: {
      'Content-Type': 'application/json'
    },
    exemploPayload: {
      cliente: {
        nome: "Indústria Metalmecânica Sergipe",
        telefone: "(79) 99876-5432",
        email: "compras@metalurgicasergipe.com.br",
        endereco: "Distrito Industrial, Aracaju/SE"
      },
      descricao: "Recuperar 2 eixos Ø75x600mm em aço 1045 com enchimento de solda e usinagem nas pontas",
      observacoes: "Cliente tem urgência. Enviar valor com e sem tratamento térmico.",
      prazoSolicitado: "4 dias",
      origem: "whatsapp_typebot",
      processarComIA: true,
      arquivos: [
        {
          nome: "foto_eixo.jpg",
          tipo: "image/jpeg",
          base64: "/9j/4AAQSkZJRgABAQ..."
        }
      ]
    },
    respostas: {
      201: {
        sucesso: true,
        orcamentoId: "orc_0042",
        numero: "0042",
        status: "PENDENTE_REVISAO"
      },
      400: {
        sucesso: false,
        erro: "Descrição do serviço é obrigatória"
      }
    }
  });
});

/**
 * Função Auxiliar de Cálculo Nardelli (mesma lógica comercial do negócio)
 */
function calcularTotaisOrcamento(orc, cfg) {
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  let totalInsumos = 0;
  (orc.itensInsumo || []).forEach(i => {
    const q = num(i.qtd);
    const p = num(i.preco);
    totalInsumos += (q * p);
  });

  let totalMaquina = 0;
  (orc.itensMaquina || []).forEach(m => {
    const vh = num(m.valorHora);
    const h = num(m.horas);
    const mult = m.regime === 'h50' ? 1.5 : (m.regime === 'h100' ? 2.0 : 1.0);
    totalMaquina += (h * vh * mult);
  });

  const moEscritorio = num(orc.moEscritorio);
  const totalMO = totalMaquina + moEscritorio;

  const mp = (orc.margensPersonalizadas && orc.margensPersonalizadas.ativa) ? orc.margensPersonalizadas : {};
  const despFixasInsumo = mp.despFixasInsumo !== undefined ? num(mp.despFixasInsumo) : num(cfg.despFixasInsumo);
  const impostoInsumo = mp.impostoInsumo !== undefined ? num(mp.impostoInsumo) : num(cfg.impostoInsumo);
  const lucroInsumo = mp.lucroInsumo !== undefined ? num(mp.lucroInsumo) : num(cfg.lucroInsumo);
  const mcInsumo = despFixasInsumo + impostoInsumo + lucroInsumo;
  const taxaInsumo = 1 - mcInsumo;
  const valorInsumoComMargem = taxaInsumo > 0 ? (totalInsumos / taxaInsumo) : totalInsumos;

  const despFixasMO = mp.despFixasMO !== undefined ? num(mp.despFixasMO) : num(cfg.despFixasMO);
  const impostoMO = mp.impostoMO !== undefined ? num(mp.impostoMO) : num(cfg.impostoMO);
  const lucroMO = mp.lucroMO !== undefined ? num(mp.lucroMO) : num(cfg.lucroMO);
  const mcMO = despFixasMO + impostoMO + lucroMO;
  const taxaMO = 1 - mcMO;
  const valorMOComMargem = taxaMO > 0 ? (totalMO / taxaMO) : totalMO;

  const distKm = num(orc.frete?.distKm);
  const viagens = num(orc.frete?.viagens) || 1;
  const pecas = Math.max(num(orc.frete?.pecas) || 1, 1);
  const freteTotal = (distKm * num(cfg.custoKm) * 2 * viagens) / pecas;

  const semDesconto = valorInsumoComMargem + valorMOComMargem + freteTotal;
  const margemDesc = mp.margemDesconto !== undefined ? num(mp.margemDesconto) : num(cfg.margemDesconto);
  const comDesconto = semDesconto * (1 + margemDesc);

  const prazoMeses = num(orc.parcelamento?.prazoMeses);
  const jurosMensal = mp.jurosMensal !== undefined ? num(mp.jurosMensal) : num(cfg.jurosMensal);
  const taxaJuros = prazoMeses * jurosMensal;
  const precoAPrazo = comDesconto * (1 + taxaJuros);

  const totalFinal = prazoMeses > 0 ? precoAPrazo : comDesconto;

  const qtdPecas = Math.max(1, num(orc.quantidadePecas) || 1);
  const unidadePeca = (orc.unidadePeca || 'PÇ').toUpperCase();
  const valorUnitarioPeca = Number((totalFinal / qtdPecas).toFixed(2));
  const valorUnitarioPecaSemDesconto = Number((semDesconto / qtdPecas).toFixed(2));
  const custoMaterialUnitario = Number((totalInsumos / qtdPecas).toFixed(2));
  const custoMOUnitario = Number((totalMO / qtdPecas).toFixed(2));

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
    unidadePeca: unidadePeca,
    valorUnitarioPeca,
    valorUnitarioPecaSemDesconto,
    custoMaterialUnitario,
    custoMOUnitario
  };
}

module.exports = router;
