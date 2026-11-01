const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dbService = require('../services/dbService');
const aiService = require('../services/aiService');

// Configuração do multer para upload de desenhos e imagens
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'anexo-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // até 25MB por arquivo
  fileFilter: (req, file, cb) => {
    const permitidos = /jpeg|jpg|png|webp|gif|pdf|dwg|dxf/;
    const extname = permitidos.test(path.extname(file.originalname).toLowerCase());
    const mimetype = permitidos.test(file.mimetype) || file.mimetype.includes('pdf') || file.mimetype.includes('image');
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Formato não suportado. Envie imagens (JPG, PNG, WEBP), PDF ou desenhos técnicos (DWG/DXF).'));
  }
});

/* ===============================================================
   ROTA DE UPLOAD DE ARQUIVOS
=============================================================== */
router.post('/upload', upload.array('arquivos', 10), (req, res) => {
  try {
    const files = req.files || [];
    const resultados = files.map(f => {
      // Lê em base64 caso seja imagem para facilitar envio direto à IA
      let base64 = null;
      if (f.mimetype.startsWith('image/') || f.mimetype === 'application/pdf') {
        try {
          base64 = fs.readFileSync(f.path, { encoding: 'base64' });
        } catch (e) { /* ignora */ }
      }

      return {
        nomeOriginal: f.originalname,
        nomeSalvo: f.filename,
        tamanho: f.size,
        mimetype: f.mimetype,
        url: `/uploads/${f.filename}`,
        base64
      };
    });

    res.json({ sucesso: true, arquivos: resultados });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

/* ===============================================================
   ORÇAMENTOS (CRUD & AÇÕES)
=============================================================== */
router.get('/orcamentos', async (req, res) => {
  try {
    const { status, origem, busca } = req.query;
    let lista = await dbService.getOrcamentos({ origem });

    if (status && status !== 'TODOS') {
      lista = lista.filter(o => o.status === status);
    }
    if (origem && origem !== 'TODOS') {
      lista = lista.filter(o => o.origem === origem);
    }
    if (busca && busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(o =>
        (o.numero && o.numero.includes(q)) ||
        (o.cliente?.nome && o.cliente.nome.toLowerCase().includes(q)) ||
        (o.descricaoServico && o.descricaoServico.toLowerCase().includes(q))
      );
    }

    res.json({ sucesso: true, total: lista.length, orcamentos: lista });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.get('/orcamentos/:id', async (req, res) => {
  try {
    const orc = await dbService.getOrcamentoById(req.params.id);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });
    res.json({ sucesso: true, orcamento: orc });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/orcamentos', async (req, res) => {
  try {
    const orcamento = req.body;
    const salvo = await dbService.saveOrcamento(orcamento);
    res.status(201).json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.put('/orcamentos/:id', async (req, res) => {
  try {
    const orcamento = { ...req.body, id: req.params.id, revisadoPorHumano: true };
    const salvo = await dbService.saveOrcamento(orcamento);
    res.json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.patch('/orcamentos/:id/status', async (req, res) => {
  try {
    const { status, motivo, observacoes, usuario } = req.body;
    const orc = await dbService.getOrcamentoById(req.params.id);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });

    orc.status = status;
    if (!Array.isArray(orc.historicoEventos)) orc.historicoEventos = [];
    orc.historicoEventos.unshift({
      id: 'evt_' + Date.now().toString(36),
      data: new Date().toISOString(),
      tipo: 'STATUS_ALTERADO',
      titulo: `Status alterado para: ${status}`,
      detalhes: observacoes || motivo || '',
      usuario: usuario || 'Orçamentista'
    });

    const salvo = await dbService.saveOrcamento(orc);
    res.json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// Envio formal da proposta ao cliente (WhatsApp, E-mail, PDF)
router.post('/orcamentos/:id/enviar-cliente', async (req, res) => {
  try {
    const { canal = 'whatsapp', mensagem, telefone, email, usuario } = req.body;
    const orc = await dbService.getOrcamentoById(req.params.id);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });

    orc.status = 'ENVIADO_AO_CLIENTE';
    orc.dataEnvioCliente = new Date().toISOString();
    orc.canalEnvio = canal;

    if (!Array.isArray(orc.historicoEventos)) {
      orc.historicoEventos = [];
    }

    const valorTxt = (orc.totais?.totalFinalComDesconto || orc.totais?.totalSemDesconto || 0);
    orc.historicoEventos.unshift({
      id: 'evt_' + Date.now().toString(36),
      data: new Date().toISOString(),
      tipo: 'ENVIO_CLIENTE',
      titulo: `Proposta enviada ao cliente via ${canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'}`,
      detalhes: mensagem ? mensagem.slice(0, 300) : `Proposta enviada no valor de R$ ${Number(valorTxt).toFixed(2)}`,
      canal,
      usuario: usuario || 'Orçamentista'
    });

    const salvo = await dbService.saveOrcamento(orc);
    res.json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// Feedback comercial do cliente: Aprovação, Pedido de Ajustes ou Recusa
router.post('/orcamentos/:id/feedback-cliente', async (req, res) => {
  try {
    const { acao, motivo, observacoes, numPedidoCliente, usuario } = req.body;
    const orc = await dbService.getOrcamentoById(req.params.id);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });

    if (!Array.isArray(orc.historicoEventos)) {
      orc.historicoEventos = [];
    }

    const now = new Date().toISOString();

    if (acao === 'aprovar') {
      orc.status = 'APROVADO';
      orc.dataAprovacao = now;
      orc.feedbackCliente = {
        status: 'APROVADO',
        data: now,
        numPedidoCliente: numPedidoCliente || null,
        observacoes: observacoes || null
      };
      orc.historicoEventos.unshift({
        id: 'evt_' + Date.now().toString(36),
        data: now,
        tipo: 'APROVADO',
        titulo: '🎉 Proposta APROVADA pelo cliente',
        detalhes: numPedidoCliente ? `Pedido/OC Cliente: #${numPedidoCliente}. ${observacoes || ''}` : (observacoes || 'Aprovado sem ressalvas.'),
        usuario: usuario || 'Orçamentista'
      });
    } else if (acao === 'ajuste') {
      orc.status = 'AJUSTE_SOLICITADO';
      orc.dataUltimoAjuste = now;
      orc.feedbackCliente = {
        status: 'AJUSTE_SOLICITADO',
        data: now,
        solicitacao: observacoes || 'Ajuste solicitado pelo cliente'
      };
      orc.historicoEventos.unshift({
        id: 'evt_' + Date.now().toString(36),
        data: now,
        tipo: 'AJUSTE_SOLICITADO',
        titulo: '🔄 Cliente solicitou ajuste na proposta',
        detalhes: observacoes || 'Cliente pediu revisão de custos/prazos/materiais.',
        usuario: usuario || 'Orçamentista'
      });
    } else if (acao === 'recusar') {
      orc.status = 'RECUSADO';
      orc.dataRecusa = now;
      orc.feedbackCliente = {
        status: 'RECUSADO',
        data: now,
        motivo: motivo || 'Outro',
        observacoes: observacoes || null
      };
      orc.historicoEventos.unshift({
        id: 'evt_' + Date.now().toString(36),
        data: now,
        tipo: 'RECUSADO',
        titulo: '❌ Proposta RECUSADA pelo cliente',
        detalhes: `Motivo: ${motivo || 'Não informado'}. ${observacoes || ''}`,
        usuario: usuario || 'Orçamentista'
      });
    } else {
      return res.status(400).json({ sucesso: false, erro: 'Ação inválida (use aprovar, ajuste ou recusar)' });
    }

    const salvo = await dbService.saveOrcamento(orc);
    res.json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.patch('/orcamentos/:id/iniciar', async (req, res) => {
  try {
    const orc = await dbService.getOrcamentoById(req.params.id);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });

    orc.visualizado = true;
    if (!orc.status || orc.status === 'NOVO') {
      orc.status = 'EM_ANDAMENTO';
    }
    if (!orc.dataInicio) orc.dataInicio = new Date().toISOString();
    const salvo = await dbService.saveOrcamento(orc);
    res.json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.patch('/orcamentos/:id/visualizar', async (req, res) => {
  try {
    const orc = await dbService.getOrcamentoById(req.params.id);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });

    orc.visualizado = true;
    orc.dataVisualizacao = new Date().toISOString();
    const salvo = await dbService.saveOrcamento(orc);
    res.json({ sucesso: true, orcamento: salvo });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.post('/orcamentos/marcar-todos-visualizados', async (req, res) => {
  try {
    const orcs = await dbService.getOrcamentos();
    let alterados = 0;
    for (const o of orcs) {
      if (!o.visualizado && o.status !== 'APROVADO' && o.status !== 'CONCLUIDO') {
        o.visualizado = true;
        o.dataVisualizacao = new Date().toISOString();
        await dbService.saveOrcamento(o);
        alterados++;
      }
    }
    res.json({ sucesso: true, alterados });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.delete('/orcamentos/:id', async (req, res) => {
  try {
    const ok = await dbService.deleteOrcamento(req.params.id);
    if (!ok) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });
    res.json({ sucesso: true, mensagem: 'Orçamento excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

/* ===============================================================
   CLIENTES (CADASTRO E CONSULTA)
=============================================================== */
router.get('/clientes', async (req, res) => {
  try {
    const { busca } = req.query;
    const lista = await dbService.getClientes(busca);
    res.json({ sucesso: true, total: lista.length, clientes: lista });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.get('/clientes/:id', async (req, res) => {
  try {
    const cli = await dbService.getClienteById(req.params.id);
    if (!cli) return res.status(404).json({ sucesso: false, erro: 'Cliente não encontrado' });
    res.json({ sucesso: true, cliente: cli });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/clientes', async (req, res) => {
  try {
    const dados = req.body;
    if (!dados || !dados.nome || !dados.nome.trim()) {
      return res.status(400).json({ sucesso: false, erro: 'O nome do cliente é obrigatório.' });
    }
    const salvo = await dbService.saveCliente(dados);
    res.json({ sucesso: true, cliente: salvo, mensagem: 'Cliente salvo com sucesso!' });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.delete('/clientes/:id', async (req, res) => {
  try {
    const ok = await dbService.deleteCliente(req.params.id);
    if (!ok) return res.status(404).json({ sucesso: false, erro: 'Cliente não encontrado.' });
    res.json({ sucesso: true, mensagem: 'Cliente excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

/* ===============================================================
   CATÁLOGOS
=============================================================== */
router.get('/catalogo/insumos', (req, res) => {
  res.json({ sucesso: true, insumos: dbService.getInsumos() });
});

router.post('/catalogo/insumos', (req, res) => {
  const { insumos } = req.body;
  const salvos = dbService.saveInsumos(insumos || []);
  res.json({ sucesso: true, insumos: salvos });
});

router.post('/catalogo/insumos/atualizar-preco', (req, res) => {
  try {
    const { nome, novoPreco, unidade } = req.body;
    if (!nome || novoPreco === undefined) {
      return res.status(400).json({ sucesso: false, erro: 'Nome e novoPreco são obrigatórios' });
    }
    const lista = dbService.getInsumos();
    const idx = lista.findIndex(i => i.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    let itemAtualizado;
    if (idx >= 0) {
      lista[idx].preco = Number(novoPreco);
      if (unidade) lista[idx].unidade = unidade;
      itemAtualizado = lista[idx];
    } else {
      itemAtualizado = {
        id: 'ins_' + Date.now().toString(36),
        nome: nome.trim(),
        fornecedor: 'CADASTRO VIA ORÇAMENTO',
        unidade: (unidade || 'UN').toUpperCase(),
        preco: Number(novoPreco)
      };
      lista.push(itemAtualizado);
    }
    const salvos = dbService.saveInsumos(lista);
    res.json({ sucesso: true, insumos: salvos, item: itemAtualizado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.get('/catalogo/maquinas', (req, res) => {
  res.json({ sucesso: true, maquinas: dbService.getMaquinas() });
});

router.post('/catalogo/maquinas', (req, res) => {
  const { maquinas } = req.body;
  const salvos = dbService.saveMaquinas(maquinas || []);
  res.json({ sucesso: true, maquinas: salvos });
});

/* ===============================================================
   CONFIGURAÇÕES
=============================================================== */
router.get('/config', (req, res) => {
  res.json({ sucesso: true, config: dbService.getConfig() });
});

router.post('/config', (req, res) => {
  const novaConfig = req.body;
  const salva = dbService.saveConfig(novaConfig);
  res.json({ sucesso: true, config: salva });
});

router.post('/config/testar-openrouter', async (req, res) => {
  const { apiKey } = req.body;
  const chave = apiKey || dbService.getConfig().openrouterApiKey;
  if (!chave) {
    return res.status(400).json({ sucesso: false, erro: 'Nenhuma chave informada' });
  }

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${chave}` }
    });
    const data = await resp.json();
    if (resp.ok) {
      res.json({ sucesso: true, info: data.data || data });
    } else {
      res.status(401).json({ sucesso: false, erro: data.error?.message || 'Chave inválida' });
    }
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: 'Falha ao conectar com OpenRouter: ' + e.message });
  }
});

/* ===============================================================
   IA: PRÉVIA, TRIAGEM E REFINAMENTO
=============================================================== */
router.post('/ia/gerar-previa', async (req, res) => {
  try {
    const {
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
    } = req.body;

    if (!descricao || !descricao.trim()) {
      return res.status(400).json({ sucesso: false, erro: 'Informe a descrição da peça ou serviço para a IA analisar.' });
    }

    const resultado = await aiService.gerarPreviaOrcamento({
      descricao,
      observacoes,
      arquivos: arquivos || [],
      modoForcado,
      categoria,
      quantidade: Number(quantidade) || 1,
      prazo,
      material,
      tratamentoTermico,
      durezaDesejada,
      detalhesTermico
    });

    res.json(resultado);
  } catch (err) {
    console.error('Erro na geração da prévia com IA:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/ia/refinar-previa', async (req, res) => {
  try {
    const { orcamentoAtual, instrucaoUsuario } = req.body;
    if (!instrucaoUsuario || !instrucaoUsuario.trim()) {
      return res.status(400).json({ sucesso: false, erro: 'Informe o pedido de alteração para a IA.' });
    }

    const resultado = await aiService.refinarPreviaComIA({
      orcamentoAtual,
      instrucaoUsuario
    });

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.get('/ia/aprendizado-stats', async (req, res) => {
  try {
    const ativo = dbService.isModeloAprendizagemAtivo();
    const validados = ativo ? await dbService.getOrcamentosValidadosParaTreino(50) : [];
    const orcs = await dbService.getOrcamentos();
    const comAjustes = orcs.filter(o => o.ajustadoManualmente && o.ajustesHumano?.houveAjustes);

    res.json({
      sucesso: true,
      modeloAprendizagemAtivo: ativo,
      status: ativo ? 'ATIVADO' : 'DESATIVADO_NO_ENV',
      totalValidados: validados.length,
      totalComAjustesManuais: comAjustes.length,
      ultimosAjustes: comAjustes.slice(0, 5).map(o => ({
        id: o.id,
        numero: o.numero,
        descricao: o.descricaoServico,
        resumoAjuste: o.ajustesHumano?.resumo || '',
        dataAtualizacao: o.dataAtualizacao || o.dataCriacao
      }))
    });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

/* ===============================================================
   CEP E CÁLCULO DE DISTÂNCIA DE FRETE (NARDELLI USINAGEM - ARACAJU/SE)
=============================================================== */
function estimarDistanciaRodoviaria({ cep, endereco, cidade, uf, bairro }) {
  const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const text = norm(`${endereco || ''} ${cidade || ''} ${bairro || ''} ${uf || ''}`);
  const cleanCep = (cep || '').replace(/\D/g, '');

  const cidadesSE = [
    { nomes: ['aracaju'], km: 10 },
    { nomes: ['socorro', 'nossa senhora do socorro'], km: 12 },
    { nomes: ['barra dos coqueiros'], km: 15 },
    { nomes: ['sao cristovao'], km: 22 },
    { nomes: ['laranjeiras'], km: 23 },
    { nomes: ['maruim'], km: 32 },
    { nomes: ['santo amaro das brotas'], km: 38 },
    { nomes: ['rosario do catete'], km: 37 },
    { nomes: ['carmopolis'], km: 48 },
    { nomes: ['japaratuba'], km: 55 },
    { nomes: ['pirambu'], km: 35 },
    { nomes: ['itaporanga dajuda', 'itaporanga'], km: 35 },
    { nomes: ['estancia'], km: 68 },
    { nomes: ['santa luzia do itanhy'], km: 78 },
    { nomes: ['indiaroba'], km: 100 },
    { nomes: ['itabaianinha'], km: 118 },
    { nomes: ['tomar do geru'], km: 132 },
    { nomes: ['cristinapolis'], km: 115 },
    { nomes: ['umbauba'], km: 95 },
    { nomes: ['boquim'], km: 82 },
    { nomes: ['pedrinhas'], km: 88 },
    { nomes: ['araua'], km: 85 },
    { nomes: ['salgado'], km: 54 },
    { nomes: ['lagarto'], km: 76 },
    { nomes: ['simao dias'], km: 105 },
    { nomes: ['poco verde'], km: 145 },
    { nomes: ['tobias barreto'], km: 130 },
    { nomes: ['riachao do dantas'], km: 95 },
    { nomes: ['itabaiana'], km: 54 },
    { nomes: ['campo do brito'], km: 62 },
    { nomes: ['macambira'], km: 74 },
    { nomes: ['sao domingos'], km: 68 },
    { nomes: ['malhador'], km: 50 },
    { nomes: ['moita bonita'], km: 60 },
    { nomes: ['areia branca'], km: 40 },
    { nomes: ['frei paulo'], km: 72 },
    { nomes: ['pinhao'], km: 78 },
    { nomes: ['pedra mole'], km: 88 },
    { nomes: ['carira'], km: 112 },
    { nomes: ['ribeirópolis', 'riberopolis'], km: 75 },
    { nomes: ['nossa senhora aparecida', 'aparecida'], km: 90 },
    { nomes: ['sao miguel do aleixo'], km: 85 },
    { nomes: ['nossa senhora das dores', 'dores'], km: 72 },
    { nomes: ['siriri'], km: 55 },
    { nomes: ['feira nova'], km: 105 },
    { nomes: ['graccho cardoso', 'gracho cardoso'], km: 120 },
    { nomes: ['cumbe'], km: 88 },
    { nomes: ['capela'], km: 70 },
    { nomes: ['muribeca'], km: 75 },
    { nomes: ['aquidaba'], km: 98 },
    { nomes: ['nossa senhora da gloria', 'gloria'], km: 105 },
    { nomes: ['monte alegre de sergipe', 'monte alegre'], km: 140 },
    { nomes: ['porto da folha'], km: 160 },
    { nomes: ['poco redondo'], km: 185 },
    { nomes: ['caninde de sao francisco', 'caninde'], km: 200 },
    { nomes: ['gararu'], km: 155 },
    { nomes: ['itabi'], km: 135 },
    { nomes: ['nossa senhora de lourdes'], km: 125 },
    { nomes: ['canhoba'], km: 110 },
    { nomes: ['amparo de sao francisco'], km: 102 },
    { nomes: ['telha'], km: 105 },
    { nomes: ['propria'], km: 102 },
    { nomes: ['cedro de sao joao', 'cedro'], km: 92 },
    { nomes: ['japoata'], km: 90 },
    { nomes: ['sao francisco'], km: 85 },
    { nomes: ['malhada dos bois'], km: 82 },
    { nomes: ['neopolis'], km: 120 },
    { nomes: ['santana do sao francisco'], km: 125 },
    { nomes: ['ilha das flores'], km: 135 },
    { nomes: ['brejo grande'], km: 140 },
    { nomes: ['pacatuba'], km: 115 },
    { nomes: ['general maynard'], km: 46 },
    { nomes: ['riachuelo'], km: 30 }
  ];

  // Distâncias dentro de Aracaju por bairro
  if (norm(cidade) === 'aracaju' || (cleanCep.startsWith('490') && !cleanCep.startsWith('49000000'))) {
    if (text.includes('aruana') || text.includes('mosqueiro') || text.includes('naufragos') || text.includes('robalo') || text.includes('areia branca')) return 20;
    if (text.includes('atalaia') || text.includes('coroa do meio') || text.includes('aeroporto') || text.includes('santa maria') || text.includes('17 de marco')) return 14;
    if (text.includes('jardins') || text.includes('grageru') || text.includes('salgado filho') || text.includes('farolandia') || text.includes('inacio barbosa') || text.includes('dia')) return 10;
    if (text.includes('centro') || text.includes('industrial') || text.includes('siqueira') || text.includes('santo antonio') || text.includes('dezoito') || text.includes('bairro america')) return 7;
    return 10;
  }

  // Busca município em Sergipe
  for (const c of cidadesSE) {
    if (c.nomes.some(n => text.includes(n))) {
      return c.km;
    }
  }

  // Estados vizinhos
  if (text.includes('alagoas') || text.includes(' al') || text.includes('-al')) {
    if (text.includes('penedo')) return 135;
    if (text.includes('arapiraca')) return 210;
    if (text.includes('maceio')) return 275;
    return 250;
  }
  if (text.includes('bahia') || text.includes(' ba') || text.includes('-ba')) {
    if (text.includes('rio real')) return 150;
    if (text.includes('alagoinhas')) return 220;
    if (text.includes('feira de santana')) return 300;
    if (text.includes('salvador')) return 325;
    return 300;
  }
  if (text.includes('pernambuco') || text.includes(' pe') || text.includes('-pe') || text.includes('recife')) {
    return 500;
  }

  if (cleanCep.startsWith('49')) {
    return 45;
  }

  return 350;
}

router.get('/cep/:cep', async (req, res) => {
  try {
    const rawCep = req.params.cep || '';
    const cleanCep = rawCep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return res.status(400).json({ sucesso: false, erro: 'CEP inválido. Deve conter 8 dígitos.' });
    }

    let dadosCep = null;

    // 1. Consulta ViaCEP
    try {
      const respViaCep = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
        headers: { 'User-Agent': 'NardelliUsinagem/1.0' },
        signal: AbortSignal.timeout(4000)
      });
      if (respViaCep.ok) {
        const json = await respViaCep.json();
        if (!json.erro) {
          dadosCep = {
            cep: json.cep,
            logradouro: json.logradouro || '',
            bairro: json.bairro || '',
            cidade: json.localidade || '',
            uf: json.uf || '',
            regiao: json.regiao || 'Nordeste'
          };
        }
      }
    } catch (e) {
      // Tenta fallback
    }

    // 2. Fallback BrasilAPI
    if (!dadosCep) {
      try {
        const respBrasilApi = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`, {
          signal: AbortSignal.timeout(4000)
        });
        if (respBrasilApi.ok) {
          const json = await respBrasilApi.json();
          if (json && !json.errors && !json.message) {
            dadosCep = {
              cep: json.cep,
              logradouro: json.street || '',
              bairro: json.neighborhood || '',
              cidade: json.city || '',
              uf: json.state || '',
              regiao: 'Nordeste'
            };
          }
        }
      } catch (e) {
        // Ignora
      }
    }

    if (!dadosCep) {
      return res.status(404).json({ sucesso: false, erro: 'CEP não encontrado nas bases oficiais.' });
    }

    const enderecoCompleto = `${dadosCep.logradouro ? dadosCep.logradouro + ', ' : ''}${dadosCep.bairro ? dadosCep.bairro + ', ' : ''}${dadosCep.cidade} - ${dadosCep.uf}`;
    const distanciaKm = estimarDistanciaRodoviaria({
      cep: cleanCep,
      endereco: enderecoCompleto,
      cidade: dadosCep.cidade,
      uf: dadosCep.uf,
      bairro: dadosCep.bairro
    });

    res.json({
      sucesso: true,
      ...dadosCep,
      enderecoCompleto,
      distanciaKm
    });
  } catch (err) {
    console.error('Erro ao consultar CEP:', err);
    res.status(500).json({ sucesso: false, erro: 'Falha ao consultar CEP: ' + err.message });
  }
});

router.post('/frete/calcular-distancia', (req, res) => {
  try {
    const { cep, endereco, cidade, uf, bairro } = req.body;
    const distanciaKm = estimarDistanciaRodoviaria({ cep, endereco, cidade, uf, bairro });
    res.json({ sucesso: true, distanciaKm });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

module.exports = router;
