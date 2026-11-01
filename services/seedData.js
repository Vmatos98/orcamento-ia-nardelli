// ==============================================================
// Nardelli Usinagem — Dados Iniciais e Mock para Demonstração
// ==============================================================

const MOCK_CLIENTES = [
  {
    id: "cli_taquari_capela",
    nome: "Usina Taquari S/A (Grupo Japungu)",
    empresa: "Usina Taquari Açúcar e Álcool",
    cnpj_cpf: "13.088.144/0001-38",
    telefone: "(79) 3274-1100",
    email: "manutencao.mecanica@taquari.com.br",
    endereco: "Rodovia SE-204, Km 12, Povoado Miranda, Capela - SE",
    contato: "Eng. Marcelo Guimarães (Sup. Manutenção)",
    observacoes: "Parceiro industrial de moenda e caldeiraria pesada. Paradas de entressafra anuais.",
    dataCadastro: "2026-10-10T08:00:00.000Z"
  },
  {
    id: "cli_marata_estancia",
    nome: "Indústrias Alimentícias Maratá Ltda",
    empresa: "Grupo Maratá",
    cnpj_cpf: "13.125.688/0001-20",
    telefone: "(79) 3641-8000",
    email: "compras.usinagem@marata.com.br",
    endereco: "Distrito Industrial s/n, Estância - SE",
    contato: "Patrícia Barreto (Compras Técnicas)",
    observacoes: "Peças em aço inox 304/316 e alumínio sanitário para linhas de envase e moagem.",
    dataCadastro: "2026-10-11T09:30:00.000Z"
  },
  {
    id: "cli_itaguassu_socorro",
    nome: "Cimento Itaguassu S/A (Grupo Nassau)",
    empresa: "Cimento Itaguassu",
    cnpj_cpf: "13.011.955/0001-44",
    telefone: "(79) 3254-2000",
    email: "engenharia.planta@cimentoitaguassu.com.br",
    endereco: "Av. Perimetral Oeste, Distrito Industrial, N. Sra. do Socorro - SE",
    contato: "Eng. Roberto Silveira",
    observacoes: "Recuperação de mancais, eixos e camisas de britador de mandíbula.",
    dataCadastro: "2026-10-12T10:15:00.000Z"
  },
  {
    id: "cli_tecarmo_aracaju",
    nome: "Terminal Marítimo Inácio Barbosa (Polo Tecarmo)",
    empresa: "Operações Portuárias & Logística Offshore",
    cnpj_cpf: "33.000.167/0001-01",
    telefone: "(79) 3218-4500",
    email: "suprimentos.tecarmo@operacoes.com.br",
    endereco: "Av. Melício Machado, s/n, Atalaia Nova / Barra dos Coqueiros - SE",
    contato: "Comandante Eduardo Nogueira / Manutenção",
    observacoes: "Exigência de rastreabilidade de matéria-prima e ensaios não destrutivos (líquido penetrante).",
    dataCadastro: "2026-10-13T11:00:00.000Z"
  },
  {
    id: "cli_serigy_aracaju",
    nome: "Cervejaria Serigy (Carlos Mendes)",
    empresa: "Cervejaria Artesanal Serigy",
    cnpj_cpf: "28.914.772/0001-85",
    telefone: "(79) 99876-5432",
    email: "carlos@serigy.com.br",
    endereco: "Rua José Carvalho Pinto, 240, Jardins, Aracaju - SE",
    contato: "Carlos Mendes (Diretor de Produção)",
    observacoes: "Manutenção contínua e fabricação de engrenagens de redutores e eixos misturadores.",
    dataCadastro: "2026-10-14T14:20:00.000Z"
  },
  {
    id: "cli_unigel_laranjeiras",
    nome: "Unigel Agro Sergipe S/A",
    empresa: "Unigel Agro Brasil",
    cnpj_cpf: "38.402.190/0001-72",
    telefone: "(79) 3281-9000",
    email: "compras.laranjeiras@unigel.com.br",
    endereco: "Rodovia BR-101, Km 94, Laranjeiras - SE",
    contato: "Eng. Marcos Vinícius (PCM)",
    observacoes: "Caldeiraria industrial pesada, flanges classe 300/600 e tubulações de alta pressão.",
    dataCadastro: "2026-10-15T08:45:00.000Z"
  },
  {
    id: "cli_mineracao_maruim",
    nome: "Mineração Sergipe Norte Ltda",
    empresa: "MSN Agregados e Calcário",
    cnpj_cpf: "08.774.219/0001-63",
    telefone: "(79) 99123-4567",
    email: "operacoes@mineracaosergipe.com.br",
    endereco: "Fazenda Pedra Branca, Zona Rural, Maruim - SE",
    contato: "Geraldo Santana",
    observacoes: "Pinos, buchas tratadas termicamente em 8620 e mandris de esteira transportadora.",
    dataCadastro: "2026-10-16T16:10:00.000Z"
  }
];

