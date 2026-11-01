const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

class PostgresService {
  constructor() {
    this.pool = null;
    this.connected = false;
    this.connectionConfig = null;
    this.lastError = null;

    // Tenta inicializar com variáveis de ambiente se presentes
    const envUrl = process.env.DATABASE_URL;
    if (envUrl) {
      this.init({ connectionString: envUrl });
    } else if (process.env.PG_HOST || process.env.PGHOST) {
      this.init({
        host: process.env.PG_HOST || process.env.PGHOST || '127.0.0.1',
        port: parseInt(process.env.PG_PORT || process.env.PGPORT || '5432', 10),
        user: process.env.PG_USER || process.env.PGUSER || 'postgres',
        password: process.env.PG_PASSWORD || process.env.PGPASSWORD || '',
        database: process.env.PG_DATABASE || process.env.PGDATABASE || 'nardelli'
      });
    }
  }

  /**
   * Conecta ou reconecta ao banco Postgres com a configuração fornecida
   */
  async init(config) {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (e) {
        // ignora
      }
    }

    try {
      this.connectionConfig = config;
      this.pool = new Pool({
        ...config,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10
      });

      // Testa conexão
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.connected = true;
      this.lastError = null;
      console.log('✅ PostgreSQL conectado com sucesso!');

      // Executa migração das tabelas
      await this.runMigrations();
      return { sucesso: true, mensagem: 'Conectado com sucesso ao PostgreSQL' };
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      console.warn('⚠️ PostgreSQL não conectado:', err.message, '-> Sistema operando em modo Local JSON com fallback.');
      return { sucesso: false, erro: err.message };
    }
  }

  isConnected() {
    return this.connected && this.pool !== null;
  }

  getStatus() {
    return {
      conectado: this.isConnected(),
      ultimoErro: this.lastError,
      config: this.connectionConfig ? {
        host: this.connectionConfig.host || 'via URL',
        port: this.connectionConfig.port || 5432,
        user: this.connectionConfig.user || '***',
        database: this.connectionConfig.database || '***'
      } : null
    };
  }

  /**
   * Cria tabelas e esquemas necessários
   */
  async runMigrations() {
    if (!this.isConnected()) return;

    const queries = [
      // 1. Tabela de Usuários
      `CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(150) NOT NULL,
        email VARCHAR(180) UNIQUE NOT NULL,
        senha_hash VARCHAR(255) NOT NULL,
        cargo VARCHAR(80) DEFAULT 'Tecnico',
        ativo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // 2. Tabela de Orçamentos
      `CREATE TABLE IF NOT EXISTS orcamentos (
        id VARCHAR(80) PRIMARY KEY,
        numero VARCHAR(20) NOT NULL,
        origem VARCHAR(50) NOT NULL DEFAULT 'manual', -- 'manual', 'site', 'whatsapp'
        canal_origem VARCHAR(80) DEFAULT 'manual',
        status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE_REVISAO',
        cliente_nome VARCHAR(200),
        cliente_tel VARCHAR(50),
        cliente_email VARCHAR(180),
        cliente_endereco TEXT,
        cliente_contato VARCHAR(150),
        descricao_servico TEXT,
        observacoes TEXT,
        arquivos JSONB DEFAULT '[]'::jsonb,
        itens_insumo JSONB DEFAULT '[]'::jsonb,
        itens_maquina JSONB DEFAULT '[]'::jsonb,
        mo_escritorio NUMERIC(10,2) DEFAULT 40.00,
        frete JSONB DEFAULT '{}'::jsonb,
        parcelamento JSONB DEFAULT '{}'::jsonb,
        analise_ia JSONB DEFAULT '{}'::jsonb,
        totais JSONB DEFAULT '{}'::jsonb,
        versao_original_ia JSONB DEFAULT NULL,
        revisado_por_humano BOOLEAN DEFAULT FALSE,
        ajustado_manualmente BOOLEAN DEFAULT FALSE,
        ajustes_humano JSONB DEFAULT '{}'::jsonb,
        referencia_historica JSONB DEFAULT '{}'::jsonb,
        data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // Migrações seguras de colunas de Aprendizado Ativo da IA
      `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS versao_original_ia JSONB DEFAULT NULL;`,
      `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS revisado_por_humano BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS ajustado_manualmente BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS ajustes_humano JSONB DEFAULT '{}'::jsonb;`,
      `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS referencia_historica JSONB DEFAULT '{}'::jsonb;`,

      // 3. Tabela de Conversas (com controle da janela 24h da Meta)
      `CREATE TABLE IF NOT EXISTS conversas (
        id VARCHAR(80) PRIMARY KEY,
        cliente_nome VARCHAR(200),
        cliente_telefone VARCHAR(50),
        cliente_empresa VARCHAR(200),
        status VARCHAR(50) DEFAULT 'pendente',
        orcamento_id VARCHAR(80),
        orcamento_numero VARCHAR(20),
        descricao_servico TEXT,
        mensagens JSONB DEFAULT '[]'::jsonb,
        ultima_mensagem_cliente_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        canal_origem VARCHAR(80) DEFAULT 'whatsapp',
        data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // 4. Catálogo de Insumos
      `CREATE TABLE IF NOT EXISTS catalogo_insumos (
        id VARCHAR(80) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        fornecedor VARCHAR(150),
        unidade VARCHAR(30) DEFAULT 'UN',
        preco NUMERIC(10,4) NOT NULL DEFAULT 0.00
      );`,

      // 5. Catálogo de Máquinas
      `CREATE TABLE IF NOT EXISTS catalogo_maquinas (
        id VARCHAR(80) PRIMARY KEY,
        nome VARCHAR(150) NOT NULL,
        normal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        h50 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        h100 NUMERIC(10,2) NOT NULL DEFAULT 0.00
      );`,

      // 6. Configurações gerais
      `CREATE TABLE IF NOT EXISTS configuracoes (
        chave VARCHAR(100) PRIMARY KEY,
        valor JSONB NOT NULL
      );`,

      // 7. Tabela de Clientes Cadastrados
      `CREATE TABLE IF NOT EXISTS clientes (
        id VARCHAR(80) PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        empresa VARCHAR(200),
        cnpj_cpf VARCHAR(50),
        telefone VARCHAR(50),
        email VARCHAR(180),
        endereco TEXT,
        contato VARCHAR(150),
        observacoes TEXT,
        data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep VARCHAR(20);`,
      `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS cliente_cep VARCHAR(20);`
    ];

    for (const q of queries) {
      await this.pool.query(q);
    }

    // Cria usuário admin padrão se não houver usuários
    const userCountRes = await this.pool.query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(userCountRes.rows[0].count, 10) === 0) {
      const hash = await bcrypt.hash('nardelli123', 10);
      await this.pool.query(
        `INSERT INTO usuarios (nome, email, senha_hash, cargo) VALUES ($1, $2, $3, $4)`,
        ['Administrador Nardelli', 'admin@nardelliusinagem.com', hash, 'Administrador']
      );
      console.log('👤 Usuário admin inicial cadastrado no PostgreSQL: admin@nardelliusinagem.com / nardelli123');
    }
  }

  // ===================== USUÁRIOS =====================
  async criarUsuario({ nome, email, senha, cargo = 'Técnico' }) {
    if (!this.isConnected()) throw new Error('PostgreSQL desconectado');
    const existing = await this.pool.query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      throw new Error('E-mail já cadastrado no sistema');
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const res = await this.pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, cargo) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, cargo, created_at`,
      [nome, email.toLowerCase().trim(), senhaHash, cargo]
    );
    return res.rows[0];
  }

  async buscarUsuarioPorEmail(email) {
    if (!this.isConnected()) return null;
    const res = await this.pool.query('SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE', [email.toLowerCase().trim()]);
    return res.rows[0] || null;
  }

  async buscarUsuarioPorId(id) {
    if (!this.isConnected()) return null;
    const res = await this.pool.query('SELECT id, nome, email, cargo, created_at FROM usuarios WHERE id = $1 AND ativo = TRUE', [id]);
    return res.rows[0] || null;
  }

  async listarUsuarios() {
    if (!this.isConnected()) return [];
    const res = await this.pool.query('SELECT id, nome, email, cargo, created_at FROM usuarios ORDER BY nome ASC');
    return res.rows;
  }

  // ===================== ORÇAMENTOS =====================
  async listarOrcamentos(filtros = {}) {
    if (!this.isConnected()) return null;
    let query = 'SELECT * FROM orcamentos';
    const params = [];
    if (filtros.origem && filtros.origem !== 'todos') {
      params.push(filtros.origem);
      query += ` WHERE origem = $1`;
    }
    query += ' ORDER BY data_criacao DESC';
    const res = await this.pool.query(query, params);
    return res.rows.map(this.mapOrcamentoFromRow);
  }

  async buscarOrcamentoPorId(id) {
    if (!this.isConnected()) return null;
    const res = await this.pool.query('SELECT * FROM orcamentos WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapOrcamentoFromRow(res.rows[0]);
  }

  async salvarOrcamento(orc) {
    if (!this.isConnected()) return null;

    const query = `
      INSERT INTO orcamentos (
        id, numero, origem, canal_origem, status,
        cliente_nome, cliente_tel, cliente_email, cliente_endereco, cliente_contato,
        descricao_servico, observacoes, arquivos, itens_insumo, itens_maquina,
        mo_escritorio, frete, parcelamento, analise_ia, totais,
        versao_original_ia, revisado_por_humano, ajustado_manualmente, ajustes_humano, referencia_historica,
        data_criacao, data_atualizacao
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW())
      ON CONFLICT (id) DO UPDATE SET
        numero = EXCLUDED.numero,
        origem = EXCLUDED.origem,
        canal_origem = EXCLUDED.canal_origem,
        status = EXCLUDED.status,
        cliente_nome = EXCLUDED.cliente_nome,
        cliente_tel = EXCLUDED.cliente_tel,
        cliente_email = EXCLUDED.cliente_email,
        cliente_endereco = EXCLUDED.cliente_endereco,
        cliente_contato = EXCLUDED.cliente_contato,
        descricao_servico = EXCLUDED.descricao_servico,
        observacoes = EXCLUDED.observacoes,
        arquivos = EXCLUDED.arquivos,
        itens_insumo = EXCLUDED.itens_insumo,
        itens_maquina = EXCLUDED.itens_maquina,
        mo_escritorio = EXCLUDED.mo_escritorio,
        frete = EXCLUDED.frete,
        parcelamento = EXCLUDED.parcelamento,
        analise_ia = EXCLUDED.analise_ia,
        totais = EXCLUDED.totais,
        versao_original_ia = COALESCE(EXCLUDED.versao_original_ia, orcamentos.versao_original_ia),
        revisado_por_humano = EXCLUDED.revisado_por_humano,
        ajustado_manualmente = EXCLUDED.ajustado_manualmente,
        ajustes_humano = EXCLUDED.ajustes_humano,
        referencia_historica = EXCLUDED.referencia_historica,
        data_atualizacao = NOW()
      RETURNING *;
    `;

    const values = [
      orc.id,
      orc.numero,
      orc.origem || 'manual',
      orc.canalOrigem || orc.origem || 'manual',
      orc.status || 'PENDENTE_REVISAO',
      orc.cliente?.nome || '',
      orc.cliente?.tel || '',
      orc.cliente?.email || '',
      orc.cliente?.endereco || '',
      orc.cliente?.contato || '',
      orc.descricaoServico || '',
      orc.observacoes || '',
      JSON.stringify(orc.arquivos || []),
      JSON.stringify(orc.itensInsumo || []),
      JSON.stringify(orc.itensMaquina || []),
      parseFloat(orc.moEscritorio) || 40.00,
      JSON.stringify(orc.frete || {}),
      JSON.stringify(orc.parcelamento || {}),
      JSON.stringify(orc.analiseIA || {}),
      JSON.stringify(orc.totais || {}),
      orc.versaoOriginalIA ? JSON.stringify(orc.versaoOriginalIA) : null,
      !!orc.revisadoPorHumano,
      !!orc.ajustadoManualmente,
      JSON.stringify(orc.ajustesHumano || {}),
      JSON.stringify(orc.referenciaHistorica || {}),
      orc.dataCriacao || new Date().toISOString()
    ];

    const res = await this.pool.query(query, values);
    return this.mapOrcamentoFromRow(res.rows[0]);
  }

  async deletarOrcamento(id) {
    if (!this.isConnected()) return false;
    const res = await this.pool.query('DELETE FROM orcamentos WHERE id = $1', [id]);
    return res.rowCount > 0;
  }

  // ===================== CONVERSAS & MONITOR 24H =====================
  async listarConversas() {
    if (!this.isConnected()) return null;
    const res = await this.pool.query('SELECT * FROM conversas ORDER BY data_atualizacao DESC');
    return res.rows.map(this.mapConversaFromRow);
  }

  async buscarConversaPorId(id) {
    if (!this.isConnected()) return null;
    const res = await this.pool.query('SELECT * FROM conversas WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapConversaFromRow(res.rows[0]);
  }

  async salvarConversa(conv) {
    if (!this.isConnected()) return null;

    const query = `
      INSERT INTO conversas (
        id, cliente_nome, cliente_telefone, cliente_empresa, status,
        orcamento_id, orcamento_numero, descricao_servico, mensagens,
        ultima_mensagem_cliente_em, canal_origem, data_atualizacao
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE SET
        cliente_nome = EXCLUDED.cliente_nome,
        cliente_telefone = EXCLUDED.cliente_telefone,
        cliente_empresa = EXCLUDED.cliente_empresa,
        status = EXCLUDED.status,
        orcamento_id = EXCLUDED.orcamento_id,
        orcamento_numero = EXCLUDED.orcamento_numero,
        descricao_servico = EXCLUDED.descricao_servico,
        mensagens = EXCLUDED.mensagens,
        ultima_mensagem_cliente_em = EXCLUDED.ultima_mensagem_cliente_em,
        canal_origem = EXCLUDED.canal_origem,
        data_atualizacao = NOW()
      RETURNING *;
    `;

    const values = [
      conv.id,
      conv.cliente?.nome || '',
      conv.cliente?.telefone || '',
      conv.cliente?.empresa || '',
      conv.status || 'pendente',
      conv.orcamentoId || null,
      conv.orcamentoNumero || null,
      conv.descricaoServico || '',
      JSON.stringify(conv.mensagens || []),
      conv.ultimaMensagemClienteEm ? new Date(conv.ultimaMensagemClienteEm).toISOString() : new Date().toISOString(),
      conv.canalOrigem || 'whatsapp'
    ];

    const res = await this.pool.query(query, values);
    return this.mapConversaFromRow(res.rows[0]);
  }

  // ===================== CLIENTES =====================
  async listarClientes(busca = '') {
    if (!this.isConnected()) return null;
    let query = 'SELECT * FROM clientes';
    const values = [];
    if (busca && busca.trim()) {
      query += ' WHERE LOWER(nome) LIKE $1 OR LOWER(empresa) LIKE $1 OR telefone LIKE $1 OR LOWER(email) LIKE $1 OR cnpj_cpf LIKE $1';
      values.push(`%${busca.toLowerCase().trim()}%`);
    }
    query += ' ORDER BY nome ASC';
    const res = await this.pool.query(query, values);
    return res.rows.map(this.mapClienteFromRow);
  }

  async buscarClientePorId(id) {
    if (!this.isConnected()) return null;
    const res = await this.pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
    return res.rows.length ? this.mapClienteFromRow(res.rows[0]) : null;
  }

  async salvarCliente(c) {
    if (!this.isConnected()) return null;
    const query = `
      INSERT INTO clientes (id, nome, empresa, cnpj_cpf, telefone, email, endereco, cep, contato, observacoes, data_cadastro, data_atualizacao)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        empresa = EXCLUDED.empresa,
        cnpj_cpf = EXCLUDED.cnpj_cpf,
        telefone = EXCLUDED.telefone,
        email = EXCLUDED.email,
        endereco = EXCLUDED.endereco,
        cep = EXCLUDED.cep,
        contato = EXCLUDED.contato,
        observacoes = EXCLUDED.observacoes,
        data_atualizacao = NOW()
      RETURNING *;
    `;
    const values = [
      c.id,
      c.nome,
      c.empresa || '',
      c.cnpj_cpf || '',
      c.telefone || c.tel || '',
      c.email || '',
      c.endereco || '',
      c.cep || '',
      c.contato || '',
      c.observacoes || '',
      c.dataCadastro ? new Date(c.dataCadastro).toISOString() : new Date().toISOString()
    ];
    const res = await this.pool.query(query, values);
    return this.mapClienteFromRow(res.rows[0]);
  }

  async deletarCliente(id) {
    if (!this.isConnected()) return false;
    const res = await this.pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    return res.rowCount > 0;
  }

  mapClienteFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      nome: row.nome,
      empresa: row.empresa || '',
      cnpj_cpf: row.cnpj_cpf || '',
      telefone: row.telefone || '',
      email: row.email || '',
      endereco: row.endereco || '',
      cep: row.cep || '',
      contato: row.contato || '',
      observacoes: row.observacoes || '',
      dataCadastro: row.data_cadastro,
      dataAtualizacao: row.data_atualizacao
    };
  }

  // ===================== HELPERS DE MAPEAMENTO =====================
  mapOrcamentoFromRow(row) {
    return {
      id: row.id,
      numero: row.numero,
      origem: row.origem,
      canalOrigem: row.canal_origem,
      status: row.status,
      dataCriacao: row.data_criacao,
      dataAtualizacao: row.data_atualizacao,
      cliente: {
        nome: row.cliente_nome || '',
        tel: row.cliente_tel || '',
        email: row.cliente_email || '',
        endereco: row.cliente_endereco || '',
        contato: row.cliente_contato || ''
      },
      descricaoServico: row.descricao_servico || '',
      observacoes: row.observacoes || '',
      arquivos: row.arquivos || [],
      itensInsumo: row.itens_insumo || [],
      itensMaquina: row.itens_maquina || [],
      moEscritorio: parseFloat(row.mo_escritorio) || 0,
      frete: row.frete || {},
      parcelamento: row.parcelamento || {},
      analiseIA: row.analise_ia || {},
      totais: row.totais || {},
      versaoOriginalIA: row.versao_original_ia || null,
      revisadoPorHumano: !!row.revisado_por_humano,
      ajustadoManualmente: !!row.ajustado_manualmente,
      ajustesHumano: row.ajustes_humano || {},
      referenciaHistorica: row.referencia_historica || null
    };
  }

  mapConversaFromRow(row) {
    return {
      id: row.id,
      cliente: {
        nome: row.cliente_nome,
        telefone: row.cliente_telefone,
        empresa: row.cliente_empresa
      },
      status: row.status,
      orcamentoId: row.orcamento_id,
      orcamentoNumero: row.orcamento_numero,
      descricaoServico: row.descricao_servico,
      mensagens: row.mensagens || [],
      ultimaMensagemClienteEm: row.ultima_mensagem_cliente_em,
      canalOrigem: row.canal_origem,
      dataCriacao: row.data_criacao,
      dataAtualizacao: row.data_atualizacao
    };
  }
}

module.exports = new PostgresService();
