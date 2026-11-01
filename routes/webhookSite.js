const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const aiService = require('../services/aiService');

/**
 * WEBHOOK PARA RECEBER PEDIDOS DO SITE:
 * https://www.nardelliusinagem.com/orcamento
 * 
 * Campos mapeados do formulário do site:
 * - nome: Nome do solicitante
 * - empresa: Nome da empresa
 * - email: E-mail de contato
 * - telefone: Telefone/WhatsApp
 * - tipos_pecas / checkboxes: manutencao, engrenagem, eixo, polia, acoplamento, redutor, cilindro, tratamento_termico, outros
 * - arquivo: URL ou base64 de croqui, foto ou desenho técnico
 * - enviar_video: "link" | "contato"
 * - link_video: Link de vídeo no YouTube/Drive/Cloud
 * - observacoes: Detalhes, tolerâncias e especificações técnicas
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Normaliza os dados vindos do formulário do site
    const nome = payload.nome || payload.cliente_nome || 'Cliente do Site';
    const empresa = payload.empresa || payload.cliente_empresa || '';
    const email = payload.email || payload.cliente_email || '';
    const telefone = payload.telefone || payload.tel || payload.cliente_telefone || '';
    const observacoes = payload.observacoes || payload.mensagem || payload.detalhes || '';
    const linkVideo = payload.link_video || payload.linkVideo || '';
    const enviarVideo = payload.enviar_video || payload.enviarVideo || (payload.pendenteContato ? 'contato' : '');
    const temVideo = Boolean(linkVideo || enviarVideo === 'contato' || payload.temVideo || payload.pendenteContato);
    const pendenteContato = Boolean(enviarVideo === 'contato' || payload.pendenteContato);

    // Mapeia tipos de peças (suporta array, checkboxes booleanos ou string)
    const tiposDetectados = [];
    const chavesCheckbox = [
      { chave: 'manutencao', rotulo: 'Manutenção' },
      { chave: 'engrenagem', rotulo: 'Engrenagem' },
      { chave: 'eixo', rotulo: 'Eixo' },
      { chave: 'polia', rotulo: 'Polia' },
      { chave: 'acoplamento', rotulo: 'Acoplamento' },
      { chave: 'redutor', rotulo: 'Redutor' },
      { chave: 'cilindro', rotulo: 'Cilindro' },
      { chave: 'tratamento_termico', rotulo: 'Tratamento Térmico' },
      { chave: 'outros', rotulo: 'Outros' }
    ];

    if (Array.isArray(payload.tipos_pecas)) {
      tiposDetectados.push(...payload.tipos_pecas);
    } else if (typeof payload.tipos_pecas === 'string') {
      tiposDetectados.push(...payload.tipos_pecas.split(',').map(s => s.trim()));
    }

    chavesCheckbox.forEach(({ chave, rotulo }) => {
      if (payload[chave] === true || payload[chave] === '1' || payload[chave] === 'true' || payload[chave] === 'on') {
        if (!tiposDetectados.includes(rotulo)) tiposDetectados.push(rotulo);
      }
    });

    const tiposStr = tiposDetectados.length > 0 ? tiposDetectados.join(', ') : 'Peça Industrial / Usinagem';

    // Monta a descrição compreensiva do serviço
    let descricaoCompleta = `[Solicitação via Site] ${tiposStr}`;
    if (empresa) {
      descricaoCompleta += ` para a empresa ${empresa}`;
    }
    if (observacoes) {
      descricaoCompleta += `. ${observacoes}`;
    }

    let obsAdicionais = `Origem: Formulário do Site (nardelliusinagem.com/orcamento)`;
    if (linkVideo) {
      obsAdicionais += ` | Link do vídeo da peça: ${linkVideo}`;
    } else if (enviarVideo === 'contato') {
      obsAdicionais += ` | Cliente prefere que a equipe entre em contato para receber o vídeo da peça.`;
    }

    // Processa anexos
    const arquivos = [];
    if (payload.arquivo) {
      if (typeof payload.arquivo === 'string') {
        arquivos.push({
          id: 'arq_site_1',
          nome: payload.arquivo_nome || 'anexo_site.jpg',
          tipo: 'image/jpeg',
          url: payload.arquivo.startsWith('http') ? payload.arquivo : '',
          base64: payload.arquivo.startsWith('data:') || payload.arquivo.length > 100 ? payload.arquivo : ''
        });
      } else if (typeof payload.arquivo === 'object') {
        arquivos.push({
          id: 'arq_site_1',
          nome: payload.arquivo.name || payload.arquivo.nome || 'anexo_site.jpg',
          tipo: payload.arquivo.type || 'image/jpeg',
          url: payload.arquivo.url || '',
          base64: payload.arquivo.base64 || ''
        });
      }
    }

    if (Array.isArray(payload.arquivos)) {
      payload.arquivos.forEach((arq, i) => {
        arquivos.push({
          id: `arq_site_${i + 1}`,
          nome: arq.nome || `anexo_${i + 1}.jpg`,
          tipo: arq.tipo || 'image/jpeg',
          url: arq.url || '',
          base64: arq.base64 || ''
        });
      });
    }

    const quantidade = Number(payload.quantidade || payload.qtd || payload.quantidade_pecas || 1) || 1;
    const unidadePeca = (payload.unidade || payload.unidade_peca || payload.unid || 'PÇ').toUpperCase();
    const prazo = payload.prazo || payload.urgencia || payload.prazo_desejado || '';
    const material = payload.material || payload.material_peca || payload.materia_prima || '';
    const itemType = payload.itemType || payload.categoria || (tiposDetectados.length > 0 ? tiposDetectados[0] : 'Usinagem Geral');
    const tratamento = payload.tratamento || payload.tratamento_termico || payload.processo || (payload.tratamento_termico === true ? 'Têmpera' : 'Nenhum');
    const durezaDesejada = payload.dureza_desejada || payload.dureza || '';
    const detalhesTermico = payload.detalhes_termico || payload.especificacoes || '';

    const config = dbService.getConfig();

    // Cria o orçamento com origem 'site'
    const novoOrcamento = {
      id: 'orc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      origem: 'site',
      canalOrigem: 'site_nardelliusinagem',
      status: 'PENDENTE_REVISAO',
      visualizado: false,
      dataCriacao: new Date().toISOString(),
      cliente: {
        nome: empresa ? `${empresa} (${nome})` : nome,
        tel: telefone,
        email: email,
        endereco: 'Enviado pelo formulário do site',
        contato: nome
      },
      descricaoServico: descricaoCompleta,
      categoriaPeca: itemType,
      quantidadePecas: quantidade,
      unidadePeca: unidadePeca,
      prazoDesejado: prazo,
      materialPeca: material,
      tratamentoTermico: tratamento,
      durezaDesejada: durezaDesejada,
      detalhesTermico: detalhesTermico,
      observacoes: obsAdicionais,
      videoInfo: {
        enviarVideo: enviarVideo,
        linkVideo: linkVideo,
        temVideo: temVideo,
        pendenteContato: pendenteContato
      },
      arquivos,
      itensInsumo: [],
      itensMaquina: [],
      moEscritorio: 0,
      frete: { distKm: 0, viagens: 1, pecas: quantidade, valorTotal: 0 },
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

    // Processamento com IA se habilitado
    const processarIA = payload.processarComIA !== false;
    if (processarIA) {
      try {
        const resultadoIA = await aiService.gerarPreviaOrcamento({
          descricao: novoOrcamento.descricaoServico,
          observacoes: novoOrcamento.observacoes,
          arquivos: novoOrcamento.arquivos,
          categoria: itemType,
          quantidade: quantidade,
          prazo: prazo,
          material: material,
          tratamentoTermico: tratamento,
          durezaDesejada: durezaDesejada,
          detalhesTermico: detalhesTermico
        });

        if (resultadoIA && resultadoIA.sucesso) {
          const resDados = resultadoIA.resultado;
          novoOrcamento.itensInsumo = resDados.insumos || [];
          novoOrcamento.itensMaquina = resDados.operacoes || [];
          novoOrcamento.moEscritorio = resDados.moEscritorio !== undefined ? resDados.moEscritorio : 0;
          novoOrcamento.ehConjuntoMultiPecas = !!resDados.ehConjuntoMultiPecas;
          novoOrcamento.pecas = resDados.pecas || [];
          novoOrcamento.analiseIA = {
            complexidade: resultadoIA.triagemJev?.complexidade || 'MEDIA',
            setor: resultadoIA.triagemJev?.setor_principal || 'USINAGEM',
            modelo: resultadoIA.modelo,
            observacaoTecnica: resDados.observacoesTecnicas,
            ehConjuntoMultiPecas: !!resDados.ehConjuntoMultiPecas,
            pecas: resDados.pecas || [],
            dataAnalise: new Date().toISOString()
          };
          novoOrcamento.referenciaHistorica = resultadoIA.referenciaHistorica || null;

          // Calcula totais com a fórmula Nardelli
          novoOrcamento.totais = calcularTotaisNardelli(novoOrcamento, config);

          // Salva snapshot da versão original da IA para rastrear melhorias e correções humanas
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
        console.warn('Aviso: Análise de IA do site gerou exceção, cadastrado como orçamento pendente:', errIA.message);
      }
    }

    // Salva o orçamento no banco de dados
    const salvo = await dbService.saveOrcamento(novoOrcamento);

    // Registra como conversa para aparecer na aba "Chatbot & Conversas" (Central de Mensagens)
    const textoMensagemCliente = [
      `🌐 Solicitação via Formulário do Site (nardelliusinagem.com/orcamento)`,
      `🛠️ Peças / Serviços: ${tiposStr}`
    ];
    if (empresa) textoMensagemCliente.push(`🏢 Empresa: ${empresa}`);
    if (observacoes) textoMensagemCliente.push(`📝 Observações do Cliente: ${observacoes}`);
    
    if (linkVideo) {
      textoMensagemCliente.push(`📹 Vídeo da Peça (Link): ${linkVideo}`);
    } else if (enviarVideo === 'contato') {
      textoMensagemCliente.push(`📹 [ATENÇÃO] Cliente marcou que tem vídeo da peça e aguarda contato no WhatsApp para enviá-lo.`);
    }

    const novaConversa = {
      id: 'conv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      cliente: {
        nome: empresa ? `${empresa} (${nome})` : nome,
        telefone: telefone,
        email: email,
        empresa: empresa || nome
      },
      descricaoServico: descricaoCompleta,
      status: 'orcamento_gerado',
      orcamentoId: salvo.id,
      orcamentoNumero: salvo.numero,
      canalOrigem: 'site',
      videoInfo: {
        enviarVideo: enviarVideo,
        linkVideo: linkVideo,
        temVideo: Boolean(linkVideo || enviarVideo === 'contato'),
        pendenteContato: enviarVideo === 'contato'
      },
      ultimaMensagemClienteEm: new Date().toISOString(),
      mensagens: [
        {
          id: 'm1',
          remetente: 'cliente',
          texto: textoMensagemCliente.join('\n\n'),
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          anexoNome: payload.arquivo_nome || (arquivos.length > 0 ? arquivos[0].nome : (linkVideo ? 'Vídeo da Peça (Link)' : null))
        },
        {
          id: 'm2',
          remetente: 'bot',
          texto: `Recebido pelo site com sucesso! Pré-orçamento #${salvo.numero} criado automaticamente. Nossa equipe técnica está avaliando as tolerâncias e custos.`,
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };

    try {
      await dbService.saveConversa(novaConversa);
    } catch (errConv) {
      console.warn('Aviso: Não foi possível salvar conversa associada ao site:', errConv.message);
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Solicitação de orçamento do site recebida com sucesso!',
      orcamentoId: salvo.id,
      numero: salvo.numero,
      conversaId: novaConversa.id,
      status: salvo.status,
      origem: 'site',
      cliente: salvo.cliente.nome,
      descricao: salvo.descricaoServico,
      totalEstimado: salvo.totais?.totalFinal || 0
    });

  } catch (error) {
    console.error('Erro no webhook do site:', error);
    return res.status(500).json({
      sucesso: false,
      erro: 'Falha ao processar solicitação de orçamento do site.',
      detalhes: error.message
    });
  }
});

/**
 * GET /api/webhook/site/docs
 * Documentação do webhook para integrar o formulário do site
 */
