// Motor de Orçamentos — Nardelli Usinagem
let orcamentoAtual = {
  id: null,
  numero: '',
  status: 'RASCUNHO',
  origem: 'manual',
  dataCriacao: new Date().toISOString(),
  cliente: { nome: '', tel: '', contato: '', endereco: '' },
  descricaoServico: '',
  observacoes: '',
  arquivos: [],
  itensInsumo: [],
  itensMaquina: [],
  moEscritorio: 40.0,
  frete: { distKm: 0, viagens: 1, pecas: 1, valorTotal: 0 },
  parcelamento: { prazoMeses: 0 },
  totais: {},
  analiseIA: null
};

let arquivosSelecionados = [];

/* ===============================================================
   INICIALIZAÇÃO DO FORMULÁRIO DE ORÇAMENTO
=============================================================== */
function inicializarFormularioOrcamento() {
  configurarDropzone();
  novoOrcamentoEmBranco(false);
}

function novoOrcamentoEmBranco(confirmar = true) {
  if (confirmar && !confirm('Deseja limpar os campos para iniciar um novo orçamento?')) return;

  orcamentoAtual = {
    id: null,
    numero: '',
    status: 'RASCUNHO',
    origem: 'manual',
    dataCriacao: new Date().toISOString(),
    cliente: { nome: '', tel: '', contato: '', endereco: '' },
    descricaoServico: '',
    observacoes: '',
    arquivos: [],
    itensInsumo: [
      { nome: '', qtd: 1, unidade: 'UN', preco: 0, subtotal: 0 }
    ],
    itensMaquina: [
      { nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 0, subtotal: 0 }
    ],
    moEscritorio: 0,
    frete: { distKm: 0, viagens: 1, pecas: 1, valorTotal: 0 },
    parcelamento: { prazoMeses: 0 },
    totais: {},
    analiseIA: null
  };

  arquivosSelecionados = [];
  renderizarArquivosPreview();

  // Preenche campos
  document.getElementById('formNumeroOrcamento').textContent = '#NOVO';
  document.getElementById('formStatusBadge').textContent = 'RASCUNHO';
  document.getElementById('formStatusBadge').className = 'status-badge RASCUNHO';
  document.getElementById('formOrigemBadge').textContent = 'MANUAL';
  document.getElementById('formDataExibicao').textContent = new Date().toLocaleDateString('pt-BR');

  document.getElementById('clienteNome').value = '';
  document.getElementById('clienteTel').value = '';
  document.getElementById('clienteContato').value = '';
  document.getElementById('clienteEndereco').value = '';
  document.getElementById('descricaoServico').value = '';
  document.getElementById('obsIA').value = '';
  document.getElementById('moEscritorio').value = '0.00';
  document.getElementById('freteDistKm').value = '0';
  document.getElementById('freteViagens').value = '1';
  document.getElementById('fretePecas').value = '1';
  document.getElementById('prazoMeses').value = '0';
  document.getElementById('prazoEntregaDias').value = '5';

  document.getElementById('bannerAuditoriaIA').style.display = 'none';

  renderizarTabelaInsumos();
  renderizarTabelaMaquinas();
  calcularTotais();
}

