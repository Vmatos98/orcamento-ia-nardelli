const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const postgresService = require('./postgresService');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.json');

const INSUMOS_INICIAIS = [
  { id: "ins_0", nome: "B. RED. AÇO 1045 Ø1\"X75MM (ACB. Ø24,95X70MM)", fornecedor: "TREFITA", unidade: "KG", preco: 25.0 },
  { id: "ins_1", nome: "FRETE AVULSO", fornecedor: "VIA VERDE", unidade: "PÇ", preco: 200.0 },
  { id: "ins_2", nome: "S. FITA BI-METAL INTENSS 27X0,90X6-10", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.4167 },
  { id: "ins_3", nome: "INSERTO TORNEAMENTO TNMG 220408-TF IC907", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.1667 },
  { id: "ins_4", nome: "INSERTO FRESAMENTO APKT 1604 PDR-76 IC928", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.2111 },
  { id: "ins_5", nome: "INSERTO ROSQ. INT. 22IRM N60 908-5921212 ISCAR", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.3619 },
  { id: "ins_6", nome: "INSERTO 2MM CORTE E CANAL INTERNO DGN 2002J IC908", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.4167 },
  { id: "ins_7", nome: "BROCA DE CENTRO Ø3X7,5MM", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.3026 },
  { id: "ins_8", nome: "BROCA HSS Ø6,8", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.148 },
  { id: "ins_9", nome: "BROCA HSS Ø 5/8\"", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.1194 },
  { id: "ins_10", nome: "BROCA HSS Ø 1.1/2\"", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.4333 },
  { id: "ins_11", nome: "FRESA DE TOPO MD Ø8MM", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.75 },
  { id: "ins_12", nome: "BASTÃO MD. Ø8X100MM", fornecedor: "NARDELLI", unidade: "MM", preco: 1.84 },
  { id: "ins_13", nome: "MACHO HSS M8", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.9375 },
  { id: "ins_14", nome: "BIST 1/2\"X100MM 50% COBALTO", fornecedor: "NARDELLI", unidade: "MM", preco: 0.85 },
  { id: "ins_15", nome: "LIXA PARA FERRO 100", fornecedor: "NARDELLI", unidade: "PÇ", preco: 2.5 },
  { id: "ins_16", nome: "REBOLO RT.254X025,4X076,2 AA036 K6 V2 (BRANCO)", fornecedor: "NARDELLI", unidade: "MM", preco: 2.0 },
  { id: "ins_17", nome: "REBOLO RT.355,6X031,75X127 AA080 J6 V15 (BRANCO)", fornecedor: "NARDELLI", unidade: "MM", preco: 4.5 },
  { id: "ins_18", nome: "REBOLO RETÍFICA INTERNA Ø18X20X6 G60", fornecedor: "NARDELLI", unidade: "MM", preco: 3.5 },
  { id: "ins_19", nome: "ÓLEO PROTETIVO DESAGUANTE", fornecedor: "NARDELLI", unidade: "ML", preco: 0.009 },
  { id: "ins_20", nome: "EMBALAGEM STRETCH TRANSP. 25 MICRAS 500MM X 200M", fornecedor: "NARDELLI", unidade: "METRO", preco: 0.35 },
  { id: "ins_21", nome: "B. CHATA GRAFITE 100x300x30MM", fornecedor: "SEAGRAFITE", unidade: "MM²", preco: 0.02493 },
  { id: "ins_22", nome: "CHAVETA B. RET. 1045 32X18X60MM", fornecedor: "NARDELLI", unidade: "MM", preco: 0.713 },
  { id: "ins_23", nome: "LIMA ROTATIVA CÔNICA MD", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.2708 },
  { id: "ins_24", nome: "ELETRODO CONARCO 7018 1/8\"", fornecedor: "NARDELLI", unidade: "KG", preco: 28.0 },
  { id: "ins_25", nome: "DISCO DE CORTE 4.1/2\" TYROLIT", fornecedor: "NARDELLI", unidade: "PÇ", preco: 2.0 },
  { id: "ins_26", nome: "DISCO DE CORTE 7\" TYROLIT", fornecedor: "NARDELLI", unidade: "PÇ", preco: 5.5 },
  { id: "ins_27", nome: "DISCO DESBASTE 4.1/2\" TYROLIT", fornecedor: "NARDELLI", unidade: "PÇ", preco: 7.5 },
  { id: "ins_28", nome: "DISCO DESBASTE 7\" TYROLIT", fornecedor: "NARDELLI", unidade: "PÇ", preco: 14.5 },
  { id: "ins_29", nome: "DISCO FLAP 4.1/2\" G80 TYROLIT", fornecedor: "NARDELLI", unidade: "PÇ", preco: 4.5 },
  { id: "ins_30", nome: "PÓ PARA CEMENTAÇÃO", fornecedor: "NARDELLI", unidade: "KG", preco: 100.0 },
  { id: "ins_31", nome: "ÓLEO TÊMPERA 1037/22L (TAMBOR 200L)", fornecedor: "TERMAX", unidade: "KG", preco: 13.333 },
  { id: "ins_32", nome: "GÁS GLP + OXIGÊNIO", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.4569 },
  { id: "ins_33", nome: "GÁS ARGÔNIO", fornecedor: "NARDELLI", unidade: "MIN", preco: 0.6897 },
  { id: "ins_34", nome: "ESTOPA LIMPEZA", fornecedor: "NARDELLI", unidade: "KG", preco: 13.0 },
  { id: "ins_35", nome: "TINTA ESMALTE INDUSTRIAL", fornecedor: "NARDELLI", unidade: "LITRO", preco: 50.0 },
  { id: "ins_36", nome: "THINNER LIMPEZA", fornecedor: "NARDELLI", unidade: "LITRO", preco: 17.0 }
];