router.get('/docs', (req, res) => {
  res.json({
    titulo: 'Webhook de Entrada do Site — Nardelli Usinagem',
    siteReferencia: 'https://www.nardelliusinagem.com/orcamento',
    endpoint: '/api/webhook/site',
    metodo: 'POST',
    contentType: 'application/json',
    camposAceitos: {
      nome: 'Nome do solicitante (string, ex: "Carlos Silva")',
      empresa: 'Nome da empresa (string, ex: "Cimento Sergipe")',
      email: 'E-mail para resposta (string, ex: "carlos@cimento.com.br")',
      telefone: 'Telefone ou WhatsApp com DDD (string, ex: "(79) 99876-5432")',
      manutencao: 'boolean (opcional)',
      engrenagem: 'boolean (opcional)',
      eixo: 'boolean (opcional)',
      polia: 'boolean (opcional)',
      acoplamento: 'boolean (opcional)',
      redutor: 'boolean (opcional)',
      cilindro: 'boolean (opcional)',
      tratamento_termico: 'boolean (opcional)',
      outros: 'boolean (opcional)',
      observacoes: 'Texto livre com detalhes e especificações',
      enviar_video: '"link" ou "contato"',
      link_video: 'URL do vídeo se houver',
      arquivo: 'URL da imagem ou base64 do desenho/croqui'
    },
    exemploCurl: `curl -X POST http://localhost:3005/api/webhook/site \\
  -H "Content-Type: application/json" \\
  -d '{
    "nome": "Marcos Andrade",
    "empresa": "Indústria Alimentos Nordeste",
    "email": "marcos@alimentosne.com.br",
    "telefone": "(79) 98765-4321",
    "engrenagem": true,
    "eixo": true,
    "observacoes": "Engrenagem helicoidal Z=38 M=4 em aço 8620 cementado e temperado",
    "enviar_video": "link",
    "link_video": "https://youtu.be/exemplo-peca"
  }'`
  });
});