const MOCK_ORCAMENTOS = [
  {
    id: "orc_0001_serigy",
    numero: "0001",
    origem: "site",
    canalOrigem: "site_nardelliusinagem",
    status: "AJUSTE_SOLICITADO",
    visualizado: true,
    dataCriacao: "2026-10-21T09:30:00.000Z",
    dataInicio: "2026-10-21T10:15:00.000Z",
    dataAtualizacao: "2026-10-22T08:45:00.000Z",
    cliente: {
      nome: "Cervejaria Serigy (Carlos Mendes)",
      tel: "(79) 99876-5432",
      email: "carlos@serigy.com.br",
      empresa: "Cervejaria Artesanal Serigy",
      cnpj_cpf: "28.914.772/0001-85",
      endereco: "Rua José Carvalho Pinto, 240, Jardins, Aracaju - SE",
      contato: "Carlos Mendes"
    },
    descricaoServico: "Usinagem de engrenagem cônica dentes retos com furo central Ø45mm e rasgo de chaveta normalizado DIN 6885 para redutor de moagem de malte.",
    categoriaPeca: "Engrenagem",
    quantidadePecas: 4,
    unidadePeca: "PÇ",
    prazoDesejado: "5 dias úteis (urgência)",
    materialPeca: "Aço Liga (4140/4340)",
    tratamentoTermico: "Cementação",
    durezaDesejada: "58-62 HRC",
    detalhesTermico: "Cementação sólida em caixa com camada útil de 0.8 a 1.0mm e têmpera subsequente.",
    observacoes: "Cliente solicitou renegociação do prazo de entrega para 5 dias úteis devido à parada programada de linha no fim de semana.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "AÇO LIGA 4140 REDONDO BENEFICIADO", qtd: 8, unidade: "KG", preco: 38, subtotal: 304 },
      { nome: "INSERTO TORNEAMENTO TNMG 220408-TF IC907", qtd: 180, unidade: "MIN", preco: 0.1667, subtotal: 30.01 },
      { nome: "INSERTO 2MM CORTE E CANAL INTERNO DGN 2002J IC908", qtd: 60, unidade: "MIN", preco: 0.4167, subtotal: 25 },
      { nome: "PÓ PARA CEMENTAÇÃO", qtd: 6, unidade: "KG", preco: 100, subtotal: 600 },
      { nome: "ÓLEO PROTETIVO DESAGUANTE", qtd: 200, unidade: "ML", preco: 0.009, subtotal: 1.8 }
    ],
    itensMaquina: [
      { nome: "Serra Fita Horizontal Automática Ø330mm (RONEMAK M-330L)", descricao: "Corte de 4 tarugo(s) de matéria-prima (Aço Liga 4140)", regime: "normal", horas: 1.6, valorHora: 20.73, subtotal: 33.17 },
      { nome: "Torno Universal Ø400 x 1000mm (IMOR PRN 320)", descricao: "Setup em placa 4 castanhas, desbaste cilíndrico e torneamento cônico de precisão (4 pçs)", regime: "normal", horas: 7.0, valorHora: 23.96, subtotal: 167.72 },
      { nome: "Plaina Limadora 650mm para Rasgos Internos (ZOCCA 650)", descricao: "Abertura de rasgo de chaveta interno DIN 6885 com bedame retificado (4 pçs)", regime: "normal", horas: 2.5, valorHora: 21.84, subtotal: 54.60 },
      { nome: "Forno Elétrico de Tratamento Térmico até 1050°C (SANCHIS Mufla Industrial)", descricao: "Tratamento térmico de Cementação sólida a 860°C e têmpera para dureza 58-62 HRC", regime: "normal", horas: 3.0, valorHora: 42.95, subtotal: 128.85 },
      { nome: "Jateamento Abrasivo e Acabamento Superficial", descricao: "Remoção de carepas de oxidação pós-forno com microesferas de vidro (4 pçs)", regime: "normal", horas: 1.6, valorHora: 20.00, subtotal: 32.00 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Rebarbação, controle dimensional com micrômetro e teste de engrenamento (4 pçs)", regime: "normal", horas: 1.6, valorHora: 17.43, subtotal: 27.89 }
    ],
    moEscritorio: 0,
    frete: { distKm: 12, viagens: 1, pecas: 4, valorTotal: 75.00, cep: "49026-170", endereco: "Rua José Carvalho Pinto, 240, Jardins, Aracaju - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "ALTA",
      setor: "TRATAMENTO_TERMICO_RECUPERACAO",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Proposta parametrizada conforme critérios Nardelli Usinagem. Lote de 4 peças em 4140 com cementação e têmpera.",
      dataAnalise: "2026-10-21T09:35:00.000Z"
    },
    revisadoPorHumano: true,
    ajustadoManualmente: true,
    ajustesHumano: {
      houveAjustes: true,
      resumo: "Orçamentista adicionou 1.0h no Torno IMOR PRN 320 para ajuste de conicidade e acrescentou Pó para Cementação.",
      totalModificacoes: 2
    },
    totais: {
      totalInsumos: 960.81,
      valorInsumoComMargem: 1756.50,
      totalMO: 444.23,
      valorMOComMargem: 1798.49,
      freteTotal: 75.00,
      semDesconto: 3629.99,
      comDesconto: 3521.09,
      precoAPrazo: 3738.89,
      totalFinal: 3629.99
    }
  },
  {
    id: "orc_0002_taquari",
    numero: "0002",
    origem: "site",
    canalOrigem: "site_nardelliusinagem",
    status: "PENDENTE_REVISAO",
    visualizado: false,
    dataCriacao: "2026-10-22T08:15:00.000Z",
    dataInicio: null,
    cliente: {
      nome: "Usina Taquari S/A (Grupo Japungu)",
      tel: "(79) 3274-1100",
      email: "manutencao.mecanica@taquari.com.br",
      empresa: "Usina Taquari Açúcar e Álcool",
      cnpj_cpf: "13.088.144/0001-38",
      endereco: "Rodovia SE-204, Km 12, Povoado Miranda, Capela - SE",
      contato: "Eng. Marcelo Guimarães (Sup. Manutenção)"
    },
    descricaoServico: "Fabricação de 2 eixos de transmissão principal da moenda da Linha B. Dimensões: Ø180mm x 2400mm em Aço SAE 4140 beneficiado, 2 rasgos de chaveta 32x18x120mm, colos para rolamentos com tolerância centesimal h6/H7 e roscas nas extremidades M42x3.",
    categoriaPeca: "Eixo de Transmissão",
    quantidadePecas: 2,
    unidadePeca: "PÇ",
    prazoDesejado: "10 dias úteis",
    materialPeca: "Aço Liga (4140/4340)",
    tratamentoTermico: "Beneficiamento (Têmpera + Revenimento)",
    durezaDesejada: "280-320 HB",
    detalhesTermico: "Beneficiamento prévio com alívio de tensões após desbaste mecânico.",
    observacoes: "Solicitação recebida via formulário web com urgência para preparação de entressafra. Exige relatório de ensaio dimensional dos colos.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "AÇO LIGA 4140 FORJADO Ø200X2500MM", qtd: 980, unidade: "KG", preco: 18.50, subtotal: 18130.00 },
      { nome: "INSERTO TORNEAMENTO TNMG 220408-TF IC907", qtd: 480, unidade: "MIN", preco: 0.1667, subtotal: 80.02 },
      { nome: "INSERTO FRESAMENTO APKT 1604 PDR-76 IC928", qtd: 120, unidade: "MIN", preco: 0.2111, subtotal: 25.33 },
      { nome: "ÓLEO PROTETIVO DESAGUANTE", qtd: 1000, unidade: "ML", preco: 0.009, subtotal: 9.00 },
      { nome: "EMBALAGEM STRETCH TRANSP. 25 MICRAS 500MM X 200M", qtd: 30, unidade: "METRO", preco: 0.35, subtotal: 10.50 }
    ],
    itensMaquina: [
      { nome: "Serra Fita Horizontal Ø330mm (RONEMAK M-330L)", descricao: "Corte e esquadrejamento de barras forjadas Ø200mm (2 pçs)", regime: "normal", horas: 3.0, valorHora: 20.73, subtotal: 62.19 },
      { nome: "Torno Ø800 x 4000mm (TIMEMASTER CW800)", descricao: "Desbaste pesado, furação de centros, torneamento entre pontas dos colos e roscas M42 (2 pçs)", regime: "normal", horas: 18.0, valorHora: 31.00, subtotal: 558.00 },
      { nome: "Fresadora Universal Nº 2 (NATAL FU2-40)", descricao: "Fresamento de 4 rasgos de chaveta 32x18x120mm com fresa de topo inteiriça", regime: "normal", horas: 4.5, valorHora: 23.88, subtotal: 107.46 },
      { nome: "Retífica Cilíndrica Ø360x750mm (SULMECÂNICA RUAP 750)", descricao: "Retificação de acabamento nos colos dos mancais para tolerância centesimal H7 (Ra 0.4um)", regime: "normal", horas: 6.0, valorHora: 24.96, subtotal: 149.76 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Inspeção dimensional completa com micrômetro centesimal, rebarbação e proteção anticorrosiva", regime: "normal", horas: 3.0, valorHora: 17.43, subtotal: 52.29 }
    ],
    moEscritorio: 0,
    frete: { distKm: 68, viagens: 1, pecas: 2, valorTotal: 380.00, cep: "49700-000", endereco: "Rodovia SE-204, Km 12, Povoado Miranda, Capela - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "ALTA",
      setor: "USINAGEM_PESADA_AGROINDUSTRIA",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Peça de grande porte e alta responsabilidade estrutural. Selecionado Torno Timemaster CW800 e retífica cilíndrica para colos de mancais.",
      dataAnalise: "2026-10-22T08:18:00.000Z"
    },
    revisadoPorHumano: true,
    ajustadoManualmente: true,
    ajustesHumano: {
      houveAjustes: true,
      resumo: "Orçamentista selecionou Torno Timemaster CW800 e fixou 6.0h de Retífica Cilíndrica RUAP 750 para tolerância H7.",
      totalModificacoes: 2
    },
    totais: {
      totalInsumos: 18254.85,
      valorInsumoComMargem: 33385.25,
      totalMO: 929.70,
      valorMOComMargem: 3763.97,
      freteTotal: 380.00,
      semDesconto: 37529.22,
      comDesconto: 36403.34,
      precoAPrazo: 38655.10,
      totalFinal: 37529.22
    }
  },
  {
    id: "orc_0003_marata",
    numero: "0003",
    origem: "whatsapp",
    canalOrigem: "whatsapp_atendente",
    status: "EM_ANDAMENTO",
    visualizado: true,
    dataCriacao: "2026-10-21T10:00:00.000Z",
    dataInicio: "2026-10-21T14:30:00.000Z",
    dataAtualizacao: "2026-10-22T09:10:00.000Z",
    cliente: {
      nome: "Indústrias Alimentícias Maratá Ltda",
      tel: "(79) 3641-8000",
      email: "compras.usinagem@marata.com.br",
      empresa: "Grupo Maratá",
      cnpj_cpf: "13.125.688/0001-20",
      endereco: "Distrito Industrial s/n, Estância - SE",
      contato: "Patrícia Barreto (Compras Técnicas)"
    },
    descricaoServico: "Fabricação seriada de 6 polias escalonadas em alumínio naval 4 canais perfil B diâmetro externo Ø320mm, com balanceamento estático e furação para alojamento cônico.",
    categoriaPeca: "Polia Industrial",
    quantidadePecas: 6,
    unidadePeca: "PÇ",
    prazoDesejado: "6 dias úteis",
    materialPeca: "Alumínio Industrial / Naval",
    tratamentoTermico: "Nenhum",
    durezaDesejada: "Padrão",
    detalhesTermico: "",
    observacoes: "Material alimentício/sanitário, sem porosidades. Balanceamento para trabalho a 1800 RPM.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "TARUGO ALUMÍNIO NAVAL Ø330X80MM", qtd: 72, unidade: "KG", preco: 42.00, subtotal: 3024.00 },
      { nome: "INSERTO TORNEAMENTO ALUMÍNIO CCGT", qtd: 240, unidade: "MIN", preco: 0.18, subtotal: 43.20 },
      { nome: "INSERTO FRESAMENTO APKT 1604", qtd: 120, unidade: "MIN", preco: 0.2111, subtotal: 25.33 }
    ],
    itensMaquina: [
      { nome: "Torno CNC Logic 195III (NARDINI)", descricao: "Torneamento CNC de precisão, perfis das 4 pistas perfil B e alojamento cônico (6 pçs)", regime: "normal", horas: 8.5, valorHora: 28.00, subtotal: 238.00 },
      { nome: "Centro de Usinagem Cincinnati 4° Eixo", descricao: "Furação coordenada de furos de fixação e alívio de peso (6 pçs)", regime: "normal", horas: 3.5, valorHora: 35.00, subtotal: 122.50 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Balanceamento em bancada de calibração dinâmica e gravação técnica das peças", regime: "normal", horas: 3.0, valorHora: 17.43, subtotal: 52.29 }
    ],
    moEscritorio: 0,
    frete: { distKm: 72, viagens: 1, pecas: 6, valorTotal: 320.00, cep: "49200-000", endereco: "Distrito Industrial s/n, Estância - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "MEDIA",
      setor: "USINAGEM_CNC_ALIMENTICIA",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Usinagem de alta repetibilidade com Torno CNC Logic Nardini e Centro Cincinnati para tolerâncias rigorosas.",
      dataAnalise: "2026-10-21T10:05:00.000Z"
    },
    revisadoPorHumano: true,
    ajustadoManualmente: false,
    ajustesHumano: {
      houveAjustes: false,
      resumo: "Aprovado sem alterações. Relação horas/peça validada pela produção técnica.",
      totalModificacoes: 0
    },
    totais: {
      totalInsumos: 3092.53,
      valorInsumoComMargem: 5655.70,
      totalMO: 412.79,
      valorMOComMargem: 1671.21,
      freteTotal: 320.00,
      semDesconto: 7646.91,
      comDesconto: 7417.50,
      precoAPrazo: 7876.32,
      totalFinal: 7646.91
    }
  },
  {
    id: "orc_0004_nassau",
    numero: "0004",
    origem: "manual",
    canalOrigem: "balcao_presencial",
    status: "ENVIADO_AO_CLIENTE",
    visualizado: true,
    dataCriacao: "2026-10-20T09:00:00.000Z",
    dataInicio: "2026-10-20T09:30:00.000Z",
    dataAtualizacao: "2026-10-21T16:00:00.000Z",
    cliente: {
      nome: "Cimento Itaguassu S/A (Grupo Nassau)",
      tel: "(79) 3254-2000",
      email: "engenharia.planta@cimentoitaguassu.com.br",
      empresa: "Cimento Itaguassu",
      cnpj_cpf: "13.011.955/0001-44",
      endereco: "Av. Perimetral Oeste, Distrito Industrial, N. Sra. do Socorro - SE",
      contato: "Eng. Roberto Silveira"
    },
    descricaoServico: "Fabricação de 8 flanges sobrepostos especiais ANSI B16.5 1500# Ø450mm em Aço Inox 316L, furação para 16 prisioneiros 1.1/4\" e ranhurado fonográfico concêntrico para vedação com junta metálica.",
    categoriaPeca: "Flange Industrial",
    quantidadePecas: 8,
    unidadePeca: "PÇ",
    prazoDesejado: "12 dias úteis",
    materialPeca: "Aço Inoxidável (304 / 316L)",
    tratamentoTermico: "Nenhum",
    durezaDesejada: "Padrão",
    detalhesTermico: "",
    observacoes: "Fornecer certificado de composição química do inox 316L e ensaio de rugosidade Ra 3.2 - 6.3um na face de vedação. Proposta formal em PDF enviada por e-mail.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "DISCO CORTE INOX 316L Ø460X50MM", qtd: 340, unidade: "KG", preco: 48.00, subtotal: 16320.00 },
      { nome: "INSERTO FRESAMENTO APKT 1604", qtd: 360, unidade: "MIN", preco: 0.2111, subtotal: 76.00 },
      { nome: "INSERTO TORNEAMENTO TNMG IC907", qtd: 280, unidade: "MIN", preco: 0.1667, subtotal: 46.68 }
    ],
    itensMaquina: [
      { nome: "Torno Ø660 x 2200mm (TIMEMASTER CDS 660)", descricao: "Usinagem de flanges até Ø450mm na cava, desbaste externo e faceamento concêntrico fonográfico (8 pçs)", regime: "normal", horas: 16.0, valorHora: 23.96, subtotal: 383.36 },
      { nome: "Centro de Usinagem ROMI (Discovery 760)", descricao: "Furação coordenada dos 16 furos passantes Ø35mm para prisioneiros classe 1500# (8 pçs)", regime: "normal", horas: 8.0, valorHora: 35.00, subtotal: 280.00 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Inspeção com rugosímetro Mitutoyo e teste com calibrador passa/não-passa", regime: "normal", horas: 4.0, valorHora: 17.43, subtotal: 69.72 }
    ],
    moEscritorio: 0,
    frete: { distKm: 18, viagens: 1, pecas: 8, valorTotal: 150.00, cep: "49160-000", endereco: "Av. Perimetral Oeste, Distrito Industrial, N. Sra. do Socorro - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "ALTA",
      setor: "CALDEIRARIA_FLANGES_PETROQUIMICA",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Usinagem pesada em Inox 316L requer baixa velocidade de corte e fluido refrigerante integral.",
      dataAnalise: "2026-10-20T09:12:00.000Z"
    },
    totais: {
      totalInsumos: 16442.68,
      valorInsumoComMargem: 30070.74,
      totalMO: 733.08,
      valorMOComMargem: 2967.93,
      freteTotal: 150.00,
      semDesconto: 33188.67,
      comDesconto: 32192.01,
      precoAPrazo: 34184.33,
      totalFinal: 33188.67
    }
  },
  {
    id: "orc_0005_tecarmo",
    numero: "0005",
    origem: "site",
    canalOrigem: "site_nardelliusinagem",
    status: "APROVADO",
    visualizado: true,
    dataCriacao: "2026-10-18T11:20:00.000Z",
    dataInicio: "2026-10-18T11:45:00.000Z",
    dataAtualizacao: "2026-10-19T14:10:00.000Z",
    cliente: {
      nome: "Terminal Marítimo Inácio Barbosa (Polo Tecarmo)",
      tel: "(79) 3218-4500",
      email: "suprimentos.tecarmo@operacoes.com.br",
      empresa: "Operações Portuárias & Logística Offshore",
      cnpj_cpf: "33.000.167/0001-01",
      endereco: "Av. Melício Machado, s/n, Atalaia Nova / Barra dos Coqueiros - SE",
      contato: "Comandante Eduardo Nogueira / Manutenção"
    },
    descricaoServico: "Serviço de recuperação completa de carcaça e mancais de bomba centrífuga multiestágio KSB. Recuperação das sedes de rolamento com enchimento por solda TIG, mandrilhamento de precisão e alinhamento geométrico a laser.",
    categoriaPeca: "Recuperação de Mancal",
    quantidadePecas: 1,
    unidadePeca: "PÇ",
    prazoDesejado: "8 dias úteis",
    materialPeca: "Aço Carbono SAE 1045",
    tratamentoTermico: "Nenhum",
    durezaDesejada: "Padrão",
    detalhesTermico: "",
    observacoes: "Orçamento aprovado via Pedido de Compra nº PO-88392. Ensaio por líquido penetrante (LP) realizado sem descontinuidades.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "VARETA SOLDA TIG ER316L 2,4MM", qtd: 6, unidade: "KG", preco: 120.00, subtotal: 720.00 },
      { nome: "GÁS ARGÔNIO PURO", qtd: 180, unidade: "MIN", preco: 0.6897, subtotal: 124.15 },
      { nome: "DISCO DE DESBASTE E FLAP 4.1/2", qtd: 8, unidade: "PÇ", preco: 7.50, subtotal: 60.00 },
      { nome: "TINTA EPOXI BICOMPONENTE GRAU NAVAL", qtd: 2, unidade: "LITRO", preco: 95.00, subtotal: 190.00 }
    ],
    itensMaquina: [
      { nome: "Soldagem MIG/MAG, TIG e Eletrodo (ESAB)", descricao: "Solda TIG em camadas cruzadas nas sedes desgastadas da bomba", regime: "normal", horas: 6.0, valorHora: 29.09, subtotal: 174.54 },
      { nome: "Mandrilhadora Convencional Fuso Ø80 (WARSZAWA)", descricao: "Mandrilhamento centesimal das sedes dos rolamentos e faceamento dos batentes (mesa 4t)", regime: "normal", horas: 12.0, valorHora: 31.00, subtotal: 372.00 },
      { nome: "Jateamento Abrasivo e Acabamento Superficial", descricao: "Jateamento padrão Sa 2.5 da carcaça e aplicação de primer anticorrosivo epóxi naval", regime: "normal", horas: 4.0, valorHora: 20.00, subtotal: 80.00 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Peritagem geométrica, montagem teste de rolamentos e ensaio por líquido penetrante", regime: "normal", horas: 6.0, valorHora: 17.43, subtotal: 104.58 }
    ],
    moEscritorio: 0,
    frete: { distKm: 24, viagens: 1, pecas: 1, valorTotal: 180.00, cep: "49140-000", endereco: "Av. Melício Machado, s/n, Atalaia Nova / Barra dos Coqueiros - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "ALTA",
      setor: "RECUPERACAO_EQUIPAMENTOS_OFFSHORE",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Procedimento homologado de soldagem e usinagem para bombas de alta pressão com garantia técnica Nardelli.",
      dataAnalise: "2026-10-18T11:30:00.000Z"
    },
    totais: {
      totalInsumos: 1094.15,
      valorInsumoComMargem: 2000.99,
      totalMO: 731.12,
      valorMOComMargem: 2960.00,
      freteTotal: 180.00,
      semDesconto: 5140.99,
      comDesconto: 4986.76,
      precoAPrazo: 5295.22,
      totalFinal: 5140.99
    }
  },
  {
    id: "orc_0006_unigel",
    numero: "0006",
    origem: "whatsapp",
    canalOrigem: "whatsapp_bot",
    status: "APROVADO",
    visualizado: true,
    dataCriacao: "2026-10-15T15:40:00.000Z",
    dataInicio: "2026-10-15T16:00:00.000Z",
    dataAtualizacao: "2026-10-17T11:00:00.000Z",
    cliente: {
      nome: "Unigel Agro Sergipe S/A",
      tel: "(79) 3281-9000",
      email: "compras.laranjeiras@unigel.com.br",
      empresa: "Unigel Agro Brasil",
      cnpj_cpf: "38.402.190/0001-72",
      endereco: "Rodovia BR-101, Km 94, Laranjeiras - SE",
      contato: "Eng. Marcos Vinícius (PCM)"
    },
    descricaoServico: "Fabricação seriada de 12 buchas guia autolubrificantes em Bronze TM-23 (SAE 660) nas dimensões Ø120mm ext x Ø85mm int x 180mm de comprimento, com ranhuras internas helicoidais de lubrificação tipo 8.",
    categoriaPeca: "Bucha de Bronze",
    quantidadePecas: 12,
    unidadePeca: "PÇ",
    prazoDesejado: "7 dias úteis",
    materialPeca: "Bronze / Latão (TM-23 / SAE 660)",
    tratamentoTermico: "Nenhum",
    durezaDesejada: "Padrão",
    detalhesTermico: "",
    observacoes: "Fornecimento de lote completo com certificado de qualidade e ensaio de rugosidade interior Ra 0.8um.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "TUBO CENTRIFUGADO BRONZE TM-23 Ø125XØ80MM", qtd: 110, unidade: "KG", preco: 65.00, subtotal: 7150.00 },
      { nome: "INSERTO TORNEAMENTO TNMG IC907", qtd: 300, unidade: "MIN", preco: 0.1667, subtotal: 50.01 },
      { nome: "ÓLEO PROTETIVO DESAGUANTE", qtd: 500, unidade: "ML", preco: 0.009, subtotal: 4.50 }
    ],
    itensMaquina: [
      { nome: "Torno Ø650 x 2200mm (NARDINI NDT 650)", descricao: "Desbaste e acabamento dimensional centesimal dos diâmetros externo e interno (12 pçs)", regime: "normal", horas: 14.0, valorHora: 23.96, subtotal: 335.44 },
      { nome: "Plaina Limadora 650mm (ZOCCA 650)", descricao: "Abertura das canaletas internas de lubrificação helicoidal em formato de 8 (12 pçs)", regime: "normal", horas: 6.0, valorHora: 21.84, subtotal: 131.04 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Rebarbação, lavagem ultra-sônica, controle de rugosidade e embalagem técnica", regime: "normal", horas: 3.5, valorHora: 17.43, subtotal: 61.01 }
    ],
    moEscritorio: 0,
    frete: { distKm: 28, viagens: 1, pecas: 12, valorTotal: 160.00, cep: "49170-000", endereco: "Rodovia BR-101, Km 94, Laranjeiras - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "MEDIA",
      setor: "USINAGEM_BRONZE_FERTILIZANTES",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Usinagem de bronze fosforoso SAE 660 com tolerâncias rigorosas para mancais de alta carga.",
      dataAnalise: "2026-10-15T15:45:00.000Z"
    },
    totais: {
      totalInsumos: 7204.51,
      valorInsumoComMargem: 13175.72,
      totalMO: 527.49,
      valorMOComMargem: 2135.61,
      freteTotal: 160.00,
      semDesconto: 15471.33,
      comDesconto: 15007.19,
      precoAPrazo: 15935.47,
      totalFinal: 15471.33
    }
  },
  {
    id: "orc_0007_mineracao",
    numero: "0007",
    origem: "manual",
    canalOrigem: "balcao_presencial",
    status: "RECUSADO",
    visualizado: true,
    dataCriacao: "2026-10-12T16:00:00.000Z",
    dataInicio: "2026-10-12T16:30:00.000Z",
    dataAtualizacao: "2026-10-14T10:00:00.000Z",
    cliente: {
      nome: "Mineração Sergipe Norte Ltda",
      tel: "(79) 99123-4567",
      email: "operacoes@mineracaosergipe.com.br",
      empresa: "MSN Agregados e Calcário",
      cnpj_cpf: "08.774.219/0001-63",
      endereco: "Fazenda Pedra Branca, Zona Rural, Maruim - SE",
      contato: "Geraldo Santana"
    },
    descricaoServico: "Corte térmico a plasma e furação pesada de 4 chapas de desgaste em Hardox 450 espessura 1/2\" (12.7mm) x 1200 x 2400mm para grelha de britador primário.",
    categoriaPeca: "Caldeiraria Pesada",
    quantidadePecas: 4,
    unidadePeca: "PÇ",
    prazoDesejado: "4 dias úteis",
    materialPeca: "Aço Especial Antidesgaste (Hardox)",
    tratamentoTermico: "Nenhum",
    durezaDesejada: "450 HB (natural da chapa)",
    detalhesTermico: "",
    observacoes: "Proposta recusada pelo cliente: optou por realizar solda provisória na esteira existente para atender demanda imediata da pedreira.",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    arquivos: [],
    itensInsumo: [
      { nome: "CHAPA HARDOX 450 1/2\"X1200X2400MM", qtd: 1140, unidade: "KG", preco: 22.00, subtotal: 25080.00 },
      { nome: "CONSUMÍVEL CORTE PLASMA E BICOS", qtd: 180, unidade: "MIN", preco: 0.50, subtotal: 90.00 },
      { nome: "BROCA METAL DURO Ø22MM", qtd: 60, unidade: "MIN", preco: 0.75, subtotal: 45.00 }
    ],
    itensMaquina: [
      { nome: "Corte a Quente com Plasma e Maçarico", descricao: "Corte térmico linear das 4 chapas de blindagem conforme desenho técnico", regime: "normal", horas: 6.0, valorHora: 28.30, subtotal: 169.80 },
      { nome: "Furadeira Radial 60mm (NARDINI FNR 80)", descricao: "Furação de 48 furos Ø22mm para fixação por parafusos franceses", regime: "normal", horas: 8.0, valorHora: 26.14, subtotal: 209.12 },
      { nome: "Manutenção Mecânica / Bancada / Peritagem", descricao: "Rebarbação mecânica com esmerilhadeira pesada e controle de alinhamento", regime: "normal", horas: 4.0, valorHora: 17.43, subtotal: 69.72 }
    ],
    moEscritorio: 0,
    frete: { distKm: 42, viagens: 1, pecas: 4, valorTotal: 250.00, cep: "49770-000", endereco: "Fazenda Pedra Branca, Zona Rural, Maruim - SE" },
    parcelamento: { prazoMeses: 0 },
    analiseIA: {
      complexidade: "MEDIA",
      setor: "CALDEIRARIA_MINERACAO",
      modelo: "anthropic/claude-3.5-sonnet",
      observacaoTecnica: "Corte e furação de chapas antidesgaste de alta dureza.",
      dataAnalise: "2026-10-12T16:15:00.000Z"
    },
    totais: {
      totalInsumos: 25215.00,
      valorInsumoComMargem: 46114.71,
      totalMO: 448.64,
      valorMOComMargem: 1816.36,
      freteTotal: 250.00,
      semDesconto: 48181.07,
      comDesconto: 46735.64,
      precoAPrazo: 49626.50,
      totalFinal: 48181.07
    }
  }
];

