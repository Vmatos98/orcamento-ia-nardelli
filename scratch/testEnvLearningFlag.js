const path = require('path');
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (e) {}

const dbService = require('../services/dbService');
const aiService = require('../services/aiService');

async function testFlag() {
  console.log('--- TESTANDO FLAG DO .ENV ---');
  console.log('Valor atual no .env:', process.env.USAR_MODELO_APRENDIZAGEM);
  console.log('dbService.isModeloAprendizagemAtivo():', dbService.isModeloAprendizagemAtivo());

  // Teste 1: com false
  process.env.USAR_MODELO_APRENDIZAGEM = 'false';
  const ativoFalse = dbService.isModeloAprendizagemAtivo();
  const validadosFalse = await dbService.getOrcamentosValidadosParaTreino(10);
  console.log('Com false -> ativo:', ativoFalse, '| validados para treino:', validadosFalse.length);
  if (ativoFalse !== false || validadosFalse.length !== 0) {
    throw new Error('Falha no teste com false');
  }

  // Triagem JEV com false
  const triagemFalse = await aiService.analisarComplexidadeComJev({
    descricao: 'Eixo entalhado 40x200mm em aço 1045',
    observacoes: '',
    categoria: 'Eixos e Árvores',
    quantidade: 1,
    material: 'Aço 1045'
  });
  console.log('Triagem JEV com false -> id_referencia:', triagemFalse.id_orcamento_referencia);
  if (triagemFalse.id_orcamento_referencia !== null) {
    throw new Error('Triagem não deve ter referência quando aprendizagem está desativada!');
  }

  // Teste 2: com true
  process.env.USAR_MODELO_APRENDIZAGEM = 'true';
  const ativoTrue = dbService.isModeloAprendizagemAtivo();
  console.log('Com true -> ativo:', ativoTrue);
  if (ativoTrue !== true) {
    throw new Error('Falha no teste com true');
  }

  // Restaura valor original do .env
  delete process.env.USAR_MODELO_APRENDIZAGEM;
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch (e) {}
  console.log('Valor restaurado do .env:', process.env.USAR_MODELO_APRENDIZAGEM);
  console.log('Status ativo final:', dbService.isModeloAprendizagemAtivo());

  console.log('\n✅ TODOS OS TESTES DA VARIÁVEL DE APRENDIZAGEM PASSARAM!');
}

testFlag().catch(err => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
