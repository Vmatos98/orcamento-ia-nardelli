const aiService = require('../services/aiService');

async function runTests() {
  console.log('=== TESTE 1: Detecção Heurística de Múltiplas Peças ===');
  const casos = [
    {
      desc: 'Fabricação de 1 eixo de moenda Ø180x2400mm e 2 buchas em bronze TM-23',
      cat: 'Eixos / Conjuntos',
      esperado: true
    },
    {
      desc: 'Conjunto de acoplamento: flange em 1045 e tampa de fechamento',
      cat: 'Conjuntos Mecânicos',
      esperado: true
    },
    {
      desc: 'Usinagem de 1 polia em alumínio Ø200mm com 2 canais B e rasgo de chaveta',
      cat: 'Polias',
      esperado: false
    }
  ];

  for (const c of casos) {
    const res = aiService.detectarMultiplasPecas(c.desc, c.cat);
    console.log(`\nDescrição: "${c.desc}"`);
    console.log(`-> Múltiplas peças detectadas? ${res.ehConjuntoMultiPecas ? 'SIM' : 'NÃO'} (Esperado: ${c.esperado ? 'SIM' : 'NÃO'})`);
    if (res.ehConjuntoMultiPecas) {
      console.log(`-> Peças identificadas (${res.pecasIdentificadas.length}):`);
      res.pecasIdentificadas.forEach(p => {
        console.log(`   * [${p.id}] ${p.nome} (${p.quantidade} un) - Material: ${p.materialSugerido}`);
        p.etapasProducao.forEach(e => console.log(`     -> ${e}`));
      });
    }
    if (res.ehConjuntoMultiPecas !== c.esperado) {
      throw new Error(`Falha no teste de detecção para: "${c.desc}"`);
    }
  }

  console.log('\n=== TESTE 2: Triagem JEV com Detecção de Múltiplas Peças ===');
  const triagem = await aiService.analisarComplexidadeComJev({
    descricao: 'Fabricação de 1 eixo de moenda Ø180x2400mm e 2 buchas em bronze TM-23',
    categoria: 'Eixos e Buchas',
    quantidade: 1,
    material: '',
    orcamentosHistorico: []
  });
  console.log('Triagem JEV:', {
    complexidade: triagem.complexidade,
    setor: triagem.setor_principal,
    modelo: triagem.modelo_recomendado,
    eh_conjunto_multi_pecas: triagem.eh_conjunto_multi_pecas,
    pecasQtd: triagem.pecas_identificadas?.length
  });

  if (!triagem.eh_conjunto_multi_pecas) {
    throw new Error('Falha: JEV deveria ter marcado eh_conjunto_multi_pecas como true');
  }

  console.log('\n=== TESTE 3: Geração de Prévia com Roteiro Sequencial Ordenado por Peça ===');
  const previa = await aiService.gerarPreviaOrcamento({
    descricao: 'Fabricação de 1 eixo de moenda Ø180x2400mm e 2 buchas em bronze TM-23',
    categoria: 'Eixos / Buchas',
    quantidade: 1,
    material: ''
  });

  console.log(`Origem da resposta: ${previa.origemIA}`);
  console.log(`Conjunto de múltiplas peças? ${previa.resultado.ehConjuntoMultiPecas ? 'SIM' : 'NÃO'}`);
  console.log(`Peças do conjunto (${previa.resultado.pecas?.length}):`);
  previa.resultado.pecas?.forEach(p => {
    console.log(`  📦 ${p.nome} - Qtd: ${p.quantidade}`);
  });

  console.log(`\nRoteiro de Operações Ordenadas (${previa.resultado.operacoes.length} etapas):`);
  previa.resultado.operacoes.forEach(op => {
    console.log(`  [Ordem ${op.ordemProducao}] 📦 ${op.peca} | Etapa ${op.etapa}: ${op.nome} (${op.horas}h)`);
    console.log(`     ↳ ${op.descricao}`);
  });

  console.log(`\nInsumos gerados (${previa.resultado.insumos.length}):`);
  previa.resultado.insumos.forEach(i => {
    console.log(`  • ${i.nome}: ${i.qtd} ${i.unidade} (Subtotal: R$ ${i.subtotal})`);
  });

  // Validações
  if (!previa.resultado.ehConjuntoMultiPecas) {
    throw new Error('Resultado deveria ter ehConjuntoMultiPecas: true');
  }
  const temEixo = previa.resultado.operacoes.some(o => o.peca.includes('Eixo'));
  const temBucha = previa.resultado.operacoes.some(o => o.peca.includes('Bucha'));
  const temMontagem = previa.resultado.operacoes.some(o => o.peca.includes('Montagem'));
  if (!temEixo || !temBucha) {
    throw new Error('Operações deveriam conter etapas separadas para Eixo e Bucha');
  }

  // Verifica se as ordens globais são crescentes (1, 2, 3...)
  for (let i = 1; i < previa.resultado.operacoes.length; i++) {
    if (previa.resultado.operacoes[i].ordemProducao <= previa.resultado.operacoes[i-1].ordemProducao) {
      throw new Error(`Ordem de produção inconsistente no índice ${i}`);
    }
  }

  console.log('\n✅ TODOS OS TESTES DE RECONHECIMENTO E ORDENAÇÃO DE MÚLTIPLAS PEÇAS PASSARAM COM SUCESSO!');
}

runTests().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