function carregarOrcamentoNoFormulario(orc) {
  orcamentoAtual = JSON.parse(JSON.stringify(orc));

  document.getElementById('formNumeroOrcamento').textContent = '#' + (orc.numero || '---');
  document.getElementById('formStatusBadge').textContent = orc.status || 'RASCUNHO';
  document.getElementById('formStatusBadge').className = `status-badge ${orc.status || 'RASCUNHO'}`;
  document.getElementById('formOrigemBadge').textContent = (orc.origem || 'MANUAL').toUpperCase();
  document.getElementById('formDataExibicao').textContent = new Date(orc.dataCriacao || Date.now()).toLocaleDateString('pt-BR');

  document.getElementById('clienteNome').value = orc.cliente?.nome || '';
  document.getElementById('clienteTel').value = orc.cliente?.tel || '';
  document.getElementById('clienteContato').value = orc.cliente?.contato || '';
  document.getElementById('clienteEndereco').value = orc.cliente?.endereco || '';
  document.getElementById('descricaoServico').value = orc.descricaoServico || '';
  document.getElementById('obsIA').value = orc.observacoes || '';

  document.getElementById('moEscritorio').value = orc.moEscritorio !== undefined ? orc.moEscritorio : 0;
  document.getElementById('freteDistKm').value = orc.frete?.distKm || 0;
  document.getElementById('freteViagens').value = orc.frete?.viagens || 1;
  document.getElementById('fretePecas').value = orc.frete?.pecas || 1;
  document.getElementById('prazoMeses').value = orc.parcelamento?.prazoMeses || 0;

  arquivosSelecionados = (orc.arquivos || []).map(a => ({
    nome: a.nome,
    tipo: a.tipo,
    url: a.url,
    base64: a.base64
  }));
  renderizarArquivosPreview();

  // Banner IA se houver análise
  const banner = document.getElementById('bannerAuditoriaIA');
  if (orc.analiseIA) {
    banner.style.display = 'flex';
    document.getElementById('aiAuditTitulo').textContent = `Análise de Engenharia (${orc.analiseIA.complexidade || 'MODERADA'})`;
    document.getElementById('aiAuditDesc').textContent = orc.analiseIA.observacaoTecnica || orc.analiseIA.observacao || 'Processado com suporte de IA.';
    
    const tagComp = document.getElementById('tagComplexidade');
    tagComp.textContent = `${orc.analiseIA.complexidade || 'MEDIA'} COMPLEXIDADE`;
    tagComp.className = `tag-pill complexidade-${(orc.analiseIA.complexidade || 'media').toLowerCase()}`;
    
    document.getElementById('tagModelo').textContent = (orc.analiseIA.modelo || 'CLAUDE 3.5 SONNET').toUpperCase();
  } else {
    banner.style.display = 'none';
  }

  renderizarTabelaInsumos();
  renderizarTabelaMaquinas();
  calcularTotais();

  showTab('novo-orcamento');
}

/* ===============================================================
   TABELAS DINÂMICAS: INSUMOS
=============================================================== */
function renderizarTabelaInsumos() {
  const tbody = document.getElementById('insumos-body');
  if (!tbody) return;

  const itens = (orcamentoAtual.itensInsumo && orcamentoAtual.itensInsumo.length)
    ? orcamentoAtual.itensInsumo
    : [{ nome: '', qtd: 1, unidade: 'UN', preco: 0 }];

  tbody.innerHTML = itens.map((item, idx) => `
    <tr data-idx="${idx}">
      <td><input type="text" list="datalist-insumos" class="ins-nome" value="${escapeHTML(item.nome)}" onchange="onInsumoNomeChange(this, ${idx})"></td>
      <td><input type="number" step="0.1" class="ins-qtd num" value="${item.qtd}" oninput="calcularTotais()"></td>
      <td><input type="text" class="ins-unid" value="${escapeHTML(item.unidade || 'UN')}" style="text-align:center;"></td>
      <td class="num"><input type="number" step="0.01" class="ins-preco num" value="${item.preco}" oninput="calcularTotais()"></td>
      <td class="num ins-subtotal">R$ ${(Number(item.qtd || 1) * Number(item.preco || 0)).toFixed(2)}</td>
      <td style="text-align:center;"><button type="button" class="btn-rm" onclick="removerInsumoRow(${idx})">✕</button></td>
    </tr>
  `).join('');
}

function addInsumoRow() {
  orcamentoAtual.itensInsumo.push({ nome: '', qtd: 1, unidade: 'UN', preco: 0 });
  renderizarTabelaInsumos();
  calcularTotais();
}

function removerInsumoRow(idx) {
  orcamentoAtual.itensInsumo.splice(idx, 1);
  if (orcamentoAtual.itensInsumo.length === 0) {
    orcamentoAtual.itensInsumo.push({ nome: '', qtd: 1, unidade: 'UN', preco: 0 });
  }
  renderizarTabelaInsumos();
  calcularTotais();
}

