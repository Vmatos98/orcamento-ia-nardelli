const dbService = require('../services/dbService');
const aiService = require('../services/aiService');

async function testar() {
  console.log('=== 1. Testando busca de orçamentos validados para treino ===');
  const validados = await dbService.getOrcamentosValidadosParaTreino(10);
  console.log(`Orçamentos validados encontrados: ${validados.length}`);
  validados.forEach(v => {
    console.log(`- #${v.numero}: ${v.descricao.slice(0, 60)} | Mat: ${v.material} | Ajustes: ${v.ajustesHumano}`);
  });

  console.log('\n=== 2. Testando triagem e consulta rápida JEV para serviço similar ===');
  // Testando com um caso parecido com a engrenagem #0001 (ou eixo #0002)
  const reqEixo = {
    descricao: "Usinagem de eixo de moenda Ø170mm x 2300mm em aço 4140 com rasgo de chaveta e colos retificados",
    categoria: "Eixo de Transmissão",
    quantidade: 2,
    material: "Aço 4140",
    tratamentoTermico: "Beneficiamento",
    durezaDesejada: "300 HB"
  };

  const previaEixo = await aiService.gerarPreviaOrcamento(reqEixo);
  console.log('Origem IA:', previaEixo.origemIA);
  console.log('Triagem JEV Complexidade:', previaEixo.triagemJev?.complexidade);
  console.log('JEV Referência Encontrada:', previaEixo.referenciaHistorica ? 'SIM' : 'NÃO');
  if (previaEixo.referenciaHistorica) {
    console.log('  * Orçamento Base:', '#' + previaEixo.referenciaHistorica.orcamentoNumero);
    console.log('  * Motivo JEV:', previaEixo.referenciaHistorica.motivoJev);
    console.log('  * Ajustes Prévios:', previaEixo.referenciaHistorica.ajustesPrevios);
    console.log('  * Operações sugeridas:', previaEixo.resultado.operacoes.map(o => `${o.nome}: ${o.horas}h`));
  }

  console.log('\n=== 3. Testando detecção de ajustes manuais do usuário ===');
  const originalIA = {
    itensInsumo: [{ nome: "BARRA AÇO 1045", qtd: 10, unidade: "KG", preco: 25 }],
    itensMaquina: [{ nome: "Torno Universal Ø400 x 1000mm (IMOR PRN 320)", horas: 2.0, valorHora: 23.96 }],
    moEscritorio: 0
  };

  const editadoPeloHumano = {
    itensInsumo: [
      { nome: "BARRA AÇO 1045", qtd: 12, unidade: "KG", preco: 25 },
      { nome: "ÓLEO PROTETIVO DESAGUANTE", qtd: 1, unidade: "UN", preco: 15 }
    ],
    itensMaquina: [
      { nome: "Torno Universal Ø400 x 1000mm (IMOR PRN 320)", horas: 3.5, valorHora: 23.96 }
    ],
    moEscritorio: 40
  };

  const diff = dbService.calcularAjustesHumanos(originalIA, editadoPeloHumano);
  console.log('Houve ajustes?', diff.houveAjustes);
  console.log('Resumo do aprendizado humano:', diff.resumo);
  console.log('Itens modificados:', diff.itensModificados);

  console.log('\n✅ TODOS OS TESTES DE APRENDIZADO ATIVO JEV CONCLUÍDOS COM SUCESSO!');
}

testar().catch(err => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
