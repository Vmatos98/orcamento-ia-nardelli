const aiService = require('../services/aiService');

async function testLiveClaude() {
  console.log('--- TESTANDO CHAMADA DIRETA AO CLAUDE SONNET 5.5 VIA OPENROUTER ---');
  const inicio = Date.now();

  const previa = await aiService.gerarPreviaOrcamento({
    descricao: 'Fabricação de conjunto: 1 Martelinho Excêntrico (espessura 16mm, perfil fresado) e 1 Porca Trava sextavada M16 em Aço 1045',
    categoria: 'Usinagem Convencional / CNC',
    quantidade: 1,
    material: 'Aço SAE 1045'
  });

  const tempoTotal = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`⏱️ Concluído em ${tempoTotal}s`);
  console.log(`🤖 Modelo utilizado: ${previa.modelo}`);
  console.log(`🌐 Origem: ${previa.origemIA}`);
  console.log(`📦 Conjunto multi-peças? ${previa.resultado.ehConjuntoMultiPecas ? 'SIM' : 'NÃO'}`);
  console.log('\n--- INSUMOS SELECIONADOS ---');
  previa.resultado.insumos.forEach(i => {
    console.log(`  • ${i.nome}: ${i.qtd} ${i.unidade} a R$ ${i.preco} (Subtotal: R$ ${i.subtotal})`);
  });
  console.log('\n--- OPERAÇÕES E MÁQUINAS ---');
  previa.resultado.operacoes.forEach(op => {
    console.log(`  [Ordem ${op.ordemProducao}] 📦 ${op.peca} | ${op.nome} (${op.horas}h) - R$ ${op.valorHora}/h`);
    console.log(`     ↳ ${op.descricao}`);
  });
  console.log('\n--- OBSERVAÇÕES TÉCNICAS ---');
  console.log(previa.resultado.observacoesTecnicas);
}

testLiveClaude().catch(err => {
  console.error('❌ Erro no teste ao vivo:', err);
  process.exit(1);
});