function onInsumoNomeChange(input, idx) {
  const val = input.value.trim().toLowerCase();
  const match = catalogoInsumos.find(i => i.nome.toLowerCase() === val);
  if (match) {
    const tr = input.closest('tr');
    tr.querySelector('.ins-preco').value = match.preco;
    tr.querySelector('.ins-unid').value = match.unidade;
    if (orcamentoAtual.itensInsumo[idx]) {
      orcamentoAtual.itensInsumo[idx].preco = match.preco;
      orcamentoAtual.itensInsumo[idx].unidade = match.unidade;
    }
  }
  calcularTotais();
}

/* ===============================================================
   TABELAS DINÂMICAS: MÁQUINAS / HORAS
=============================================================== */
function renderizarTabelaMaquinas() {
  const tbody = document.getElementById('maquinas-body');
  if (!tbody) return;

  const itens = (orcamentoAtual.itensMaquina && orcamentoAtual.itensMaquina.length)
    ? orcamentoAtual.itensMaquina
    : [{ nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 0 }];

  const qtdGeral = Math.max(1, parseFloat(document.getElementById('quantidadePecas')?.value) || 1);
  tbody.innerHTML = itens.map((item, idx) => {
    const horasTotal = (item.horas !== undefined && item.horas !== null) ? Number(item.horas) : 1;
    let horasUnit = 0;
    if (item.horasUnitarias !== undefined && item.horasUnitarias !== null && Number(item.horasUnitarias) > 0) {
      horasUnit = Number(item.horasUnitarias);
    } else {
      horasUnit = qtdGeral > 0 ? Number((horasTotal / qtdGeral).toFixed(3)) : horasTotal;
    }
    return `
    <tr data-idx="${idx}">
      <td><input type="text" list="datalist-maquinas" class="maq-nome" value="${escapeHTML(item.nome)}" onchange="onMaquinaNomeChange(this, ${idx})"></td>
      <td><textarea class="maq-desc" rows="2" placeholder="Passo a passo sequencial da operação...">${escapeHTML(item.descricao || '')}</textarea></td>
      <td>
        <select class="maq-regime" onchange="calcularTotais()">
          <option value="normal" ${item.regime === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="h50" ${item.regime === 'h50' ? 'selected' : ''}>+50% Extra</option>
          <option value="h100" ${item.regime === 'h100' ? 'selected' : ''}>+100% Noturno</option>
        </select>
      </td>
      <td><input type="number" step="0.001" min="0" class="maq-horas-unit num" value="${horasUnit}" title="Horas por peça" placeholder="0.000" oninput="onOrcamentoHorasUnitariasChange(this, ${idx})"></td>
      <td><input type="number" step="0.1" min="0" class="maq-horas num" value="${horasTotal}" title="Horas totais" placeholder="0.0" oninput="onOrcamentoHorasTotaisChange(this, ${idx})"></td>
      <td class="num"><input type="number" step="0.01" class="maq-valorHora num" value="${item.valorHora}" oninput="calcularTotais()"></td>
      <td class="num maq-subtotal">R$ 0,00</td>
      <td style="text-align:center;"><button type="button" class="btn-rm" onclick="removerMaquinaRow(${idx})">✕</button></td>
    </tr>
    `;
  }).join('');
}

function onOrcamentoHorasUnitariasChange(input, idx) {
  const tr = input.closest('tr');
  if (!tr) return;
  const hUnit = parseFloat(input.value) || 0;
  const qtdGeral = Math.max(1, parseFloat(document.getElementById('quantidadePecas')?.value) || 1);
  const inputTotal = tr.querySelector('.maq-horas');
  if (inputTotal) {
    const hTotal = Number((hUnit * qtdGeral).toFixed(2));
    inputTotal.value = hTotal;
    if (orcamentoAtual.itensMaquina && orcamentoAtual.itensMaquina[idx]) {
      orcamentoAtual.itensMaquina[idx].horas = hTotal;
      orcamentoAtual.itensMaquina[idx].horasUnitarias = hUnit;
    }
  }
  calcularTotais();
}

