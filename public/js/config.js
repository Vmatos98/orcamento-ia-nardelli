// Gerenciamento de Configurações e Chaves de IA
let appConfig = {};

async function carregarConfiguracoes() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.sucesso) {
      appConfig = data.config;
      preencherFormularioConfig();
      atualizarIdentidadeVisual();
    }
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

function preencherFormularioConfig() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? val : '';
  };

  setVal('cfgNomeEmpresa', appConfig.nomeEmpresa);
  setVal('cfgCidade', appConfig.cidade);
  setVal('cfgTelefone', appConfig.telefone);
  setVal('cfgEmail', appConfig.email);

  setVal('cfgDespFixasInsumo', (appConfig.despFixasInsumo * 100).toFixed(2));
  setVal('cfgImpostoInsumo', (appConfig.impostoInsumo * 100).toFixed(2));
  setVal('cfgLucroInsumo', (appConfig.lucroInsumo * 100).toFixed(2));

  setVal('cfgDespFixasMO', (appConfig.despFixasMO * 100).toFixed(2));
  setVal('cfgImpostoMO', (appConfig.impostoMO * 100).toFixed(2));
  setVal('cfgLucroMO', (appConfig.lucroMO * 100).toFixed(2));

  setVal('cfgCustoKm', appConfig.custoKm);
  setVal('cfgMargemDesconto', (appConfig.margemDesconto * 100).toFixed(2));
  setVal('cfgJurosMensal', (appConfig.jurosMensal * 100).toFixed(2));

  setVal('cfgOpenrouterKey', appConfig.openrouterApiKey);
  setVal('cfgModeloRoteador', appConfig.modeloRoteador || 'google/gemini-2.5-flash');
  setVal('cfgModeloGerador', appConfig.modeloGerador || 'anthropic/claude-sonnet-5.5');
  setVal('cfgModeloEconomico', appConfig.modeloEconomico || 'qwen/qwen3.8-max-prime');

  const chk = document.getElementById('cfgOtimizarTokens');
  if (chk) chk.checked = !!appConfig.otimizarTokens;
}

function atualizarIdentidadeVisual() {
  const elCidade = document.getElementById('headerCidade');
  if (elCidade && appConfig.cidade) elCidade.textContent = appConfig.cidade;

  const propEmpresaNome = document.getElementById('propEmpresaNome');
  if (propEmpresaNome && appConfig.nomeEmpresa) propEmpresaNome.textContent = appConfig.nomeEmpresa.toUpperCase();

  const propEmpresaContato = document.getElementById('propEmpresaContato');
  if (propEmpresaContato) {
    propEmpresaContato.textContent = `${appConfig.cidade || 'Aracaju/SE'} · Tel: ${appConfig.telefone || '(79) 3211-0000'} · ${appConfig.email || 'contato@nardelliusinagem.com.br'}`;
  }
}

async function salvarConfiguracoesGerais() {
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const novaConfig = {
    nomeEmpresa: document.getElementById('cfgNomeEmpresa').value.trim() || appConfig.nomeEmpresa,
    cidade: document.getElementById('cfgCidade').value.trim() || appConfig.cidade,
    telefone: document.getElementById('cfgTelefone').value.trim() || appConfig.telefone,
    email: document.getElementById('cfgEmail').value.trim() || appConfig.email,

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
    modeloRoteador: document.getElementById('cfgModeloRoteador').value.trim() || 'google/gemini-2.5-flash',
    modeloGerador: document.getElementById('cfgModeloGerador').value.trim() || 'anthropic/claude-sonnet-5.5',
    modeloEconomico: document.getElementById('cfgModeloEconomico').value.trim() || 'qwen/qwen3.8-max-prime',
    otimizarTokens: document.getElementById('cfgOtimizarTokens').checked
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novaConfig)
    });
    const data = await res.json();
    if (data.sucesso) {
      appConfig = data.config;
      atualizarIdentidadeVisual();
      if (typeof calcularTotais === 'function') calcularTotais();
      mostrarToast('Configurações e parâmetros comerciais salvos com sucesso!');
    }
  } catch (err) {
    mostrarToast('Erro ao salvar configurações.');
  }
}

async function testarChaveOpenRouter() {
  const chave = document.getElementById('cfgOpenrouterKey').value.trim();
  if (!chave) {
    mostrarToast('Por favor, informe a chave OpenRouter antes de testar.');
    return;
  }

  mostrarToast('Testando conexão com OpenRouter...');
  try {
    const res = await fetch('/api/config/testar-openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: chave })
    });
    const data = await res.json();
    if (data.sucesso) {
      mostrarToast('✅ Conexão com OpenRouter verificada com sucesso! Modelos de IA prontos.');
    } else {
      mostrarToast('❌ Chave recusada pelo OpenRouter: ' + (data.erro || 'Verifique sua chave.'));
    }
  } catch (err) {
    mostrarToast('❌ Falha ao testar chave: ' + err.message);
  }
}
