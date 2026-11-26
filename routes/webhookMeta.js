const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const metaWhatsappService = require('../services/metaWhatsappService');
const mediaProcessorService = require('../services/mediaProcessorService');
const chatbotService = require('../services/chatbotService');

// Cache em memória (TTL 15 min) para deduplicar retries de webhook da Meta por message.id (wamid)
const processedMessageIds = new Map();
const DEDUP_TTL_MS = 15 * 60 * 1000;

function isDuplicateMetaMessage(messageId) {
  if (!messageId) return false;
  const now = Date.now();
  if (processedMessageIds.size > 500) {
    for (const [id, ts] of processedMessageIds.entries()) {
      if (now - ts > DEDUP_TTL_MS) processedMessageIds.delete(id);
    }
  }
  const existingTs = processedMessageIds.get(messageId);
  if (existingTs && (now - existingTs) <= DEDUP_TTL_MS) {
    return true;
  }
  processedMessageIds.set(messageId, now);
  return false;
}

/**
 * WEBHOOK OFICIAL DA META WHATSAPP BUSINESS CLOUD API
 * - GET  /api/webhook/meta -> Verificação de assinatura da Meta (hub.challenge)
 * - POST /api/webhook/meta -> Recepção de mensagens (texto, áudio, imagem, documento, vídeo)
 *                             e eventos de Coexistência (smb_message_echoes)
 */

// 1. Verificação do Webhook pela Meta
router.get('/', (req, res) => {
  return metaWhatsappService.verifyWebhook(req, res);
});