function onOrcamentoHorasTotaisChange(input, idx) {
  const tr = input.closest('tr');
  if (!tr) return;
  const hTotal = parseFloat(input.value) || 0;
  const qtdGeral = Math.max(1, parseFloat(document.getElementById('quantidadePecas')?.value) || 1);
  const inputUnit = tr.querySelector('.maq-horas-unit');
  if (inputUnit) {
    const hUnit = qtdGeral > 0 ? Number((hTotal / qtdGeral).toFixed(3)) : hTotal;
    inputUnit.value = hUnit;
    if (orcamentoAtual.itensMaquina && orcamentoAtual.itensMaquina[idx]) {
      orcamentoAtual.itensMaquina[idx].horas = hTotal;
      orcamentoAtual.itensMaquina[idx].horasUnitarias = hUnit;
    }
  }
  calcularTotais();
}

function addMaquinaRow() {
  orcamentoAtual.itensMaquina.push({ nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 25.0 });
  renderizarTabelaMaquinas();
  calcularTotais();
}

function removerMaquinaRow(idx) {
  orcamentoAtual.itensMaquina.splice(idx, 1);
  if (orcamentoAtual.itensMaquina.length === 0) {
    orcamentoAtual.itensMaquina.push({ nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 0 });
  }
  renderizarTabelaMaquinas();
  calcularTotais();
}

function onMaquinaNomeChange(input, idx) {
  const val = input.value.trim().toLowerCase();
  const match = catalogoMaquinas.find(m => m.nome.toLowerCase() === val);
  if (match) {
    const tr = input.closest('tr');
    tr.querySelector('.maq-valorHora').value = match.normal;
    if (orcamentoAtual.itensMaquina[idx]) {
      orcamentoAtual.itensMaquina[idx].valorHora = match.normal;
    }
  }
  calcularTotais();
}

