// Simulador de Conversa do Chatbot (WhatsApp Inbound)
const exemplosMensagensClientes = [
  "Boa tarde! Preciso de um orçamento para recuperar o eixo de um britador de mandíbula. O diâmetro do assento é 110mm e tem 700mm de comprimento.",
  "Olá! Vocês fazem usinagem de buchas em bronze TM-23? Preciso de 6 peças Ø100xØ70x150mm com canal de lubrificação.",
  "Bom dia Nardelli! Gostaria de cotar a fabricação de uma engrenagem reta módulo 4 com 38 dentes em aço 4140 temperado.",
  "Preciso soldar uma flange de 4 polegadas classe 150 em um tubo sch 40 com teste de estanqueidade."
];

let exemploIdx = 0;

function simularEnvioCliente() {
  const input = document.getElementById('simuladorMsgInput');
  const msg = input.value.trim() || exemplosMensagensClientes[exemploIdx % exemplosMensagensClientes.length];
  exemploIdx++;

  input.value = '';
  adicionarMensagemChat(msg, 'user');

  // Adiciona indicador de digitando do bot
  const typingId = 'typing_' + Date.now();
  const chat = document.getElementById('simuladorChatMessages');
  const typingEl = document.createElement('div');
  typingEl.id = typingId;
  typingEl.className = 'chat-bubble bot';
  typingEl.textContent = 'Digitando e consultando o orçamentista IA...';
  chat.appendChild(typingEl);
  chat.scrollTop = chat.scrollHeight;

  // Dispara a requisição real para o backend inbound
  setTimeout(async () => {
    try {
      const res = await fetch('/api/inbound/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: {
            nome: 'Cliente WhatsApp ' + Math.floor(100 + Math.random() * 900),
            telefone: '(79) 9' + Math.floor(10000000 + Math.random() * 90000000),
            endereco: 'Aracaju/SE'
          },
          descricao: msg,
          origem: 'whatsapp_simulator',
          processarComIA: true
        })
      });

      const data = await res.json();
      document.getElementById(typingId)?.remove();

      if (data.sucesso) {
        adicionarMensagemChat(
          `Perfeito! Registrei seu pedido sob o orçamento #${data.numero}. Nossa IA já analisou a complexidade (${data.resumo?.complexidadeIA || 'PADRÃO'}) e enviou a prévia para validação do nosso técnico responsável. Em instantes confirmaremos o valor e prazo!`,
          'bot'
        );

        mostrarToast(`🔔 Novo orçamento #${data.numero} recebido do Chatbot! Adicionado à Fila de Revisão.`);
        if (typeof carregarListaOrcamentos === 'function') carregarListaOrcamentos();
        if (typeof atualizarKPIsGlobais === 'function') atualizarKPIsGlobais();
      } else {
        adicionarMensagemChat('Desculpe, ocorreu uma falha ao registrar seu orçamento: ' + data.erro, 'bot');
      }
    } catch (e) {
      document.getElementById(typingId)?.remove();
      adicionarMensagemChat('Erro de conexão ao processar o webhook do chatbot.', 'bot');
    }
  }, 900);
}

function adicionarMensagemChat(texto, autor) {
  const chat = document.getElementById('simuladorChatMessages');
  if (!chat) return;

  const div = document.createElement('div');
  div.className = `chat-bubble ${autor}`;
  div.textContent = texto;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function testarWebhookComPayloadExemplo() {
  mostrarToast('Disparando payload de teste para /api/inbound/chatbot...');
  try {
    const res = await fetch('/api/inbound/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente: {
          nome: "Usina Sergipe Bioenergia",
          telefone: "(79) 99122-3344",
          email: "manutencao@sergipebio.com.br",
          endereco: "Laranjeiras/SE"
        },
        descricao: "Recuperação de eixo ventilador industrial Ø95x1200mm com passe de acabamento nos colos de mancais",
        observacoes: "Equipamento parado na linha. Enviar prévia com máxima urgência.",
        prazoSolicitado: "3 dias úteis",
        origem: "typebot_webhook_test",
        processarComIA: true
      })
    });

    const data = await res.json();
    if (data.sucesso) {
      mostrarToast(`✅ Webhook processado com sucesso! Orçamento #${data.numero} criado na fila.`);
      if (typeof carregarListaOrcamentos === 'function') carregarListaOrcamentos();
      if (typeof atualizarKPIsGlobais === 'function') atualizarKPIsGlobais();
      showTab('fila-orcamentos');
    }
  } catch (e) {
    mostrarToast('Falha no webhook: ' + e.message);
  }
}
