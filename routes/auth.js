const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dbService = require('../services/dbService');
const postgresService = require('../services/postgresService');

const JWT_SECRET = process.env.JWT_SECRET || 'nardelli_usinagem_super_secret_jwt_key_2026';

/**
 * Middleware para autenticação via JWT
 */
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ sucesso: false, erro: 'Token de autenticação não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, usuario) => {
    if (err) {
      return res.status(403).json({ sucesso: false, erro: 'Token inválido ou expirado' });
    }
    req.usuario = usuario;
    next();
  });
}

/**
 * POST /api/auth/register
 * Cadastro de novo usuário
 */
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, cargo = 'Técnico' } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Nome, e-mail e senha são obrigatórios.'
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        sucesso: false,
        erro: 'A senha deve ter no mínimo 6 caracteres.'
      });
    }

    const usuario = await dbService.criarUsuario({ nome, email, senha, cargo });

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nome: usuario.nome, cargo: usuario.cargo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Usuário cadastrado com sucesso!',
      usuario,
      token
    });
  } catch (error) {
    console.error('Erro no cadastro de usuário:', error);
    return res.status(400).json({
      sucesso: false,
      erro: error.message || 'Falha ao cadastrar usuário.'
    });
  }
});

/**
 * POST /api/auth/login
 * Login de usuário com e-mail e senha
 */
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: 'E-mail e senha são obrigatórios.'
      });
    }

    const usuario = await dbService.buscarUsuarioPorEmail(email);
    if (!usuario) {
      return res.status(401).json({
        sucesso: false,
        erro: 'E-mail ou senha incorretos.'
      });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({
        sucesso: false,
        erro: 'E-mail ou senha incorretos.'
      });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nome: usuario.nome, cargo: usuario.cargo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { senha_hash, ...dadosUsuario } = usuario;

    return res.json({
      sucesso: true,
      mensagem: `Bem-vindo, ${usuario.nome}!`,
      usuario: dadosUsuario,
      token
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao realizar login.'
    });
  }
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário atualmente logado
 */
router.get('/me', autenticarToken, async (req, res) => {
  try {
    const usuario = await dbService.buscarUsuarioPorId(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado' });
    }
    return res.json({ sucesso: true, usuario });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * GET /api/auth/usuarios
 * Lista os usuários cadastrados
 */
router.get('/usuarios', async (req, res) => {
  try {
    const usuarios = await dbService.listarUsuarios();
    return res.json({ sucesso: true, usuarios });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * GET /api/auth/status-db
 * Retorna status da persistência (PostgreSQL vs JSON local)
 */
router.get('/status-db', (req, res) => {
  const status = dbService.getPostgresStatus();
  return res.json({
    sucesso: true,
    postgres: status,
    modoAtual: status.conectado ? 'PostgreSQL' : 'JSON Local com Fallback'
  });
});

/**
 * POST /api/auth/conectar-postgres
 * Permite configurar/conectar o PostgreSQL dinamicamente pela interface
 */
router.post('/conectar-postgres', async (req, res) => {
  try {
    const { url, host, port, user, password, database } = req.body;

    let config;
    if (url && url.trim()) {
      config = { connectionString: url.trim() };
    } else {
      config = {
        host: host || '127.0.0.1',
        port: parseInt(port || '5432', 10),
        user: user || 'postgres',
        password: password || '',
        database: database || 'nardelli'
      };
    }

    const resultado = await postgresService.init(config);
    return res.json({
      ...resultado,
      status: postgresService.getStatus()
    });
  } catch (error) {
    return res.status(400).json({
      sucesso: false,
      erro: error.message
    });
  }
});

module.exports = { router, autenticarToken };