// 2. Recepção de Eventos com validação criptográfica X-Hub-Signature-256
router.post(
  '/',
  (req, res, next) => metaWhatsappService.validateMetaSignature(req, res, next),
  async (req, res) => {
    const body = req.body;

    // Responde 200 OK imediatamente para cumprir o SLA rigoroso da Meta
    res.status(200).json({ status: 'EVENT_RECEIVED' });

    const hubChannel = String(req.headers['x-automatas-channel'] || '').trim().toLowerCase();
    if (hubChannel === 'instagram') return;

    if (body?.object !== 'whatsapp_business_account') return;

    try {
      const entries = Array.isArray(body.entry) ? body.entry : [];

      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];

        for (const change of changes) {
          const field = change.field;
          const value = change.value;
          if (!value) continue;

          const phoneNumberId = value.metadata?.phone_number_id
            ? String(value.metadata.phone_number_id)
            : undefined;

          // A. Ecos de mensagens enviadas pelo atendente no WhatsApp Business App (Coexistência)
          // Pausa automaticamente a IA para não atropelar o atendimento humano
          if (field === 'smb_message_echoes') {
            const echoes = Array.isArray(value.message_echoes) ? value.message_echoes : [];
            for (const echo of echoes) {
              const clientePhone = String(echo.to || '').replace(/\D/g, '');
              const texto = extrairTextoSimplesMeta(echo);
              if (clientePhone) {
                if (!dbService.isContatoPermitidoChatbot(clientePhone).permitido) {
                  console.log(`[Meta Filtro Teste] Echo ignorado para ${clientePhone} (fora da lista de contatos de teste).`);
                  continue;
                }
                console.log(`[Meta Echo] Atendente humano respondeu para ${clientePhone} -> pausando IA.`);
                await chatbotService.registrarInteracaoHumana({
                  phone: clientePhone,
                  texto,
                  origem: 'whatsapp_business_app'
                });
              }
            }
            continue;
          }

          // B. Eventos auxiliares de coexistência/ciclo de vida (apenas log)
          if (field === 'history' || field === 'smb_app_state_sync' || field === 'account_update') {
            console.log(`[Meta Webhook] Evento ${field} recebido.`);
            continue;
          }

          // C. Mensagens padrão recebidas de clientes
          if (!field || field === 'messages') {
            if (Array.isArray(value.statuses)) {
              for (const st of value.statuses) {
                if (st.status === 'failed' || Array.isArray(st.errors)) {
                  console.error(`[Meta Status] ❌ Falha no envio da mensagem ${st.id} para ${st.recipient_id}:`, JSON.stringify(st.errors || st));
                } else {
                  console.log(`[Meta Status] Mensagem ${st.id}: ${st.status}`);
                }
              }
            }

            if (Array.isArray(value.messages)) {
              const contactName = value.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

              for (const message of value.messages) {
                if (isDuplicateMetaMessage(message.id)) {
                  console.log(`[Meta Deduplicação] Mensagem ${message.id} já processada recentemente — ignorando retry da Meta.`);
                  continue;
                }
                await processarMensagemMetaRecebida({
                  message,
                  contactName,
                  phoneNumberId
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[Meta Webhook POST] Erro no processamento assíncrono:', err);
    }
  }
);

function extrairTextoSimplesMeta(message) {
  const type = message?.type;
  if (type === 'text') return message.text?.body || '';
  if (type === 'button') return message.button?.text || '';
  if (type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      '[Interação interativa]'
    );
  }
  if (type === 'image') return message.image?.caption || '';
  if (type === 'video') return message.video?.caption || '';
  if (type === 'document') return message.document?.caption || '';
  return '';
}

async function processarMensagemMetaRecebida({ message, contactName, phoneNumberId }) {
  const from = String(message.from || '').replace(/\D/g, '');
  const messageId = message.id;
  const type = message.type || 'text';

  if (!from) return;

  // Filtro de contatos permitidos (Modo Teste em número pessoal/compartilhado)
  const checagemTeste = dbService.isContatoPermitidoChatbot(from);
  if (!checagemTeste.permitido) {
    console.log(`[Meta Filtro Teste] Mensagem ignorada de ${contactName} (${from}) — fora da lista de contatos de teste.`);
    return;
  }

  console.log(`[Meta WhatsApp] Mensagem recebida de ${contactName} (${from}) | tipo=${type} | id=${messageId}`);

  // Marca como lida na Meta Cloud API
  metaWhatsappService.markAsRead(messageId, phoneNumberId).catch(() => {});

  try {
    // 1. TEXTO / BOTÃO / INTERATIVO
    if (type === 'text' || type === 'button' || type === 'interactive') {
      const content = extrairTextoSimplesMeta(message).trim();
      if (!content) return;

      chatbotService.enfileirarMensagem({
        phone: from,
        waId: from,
        senderName: contactName,
        phoneNumberId,
        messageId,
        messageType: 'text',
        content,
        hasVisualMedia: false
      });
      return;
    }

    // 2. ÁUDIO (PTT / voice / audio)
    if (type === 'audio' && message.audio?.id) {
      const downloaded = await metaWhatsappService.downloadMedia(message.audio.id);
      const processed = await mediaProcessorService.processarAudio({
        phone: from,
        buffer: downloaded.buffer,
        mimeType: message.audio.mime_type || downloaded.mimeType
      });

      chatbotService.enfileirarMensagem({
        phone: from,
        waId: from,
        senderName: contactName,
        phoneNumberId,
        messageId,
        ...processed
      });
      return;
    }

    // 3. VÍDEO
    if (type === 'video' && message.video?.id) {
      const downloaded = await metaWhatsappService.downloadMedia(message.video.id);
      const processed = await mediaProcessorService.processarVideo({
        phone: from,
        buffer: downloaded.buffer,
        mimeType: message.video.mime_type || downloaded.mimeType,
        caption: message.video.caption || ''
      });

      chatbotService.enfileirarMensagem({
        phone: from,
        waId: from,
        senderName: contactName,
        phoneNumberId,
        messageId,
        ...processed
      });
      return;
    }

    // 4. IMAGEM
    if (type === 'image' && message.image?.id) {
      const downloaded = await metaWhatsappService.downloadMedia(message.image.id);
      const processed = await mediaProcessorService.processarImagemOuDocumento({
        phone: from,
        buffer: downloaded.buffer,
        mimeType: message.image.mime_type || downloaded.mimeType,
        messageType: 'image',
        caption: message.image.caption || ''
      });

      chatbotService.enfileirarMensagem({
        phone: from,
        waId: from,
        senderName: contactName,
        phoneNumberId,
        messageId,
        ...processed
      });
      return;
    }

    // 5. DOCUMENTO (PDF, DXF, DWG, etc.)
    if (type === 'document' && message.document?.id) {
      const downloaded = await metaWhatsappService.downloadMedia(message.document.id);
      const processed = await mediaProcessorService.processarImagemOuDocumento({
        phone: from,
        buffer: downloaded.buffer,
        mimeType: message.document.mime_type || downloaded.mimeType,
        messageType: 'document',
        originalName: message.document.filename,
        caption: message.document.caption || ''
      });

      chatbotService.enfileirarMensagem({
        phone: from,
        waId: from,
        senderName: contactName,
        phoneNumberId,
        messageId,
        ...processed
      });
      return;
    }

    // Outros tipos (sticker, location, contacts, etc.)
    console.log(`[Meta WhatsApp] Tipo de mensagem não suportado para orçamento: ${type}`);
  } catch (err) {
    console.error(`[Meta WhatsApp] Erro ao processar mídia/mensagem (${type}) de ${from}:`, err.message);
    // Mesmo em caso de erro ao baixar mídia, avisa o debounce com fallback textual para não deixar o cliente sem resposta
    chatbotService.enfileirarMensagem({
      phone: from,
      waId: from,
      senderName: contactName,
      phoneNumberId,
      messageId,
      messageType: 'text',
      content: `[Cliente enviou um arquivo tipo ${type}, mas houve falha temporária ao baixar a mídia]`,
      hasVisualMedia: false
    });
  }
}

module.exports = router;