/* ===============================================================
   CÁLCULO MATEMÁTICO E FINANCEIRO (FÓRMULAS NARDELLI)
=============================================================== */
function calcularTotais() {
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const fmt = v => (isNaN(v) ? 0 : v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // 1. Insumos
  let totalInsumos = 0;
  const rowsInsumo = document.querySelectorAll('#insumos-body tr');
  rowsInsumo.forEach(tr => {
    const qtd = num(tr.querySelector('.ins-qtd')?.value);
    const preco = num(tr.querySelector('.ins-preco')?.value);
    const sub = qtd * preco;
    const tdSub = tr.querySelector('.ins-subtotal');
    if (tdSub) tdSub.textContent = fmt(sub);
    totalInsumos += sub;
  });

  // 2. Máquinas e Horas
  let totalMaquina = 0;
  const rowsMaquina = document.querySelectorAll('#maquinas-body tr');
  rowsMaquina.forEach(tr => {
    const regime = tr.querySelector('.maq-regime')?.value || 'normal';
    const horas = num(tr.querySelector('.maq-horas')?.value);
    const valorHora = num(tr.querySelector('.maq-valorHora')?.value);
    const mult = regime === 'h50' ? 1.5 : (regime === 'h100' ? 2.0 : 1.0);
    const sub = horas * valorHora * mult;
    const tdSub = tr.querySelector('.maq-subtotal');
    if (tdSub) tdSub.textContent = fmt(sub);
    totalMaquina += sub;
  });

  const moEscritorio = num(document.getElementById('moEscritorio')?.value);
  const totalMO = totalMaquina + moEscritorio;

  // 3. Aplicação do BDI Nardelli
  const mcInsumo = num(appConfig.despFixasInsumo || 0.15) + num(appConfig.impostoInsumo || 0.1501) + num(appConfig.lucroInsumo || 0.15);
  const taxaInsumo = 1 - mcInsumo;
  const valorInsumoComMargem = taxaInsumo > 0 ? (totalInsumos / taxaInsumo) : totalInsumos;

  const mcMO = num(appConfig.despFixasMO || 0.30) + num(appConfig.impostoMO || 0.1501) + num(appConfig.lucroMO || 0.30);
  const taxaMO = 1 - mcMO;
  const valorMOComMargem = taxaMO > 0 ? (totalMO / taxaMO) : totalMO;

  // 4. Frete
  const distKm = num(document.getElementById('freteDistKm')?.value);
  const viagens = num(document.getElementById('freteViagens')?.value) || 1;
  const pecas = Math.max(num(document.getElementById('fretePecas')?.value) || 1, 1);
  const freteTotal = (distKm * num(appConfig.custoKm || 1.22) * 2 * viagens) / pecas;

  // 5. Fechamento Comercial
  const semDesconto = valorInsumoComMargem + valorMOComMargem + freteTotal;
  const margemDesc = num(appConfig.margemDesconto || 0.03);
  const comDesconto = semDesconto * (1 + margemDesc);

  const prazoMeses = num(document.getElementById('prazoMeses')?.value);
  const taxaJuros = prazoMeses * num(appConfig.jurosMensal || 0.015);
  const precoAPrazo = comDesconto * (1 + taxaJuros);

  const totalFinal = prazoMeses > 0 ? precoAPrazo : comDesconto;

  const qtdPecas = Math.max(num(document.getElementById('quantidadePecas')?.value) || 1, 1);
  const unidadePeca = (document.getElementById('unidadePeca')?.value || 'PÇ').toUpperCase();
  const valorUnitarioPeca = totalFinal / qtdPecas;
  const valorUnitarioPecaSemDesconto = semDesconto / qtdPecas;
  const custoMaterialUnitario = totalInsumos / qtdPecas;
  const custoMOUnitario = totalMO / qtdPecas;

  // Atualização dos elementos na tela
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  setTxt('txtTotalInsumosCusto', fmt(totalInsumos));
  setTxt('txtTotalMOCusto', fmt(totalMO));
  setTxt('freteCalculadoTxt', fmt(freteTotal));

  setTxt('valorInsumoComMargem', fmt(valorInsumoComMargem));
  setTxt('valorMOComMargem', fmt(valorMOComMargem));
  setTxt('valorFreteLinha', fmt(freteTotal));
  setTxt('valorSemDesconto', fmt(semDesconto));
  setTxt('labelMargemDesconto', `Com Margem de Desconto (${(margemDesc * 100).toFixed(1)}%):`);
  setTxt('valorComDesconto', fmt(comDesconto));

  setTxt('custoMaterialUnitarioTxt', `${fmt(custoMaterialUnitario)} / ${unidadePeca}`);
  setTxt('custoMOUnitarioTxt', `${fmt(custoMOUnitario)} / ${unidadePeca}`);
  setTxt('valorUnitarioPecaTxt', `${fmt(valorUnitarioPeca)} / ${unidadePeca}`);

  const linhaPrazo = document.getElementById('linhaPrazoWrap');
  if (prazoMeses > 0) {
    if (linhaPrazo) linhaPrazo.style.display = 'flex';
    setTxt('valorPrecoAPrazo', fmt(precoAPrazo));
    setTxt('stampCondicao', `Faturado em ${prazoMeses}x com juros`);
  } else {
    if (linhaPrazo) linhaPrazo.style.display = 'none';
    setTxt('stampCondicao', 'À Vista / Desconto Aplicado');
  }

  setTxt('stampTotalFinal', fmt(totalFinal));

  orcamentoAtual.quantidadePecas = qtdPecas;
  orcamentoAtual.unidadePeca = unidadePeca;
  orcamentoAtual.totais = {
    totalInsumos,
    valorInsumoComMargem,
    totalMO,
    valorMOComMargem,
    freteTotal,
    semDesconto,
    comDesconto,
    precoAPrazo,
    totalFinal,
    quantidadePecas: qtdPecas,
    unidadePeca,
    valorUnitarioPeca: Number(valorUnitarioPeca.toFixed(2)),
    valorUnitarioPecaSemDesconto: Number(valorUnitarioPecaSemDesconto.toFixed(2)),
    custoMaterialUnitario: Number(custoMaterialUnitario.toFixed(2)),
    custoMOUnitario: Number(custoMOUnitario.toFixed(2))
  };

  return orcamentoAtual.totais;
}

/* ===============================================================
   COLETAR DADOS DO FORMULÁRIO
=============================================================== */
function coletarOrcamentoDoDOM() {
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  orcamentoAtual.cliente = {
    nome: document.getElementById('clienteNome').value.trim(),
    tel: document.getElementById('clienteTel').value.trim(),
    contato: document.getElementById('clienteContato').value.trim(),
    endereco: document.getElementById('clienteEndereco').value.trim()
  };

  orcamentoAtual.descricaoServico = document.getElementById('descricaoServico').value.trim();
  orcamentoAtual.quantidadePecas = Math.max(1, num(document.getElementById('quantidadePecas')?.value) || 1);
  orcamentoAtual.unidadePeca = (document.getElementById('unidadePeca')?.value || 'PÇ').toUpperCase();
  orcamentoAtual.observacoes = document.getElementById('obsIA').value.trim();

  orcamentoAtual.itensInsumo = Array.from(document.querySelectorAll('#insumos-body tr')).map(tr => ({
    nome: tr.querySelector('.ins-nome')?.value.trim() || tr.querySelector('.nome')?.value.trim() || '',
    qtd: num(tr.querySelector('.ins-qtd')?.value || tr.querySelector('.qtd')?.value) || 1,
    unidade: (tr.querySelector('.ins-unid')?.value || tr.querySelector('.unidade')?.value || 'UN').trim().toUpperCase(),
    preco: num(tr.querySelector('.ins-preco')?.value || tr.querySelector('.preco')?.value) || 0
  })).filter(i => i.nome !== '');

  orcamentoAtual.itensMaquina = Array.from(document.querySelectorAll('#maquinas-body tr')).map(tr => ({
    nome: tr.querySelector('.maq-nome')?.value.trim() || '',
    descricao: tr.querySelector('.maq-desc')?.value.trim() || '',
    regime: tr.querySelector('.maq-regime')?.value || 'normal',
    horas: num(tr.querySelector('.maq-horas')?.value) || 1,
    valorHora: num(tr.querySelector('.maq-valorHora')?.value) || 0
  })).filter(m => m.nome !== '');

  orcamentoAtual.moEscritorio = num(document.getElementById('moEscritorio').value) || 0;
  orcamentoAtual.frete = {
    distKm: num(document.getElementById('freteDistKm').value) || 0,
    viagens: num(document.getElementById('freteViagens').value) || 1,
    pecas: num(document.getElementById('fretePecas').value) || 1
  };
  orcamentoAtual.parcelamento = {
    prazoMeses: num(document.getElementById('prazoMeses').value) || 0
  };
  orcamentoAtual.arquivos = arquivosSelecionados;

  return orcamentoAtual;
}

/* ===============================================================
   DISPARO DA IA (ROTEADOR + CLAUDE 3.5 SONNET)
=============================================================== */
async function executarAnaliseIA() {
  const descricao = document.getElementById('descricaoServico').value.trim();
  if (!descricao) {
    mostrarToast('Por favor, informe a descrição do serviço/peça antes de pedir análise à IA.');
    document.getElementById('descricaoServico').focus();
    return;
  }

  const btn = document.getElementById('btnGerarPreviaIA');
  btn.disabled = true;
  btn.innerHTML = '⚡ Analisando com IA & Claude Sonnet...';

  const observacoes = document.getElementById('obsIA')?.value.trim() || '';

  mostrarToast('1/2: Classificando complexidade do serviço...');

  try {
    const res = await fetch('/api/ia/gerar-previa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descricao,
        observacoes,
        arquivos: arquivosSelecionados
      })
    });

    const data = await res.json();
    if (!data.sucesso) {
      throw new Error(data.erro || 'Falha ao processar com IA');
    }

    const { resultado, triagemJev, modelo, origemIA } = data;

    // Atualiza tabela de insumos e máquinas com a resposta da IA
    orcamentoAtual.itensInsumo = resultado.insumos || [];
    orcamentoAtual.itensMaquina = resultado.operacoes || [];
    orcamentoAtual.moEscritorio = resultado.moEscritorio || 0;
    document.getElementById('moEscritorio').value = orcamentoAtual.moEscritorio;
    if (resultado.diasEntregaEstimados) {
      document.getElementById('prazoEntregaDias').value = resultado.diasEntregaEstimados;
    }

    renderizarTabelaInsumos();
    renderizarTabelaMaquinas();
    calcularTotais();

    // Banner de Auditoria de IA
    const banner = document.getElementById('bannerAuditoriaIA');
    banner.style.display = 'flex';
    document.getElementById('aiAuditTitulo').textContent = `Prévia Gerada com Sucesso (${origemIA || 'OpenRouter'})`;
    document.getElementById('aiAuditDesc').textContent = resultado.observacoesTecnicas || triagemJev?.justificativa || 'Usinagem dimensionada com catálogo Nardelli.';

    const tagComp = document.getElementById('tagComplexidade');
    const comp = triagemJev?.complexidade || 'MEDIA';
    tagComp.textContent = `${comp} COMPLEXIDADE`;
    tagComp.className = `tag-pill complexidade-${comp.toLowerCase()}`;

    document.getElementById('tagModelo').textContent = (modelo || 'CLAUDE 3.5 SONNET').toUpperCase();

    mostrarToast('✅ Prévia de orçamento gerada pela IA! Revise as quantidades e horas abaixo.');

    // Rola suavemente até as tabelas
    document.getElementById('painelPreviaContainer').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    mostrarToast('❌ Erro na análise com IA: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Gerar Prévia com IA (Claude Sonnet)';
  }
}