const MOCK_CONVERSAS = [
  {
    id: "conv_taquari_01",
    cliente: {
      nome: "Usina Taquari (Eng. Marcelo Guimarães)",
      telefone: "(79) 3274-1100",
      email: "manutencao.mecanica@taquari.com.br",
      empresa: "Usina Taquari S/A"
    },
    descricaoServico: "Fabricação de 2 eixos de transmissão principal da moenda da Linha B Ø180mm x 2400mm em Aço 4140 beneficiado",
    status: "orcamento_gerado",
    orcamentoId: "orc_0002_taquari",
    orcamentoNumero: "0002",
    canalOrigem: "site",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    ultimaMensagemClienteEm: "2026-10-22T08:15:00.000Z",
    mensagens: [
      {
        id: "m_tq_1",
        remetente: "cliente",
        texto: "🌐 Solicitação via Site Nardelli Usinagem\n\n🛠️ Serviço: Fabricação de 2 eixos de transmissão da moenda (Ø180x2400mm) em 4140 beneficiado.\n\n🏢 Empresa: Usina Taquari S/A\n\n👤 Contato: Eng. Marcelo Guimarães\n\nObservação: Parada programada de safra, urgência no fornecimento.",
        hora: "08:15"
      },
      {
        id: "m_tq_2",
        remetente: "bot",
        texto: "Olá, Eng. Marcelo! Recebemos sua solicitação da Usina Taquari com sucesso. Pré-orçamento #0002 gerado automaticamente. Nossa equipe técnica da Nardelli Usinagem já está avaliando as tolerâncias e prazo de entrega.",
        hora: "08:15"
      }
    ],
    dataAtualizacao: "2026-10-22T08:15:00.000Z"
  },
  {
    id: "conv_marata_02",
    cliente: {
      nome: "Indústrias Maratá (Patrícia Barreto)",
      telefone: "(79) 3641-8000",
      email: "compras.usinagem@marata.com.br",
      empresa: "Indústrias Alimentícias Maratá Ltda"
    },
    descricaoServico: "Lote de 6 polias escalonadas em alumínio naval 4 canais perfil B Ø320mm",
    status: "orcamento_gerado",
    orcamentoId: "orc_0003_marata",
    orcamentoNumero: "0003",
    canalOrigem: "whatsapp",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    ultimaMensagemClienteEm: "2026-10-21T10:00:00.000Z",
    mensagens: [
      {
        id: "m_mr_1",
        remetente: "cliente",
        texto: "Olá bom dia! Gostaria de cotar a fabricação seriada de 6 polias escalonadas de 4 canais perfil B em alumínio naval diâmetro 320mm para nossas esteiras de empacotamento.",
        hora: "10:00"
      },
      {
        id: "m_mr_2",
        remetente: "bot",
        texto: "Bom dia, Patrícia! Perfeito, já registramos seu pedido das Indústrias Maratá no sistema. Orçamento #0003 direcionado para nossos centros CNC e tornos Nardini.",
        hora: "10:01"
      },
      {
        id: "m_mr_3",
        remetente: "atendente",
        texto: "Olá Patrícia, engenharia Nardelli aqui! Já estamos detalhando o processo no Torno CNC Logic 195III com balanceamento estático incluso.",
        hora: "14:30"
      }
    ],
    dataAtualizacao: "2026-10-21T14:30:00.000Z"
  },
  {
    id: "conv_serigy_03",
    cliente: {
      nome: "Cervejaria Serigy (Carlos Mendes)",
      telefone: "(79) 99876-5432",
      email: "carlos@serigy.com.br",
      empresa: "Cervejaria Serigy"
    },
    descricaoServico: "Engrenagem cônica dentes retos com furo Ø45mm e rasgo chaveta",
    status: "orcamento_gerado",
    orcamentoId: "orc_0001_serigy",
    orcamentoNumero: "0001",
    canalOrigem: "site",
    videoInfo: { enviarVideo: "", linkVideo: "", temVideo: false, pendenteContato: false },
    ultimaMensagemClienteEm: "2026-10-22T08:40:00.000Z",
    mensagens: [
      {
        id: "m1",
        remetente: "cliente",
        texto: "🌐 Solicitação via Formulário do Site (nardelliusinagem.com/orcamento)\n\n🛠️ Peças / Serviços: Peça Industrial / Usinagem\n\n🏢 Empresa: Cervejaria Serigy\n\n📝 Observações do Cliente: Engrenagem cônica dentes retos com furo Ø45mm e rasgo chaveta",
        hora: "22:55"
      },
      {
        id: "m2",
        remetente: "bot",
        texto: "Recebido pelo site com sucesso! Pré-orçamento #0001 criado automaticamente. Nossa equipe técnica está avaliando as tolerâncias e custos.",
        hora: "22:55"
      },
      {
        id: "m3",
        remetente: "cliente",
        texto: "Bom dia equipe Nardelli, analisamos a proposta e precisamos que a entrega seja antecipada para 5 dias úteis se possível, podemos ajustar isso?",
        hora: "08:40"
      },
      {
        id: "m4",
        remetente: "bot",
        texto: "Recebemos sua solicitação de ajuste! Marcamos o orçamento #0001 com status [AJUSTE SOLICITADO] e nossa engenharia está alocando turno estendido para cumprir o prazo de 5 dias.",
        hora: "08:45"
      }
    ],
    dataAtualizacao: "2026-10-22T08:45:00.000Z"
  }
];

module.exports = {
  MOCK_CLIENTES,
  MOCK_ORCAMENTOS,
  MOCK_CONVERSAS
};
