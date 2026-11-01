/* ---------------------------------------------------------------
   ESTADO GLOBAL DA APLICAÇÃO — NARDELLI USINAGEM
--------------------------------------------------------------- */
let insumos = [];
let maquinas = [];
let config = {};
let orcamentosSalvos = [];
let conversas = [];
let conversaAtivaId = null;
let currentOrcId = uid();
let orcOriginal = {};
let arquivosPendentes = [];
let filtroOrigemAtivo = 'todos';
let filtroOrigemAbertosAtivo = 'todos';
let filtroEtapaAbertosAtivo = 'todos';
let usuarioLogado = null;

const TIPOS_IMAGEM_OK = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];

/* ---------------------------------------------------------------
   HELPERS
--------------------------------------------------------------- */
function uid() { return Math.random().toString(36).slice(2, 10); }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function fmt(v) { return (isNaN(v) ? 0 : v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
const fmtMoeda = fmt;
function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHTML(s) { return escapeAttr(s); }

function avisar(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'flex';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3400);
}

function mostrarErro(msg) {
  document.getElementById('erro-texto').textContent = msg;
  document.getElementById('erro').style.display = 'flex';
}

function showTab(id) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');

  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.navbtn[data-tab="${id}"]`);
  if (btn) btn.classList.add('active');

  if (id === 'clientes') {
    carregarClientes();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------------------------------------------
   LINHAS DE TABELA — ORÇAMENTO
--------------------------------------------------------------- */
function insumoRowHTML(d) {
  d = Object.assign({ nome: '', qtd: 1, unidade: 'UN', preco: 0 }, d);
  return '<tr>' +
    '<td><input list="lista-insumos" class="nome" value="' + escapeAttr(d.nome) + '" placeholder="Selecione ou digite o material/insumo..." onchange="onNomeInsumoChange(this)"></td>' +
    '<td><input type="number" step="0.01" class="qtd num" value="' + d.qtd + '" oninput="calcularTotais()"></td>' +
    '<td><input list="lista-unidades-insumos" class="unidade" value="' + escapeAttr(d.unidade || 'UN') + '" style="text-align:center; text-transform:uppercase;" placeholder="KG, PÇ..." onchange="this.value = this.value.toUpperCase(); calcularTotais();"></td>' +
    '<td><input type="number" step="0.01" class="preco num" value="' + d.preco + '" placeholder="0,00" oninput="calcularTotais()" onchange="onPrecoInsumoChange(this)"></td>' +
    '<td class="subtotal num">R$ 0,00</td>' +
    '<td style="text-align:center;"><button type="button" class="rm" onclick="this.closest(\'tr\').remove(); calcularTotais();">✕</button></td>' +
  '</tr>';
}

function maquinaRowHTML(d) {
  d = Object.assign({ nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 0, peca: '', etapa: 1, ordemProducao: 1 }, d);
  const pecaBadge = d.peca ? `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap;">
      <span style="background:#DBEAFE; color:#1E40AF; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; border:1px solid #BFDBFE;">
        📦 ${escapeHTML(d.peca)}
      </span>
      <span style="background:#F1F5F9; color:#475569; font-size:10px; font-weight:600; padding:1px 6px; border-radius:4px; border:1px solid #E2E8F0;">
        Etapa ${d.etapa || 1}
      </span>
    </div>` : '';

  return '<tr class="maquina-row" data-peca="' + escapeAttr(d.peca || '') + '" data-etapa="' + (d.etapa || 1) + '" data-ordem-producao="' + (d.ordemProducao || 1) + '">' +
    '<td>' +
      pecaBadge +
      '<input list="lista-maquinas" class="nome" value="' + escapeAttr(d.nome) + '" onchange="onNomeMaquinaChange(this)">' +
      '<input type="hidden" class="peca-val" value="' + escapeAttr(d.peca || '') + '">' +
      '<input type="hidden" class="etapa-val" value="' + (d.etapa || 1) + '">' +
      '<input type="hidden" class="ordem-val" value="' + (d.ordemProducao || 1) + '">' +
    '</td>' +
    '<td><textarea class="descricao" rows="2" style="min-height:44px;" placeholder="Passo a passo sequencial da operação...">' + escapeAttr(d.descricao) + '</textarea></td>' +
    '<td><select class="regime" onchange="calcularTotais()">' +
      '<option value="normal"' + (d.regime === 'normal' ? ' selected' : '') + '>Normal</option>' +
      '<option value="h50"' + (d.regime === 'h50' ? ' selected' : '') + '>50% Extra</option>' +
      '<option value="h100"' + (d.regime === 'h100' ? ' selected' : '') + '>100% Noturno</option>' +
    '</select></td>' +
    '<td><input type="number" step="0.1" class="horas num" value="' + d.horas + '" oninput="calcularTotais()"></td>' +
    '<td><input type="number" step="0.01" class="valorHora num" value="' + d.valorHora + '" oninput="calcularTotais()"></td>' +
    '<td class="subtotal num">R$ 0,00</td>' +
    '<td style="text-align:center;"><button type="button" class="rm" onclick="this.closest(\'tr\').remove(); calcularTotais();">✕</button></td>' +
  '</tr>';
}

function addInsumoRow() {
  document.getElementById('insumos-body').insertAdjacentHTML('beforeend', insumoRowHTML({}));
  calcularTotais();
}

function addMaquinaRow() {
  document.getElementById('maquinas-body').insertAdjacentHTML('beforeend', maquinaRowHTML({}));
  calcularTotais();
}

function onNomeInsumoChange(inputEl) {
  const tr = inputEl.closest('tr');
  const nome = inputEl.value.trim().toLowerCase();
  const match = insumos.find(i => i.nome.toLowerCase() === nome);
  if (match) {
    tr.querySelector('.preco').value = match.preco;
    tr.querySelector('.unidade').value = match.unidade;
  }
  calcularTotais();
}

function onNomeMaquinaChange(inputEl) {
  const tr = inputEl.closest('tr');
  const nome = inputEl.value.trim().toLowerCase();
  const match = maquinas.find(m => m.nome.toLowerCase() === nome);
  if (match) {
    tr.querySelector('.valorHora').value = match.normal;
  }
  calcularTotais();
}

/* ---------------------------------------------------------------
   SINCRONIZAÇÃO DE PREÇO COM O CATÁLOGO
--------------------------------------------------------------- */
let pendingCatalogSync = null;

function onPrecoInsumoChange(inputEl) {
  const tr = inputEl.closest('tr');
  if (!tr) return;
  const nome = tr.querySelector('.nome')?.value.trim();
  const novoPreco = num(inputEl.value);
  const unidade = tr.querySelector('.unidade')?.value.trim().toUpperCase() || 'UN';

  if (!nome || novoPreco <= 0) return;

  const match = insumos.find(i => i.nome.toLowerCase() === nome.toLowerCase());

  if (match && Math.abs(match.preco - novoPreco) > 0.001) {
    exibirCardSyncPrecoCatalogo({
      nome: match.nome,
      precoAntigo: match.preco,
      novoPreco: novoPreco,
      unidade: match.unidade || unidade,
      isNovo: false
    });
  } else if (!match) {
    exibirCardSyncPrecoCatalogo({
      nome: nome,
      precoAntigo: null,
      novoPreco: novoPreco,
      unidade: unidade,
      isNovo: true
    });
  }
}

function exibirCardSyncPrecoCatalogo({ nome, precoAntigo, novoPreco, unidade, isNovo }) {
  pendingCatalogSync = { nome, novoPreco, unidade };
  const card = document.getElementById('cardSincronizarPrecoCatalogo');
  const msg = document.getElementById('msgSyncPrecoCatalogo');
  if (!card || !msg) return;

  if (isNovo) {
    msg.innerHTML = `O material <b>"${escapeHTML(nome)}"</b> ainda não consta no catálogo. Deseja cadastrá-lo com o valor de <b>${fmt(novoPreco)} / ${escapeHTML(unidade)}</b> para os próximos orçamentos?`;
  } else {
    msg.innerHTML = `Você alterou o preço de <b>"${escapeHTML(nome)}"</b> de <s>${fmt(precoAntigo)}</s> para <b>${fmt(novoPreco)} / ${escapeHTML(unidade)}</b>. Deseja atualizar este valor no catálogo para os próximos orçamentos?`;
  }

  card.style.display = 'block';
}

function fecharCardSyncPrecoCatalogo() {
  const card = document.getElementById('cardSincronizarPrecoCatalogo');
  if (card) card.style.display = 'none';
  pendingCatalogSync = null;
}

async function confirmarSincronizacaoCatalogo() {
  if (!pendingCatalogSync) return;
  const { nome, novoPreco, unidade } = pendingCatalogSync;
  try {
    const res = await fetch('/api/catalogo/insumos/atualizar-preco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, novoPreco, unidade })
    });
    const data = await res.json();
    if (data.sucesso) {
      insumos = data.insumos || insumos;
      renderDatalistInsumos();
      avisar(`✅ Preço de "${nome}" atualizado no catálogo para ${fmt(novoPreco)} / ${unidade}!`);
      fecharCardSyncPrecoCatalogo();
    } else {
      mostrarErro(data.erro || 'Erro ao sincronizar com o catálogo.');
    }
  } catch (e) {
    mostrarErro('Erro ao atualizar o catálogo: ' + e.message);
  }
}

/* ---------------------------------------------------------------
   CÁLCULOS (FÓRMULAS OFICIAIS NARDELLI)
--------------------------------------------------------------- */
function calcularTotais() {
  let totalInsumos = 0;
  document.querySelectorAll('#insumos-body tr').forEach(tr => {
    const qtd = num(tr.querySelector('.qtd')?.value);
    const preco = num(tr.querySelector('.preco')?.value);
    const sub = qtd * preco;
    const tdSub = tr.querySelector('.subtotal');
    if (tdSub) tdSub.textContent = fmt(sub);
    totalInsumos += sub;
  });

  let totalMaquina = 0;
  document.querySelectorAll('#maquinas-body tr').forEach(tr => {
    const regime = tr.querySelector('.regime')?.value || 'normal';
    const valorHora = num(tr.querySelector('.valorHora')?.value);
    const horas = num(tr.querySelector('.horas')?.value);
    const rate = regime === 'h50' ? valorHora * 1.5 : (regime === 'h100' ? valorHora * 2 : valorHora);
    const sub = horas * rate;
    const tdSub = tr.querySelector('.subtotal');
    if (tdSub) tdSub.textContent = fmt(sub);
    totalMaquina += sub;
  });

  const moEscritorio = num(document.getElementById('moEscritorio')?.value);
  const totalMO = totalMaquina + moEscritorio;

  const mcInsumo = num(config.despFixasInsumo || 0.15) + num(config.impostoInsumo || 0.1501) + num(config.lucroInsumo || 0.15);
  const taxaInsumo = 1 - mcInsumo;
  const valorInsumoComMargem = taxaInsumo > 0 ? (totalInsumos / taxaInsumo) : totalInsumos;

  const mcMO = num(config.despFixasMO || 0.30) + num(config.impostoMO || 0.1501) + num(config.lucroMO || 0.30);
  const taxaMO = 1 - mcMO;
  const valorMOComMargem = taxaMO > 0 ? (totalMO / taxaMO) : totalMO;

  const freteAtivo = isFreteAtivo();
  const distKm = num(document.getElementById('freteDistKm')?.value);
  const viagens = num(document.getElementById('freteViagens')?.value) || 1;
  const pecas = Math.max(num(document.getElementById('fretePecas')?.value) || 1, 1);
  const custoKm = num(config.custoKm || 1.22);
  const freteTotal = freteAtivo ? ((distKm * custoKm * 2 * viagens) / pecas) : 0;

  const semDesconto = valorInsumoComMargem + valorMOComMargem + freteTotal;
  const comDesconto = semDesconto * (1 + num(config.margemDesconto || 0.03));
  const prazoMeses = num(document.getElementById('prazoMeses')?.value);
  const taxaJuros = prazoMeses * num(config.jurosMensal || 0.015);
  const precoAPrazo = comDesconto * (1 + taxaJuros);

  // Parâmetros de quantidade e unidade da peça
  const qtdPecas = Math.max(num(document.getElementById('quantidadePecas')?.value) || 1, 1);
  const unidadePeca = (document.getElementById('unidadePeca')?.value || 'PÇ').toUpperCase();

  const totalFinal = prazoMeses > 0 ? precoAPrazo : comDesconto;
  const valorUnitarioPeca = totalFinal / qtdPecas;
  const valorUnitarioPecaSemDesconto = semDesconto / qtdPecas;
  const valorUnitarioPecaPrazo = precoAPrazo / qtdPecas;
  const custoMaterialUnitario = totalInsumos / qtdPecas;
  const custoMOUnitario = totalMO / qtdPecas;

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setTxt('totalInsumos', fmt(totalInsumos));
  setTxt('valorInsumoMargem', fmt(valorInsumoComMargem));
  setTxt('totalMO', fmt(totalMO));
  setTxt('valorMOMargem', fmt(valorMOComMargem));
  setTxt('custoKmTxt', custoKm.toFixed(2).replace('.', ','));
  if (freteAtivo) {
    setTxt('freteTotalTxt', fmt(freteTotal));
    setTxt('freteTotalTxt2', fmt(freteTotal));
    setTxt('valorFreteBadgeColeta', fmt(freteTotal));
    setTxt('distKmBadgeColeta', `${distKm} km`);
  } else {
    setTxt('freteTotalTxt', 'R$ 0,00 (desativado)');
    setTxt('freteTotalTxt2', 'R$ 0,00 (retirada oficina)');
    setTxt('valorFreteBadgeColeta', 'R$ 0,00');
    setTxt('distKmBadgeColeta', '0 km');
  }
  setTxt('semDesconto', fmt(semDesconto));
  setTxt('labelDesconto', 'Com margem de desconto (' + ((config.margemDesconto || 0.03) * 100).toFixed(1) + '%)');
  setTxt('comDesconto', fmt(comDesconto));

  // Rateio e Valores Unitários de Insumos e Mão de Obra
  setTxt('custoMaterialUnitarioTxt', `${fmt(custoMaterialUnitario)} / ${unidadePeca}`);
  setTxt('custoMOUnitarioTxt', `${fmt(custoMOUnitario)} / ${unidadePeca}`);

  const linhaPrazo = document.getElementById('linhaPrazo');
  if (prazoMeses > 0) {
    if (linhaPrazo) linhaPrazo.style.display = 'flex';
    setTxt('precoAPrazo', fmt(precoAPrazo));
  } else {
    if (linhaPrazo) linhaPrazo.style.display = 'none';
  }

  // Valor Unitário da Peça
  setTxt('labelUnidadePecaFechamento', `${unidadePeca}`);
  setTxt('txtResumoQtdUnid', `${qtdPecas} ${unidadePeca}`);
  setTxt('txtQtdTotalFinal', `${qtdPecas} ${unidadePeca}`);
  setTxt('valorUnitarioPecaTxt', `${fmt(valorUnitarioPeca)} / ${unidadePeca}`);

  const linhaUnitPrazo = document.getElementById('linhaValorUnitarioPrazo');
  if (prazoMeses > 0) {
    if (linhaUnitPrazo) linhaUnitPrazo.style.display = 'flex';
    setTxt('valorUnitarioPrazoTxt', `${fmt(valorUnitarioPecaPrazo)} / ${unidadePeca}`);
  } else {
    if (linhaUnitPrazo) linhaUnitPrazo.style.display = 'none';
  }

  setTxt('totalFinalStamp', fmt(totalFinal));

  return {
    totalInsumos,
    valorInsumoComMargem,
    totalMO,
    valorMOComMargem,
    freteTotal,
    semDesconto,
    comDesconto,
    precoAPrazo,
    prazoMeses,
    totalFinal,
    quantidadePecas: qtdPecas,
    unidadePeca,
    valorUnitarioPeca: Number(valorUnitarioPeca.toFixed(2)),
    valorUnitarioPecaSemDesconto: Number(valorUnitarioPecaSemDesconto.toFixed(2)),
    valorUnitarioPecaPrazo: Number(valorUnitarioPecaPrazo.toFixed(2)),
    custoMaterialUnitario: Number(custoMaterialUnitario.toFixed(2)),
    custoMOUnitario: Number(custoMOUnitario.toFixed(2))
  };
}

/* ---------------------------------------------------------------
   CONTROLE DE FRETE, DISTÂNCIA E CONSULTA DE CEP
--------------------------------------------------------------- */
function isFreteAtivo() {
  const check = document.getElementById('checkFreteAtivo');
  if (check) return !!check.checked;
  const opt = document.getElementById('opcaoFrete');
  if (opt) return opt.value === 'com_frete';
  return false;
}

function atualizarVisibilidadePaineisFrete(ativo) {
  const painelDetalhes = document.getElementById('painelFreteDetalhes');
  const painelDesativado = document.getElementById('painelFreteDesativado');
  const blocoColeta = document.getElementById('blocoInfoFreteColeta');
  const check = document.getElementById('checkFreteAtivo');
  const opt = document.getElementById('opcaoFrete');

  if (check && check.checked !== !!ativo) check.checked = !!ativo;
  if (opt) {
    const targetVal = ativo ? 'com_frete' : 'sem_frete';
    if (opt.value !== targetVal) opt.value = targetVal;
  }

  if (painelDetalhes) painelDetalhes.style.display = ativo ? 'block' : 'none';
  if (painelDesativado) painelDesativado.style.display = ativo ? 'none' : 'block';
  if (blocoColeta) blocoColeta.style.display = ativo ? 'block' : 'none';
}

function toggleCheckFrete(checked) {
  atualizarVisibilidadePaineisFrete(checked);
  if (checked) {
    const distAtual = num(document.getElementById('freteDistKm')?.value);
    if (distAtual === 0) {
      recalcularDistanciaPeloEndereco(true);
    }
  }
  calcularTotais();
}

function aoMudarOpcaoFrete(val) {
  const ativo = val === 'com_frete';
  toggleCheckFrete(ativo);
}

function formatarEConsultarCEP(val) {
  const input = document.getElementById('clienteCep');
  if (!input) return;
  let digits = (val || '').replace(/\D/g, '').slice(0, 8);
  let formatado = digits;
  if (digits.length > 5) {
    formatado = digits.slice(0, 5) + '-' + digits.slice(5);
  }
  input.value = formatado;

  if (digits.length === 8) {
    consultarCEP(digits);
  }
}

let consultandoCep = false;
async function consultarCEP(cepRaw) {
  const clean = (cepRaw || '').replace(/\D/g, '');
  if (clean.length !== 8) return;
  if (consultandoCep) return;
  consultandoCep = true;

  const spinner = document.getElementById('cepSpinner');
  if (spinner) spinner.style.display = 'inline';

  try {
    const res = await fetch(`/api/cep/${clean}`);
    const data = await res.json();
    if (data.sucesso) {
      const parts = [];
      if (data.logradouro) parts.push(data.logradouro);
      if (data.bairro) parts.push(data.bairro);
      if (data.cidade) {
        parts.push(data.uf ? `${data.cidade} - ${data.uf}` : data.cidade);
      }
      const endFormatado = parts.join(', ');
      
      const elEnd = document.getElementById('clienteEndereco');
      if (elEnd && (!elEnd.value.trim() || !elEnd.value.includes(data.cidade))) {
        elEnd.value = endFormatado;
      }

      if (data.distanciaKm !== undefined && data.distanciaKm !== null) {
        const elDist = document.getElementById('freteDistKm');
        if (elDist) elDist.value = data.distanciaKm;
        
        const aviso = document.getElementById('freteAvisoDestino');
        if (aviso) {
          aviso.textContent = `📍 Rota estimada: Nardelli (Aracaju) ➔ ${data.cidade}/${data.uf} (${data.distanciaKm} km)`;
        }
        const badgeDest = document.getElementById('destinoBadgeColeta');
        if (badgeDest) badgeDest.textContent = `${data.cidade}/${data.uf}`;
      }

      avisar(`✅ CEP identificado: ${data.cidade}/${data.uf} (${data.distanciaKm || 0} km da oficina)`);
      calcularTotais();
    } else {
      avisar('CEP não localizado automaticamente. Você pode digitar o endereço.');
    }
  } catch (err) {
    console.warn('Erro ao consultar CEP:', err);
  } finally {
    if (spinner) spinner.style.display = 'none';
    consultandoCep = false;
  }
}

let timerDebounceEndereco = null;
function aoDigitarEndereco(val) {
  clearTimeout(timerDebounceEndereco);
  timerDebounceEndereco = setTimeout(() => {
    if ((val || '').trim().length >= 4) {
      recalcularDistanciaPeloEndereco(true);
    }
  }, 1200);
}

async function recalcularDistanciaPeloEndereco(silencioso = false) {
  const endereco = document.getElementById('clienteEndereco')?.value.trim() || '';
  const cep = document.getElementById('clienteCep')?.value.trim() || '';
  if (!endereco && !cep) {
    if (!silencioso) avisar('Informe o CEP ou Endereço para calcular a distância do frete.');
    return;
  }

  try {
    const res = await fetch('/api/frete/calcular-distancia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endereco, cep })
    });
    const data = await res.json();
    if (data.sucesso && data.distanciaKm !== undefined) {
      const elDist = document.getElementById('freteDistKm');
      if (elDist) elDist.value = data.distanciaKm;

      const aviso = document.getElementById('freteAvisoDestino');
      if (aviso) {
        aviso.textContent = `📍 Rota estimada: Nardelli (Aracaju) ➔ ${data.cidade || 'Destino'} (${data.distanciaKm} km)`;
      }
      const badgeDest = document.getElementById('destinoBadgeColeta');
      if (badgeDest && data.cidade) badgeDest.textContent = `${data.cidade}/${data.uf || 'SE'}`;

      calcularTotais();
      if (!silencioso) {
        avisar(`✅ Distância calculada: ${data.distanciaKm} km (${data.cidade || 'Destino'})`);
      }
    }
  } catch (err) {
    console.warn('Erro ao recalcular frete:', err);
  }
}

async function formatarEConsultarCEPEmModal(val) {
  const input = document.getElementById('modalClienteCep');
  if (!input) return;
  let digits = (val || '').replace(/\D/g, '').slice(0, 8);
  let formatado = digits;
  if (digits.length > 5) {
    formatado = digits.slice(0, 5) + '-' + digits.slice(5);
  }
  input.value = formatado;

  if (digits.length === 8) {
    try {
      const res = await fetch(`/api/cep/${digits}`);
      const data = await res.json();
      if (data.sucesso) {
        const parts = [];
        if (data.logradouro) parts.push(data.logradouro);
        if (data.bairro) parts.push(data.bairro);
        if (data.cidade) parts.push(data.uf ? `${data.cidade} - ${data.uf}` : data.cidade);
        const elEnd = document.getElementById('modalClienteEndereco');
        if (elEnd) elEnd.value = parts.join(', ');
      }
    } catch (e) {
      console.warn('Erro CEP modal:', e);
    }
  }
}

/* ---------------------------------------------------------------
   ORÇAMENTO — CARREGAR, NOVO, SALVAR
--------------------------------------------------------------- */
function renderizarBannerMaterial(info = {}) {
  const banner = document.getElementById('iaMaterialBanner');
  if (!banner) return;
  const { materialDefinido, materialOrigem, justificativaMaterial } = info;
  if (!materialDefinido && !justificativaMaterial) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'block';
  const elNome = document.getElementById('iaMaterialNome');
  const elJust = document.getElementById('iaMaterialJustificativa');
  const elBadge = document.getElementById('iaMaterialBadge');
  const elAviso = document.getElementById('iaMaterialAvisoNaoListado');

  if (elNome) elNome.textContent = materialDefinido || 'Material Selecionado';
  if (elJust) elJust.textContent = justificativaMaterial || 'Matéria-prima técnica selecionada para atendimento dos requisitos de resistência e usinagem da peça.';

  if (elAviso) {
    elAviso.style.display = materialOrigem === 'sugerido_ideal' ? 'inline-block' : 'none';
  }

  if (elBadge) {
    if (materialOrigem === 'cliente') {
      elBadge.style.background = '#EFF6FF';
      elBadge.style.color = '#1E40AF';
      elBadge.style.borderColor = '#BFDBFE';
      elBadge.textContent = '👤 ESPECIFICADA PELO CLIENTE';
    } else if (materialOrigem === 'sugerido_ideal') {
      elBadge.style.background = '#FEF3C7';
      elBadge.style.color = '#92400E';
      elBadge.style.borderColor = '#FCD34D';
      elBadge.textContent = '⭐ SUGESTÃO IDEAL DA IA (NÃO LISTADA NO CATÁLOGO)';
    } else {
      elBadge.style.background = '#DCFCE7';
      elBadge.style.color = '#15803D';
      elBadge.style.borderColor = '#86EFAC';
      elBadge.textContent = '✨ MATÉRIA-PRIMA SELECIONADA PELA IA';
    }
  }
}

function renderizarBannerReferenciaHistorica(ref) {
  const box = document.getElementById('iaReferenciaBox');
  if (!box) return;

  if (!ref || !ref.usouReferencia) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  const elTitulo = document.getElementById('iaRefTitulo');
  const elMotivo = document.getElementById('iaRefMotivo');
  const elAjustes = document.getElementById('iaRefAjustesEvitados');

  if (elTitulo) {
    elTitulo.textContent = `Calibrado com base no Orçamento #${ref.orcamentoNumero || ''} (Validado por Humano)`;
  }
  if (elMotivo) {
    elMotivo.textContent = `${ref.motivoJev || 'Serviço com características e processos similares.'} ${ref.aprendizadoChave ? '— ' + ref.aprendizadoChave : ''}`;
  }
  if (elAjustes) {
    if (ref.ajustesPrevios) {
      elAjustes.textContent = `💡 Calibrações prévias do engenheiro aplicadas: "${ref.ajustesPrevios}"`;
      elAjustes.style.display = 'block';
    } else {
      elAjustes.textContent = `✓ Proposta baseada diretamente no padrão de tempos aprovado pela equipe técnica.`;
      elAjustes.style.display = 'block';
    }
  }
}