/* ===============================================================
   REFINAMENTO INTERATIVO DA PRÉVIA COM IA
=============================================================== */
async function executarRefinamentoIA() {
  const instrucao = document.getElementById('inputRefinarIA').value.trim();
  if (!instrucao) {
    mostrarToast('Digite o que deseja corrigir (ex: "aumenta 2h de solda").');
    return;
  }

  const btn = document.getElementById('btnRefinarIA');
  btn.disabled = true;
  btn.textContent = 'Ajustando...';

  coletarOrcamentoDoDOM();

  try {
    const res = await fetch('/api/ia/refinar-previa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orcamentoAtual,
        instrucaoUsuario: instrucao
      })
    });

    const data = await res.json();
    if (data.sucesso && data.resultado) {
      orcamentoAtual.itensInsumo = data.resultado.insumos || orcamentoAtual.itensInsumo;
      orcamentoAtual.itensMaquina = data.resultado.operacoes || orcamentoAtual.itensMaquina;
      orcamentoAtual.moEscritorio = data.resultado.moEscritorio || orcamentoAtual.moEscritorio;

      renderizarTabelaInsumos();
      renderizarTabelaMaquinas();
      calcularTotais();

      document.getElementById('inputRefinarIA').value = '';
      mostrarToast('✅ ' + (data.resultado.justificativaAjuste || 'Ajustes aplicados pela IA com sucesso!'));
    }
  } catch (err) {
    mostrarToast('Erro ao refinar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💬 Aplicar Ajuste';
  }
}