function calcularTotaisNardelli(orc, cfg) {
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  let totalInsumos = 0;
  (orc.itensInsumo || []).forEach(i => {
    totalInsumos += (num(i.qtd) * num(i.preco));
  });

  let totalMaquina = 0;
  (orc.itensMaquina || []).forEach(m => {
    const vh = num(m.valorHora);
    const h = num(m.horas);
    const mult = m.regime === 'h50' ? 1.5 : (m.regime === 'h100' ? 2.0 : 1.0);
    totalMaquina += (h * vh * mult);
  });

  const totalMO = totalMaquina + num(orc.moEscritorio);

  const mcInsumo = num(cfg.despFixasInsumo) + num(cfg.impostoInsumo) + num(cfg.lucroInsumo);
  const taxaInsumo = 1 - mcInsumo;
  const valorInsumoComMargem = taxaInsumo > 0 ? (totalInsumos / taxaInsumo) : totalInsumos;

  const mcMO = num(cfg.despFixasMO) + num(cfg.impostoMO) + num(cfg.lucroMO);
  const taxaMO = 1 - mcMO;
  const valorMOComMargem = taxaMO > 0 ? (totalMO / taxaMO) : totalMO;

  const distKm = num(orc.frete?.distKm);
  const viagens = num(orc.frete?.viagens) || 1;
  const pecas = Math.max(num(orc.frete?.pecas) || 1, 1);
  const freteTotal = (distKm * num(cfg.custoKm) * 2 * viagens) / pecas;

  const semDesconto = valorInsumoComMargem + valorMOComMargem + freteTotal;
  const comDesconto = semDesconto * (1 + num(cfg.margemDesconto));

  const qtdPecas = Math.max(1, num(orc.quantidadePecas) || 1);
  const unidadePeca = (orc.unidadePeca || 'PÇ').toUpperCase();
  const valorUnitarioPeca = Number((comDesconto / qtdPecas).toFixed(2));
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
    precoAPrazo: Number(comDesconto.toFixed(2)),
    totalFinal: Number(comDesconto.toFixed(2)),
    quantidadePecas: qtdPecas,
    unidadePeca: unidadePeca,
    valorUnitarioPeca,
    valorUnitarioPecaSemDesconto,
    custoMaterialUnitario,
    custoMOUnitario
  };
}

module.exports = router;