function renderizarRoteiroProducaoMultiPecas(dados) {
  const painel = document.getElementById('painelRoteiroMultiPecas');
  const badgeIndicador = document.getElementById('badgeIndicadorMultiPecas');
  const listaPecasEl = document.getElementById('listaRoteiroPecas');
  const badgeQtd = document.getElementById('badgeQtdPecasConjunto');

  if (!painel || !listaPecasEl) return;
  if (!dados) {
    painel.style.display = 'none';
    if (badgeIndicador) badgeIndicador.style.display = 'none';
    return;
  }

  const operacoes = dados.itensMaquina || dados.operacoes || [];
  const pecasDefinidas = dados.pecas || [];

  // Agrupa operações por peça
  const pecasMap = new Map();
  operacoes.forEach(op => {
    const nomePeca = (op.peca && op.peca.trim()) ? op.peca.trim() : 'Peça Principal';
    if (!pecasMap.has(nomePeca)) {
      pecasMap.set(nomePeca, []);
    }
    pecasMap.get(nomePeca).push(op);
  });

  const ehMulti = !!dados.ehConjuntoMultiPecas || (pecasMap.size > 1 && !(pecasMap.size === 1 && pecasMap.has('Peça Principal')));

  if (!ehMulti || pecasMap.size === 0) {
    painel.style.display = 'none';
    if (badgeIndicador) badgeIndicador.style.display = 'none';
    return;
  }

  painel.style.display = 'block';
  if (badgeIndicador) badgeIndicador.style.display = 'inline-block';
  if (badgeQtd) {
    const count = pecasMap.size;
    badgeQtd.textContent = `${count} Componente${count > 1 ? 's' : ''} Fabricados Juntos`;
  }

  // Gera HTML visual para cada peça do conjunto
  let html = '';
  let idx = 0;
  for (const [nomePeca, ops] of pecasMap.entries()) {
    idx++;
    // Ordena etapas daquela peça
    ops.sort((a, b) => (Number(a.etapa) || 0) - (Number(b.etapa) || 0));

    // Busca metadados da peça se houver
    const metaPeca = pecasDefinidas.find(p => p.nome && (p.nome.toLowerCase() === nomePeca.toLowerCase() || nomePeca.toLowerCase().includes(p.nome.toLowerCase())));
    const matTxt = metaPeca?.material ? ` · Material: <b>${escapeHTML(metaPeca.material)}</b>` : '';
    const qtdTxt = metaPeca?.quantidade ? ` (${metaPeca.quantidade} un)` : '';

    const ehMontagem = nomePeca.toLowerCase().includes('montagem');
    const iconePeca = ehMontagem ? '🔧' : (idx === 1 ? '🔹' : (idx === 2 ? '🔸' : '▫️'));
    const corCard = ehMontagem ? '#F0FDF4' : '#FFFFFF';
    const bordaCard = ehMontagem ? '#BBF7D0' : '#E2E8F0';

    html += `
      <div style="background:${corCard}; border:1px solid ${bordaCard}; border-radius:6px; padding:10px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:4px;">
          <div style="font-size:12px; font-weight:700; color:#1E293B; display:flex; align-items:center; gap:6px;">
            <span>${iconePeca}</span>
            <span>${escapeHTML(nomePeca)}${qtdTxt}</span>
            <span style="font-size:11px; font-weight:400; color:#64748B;">${matTxt}</span>
          </div>
          <span style="font-size:10px; font-weight:700; background:#E2E8F0; color:#334155; padding:2px 8px; border-radius:12px;">
            ${ops.length} etapa${ops.length > 1 ? 's' : ''} de usinagem
          </span>
        </div>
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
    `;

    ops.forEach((op, opIdx) => {
      const etapaNum = op.etapa || (opIdx + 1);
      const horasNum = Number(op.horas) || 1;
      const maquinaCurta = (op.nome || op.maquina || 'Máquina').replace(/\(.*?\)/g, '').trim();

      html += `
        <div style="display:inline-flex; align-items:center; gap:5px; background:#F8FAFC; border:1px solid #CBD5E1; border-radius:5px; padding:4px 8px; font-size:11px;">
          <span style="font-weight:700; color:var(--azul); background:#EFF6FF; padding:1px 5px; border-radius:3px; border:1px solid #BFDBFE;">${etapaNum}ª</span>
          <span style="font-weight:600; color:#1E293B;" title="${escapeAttr(op.descricao || '')}">${escapeHTML(maquinaCurta)}</span>
          <span style="color:#64748B; font-size:10px;">(${horasNum}h)</span>
        </div>
      `;

      if (opIdx < ops.length - 1) {
        html += `<span style="color:#94A3B8; font-size:12px; font-weight:bold;">➔</span>`;
      }
    });

    html += `
        </div>
      </div>
    `;
  }

  listaPecasEl.innerHTML = html;
}

function novoOrcamentoObjPadrao() {
  return {
    id: uid(),
    numero: '',
    data: new Date().toISOString().split('T')[0],
    cliente: { nome: '', tel: '', cep: '', endereco: '' },
    descricaoServico: '',
    categoriaPeca: 'Usinagem Geral',
    quantidadePecas: 1,
    unidadePeca: 'PÇ',
    prazoDesejado: '',
    materialPeca: '',
    tratamentoTermico: 'Nenhum',
    durezaDesejada: '',
    detalhesTermico: '',
    itensInsumo: [{ nome: '', qtd: 1, unidade: 'UN', preco: 0 }],
    itensMaquina: [{ nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 0 }],
    moEscritorio: 0,
    frete: { ativo: false, opcao: 'sem_frete', distKm: 0, viagens: 1, pecas: 1 },
    parcelamento: { prazoMeses: 0 },
    origem: 'manual',
    status: 'EM_ANDAMENTO',
    visualizado: true
  };
}

function carregarOrcamentoNoFormulario(d) {
  currentOrcId = d.id;
  orcOriginal = d || {};
  document.getElementById('numero').value = d.numero || '';
  document.getElementById('data').value = d.data || (d.dataCriacao ? d.dataCriacao.split('T')[0] : '');
  document.getElementById('clienteNome').value = (d.cliente && d.cliente.nome) || '';
  document.getElementById('clienteTel').value = (d.cliente && (d.cliente.tel || d.cliente.telefone)) || '';
  document.getElementById('clienteCep').value = (d.cliente && d.cliente.cep) || '';
  document.getElementById('clienteEndereco').value = (d.cliente && d.cliente.endereco) || '';
  sincronizarSelectClienteComFormulario((d.cliente && d.cliente.nome) || '');
  document.getElementById('descricaoServico').value = d.descricaoServico || '';

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v !== undefined && v !== null ? v : ''; };
  setVal('categoriaPeca', d.categoriaPeca || d.itemType || 'Usinagem Geral');
  setVal('quantidadePecas', d.quantidadePecas || d.quantidade || 1);
  setVal('unidadePeca', (d.unidadePeca || d.unidade || 'PÇ').toUpperCase());
  setVal('prazoDesejado', d.prazoDesejado || d.prazo || '');
  
  const matVal = d.materialPeca || d.material || '';
  const selMat = document.getElementById('materialPeca');
  if (selMat) {
    if (matVal) {
      let opt = Array.from(selMat.options).find(o => o.value === matVal || (o.value && o.value.toLowerCase() === matVal.toLowerCase()));
      if (!opt) {
        const novaOpt = document.createElement('option');
        novaOpt.value = matVal;
        novaOpt.textContent = matVal;
        selMat.appendChild(novaOpt);
      }
      selMat.value = matVal;
    } else {
      selMat.value = '';
    }
  }

  // Se o orçamento já possuía análise ou justificativa de material, renderiza o banner
  if (d.materialDefinido || d.justificativaMaterial) {
    renderizarBannerMaterial({
      materialDefinido: d.materialDefinido || matVal,
      materialOrigem: d.materialOrigem || (matVal ? 'cliente' : 'catalogo'),
      justificativaMaterial: d.justificativaMaterial || ''
    });
  } else {
    renderizarBannerMaterial({});
  }

  setVal('tratamentoTermico', d.tratamentoTermico || d.tratamento || 'Nenhum');
  setVal('durezaDesejada', d.durezaDesejada || d.dureza || '');
  setVal('detalhesTermico', d.detalhesTermico || '');

  const itensInsumo = (d.itensInsumo && d.itensInsumo.length) ? d.itensInsumo : [{ nome: '', qtd: 1, unidade: '', preco: 0 }];
  const itensMaquina = (d.itensMaquina && d.itensMaquina.length) ? d.itensMaquina : [{ nome: '', descricao: '', regime: 'normal', horas: 1, valorHora: 0 }];

  document.getElementById('insumos-body').innerHTML = itensInsumo.map(insumoRowHTML).join('');
  document.getElementById('maquinas-body').innerHTML = itensMaquina.map(maquinaRowHTML).join('');

  document.getElementById('moEscritorio').value = d.moEscritorio !== undefined ? d.moEscritorio : 0;

  const freteAtivo = !!((d.frete && (d.frete.ativo === true || d.frete.opcao === 'com_frete')) || (d.frete && d.frete.distKm > 0 && d.frete.ativo !== false));
  atualizarVisibilidadePaineisFrete(freteAtivo);
  document.getElementById('freteDistKm').value = (d.frete && d.frete.distKm) || 0;
  document.getElementById('freteViagens').value = (d.frete && d.frete.viagens) || 1;
  document.getElementById('fretePecas').value = (d.frete && d.frete.pecas) || d.quantidadePecas || d.quantidade || 1;
  document.getElementById('prazoMeses').value = (d.parcelamento && d.parcelamento.prazoMeses) || 0;

  // Carrega observações / especificações vindas do site ou salvas
  document.getElementById('obsIA').value = d.observacoes || '';

  // Carrega anexos/imagens vinculados
  arquivosPendentes = (d.arquivos || []).map(a => ({
    nome: a.nome,
    mediaType: a.tipo || 'image/jpeg',
    base64: a.base64 || '',
    url: a.url || ''
  }));
  renderArquivosPendentes();

  // Banner Informativo de Vídeo da Peça
  const videoBox = document.getElementById('orcamentoVideoBox');
  if (videoBox) {
    let temVideo = false;
    let htmlVideo = '';
    const vInfo = d.videoInfo || {};
    let linkVideo = vInfo.linkVideo;
    let pendenteContato = vInfo.pendenteContato;

    if (!linkVideo && d.observacoes) {
      const matchUrl = d.observacoes.match(/https?:\/\/[^\s|]+/);
      if (matchUrl) linkVideo = matchUrl[0];
    }
    if (!pendenteContato && d.observacoes && d.observacoes.includes('prefere que a equipe entre em contato para receber o vídeo')) {
      pendenteContato = true;
    }

    if (linkVideo) {
      temVideo = true;
      htmlVideo = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📹</span>
          <div>
            <b>Vídeo da peça informado pelo cliente:</b>
            <div style="font-size:11px; color:var(--texto-suave);">${escapeHTML(linkVideo)}</div>
          </div>
        </div>
        <a href="${escapeAttr(linkVideo)}" target="_blank" class="btn btn-primary" style="padding:5px 12px; font-size:11px; text-decoration:none;">
          ▶️ Assistir Vídeo da Peça
        </a>
      `;
      videoBox.className = 'orcamento-video-banner';
    } else if (pendenteContato) {
      temVideo = true;
      let fone = (d.cliente?.tel || d.cliente?.telefone || '').replace(/\D/g, '');
      if (fone && fone.length <= 11 && !fone.startsWith('55')) fone = '55' + fone;
      const textoMsg = `Olá ${d.cliente?.nome || ''}, aqui é da Nardelli Usinagem! Recebemos sua solicitação de orçamento #${d.numero || ''} pelo site. Você marcou que tem um vídeo da peça, pode nos enviar por aqui?`;
      const urlWhats = fone ? `https://web.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(textoMsg)}` : '#';

      htmlVideo = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📹</span>
          <div>
            <b style="color:#C2410C;">Atenção: Cliente aguarda contato para enviar vídeo!</b>
            <div style="font-size:11px; color:var(--texto-suave);">O cliente marcou no formulário do site que possui vídeo da peça para encaminhar via WhatsApp.</div>
          </div>
        </div>
        <a href="${urlWhats}" target="_blank" class="btn btn-whatsapp-web" style="padding:5px 12px; font-size:11px; text-decoration:none;">
          🟢 Pedir Vídeo pelo WhatsApp Web
        </a>
      `;
      videoBox.className = 'orcamento-video-banner alerta-contato';
    }

    if (temVideo) {
      videoBox.style.display = 'flex';
      videoBox.innerHTML = htmlVideo;
    } else {
      videoBox.style.display = 'none';
    }
  }

  // Banner IA se houver
  const auditBox = document.getElementById('iaAuditBox');
  if (d.analiseIA) {
    auditBox.style.display = 'flex';
    document.getElementById('iaAuditComplexidade').textContent = `${d.analiseIA.complexidade || 'MÉDIA'} COMPLEXIDADE`;
    document.getElementById('iaAuditModelo').textContent = d.analiseIA.modelo || 'Claude 3.5 Sonnet';
  } else {
    auditBox.style.display = 'none';
  }

  // Banner de Aprendizado Ativo (JEV) se tiver usado referência histórica
  renderizarBannerReferenciaHistorica(d.referenciaHistorica);

  // Painel de Roteiro Sequencial de Produção para Múltiplas Peças
  renderizarRoteiroProducaoMultiPecas(d);

  // Atualiza badge de status no Card 1 do formulário
  const statusBadge = document.getElementById('formStatusBadge');
  if (statusBadge) {
    if (d.status === 'APROVADO' || d.status === 'CONCLUIDO') {
      statusBadge.textContent = '🟢 PROPOSTA APROVADA';
      statusBadge.style.background = '#DCFCE7';
      statusBadge.style.color = '#166534';
      statusBadge.style.borderColor = '#BBF7D0';
    } else if (d.status === 'RECUSADO') {
      statusBadge.textContent = '🔴 PROPOSTA RECUSADA';
      statusBadge.style.background = '#FEF2F2';
      statusBadge.style.color = '#B91C1C';
      statusBadge.style.borderColor = '#FECACA';
    } else if (d.status === 'ENVIADO_AO_CLIENTE') {
      statusBadge.textContent = '📤 ENVIADO AO CLIENTE (AGUARDANDO)';
      statusBadge.style.background = '#EFF6FF';
      statusBadge.style.color = '#1D4ED8';
      statusBadge.style.borderColor = '#BFDBFE';
    } else if (d.status === 'AJUSTE_SOLICITADO') {
      statusBadge.textContent = '🔄 AJUSTE SOLICITADO';
      statusBadge.style.background = '#FFFBEB';
      statusBadge.style.color = '#B45309';
      statusBadge.style.borderColor = '#FDE68A';
    } else if (d.status === 'EM_ANDAMENTO' || d.visualizado) {
      statusBadge.textContent = '⚙️ EM ELABORAÇÃO';
      statusBadge.style.background = '#FEFCE8';
      statusBadge.style.color = '#854D0E';
      statusBadge.style.borderColor = '#FEF08A';
    } else {
      statusBadge.textContent = '🔴 NOVO PEDIDO';
      statusBadge.style.background = '#FFF1F2';
      statusBadge.style.color = '#9F1239';
      statusBadge.style.borderColor = '#FECDD3';
    }
  }

  // Atualiza painel de acompanhamento e negociação do cliente
  atualizarPainelStatusCliente(d);

  calcularTotais();

  // Se o orçamento já tem insumos/operações preenchidos ou foi concluído/enviado, vai para a etapa de revisão
  const temItensPreenchidos = (d.itensInsumo && d.itensInsumo.some(i => i.nome && i.nome.trim() !== '')) ||
                              (d.itensMaquina && d.itensMaquina.some(m => m.nome && m.nome.trim() !== ''));
  if (temItensPreenchidos || d.status === 'CONCLUIDO' || d.status === 'APROVADO' || d.status === 'ENVIADO_AO_CLIENTE' || d.status === 'AJUSTE_SOLICITADO' || d.status === 'RECUSADO') {
    mudarEtapaOrcamento('revisao');
  } else {
    mudarEtapaOrcamento('coleta');
  }
}

function mudarEtapaOrcamento(etapa) {
  const etapaColeta = document.getElementById('orcamento-etapa-coleta');
  const etapaRevisao = document.getElementById('orcamento-etapa-revisao');
  const btnColeta = document.getElementById('stepBtnColeta');
  const btnRevisao = document.getElementById('stepBtnRevisao');

  if (etapa === 'revisao') {
    if (etapaColeta) etapaColeta.style.display = 'none';
    if (etapaRevisao) etapaRevisao.style.display = 'block';
    if (btnColeta) {
      btnColeta.classList.remove('active');
      btnColeta.classList.add('completed');
    }
    if (btnRevisao) {
      btnRevisao.classList.add('active');
    }
    // Atualiza resumo no topo
    const num = document.getElementById('numero')?.value || '---';
    const cli = document.getElementById('clienteNome')?.value || '(Cliente não informado)';
    const elNum = document.getElementById('resumoTopoOrcamento');
    const elCli = document.getElementById('resumoTopoCliente');
    if (elNum) elNum.textContent = '#' + num;
    if (elCli) elCli.textContent = cli;
    calcularTotais();
  } else {
    if (etapaColeta) etapaColeta.style.display = 'block';
    if (etapaRevisao) etapaRevisao.style.display = 'none';
    if (btnColeta) {
      btnColeta.classList.add('active');
    }
    if (btnRevisao) {
      btnRevisao.classList.remove('active');
    }
  }
}

function novoOrcamentoEmBranco() {
  if (!confirm('Isso vai limpar os campos do orçamento na tela. Continuar?')) return;
  carregarOrcamentoNoFormulario(novoOrcamentoObjPadrao());
  arquivosPendentes = [];
  renderArquivosPendentes();
  mudarEtapaOrcamento('coleta');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  avisar('Novo orçamento em branco.');
}

function coletarOrcamentoAtualDoDOM(statusForcado) {
  const orcSalvo = orcamentosSalvos.find(o => o.id === currentOrcId) || {};
  orcOriginal = Object.assign({}, orcSalvo, orcOriginal);
  const qtdPecas = Math.max(1, num(document.getElementById('quantidadePecas')?.value) || 1);
  const unidPeca = (document.getElementById('unidadePeca')?.value || 'PÇ').toUpperCase();
  return {
    id: currentOrcId,
    salvarCliente: document.getElementById('checkSalvarCliente')?.checked !== false,
    numero: document.getElementById('numero').value.trim(),
    data: document.getElementById('data').value,
    cliente: {
      nome: document.getElementById('clienteNome').value.trim(),
      tel: document.getElementById('clienteTel').value.trim(),
      cep: document.getElementById('clienteCep')?.value.trim() || '',
      endereco: document.getElementById('clienteEndereco').value.trim(),
      email: orcOriginal.cliente?.email || ''
    },
    descricaoServico: document.getElementById('descricaoServico').value.trim(),
    categoriaPeca: document.getElementById('categoriaPeca')?.value || 'Usinagem Geral',
    quantidadePecas: qtdPecas,
    unidadePeca: unidPeca,
    prazoDesejado: document.getElementById('prazoDesejado')?.value.trim() || '',
    materialPeca: document.getElementById('materialPeca')?.value || '',
    materialDefinido: document.getElementById('iaMaterialNome')?.textContent || document.getElementById('materialPeca')?.value || orcOriginal.materialDefinido || '',
    materialOrigem: orcOriginal.materialOrigem || (document.getElementById('materialPeca')?.value ? 'cliente' : 'catalogo'),
    justificativaMaterial: document.getElementById('iaMaterialJustificativa')?.textContent || orcOriginal.justificativaMaterial || '',
    tratamentoTermico: document.getElementById('tratamentoTermico')?.value || 'Nenhum',
    durezaDesejada: document.getElementById('durezaDesejada')?.value.trim() || '',
    detalhesTermico: document.getElementById('detalhesTermico')?.value.trim() || '',
    observacoes: document.getElementById('obsIA').value.trim() || orcOriginal.observacoes || '',
    itensInsumo: Array.from(document.querySelectorAll('#insumos-body tr')).map(tr => ({
      nome: tr.querySelector('.nome')?.value.trim() || '',
      qtd: num(tr.querySelector('.qtd')?.value) || 1,
      unidade: (tr.querySelector('.unidade')?.value.trim() || 'UN').toUpperCase(),
      preco: num(tr.querySelector('.preco')?.value) || 0,
    })).filter(i => i.nome !== ''),
    itensMaquina: Array.from(document.querySelectorAll('#maquinas-body tr')).map(tr => ({
      peca: tr.querySelector('.peca-val')?.value || tr.dataset.peca || '',
      etapa: parseInt(tr.querySelector('.etapa-val')?.value || tr.dataset.etapa || '1', 10),
      ordemProducao: parseInt(tr.querySelector('.ordem-val')?.value || tr.dataset.ordemProducao || '1', 10),
      nome: tr.querySelector('.nome')?.value.trim() || '',
      descricao: tr.querySelector('.descricao')?.value.trim() || '',
      regime: tr.querySelector('.regime')?.value || 'normal',
      horas: num(tr.querySelector('.horas')?.value) || 1,
      valorHora: num(tr.querySelector('.valorHora')?.value) || 0,
    })).filter(m => m.nome !== ''),
    ehConjuntoMultiPecas: !!orcOriginal.ehConjuntoMultiPecas,
    pecas: orcOriginal.pecas || [],
    moEscritorio: num(document.getElementById('moEscritorio').value) || 0,
    frete: {
      ativo: isFreteAtivo(),
      opcao: isFreteAtivo() ? 'com_frete' : 'sem_frete',
      distKm: num(document.getElementById('freteDistKm').value) || 0,
      viagens: num(document.getElementById('freteViagens').value) || 1,
      pecas: num(document.getElementById('fretePecas')?.value) || qtdPecas,
    },
    parcelamento: { prazoMeses: num(document.getElementById('prazoMeses').value) || 0 },
    arquivos: arquivosPendentes,
    analiseIA: orcOriginal.analiseIA || null,
    versaoOriginalIA: orcOriginal.versaoOriginalIA || null,
    referenciaHistorica: orcOriginal.referenciaHistorica || null,
    revisadoPorHumano: true,
    videoInfo: orcOriginal.videoInfo || null,
    historicoEventos: orcOriginal.historicoEventos || [],
    feedbackCliente: orcOriginal.feedbackCliente || null,
    dataEnvioCliente: orcOriginal.dataEnvioCliente || null,
    canalEnvio: orcOriginal.canalEnvio || null,
    dataAprovacao: orcOriginal.dataAprovacao || null,
    dataRecusa: orcOriginal.dataRecusa || null,
    dataUltimoAjuste: orcOriginal.dataUltimoAjuste || null,
    origem: orcOriginal.origem || 'manual',
    canalOrigem: orcOriginal.canalOrigem || (orcOriginal.origem || 'manual'),
    visualizado: true,
    status: statusForcado || orcOriginal.status || 'EM_ANDAMENTO'
  };
}

async function salvarOrcamentoAtual(silencioso = false) {
  const d = coletarOrcamentoAtualDoDOM();
  if (!d.cliente.nome) {
    mostrarErro('Por favor, informe o nome do cliente antes de salvar.');
    document.getElementById('clienteNome').focus();
    return null;
  }

  const totais = calcularTotais();
  d.totais = totais;

  try {
    const res = await fetch('/api/orcamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d)
    });
    const data = await res.json();
    if (data.sucesso) {
      currentOrcId = data.orcamento.id;
      orcOriginal = data.orcamento;
      document.getElementById('numero').value = data.orcamento.numero;
      await carregarSalvos();
      await carregarClientes();
      if (!silencioso) {
        avisar(`💾 Rascunho do Orçamento #${data.orcamento.numero} salvo.`);
      }
      return data.orcamento;
    }
  } catch (e) {
    mostrarErro('Não consegui salvar o orçamento no servidor.');
  }
  return null;
}