/* ===============================================================
   SALVAMENTO E APROVAÇÃO
=============================================================== */
async function salvarOrcamentoManual(statusDesejado = 'RASCUNHO') {
  coletarOrcamentoDoDOM();
  orcamentoAtual.status = statusDesejado;

  if (!orcamentoAtual.cliente.nome) {
    mostrarToast('Por favor, informe o nome do cliente antes de salvar.');
    document.getElementById('clienteNome').focus();
    return;
  }

  try {
    const metodo = orcamentoAtual.id ? 'PUT' : 'POST';
    const url = orcamentoAtual.id ? `/api/orcamentos/${orcamentoAtual.id}` : '/api/orcamentos';

    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orcamentoAtual)
    });

    const data = await res.json();
    if (data.sucesso) {
      orcamentoAtual = data.orcamento;
      document.getElementById('formNumeroOrcamento').textContent = '#' + orcamentoAtual.numero;
      document.getElementById('formStatusBadge').textContent = orcamentoAtual.status;
      document.getElementById('formStatusBadge').className = `status-badge ${orcamentoAtual.status}`;

      mostrarToast(`Orçamento #${orcamentoAtual.numero} salvo com status [${orcamentoAtual.status}]!`);
      if (typeof carregarListaOrcamentos === 'function') carregarListaOrcamentos();
      if (typeof atualizarKPIsGlobais === 'function') atualizarKPIsGlobais();
    }
  } catch (err) {
    mostrarToast('Erro ao salvar orçamento.');
  }
}