const MAQUINAS_INICIAIS = [
  {
    "id": "maq_torno_800_4000",
    "nome": "Torno Ø800 x 4000mm (TIMEMASTER CW800)",
    "categoria": "Torneamento Pesado",
    "marca": "TIMEMASTER",
    "modelo": "CW800",
    "ano": 2008,
    "capacidade": "Ø800 x 4000mm entre pontas; flanges até Ø1000mm na cava; peso admissível 3000kg",
    "descricao": "Equipamento de grande porte para peças longas e pesadas (eixos de moenda, rolos e cilindros industriais)",
    "observacoes": "Usinagem de flanges até Ø1000mm, Peso admissível 3000kg",
    "normal": 31,
    "h50": 46.49,
    "h100": 61.99
  },
  {
    "id": "maq_torno_660_2200",
    "nome": "Torno Ø660 x 2200mm (TIMEMASTER CDS 660)",
    "categoria": "Torneamento Médio/Pesado",
    "marca": "TIMEMASTER",
    "modelo": "CDS 660",
    "ano": 2017,
    "capacidade": "Ø660 x 2200mm entre pontas; flanges até Ø850mm na cava; peso admissível 2000kg",
    "descricao": "O padrão da indústria para manutenção geral e peças de médio e grande porte",
    "observacoes": "Usinagem de flanges até Ø850mm, Peso admissível 2000kg",
    "normal": 23.96,
    "h50": 35.94,
    "h100": 47.92
  },
  {
    "id": "maq_torno_650_2200_nardini",
    "nome": "Torno Ø650 x 2200mm (NARDINI NDT 650)",
    "categoria": "Torneamento Médio",
    "marca": "NARDINI",
    "modelo": "NDT 650",
    "ano": 2007,
    "capacidade": "Ø650 x 2200mm entre pontas; flanges até Ø800mm na cava; peso admissível 1000kg",
    "descricao": "Padrão da indústria para manutenção geral, eixos e peças de médio porte",
    "observacoes": "Usinagem de flanges até Ø800mm, Peso admissível 1000kg",
    "normal": 23.96,
    "h50": 35.94,
    "h100": 47.92
  },
  {
    "id": "maq_torno_650_2200_romi",
    "nome": "Torno Ø650 x 2200mm (ROMI I40-A)",
    "categoria": "Torneamento Médio",
    "marca": "ROMI",
    "modelo": "I40-A",
    "ano": 2005,
    "capacidade": "Ø650 x 2200mm entre pontas; peso admissível 1500kg",
    "descricao": "Máquina robusta projetada para ferramentaria, manutenção médio porte e produção",
    "observacoes": "Peso admissível 1500kg",
    "normal": 23.96,
    "h50": 35.94,
    "h100": 47.92
  },
  {
    "id": "maq_torno_440_1000",
    "nome": "Torno Ø440 x 1000mm (NARDINI Mascote MS 220)",
    "categoria": "Torneamento Convencional",
    "marca": "NARDINI",
    "modelo": "MASCOTE GOLD MS 220",
    "ano": 2010,
    "capacidade": "Ø440 x 1000mm entre pontas; peso admissível 600kg",
    "descricao": "Alta precisão, robustez e versatilidade com peças de indústria e ferramentaria até 1000mm",
    "observacoes": "Peso admissível 600kg",
    "normal": 23.96,
    "h50": 35.94,
    "h100": 47.92
  },
  {
    "id": "maq_torno_400_1000",
    "nome": "Torno Ø400 x 1000mm (IMOR PRN 320)",
    "categoria": "Torneamento Leve",
    "marca": "IMOR",
    "modelo": "PRN 320",
    "ano": 2002,
    "capacidade": "Ø400 x 1000mm entre pontas; peso admissível 80kg",
    "descricao": "Agilidade e precisão para componentes pequenos, pinos, buchas e eixos leves",
    "observacoes": "Peso admissível 80kg",
    "normal": 23.96,
    "h50": 35.94,
    "h100": 47.92
  },
  {
    "id": "maq_torno_cnc",
    "nome": "Torno CNC Logic 195III (NARDINI)",
    "categoria": "Usinagem CNC",
    "marca": "Nardini",
    "modelo": "Logic 195III",
    "ano": 2013,
    "capacidade": "Dimensões de usinagem (X,Z): Ø400 x 970mm; peso admissível 400kg",
    "descricao": "Produção seriada, alta produtividade com perfis complexos ou roscas especiais",
    "observacoes": "Peso admissível de usinagem 400kg",
    "normal": 28,
    "h50": 42,
    "h100": 56
  },
  {
    "id": "maq_cnc_cincinnati",
    "nome": "Centro de Usinagem Cincinnati 4° Eixo (Milacron Arrow 500)",
    "categoria": "Usinagem CNC",
    "marca": "Cincinnati",
    "modelo": "Milacron Arrow 500",
    "ano": 1998,
    "capacidade": "Cursos (X,Y,Z): 508 x 508 x 508mm com 4° eixo; peso admissível 800kg",
    "descricao": "Equipamento robusto para fresamento complexo, perfis 3D e furação coordenada com 4º eixo",
    "observacoes": "Peso admissível de usinagem 800kg, equipado com 4° eixo",
    "normal": 35,
    "h50": 52.5,
    "h100": 70
  },
  {
    "id": "maq_cnc_romi",
    "nome": "Centro de Usinagem ROMI (Discovery 760)",
    "categoria": "Usinagem CNC",
    "marca": "Romi",
    "modelo": "Discovery 760",
    "ano": 2000,
    "capacidade": "Cursos (X,Y,Z): 762 x 406 x 508mm; peso admissível 800kg",
    "descricao": "Equipamento robusto para fresamento complexo, cavidades e furação coordenada de alta precisão",
    "observacoes": "Peso admissível de usinagem 800kg",
    "normal": 35,
    "h50": 52.5,
    "h100": 70
  },
  {
    "id": "maq_fresadora_universal",
    "nome": "Fresadora Universal Nº 2 700x230mm (NATAL FU2-40)",
    "categoria": "Fresagem e Plainamento",
    "marca": "NATAL",
    "modelo": "FU2-40",
    "ano": 1990,
    "capacidade": "Mesa: 700 x 230mm; giro da mesa 45°; cabeçote divisor universal",
    "descricao": "Adequada para usinagem de engrenagens de vários modelos, dentes retos/helicoidais, canais e alojamentos",
    "observacoes": "Giro da mesa 45°, fresamento de engrenagens e eixos estriados",
    "normal": 23.88,
    "h50": 35.83,
    "h100": 47.77
  },
  {
    "id": "maq_fresadora_ferramenteira",
    "nome": "Fresadora Ferramenteira 700x260mm (VIRTUAL ZX6332B)",
    "categoria": "Fresagem e Plainamento",
    "marca": "VIRTUAL",
    "modelo": "ZX6332B",
    "ano": 2016,
    "capacidade": "Mesa: 700 x 260mm; rotação máxima 5000rpm",
    "descricao": "Alta precisão para acabamentos, chavetas em eixos, furação e detalhes técnicos",
    "observacoes": "Rotação máxima 5000rpm, excelente para chavetas e detalhes finos",
    "normal": 23.88,
    "h50": 35.83,
    "h100": 47.77
  },
  {
    "id": "maq_plaina_limadora",
    "nome": "Plaina Limadora 650mm (ZOCCA 650)",
    "categoria": "Fresagem e Plainamento",
    "marca": "ZOCCA",
    "modelo": "650",
    "ano": 1980,
    "capacidade": "Curso útil do torpedo: 650mm",
    "descricao": "Grande robustez para abertura de rasgos de chaveta internos em engrenagens e polias, estrias e superfícies planas",
    "observacoes": "Especialista em rasgos de chaveta internos e estrias",
    "normal": 21.84,
    "h50": 32.76,
    "h100": 43.69
  },
  {
    "id": "maq_mandrilhadora",
    "nome": "Mandrilhadora Convencional Fuso Ø80 (WARSZAWA)",
    "categoria": "Mandrilhamento e Furação",
    "marca": "WARSZAWA",
    "modelo": "FUSO Ø80",
    "ano": 1980,
    "capacidade": "Cursos: X1050 x Y1000 x Z1400mm; fuso Ø80mm; capacidade de carga sobre a mesa: 4 toneladas",
    "descricao": "Máquina robusta ideal para usinagem de precisão em peças pesadas (carcaças de redutores, blocos, mancais)",
    "observacoes": "Capacidade de carga sobre a mesa 4 toneladas",
    "normal": 31,
    "h50": 46.49,
    "h100": 61.99
  },
  {
    "id": "maq_furadeira_radial",
    "nome": "Furadeira Radial 60mm (NARDINI FNR 80)",
    "categoria": "Mandrilhamento e Furação",
    "marca": "NARDINI",
    "modelo": "FNR 80",
    "ano": 2000,
    "capacidade": "Capacidade de furação: Ø60mm em aço; raio do braço 2000mm; altura útil 2500mm",
    "descricao": "Projetada para furação profunda, alargamento e rosqueamento em peças pesadas e de grande porte",
    "observacoes": "Capacidade de furação Ø60mm",
    "normal": 26.14,
    "h50": 39.21,
    "h100": 52.28
  },
  {
    "id": "maq_retifica_cilindrica",
    "nome": "Retífica Cilíndrica Ø360x750mm (SULMECÂNICA RUAP 750)",
    "categoria": "Usinagem de Precisão",
    "marca": "SULMECÂNICA",
    "modelo": "UNIVERSAL RUAP 750",
    "ano": 1990,
    "capacidade": "Diâmetro máx retificável: Ø360 x 750mm; peso placa e ponto: 80kg",
    "descricao": "Acabamento superficial superior e ajuste dimensional centesimal (H6/H7) para eixos e peças cilíndricas endurecidas",
    "observacoes": "Tolerâncias centesimais para colos de rolamentos e materiais temperados",
    "normal": 24.96,
    "h50": 37.44,
    "h100": 49.92
  },
  {
    "id": "maq_retifica_plana",
    "nome": "Retífica Plana 640x360x300mm (FERDMAT UNIVERSAL T60)",
    "categoria": "Usinagem de Precisão",
    "marca": "FERDMAT",
    "modelo": "UNIVERSAL T60",
    "ano": 1990,
    "capacidade": "Cursos: 640 x 360 x 300mm; peso sobre a mesa: 330kg",
    "descricao": "Retificação de faces com garantia de planicidade e rugosidade controlada em materiais endurecidos",
    "observacoes": "Planicidade de precisão em réguas, facas industriais e placas",
    "normal": 23.96,
    "h50": 35.94,
    "h100": 47.92
  },
  {
    "id": "maq_eletroerosao",
    "nome": "Eletroerosão por Penetração (INFRESA ONA GORKA 200)",
    "categoria": "Usinagem de Precisão",
    "marca": "INFRESA ONA",
    "modelo": "GORKA 200",
    "ano": 1995,
    "capacidade": "Cursos (X,Y,Z): 300 x 200 x 200mm; peso sobre a mesa: 300kg",
    "descricao": "Usinagem de cavidades complexas, chavetas cegas e materiais temperados/duros com eletrodo de grafite/cobre",
    "observacoes": "Usinagem sem contato mecânico em aços de altíssima dureza",
    "normal": 35,
    "h50": 52.5,
    "h100": 70
  },
  {
    "id": "maq_forno_horizontal",
    "nome": "Forno Elétrico Mufla Horizontal 700x700x900mm (SANCHIS ETT)",
    "categoria": "Tratamento Térmico",
    "marca": "SANCHIS",
    "modelo": "ETT",
    "ano": 2011,
    "capacidade": "Câmara útil: 600 x 600 x 900mm; temperatura máx: 1050°C; capacidade: 150kg",
    "descricao": "Têmpera, cementação sólida, revenimento e normalização em aços carbono, ligas e ferramentas",
    "observacoes": "Temperatura máx 1050°C, carga 150kg",
    "normal": 42.95,
    "h50": 64.43,
    "h100": 85.9
  },
  {
    "id": "maq_forno_vertical",
    "nome": "Forno Elétrico Mufla Vertical Ø400x500mm (JB)",
    "categoria": "Tratamento Térmico",
    "marca": "JB",
    "modelo": "Mufla Vertical",
    "ano": 2019,
    "capacidade": "Câmara útil: Ø400 x 500mm; temperatura máx: 1200°C; capacidade: 100kg",
    "descricao": "Tratamento térmico de eixos verticais sem empenamento e fundição de peças em alumínio",
    "observacoes": "Temperatura máx 1200°C, carga 100kg",
    "normal": 42.95,
    "h50": 64.43,
    "h100": 85.9
  },
  {
    "id": "maq_tanque_resfriamento",
    "nome": "Tanque de Resfriamento com Agitação (Nardelli)",
    "categoria": "Tratamento Térmico",
    "marca": "Nardelli",
    "modelo": "Agitador Óleo/Salmoura",
    "ano": 2011,
    "capacidade": "Dimensões: Ø500 x 900mm; carga: 100kg",
    "descricao": "Resfriamento controlado de peças após saída do forno em óleo ou salmoura com agitação",
    "observacoes": "Resfriamento homogêneo para evitar trincas e empenamentos",
    "normal": 17.43,
    "h50": 26.15,
    "h100": 34.86
  },
  {
    "id": "maq_serra_fita_horiz",
    "nome": "Serra Fita Horizontal Ø330mm (RONEMAK M-330L)",
    "categoria": "Caldeiraria e Corte",
    "marca": "RONEMAK",
    "modelo": "M-330L",
    "ano": 1995,
    "capacidade": "Diâmetro máximo de corte a 90°: Ø330mm em barras e tubos",
    "descricao": "Cortes precisos de metais e tarugos maciços em escala industrial mantendo dimensões exatas",
    "observacoes": "Capacidade de corte Ø330mm",
    "normal": 20.73,
    "h50": 31.09,
    "h100": 41.46
  },
  {
    "id": "maq_guilhotina",
    "nome": "Corte a Frio com Guilhotina 2000x8mm (NEWTON TM10)",
    "categoria": "Caldeiraria e Corte",
    "marca": "NEWTON",
    "modelo": "TM10",
    "ano": 1998,
    "capacidade": "Largura útil de corte: 2000mm; espessura máx de chapa: 8,0mm em aço carbono",
    "descricao": "Corte de chapas metálicas com precisão linear sem perda de material",
    "observacoes": "Chapas até 2000 x 8mm",
    "normal": 17.43,
    "h50": 26.15,
    "h100": 34.86
  },
  {
    "id": "maq_corte_plasma",
    "nome": "Corte a Quente com Plasma e Maçarico",
    "categoria": "Caldeiraria e Corte",
    "marca": "Nardelli",
    "modelo": "Plasma / Oxi-corte",
    "ano": 2010,
    "capacidade": "Espessura até 3/4\" (19mm) em aço carbono e 5/8\" (16mm) em inox",
    "descricao": "Corte térmico rápido e de bom acabamento em qualquer metal condutor",
    "observacoes": "Corte de flanges, discos, chapas estruturais e bases",
    "normal": 28.3,
    "h50": 42.45,
    "h100": 56.61
  },
  {
    "id": "maq_prensa_180t",
    "nome": "Prensa Hidráulica 180t (NARDELLI 1200x2000mm)",
    "categoria": "Caldeiraria e Manutenção",
    "marca": "NARDELLI",
    "modelo": "180 Ton",
    "ano": 2015,
    "capacidade": "Mesa: 1200 x 2000mm; pressão máxima: 180 toneladas",
    "descricao": "Desmontagem e montagem de componentes industriais pesados, buchas, rolamentos, endireitamento de eixos e conformação",
    "observacoes": "Pressão máxima de 180t",
    "normal": 19.22,
    "h50": 28.82,
    "h100": 38.43
  },
  {
    "id": "maq_solda_mig_tig_eletr",
    "nome": "Soldagem MIG/MAG 440A, TIG e Eletrodo (ESAB EM 455i)",
    "categoria": "Caldeiraria e Solda",
    "marca": "ESAB",
    "modelo": "EM 455i",
    "ano": 2018,
    "capacidade": "MIG/MAG 440A contínuo, TIG 150A, Eletrodo revestido 425A",
    "descricao": "Alta produtividade para união estrutural, enchimento de eixos desgastados e recuperação de sedes",
    "observacoes": "Processo semiautomático contínuo de alta penetração",
    "normal": 29.09,
    "h50": 43.64,
    "h100": 58.18
  },
  {
    "id": "maq_manutencao_bancada",
    "nome": "Manutenção Mecânica / Bancada / Peritagem",
    "categoria": "Manutenção Industrial",
    "marca": "Nardelli",
    "modelo": "Bancada Especializada",
    "ano": 2020,
    "capacidade": "Subconjuntos até 3000kg (redutores, bombas, válvulas)",
    "descricao": "Peritagem dimensional, desmontagem, rebarbação, abertura manual de roscas, gravação técnica e montagem",
    "observacoes": "Equipe especializada em redutores, bombas e eixos",
    "normal": 17.43,
    "h50": 26.15,
    "h100": 34.86
  },
  {
    "id": "maq_jateamento",
    "nome": "Jateamento Abrasivo e Acabamento Superficial",
    "categoria": "Tratamento Superficial",
    "marca": "Nardelli",
    "modelo": "Cabine Abrasiva",
    "ano": 2015,
    "capacidade": "Limpeza de carepas, óxidos e preparação de superfície para pintura técnica",
    "descricao": "Remoção de carepas de tratamento térmico e oxidação com rugosidade controlada para ancoragem de tinta",
    "observacoes": "Acabamento superficial limpo e homogêneo",
    "normal": 20,
    "h50": 30,
    "h100": 40
  }
];