/* ===============================================================
   FLUXO COMERCIAL COM O CLIENTE (ENVIO, APROVAÇÃO, AJUSTES, RECUSA)
=============================================================== */
function atualizarPainelStatusCliente(orc) {
  const painel = document.getElementById('painelStatusCliente');
  if (!painel) return;

  if (!orc || !orc.status || orc.status === 'RASCUNHO' || orc.status === 'EM_ANDAMENTO' || orc.status === 'NOVO') {
    painel.style.display = 'none';
    return;
  }

  painel.style.display = 'block';
  const icone = document.getElementById('statusClienteIcone');
  const badge = document.getElementById('statusClienteBadge');
  const dataEl = document.getElementById('statusClienteData');
  const detalhesEl = document.getElementById('statusClienteDetalhes');
  const contagemEvt = document.getElementById('contagemEventosHistorico');

  if (contagemEvt) {
    contagemEvt.textContent = (orc.historicoEventos || []).length;
  }

  if (orc.status === 'ENVIADO_AO_CLIENTE') {
    painel.style.borderLeftColor = '#2563EB';
    if (icone) icone.textContent = '📤';
    if (badge) {
      badge.textContent = 'PROPOSTA ENVIADA AO CLIENTE';
      badge.style.background = '#EFF6FF';
      badge.style.color = '#1D4ED8';
      badge.style.borderColor = '#BFDBFE';
    }
    if (dataEl) {
      dataEl.textContent = orc.dataEnvioCliente ? `em ${new Date(orc.dataEnvioCliente).toLocaleString('pt-BR')}` : '';
    }
    if (detalhesEl) {
      detalhesEl.textContent = `Proposta enviada via ${orc.canalEnvio === 'whatsapp' ? 'WhatsApp' : 'E-mail'}. Registre o retorno do cliente nos botões ao lado:`;
    }
  } else if (orc.status === 'AJUSTE_SOLICITADO') {
    painel.style.borderLeftColor = '#D97706';
    if (icone) icone.textContent = '🔄';
    if (badge) {
      badge.textContent = 'AJUSTE SOLICITADO PELO CLIENTE';
      badge.style.background = '#FFFBEB';
      badge.style.color = '#B45309';
      badge.style.borderColor = '#FDE68A';
    }
    if (dataEl) {
      dataEl.textContent = orc.dataUltimoAjuste ? `em ${new Date(orc.dataUltimoAjuste).toLocaleString('pt-BR')}` : '';
    }
    if (detalhesEl) {
      detalhesEl.innerHTML = `<b>Solicitação do cliente:</b> ${escapeHTML(orc.feedbackCliente?.solicitacao || 'Cliente pediu revisão de custos/prazos')}. Edite os itens abaixo e envie a proposta ajustada.`;
    }
  } else if (orc.status === 'APROVADO') {
    painel.style.borderLeftColor = '#16A34A';
    if (icone) icone.textContent = '🎉';
    if (badge) {
      badge.textContent = 'PROPOSTA APROVADA PELO CLIENTE';
      badge.style.background = '#DCFCE7';
      badge.style.color = '#15803D';
      badge.style.borderColor = '#BBF7D0';
    }
    if (dataEl) {
      dataEl.textContent = orc.dataAprovacao ? `em ${new Date(orc.dataAprovacao).toLocaleString('pt-BR')}` : '';
    }
    if (detalhesEl) {
      detalhesEl.textContent = orc.feedbackCliente?.numPedidoCliente ? `Ordem de Compra / Pedido Cliente: #${orc.feedbackCliente.numPedidoCliente}. Liberado para produção!` : 'Proposta aprovada com sucesso! Liberado para ordem de serviço e usinagem.';
    }
  } else if (orc.status === 'RECUSADO') {
    painel.style.borderLeftColor = '#DC2626';
    if (icone) icone.textContent = '❌';
    if (badge) {
      badge.textContent = 'PROPOSTA RECUSADA';
      badge.style.background = '#FEF2F2';
      badge.style.color = '#B91C1C';
      badge.style.borderColor = '#FECACA';
    }
    if (dataEl) {
      dataEl.textContent = orc.dataRecusa ? `em ${new Date(orc.dataRecusa).toLocaleString('pt-BR')}` : '';
    }
    if (detalhesEl) {
      detalhesEl.textContent = `Motivo registrado: ${orc.feedbackCliente?.motivo || 'Não informado'}. ${orc.feedbackCliente?.observacoes || ''}`;
    }
  }
}

async function abrirModalEnviarProposta(orcId = null) {
  try {
    if (orcId && orcId !== currentOrcId) {
      const res = await fetch(`/api/orcamentos/${orcId}`);
      const data = await res.json();
      if (data.sucesso && data.orcamento) {
        carregarOrcamentoNoFormulario(data.orcamento);
      }
    } else {
      // Salva o orçamento antes de abrir envio (não bloqueia se já tiver currentOrcId e der erro)
      const orcSalvo = await salvarOrcamentoAtual(true);
      if (!orcSalvo && !currentOrcId) return;
    }

    const nomeCliente = document.getElementById('clienteNome')?.value.trim() || 'Cliente';
    let fone = document.getElementById('clienteTel')?.value.trim() || '';
    const numOrc = document.getElementById('numero')?.value.trim() || '---';
    const desc = document.getElementById('descricaoServico')?.value.trim() || 'Serviços de usinagem e recuperação mecânica';
    const totais = calcularTotais();

    const qtdPecas = Math.max(num(document.getElementById('quantidadePecas')?.value) || 1, 1);
    const unidPeca = (document.getElementById('unidadePeca')?.value || 'PÇ').toUpperCase();
    const totalFinalNum = totais.totalFinal || totais.comDesconto || totais.semDesconto || 0;
    const totalFormatado = fmt(totalFinalNum);
    const valorUnitarioNum = totais.valorUnitarioPeca || (totalFinalNum / qtdPecas);
    const valorUnitarioFormatado = fmt(valorUnitarioNum);
    const prazoMeses = num(document.getElementById('prazoMeses')?.value) || 0;

    const elNome = document.getElementById('modalEnvioClienteNome');
    const elNum = document.getElementById('modalEnvioNumero');
    const elTel = document.getElementById('modalEnvioTelefone');
    const elQtd = document.getElementById('modalEnvioQtd');
    const elUnit = document.getElementById('modalEnvioValorUnit');
    const elVal = document.getElementById('modalEnvioValor');
    const elMsg = document.getElementById('modalEnvioMensagemTexto');
    const modal = document.getElementById('modalEnviarProposta');

    if (elNome) elNome.textContent = nomeCliente;
    if (elNum) elNum.textContent = '#' + numOrc;
    if (elTel) elTel.textContent = fone || '(Não informado)';
    if (elQtd) elQtd.textContent = `${qtdPecas} ${unidPeca}`;
    if (elUnit) elUnit.textContent = `${valorUnitarioFormatado} / ${unidPeca}`;
    if (elVal) elVal.textContent = totalFormatado;

    let textoMsg = `Olá, *${nomeCliente}*! Tudo bem?\n\n`;
    textoMsg += `Aqui é da equipe da *Nardelli Usinagem & Caldeiraria* (Aracaju/SE).\n`;
    textoMsg += `Conforme solicitado, preparamos a proposta comercial para o seu serviço:\n\n`;
    textoMsg += `📋 *Orçamento:* #${numOrc}\n`;
    textoMsg += `⚙️ *Serviço:* ${desc}\n`;
    const matMsg = document.getElementById('iaMaterialNome')?.textContent || document.getElementById('materialPeca')?.value;
    if (matMsg && matMsg.trim()) {
      textoMsg += `🔩 *Material:* ${matMsg.trim()}\n`;
    }
    textoMsg += `📦 *Quantidade:* ${qtdPecas} ${unidPeca}\n`;
    textoMsg += `💵 *Valor Unitário:* ${valorUnitarioFormatado} / ${unidPeca}\n`;
    textoMsg += `💰 *Valor Total à Vista:* ${totalFormatado}\n`;
    if (prazoMeses > 0) {
      const precoPrazoNum = totais.precoAPrazo || totalFinalNum;
      const unitPrazoFormatado = fmt(totais.valorUnitarioPecaPrazo || (precoPrazoNum / qtdPecas));
      textoMsg += `📅 *Opção a Prazo:* ${unitPrazoFormatado} / ${unidPeca} (${prazoMeses}x com juros — Total: ${fmt(precoPrazoNum)})\n`;
    }
    if (totais.freteTotal > 0 || isFreteAtivo()) {
      const endCli = document.getElementById('clienteEndereco')?.value.trim();
      const dist = num(document.getElementById('freteDistKm')?.value) || 0;
      textoMsg += `🚚 *Frete/Entrega:* Incluso até o endereço ${dist > 0 ? `(${dist} km)` : ''} ${endCli ? `— ${endCli}` : ''}\n`;
    } else {
      textoMsg += `📍 *Entrega:* Retirada na oficina Nardelli Usinagem em Aracaju/SE (sem frete incluso)\n`;
    }
    textoMsg += `📦 *Prazo estimado de fabricação:* 4 a 5 dias úteis\n\n`;
    textoMsg += `Podemos emitir a Ordem de Serviço para início da fabricação?\n`;
    textoMsg += `Ficamos à disposição caso necessite de algum ajuste ou detalhamento técnico!`;

    if (elMsg) elMsg.value = textoMsg;
    if (modal) modal.style.display = 'flex';
  } catch (err) {
    console.error('Erro em abrirModalEnviarProposta:', err);
    mostrarErro('Erro ao abrir envio de proposta: ' + err.message);
  }
}

function fecharModalEnviarProposta() {
  document.getElementById('modalEnviarProposta').style.display = 'none';
}