/* ===============================================================
   GERENCIAMENTO DE ARQUIVOS (DROPZONE)
=============================================================== */
function configurarDropzone() {
  const dropzone = document.getElementById('dropzoneArquivos');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    processarArquivos(files);
  });
}

function handleFileSelect(event) {
  const files = event.target.files;
  processarArquivos(files);
  event.target.value = '';
}

async function processarArquivos(files) {
  for (const f of Array.from(files)) {
    try {
      const base64 = await fileToBase64(f);
      arquivosSelecionados.push({
        nome: f.name,
        tipo: f.type || 'application/octet-stream',
        tamanho: f.size,
        base64
      });
    } catch (e) {
      console.warn('Erro ao ler arquivo:', f.name);
    }
  }
  renderizarArquivosPreview();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderizarArquivosPreview() {
  const container = document.getElementById('arquivosPreviewGrid');
  if (!container) return;

  container.innerHTML = arquivosSelecionados.map((arq, idx) => `
    <div class="file-preview-card">
      <div class="file-thumb">📎</div>
      <div class="file-info">
        <span class="file-name" title="${escapeHTML(arq.nome)}">${escapeHTML(arq.nome)}</span>
        <span class="file-size">${arq.tamanho ? (arq.tamanho / 1024).toFixed(0) + ' KB' : 'Arquivo anexado'}</span>
      </div>
      <button type="button" class="btn-rm" onclick="removerArquivo(${idx})">✕</button>
    </div>
  `).join('');
}

function removerArquivo(idx) {
  arquivosSelecionados.splice(idx, 1);
  renderizarArquivosPreview();
}

/* ===============================================================
   MODAL DE PROPOSTA COMERCIAL / PDF
=============================================================== */
function abrirModalProposta() {
  coletarOrcamentoDoDOM();
  const totais = calcularTotais();

  const fmt = v => (isNaN(v) ? 0 : v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  document.getElementById('propNumero').textContent = '#' + (orcamentoAtual.numero || '0001');
  document.getElementById('propData').textContent = 'Data: ' + new Date().toLocaleDateString('pt-BR');
  document.getElementById('propClienteNome').textContent = orcamentoAtual.cliente.nome || '(Cliente a Definir)';
  document.getElementById('propClienteTel').textContent = orcamentoAtual.cliente.tel || 'Não informado';
  document.getElementById('propClienteContato').textContent = orcamentoAtual.cliente.contato || '---';
  document.getElementById('propClienteEndereco').textContent = orcamentoAtual.cliente.endereco || 'Aracaju/SE';
  document.getElementById('propDescricaoServico').textContent = orcamentoAtual.descricaoServico || '(Sem descrição detalhada)';

  // Operações
  const tbodyOp = document.getElementById('propOperacoesTbody');
  tbodyOp.innerHTML = (orcamentoAtual.itensMaquina || []).map(m => `
    <tr>
      <td><b>${escapeHTML(m.nome)}</b></td>
      <td>${escapeHTML(m.descricao || 'Usinagem/processamento')}</td>
      <td style="text-align:right;">${m.horas} h</td>
    </tr>
  `).join('');

  // Insumos
  const tbodyIns = document.getElementById('propInsumosTbody');
  tbodyIns.innerHTML = (orcamentoAtual.itensInsumo || []).map(i => `
    <tr>
      <td>${escapeHTML(i.nome)}</td>
      <td style="text-align:right;">${i.qtd}</td>
      <td>${escapeHTML(i.unidade)}</td>
    </tr>
  `).join('');

  const prazoMeses = orcamentoAtual.parcelamento?.prazoMeses || 0;
  document.getElementById('propCondicaoPagto').textContent = prazoMeses > 0 ? `Parcelado em ${prazoMeses}x faturado` : 'À vista / Boleto faturado (Desconto pontualidade aplicado)';
  document.getElementById('propValorTotal').textContent = fmt(totais.totalFinal);
  document.getElementById('propPrazoEntrega').textContent = document.getElementById('prazoEntregaDias').value || '5';

  document.getElementById('modalPropostaOverlay').style.display = 'flex';
}

function fecharModalProposta() {
  document.getElementById('modalPropostaOverlay').style.display = 'none';
}
