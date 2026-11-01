const path = require('path');

// Carrega variáveis do arquivo .env nativamente (Node.js 20+)
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (e) {
  // Arquivo .env opcional
}

const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');
const inboundRouter = require('./routes/inbound');
const { router: authRouter } = require('./routes/auth');
const webhookSiteRouter = require('./routes/webhookSite');
const dbService = require('./services/dbService');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Rotas da API
app.use('/api/auth', authRouter);
app.use('/api/webhook/site', webhookSiteRouter);
app.use('/api/inbound', inboundRouter);
app.use('/api', apiRouter);

// Fallback para SPA
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ erro: 'Rota não encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Nardelli Usinagem — Dashboard de Orçamentos com IA Ativo!`);
  console.log(`📍 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`🤖 Entrada Inbound para Chatbot: http://localhost:${PORT}/api/inbound/chatbot`);
  console.log(`📑 Documentação da API do Chatbot: http://localhost:${PORT}/api/inbound/docs`);
  console.log(`=============================================================\n`);
});