function dispararEnvioWhatsAppWeb() {
  let fone = (document.getElementById('clienteTel').value || '').replace(/\D/g, '');
  if (fone && fone.length <= 11 && !fone.startsWith('55')) fone = '55' + fone;
  const msg = document.getElementById('modalEnvioMensagemTexto').value;

  if (fone) {
    window.open(`https://web.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(msg)}`, '_blank');
  } else {
    window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

function copiarMensagemEnvio() {
  const txt = document.getElementById('modalEnvioMensagemTexto').value;
  navigator.clipboard.writeText(txt).then(() => {
    avisar('📋 Mensagem comercial copiada com sucesso!');
  }).catch(() => {
    mostrarErro('Não foi possível copiar automaticamente.');
  });
}

async function confirmarEnvioProposta() {
  if (!currentOrcId) {
    mostrarErro('Salve o orçamento antes de confirmar o envio.');
    return;
  }

  const msg = document.getElementById('modalEnvioMensagemTexto').value;
  try {
    const res = await fetch(`/api/orcamentos/${currentOrcId}/enviar-cliente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canal: 'whatsapp',
        mensagem: msg,
        usuario: 'Orçamentista'
      })
    });
    const data = await res.json();
    if (data.sucesso) {
      fecharModalEnviarProposta();
      avisar(`📤 Proposta #${data.orcamento.numero} enviada com sucesso ao cliente!`);
      carregarOrcamentoNoFormulario(data.orcamento);
      await carregarSalvos();
    } else {
      throw new Error(data.erro);
    }
  } catch (e) {
    mostrarErro('Erro ao registrar envio: ' + e.message);
  }
}

/* -------------------- FEEDBACK / DECISÃO DO CLIENTE -------------------- */
let feedbackAcaoAtiva = 'aprovar';
let feedbackOrcIdAtivo = null;

function abrirModalFeedback(acao, orcId = null) {
  feedbackAcaoAtiva = acao;
  feedbackOrcIdAtivo = orcId || currentOrcId;

  if (!feedbackOrcIdAtivo) {
    mostrarErro('Nenhum orçamento selecionado.');
    return;
  }

  const tit = document.getElementById('modalFeedbackTitulo');
  const desc = document.getElementById('modalFeedbackDescricao');
  const btn = document.getElementById('btnSalvarFeedback');

  document.getElementById('campoFeedbackAprovar').style.display = 'none';
  document.getElementById('campoFeedbackAjuste').style.display = 'none';
  document.getElementById('campoFeedbackRecusar').style.display = 'none';

  if (acao === 'aprovar') {
    tit.innerHTML = '<span class="dot"></span>Confirmar Aprovação da Proposta';
    desc.textContent = 'O cliente aprovou o orçamento. Ele será arquivado no Histórico como Aprovado para emissão de OS.';
    document.getElementById('campoFeedbackAprovar').style.display = 'block';
    btn.textContent = '✅ Confirmar Aprovação';
    btn.style.background = '#16A34A';
    btn.style.borderColor = '#15803D';
  } else if (acao === 'ajuste') {
    tit.innerHTML = '<span class="dot"></span>Registrar Pedido de Ajuste do Cliente';
    desc.textContent = 'Anote o que o cliente pediu para alterar (desconto, matéria-prima, prazo ou frete).';
    document.getElementById('campoFeedbackAjuste').style.display = 'block';
    btn.textContent = '🔄 Registrar Ajuste';
    btn.style.background = '#D97706';
    btn.style.borderColor = '#B45309';
  } else if (acao === 'recusar') {
    tit.innerHTML = '<span class="dot"></span>Registrar Recusa do Orçamento';
    desc.textContent = 'Selecione o motivo da recusa para fins de auditoria comercial e histórico do cliente.';
    document.getElementById('campoFeedbackRecusar').style.display = 'block';
    btn.textContent = '❌ Confirmar Recusa';
    btn.style.background = '#DC2626';
    btn.style.borderColor = '#B91C1C';
  }

  document.getElementById('modalFeedbackCliente').style.display = 'flex';
}

function abrirModalFeedbackId(id, acao) {
  abrirModalFeedback(acao, id);
}

function fecharModalFeedback() {
  document.getElementById('modalFeedbackCliente').style.display = 'none';
}

async function salvarFeedbackCliente() {
  if (!feedbackOrcIdAtivo) return;

  let payload = { acao: feedbackAcaoAtiva, usuario: 'Orçamentista' };

  if (feedbackAcaoAtiva === 'aprovar') {
    payload.numPedidoCliente = document.getElementById('feedbackNumPedido').value.trim();
    payload.observacoes = document.getElementById('feedbackObsAprovar').value.trim();
  } else if (feedbackAcaoAtiva === 'ajuste') {
    payload.observacoes = document.getElementById('feedbackObsAjuste').value.trim();
    if (!payload.observacoes) {
      mostrarErro('Por favor, informe o que o cliente pediu para ajustar.');
      return;
    }
  } else if (feedbackAcaoAtiva === 'recusar') {
    payload.motivo = document.getElementById('feedbackMotivoRecusa').value;
    payload.observacoes = document.getElementById('feedbackObsRecusar').value.trim();
  }

  try {
    const res = await fetch(`/api/orcamentos/${feedbackOrcIdAtivo}/feedback-cliente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.sucesso) {
      fecharModalFeedback();
      if (feedbackAcaoAtiva === 'aprovar') {
        avisar(`🎉 Proposta #${data.orcamento.numero} APROVADA pelo cliente!`);
      } else if (feedbackAcaoAtiva === 'ajuste') {
        avisar(`🔄 Solicitação de ajuste registrada no orçamento #${data.orcamento.numero}.`);
      } else {
        avisar(`❌ Orçamento #${data.orcamento.numero} marcado como recusado.`);
      }

      if (currentOrcId === feedbackOrcIdAtivo) {
        carregarOrcamentoNoFormulario(data.orcamento);
      }
      await carregarSalvos();
    } else {
      throw new Error(data.erro);
    }
  } catch (e) {
    mostrarErro('Erro ao registrar retorno do cliente: ' + e.message);
  }
}

/* -------------------- HISTÓRICO / LINHA DO TEMPO DO CLIENTE -------------------- */
let historicoOrcIdAtivo = null;

async function abrirModalHistoricoCliente(orcId = null) {
  historicoOrcIdAtivo = orcId || currentOrcId;
  if (!historicoOrcIdAtivo) {
    mostrarErro('Nenhum orçamento selecionado.');
    return;
  }

  let orc = orcamentosSalvos.find(o => o.id === historicoOrcIdAtivo);
  if (!orc) {
    try {
      const res = await fetch(`/api/orcamentos/${historicoOrcIdAtivo}`);
      const data = await res.json();
      if (data.sucesso) orc = data.orcamento;
    } catch (e) {}
  }

  const container = document.getElementById('historicoTimelineLista');
  const eventos = (orc && orc.historicoEventos) || [];

  if (eventos.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--texto-suave);">Nenhum evento registrado ainda para este cliente.</div>';
  } else {
    container.innerHTML = eventos.map(ev => {
      let badgeCor = '#E2E8F0; color:#334155';
      let icone = '📌';
      if (ev.tipo === 'ENVIO_CLIENTE') { badgeCor = '#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE'; icone = '📤'; }
      else if (ev.tipo === 'APROVADO') { badgeCor = '#DCFCE7; color:#15803D; border:1px solid #BBF7D0'; icone = '🎉'; }
      else if (ev.tipo === 'AJUSTE_SOLICITADO') { badgeCor = '#FFFBEB; color:#B45309; border:1px solid #FDE68A'; icone = '🔄'; }
      else if (ev.tipo === 'RECUSADO') { badgeCor = '#FEF2F2; color:#B91C1C; border:1px solid #FECACA'; icone = '❌'; }

      const dataStr = ev.data ? new Date(ev.data).toLocaleString('pt-BR') : '---';

      return `
        <div style="background:#FFFFFF; border:1px solid var(--linha); border-left:3px solid var(--azul); border-radius:4px; padding:10px 12px; font-size:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <b style="color:var(--azul); display:flex; align-items:center; gap:6px;">${icone} ${escapeHTML(ev.titulo || 'Evento')}</b>
            <span style="font-size:11px; color:var(--texto-suave);">${dataStr}</span>
          </div>
          ${ev.detalhes ? `<div style="margin-top:6px; color:var(--texto); line-height:1.4;">${escapeHTML(ev.detalhes)}</div>` : ''}
          <div style="margin-top:4px; font-size:10px; color:var(--texto-suave); text-align:right;">Por: ${escapeHTML(ev.usuario || 'Sistema')}</div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('modalHistoricoCliente').style.display = 'flex';
}

function fecharModalHistoricoCliente() {
  document.getElementById('modalHistoricoCliente').style.display = 'none';
}

async function adicionarAnotacaoHistorico() {
  const input = document.getElementById('novoEventoAnotacao');
  const texto = input.value.trim();
  if (!texto) return;

  if (!historicoOrcIdAtivo) return;

  const orc = orcamentosSalvos.find(o => o.id === historicoOrcIdAtivo);
  if (!orc) return;

  if (!Array.isArray(orc.historicoEventos)) orc.historicoEventos = [];
  orc.historicoEventos.unshift({
    id: 'evt_' + Date.now().toString(36),
    data: new Date().toISOString(),
    tipo: 'ANOTACAO',
    titulo: 'Anotação Comercial',
    detalhes: texto,
    usuario: 'Orçamentista'
  });

  try {
    await fetch(`/api/orcamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orc)
    });
    input.value = '';
    avisar('Anotação registrada na linha do tempo.');
    abrirModalHistoricoCliente(historicoOrcIdAtivo);
    await carregarSalvos();
  } catch (e) {
    mostrarErro('Erro ao salvar anotação.');
  }
}

/* ---------------------------------------------------------------
   IA — UPLOAD E ANÁLISE (ROTEADOR + CLAUDE 3.5 SONNET)
--------------------------------------------------------------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = () => reject(new Error('Falha ao ler arquivo'));
    r.readAsDataURL(file);
  });
}

function formatarTamanhoBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(0) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

async function adicionarArquivosLista(filesList) {
  const files = Array.from(filesList || []);
  if (!files.length) return;

  let adicionados = 0;
  for (const f of files) {
    try {
      const base64 = await fileToBase64(f);
      let mediaType = f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      arquivosPendentes.push({
        nome: f.name,
        mediaType,
        base64,
        tamanho: f.size,
        tamanhoFormatado: formatarTamanhoBytes(f.size)
      });
      adicionados++;
    } catch (err) {
      console.warn('Falha ao processar arquivo:', f.name, err);
    }
  }

  renderArquivosPendentes();
  if (adicionados > 0) {
    mostrarToast(`✓ ${adicionados} arquivo(s) adicionado(s) para análise.`);
  }
}

async function onEscolherArquivos(e) {
  await adicionarArquivosLista(e.target.files);
  e.target.value = '';
}

function limparTodosArquivosPendentes() {
  if (!arquivosPendentes.length) return;
  arquivosPendentes = [];
  renderArquivosPendentes();
  mostrarToast('Arquivos removidos.');
}

function renderArquivosPendentes() {
  const box = document.getElementById('arquivosPreview');
  const contadorBadge = document.getElementById('badgeContadorArquivos');
  const btnLimpar = document.getElementById('btnLimparArquivos');

  const total = arquivosPendentes.length;
  if (contadorBadge) {
    contadorBadge.textContent = total === 1 ? '1 arquivo' : `${total} arquivos`;
    contadorBadge.style.background = total > 0 ? '#EFF6FF' : '#F1F5F9';
    contadorBadge.style.color = total > 0 ? '#1D4ED8' : '#64748B';
    contadorBadge.style.borderColor = total > 0 ? '#BFDBFE' : '#CBD5E1';
  }

  if (btnLimpar) {
    btnLimpar.style.display = total > 1 ? 'inline-block' : 'none';
  }

  if (!box) return;

  if (total === 0) {
    box.innerHTML = `
      <div style="text-align:center; padding:16px 10px; color:var(--texto-suave); font-size:12px; background:#F8FAFC; border:1px dashed #E2E8F0; border-radius:6px;">
        <span style="font-size:20px; display:block; margin-bottom:4px;">📷</span>
        Nenhum arquivo anexado ainda.<br>
        <small style="color:#94A3B8;">Anexar fotos da peça ou desenho PDF calibra o orçamento da IA com alta precisão.</small>
      </div>`;
    return;
  }

  box.innerHTML = arquivosPendentes.map((a, idx) => {
    const isImagem = (a.mediaType && a.mediaType.startsWith('image/')) ||
                     /\.(jpe?g|png|webp|gif|bmp)$/i.test(a.nome || '');
    const isPdf = (a.mediaType === 'application/pdf') || /\.pdf$/i.test(a.nome || '');
    const isCad = /\.(dwg|dxf)$/i.test(a.nome || '');

    let thumbHtml = '';
    let imgSrc = a.url || (a.base64 ? `data:${a.mediaType || 'image/jpeg'};base64,${a.base64}` : '');

    if (isImagem && imgSrc) {
      thumbHtml = `
        <div class="arquivo-thumb-box" onclick="abrirLightboxImagem('${imgSrc}', '${escapeAttr(a.nome)}')">
          <img class="arquivo-thumb-img" src="${imgSrc}" alt="${escapeAttr(a.nome)}" title="Clique para ampliar">
        </div>`;
    } else if (isPdf) {
      thumbHtml = `
        <div class="arquivo-thumb-box" style="background:#FEF2F2; border-color:#FECACA;">
          <span class="arquivo-thumb-doc" style="color:#DC2626;">📄</span>
        </div>`;
    } else if (isCad) {
      thumbHtml = `
        <div class="arquivo-thumb-box" style="background:#EFF6FF; border-color:#BFDBFE;">
          <span class="arquivo-thumb-doc" style="color:#2563EB;">📐</span>
        </div>`;
    } else {
      thumbHtml = `
        <div class="arquivo-thumb-box">
          <span class="arquivo-thumb-doc" style="color:var(--azul);">📎</span>
        </div>`;
    }

    const badgeTipo = isImagem ? '<span style="color:#059669; font-weight:700;">IMG</span>' :
                      isPdf ? '<span style="color:#DC2626; font-weight:700;">PDF</span>' :
                      isCad ? '<span style="color:#2563EB; font-weight:700;">CAD</span>' : 'ARQ';

    const tamTxt = a.tamanhoFormatado ? ` • ${a.tamanhoFormatado}` : '';

    return `
      <div class="arquivo-card-item">
        ${thumbHtml}
        <div class="arquivo-info-box">
          <span class="arquivo-nome" title="${escapeAttr(a.nome)}">${escapeAttr(a.nome)}</span>
          <div class="arquivo-meta">
            ${badgeTipo}${tamTxt} • <span style="color:#2563EB;">✓ Pronto para IA</span>
          </div>
        </div>
        <div class="arquivo-acoes">
          ${isImagem && imgSrc ? `
            <button type="button" class="btn-arquivo-acao" onclick="abrirLightboxImagem('${imgSrc}', '${escapeAttr(a.nome)}')" title="Visualizar em tamanho grande">
              🔍
            </button>` : ''}
          <button type="button" class="btn-arquivo-acao btn-arquivo-remover" onclick="removerArquivoPendente(${idx})" title="Remover este anexo">
            ✕
          </button>
        </div>
      </div>`;
  }).join('');
}

function removerArquivoPendente(idx) {
  arquivosPendentes.splice(idx, 1);
  renderArquivosPendentes();
}

/* Lightbox Modal para visualização ampliada */
function abrirLightboxImagem(src, nome) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const legenda = document.getElementById('lightboxLegenda');
  if (!modal || !img) return;

  img.src = src;
  if (legenda) legenda.textContent = nome || 'Visualização do Desenho / Foto';
  modal.classList.add('aberto');
}

function fecharLightboxImagem() {
  const modal = document.getElementById('lightboxModal');
  if (modal) modal.classList.remove('aberto');
}

/* Tratamento Térmico Retrátil */
function togglePainelTermico() {
  const card = document.getElementById('painelTermicoCard');
  const seta = document.getElementById('iconeSetaTermico');
  if (!card) return;

  const aberto = card.classList.toggle('aberto');
  if (seta) seta.style.transform = aberto ? 'rotate(180deg)' : 'rotate(0deg)';
}

function aoAlterarTratamentoTermico(val) {
  const card = document.getElementById('painelTermicoCard');
  const badge = document.getElementById('badgeTermicoStatus');
  const isAtivo = val && val !== 'Nenhum';

  if (card) {
    if (isAtivo) card.classList.add('ativo');
    else card.classList.remove('ativo');
  }

  if (badge) {
    if (isAtivo) {
      badge.textContent = `Ativo: ${val}`;
      badge.style.background = '#FED7AA';
      badge.style.color = '#9A3412';
    } else {
      badge.textContent = 'Opcional';
      badge.style.background = '#E2E8F0';
      badge.style.color = '#475569';
    }
  }
}

/* Sugestões Rápidas de Peças Industriais */
function aplicarSugestaoPeca(tipo) {
  const descEl = document.getElementById('descricaoServico');
  const catEl = document.getElementById('categoriaPeca');
  const matEl = document.getElementById('materialPeca');

  if (!descEl) return;

  const modelos = {
    eixo: {
      desc: 'Fabricação de eixo escalonado Ø60x450mm em aço 1045, com 2 colos para rolamentos tolerância h6, rosca M30x1.5 na ponta e rasgo de chaveta 10x8x50mm.',
      categoria: 'Eixo',
      material: 'Aço Carbono 1045 (Beneficiável)'
    },
    polia: {
      desc: 'Usinagem de polia com 2 canais tipo B (perfil V), diâmetro externo Ø180mm, largura total 70mm, furo central Ø38mm com rasgo de chaveta 10mm e parafusos de fixação.',
      categoria: 'Polia',
      material: 'Ferro Fundido (Nodular/Cinzento)'
    },
    bucha: {
      desc: 'Fabricação de bucha cilíndrica em bronze com flange: Ø externo 65mm x Ø interno 50mm (alojamento H7) x 70mm de comprimento, com canal espiral interno para graxa.',
      categoria: 'Usinagem Geral',
      material: 'Bronze (TM-23/SAE 660)'
    },
    engrenagem: {
      desc: 'Fabricação de engrenagem cilíndrica de dentes retos: Módulo 3.5, 36 dentes, diâmetro primitivo Ø126mm, largura de dente 35mm, furo chavetado Ø30mm.',
      categoria: 'Engrenagem',
      material: 'Aço Liga (4140/4340)'
    },
    flange: {
      desc: 'Usinagem de flange de acoplamento Ø220x25mm com cubo saliente Ø90x30mm, furo central cego/passante Ø45mm e 6 furos passantes Ø14mm em círculo primitivo Ø180mm.',
      categoria: 'Acoplamento',
      material: 'Aço Carbono (1020/1045)'
    },
    recuperacao: {
      desc: 'Recuperação mecânica de eixo motriz: enchimento com solda especial no colo de rolamento desgastado Ø75mm x 120mm, usinagem em torno para rebaixar e retífica final na tolerância k5.',
      categoria: 'Manutenção',
      material: 'Material Fornecido pelo Cliente'
    }
  };

  const item = modelos[tipo];
  if (!item) return;

  descEl.value = item.desc;
  if (catEl && item.categoria) catEl.value = item.categoria;
  if (matEl && item.material) matEl.value = item.material;

  descEl.focus();
  mostrarToast('💡 Modelo de peça preenchido! Ajuste as dimensões conforme o pedido.');
}

/* Inicializa Drag & Drop e Colar do Clipboard (Ctrl + V) */
function initDropzoneEClipboard() {
  const dropzone = document.getElementById('dropzoneArea');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(evtName => {
      dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(evtName => {
      dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt ? dt.files : null;
      if (files && files.length) {
        adicionarArquivosLista(files);
      }
    }, false);
  }

  // Suporte a Ctrl+V (colar prints de tela)
  window.addEventListener('paste', (e) => {
    // Ignora se estiver digitando em outros inputs de texto que não a descrição
    const activeEl = document.activeElement;
    const isDescricao = activeEl && activeEl.id === 'descricaoServico';
    const isInputText = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && !isDescricao;

    if (isInputText) return;

    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData || !clipboardData.items) return;

    const imageFiles = [];
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
          const file = new File([blob], `Print-Colado-${timestamp}.png`, { type: blob.type || 'image/png' });
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      adicionarArquivosLista(imageFiles);
      mostrarToast('📋 Print colado da área de transferência!');
    }
  });

  // Fechar lightbox no ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharLightboxImagem();
  });
}

async function rodarAnaliseIA() {
  const descricao = document.getElementById('descricaoServico').value.trim();
  const obsIA = document.getElementById('obsIA').value.trim();
  const categoria = document.getElementById('categoriaPeca')?.value || 'Usinagem Geral';
  const quantidade = num(document.getElementById('quantidadePecas')?.value) || 1;
  const prazo = document.getElementById('prazoDesejado')?.value.trim() || '';
  const material = document.getElementById('materialPeca')?.value || '';
  const tratamentoTermico = document.getElementById('tratamentoTermico')?.value || 'Nenhum';
  const durezaDesejada = document.getElementById('durezaDesejada')?.value.trim() || '';
  const detalhesTermico = document.getElementById('detalhesTermico')?.value.trim() || '';

  if (!descricao && arquivosPendentes.length === 0) {
    mostrarErro('Por favor, informe a descrição do serviço ou anexe pelo menos uma foto/desenho.');
    return;
  }

  const btn = document.getElementById('btnAnalisar');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="anim-pulse">⚡ Analisando e calculando proposta...</span>';
  }

  try {
    const res = await fetch('/api/ia/gerar-previa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descricao,
        observacoes: obsIA,
        categoria,
        quantidade,
        prazo,
        material,
        tratamentoTermico,
        durezaDesejada,
        detalhesTermico,
        arquivos: arquivosPendentes
      })
    });

    const data = await res.json();
    if (!data.sucesso) {
      throw new Error(data.erro || 'Falha na resposta da IA');
    }

    const { resultado, triagemJev, modelo, referenciaHistorica } = data;

    if (!orcOriginal) orcOriginal = {};
    orcOriginal.analiseIA = {
      complexidade: triagemJev?.complexidade || 'MÉDIA',
      modelo: modelo || 'Anthropic: Claude Sonnet 5.5'
    };

    // Snapshot da versão original gerada pela IA para rastrear melhorias manuais
    orcOriginal.versaoOriginalIA = {
      itensInsumo: JSON.parse(JSON.stringify(resultado.insumos || [])),
      itensMaquina: JSON.parse(JSON.stringify(resultado.operacoes || [])),
      moEscritorio: resultado.moEscritorio !== undefined ? resultado.moEscritorio : 0,
      totais: JSON.parse(JSON.stringify(calcularTotais())),
      geradoEm: new Date().toISOString()
    };
    if (referenciaHistorica) {
      orcOriginal.referenciaHistorica = referenciaHistorica;
    }

    // Se o usuário não havia selecionado material e a IA definiu a melhor opção, atualiza o campo
    if (resultado.materialDefinido) {
      orcOriginal.materialDefinido = resultado.materialDefinido;
      orcOriginal.materialOrigem = resultado.materialOrigem || (material ? 'cliente' : 'sugerido_ideal');
      orcOriginal.justificativaMaterial = resultado.justificativaMaterial || '';
      const selMat = document.getElementById('materialPeca');
      if (selMat && !material) {
        let optExistente = Array.from(selMat.options).find(o => 
          o.value && (o.value.toLowerCase().includes(resultado.materialDefinido.toLowerCase()) || 
                      resultado.materialDefinido.toLowerCase().includes(o.value.toLowerCase()))
        );
        if (optExistente) {
          selMat.value = optExistente.value;
        } else {
          const novaOpt = document.createElement('option');
          novaOpt.value = resultado.materialDefinido;
          novaOpt.textContent = `⭐ ${resultado.materialDefinido} (Sugerido pela IA)`;
          selMat.appendChild(novaOpt);
          selMat.value = resultado.materialDefinido;
        }
      }

      // Renderiza banner explicativo do material na Etapa 2
      renderizarBannerMaterial({
        materialDefinido: resultado.materialDefinido,
        materialOrigem: resultado.materialOrigem || (material ? 'cliente' : 'sugerido_ideal'),
        justificativaMaterial: resultado.justificativaMaterial
      });
    }
    document.querySelectorAll('#insumos-body tr').forEach(tr => {
      if (tr.querySelector('.nome')?.value.trim() === '') tr.remove();
    });
    document.querySelectorAll('#maquinas-body tr').forEach(tr => {
      if (tr.querySelector('.nome')?.value.trim() === '') tr.remove();
    });

    // Insere sugestões nas tabelas
    (resultado.insumos || []).forEach(d => {
      document.getElementById('insumos-body').insertAdjacentHTML('beforeend', insumoRowHTML(d));
    });
    (resultado.operacoes || []).forEach(d => {
      document.getElementById('maquinas-body').insertAdjacentHTML('beforeend', maquinaRowHTML(d));
    });

    document.getElementById('moEscritorio').value = resultado.moEscritorio !== undefined ? resultado.moEscritorio : 0;
    
    // Sincroniza quantidade de peças no frete
    const elFretePecas = document.getElementById('fretePecas');
    if (elFretePecas) {
      elFretePecas.value = quantidade || 1;
    }

    calcularTotais();

    // Banner de Auditoria de IA
    const auditBox = document.getElementById('iaAuditBox');
    if (auditBox) {
      auditBox.style.display = 'flex';
      const elComp = document.getElementById('iaAuditComplexidade');
      const elMod = document.getElementById('iaAuditModelo');
      if (elComp) elComp.textContent = `${triagemJev?.complexidade || 'MÉDIA'} COMPLEXIDADE`;
      if (elMod) elMod.textContent = modelo || 'Claude 3.5 Sonnet';
    }

    // Banner de Aprendizado Ativo (JEV)
    renderizarBannerReferenciaHistorica(referenciaHistorica);

    // Salva metadados de múltiplas peças e renderiza o Roteiro de Produção
    if (resultado.ehConjuntoMultiPecas !== undefined) {
      orcOriginal.ehConjuntoMultiPecas = resultado.ehConjuntoMultiPecas;
    }
    if (resultado.pecas) {
      orcOriginal.pecas = resultado.pecas;
    }
    renderizarRoteiroProducaoMultiPecas(resultado);

    // Transição automática para a tela da Proposta Calculada (Etapa 2)
    mudarEtapaOrcamento('revisao');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (data.avisoFallback) {
      avisar('⚡ ' + data.avisoFallback, 10000);
    } else {
      avisar('✨ Orçamento gerado com sucesso pela IA! Revise os insumos e operações abaixo.');
    }
  } catch (err) {
    mostrarErro('Não consegui me conectar à IA agora: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span style="font-size:16px;">✨</span> <b>Analisar e Gerar Orçamento</b>';
    }
  }
}

