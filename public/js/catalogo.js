// Gerenciamento de Catálogos de Insumos e Máquinas
let catalogoInsumos = [];
let catalogoMaquinas = [];

async function carregarCatalogos() {
  try {
    const [resIns, resMaq] = await Promise.all([
      fetch('/api/catalogo/insumos'),
      fetch('/api/catalogo/maquinas')
    ]);

    const dataIns = await resIns.json();
    const dataMaq = await resMaq.json();

    if (dataIns.sucesso) catalogoInsumos = dataIns.insumos || [];
    if (dataMaq.sucesso) catalogoMaquinas = dataMaq.maquinas || [];

    renderizarCatalogoInsumos();
    renderizarCatalogoMaquinas();
    atualizarDatalists();
  } catch (err) {
    console.error('Erro ao carregar catálogos:', err);
  }
}

function atualizarDatalists() {
  const dlIns = document.getElementById('datalist-insumos');
  if (dlIns) {
    dlIns.innerHTML = catalogoInsumos.map(i => `<option value="${escapeHTML(i.nome)}">`).join('');
  }

  const dlMaq = document.getElementById('datalist-maquinas');
  if (dlMaq) {
    dlMaq.innerHTML = catalogoMaquinas.map(m => `<option value="${escapeHTML(m.nome)}">`).join('');
  }
}

/* ===============================================================
   CATÁLOGO DE INSUMOS
=============================================================== */
function renderizarCatalogoInsumos() {
  const tbody = document.getElementById('catalogo-insumos-body');
  if (!tbody) return;

  tbody.innerHTML = catalogoInsumos.map((item, idx) => `
    <tr data-idx="${idx}">
      <td><input type="text" class="c-nome" value="${escapeHTML(item.nome)}"></td>
      <td><input type="text" class="c-forn" value="${escapeHTML(item.fornecedor || '')}"></td>
      <td><input type="text" class="c-unid" value="${escapeHTML(item.unidade || 'UN')}" style="text-align:center;"></td>
      <td class="num"><input type="number" step="0.0001" class="c-preco num" value="${item.preco}"></td>
      <td style="text-align:center;"><button type="button" class="btn-rm" onclick="removerInsumoCatalogo(${idx})">✕</button></td>
    </tr>
  `).join('');
}

function addInsumoCatalogoRow() {
  catalogoInsumos.unshift({
    id: 'ins_' + Date.now().toString(36),
    nome: '',
    fornecedor: 'NARDELLI',
    unidade: 'UN',
    preco: 0.0
  });
  renderizarCatalogoInsumos();
}

function removerInsumoCatalogo(idx) {
  catalogoInsumos.splice(idx, 1);
  renderizarCatalogoInsumos();
}

async function salvarCatalogoInsumos() {
  const rows = Array.from(document.querySelectorAll('#catalogo-insumos-body tr'));
  catalogoInsumos = rows.map((tr, idx) => ({
    id: catalogoInsumos[idx]?.id || 'ins_' + idx,
    nome: tr.querySelector('.c-nome').value.trim(),
    fornecedor: tr.querySelector('.c-forn').value.trim(),
    unidade: tr.querySelector('.c-unid').value.trim().toUpperCase() || 'UN',
    preco: parseFloat(tr.querySelector('.c-preco').value) || 0
  })).filter(i => i.nome !== '');

  try {
    const res = await fetch('/api/catalogo/insumos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumos: catalogoInsumos })
    });
    const data = await res.json();
    if (data.sucesso) {
      catalogoInsumos = data.insumos;
      renderizarCatalogoInsumos();
      atualizarDatalists();
      mostrarToast('Catálogo de insumos salvo com sucesso!');
    }
  } catch (err) {
    mostrarToast('Erro ao salvar catálogo de insumos.');
  }
}

/* ===============================================================
   CATÁLOGO DE MÁQUINAS
=============================================================== */
function renderizarCatalogoMaquinas() {
  const tbody = document.getElementById('catalogo-maquinas-body');
  if (!tbody) return;

  tbody.innerHTML = catalogoMaquinas.map((item, idx) => `
    <tr data-idx="${idx}">
      <td><input type="text" class="m-nome" value="${escapeHTML(item.nome)}"></td>
      <td class="num"><input type="number" step="0.01" class="m-normal num" value="${item.normal}"></td>
      <td class="num"><input type="number" step="0.01" class="m-h50 num" value="${item.h50 || (item.normal * 1.5).toFixed(2)}"></td>
      <td class="num"><input type="number" step="0.01" class="m-h100 num" value="${item.h100 || (item.normal * 2).toFixed(2)}"></td>
      <td style="text-align:center;"><button type="button" class="btn-rm" onclick="removerMaquinaCatalogo(${idx})">✕</button></td>
    </tr>
  `).join('');
}

function addMaquinaCatalogoRow() {
  catalogoMaquinas.unshift({
    id: 'maq_' + Date.now().toString(36),
    nome: '',
    normal: 25.0,
    h50: 37.5,
    h100: 50.0
  });
  renderizarCatalogoMaquinas();
}

function removerMaquinaCatalogo(idx) {
  catalogoMaquinas.splice(idx, 1);
  renderizarCatalogoMaquinas();
}

async function salvarCatalogoMaquinas() {
  const rows = Array.from(document.querySelectorAll('#catalogo-maquinas-body tr'));
  catalogoMaquinas = rows.map((tr, idx) => ({
    id: catalogoMaquinas[idx]?.id || 'maq_' + idx,
    nome: tr.querySelector('.m-nome').value.trim(),
    normal: parseFloat(tr.querySelector('.m-normal').value) || 0,
    h50: parseFloat(tr.querySelector('.m-h50').value) || 0,
    h100: parseFloat(tr.querySelector('.m-h100').value) || 0
  })).filter(m => m.nome !== '');

  try {
    const res = await fetch('/api/catalogo/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinas: catalogoMaquinas })
    });
    const data = await res.json();
    if (data.sucesso) {
      catalogoMaquinas = data.maquinas;
      renderizarCatalogoMaquinas();
      atualizarDatalists();
      mostrarToast('Catálogo de máquinas salvo com sucesso!');
    }
  } catch (err) {
    mostrarToast('Erro ao salvar catálogo de máquinas.');
  }
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