const CONFIG_PADRAO = {
  nomeEmpresa: "Nardelli Usinagem & Caldeiraria",
  cidade: "Aracaju/SE",
  telefone: "(79) 3211-0000",
  email: "contato@nardelliusinagem.com.br",
  despFixasInsumo: 0.15,
  impostoInsumo: 0.153,
  lucroInsumo: 0.15,
  despFixasMO: 0.30,
  impostoMO: 0.153,
  lucroMO: 0.30,
  custoKm: 1.22,
  margemDesconto: 0.03,
  jurosMensal: 0.015,
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  modeloRoteador: "google/gemini-2.5-flash",
  modeloGerador: "anthropic/claude-sonnet-5.5",
  modeloEconomico: "qwen/qwen3.8-max-prime",
  otimizarTokens: true,
  temperatura: 0.2
};

const { MOCK_CLIENTES, MOCK_ORCAMENTOS, MOCK_CONVERSAS } = require('./seedData');

const SEED_ORCAMENTOS = [];
const SEED_CONVERSAS = [];

class DatabaseService {
  constructor() {
    this.init();
  }

  init() {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      const hash = bcrypt.hashSync('nardelli123', 10);
      const dataInicial = {
        config: CONFIG_PADRAO,
        insumos: INSUMOS_INICIAIS,
        maquinas: MAQUINAS_INICIAIS,
        orcamentos: [],
        conversas: [],
        clientes: [],
        usuarios: [
          {
            id: 1,
            nome: "Administrador Nardelli",
            email: "admin@nardelliusinagem.com",
            senha_hash: hash,
            cargo: "Administrador",
            created_at: new Date().toISOString()
          }
        ],
        proximoNumero: 1
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(dataInicial, null, 2), 'utf-8');
    } else {
      const db = this.read();
      let alterado = false;
      if (!db.clientes) {
        db.clientes = [];
        alterado = true;
      }
      // Se a lista de clientes estiver vazia, migra clientes únicos dos orçamentos já existentes
      if (db.clientes.length === 0 && Array.isArray(db.orcamentos)) {
        for (const o of db.orcamentos) {
          if (o.cliente && o.cliente.nome && o.cliente.nome.trim() !== '') {
            const nomeNorm = o.cliente.nome.trim();
            if (!db.clientes.some(c => c.nome.toLowerCase() === nomeNorm.toLowerCase())) {
              db.clientes.push({
                id: 'cli_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                nome: nomeNorm,
                empresa: o.cliente.empresa || '',
                cnpj_cpf: o.cliente.cnpj_cpf || '',
                telefone: o.cliente.tel || o.cliente.telefone || '',
                email: o.cliente.email || '',
                endereco: o.cliente.endereco || '',
                contato: o.cliente.contato || '',
                observacoes: '',
                dataCadastro: o.dataCriacao || new Date().toISOString()
              });
              alterado = true;
            }
          }
        }
      }
      if (!db.usuarios || db.usuarios.length === 0) {
        const hash = bcrypt.hashSync('nardelli123', 10);
        db.usuarios = [
          {
            id: 1,
            nome: "Administrador Nardelli",
            email: "admin@nardelliusinagem.com",
            senha_hash: hash,
            cargo: "Administrador",
            created_at: new Date().toISOString()
          }
        ];
        alterado = true;
      }
      if (!db.conversas || db.conversas.length === 0) {
        db.conversas = SEED_CONVERSAS;
        alterado = true;
      }
      if (alterado) {
        this.write(db);
      }
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Erro ao ler DB:', e);
      return { config: CONFIG_PADRAO, insumos: INSUMOS_INICIAIS, maquinas: MAQUINAS_INICIAIS, orcamentos: [], conversas: [], usuarios: [] };
    }
  }

  write(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  getPostgresStatus() {
    return postgresService.getStatus();
  }

  // ===================== USUÁRIOS =====================
  async criarUsuario({ nome, email, senha, cargo = 'Técnico' }) {
    if (postgresService.isConnected()) {
      try {
        return await postgresService.criarUsuario({ nome, email, senha, cargo });
      } catch (e) {
        console.warn('Erro ao criar usuário no Postgres, gravando no JSON:', e.message);
      }
    }

    const db = this.read();
    if (!db.usuarios) db.usuarios = [];
    const emailNorm = email.toLowerCase().trim();
    if (db.usuarios.some(u => u.email.toLowerCase() === emailNorm)) {
      throw new Error('E-mail já cadastrado no sistema');
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const novoUsuario = {
      id: db.usuarios.length > 0 ? Math.max(...db.usuarios.map(u => u.id || 0)) + 1 : 1,
      nome,
      email: emailNorm,
      senha_hash: senhaHash,
      cargo,
      created_at: new Date().toISOString()
    };
    db.usuarios.push(novoUsuario);
    this.write(db);

    const { senha_hash, ...publicUser } = novoUsuario;
    return publicUser;
  }

  async buscarUsuarioPorEmail(email) {
    if (postgresService.isConnected()) {
      const userPg = await postgresService.buscarUsuarioPorEmail(email);
      if (userPg) return userPg;
    }
    const db = this.read();
    const emailNorm = (email || '').toLowerCase().trim();
    return (db.usuarios || []).find(u => u.email.toLowerCase() === emailNorm) || null;
  }

  async buscarUsuarioPorId(id) {
    if (postgresService.isConnected()) {
      const userPg = await postgresService.buscarUsuarioPorId(id);
      if (userPg) return userPg;
    }
    const db = this.read();
    const user = (db.usuarios || []).find(u => String(u.id) === String(id));
    if (!user) return null;
    const { senha_hash, ...publicUser } = user;
    return publicUser;
  }

  async listarUsuarios() {
    if (postgresService.isConnected()) {
      const usersPg = await postgresService.listarUsuarios();
      if (usersPg && usersPg.length > 0) return usersPg;
    }
    const db = this.read();
    return (db.usuarios || []).map(({ senha_hash, ...u }) => u);
  }

  // ===================== CONFIG =====================
  isModeloAprendizagemAtivo() {
    try {
      if (process.loadEnvFile) {
        process.loadEnvFile(path.join(__dirname, '..', '.env'));
      }
    } catch (e) {}

    const envVal = process.env.USAR_MODELO_APRENDIZAGEM ?? process.env.USAR_APRENDIZADO_ATIVO;
    if (envVal !== undefined && envVal !== null && String(envVal).trim() !== '') {
      const normalizado = String(envVal).trim().toLowerCase();
      return normalizado === 'true' || normalizado === '1' || normalizado === 'sim' || normalizado === 'yes';
    }
    return false;
  }

  getConfig() {
    const db = this.read();
    const cfg = { ...CONFIG_PADRAO, ...(db.config || {}) };
    if (!cfg.openrouterApiKey && process.env.OPENROUTER_API_KEY) {
      cfg.openrouterApiKey = process.env.OPENROUTER_API_KEY;
    }
    cfg.usarModeloAprendizagem = this.isModeloAprendizagemAtivo();
    return cfg;
  }

  saveConfig(newConfig) {
    const db = this.read();
    db.config = { ...db.config, ...newConfig };
    this.write(db);
    return db.config;
  }

  // ===================== INSUMOS =====================
  getInsumos() {
    return this.read().insumos || [];
  }

  saveInsumos(insumos) {
    const db = this.read();
    db.insumos = insumos;
    this.write(db);
    return db.insumos;
  }

  // ===================== MÁQUINAS =====================
  getMaquinas() {
    return this.read().maquinas || [];
  }

  saveMaquinas(maquinas) {
    const db = this.read();
    db.maquinas = maquinas;
    this.write(db);
    return db.maquinas;
  }

  // ===================== CLIENTES =====================
  async getClientes(busca = '') {
    if (postgresService.isConnected()) {
      const clisPg = await postgresService.listarClientes(busca);
      if (clisPg !== null) return clisPg;
    }

    const db = this.read();
    let lista = (db.clientes || []).slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    if (busca && busca.trim()) {
      const q = busca.toLowerCase().trim();
      lista = lista.filter(c =>
        (c.nome && c.nome.toLowerCase().includes(q)) ||
        (c.empresa && c.empresa.toLowerCase().includes(q)) ||
        (c.telefone && c.telefone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.cnpj_cpf && c.cnpj_cpf.includes(q))
      );
    }
    return lista;
  }

  async getClienteById(id) {
    if (postgresService.isConnected()) {
      const cliPg = await postgresService.buscarClientePorId(id);
      if (cliPg) return cliPg;
    }
    const db = this.read();
    return (db.clientes || []).find(c => c.id === id) || null;
  }

  async saveCliente(cliente) {
    if (!cliente.nome || !cliente.nome.trim()) {
      throw new Error('O nome do cliente é obrigatório.');
    }

    const db = this.read();
    if (!db.clientes) db.clientes = [];

    const nomeNorm = cliente.nome.trim();

    // Se não tiver ID, tenta achar por nome (case-insensitive) para atualizar ou cria novo
    let existente = null;
    if (cliente.id) {
      existente = db.clientes.find(c => c.id === cliente.id);
    } else {
      existente = db.clientes.find(c => (c.nome || '').toLowerCase().trim() === nomeNorm.toLowerCase());
    }

    const clienteFinal = {
      id: existente ? existente.id : (cliente.id || ('cli_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))),
      nome: nomeNorm,
      empresa: cliente.empresa !== undefined ? cliente.empresa : (existente?.empresa || ''),
      cnpj_cpf: cliente.cnpj_cpf !== undefined ? cliente.cnpj_cpf : (existente?.cnpj_cpf || ''),
      telefone: cliente.telefone !== undefined ? cliente.telefone : (cliente.tel !== undefined ? cliente.tel : (existente?.telefone || '')),
      email: cliente.email !== undefined ? cliente.email : (existente?.email || ''),
      endereco: cliente.endereco !== undefined ? cliente.endereco : (existente?.endereco || ''),
      cep: cliente.cep !== undefined ? cliente.cep : (existente?.cep || ''),
      contato: cliente.contato !== undefined ? cliente.contato : (existente?.contato || ''),
      observacoes: cliente.observacoes !== undefined ? cliente.observacoes : (existente?.observacoes || ''),
      dataCadastro: existente?.dataCadastro || new Date().toISOString(),
      dataAtualizacao: new Date().toISOString()
    };

    if (postgresService.isConnected()) {
      try {
        await postgresService.salvarCliente(clienteFinal);
      } catch (errPg) {
        console.warn('Erro ao salvar cliente no Postgres:', errPg.message);
      }
    }

    const idx = db.clientes.findIndex(c => c.id === clienteFinal.id);
    if (idx >= 0) {
      db.clientes[idx] = clienteFinal;
    } else {
      db.clientes.push(clienteFinal);
    }

    this.write(db);
    return clienteFinal;
  }

  async deleteCliente(id) {
    if (postgresService.isConnected()) {
      try {
        await postgresService.deletarCliente(id);
      } catch (errPg) {
        console.warn('Erro ao deletar cliente no Postgres:', errPg.message);
      }
    }
    const db = this.read();
    if (!db.clientes) return false;
    const initialLen = db.clientes.length;
    db.clientes = db.clientes.filter(c => c.id !== id);
    this.write(db);
    return db.clientes.length < initialLen;
  }

  // ===================== ORÇAMENTOS =====================
  async getOrcamentos(filtros = {}) {
    if (postgresService.isConnected()) {
      const pgOrcs = await postgresService.listarOrcamentos(filtros);
      if (pgOrcs !== null) return pgOrcs;
    }

    const db = this.read();
    let lista = (db.orcamentos || []).sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
    if (filtros.origem && filtros.origem !== 'todos') {
      lista = lista.filter(o => o.origem === filtros.origem);
    }
    return lista;
  }

  async getOrcamentoById(id) {
    if (postgresService.isConnected()) {
      const orcPg = await postgresService.buscarOrcamentoPorId(id);
      if (orcPg) return orcPg;
    }
    const db = this.read();
    return (db.orcamentos || []).find(o => o.id === id) || null;
  }

  async saveOrcamento(orcamento) {
    const db = this.read();
    if (!orcamento.id) {
      orcamento.id = 'orc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    if (!orcamento.numero) {
      const num = db.proximoNumero || (db.orcamentos.length + 1);
      orcamento.numero = String(num).padStart(4, '0');
      db.proximoNumero = num + 1;
    }
    if (!orcamento.dataCriacao) {
      orcamento.dataCriacao = new Date().toISOString();
    }
    if (!orcamento.origem) {
      orcamento.origem = 'manual';
    }

    // Salva ou atualiza automaticamente o cliente no cadastro (se informado e habilitado)
    if (orcamento.cliente && orcamento.cliente.nome && orcamento.cliente.nome.trim() !== '') {
      if (orcamento.salvarCliente !== false) {
        try {
          await this.saveCliente({
            nome: orcamento.cliente.nome,
            telefone: orcamento.cliente.tel || orcamento.cliente.telefone || '',
            endereco: orcamento.cliente.endereco || '',
            cep: orcamento.cliente.cep || '',
            email: orcamento.cliente.email || '',
            contato: orcamento.cliente.contato || '',
            empresa: orcamento.cliente.empresa || ''
          });
        } catch (e) {
          console.warn('Aviso ao sincronizar cadastro de cliente:', e.message);
        }
      }
    }

    // Identifica se este orçamento já existia para preservar versão original da IA
    const currentDb = this.read();
    if (!currentDb.orcamentos) currentDb.orcamentos = [];
    const indexExistente = currentDb.orcamentos.findIndex(o => o.id === orcamento.id);
    const existingOrc = indexExistente >= 0 ? currentDb.orcamentos[indexExistente] : null;

    if (!orcamento.versaoOriginalIA && existingOrc?.versaoOriginalIA) {
      orcamento.versaoOriginalIA = existingOrc.versaoOriginalIA;
    }

    // Se temos a versão gerada pela IA, detectamos automaticamente o que o humano alterou
    if (orcamento.versaoOriginalIA) {
      const analiseAjustes = this.calcularAjustesHumanos(orcamento.versaoOriginalIA, orcamento);
      if (analiseAjustes) {
        orcamento.ajustesHumano = analiseAjustes;
        orcamento.ajustadoManualmente = analiseAjustes.houveAjustes;
        if (analiseAjustes.houveAjustes || orcamento.revisadoPorHumano) {
          orcamento.revisadoPorHumano = true;
        }
      }
    } else if (['APROVADO', 'ENVIADO_AO_CLIENTE', 'EM_PRODUCAO', 'CONCLUIDO'].includes(orcamento.status)) {
      orcamento.revisadoPorHumano = true;
    }

    // Salva no PostgreSQL se conectado
    if (postgresService.isConnected()) {
      try {
        await postgresService.salvarOrcamento(orcamento);
      } catch (errPg) {
        console.warn('Erro ao salvar orcamento no PostgreSQL:', errPg.message);
      }
    }

    // Mantém JSON atualizado
    const dbAtualizado = this.read();
    if (!dbAtualizado.orcamentos) dbAtualizado.orcamentos = [];
    const index = dbAtualizado.orcamentos.findIndex(o => o.id === orcamento.id);
    if (index >= 0) {
      dbAtualizado.orcamentos[index] = { ...dbAtualizado.orcamentos[index], ...orcamento, dataAtualizacao: new Date().toISOString() };
    } else {
      dbAtualizado.orcamentos.unshift(orcamento);
    }

    this.write(dbAtualizado);
    return orcamento;
  }

  /**
   * Compara o que a IA gerou originalmente vs o que o orçamentista humano salvou
   */
  calcularAjustesHumanos(originalIA, atual) {
    if (!originalIA) return null;
    const insOrig = originalIA.itensInsumo || [];
    const maqOrig = originalIA.itensMaquina || [];
    const insAtual = atual.itensInsumo || [];
    const maqAtual = atual.itensMaquina || [];

    const diferencas = [];

    // 1. Modificações em máquinas e tempos
    for (const m of maqAtual) {
      const nomeM = (m.nome || m.maquina || '').toLowerCase().trim();
      const orig = maqOrig.find(o => {
        const nomeO = (o.nome || o.maquina || '').toLowerCase().trim();
        return nomeO === nomeM || (nomeO && nomeM && (nomeO.includes(nomeM) || nomeM.includes(nomeO)));
      });

      if (!orig) {
        diferencas.push(`Adicionou máquina: ${m.nome || m.maquina} (${m.horas || 0}h)`);
      } else if (Number(orig.horas || 0) !== Number(m.horas || 0)) {
        const delta = (Number(m.horas || 0) - Number(orig.horas || 0)).toFixed(1);
        const sinal = delta > 0 ? `+${delta}` : delta;
        diferencas.push(`${m.nome || m.maquina}: calibrado de ${orig.horas}h para ${m.horas}h (${sinal}h)`);
      }
    }

    for (const orig of maqOrig) {
      const nomeO = (orig.nome || orig.maquina || '').toLowerCase().trim();
      const aindaExiste = maqAtual.find(m => {
        const nomeM = (m.nome || m.maquina || '').toLowerCase().trim();
        return nomeM === nomeO || (nomeO && nomeM && (nomeM.includes(nomeO) || nomeO.includes(nomeM)));
      });
      if (!aindaExiste) {
        diferencas.push(`Removeu máquina sugerida: ${orig.nome || orig.maquina}`);
      }
    }

    // 2. Modificações em insumos
    for (const i of insAtual) {
      const nomeI = (i.nome || '').toLowerCase().trim();
      const orig = insOrig.find(o => (o.nome || '').toLowerCase().trim() === nomeI);
      if (!orig) {
        diferencas.push(`Adicionou insumo: ${i.nome} (${i.qtd} ${i.unidade || ''})`);
      } else if (Number(orig.qtd || 0) !== Number(i.qtd || 0)) {
        diferencas.push(`${i.nome}: quantidade ajustada de ${orig.qtd} para ${i.qtd}`);
      }
    }

    for (const orig of insOrig) {
      const nomeO = (orig.nome || '').toLowerCase().trim();
      const aindaExiste = insAtual.find(i => (i.nome || '').toLowerCase().trim() === nomeO);
      if (!aindaExiste) {
        diferencas.push(`Removeu insumo sugerido: ${orig.nome}`);
      }
    }

    if (diferencas.length === 0) {
      return {
        houveAjustes: false,
        totalModificacoes: 0,
        itensModificados: [],
        resumo: 'Aprovado sem alterações na prévia da IA.'
      };
    }

    return {
      houveAjustes: true,
      totalModificacoes: diferencas.length,
      itensModificados: diferencas,
      resumo: diferencas.slice(0, 3).join('; ') + (diferencas.length > 3 ? ` (+${diferencas.length - 3} alterações)` : '')
    };
  }

  /**
   * Retorna os orçamentos históricos validados por humanos para consulta rápida do JEV
   */
  async getOrcamentosValidadosParaTreino(limite = 15) {
    if (!this.isModeloAprendizagemAtivo()) {
      return [];
    }
    const todos = await this.getOrcamentos();
    const validados = todos.filter(o => {
      // Ignora qualquer dado de teste/seed
      if (o.isMock || o.origem === 'mock' || o.id?.startsWith('orc_000') || ['0001', '0002', '0003', '0004', '0005', '0006', '0007'].includes(o.numero)) {
        return false;
      }

      const temItens = (o.itensMaquina && o.itensMaquina.length > 0) || (o.itensInsumo && o.itensInsumo.length > 0);
      if (!temItens) return false;

      const revisado = o.revisadoPorHumano === true || o.ajustadoManualmente === true;
      const statusFinalizado = ['APROVADO', 'ENVIADO_AO_CLIENTE', 'EM_PRODUCAO', 'CONCLUIDO'].includes(o.status);

      return revisado && statusFinalizado;
    });

    return validados.slice(0, limite).map(o => ({
      id: o.id,
      numero: o.numero,
      descricao: o.descricaoServico || '',
      categoria: o.categoriaPeca || '',
      material: o.materialPeca || o.materialDefinido || '',
      tratamentoTermico: o.tratamentoTermico || 'Nenhum',
      quantidade: o.quantidadePecas || 1,
      maquinas: (o.itensMaquina || []).map(m => `${m.nome || m.maquina} (${m.horas}h)`),
      insumos: (o.itensInsumo || []).map(i => `${i.nome} (${i.qtd} ${i.unidade || ''})`),
      totalHoras: (o.itensMaquina || []).reduce((acc, m) => acc + (Number(m.horas) || 0), 0),
      ajustesHumano: o.ajustesHumano?.resumo || (o.ajustadoManualmente ? 'Calibrado manualmente por engenheiro' : 'Aprovado direto')
    }));
  }

  async deleteOrcamento(id) {
    if (postgresService.isConnected()) {
      try {
        await postgresService.deletarOrcamento(id);
      } catch (errPg) {
        console.warn('Erro ao deletar orcamento no Postgres:', errPg.message);
      }
    }
    const db = this.read();
    const initialLen = db.orcamentos.length;
    db.orcamentos = db.orcamentos.filter(o => o.id !== id);
    this.write(db);
    return db.orcamentos.length < initialLen;
  }

  // ===================== CONVERSAS DO CHATBOT & MONITOR META 24H =====================
  async getConversas() {
    if (postgresService.isConnected()) {
      const pgConvs = await postgresService.listarConversas();
      if (pgConvs !== null) return pgConvs;
    }
    const db = this.read();
    return (db.conversas || []).sort((a, b) => new Date(b.dataAtualizacao || 0) - new Date(a.dataAtualizacao || 0));
  }

  async getConversaById(id) {
    if (postgresService.isConnected()) {
      const convPg = await postgresService.buscarConversaPorId(id);
      if (convPg) return convPg;
    }
    const db = this.read();
    return (db.conversas || []).find(c => c.id === id) || null;
  }

  async saveConversa(conversa) {
    const db = this.read();
    if (!db.conversas) db.conversas = [];

    if (!conversa.id) {
      conversa.id = 'conv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    conversa.dataAtualizacao = new Date().toISOString();

    // Se ultimaMensagemClienteEm não estiver definido, infere da última mensagem do cliente
    if (!conversa.ultimaMensagemClienteEm) {
      const ultClienteMsg = (conversa.mensagens || []).slice().reverse().find(m => m.remetente === 'cliente');
      conversa.ultimaMensagemClienteEm = ultClienteMsg ? new Date().toISOString() : new Date().toISOString();
    }

    if (postgresService.isConnected()) {
      try {
        await postgresService.salvarConversa(conversa);
      } catch (errPg) {
        console.warn('Erro ao salvar conversa no Postgres:', errPg.message);
      }
    }

    const idx = db.conversas.findIndex(c => c.id === conversa.id);
    if (idx >= 0) {
      db.conversas[idx] = { ...db.conversas[idx], ...conversa };
    } else {
      db.conversas.unshift(conversa);
    }

    this.write(db);
    return conversa;
  }

  async deleteConversa(id) {
    const db = this.read();
    if (!db.conversas) return false;
    const initialLen = db.conversas.length;
    db.conversas = db.conversas.filter(c => c.id !== id);
    this.write(db);
    return db.conversas.length < initialLen;
  }
}

module.exports = new DatabaseService();