/* ===============================================================
   REFINAMENTO & RECÁLCULO INTERATIVO COM A IA
=============================================================== */
async function executarAjusteRecalculoIA() {
  const inputEl = document.getElementById('inputAjusteIA');
  const instrucao = inputEl ? inputEl.value.trim() : '';
  if (!instrucao) {
    mostrarErro('Por favor, digite o que você gostaria que a IA ajustasse na proposta.');
    inputEl?.focus();
    return;
  }

  const btn = document.getElementById('btnRecalcularIA');
  const loader = document.getElementById('indicativoRecalculoIA');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="anim-pulse">⚡ Recalculando com IA...</span>';
  }
  if (loader) {
    loader.style.display = 'block';
  }

  const orcamentoAtual = coletarOrcamentoAtualDoDOM();

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
    if (!data.sucesso) {
      throw new Error(data.erro || 'Falha ao recalcular proposta com IA');
    }

    const { resultado } = data;

    // Atualiza tabela de insumos se houver itens
    if (resultado.insumos && resultado.insumos.length > 0) {
      document.getElementById('insumos-body').innerHTML = resultado.insumos.map(insumoRowHTML).join('');
    }

    // Atualiza tabela de máquinas / operações se houver itens
    if (resultado.operacoes && resultado.operacoes.length > 0) {
      document.getElementById('maquinas-body').innerHTML = resultado.operacoes.map(maquinaRowHTML).join('');
    }

    // Atualiza Mão de Obra de escritório se fornecido
    if (resultado.moEscritorio !== undefined) {
      document.getElementById('moEscritorio').value = resultado.moEscritorio;
    }

    // Se houve nova definição de material
    if (resultado.materialDefinido) {
      if (orcOriginal) {
        orcOriginal.materialDefinido = resultado.materialDefinido;
        if (resultado.justificativaMaterial) orcOriginal.justificativaMaterial = resultado.justificativaMaterial;
      }
      renderizarBannerMaterial({
        materialDefinido: resultado.materialDefinido,
        materialOrigem: 'sugerido_ideal',
        justificativaMaterial: resultado.justificativaMaterial || resultado.justificativaAjuste || ''
      });
    }

    // Recalcula totais instantaneamente
    calcularTotais();

    if (inputEl) inputEl.value = '';

    if (data.avisoFallback) {
      avisar('⚡ ' + data.avisoFallback, 10000);
    } else {
      avisar(`✨ ${resultado.justificativaAjuste || 'Proposta recalculada com sucesso pela IA!'}`);
    }
  } catch (err) {
    mostrarErro('Erro ao recalcular com a IA: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡</span> <b>Recalcular com IA</b>';
    }
    if (loader) {
      loader.style.display = 'none';
    }
  }
}

/* ---------------------------------------------------------------
   MÓDULO: CHATBOT & REGISTRO DE CONVERSAS
--------------------------------------------------------------- */
async function carregarConversas() {
  try {
    const res = await fetch('/api/inbound/conversas');
    const data = await res.json();
    if (data.sucesso) {
      conversas = data.conversas || [];
      renderizarListaConversas();

      // Atualiza badge de pendentes na navegação
      const pendentes = conversas.filter(c => c.status === 'pendente').length;
      const badge = document.getElementById('badgeConversasPendente');
      if (badge) {
        if (pendentes > 0) {
          badge.textContent = pendentes;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      // Se já houver conversa ativa ou seleciona a primeira
      if (!conversaAtivaId && conversas.length > 0) {
        abrirConversa(conversas[0].id);
      } else if (conversaAtivaId) {
        abrirConversa(conversaAtivaId);
      }
    }
  } catch (e) {
    console.error('Erro ao carregar conversas:', e);
  }
}

function renderizarListaConversas() {
  const ul = document.getElementById('conversasListaBody');
  if (!ul) return;

  if (conversas.length === 0) {
    ul.innerHTML = '<li style="padding:16px; color:var(--texto-suave); text-align:center;">Nenhuma conversa registrada ainda.</li>';
    return;
  }

  ul.innerHTML = conversas.map(c => {
    const ultimaMsg = (c.mensagens && c.mensagens.length) ? c.mensagens[c.mensagens.length - 1].texto : (c.descricaoServico || 'Sem mensagens');
    const badgeStatus = c.status === 'orcamento_gerado' ? '<span class="badge badge-aprovado">Orçamento Criado</span>' : '<span class="badge badge-pendente">Pendente</span>';
    
    const isSite = c.canalOrigem === 'site';
    const iconeOrigem = isSite ? '🌐' : '📱';
    const tagOrigem = isSite ? '<span class="badge badge-origem-site" style="font-size:9px; padding:2px 6px;">🌐 Site</span>' : '<span class="badge badge-origem-whatsapp" style="font-size:9px; padding:2px 6px;">📱 WhatsApp</span>';
    const tagVideo = (c.videoInfo?.temVideo || (c.descricaoServico && c.descricaoServico.toLowerCase().includes('vídeo'))) ? '<span class="badge" style="background:#E0F2FE; color:#0369A1; border:1px solid #BAE6FD; font-size:9px; padding:2px 6px;">📹 Vídeo</span>' : '';

    // Status da janela Meta de 24h
    const janelaMeta = c.janelaMeta;
    let badgeJanela = '';
    if (janelaMeta) {
      if (janelaMeta.expirada) {
        badgeJanela = `<span class="badge" style="background:#FFF3E0; color:#E65100; border:1px solid #FFE0B2; font-size:10px;" title="Janela Meta expirada (>24h)">🔴 24h Expirada</span>`;
      } else {
        badgeJanela = `<span class="badge" style="background:#E8F5E9; color:#2E7D32; border:1px solid #C8E6C9; font-size:10px;" title="Janela Meta ativa">🟢 ${janelaMeta.tempoRestanteStr}</span>`;
      }
    }

    return `
      <li class="conversa-item ${c.id === conversaAtivaId ? 'active' : ''}" onclick="abrirConversa('${c.id}')">
        <div class="header-item">
          <span class="cliente-nome">${iconeOrigem} ${escapeHTML(c.cliente?.nome || 'Cliente')}</span>
          <span class="cliente-hora">${c.mensagens?.[c.mensagens.length - 1]?.hora || ''}</span>
        </div>
        <div class="preview-txt">${escapeHTML(ultimaMsg)}</div>
        <div style="margin-top:4px; display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
          ${tagOrigem}
          ${tagVideo}
          ${badgeStatus}
          ${badgeJanela}
        </div>
      </li>
    `;
  }).join('');
}

function abrirConversa(id) {
  conversaAtivaId = id;
  renderizarListaConversas();

  const c = conversas.find(item => item.id === id);
  if (!c) return;

  document.getElementById('chatAtivoNome').textContent = c.cliente?.nome || 'Cliente';
  const origemTxt = c.canalOrigem === 'site' ? '🌐 Formulário do Site' : '📱 WhatsApp';
  document.getElementById('chatAtivoTelefone').textContent = `${c.cliente?.telefone || ''} · ${c.cliente?.empresa || ''} · ${origemTxt}`;

  // Botões de Ação no topo da conversa
  const acoesBox = document.getElementById('chatAtivoAcoes');
  if (c.orcamentoId) {
    acoesBox.innerHTML = `<button type="button" class="btn btn-ghost" style="padding:5px 10px; font-size:11px;" onclick="abrirOrcamentoPorId('${c.orcamentoId}')">📄 Abrir Orçamento #${c.orcamentoNumero || ''}</button>`;
  } else {
    acoesBox.innerHTML = `<button type="button" class="btn btn-primary" style="padding:5px 12px; font-size:11px;" onclick="gerarOrcamentoDaConversa('${c.id}')">✨ Gerar Orçamento desta Conversa</button>`;
  }

  // Banner Informativo de Vídeo na Conversa Selecionada
  const bannerVideo = document.getElementById('chatVideoBanner');
  if (bannerVideo) {
    const vInfo = c.videoInfo || {};
    let linkVideo = vInfo.linkVideo;
    let pendenteContato = vInfo.pendenteContato;

    if (!linkVideo && c.descricaoServico) {
      const m = c.descricaoServico.match(/https?:\/\/[^\s|]+/);
      if (m) linkVideo = m[0];
    }

    if (linkVideo) {
      bannerVideo.style.display = 'flex';
      bannerVideo.className = 'orcamento-video-banner';
      bannerVideo.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📹</span>
          <div>
            <b>Vídeo da peça anexado pelo cliente:</b>
            <div style="font-size:11px; color:var(--texto-suave);">${escapeHTML(linkVideo)}</div>
          </div>
        </div>
        <a href="${escapeAttr(linkVideo)}" target="_blank" class="btn btn-primary" style="padding:4px 10px; font-size:11px; text-decoration:none;">▶️ Assistir Vídeo</a>
      `;
    } else if (pendenteContato) {
      let fone = (c.cliente?.telefone || '').replace(/\D/g, '');
      if (fone && fone.length <= 11 && !fone.startsWith('55')) fone = '55' + fone;
      const txtMsg = `Olá ${c.cliente?.nome || ''}, aqui é da Nardelli Usinagem! Recebemos sua mensagem pelo site. Você marcou a opção para nos enviar o vídeo da peça, pode nos mandar por aqui?`;
      const urlWhats = fone ? `https://web.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(txtMsg)}` : '#';

      bannerVideo.style.display = 'flex';
      bannerVideo.className = 'orcamento-video-banner alerta-contato';
      bannerVideo.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📹</span>
          <div>
            <b style="color:#C2410C;">Cliente aguarda contato para enviar vídeo da peça!</b>
            <div style="font-size:11px; color:var(--texto-suave);">Ele marcou no formulário do site que deseja que a equipe entre em contato via WhatsApp para receber o vídeo.</div>
          </div>
        </div>
        <a href="${urlWhats}" target="_blank" class="btn btn-whatsapp-web" style="padding:4px 10px; font-size:11px; text-decoration:none;">🟢 Solicitar Vídeo no WhatsApp Web</a>
      `;
    } else {
      bannerVideo.style.display = 'none';
    }
  }

  // Monitor da Janela de 24h da Meta
  const bannerJanela = document.getElementById('chatMetaJanelaBanner');
  const btnEnviar = document.getElementById('btnChatEnviar');

  if (c.janelaMeta && bannerJanela) {
    bannerJanela.style.display = 'flex';
    if (c.janelaMeta.expirada) {
      bannerJanela.className = 'chat-meta-banner expirada';
      bannerJanela.innerHTML = `
        <div>
          <b>🔴 Janela Meta 24h Expirada:</b> A última mensagem recebida do cliente faz mais de 24 horas (${c.janelaMeta.tempoRestanteStr}).<br>
          <span style="font-size:10px; color:#A73A00;">Para evitar a cobrança de taxa da Meta por iniciar nova conversa na API oficial, o sistema redirecionará diretamente para o <b>WhatsApp Web</b> para envio gratuito.</span>
        </div>
      `;
      if (btnEnviar) {
        btnEnviar.className = 'btn btn-whatsapp-web';
        btnEnviar.innerHTML = '🟢 Abrir no WhatsApp Web (Gratuito)';
      }
    } else {
      bannerJanela.className = 'chat-meta-banner ativa';
      bannerJanela.innerHTML = `
        <div>
          <b>🟢 Janela Meta 24h Ativa:</b> Respostas livres de taxa via API da Meta (${c.janelaMeta.tempoRestanteStr}).
        </div>
      `;
      if (btnEnviar) {
        btnEnviar.className = 'btn btn-primary';
        btnEnviar.textContent = 'Enviar Mensagem';
      }
    }
  }

  // Renderiza balões de mensagem
  const chatBody = document.getElementById('chatAtivoMensagens');
  chatBody.innerHTML = (c.mensagens || []).map(m => {
    const isBot = m.remetente === 'bot' || m.remetente === 'atendente';
    const tagWeb = m.viaWhatsAppWeb ? '<span style="font-size:9px; color:#25D366; font-weight:700;"> [WhatsApp Web]</span>' : '';
    const anexoHTML = m.anexoNome ? `<div style="font-size:11px; margin-top:4px; font-weight:700;">📎 ${escapeHTML(m.anexoNome)}</div>` : '';

    return `
      <div class="bubble ${isBot ? 'bot' : 'cliente'}">
        <div>${escapeHTML(m.texto)}${tagWeb}</div>
        ${anexoHTML}
        <span class="hora">${m.hora || ''}</span>
      </div>
    `;
  }).join('');

  chatBody.scrollTop = chatBody.scrollHeight;
}

/**
 * Envia mensagem respeitando a janela de 24h da Meta:
 * - Se expirada: abre o WhatsApp Web pré-preenchido para envio gratuito manual
 * - Se dentro de 24h: envia normalmente pela API
 */
async function enviarMensagemAtendenteOuCliente() {
  const input = document.getElementById('inputChatMsg');
  const texto = input.value.trim();
  if (!texto) return;

  if (!conversaAtivaId) {
    mostrarErro('Selecione uma conversa para responder.');
    return;
  }

  const c = conversas.find(item => item.id === conversaAtivaId);
  if (!c) return;

  const janela = c.janelaMeta;
  const expirada = janela && janela.expirada;

  if (expirada) {
    // Abre no WhatsApp Web para evitar taxas de templates pagos da Meta
    let fone = (c.cliente?.telefone || '').replace(/\D/g, '');
    if (fone && fone.length <= 11 && !fone.startsWith('55')) {
      fone = '55' + fone;
    }
    const urlWeb = `https://web.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(texto)}`;
    window.open(urlWeb, '_blank');

    // Registra a mensagem no histórico do sistema com a marcação do WhatsApp Web
    try {
      await fetch(`/api/inbound/conversas/${conversaAtivaId}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto,
          remetente: 'atendente',
          viaWhatsAppWeb: true
        })
      });
      input.value = '';
      avisar('WhatsApp Web aberto em nova aba com a mensagem pré-preenchida (envio gratuito sem taxas da Meta).');
      await carregarConversas();
      abrirConversa(conversaAtivaId);
    } catch (e) {
      console.error(e);
    }
  } else {
    // Janela ativa: envio direto normal
    input.value = '';
    try {
      const res = await fetch(`/api/inbound/conversas/${conversaAtivaId}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, remetente: 'bot' })
      });
      const data = await res.json();
      if (data.sucesso) {
        await carregarConversas();
        abrirConversa(conversaAtivaId);
      }
    } catch (e) {
      mostrarErro('Erro ao enviar mensagem.');
    }
  }
}

/**
 * Simula uma mensagem de cliente entrando pelo WhatsApp para testar a reabertura da janela de 24h
 */
async function simularMensagemClienteEntrando() {
  if (!conversaAtivaId) {
    mostrarErro('Selecione uma conversa primeiro.');
    return;
  }

  const texto = prompt('Digite a mensagem simulada do cliente para reabrir a janela de 24h:', 'Olá! Conseguem fazer esse orçamento para entregar até sexta-feira?');
  if (!texto || !texto.trim()) return;

  try {
    const res = await fetch(`/api/inbound/conversas/${conversaAtivaId}/mensagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: texto.trim(), remetente: 'cliente' })
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar('Mensagem do cliente simulada com sucesso! Janela de 24h da Meta reaberta.');
      await carregarConversas();
      abrirConversa(conversaAtivaId);
    }
  } catch (e) {
    mostrarErro('Erro ao simular cliente.');
  }
}

async function gerarOrcamentoDaConversa(conversaId) {
  avisar('Gerando prévia com IA a partir das mensagens do cliente...');
  try {
    const res = await fetch(`/api/inbound/conversas/${conversaId}/gerar-orcamento`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar(`Orçamento #${data.orcamento.numero} gerado com sucesso!`);
      await carregarConversas();
      await carregarSalvos();
      carregarOrcamentoNoFormulario(data.orcamento);
      showTab('orcamento');
    }
  } catch (e) {
    mostrarErro('Falha ao gerar orçamento da conversa: ' + e.message);
  }
}

/* ---------------------------------------------------------------
   PEDIDOS EM ABERTO & HISTÓRICO CONCLUÍDOS
--------------------------------------------------------------- */
async function carregarSalvos() {
  try {
    const res = await fetch('/api/orcamentos');
    const data = await res.json();
    if (data.sucesso) {
      orcamentosSalvos = data.orcamentos || [];
      renderAbertos();
      renderSalvos();
    }
  } catch (e) {
    console.error('Erro ao buscar orçamentos:', e);
  }
}

function isOrcamentoNovo(o) {
  if (o.status === 'CONCLUIDO' || o.status === 'APROVADO' || o.status === 'RECUSADO') return false;
  if (o.status === 'EM_ANDAMENTO' || o.status === 'ENVIADO_AO_CLIENTE' || o.status === 'AJUSTE_SOLICITADO') return false;
  return !o.visualizado && !o.dataInicio;
}

function isOrcamentoEmAndamento(o) {
  if (o.status === 'CONCLUIDO' || o.status === 'APROVADO' || o.status === 'RECUSADO' || o.status === 'ENVIADO_AO_CLIENTE' || o.status === 'AJUSTE_SOLICITADO') return false;
  return o.status === 'EM_ANDAMENTO' || Boolean(o.visualizado);
}

function isOrcamentoEnviado(o) {
  return o.status === 'ENVIADO_AO_CLIENTE';
}

function isOrcamentoAjuste(o) {
  return o.status === 'AJUSTE_SOLICITADO';
}

function filtrarAbertosPorEtapa(etapa) {
  filtroEtapaAbertosAtivo = etapa;
  document.querySelectorAll('[data-etapa-abertos]').forEach(btn => {
    if (btn.dataset.etapaAbertos === etapa) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderAbertos();
}

function filtrarAbertosPorOrigem(origem) {
  filtroOrigemAbertosAtivo = origem;
  document.querySelectorAll('[data-origem-abertos]').forEach(btn => {
    if (btn.dataset.origemAbertos === origem) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderAbertos();
}

function renderAbertos() {
  const empty = document.getElementById('abertos-empty');
  const wrap = document.getElementById('abertos-table-wrap');
  const tbody = document.getElementById('abertos-body');
  if (!tbody) return;

  // Pedidos em aberto: status diferente de APROVADO, RECUSADO e CONCLUIDO
  const todosAbertos = orcamentosSalvos.filter(o => o.status !== 'APROVADO' && o.status !== 'RECUSADO' && o.status !== 'CONCLUIDO');

  // Separar pelas 4 etapas do funil comercial
  const novos = todosAbertos.filter(isOrcamentoNovo);
  const emAndamento = todosAbertos.filter(isOrcamentoEmAndamento);
  const enviados = todosAbertos.filter(isOrcamentoEnviado);
  const ajustes = todosAbertos.filter(isOrcamentoAjuste);

  // Ordenar cada grupo por data decrescente (mais recente primeiro)
  const compararDataDesc = (a, b) => {
    const tA = new Date(a.dataCriacao || a.data || 0).getTime();
    const tB = new Date(b.dataCriacao || b.data || 0).getTime();
    return tB - tA;
  };
  novos.sort(compararDataDesc);
  emAndamento.sort(compararDataDesc);
  enviados.sort(compararDataDesc);
  ajustes.sort(compararDataDesc);

  // Atualizar contadores dos 4 KPIs do topo da tela
  const kpiNovos = document.getElementById('kpiNovosCount');
  const kpiAndamento = document.getElementById('kpiEmAndamentoCount');
  const kpiEnviados = document.getElementById('kpiEnviadosCount');
  const kpiAjustes = document.getElementById('kpiAjustesCount');
  if (kpiNovos) kpiNovos.textContent = novos.length;
  if (kpiAndamento) kpiAndamento.textContent = emAndamento.length;
  if (kpiEnviados) kpiEnviados.textContent = enviados.length;
  if (kpiAjustes) kpiAjustes.textContent = ajustes.length;

  // Atualizar contadores dos botões de filtro por Etapa
  const elEtapaTodos = document.getElementById('contagemEtapaTodos');
  const elEtapaNovos = document.getElementById('contagemEtapaNovos');
  const elEtapaAndamento = document.getElementById('contagemEtapaAndamento');
  const elEtapaEnviados = document.getElementById('contagemEtapaEnviados');
  const elEtapaAjustes = document.getElementById('contagemEtapaAjustes');
  if (elEtapaTodos) elEtapaTodos.textContent = todosAbertos.length;
  if (elEtapaNovos) elEtapaNovos.textContent = novos.length;
  if (elEtapaAndamento) elEtapaAndamento.textContent = emAndamento.length;
  if (elEtapaEnviados) elEtapaEnviados.textContent = enviados.length;
  if (elEtapaAjustes) elEtapaAjustes.textContent = ajustes.length;

  // Badge da aba no topo do dashboard: exibe novos + ajustes prioritários
  const badgeAbertos = document.getElementById('badgePedidosAbertos');
  if (badgeAbertos) {
    const atencao = novos.length + ajustes.length;
    if (atencao > 0) {
      badgeAbertos.textContent = atencao;
      badgeAbertos.style.display = 'inline-block';
      badgeAbertos.className = 'nav-badge nav-badge-novo';
      badgeAbertos.title = `${novos.length} novo(s) e ${ajustes.length} ajuste(s) requerem atenção`;
    } else if (enviados.length > 0) {
      badgeAbertos.textContent = enviados.length;
      badgeAbertos.style.display = 'inline-block';
      badgeAbertos.className = 'nav-badge';
      badgeAbertos.title = `${enviados.length} proposta(s) enviada(s) aguardando retorno do cliente`;
    } else {
      badgeAbertos.style.display = 'none';
      badgeAbertos.className = 'nav-badge';
    }
  }

  // Contadores dos botões de filtro por Origem
  const countTodos = todosAbertos.length;
  const countSite = todosAbertos.filter(o => o.origem === 'site').length;
  const countWhatsapp = todosAbertos.filter(o => o.origem === 'whatsapp' || o.origem === 'chatbot').length;
  const countManual = todosAbertos.filter(o => o.origem === 'manual' || !o.origem).length;

  const elTodos = document.getElementById('contagemAbertosTodos');
  const elSite = document.getElementById('contagemAbertosSite');
  const elWhatsapp = document.getElementById('contagemAbertosWhatsapp');
  const elManual = document.getElementById('contagemAbertosManual');

  if (elTodos) elTodos.textContent = countTodos;
  if (elSite) elSite.textContent = countSite;
  if (elWhatsapp) elWhatsapp.textContent = countWhatsapp;
  if (elManual) elManual.textContent = countManual;

  if (todosAbertos.length === 0) {
    if (empty) empty.style.display = 'block';
    if (wrap) wrap.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (wrap) wrap.style.display = 'block';

  // Aplica filtro por etapa:
  let listaEtapa = [];
  if (filtroEtapaAbertosAtivo === 'novos') {
    listaEtapa = novos;
  } else if (filtroEtapaAbertosAtivo === 'andamento') {
    listaEtapa = emAndamento;
  } else if (filtroEtapaAbertosAtivo === 'enviados') {
    listaEtapa = enviados;
  } else if (filtroEtapaAbertosAtivo === 'ajustes') {
    listaEtapa = ajustes;
  } else {
    // "todos": Prioridade: Ajustes e Novos no topo, depois Em Elaboração, depois Enviados
    listaEtapa = [...ajustes, ...novos, ...emAndamento, ...enviados];
  }

  // Aplica filtro por origem
  let lista = listaEtapa;
  if (filtroOrigemAbertosAtivo === 'site') {
    lista = listaEtapa.filter(o => o.origem === 'site');
  } else if (filtroOrigemAbertosAtivo === 'whatsapp') {
    lista = listaEtapa.filter(o => o.origem === 'whatsapp' || o.origem === 'chatbot');
  } else if (filtroOrigemAbertosAtivo === 'manual') {
    lista = listaEtapa.filter(o => o.origem === 'manual' || !o.origem);
  }

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--texto-suave);">Nenhum pedido encontrado para a combinação de filtros selecionada.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(s => {
    const isNovo = isOrcamentoNovo(s);
    const isEnviado = isOrcamentoEnviado(s);
    const isAjuste = isOrcamentoAjuste(s);
    const dataFormatada = s.data || (s.dataCriacao ? s.dataCriacao.split('T')[0] : '');
    
    let badgeOrigem = '<span class="badge-origem-manual">👤 Manual</span>';
    if (s.origem === 'site') {
      badgeOrigem = '<span class="badge-origem-site">🌐 Site</span>';
    } else if (s.origem === 'whatsapp' || s.origem === 'chatbot') {
      badgeOrigem = '<span class="badge-origem-whatsapp">📱 WhatsApp</span>';
    }

    let badgeEtapa = '';
    let rowStyle = '';
    let botaoAcao = '';

    if (isAjuste) {
      badgeEtapa = '<span class="badge" style="background:#FFFBEB; color:#92400E; border:1px solid #FDE68A; font-weight:800; font-size:10px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#D97706;"></span>🔄 AJUSTE PEDIDO</span>';
      rowStyle = 'background:rgba(254, 243, 199, 0.45); font-weight:500;';
      botaoAcao = `
        <div style="display:inline-flex; gap:4px; align-items:center;">
          <button type="button" class="btn btn-warning" style="padding:4px 8px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;" onclick="abrirOuIniciarOrcamento('${s.id}')" title="Abrir para aplicar os ajustes solicitados pelo cliente">🛠️ Fazer Ajustes</button>
          <button type="button" class="btn btn-ghost" style="padding:4px 6px; font-size:11px; color:#1D4ED8;" onclick="abrirModalHistoricoCliente('${s.id}')" title="Ver o que o cliente pediu no histórico">📜</button>
        </div>
      `;
    } else if (isEnviado) {
      badgeEtapa = '<span class="badge" style="background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE; font-weight:700; font-size:10px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2563EB;"></span>📤 ENVIADO (AGUARDANDO)</span>';
      rowStyle = 'background:rgba(239, 246, 255, 0.35);';
      botaoAcao = `
        <div style="display:inline-flex; gap:3px; align-items:center;">
          <button type="button" class="btn btn-ghost" style="padding:4px 7px; font-size:11px;" onclick="abrirOuIniciarOrcamento('${s.id}')" title="Visualizar proposta">📄 Ver</button>
          <button type="button" class="btn btn-success" style="padding:4px 7px; font-size:11px; font-weight:700;" onclick="abrirModalFeedback('aprovar', '${s.id}')" title="Cliente APROVOU a proposta">✅</button>
          <button type="button" class="btn btn-warning" style="padding:4px 7px; font-size:11px; font-weight:700;" onclick="abrirModalFeedback('ajuste', '${s.id}')" title="Cliente pediu AJUSTE">🔄</button>
          <button type="button" class="btn btn-danger" style="padding:4px 7px; font-size:11px; font-weight:700;" onclick="abrirModalFeedback('recusar', '${s.id}')" title="Cliente RECUSOU a proposta">❌</button>
          <button type="button" class="btn btn-ghost" style="padding:4px 5px; font-size:11px; color:#1D4ED8;" onclick="abrirModalHistoricoCliente('${s.id}')" title="Ver histórico/linha do tempo">📜</button>
        </div>
      `;
    } else if (isNovo) {
      badgeEtapa = '<span class="badge" style="background:#FFF1F2; color:#BE123C; border:1px solid #FECDD3; font-weight:800; font-size:10px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#E11D48;"></span>NOVO</span>';
      rowStyle = 'background:rgba(255, 241, 242, 0.45); font-weight:500;';
      botaoAcao = `<button type="button" class="btn btn-primary" style="padding:5px 12px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;" onclick="abrirOuIniciarOrcamento('${s.id}')" title="Abrir pedido para elaboração técnica (moverá para 'Em Elaboração')">🚀 Abrir Pedido</button>`;
    } else {
      badgeEtapa = '<span class="badge" style="background:#FEFCE8; color:#854D0E; border:1px solid #FEF08A; font-weight:700; font-size:10px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#CA8A04;"></span>EM ELABORAÇÃO</span>';
      const temTotal = (s.totais?.totalFinal || 0) > 0;
      botaoAcao = `
        <div style="display:inline-flex; gap:4px; align-items:center;">
          <button type="button" class="btn btn-ghost" style="padding:4px 8px; font-size:11px; font-weight:600; color:var(--azul); border-color:var(--azul); display:inline-flex; align-items:center; gap:4px;" onclick="abrirOuIniciarOrcamento('${s.id}')" title="Continuar elaboração técnica deste orçamento">✏️ Continuar</button>
          ${temTotal ? `<button type="button" class="btn btn-success" style="padding:4px 8px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:3px;" onclick="abrirModalEnviarProposta('${s.id}')" title="Enviar proposta calculada ao cliente">📤 Enviar</button>` : ''}
        </div>
      `;
    }

    const tagVideo = (s.videoInfo?.temVideo || (s.observacoes && s.observacoes.toLowerCase().includes('vídeo')))
      ? '<span class="badge" style="background:#E0F2FE; color:#0369A1; border:1px solid #BAE6FD; font-size:9px; margin-left:4px;">📹 Vídeo</span>'
      : '';

    const qtdTotal = s.quantidadePecas || 1;
    const unidTotal = s.unidadePeca || 'PÇ';
    const totalVal = s.totais?.totalFinal || 0;
    const unitVal = s.totais?.valorUnitarioPeca || (totalVal > 0 ? (totalVal / qtdTotal) : 0);

    return `
      <tr style="${rowStyle}">
        <td style="font-weight:700;">#${escapeAttr(s.numero || '(s/n)')}</td>
        <td>${badgeEtapa}</td>
        <td>${badgeOrigem}</td>
        <td><b>${escapeAttr(s.cliente?.nome || '(sem nome)')}</b></td>
        <td style="font-size:12px; color:var(--texto-suave);">
          ${escapeHTML(descricaoCurta)} ${tagVideo}
          <div style="font-size:11px; margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="badge" style="background:#F1F5F9; color:#334155; font-size:10px; font-weight:700;">📦 ${qtdTotal} ${unidTotal}</span>
            ${totalVal > 0 ? `<span style="color:var(--azul); font-weight:700;">💵 ${fmt(unitVal)} / ${unidTotal}</span> <span style="color:var(--texto-suave);">(Total: ${fmt(totalVal)})</span>` : ''}
          </div>
        </td>
        <td style="color:var(--texto-suave); font-size:12px;">${escapeAttr(dataFormatada)}</td>
        <td style="text-align:center; white-space:nowrap;">
          ${botaoAcao}
          <button type="button" class="rm" onclick="excluirOrcamentoPorId('${s.id}')" title="Excluir pedido" style="margin-left:4px;">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function abrirOuIniciarOrcamento(id) {
  try {
    const oLocal = orcamentosSalvos.find(item => item.id === id);
    const eraNovo = oLocal && isOrcamentoNovo(oLocal);

    // Se o pedido era NOVO, atualiza no servidor para EM_ANDAMENTO
    if (eraNovo) {
      fetch(`/api/orcamentos/${id}/iniciar`, { method: 'PATCH' }).catch(() => {});
      if (oLocal) {
        oLocal.visualizado = true;
        oLocal.status = 'EM_ANDAMENTO';
        if (!oLocal.dataInicio) oLocal.dataInicio = new Date().toISOString();
      }
      renderAbertos();
    }

    const res = await fetch(`/api/orcamentos/${id}`);
    const data = await res.json();
    if (data.sucesso && data.orcamento) {
      if (eraNovo && !data.orcamento.status) {
        data.orcamento.status = 'EM_ANDAMENTO';
        data.orcamento.visualizado = true;
      }
      carregarOrcamentoNoFormulario(data.orcamento);
      showTab('orcamento');
      if (eraNovo) {
        avisar(`🚀 Orçamento #${data.orcamento.numero || ''} aberto! Movido para "Em Elaboração".`);
      } else {
        avisar(`✏️ Orçamento #${data.orcamento.numero || ''} carregado.`);
      }
    }
  } catch (e) {
    mostrarErro('Erro ao abrir pedido: ' + e.message);
  }
}

// Compatibilidade
const revisarPedidoAberto = abrirOuIniciarOrcamento;

async function marcarTodosPedidosVisualizados() {
  try {
    const res = await fetch('/api/orcamentos/marcar-todos-visualizados', { method: 'POST' });
    const data = await res.json();
    if (data.sucesso) {
      avisar('✓ Notificações zeradas! Todos os pedidos marcados como visualizados.');
      await carregarSalvos();
    }
  } catch (e) {
    mostrarErro('Erro ao atualizar visualizações.');
  }
}

function filtrarHistoricoPorOrigem(origem) {
  filtroOrigemAtivo = origem;
  document.querySelectorAll('[data-origem]').forEach(btn => {
    if (btn.dataset.origem === origem) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderSalvos();
}

function renderSalvos() {
  const empty = document.getElementById('salvos-empty');
  const wrap = document.getElementById('salvos-table-wrap');
  const tbody = document.getElementById('salvos-body');
  if (!tbody) return;

  // No Histórico: APROVADO, RECUSADO ou CONCLUIDO
  const concluidos = orcamentosSalvos.filter(o => o.status === 'APROVADO' || o.status === 'RECUSADO' || o.status === 'CONCLUIDO');

  // Atualiza contadores dos filtros do Histórico
  const countTodos = concluidos.length;
  const countSite = concluidos.filter(o => o.origem === 'site').length;
  const countWhatsapp = concluidos.filter(o => o.origem === 'whatsapp' || o.origem === 'chatbot').length;
  const countManual = concluidos.filter(o => o.origem === 'manual' || !o.origem).length;

  const elTodos = document.getElementById('contagemTodos');
  const elSite = document.getElementById('contagemSite');
  const elWhatsapp = document.getElementById('contagemWhatsapp');
  const elManual = document.getElementById('contagemManual');

  if (elTodos) elTodos.textContent = countTodos;
  if (elSite) elSite.textContent = countSite;
  if (elWhatsapp) elWhatsapp.textContent = countWhatsapp;
  if (elManual) elManual.textContent = countManual;

  // Aplica filtro ativo
  let listaFiltrada = concluidos;
  if (filtroOrigemAtivo === 'site') {
    listaFiltrada = concluidos.filter(o => o.origem === 'site');
  } else if (filtroOrigemAtivo === 'whatsapp') {
    listaFiltrada = concluidos.filter(o => o.origem === 'whatsapp' || o.origem === 'chatbot');
  } else if (filtroOrigemAtivo === 'manual') {
    listaFiltrada = concluidos.filter(o => o.origem === 'manual' || !o.origem);
  }

  if (concluidos.length === 0) {
    if (empty) empty.style.display = 'block';
    if (wrap) wrap.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (wrap) wrap.style.display = 'block';

  if (listaFiltrada.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--texto-suave);">Nenhum orçamento encontrado para o filtro selecionado.</td></tr>';
    return;
  }

  tbody.innerHTML = listaFiltrada.map(s => {
    const dataFormatada = s.data || (s.dataCriacao ? s.dataCriacao.split('T')[0] : '');
    
    let badgeOrigem = '<span class="badge-origem-manual">👤 Manual</span>';
    if (s.origem === 'site') {
      badgeOrigem = '<span class="badge-origem-site">🌐 Site</span>';
    } else if (s.origem === 'whatsapp' || s.origem === 'chatbot') {
      badgeOrigem = '<span class="badge-origem-whatsapp">📱 WhatsApp</span>';
    }

    let badgeStatus = '<span class="badge" style="background:#DCFCE7; color:#166534; border:1px solid #BBF7D0; font-weight:700; font-size:10px;">🟢 APROVADO</span>';
    if (s.status === 'RECUSADO') {
      const mot = s.feedbackCliente?.motivo || 'Recusado';
      badgeStatus = `<span class="badge" style="background:#FEF2F2; color:#B91C1C; border:1px solid #FECACA; font-weight:700; font-size:10px;" title="Motivo: ${escapeAttr(mot)}">🔴 RECUSADO</span>`;
    } else if (s.status === 'CONCLUIDO') {
      badgeStatus = '<span class="badge" style="background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; font-weight:600; font-size:10px;">CONCLUÍDO</span>';
    }

    const descricaoCurta = s.descricaoServico ? (s.descricaoServico.length > 55 ? s.descricaoServico.slice(0, 52) + '...' : s.descricaoServico) : '---';

    return `
      <tr>
        <td style="font-weight:700;">#${escapeAttr(s.numero || '(s/n)')}</td>
        <td>${badgeStatus}</td>
        <td>${badgeOrigem}</td>
        <td><b>${escapeAttr(s.cliente?.nome || '(sem nome)')}</b></td>
        <td style="font-size:12px; color:var(--texto-suave);">${escapeHTML(descricaoCurta)}</td>
        <td class="num">
          <b>${fmt(s.totais?.totalFinal || 0)}</b>
          <div style="font-size:11px; color:var(--texto-suave); font-weight:normal; margin-top:2px;">
            ${s.quantidadePecas || 1} ${s.unidadePeca || 'PÇ'} · ${fmt(s.totais?.valorUnitarioPeca || ((s.totais?.totalFinal || 0) / (s.quantidadePecas || 1)))}/un
          </div>
        </td>
        <td style="text-align:center; white-space:nowrap;">
          <button type="button" class="btn btn-ghost" style="padding:4px 8px; font-size:11px;" onclick="abrirOrcamentoPorId('${s.id}')" title="Ver / Editar proposta">📄 Ver</button>
          <button type="button" class="btn btn-ghost" style="padding:4px 8px; font-size:11px; color:#1D4ED8;" onclick="abrirModalHistoricoCliente('${s.id}')" title="Ver linha do tempo e negociação com cliente">📜 Histórico</button>
          <button type="button" class="btn btn-ghost" style="padding:4px 8px; font-size:11px; color:#2563EB;" onclick="reabrirOrcamentoConcluido('${s.id}')" title="Reabrir e mover para Pedidos em Aberto">🔄 Reabrir</button>
          <button type="button" class="rm" onclick="excluirOrcamentoPorId('${s.id}')">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function reabrirOrcamentoConcluido(id) {
  const o = orcamentosSalvos.find(item => item.id === id);
  const num = o?.numero || '';
  if (!confirm(`Deseja reabrir o Orçamento #${num}? Ele retornará para "Em Andamento" na fila de Pedidos em Aberto.`)) return;

  try {
    const res = await fetch(`/api/orcamentos/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'EM_ANDAMENTO' })
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar(`🔄 Orçamento #${num} reaberto e movido para "Em Andamento" em Pedidos em Aberto.`);
      await carregarSalvos();
    }
  } catch (e) {
    mostrarErro('Erro ao reabrir orçamento.');
  }
}

async function abrirOrcamentoPorId(id) {
  try {
    const res = await fetch(`/api/orcamentos/${id}`);
    const data = await res.json();
    if (data.sucesso && data.orcamento) {
      carregarOrcamentoNoFormulario(data.orcamento);
      showTab('orcamento');
    }
  } catch (e) {
    mostrarErro('Não encontrei esse orçamento.');
  }
}

async function excluirOrcamentoPorId(id) {
  if (!confirm('Excluir esse orçamento? Não tem como desfazer.')) return;
  try {
    const res = await fetch(`/api/orcamentos/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.sucesso) {
      avisar('Orçamento excluído.');
      await carregarSalvos();
    }
  } catch (e) {
    mostrarErro('Erro ao excluir orçamento.');
  }
}

/* ===============================================================
   CADASTRO E GESTÃO DE CLIENTES (CRM)
=============================================================== */
let clientesCadastrados = [];

async function carregarClientes(busca = '') {
  try {
    const url = busca ? `/api/clientes?busca=${encodeURIComponent(busca)}` : '/api/clientes';
    const res = await fetch(url);
    const data = await res.json();
    if (data.sucesso) {
      clientesCadastrados = data.clientes || [];
      renderSelectClientesCadastrados();
      renderTabelaClientes(clientesCadastrados);
    }
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
  }
}

function renderSelectClientesCadastrados() {
  const sel = document.getElementById('selectClienteCadastrado');
  const dlist = document.getElementById('listaClientesCadastrados');
  if (!sel && !dlist) return;

  const nomeAtual = (document.getElementById('clienteNome')?.value || '').trim().toLowerCase();

  if (sel) {
    let optionsHtml = '<option value="">-- Novo Cliente / Preencher Manualmente --</option>';
    clientesCadastrados.forEach(c => {
      const match = (c.nome || '').toLowerCase() === nomeAtual;
      const telStr = c.telefone ? ` (${c.telefone})` : '';
      optionsHtml += `<option value="${escapeAttr(c.id)}"${match ? ' selected' : ''}>${escapeAttr(c.nome)}${escapeAttr(telStr)}</option>`;
    });
    sel.innerHTML = optionsHtml;
  }

  if (dlist) {
    dlist.innerHTML = clientesCadastrados.map(c => `<option value="${escapeAttr(c.nome)}">`).join('');
  }
}

function aoSelecionarClienteCadastrado(clienteId) {
  const badge = document.getElementById('clienteFeedbackBadge');
  if (!clienteId) {
    if (badge) badge.style.display = 'none';
    return;
  }

  const cliente = clientesCadastrados.find(c => c.id === clienteId);
  if (!cliente) return;

  document.getElementById('clienteNome').value = cliente.nome || '';
  if (cliente.telefone || cliente.tel) {
    document.getElementById('clienteTel').value = cliente.telefone || cliente.tel || '';
  }
  if (cliente.cep) {
    document.getElementById('clienteCep').value = cliente.cep || '';
  }
  if (cliente.endereco) {
    document.getElementById('clienteEndereco').value = cliente.endereco || '';
    recalcularDistanciaPeloEndereco(true);
  }

  if (badge) {
    badge.textContent = `✓ Dados de "${cliente.nome}" carregados`;
    badge.style.display = 'inline-block';
    setTimeout(() => { badge.style.display = 'none'; }, 4000);
  }
}

function aoDigitarNomeCliente(valor) {
  const val = (valor || '').trim().toLowerCase();
  const badge = document.getElementById('clienteFeedbackBadge');
  const sel = document.getElementById('selectClienteCadastrado');

  if (!val) {
    if (sel) sel.value = '';
    if (badge) badge.style.display = 'none';
    return;
  }

  const exato = clientesCadastrados.find(c => (c.nome || '').toLowerCase() === val);
  if (exato) {
    if (sel) sel.value = exato.id;
    if ((exato.telefone || exato.tel) && !document.getElementById('clienteTel').value.trim()) {
      document.getElementById('clienteTel').value = exato.telefone || exato.tel;
    }
    if (exato.cep && !document.getElementById('clienteCep').value.trim()) {
      document.getElementById('clienteCep').value = exato.cep;
    }
    if (exato.endereco && !document.getElementById('clienteEndereco').value.trim()) {
      document.getElementById('clienteEndereco').value = exato.endereco;
      recalcularDistanciaPeloEndereco(true);
    }
    if (badge) {
      badge.textContent = `✓ Cliente reconhecido: ${exato.nome}`;
      badge.style.display = 'inline-block';
    }
  } else {
    if (sel) sel.value = '';
    if (badge) badge.style.display = 'none';
  }
}

function sincronizarSelectClienteComFormulario(nome) {
  const sel = document.getElementById('selectClienteCadastrado');
  const badge = document.getElementById('clienteFeedbackBadge');
  if (!sel) return;

  const n = (nome || '').trim().toLowerCase();
  const match = clientesCadastrados.find(c => (c.nome || '').toLowerCase() === n);
  if (match) {
    sel.value = match.id;
    if (badge) {
      badge.textContent = `✓ Cliente: ${match.nome}`;
      badge.style.display = 'inline-block';
    }
  } else {
    sel.value = '';
    if (badge) badge.style.display = 'none';
  }
}

async function salvarClienteAtualDoFormulario() {
  const nome = (document.getElementById('clienteNome')?.value || '').trim();
  if (!nome) {
    mostrarErro('Informe o nome do cliente antes de salvar.');
    document.getElementById('clienteNome')?.focus();
    return;
  }

  const telefone = (document.getElementById('clienteTel')?.value || '').trim();
  const cep = (document.getElementById('clienteCep')?.value || '').trim();
  const endereco = (document.getElementById('clienteEndereco')?.value || '').trim();

  const selId = document.getElementById('selectClienteCadastrado')?.value;
  const existente = clientesCadastrados.find(c => c.id === selId || (c.nome && c.nome.toLowerCase() === nome.toLowerCase()));

  const payload = {
    id: existente ? existente.id : null,
    nome,
    telefone,
    cep,
    endereco,
    email: existente?.email || '',
    contato: existente?.contato || '',
    documento: existente?.documento || '',
    observacoes: existente?.observacoes || ''
  };

  try {
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar(`✅ Cliente "${data.cliente.nome}" salvo no cadastro!`);
      await carregarClientes();
      const sel = document.getElementById('selectClienteCadastrado');
      if (sel) sel.value = data.cliente.id;
    } else {
      mostrarErro(data.erro || 'Erro ao salvar cliente.');
    }
  } catch (err) {
    mostrarErro('Erro ao comunicar com o servidor ao salvar cliente.');
  }
}

function renderTabelaClientes(lista = []) {
  const tbody = document.getElementById('tabela-clientes-body');
  const vazioMsg = document.getElementById('clientesVazioMsg');
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = '';
    if (vazioMsg) vazioMsg.style.display = 'block';
    return;
  }

  if (vazioMsg) vazioMsg.style.display = 'none';

  tbody.innerHTML = lista.map(c => {
    const tel = c.telefone || c.tel || '—';
    const email = c.email || '—';
    const endereco = (c.cep ? `<span style="font-size:11px; color:var(--texto-suave);">CEP ${escapeAttr(c.cep)}</span><br>` : '') + (c.endereco ? escapeAttr(c.endereco) : '—');
    const contato = c.contato ? `<br><small style="color:var(--texto-suave);">Contato: ${escapeAttr(c.contato)}</small>` : '';
    const doc = c.documento ? `<br><small style="color:var(--texto-suave); font-family:monospace;">${escapeAttr(c.documento)}</small>` : '';

    return `
      <tr>
        <td>
          <b style="color:var(--azul); font-size:13px;">${escapeAttr(c.nome)}</b>
          ${doc}
          ${contato}
        </td>
        <td>
          ${tel !== '—' ? `<a href="https://wa.me/55${tel.replace(/\D/g, '')}" target="_blank" style="color:var(--verde); font-weight:600; text-decoration:none;">📱 ${escapeAttr(tel)}</a>` : '—'}
        </td>
        <td style="font-size:12px; color:var(--texto-suave);">${escapeAttr(email)}</td>
        <td style="font-size:12px;">${endereco}</td>
        <td style="text-align:center; white-space:nowrap;">
          <button type="button" class="btn btn-ghost" onclick="iniciarOrcamentoParaCliente('${escapeAttr(c.id)}')" style="padding:4px 8px; font-size:11px; margin-right:4px;" title="Iniciar novo orçamento para este cliente">
            + Orçar
          </button>
          <button type="button" class="btn btn-ghost" onclick="abrirModalEditarCliente('${escapeAttr(c.id)}')" style="padding:4px 8px; font-size:11px; margin-right:4px;" title="Editar dados cadastrais">
            ✏️
          </button>
          <button type="button" class="btn btn-ghost" onclick="excluirCliente('${escapeAttr(c.id)}')" style="padding:4px 8px; font-size:11px; color:#DC2626;" title="Excluir cliente">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filtrarListaClientes(termo) {
  const t = (termo || '').trim().toLowerCase();
  if (!t) {
    renderTabelaClientes(clientesCadastrados);
    return;
  }
  const filtrados = clientesCadastrados.filter(c => {
    return (c.nome && c.nome.toLowerCase().includes(t)) ||
           (c.telefone && c.telefone.toLowerCase().includes(t)) ||
           (c.email && c.email.toLowerCase().includes(t)) ||
           (c.endereco && c.endereco.toLowerCase().includes(t)) ||
           (c.cep && c.cep.toLowerCase().includes(t)) ||
           (c.contato && c.contato.toLowerCase().includes(t)) ||
           (c.documento && c.documento.toLowerCase().includes(t));
  });
  renderTabelaClientes(filtrados);
}

function iniciarOrcamentoParaCliente(clienteId) {
  const cliente = clientesCadastrados.find(c => c.id === clienteId);
  if (!cliente) return;

  const novo = novoOrcamentoObjPadrao();
  novo.cliente = {
    nome: cliente.nome || '',
    tel: cliente.telefone || cliente.tel || '',
    cep: cliente.cep || '',
    endereco: cliente.endereco || '',
    email: cliente.email || ''
  };
  carregarOrcamentoNoFormulario(novo);
  arquivosPendentes = [];
  renderArquivosPendentes();
  mudarEtapaOrcamento('coleta');
  
  const sel = document.getElementById('selectClienteCadastrado');
  if (sel) sel.value = cliente.id;

  const badge = document.getElementById('clienteFeedbackBadge');
  if (badge) {
    badge.textContent = `✓ Novo orçamento para ${cliente.nome}`;
    badge.style.display = 'inline-block';
  }

  showTab('orcamento');
}

function abrirModalNovoCliente() {
  document.getElementById('modalClienteTitulo').innerHTML = '<span class="dot"></span>Novo Cliente';
  document.getElementById('modalClienteId').value = '';
  document.getElementById('modalClienteNome').value = '';
  document.getElementById('modalClienteDoc').value = '';
  document.getElementById('modalClienteContato').value = '';
  document.getElementById('modalClienteTel').value = '';
  document.getElementById('modalClienteEmail').value = '';
  const elCep = document.getElementById('modalClienteCep');
  if (elCep) elCep.value = '';
  document.getElementById('modalClienteEndereco').value = '';
  document.getElementById('modalClienteObs').value = '';

  document.getElementById('modalCliente').style.display = 'flex';
  document.getElementById('modalClienteNome').focus();
}

function abrirModalEditarCliente(clienteId) {
  const cliente = clientesCadastrados.find(c => c.id === clienteId);
  if (!cliente) return;

  document.getElementById('modalClienteTitulo').innerHTML = '<span class="dot"></span>Editar Cliente: ' + escapeAttr(cliente.nome);
  document.getElementById('modalClienteId').value = cliente.id || '';
  document.getElementById('modalClienteNome').value = cliente.nome || '';
  document.getElementById('modalClienteDoc').value = cliente.documento || '';
  document.getElementById('modalClienteContato').value = cliente.contato || '';
  document.getElementById('modalClienteTel').value = cliente.telefone || cliente.tel || '';
  document.getElementById('modalClienteEmail').value = cliente.email || '';
  const elCep = document.getElementById('modalClienteCep');
  if (elCep) elCep.value = cliente.cep || '';
  document.getElementById('modalClienteEndereco').value = cliente.endereco || '';
  document.getElementById('modalClienteObs').value = cliente.observacoes || '';

  document.getElementById('modalCliente').style.display = 'flex';
  document.getElementById('modalClienteNome').focus();
}

function fecharModalCliente() {
  document.getElementById('modalCliente').style.display = 'none';
}

async function salvarModalCliente() {
  const nome = (document.getElementById('modalClienteNome')?.value || '').trim();
  if (!nome) {
    alert('Por favor, informe o nome ou razão social do cliente.');
    document.getElementById('modalClienteNome')?.focus();
    return;
  }

  const payload = {
    id: document.getElementById('modalClienteId')?.value || null,
    nome,
    documento: document.getElementById('modalClienteDoc')?.value.trim() || '',
    contato: document.getElementById('modalClienteContato')?.value.trim() || '',
    telefone: document.getElementById('modalClienteTel')?.value.trim() || '',
    email: document.getElementById('modalClienteEmail')?.value.trim() || '',
    cep: document.getElementById('modalClienteCep')?.value.trim() || '',
    endereco: document.getElementById('modalClienteEndereco')?.value.trim() || '',
    observacoes: document.getElementById('modalClienteObs')?.value.trim() || ''
  };

  try {
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.sucesso) {
      fecharModalCliente();
      avisar(`✅ Cliente "${data.cliente.nome}" salvo com sucesso!`);
      await carregarClientes();
    } else {
      alert(data.erro || 'Erro ao salvar cliente.');
    }
  } catch (err) {
    alert('Erro ao comunicar com o servidor.');
  }
}

async function excluirCliente(clienteId) {
  const c = clientesCadastrados.find(item => item.id === clienteId);
  const nome = c ? c.nome : 'este cliente';
  if (!confirm(`Deseja realmente remover o cliente "${nome}" do cadastro?\n(Orçamentos já existentes dele permanecerão no histórico)`)) {
    return;
  }

  try {
    const res = await fetch(`/api/clientes/${clienteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.sucesso) {
      avisar(`🗑️ Cliente "${nome}" removido do cadastro.`);
      await carregarClientes();
    } else {
      mostrarErro(data.erro || 'Erro ao excluir cliente.');
    }
  } catch (err) {
    mostrarErro('Erro ao excluir cliente no servidor.');
  }
}

/* ---------------------------------------------------------------
   CATÁLOGO DE INSUMOS
--------------------------------------------------------------- */
function catalogoInsumoRowHTML(i) {
  i = Object.assign({ id: uid(), nome: '', fornecedor: '', unidade: 'UN', preco: 0 }, i);
  return '<tr data-id="' + i.id + '">' +
    '<td><input class="c-nome" value="' + escapeAttr(i.nome) + '" placeholder="Descrição completa do material..."></td>' +
    '<td><input class="c-fornecedor" value="' + escapeAttr(i.fornecedor) + '" placeholder="Ex: NARDELLI, TREFITA..."></td>' +
    '<td><input list="lista-unidades-insumos" class="c-unidade" value="' + escapeAttr(i.unidade || 'UN') + '" style="text-align:center; text-transform:uppercase;" placeholder="KG, PÇ..." onchange="this.value = this.value.toUpperCase();"></td>' +
    '<td><input type="number" step="0.0001" class="c-preco num" value="' + i.preco + '" placeholder="0,00"></td>' +
    '<td style="text-align:center;"><button type="button" class="rm" onclick="this.closest(\'tr\').remove();">✕</button></td>' +
  '</tr>';
}

function renderInsumosCatalogo() {
  document.getElementById('insumos-catalogo-body').innerHTML = insumos.map(catalogoInsumoRowHTML).join('');
  renderDatalistInsumos();
}

function addInsumoCatalogoRow() {
  document.getElementById('insumos-catalogo-body').insertAdjacentHTML('beforeend', catalogoInsumoRowHTML({}));
}

async function salvarCatalogoInsumos() {
  const rows = Array.from(document.querySelectorAll('#insumos-catalogo-body tr'));
  insumos = rows.map((tr, idx) => ({
    id: tr.dataset.id || ('ins_' + idx),
    nome: tr.querySelector('.c-nome').value.trim(),
    fornecedor: tr.querySelector('.c-fornecedor').value.trim(),
    unidade: tr.querySelector('.c-unidade').value.trim().toUpperCase(),
    preco: num(tr.querySelector('.c-preco').value),
  })).filter(i => i.nome !== '');

  try {
    const res = await fetch('/api/catalogo/insumos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumos })
    });
    const data = await res.json();
    if (data.sucesso) {
      insumos = data.insumos;
      renderDatalistInsumos();
      avisar('Catálogo de insumos salvo.');
    }
  } catch (e) {
    mostrarErro('Erro ao salvar catálogo de insumos.');
  }
}

function renderDatalistInsumos() {
  document.getElementById('lista-insumos').innerHTML = insumos.map(i => '<option value="' + escapeAttr(i.nome) + '"></option>').join('');
}

/* ---------------------------------------------------------------
   CATÁLOGO DE MÁQUINAS
--------------------------------------------------------------- */
function catalogoMaquinaRowHTML(m) {
  m = Object.assign({
    id: uid(),
    nome: '',
    categoria: 'Usinagem Geral',
    capacidade: '',
    marca: '',
    modelo: '',
    ano: null,
    descricao: '',
    observacoes: '',
    normal: 0,
    h50: 0,
    h100: 0
  }, m);

  const h50Val = m.h50 || Number((num(m.normal) * 1.5).toFixed(2));
  const h100Val = m.h100 || Number((num(m.normal) * 2).toFixed(2));
  const subDetalhes = [m.marca, m.modelo, m.ano ? ('(' + m.ano + ')') : ''].filter(Boolean).join(' • ');

  return '<tr data-id="' + escapeAttr(m.id) + '">' +
    '<td>' +
      '<input class="c-nome" value="' + escapeAttr(m.nome) + '" placeholder="Nome da máquina" style="font-weight:600;">' +
      (subDetalhes ? '<div style="font-size:11px; color:var(--texto-suave); margin-top:3px;">🏭 ' + escapeAttr(subDetalhes) + '</div>' : '') +
      '<input type="hidden" class="c-marca" value="' + escapeAttr(m.marca || '') + '">' +
      '<input type="hidden" class="c-modelo" value="' + escapeAttr(m.modelo || '') + '">' +
      '<input type="hidden" class="c-ano" value="' + escapeAttr(m.ano || '') + '">' +
      '<input type="hidden" class="c-descricao" value="' + escapeAttr(m.descricao || '') + '">' +
      '<input type="hidden" class="c-observacoes" value="' + escapeAttr(m.observacoes || '') + '">' +
    '</td>' +
    '<td><input class="c-categoria" value="' + escapeAttr(m.categoria || '') + '" placeholder="Categoria" style="font-size:12px;"></td>' +
    '<td><input class="c-capacidade" value="' + escapeAttr(m.capacidade || '') + '" placeholder="Dimensões máximas e capacidade" style="font-size:12px;" title="' + escapeAttr(m.observacoes || m.descricao || '') + '"></td>' +
    '<td><input type="number" step="0.01" class="c-normal num" value="' + m.normal + '"></td>' +
    '<td><input type="number" step="0.01" class="c-h50 num" value="' + h50Val + '"></td>' +
    '<td><input type="number" step="0.01" class="c-h100 num" value="' + h100Val + '"></td>' +
    '<td style="text-align:center;"><button type="button" class="rm" onclick="this.closest(\'tr\').remove(); filtrarTabelaMaquinas();">✕</button></td>' +
  '</tr>';
}

function renderMaquinasCatalogo() {
  document.getElementById('maquinas-catalogo-body').innerHTML = maquinas.map(catalogoMaquinaRowHTML).join('');
  renderDatalistMaquinas();
  filtrarTabelaMaquinas();
}

function addMaquinaCatalogoRow() {
  document.getElementById('maquinas-catalogo-body').insertAdjacentHTML('afterbegin', catalogoMaquinaRowHTML({
    nome: 'NOVA MÁQUINA',
    categoria: 'Usinagem Convencional',
    capacidade: 'Dimensões máximas a especificar',
    normal: 25.0
  }));
  filtrarTabelaMaquinas();
}

function filtrarTabelaMaquinas() {
  const busca = (document.getElementById('buscaMaquinaInput')?.value || '').toLowerCase().trim();
  const cat = (document.getElementById('filtroCategoriaMaquina')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#maquinas-catalogo-body tr');
  let visiveis = 0;

  rows.forEach(tr => {
    const nome = (tr.querySelector('.c-nome')?.value || '').toLowerCase();
    const categoria = (tr.querySelector('.c-categoria')?.value || '').toLowerCase();
    const capacidade = (tr.querySelector('.c-capacidade')?.value || '').toLowerCase();
    const marca = (tr.querySelector('.c-marca')?.value || '').toLowerCase();
    const modelo = (tr.querySelector('.c-modelo')?.value || '').toLowerCase();

    const matchBusca = !busca ||
      nome.includes(busca) ||
      categoria.includes(busca) ||
      capacidade.includes(busca) ||
      marca.includes(busca) ||
      modelo.includes(busca);

    const matchCat = !cat || categoria.includes(cat);

    if (matchBusca && matchCat) {
      tr.style.display = '';
      visiveis++;
    } else {
      tr.style.display = 'none';
    }
  });

  const contador = document.getElementById('contadorMaquinasVisiveis');
  if (contador) {
    contador.textContent = `${visiveis} de ${rows.length} máquinas`;
  }
}

async function salvarCatalogoMaquinas() {
  const rows = Array.from(document.querySelectorAll('#maquinas-catalogo-body tr'));
  maquinas = rows.map((tr, idx) => {
    const id = tr.dataset.id || ('maq_' + idx);
    const existing = maquinas.find(m => m.id === id) || {};
    return {
      ...existing,
      id,
      nome: tr.querySelector('.c-nome')?.value.trim() || '',
      categoria: tr.querySelector('.c-categoria')?.value.trim() || existing.categoria || '',
      capacidade: tr.querySelector('.c-capacidade')?.value.trim() || existing.capacidade || '',
      marca: tr.querySelector('.c-marca')?.value.trim() || existing.marca || '',
      modelo: tr.querySelector('.c-modelo')?.value.trim() || existing.modelo || '',
      ano: tr.querySelector('.c-ano')?.value ? Number(tr.querySelector('.c-ano').value) : (existing.ano || null),
      descricao: tr.querySelector('.c-descricao')?.value.trim() || existing.descricao || '',
      observacoes: tr.querySelector('.c-observacoes')?.value.trim() || existing.observacoes || '',
      normal: num(tr.querySelector('.c-normal')?.value),
      h50: num(tr.querySelector('.c-h50')?.value),
      h100: num(tr.querySelector('.c-h100')?.value),
    };
  }).filter(m => m.nome !== '');

  try {
    const res = await fetch('/api/catalogo/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinas })
    });
    const data = await res.json();
    if (data.sucesso) {
      maquinas = data.maquinas;
      renderDatalistMaquinas();
      filtrarTabelaMaquinas();
      avisar('Catálogo com ' + maquinas.length + ' máquinas salvo com sucesso.');
    }
  } catch (e) {
    mostrarErro('Erro ao salvar catálogo de máquinas.');
  }
}

function renderDatalistMaquinas() {
  document.getElementById('lista-maquinas').innerHTML = maquinas.map(m => '<option value="' + escapeAttr(m.nome) + '"></option>').join('');
}

/* ---------------------------------------------------------------
   CONFIGURAÇÕES
--------------------------------------------------------------- */
function renderConfig() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined ? val : ''; };

  setVal('cfgNomeEmpresa', config.nomeEmpresa);
  setVal('cfgCidade', config.cidade);
  setVal('cfgDespFixasInsumo', (num(config.despFixasInsumo) * 100).toFixed(2));
  setVal('cfgImpostoInsumo', (num(config.impostoInsumo) * 100).toFixed(2));
  setVal('cfgLucroInsumo', (num(config.lucroInsumo) * 100).toFixed(2));

  setVal('cfgDespFixasMO', (num(config.despFixasMO) * 100).toFixed(2));
  setVal('cfgImpostoMO', (num(config.impostoMO) * 100).toFixed(2));
  setVal('cfgLucroMO', (num(config.lucroMO) * 100).toFixed(2));

  setVal('cfgCustoKm', config.custoKm);
  setVal('cfgMargemDesconto', (num(config.margemDesconto) * 100).toFixed(2));
  setVal('cfgJurosMensal', (num(config.jurosMensal) * 100).toFixed(2));

  setVal('cfgOpenrouterKey', config.openrouterApiKey);
  setVal('cfgModeloGerador', config.modeloGerador || 'anthropic/claude-sonnet-5.5');
  setVal('cfgModeloRoteador', config.modeloRoteador || 'google/gemini-2.5-flash');
  setVal('cfgModeloEconomico', config.modeloEconomico || 'qwen/qwen3.8-max-prime');

  document.getElementById('cidadeHeader').textContent = config.cidade || 'Aracaju/SE';
}

async function salvarConfiguracoes() {
  config = {
    ...config,
    nomeEmpresa: document.getElementById('cfgNomeEmpresa').value.trim() || config.nomeEmpresa,
    cidade: document.getElementById('cfgCidade').value.trim(),
    despFixasInsumo: num(document.getElementById('cfgDespFixasInsumo').value) / 100,
    impostoInsumo: num(document.getElementById('cfgImpostoInsumo').value) / 100,
    lucroInsumo: num(document.getElementById('cfgLucroInsumo').value) / 100,
    despFixasMO: num(document.getElementById('cfgDespFixasMO').value) / 100,
    impostoMO: num(document.getElementById('cfgImpostoMO').value) / 100,
    lucroMO: num(document.getElementById('cfgLucroMO').value) / 100,
    custoKm: num(document.getElementById('cfgCustoKm').value),
    margemDesconto: num(document.getElementById('cfgMargemDesconto').value) / 100,
    jurosMensal: num(document.getElementById('cfgJurosMensal').value) / 100,
    openrouterApiKey: document.getElementById('cfgOpenrouterKey').value.trim(),
    modeloGerador: document.getElementById('cfgModeloGerador').value.trim() || 'anthropic/claude-sonnet-5.5',
    modeloRoteador: document.getElementById('cfgModeloRoteador').value.trim() || 'google/gemini-2.5-flash',
    modeloEconomico: document.getElementById('cfgModeloEconomico').value.trim() || 'qwen/qwen3.8-max-prime',
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();
    if (data.sucesso) {
      config = data.config;
      document.getElementById('cidadeHeader').textContent = config.cidade;
      calcularTotais();
      avisar('Configurações salvas.');
    }
  } catch (e) {
    mostrarErro('Erro ao salvar configurações.');
  }
}

async function testarChaveOpenRouter() {
  const chave = document.getElementById('cfgOpenrouterKey').value.trim();
  if (!chave) {
    mostrarErro('Informe a chave OpenRouter antes de testar.');
    return;
  }

  avisar('Testando conexão com OpenRouter...');
  try {
    const res = await fetch('/api/config/testar-openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: chave })
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar('✅ Chave OpenRouter válida! Modelos de IA prontos.');
    } else {
      mostrarErro('Chave recusada: ' + (data.erro || 'Verifique sua chave.'));
    }
  } catch (e) {
    mostrarErro('Falha ao conectar com OpenRouter: ' + e.message);
  }
}

/* ---------------------------------------------------------------
   MÓDULO: BANCO DE DADOS POSTGRESQL & PERSISTÊNCIA
--------------------------------------------------------------- */
async function checarStatusDatabase() {
  try {
    const res = await fetch('/api/auth/status-db');
    const data = await res.json();
    const badge = document.getElementById('dbStatusBadge');
    const msg = document.getElementById('pgMsgStatus');
    if (data.sucesso && badge) {
      if (data.postgres && data.postgres.conectado) {
        badge.className = 'db-status-badge pg-on';
        badge.innerHTML = '● PostgreSQL Conectado';
        if (msg) msg.innerHTML = `<span style="color:var(--verde); font-weight:700;">Conectado ao PostgreSQL com persistência ativa.</span>`;
      } else {
        badge.className = 'db-status-badge pg-off';
        badge.innerHTML = '○ Modo Local (JSON com Fallback)';
        if (msg) {
          const erroDetalhe = data.postgres?.ultimoErro ? ` (${data.postgres.ultimoErro})` : '';
          msg.innerHTML = `Operando em armazenamento local seguro. Conecte sua base PostgreSQL para sincronização corporativa.${erroDetalhe}`;
        }
      }
    }
  } catch (e) {
    console.error('Erro ao verificar status do banco:', e);
  }
}

async function conectarPostgresPelaTela() {
  const url = document.getElementById('cfgPostgresUrl').value.trim();
  if (!url) {
    mostrarErro('Informe a URL do PostgreSQL para conectar.');
    return;
  }

  avisar('Testando e conectando ao PostgreSQL...');
  try {
    const res = await fetch('/api/auth/conectar-postgres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar('✅ Conectado ao PostgreSQL com sucesso! Tabelas sincronizadas.');
      await checarStatusDatabase();
      await carregarSalvos();
      await carregarConversas();
      await carregarListaUsuarios();
    } else {
      mostrarErro('Falha na conexão com PostgreSQL: ' + (data.erro || 'Verifique as credenciais.'));
      await checarStatusDatabase();
    }
  } catch (e) {
    mostrarErro('Erro ao tentar conectar: ' + e.message);
  }
}

/* ---------------------------------------------------------------
   MÓDULO: AUTENTICAÇÃO DE USUÁRIOS (LOGIN & CADASTRO)
--------------------------------------------------------------- */
function abrirModalAuth(modo = 'login') {
  document.getElementById('modalAuth').style.display = 'flex';
  alternarTabAuth(modo);
}

function fecharModalAuth() {
  document.getElementById('modalAuth').style.display = 'none';
}

function alternarTabAuth(modo) {
  const btnLogin = document.getElementById('tabBtnLogin');
  const btnReg = document.getElementById('tabBtnRegister');
  const formLogin = document.getElementById('formLoginWrap');
  const formReg = document.getElementById('formRegisterWrap');

  if (modo === 'login') {
    btnLogin.classList.add('active');
    btnReg.classList.remove('active');
    formLogin.style.display = 'block';
    formReg.style.display = 'none';
  } else {
    btnReg.classList.add('active');
    btnLogin.classList.remove('active');
    formReg.style.display = 'block';
    formLogin.style.display = 'none';
  }
}

async function executarLogin() {
  const email = document.getElementById('authLoginEmail').value.trim();
  const senha = document.getElementById('authLoginSenha').value;

  if (!email || !senha) {
    mostrarErro('Preencha e-mail e senha.');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (data.sucesso) {
      localStorage.setItem('nardelli_token', data.token);
      localStorage.setItem('nardelli_user', JSON.stringify(data.usuario));
      usuarioLogado = data.usuario;
      atualizarBarraUsuario();
      fecharModalAuth();
      avisar(`Bem-vindo, ${data.usuario.nome}!`);
    } else {
      mostrarErro(data.erro || 'Falha no login');
    }
  } catch (e) {
    mostrarErro('Erro de conexão ao realizar login: ' + e.message);
  }
}

async function executarCadastro() {
  const nome = document.getElementById('authRegNome').value.trim();
  const email = document.getElementById('authRegEmail').value.trim();
  const senha = document.getElementById('authRegSenha').value;
  const cargo = document.getElementById('authRegCargo').value;

  if (!nome || !email || !senha) {
    mostrarErro('Preencha todos os campos obrigatórios.');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha, cargo })
    });
    const data = await res.json();
    if (data.sucesso) {
      localStorage.setItem('nardelli_token', data.token);
      localStorage.setItem('nardelli_user', JSON.stringify(data.usuario));
      usuarioLogado = data.usuario;
      atualizarBarraUsuario();
      fecharModalAuth();
      avisar(`Usuário ${data.usuario.nome} cadastrado e logado com sucesso!`);
      await carregarListaUsuarios();
    } else {
      mostrarErro(data.erro || 'Falha ao cadastrar usuário');
    }
  } catch (e) {
    mostrarErro('Erro de conexão ao cadastrar: ' + e.message);
  }
}

function logoutUsuario() {
  localStorage.removeItem('nardelli_token');
  localStorage.removeItem('nardelli_user');
  usuarioLogado = null;
  atualizarBarraUsuario();
  avisar('Sessão encerrada.');
}

function atualizarBarraUsuario() {
  const btnLogin = document.getElementById('btnAbrirLogin');
  const infoHeader = document.getElementById('userInfoHeader');
  const nomeSpan = document.getElementById('userHeaderNome');

  if (usuarioLogado) {
    if (btnLogin) btnLogin.style.display = 'none';
    if (infoHeader) infoHeader.style.display = 'flex';
    if (nomeSpan) nomeSpan.textContent = `👤 ${usuarioLogado.nome} (${usuarioLogado.cargo || 'Técnico'})`;
  } else {
    if (btnLogin) btnLogin.style.display = 'inline-flex';
    if (infoHeader) infoHeader.style.display = 'none';
  }
}

async function verificarSessaoUsuario() {
  const salvo = localStorage.getItem('nardelli_user');
  if (salvo) {
    try {
      usuarioLogado = JSON.parse(salvo);
      atualizarBarraUsuario();
    } catch (e) {
      localStorage.removeItem('nardelli_user');
    }
  }

  const token = localStorage.getItem('nardelli_token');
  if (token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.sucesso && data.usuario) {
        usuarioLogado = data.usuario;
        localStorage.setItem('nardelli_user', JSON.stringify(data.usuario));
        atualizarBarraUsuario();
      }
    } catch (e) {
      // Ignora erro offline
    }
  }
}

async function carregarListaUsuarios() {
  const tbody = document.getElementById('lista-usuarios-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/auth/usuarios');
    const data = await res.json();
    if (data.sucesso && data.usuarios) {
      if (data.usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--texto-suave);">Nenhum usuário cadastrado.</td></tr>';
        return;
      }
      tbody.innerHTML = data.usuarios.map(u => {
        const dataFmt = u.created_at ? u.created_at.split('T')[0] : '---';
        return `
          <tr>
            <td><b>${escapeHTML(u.nome)}</b></td>
            <td>${escapeHTML(u.email)}</td>
            <td><span class="user-badge" style="font-size:10px;">${escapeHTML(u.cargo || 'Técnico')}</span></td>
            <td style="color:var(--texto-suave); font-size:12px;">${escapeHTML(dataFmt)}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    console.error('Erro ao listar usuários:', e);
  }
}

/* ---------------------------------------------------------------
   MÓDULO: SIMULADOR DE FORMULÁRIO DO SITE OFICIAL
--------------------------------------------------------------- */
function abrirModalSimuladorSite() {
  document.getElementById('modalSiteSimulador').style.display = 'flex';
}

function fecharModalSimuladorSite() {
  document.getElementById('modalSiteSimulador').style.display = 'none';
}

async function dispararSimulacaoSite() {
  const nome = document.getElementById('simSiteNome').value.trim();
  const empresa = document.getElementById('simSiteEmpresa').value.trim();
  const telefone = document.getElementById('simSiteTel').value.trim();
  const email = document.getElementById('simSiteEmail').value.trim();
  const observacoes = document.getElementById('simSiteObs').value.trim();

  const engrenagem = document.getElementById('simPecaEngrenagem').checked;
  const eixo = document.getElementById('simPecaEixo').checked;
  const polia = document.getElementById('simPecaPolia').checked;
  const redutor = document.getElementById('simPecaRedutor').checked;
  const manutencao = document.getElementById('simPecaManutencao').checked;
  const tratamento_termico = document.getElementById('simPecaTratamento').checked;

  const opcaoVideo = document.getElementById('simSiteEnviarVideo')?.value || 'contato';
  const linkVideoInput = document.getElementById('simSiteLinkVideo')?.value.trim() || '';

  let enviar_video = '';
  let link_video = '';
  if (opcaoVideo === 'contato') {
    enviar_video = 'contato';
  } else if (opcaoVideo === 'link') {
    enviar_video = 'link';
    link_video = linkVideoInput || 'https://youtu.be/video-peca-exemplo';
  }

  avisar('Disparando requisição simulada para o Webhook do Site...');
  fecharModalSimuladorSite();

  try {
    const res = await fetch('/api/webhook/site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome,
        empresa,
        telefone,
        email,
        observacoes,
        engrenagem,
        eixo,
        polia,
        redutor,
        manutencao,
        tratamento_termico,
        enviar_video,
        link_video,
        processarComIA: false
      })
    });
    const data = await res.json();
    if (data.sucesso) {
      avisar(`🎉 Pedido do site recebido! Orçamento #${data.numero} criado com origem "Site".`);
      await carregarSalvos();
      await carregarConversas();
      filtrarAbertosPorOrigem('site');
      showTab('pedidos-abertos');
    } else {
      mostrarErro('Erro ao processar webhook do site: ' + data.erro);
    }
  } catch (e) {
    mostrarErro('Falha na comunicação com o webhook: ' + e.message);
  }
}

/* ---------------------------------------------------------------
   MÓDULO: PROPOSTA COMERCIAL EXECUTIVA EM PDF (A4 TIMBRADO)
--------------------------------------------------------------- */
function prepararDadosPropostaPDF() {
  const nomeCliente = document.getElementById('clienteNome')?.value.trim() || 'Cliente / Empresa';
  const telCliente = document.getElementById('clienteTel')?.value.trim() || 'Não informado';
  const endCliente = document.getElementById('clienteEndereco')?.value.trim() || 'Balcão / A retirar na fábrica';
  const numOrc = document.getElementById('numero')?.value.trim() || '0001';
  const dataOrc = document.getElementById('data')?.value.trim() || new Date().toISOString().split('T')[0];
  const descServico = document.getElementById('descricaoServico')?.value.trim() || 'Serviços especializados de usinagem e recuperação mecânica';
  const categoria = document.getElementById('categoriaPeca')?.value || 'Usinagem Geral';
  const qtdPecas = Math.max(num(document.getElementById('quantidadePecas')?.value) || 1, 1);
  const unidPeca = (document.getElementById('unidadePeca')?.value || 'PÇ').toUpperCase();
  const material = document.getElementById('materialPeca')?.value || 'Aço Carbono / Conforme especificação técnica';
  const prazo = document.getElementById('prazoDesejado')?.value.trim() || '4 a 5 dias úteis';
  const termico = document.getElementById('tratamentoTermico')?.value || 'Nenhum';
  const dureza = document.getElementById('durezaDesejada')?.value.trim() || '';
  const obs = document.getElementById('obsIA')?.value.trim() || '';

  const totais = calcularTotais();
  const totalGeralNum = totais.totalFinal || totais.comDesconto || totais.semDesconto || 0;
  const valorUnitNum = totais.valorUnitarioPeca || (totalGeralNum / qtdPecas);
  const freteNum = totais.freteTotal || 0;
  const prazoMeses = num(document.getElementById('prazoMeses')?.value) || 0;

  // Formatar data em DD/MM/AAAA
  let dataFmt = dataOrc;
  if (dataOrc && dataOrc.includes('-')) {
    const partes = dataOrc.split('-');
    if (partes.length === 3) dataFmt = `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  // Preencher elementos do documento de impressão
  const setEl = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setEl('pdfNumeroOrc', '#' + numOrc);
  setEl('pdfDataEmissao', dataFmt);
  setEl('pdfClienteNome', nomeCliente);
  setEl('pdfClienteTel', telCliente);
  setEl('pdfClienteEndereco', endCliente);

  setEl('pdfCategoriaPeca', categoria);
  setEl('pdfQtdResumoBadge', `Qtd: ${qtdPecas} ${unidPeca}`);
  setEl('pdfDescricaoServico', descServico);
  setEl('pdfMaterialPeca', material);

  // Tratamento térmico
  const linhaTrat = document.getElementById('pdfLinhaTratamento');
  const linhaDur = document.getElementById('pdfLinhaDureza');
  if (termico && termico !== 'Nenhum') {
    if (linhaTrat) {
      linhaTrat.style.display = 'block';
      setEl('pdfTratamentoTermico', termico);
    }
    if (linhaDur && dureza) {
      linhaDur.style.display = 'block';
      setEl('pdfDureza', dureza);
    } else if (linhaDur) {
      linhaDur.style.display = 'none';
    }
  } else {
    if (linhaTrat) setEl('pdfTratamentoTermico', 'Não requer / Convencional');
    if (linhaDur) linhaDur.style.display = 'none';
  }

  setEl('pdfPrazoFab', prazo);

  // Observações técnicas
  const boxObs = document.getElementById('pdfBoxObsTecnicas');
  if (boxObs) {
    if (obs) {
      boxObs.style.display = 'block';
      setEl('pdfObsTecnicas', obs);
    } else {
      boxObs.style.display = 'none';
    }
  }

  // Imagem de referência da peça (primeiro anexo de imagem nos arquivos pendentes)
  const boxDesenho = document.getElementById('pdfBoxDesenhoRef');
  const imgDesenho = document.getElementById('pdfImgDesenho');
  if (boxDesenho && imgDesenho) {
    const imgAnexo = arquivosPendentes.find(a =>
      (a.mediaType && a.mediaType.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(a.nome || '')
    );
    if (imgAnexo && (imgAnexo.url || imgAnexo.base64)) {
      imgDesenho.src = imgAnexo.url || `data:${imgAnexo.mediaType || 'image/jpeg'};base64,${imgAnexo.base64}`;
      boxDesenho.style.display = 'flex';
    } else {
      boxDesenho.style.display = 'none';
    }
  }

  // Tabela comercial
  setEl('pdfTabelaItemTitulo', `Fabricação e Usinagem Mecânica de ${categoria}`);
  setEl('pdfTabelaItemSub', `Fornecimento completo conforme especificações técnicas, tolerâncias e matérias-primas detalhadas.`);
  setEl('pdfTabelaQtd', qtdPecas);
  setEl('pdfTabelaUnid', unidPeca);
  setEl('pdfTabelaValorUnit', fmt(valorUnitNum));

  const subtotalPecasNum = valorUnitNum * qtdPecas;
  setEl('pdfTabelaValorSubtotal', fmt(subtotalPecasNum));

  // Linha de frete na tabela
  const linhaFrete = document.getElementById('pdfLinhaFreteTabela');
  if (linhaFrete) {
    if (isFreteAtivo() && freteNum > 0) {
      linhaFrete.style.display = 'table-row';
      setEl('pdfTabelaFreteDesc', `Entrega com transporte até o endereço indicado (${endCliente})`);
      setEl('pdfTabelaFreteUnit', fmt(freteNum));
      setEl('pdfTabelaFreteTotal', fmt(freteNum));
    } else {
      linhaFrete.style.display = 'none';
    }
  }

  setEl('pdfTotalGeralProposta', fmt(totalGeralNum));

  // Opção a prazo faturado
  const boxPrazo = document.getElementById('pdfOpcaoPrazoBox');
  if (boxPrazo) {
    if (prazoMeses > 0 && totais.precoAPrazo) {
      boxPrazo.style.display = 'block';
      const parcelaNum = totais.precoAPrazo / prazoMeses;
      setEl('pdfTextoPrazoParcelado', `${prazoMeses}x de ${fmt(parcelaNum)} no boleto bancário (Total a Prazo: ${fmt(totais.precoAPrazo)})`);
    } else {
      boxPrazo.style.display = 'none';
    }
  }

  // Condições Gerais
  setEl('pdfCondPrazo', prazo);
  setEl('pdfCondPagto', prazoMeses > 0 ? `Faturado em ${prazoMeses} parcelas via boleto bancário` : 'À vista (PIX ou transferência bancária)');
  setEl('pdfCondEntrega', (isFreteAtivo() && freteNum > 0) ? `Entrega no endereço informado (${endCliente})` : 'Retirada na fábrica Nardelli Usinagem (Aracaju/SE)');
}

function abrirPreviewPropostaPDF() {
  prepararDadosPropostaPDF();

  const folhaOriginal = document.getElementById('folhaPropostaConteudo');
  const corpoPreview = document.getElementById('modalPreviewCorpo');
  const modal = document.getElementById('modalPreviewProposta');

  if (folhaOriginal && corpoPreview && modal) {
    corpoPreview.innerHTML = folhaOriginal.outerHTML;
    modal.classList.add('aberto');
  }
}

function fecharModalPreviewProposta() {
  const modal = document.getElementById('modalPreviewProposta');
  if (modal) modal.classList.remove('aberto');
}

function executarImpressaoNavegador() {
  prepararDadosPropostaPDF();
  window.print();
}

// Intercepta qualquer chamada a window.print() (inclusive Ctrl+P do navegador)
window.addEventListener('beforeprint', () => {
  prepararDadosPropostaPDF();
});

/* ---------------------------------------------------------------
   INICIALIZAÇÃO
--------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [resIns, resMaq, resCfg] = await Promise.all([
      fetch('/api/catalogo/insumos'),
      fetch('/api/catalogo/maquinas'),
      fetch('/api/config')
    ]);

    const dataIns = await resIns.json();
    const dataMaq = await resMaq.json();
    const dataCfg = await resCfg.json();

    if (dataIns.sucesso) insumos = dataIns.insumos || [];
    if (dataMaq.sucesso) maquinas = dataMaq.maquinas || [];
    if (dataCfg.sucesso) config = dataCfg.config || {};

    renderInsumosCatalogo();
    renderMaquinasCatalogo();
    renderConfig();

    const elChatbotUrl = document.getElementById('displayWebhookChatbotUrl');
    if (elChatbotUrl) elChatbotUrl.textContent = `${window.location.origin}/api/inbound/chatbot`;
    const elSiteUrl = document.getElementById('displayWebhookSiteUrl');
    if (elSiteUrl) elSiteUrl.textContent = `${window.location.origin}/api/webhook/site`;

    await verificarSessaoUsuario();
    await checarStatusDatabase();
    await carregarListaUsuarios();

    await carregarClientes();
    await carregarSalvos();
    await carregarConversas();

    carregarOrcamentoNoFormulario(novoOrcamentoObjPadrao());
    initDropzoneEClipboard();

    // Atualização em segundo plano para captar mensagens do chatbot e site
    setInterval(async () => {
      await carregarConversas();
      await carregarSalvos();
    }, 12000);
  } catch (err) {
    console.error('Erro na inicialização:', err);
  }
});
