const crypto = require('crypto');
const dbService = require('./dbService');

/**
 * Serviço Oficial da Meta WhatsApp Business Cloud API
 * Baseado na arquitetura de integração oficial (Graph API v24.0+, HMAC-SHA256, Coexistência e Download de Mídias)
 */
class MetaWhatsAppService {
  /**
   * Obtém credenciais ativas da Meta (prioriza configuração salva no sistema com fallback para .env)
   */
  getMetaConfig() {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    return {
      verifyToken:
        cfg.metaVerifyToken ||
        process.env.META_VERIFY_TOKEN ||
        'nardelli_meta_verify_2026',
      accessToken:
        cfg.metaAccessToken ||
        process.env.META_ACCESS_TOKEN ||
        '',
      phoneNumberId:
        cfg.metaPhoneNumberId ||
        process.env.META_PHONE_NUMBER_ID ||
        '',
      appSecret:
        cfg.metaAppSecret ||
        process.env.META_APP_SECRET ||
        '',
      apiVersion:
        cfg.metaApiVersion ||
        process.env.META_API_VERSION ||
        'v24.0',
      appId:
        cfg.metaAppId ||
        process.env.META_APP_ID ||
        process.env.NEXT_PUBLIC_META_APP_ID ||
        '',
      configId:
        cfg.metaConfigId ||
        process.env.META_CONFIG_ID ||
        process.env.NEXT_PUBLIC_META_CONFIG_ID ||
        '',
      wabaId:
        cfg.metaWabaId ||
        process.env.META_WABA_ID ||
        '',
      businessId:
        cfg.metaBusinessId ||
        process.env.META_BUSINESS_ID ||
        ''
    };
  }

  getHubConfig() {
    const cfg = dbService.getConfig ? dbService.getConfig() : {};
    const hubUrl = String(cfg.automatasHubUrl || process.env.AUTOMATAS_HUB_URL || '')
      .trim()
      .replace(/\/+$/, '');
    const siteUrl = String(cfg.automatasSiteUrl || process.env.AUTOMATAS_SITE_URL || 'https://automatas.tech')
      .trim()
      .replace(/\/+$/, '');
    const loginJwt = String(cfg.automatasLoginJwt || process.env.AUTOMATAS_LOGIN_JWT || '').trim();
    const apiKey = String(cfg.automatasProjectApiKey || process.env.AUTOMATAS_PROJECT_API_KEY || '').trim();
    const webhookUrl = String(cfg.automatasWebhookUrl || process.env.AUTOMATAS_WEBHOOK_URL || '').trim();
    const webhookSecret = String(cfg.automatasWebhookSecret || process.env.AUTOMATAS_WEBHOOK_SECRET || '').trim();
    const hasApiKey = Boolean(apiKey);
    const hasLoginJwt = Boolean(loginJwt);
    return {
      enabled: Boolean(hubUrl && (hasApiKey || hasLoginJwt)),
      hubUrl,
      siteUrl,
      loginJwt,
      apiKey,
      webhookUrl,
      webhookSecret,
      hasApiKey,
      hasLoginJwt
    };
  }

  buildHubHeaders(hub, { preferJwt = false, headers = {} } = {}) {
    const out = { ...headers };
    if (preferJwt) {
      if (hub.loginJwt) out['x-project-jwt'] = hub.loginJwt;
      else if (hub.apiKey) out['x-api-key'] = hub.apiKey;
      return out;
    }
    if (hub.apiKey) {
      out['x-api-key'] = hub.apiKey;
    } else if (hub.loginJwt) {
      out['x-project-jwt'] = hub.loginJwt;
    }
    return out;
  }

  resolveAccountToken(phoneNumberId, overrideToken) {
    if (overrideToken && String(overrideToken).trim()) {
      return String(overrideToken).trim();
    }
    if (phoneNumberId && dbService.getWhatsappAccountToken) {
      const accToken = dbService.getWhatsappAccountToken(String(phoneNumberId).trim());
      if (accToken) return accToken;
    }
    return (this.getMetaConfig().accessToken || '').trim();
  }

  /**
   * Normaliza telefone para dígitos puros (ex: 5579999999999)
   */
  normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 11 && !digits.startsWith('55')) {
      digits = '55' + digits;
    }
    return digits;
  }

  /**
   * Divide textos longos respeitando o limite oficial de 4096 caracteres da Meta Cloud API
   */
  splitMessage(text, maxLen = 4000) {
    const str = String(text || '');
    if (str.length <= maxLen) return [str];
    const partes = [];
    let restante = str;
    while (restante.length > maxLen) {
      let corte = restante.lastIndexOf('\n', maxLen);
      if (corte < maxLen * 0.5) corte = restante.lastIndexOf(' ', maxLen);
      if (corte < maxLen * 0.5) corte = maxLen;
      partes.push(restante.slice(0, corte).trim());
      restante = restante.slice(corte).trim();
    }
    if (restante) partes.push(restante);
    return partes;
  }

  /**
   * Testa a conexão oficial com a Meta Graph API e retorna dados do número cadastrado
   */
  async testConnection({ phoneNumberId: overridePhoneId } = {}) {
    const hub = this.getHubConfig();
    if (!hub.hasApiKey) {
      return {
        sucesso: false,
        erro: 'Configure a API Key do projeto (aut_live_...) do Automatas Hub para testar a conexão WhatsApp.'
      };
    }
    try {
      const q = overridePhoneId ? `?phoneNumberId=${encodeURIComponent(overridePhoneId)}` : '';
      const resp = await fetch(`${hub.hubUrl}/api/hub/v1/phone/test${q}`, {
        headers: this.buildHubHeaders(hub),
        signal: AbortSignal.timeout(15000)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success === false) {
        return {
          sucesso: false,
          erro: data.error || `Erro HTTP ${resp.status} no Hub Automatas`,
          codigoErro: data.code || null
        };
      }
      return {
        sucesso: true,
        id: data.id || overridePhoneId || '',
        displayPhoneNumber: data.displayPhoneNumber || '',
        verifiedName: data.verifiedName || '',
        qualityRating: data.qualityRating || 'UNKNOWN',
        status: data.status || 'CONNECTED'
      };
    } catch (err) {
      return { sucesso: false, erro: `Falha ao testar via Automatas Hub: ${err.message}` };
    }
  }

  /**
   * Validação de assinatura criptográfica da Meta (X-Hub-Signature-256)
   * Protege o endpoint POST contra requisições forjadas usando crypto.timingSafeEqual
   */
  validateMetaSignature(req, res, next) {
    // 1. Se a requisição veio roteada pelo Hub Automatas.tech, valida X-Automatas-Signature quando configurada
    if (req.headers['x-automatas-hub'] === '1' || req.headers['x-automatas-signature']) {
      const hub = this.getHubConfig();
      const hubSig = req.headers['x-automatas-signature'];
      if (!hub.webhookSecret) {
        return next();
      }
      if (!hubSig || typeof hubSig !== 'string') {
        return res.status(401).json({ erro: 'Assinatura X-Automatas-Signature ausente.' });
      }
      if (!req.rawBody) {
        return res.status(500).json({ erro: 'rawBody ausente para validar assinatura do Hub.' });
      }
      try {
        const expected =
          'sha256=' + crypto.createHmac('sha256', hub.webhookSecret).update(req.rawBody).digest('hex');
        const expBuf = Buffer.from(expected, 'utf8');
        const sigBuf = Buffer.from(hubSig, 'utf8');
        if (expBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expBuf, sigBuf)) {
          return res.status(401).json({ erro: 'Assinatura do Automatas Hub inválida.' });
        }
        return next();
      } catch (err) {
        return res.status(500).json({ erro: 'Falha ao validar assinatura do Hub: ' + err.message });
      }
    }

    const { appSecret } = this.getMetaConfig();
    const signatureHeader = req.headers['x-hub-signature-256'];

    // Modo permissivo se META_APP_SECRET não estiver configurado ainda
    if (!appSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('[Meta Segurança] META_APP_SECRET não configurado em produção! Configure para validar X-Hub-Signature-256.');
      }
      return next();
    }

    if (!signatureHeader || typeof signatureHeader !== 'string') {
      console.warn('[Meta Segurança] POST /api/webhook/meta rejeitado: cabeçalho X-Hub-Signature-256 ausente.');
      return res.status(401).json({ erro: 'Assinatura X-Hub-Signature-256 ausente.' });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error('[Meta Segurança] rawBody não capturado para validação de assinatura.');
      return res.status(500).json({ erro: 'Erro interno ao validar assinatura da requisição.' });
    }

    try {
      const expectedSignature =
        'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(signatureHeader, 'utf8');

      if (
        expectedBuffer.length !== signatureBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
      ) {
        console.warn('[Meta Segurança] Assinatura X-Hub-Signature-256 inválida! Requisição bloqueada.');
        return res.status(401).json({ erro: 'Assinatura da Meta inválida.' });
      }

      return next();
    } catch (err) {
      console.error('[Meta Segurança] Erro ao comparar assinaturas:', err.message);
      return res.status(500).json({ erro: 'Falha na verificação de assinatura.' });
    }
  }

  /**
   * Validação do Webhook pela Meta (GET /api/webhook/meta)
   */
  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const { verifyToken } = this.getMetaConfig();

    console.log('[Meta Webhook GET] Solicitação de verificação:', {
      mode,
      tokenReceived: token ? '***' : null,
      challenge
    });

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Meta Webhook GET] ✅ Webhook validado com sucesso pela Meta!');
      return res.status(200).type('text/plain').send(challenge || '');
    }

    console.warn('[Meta Webhook GET] ❌ Falha na validação do verify_token.');
    return res.status(403).send('Forbidden');
  }

  /**
   * Envia mensagem de texto via WhatsApp Cloud API Oficial (suporta divisão automática > 4000 chars)
   */
  async sendTextMessage({ to, text, replyToMessageId, phoneNumberId: overridePhoneId, accessToken: overrideToken }) {
    const rawDigits = String(to || '').replace(/\D/g, '');
    const cleanPhone = rawDigits.length >= 12 ? rawDigits : this.normalizePhone(to);

    if (!cleanPhone) {
      throw new Error('Número de telefone de destino inválido.');
    }

    const hub = this.getHubConfig();
    if (hub.hasApiKey && !overrideToken) {
      const partes = this.splitMessage(String(text || ''), 4000);
      const messageIds = [];
      let lastData = null;

      for (let idx = 0; idx < partes.length; idx++) {
        const resp = await fetch(`${hub.hubUrl}/api/hub/v1/messages/send`, {
          method: 'POST',
          headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
          body: JSON.stringify({
            to: cleanPhone,
            text: partes[idx],
            replyToMessageId: idx === 0 ? replyToMessageId : undefined,
            phoneNumberId: overridePhoneId || undefined
          }),
          signal: AbortSignal.timeout(20000)
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.success === false) {
          throw new Error(data.error || `Erro HTTP ${resp.status} ao enviar via Automatas Hub`);
        }
        lastData = data;
        messageIds.push(data.messageId || `hub_${Date.now()}_${idx}`);
      }

      return {
        sucesso: true,
        simulado: Boolean(lastData?.simulated),
        messageId: messageIds[0],
        messageIds,
        data: lastData
      };
    }
    if (hub.enabled && !hub.hasApiKey && !overrideToken && !this.resolveAccountToken(overridePhoneId)) {
      throw new Error('Configure a API Key do projeto (aut_live_...) para enviar mensagens via Automatas Hub.');
    }

    const meta = this.getMetaConfig();
    const apiVersion = meta.apiVersion;
    const phoneNumberId = (overridePhoneId || meta.phoneNumberId || '').trim();
    const accessToken = this.resolveAccountToken(phoneNumberId, overrideToken);

    if (!accessToken || !phoneNumberId) {
      console.warn(
        `[Meta WhatsApp] META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID não configurados. Modo simulação para ${cleanPhone}: "${String(text).slice(0, 120)}..."`
      );
      return {
        sucesso: true,
        simulado: true,
        messageId: `sim_${Date.now()}`
      };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const partes = this.splitMessage(String(text || ''), 4000);
    const messageIds = [];
    let lastData = null;

    for (let idx = 0; idx < partes.length; idx++) {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: partes[idx]
        }
      };

      if (replyToMessageId && idx === 0) {
        payload.context = { message_id: replyToMessageId };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msgErro = data?.error?.message || `Erro HTTP ${response.status} na Meta Graph API`;
        console.error('[Meta WhatsApp] ❌ Erro ao enviar mensagem:', data);
        throw new Error(msgErro);
      }

      lastData = data;
      messageIds.push(data?.messages?.[0]?.id || `meta_${Date.now()}_${idx}`);
    }

    return {
      sucesso: true,
      simulado: false,
      messageId: messageIds[0],
      messageIds,
      data: lastData
    };
  }

  /**
   * Envia mensagem de template oficial (para reabertura fora da janela de 24h da Meta)
   */
  async sendTemplateMessage({ to, templateName, languageCode = 'pt_BR', components = [], phoneNumberId: overridePhoneId, accessToken: overrideToken }) {
    const rawDigits = String(to || '').replace(/\D/g, '');
    const cleanPhone = rawDigits.length >= 12 ? rawDigits : this.normalizePhone(to);

    if (!cleanPhone || !templateName) {
      throw new Error('Telefone e nome do template são obrigatórios.');
    }

    const hub = this.getHubConfig();
    if (hub.hasApiKey && !overrideToken) {
      const resp = await fetch(`${hub.hubUrl}/api/hub/v1/messages/template`, {
        method: 'POST',
        headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({
          to: cleanPhone,
          templateName,
          languageCode,
          components,
          phoneNumberId: overridePhoneId || undefined
        }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || `Erro HTTP ${resp.status} ao enviar template via Automatas Hub`);
      }
      return {
        sucesso: true,
        simulado: Boolean(data.simulated),
        messageId: data.data?.messages?.[0]?.id || `hub_tpl_${Date.now()}`,
        data
      };
    }
    if (hub.enabled && !hub.hasApiKey && !overrideToken && !this.resolveAccountToken(overridePhoneId)) {
      throw new Error('Configure a API Key do projeto (aut_live_...) para enviar templates via Automatas Hub.');
    }

    const meta = this.getMetaConfig();
    const apiVersion = meta.apiVersion;
    const phoneNumberId = (overridePhoneId || meta.phoneNumberId || '').trim();
    const accessToken = this.resolveAccountToken(phoneNumberId, overrideToken);
    if (!accessToken || !phoneNumberId) {
      return { sucesso: true, simulado: true, messageId: `sim_tpl_${Date.now()}` };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      }),
      signal: AbortSignal.timeout(20000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `Erro HTTP ${response.status} ao enviar template Meta`);
    }
    return {
      sucesso: true,
      simulado: false,
      messageId: data?.messages?.[0]?.id || `meta_tpl_${Date.now()}`,
      data
    };
  }

  /**
   * Valida o limite de 5 MB (5242880 bytes) exigido pelo Automatas Hub para envio/upload direto em base64
   */
  validateDirectMediaSize(mediaBase64) {
    const raw = String(mediaBase64 || '').trim();
    const clean = raw.replace(/^data:[^;]+;base64,/, '');
    const byteLength = Buffer.from(clean, 'base64').length;
    const maxBytes = 5 * 1024 * 1024;
    if (byteLength > maxBytes) {
      const err = new Error(
        `Arquivo excede o limite de 5 MB (${maxBytes} bytes) para upload direto em base64. Hospede em HTTPS e envie via mediaUrl.`
      );
      err.statusCode = 413;
      throw err;
    }
    return { cleanBase64: clean, byteLength, maxBytes };
  }

  /**
   * Faz upload reutilizável de mídia (até 5 MB) no Automatas Hub -> retorna mediaId
   */
  async uploadMedia({ mediaBase64, mimeType, filename, phoneNumberId } = {}) {
    if (!mediaBase64) {
      throw new Error('mediaBase64 é obrigatório para upload de mídia.');
    }
    const hub = this.getHubConfig();
    if (!hub.hasApiKey) {
      throw new Error('Configure a API Key do projeto (aut_live_...) para enviar mídia pelo Automatas Hub.');
    }

    this.validateDirectMediaSize(mediaBase64);

    const resp = await fetch(`${hub.hubUrl}/api/hub/v1/media/upload`, {
      method: 'POST',
      headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
      body: JSON.stringify({
        mediaBase64: String(mediaBase64),
        mimeType: mimeType || undefined,
        filename: filename || undefined,
        phoneNumberId: phoneNumberId || undefined
      }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      const err = new Error(data.error || `Erro HTTP ${resp.status} ao enviar mídia para o Automatas Hub`);
      err.statusCode = resp.status;
      throw err;
    }
    return {
      sucesso: true,
      mediaId: data.mediaId,
      sizeBytes: data.sizeBytes,
      maxBytes: data.maxBytes || 5242880,
      data
    };
  }

  /**
   * Envia mídia WhatsApp via link HTTPS (mediaUrl), mediaId reutilizável ou mediaBase64 (máx. 5 MB)
   */
  async sendMediaMessage({
    to,
    type,
    mediaUrl,
    mediaId,
    mediaBase64,
    mimeType,
    filename,
    caption,
    replyToMessageId,
    phoneNumberId: overridePhoneId
  } = {}) {
    const cleanPhone = this.normalizePhone(to);
    if (!cleanPhone) {
      throw new Error('Número de telefone de destino inválido.');
    }
    const allowedTypes = ['image', 'video', 'audio', 'document', 'sticker'];
    if (!allowedTypes.includes(String(type || '').trim())) {
      throw new Error(`Tipo de mídia inválido. Use um de: ${allowedTypes.join(', ')}.`);
    }
    if (!mediaUrl && !mediaId && !mediaBase64) {
      throw new Error('Informe mediaUrl, mediaId ou mediaBase64 para enviar mídia.');
    }

    const hub = this.getHubConfig();
    if (!hub.hasApiKey) {
      throw new Error('Configure a API Key do projeto (aut_live_...) para enviar mídias pelo Automatas Hub.');
    }

    if (mediaBase64 && !mediaUrl && !mediaId) {
      this.validateDirectMediaSize(mediaBase64);
    }

    const resp = await fetch(`${hub.hubUrl}/api/hub/v1/messages/media`, {
      method: 'POST',
      headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
      body: JSON.stringify({
        to: cleanPhone,
        type: String(type).trim(),
        mediaUrl: mediaUrl || undefined,
        mediaId: mediaId || undefined,
        mediaBase64: mediaBase64 || undefined,
        mimeType: mimeType || undefined,
        filename: filename || undefined,
        caption: caption || undefined,
        replyToMessageId: replyToMessageId || undefined,
        phoneNumberId: overridePhoneId || undefined
      }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      const err = new Error(data.error || `Erro HTTP ${resp.status} ao enviar mídia via Automatas Hub`);
      err.statusCode = resp.status;
      throw err;
    }
    return {
      sucesso: true,
      simulado: Boolean(data.simulated),
      messageId: data.messageId || data.data?.messages?.[0]?.id || `hub_media_${Date.now()}`,
      data
    };
  }

  /**
   * Marca mensagem recebida como lida (check azul) na Meta Cloud API
   */
  async markAsRead(messageId, overridePhoneId) {
    if (!messageId) return;
    const hub = this.getHubConfig();
    if (hub.hasApiKey) {
      try {
        await fetch(`${hub.hubUrl}/api/hub/v1/messages/read`, {
          method: 'POST',
          headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
          body: JSON.stringify({
            messageId,
            phoneNumberId: overridePhoneId || undefined
          }),
          signal: AbortSignal.timeout(10000)
        });
      } catch { }
      return;
    }

    const meta = this.getMetaConfig();
    const phoneNumberId = (overridePhoneId || meta.phoneNumberId || '').trim();
    const accessToken = this.resolveAccountToken(phoneNumberId);

    if (!accessToken || !phoneNumberId || !messageId) return;

    try {
      await fetch(`https://graph.facebook.com/${meta.apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      console.warn('[Meta WhatsApp] Aviso ao marcar mensagem como lida:', err.message);
    }
  }

  /**
   * Download oficial de mídia via Meta Graph API (2 etapas):
   * 1) GET /{apiVersion}/{mediaId} -> obtém URL temporária autenticada e mime_type
   * 2) GET {url} com Bearer token -> retorna Buffer binário
   */
  async downloadMedia(mediaId, overrideToken, phoneNumberId) {
    if (!mediaId) {
      throw new Error('mediaId obrigatório para download de mídia da Meta.');
    }

    const hub = this.getHubConfig();
    if (hub.hasApiKey && !overrideToken) {
      const q = phoneNumberId ? `?phoneNumberId=${encodeURIComponent(phoneNumberId)}` : '';
      const resp = await fetch(`${hub.hubUrl}/api/hub/v1/media/${encodeURIComponent(mediaId)}${q}`, {
        headers: this.buildHubHeaders(hub),
        signal: AbortSignal.timeout(45000)
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Falha ao baixar mídia ${mediaId} via Hub (HTTP ${resp.status})`);
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      return {
        buffer,
        mimeType: resp.headers.get('content-type') || 'application/octet-stream',
        fileSize: buffer.length,
        sha256: resp.headers.get('x-media-sha256') || null
      };
    }
    if (hub.enabled && !hub.hasApiKey && !overrideToken && !this.getMetaConfig().accessToken) {
      throw new Error('Configure a API Key do projeto (aut_live_...) para baixar mídias via Automatas Hub.');
    }

    const meta = this.getMetaConfig();
    const accessToken = (overrideToken || meta.accessToken || '').trim();

    if (!accessToken) {
      throw new Error('META_ACCESS_TOKEN não configurado para download de mídias.');
    }

    // Etapa 1: Consultar metadados e URL da mídia
    const metaResp = await fetch(`https://graph.facebook.com/${meta.apiVersion}/${mediaId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000)
    });

    const metaJson = await metaResp.json().catch(() => ({}));
    if (!metaResp.ok || !metaJson.url) {
      throw new Error(metaJson?.error?.message || `Falha ao obter URL da mídia ${mediaId}`);
    }

    // Etapa 2: Baixar binário da URL assinada da Meta
    const binResp = await fetch(metaJson.url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(45000)
    });

    if (!binResp.ok) {
      throw new Error(`Falha ao baixar binário da mídia ${mediaId} (HTTP ${binResp.status})`);
    }

    const arrayBuffer = await binResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      mimeType: metaJson.mime_type || binResp.headers.get('content-type') || 'application/octet-stream',
      fileSize: metaJson.file_size || buffer.length,
      sha256: metaJson.sha256 || null
    };
  }

  /**
   * Remove dados sensíveis antes de enviar contas conectadas para o frontend
   */
  sanitizePublicAccount(acc) {
    if (!acc) return null;
    const meta = this.getMetaConfig();
    return {
      phoneNumberId: String(acc.phoneNumberId || ''),
      wabaId: acc.wabaId || '',
      businessId: acc.businessId || '',
      displayPhoneNumber: acc.displayPhoneNumber || '',
      verifiedName: acc.verifiedName || '',
      qualityRating: acc.qualityRating || '',
      status: acc.status || 'active',
      isCoexistence: Boolean(acc.isCoexistence),
      onboardingMode: acc.onboardingMode || 'standard',
      authType: acc.authType || 'embedded_signup',
      userId: acc.userId || '',
      userName: acc.userName || '',
      userEmail: acc.userEmail || '',
      userPicture: acc.userPicture || '',
      tokenExchanged: Boolean(acc.tokenExchanged),
      webhookSubscribed: Boolean(acc.webhookSubscribed),
      contactsSynced: Boolean(acc.contactsSynced),
      historySynced: Boolean(acc.historySynced),
      lastSyncAt: acc.lastSyncAt || null,
      syncWarnings: Array.isArray(acc.syncWarnings) ? acc.syncWarnings : [],
      hasAccessToken: Boolean(acc.accessToken || meta.accessToken),
      isActive: Boolean(meta.phoneNumberId && String(acc.phoneNumberId) === String(meta.phoneNumberId)),
      connectedAt: acc.connectedAt || null,
      updatedAt: acc.updatedAt || null
    };
  }

  getPublicAuthState() {
    const hub = this.getHubConfig();

    return {
      mode: 'hub',
      hubEnabled: hub.enabled,
      hubConnected: false,
      hubUrl: hub.hubUrl || 'https://api.automatas.tech',
      hubSiteUrl: hub.siteUrl || 'https://automatas.tech',
      hubLoginJwt: hub.loginJwt || '',
      hasHubLoginJwt: hub.hasLoginJwt,
      hasHubApiKey: hub.hasApiKey,
      hubWebhookUrl: hub.webhookUrl || '',
      hasHubWebhookSecret: Boolean(hub.webhookSecret),
      connected: false,
      activePhoneNumberId: '',
      hasAccessToken: hub.hasApiKey,
      activeAccount: null,
      accounts: []
    };
  }

  async getPublicAuthStateAsync() {
    const hub = this.getHubConfig();
    const localState = this.getPublicAuthState();
    if (!hub.enabled) {
      return localState;
    }

    try {
      const resp = await fetch(`${hub.hubUrl}/api/hub/v1/me`, {
        headers: this.buildHubHeaders(hub),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        return {
          ...localState,
          mode: 'hub',
          hubEnabled: true,
          hubConnected: false,
          hubUrl: hub.hubUrl,
          hubSiteUrl: hub.siteUrl,
          hubLoginJwt: hub.loginJwt,
          hasHubLoginJwt: hub.hasLoginJwt,
          hasHubApiKey: hub.hasApiKey,
          hubWebhookUrl: hub.webhookUrl,
          hasHubWebhookSecret: Boolean(hub.webhookSecret),
          hubError: data.error || `Falha HTTP ${resp.status} no Hub Automatas`
        };
      }

      const configPatch = {};
      const remoteSecret = String(data.project?.webhookSecret || '').trim();
      if (remoteSecret && remoteSecret !== hub.webhookSecret) {
        configPatch.automatasWebhookSecret = remoteSecret;
      }
      const remoteWebhookUrl = String(data.project?.webhookUrl || '').trim();
      if (remoteWebhookUrl && !hub.webhookUrl) {
        configPatch.automatasWebhookUrl = remoteWebhookUrl;
      }

      let effectiveLoginJwt = String(data.project?.loginJwt || hub.loginJwt || '').trim();
      if (hub.hasApiKey && !effectiveLoginJwt) {
        try {
          const dashResp = await fetch(`${hub.hubUrl}/api/hub/v1/dashboard`, {
            headers: { 'x-api-key': hub.apiKey },
            signal: AbortSignal.timeout(8000)
          });
          const dashData = await dashResp.json().catch(() => ({}));
          const fetchedJwt = String(dashData?.project?.loginJwt || '').trim();
          if (dashResp.ok && fetchedJwt) {
            effectiveLoginJwt = fetchedJwt;
            configPatch.automatasLoginJwt = fetchedJwt;
          }
        } catch { }
      }
      if (Object.keys(configPatch).length > 0 && dbService.saveConfig) {
        dbService.saveConfig(configPatch);
      }

      const activeId = String(data.activePhoneNumberId || '');
      const accounts = Array.isArray(data.accounts)
        ? data.accounts.map((a) => ({
          ...a,
          isActive: Boolean(activeId && String(a.phoneNumberId) === activeId)
        }))
        : [];
      const activeAccount = accounts.find((a) => a.isActive) || accounts[0] || null;
      const finalWebhookUrl = hub.webhookUrl || remoteWebhookUrl || '';
      const finalWebhookSecret = remoteSecret || hub.webhookSecret || '';
      const { webhookSecret: _ignoredSecret, ...publicProject } = data.project || {};

      return {
        mode: 'hub',
        hubEnabled: true,
        hubConnected: true,
        hubUrl: hub.hubUrl,
        hubSiteUrl: hub.siteUrl,
        hubLoginJwt: effectiveLoginJwt,
        hasHubLoginJwt: Boolean(effectiveLoginJwt),
        hasHubApiKey: hub.hasApiKey,
        hubWebhookUrl: finalWebhookUrl,
        hasHubWebhookSecret: Boolean(finalWebhookSecret),
        hubProject: data.project ? publicProject : null,
        connected: accounts.length > 0,
        activePhoneNumberId: activeId || activeAccount?.phoneNumberId || '',
        hasAccessToken: hub.hasApiKey,
        activeAccount,
        accounts
      };
    } catch (err) {
      return {
        ...localState,
        mode: 'hub',
        hubEnabled: true,
        hubConnected: false,
        hubUrl: hub.hubUrl,
        hubSiteUrl: hub.siteUrl,
        hubLoginJwt: hub.loginJwt,
        hasHubLoginJwt: hub.hasLoginJwt,
        hasHubApiKey: hub.hasApiKey,
        hubWebhookUrl: hub.webhookUrl,
        hasHubWebhookSecret: Boolean(hub.webhookSecret),
        hubError: `Não foi possível conectar ao Automatas Hub: ${err.message}`
      };
    }
  }

  async saveAndSyncHubConfig({ hubUrl, siteUrl, loginJwt, apiKey, webhookSecret, webhookUrl } = {}) {
    const prevHub = this.getHubConfig();
    const patch = {};
    if (hubUrl !== undefined) patch.automatasHubUrl = String(hubUrl).trim().replace(/\/+$/, '');
    if (siteUrl !== undefined) patch.automatasSiteUrl = String(siteUrl).trim().replace(/\/+$/, '');
    if (loginJwt !== undefined) patch.automatasLoginJwt = String(loginJwt).trim();
    if (apiKey !== undefined) {
      const trimmedKey = String(apiKey).trim();
      patch.automatasProjectApiKey = trimmedKey;
      if (trimmedKey !== prevHub.apiKey && loginJwt === undefined) {
        patch.automatasLoginJwt = '';
      }
    }
    if (webhookUrl !== undefined) patch.automatasWebhookUrl = String(webhookUrl).trim();
    if (webhookSecret !== undefined) patch.automatasWebhookSecret = String(webhookSecret).trim();
    dbService.saveConfig(patch);

    const hub = this.getHubConfig();
    if (!hub.enabled) {
      throw new Error('Informe a URL do Hub e o Token de Login (JWT) ou a API Key do projeto (aut_live_...).');
    }

    let webhookSynced = false;
    let hubWarning = '';
    const targetWebhookUrl = String(webhookUrl !== undefined ? webhookUrl : hub.webhookUrl || '').trim();
    if (targetWebhookUrl) {
      if (hub.hasApiKey) {
        try {
          const wbResp = await fetch(`${hub.hubUrl}/api/hub/v1/webhook`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': hub.apiKey
            },
            body: JSON.stringify({ webhookUrl: targetWebhookUrl }),
            signal: AbortSignal.timeout(10000)
          });
          const wbData = await wbResp.json().catch(() => ({}));
          if (wbResp.ok && wbData.success !== false) {
            webhookSynced = true;
          } else {
            hubWarning = wbData.error || `Falha HTTP ${wbResp.status} ao registrar webhook no Hub Automatas.`;
          }
        } catch (err) {
          hubWarning = `Não foi possível registrar webhook no Hub Automatas: ${err.message}`;
        }
      } else {
        hubWarning = 'Token de Login (JWT) salvo! Para registrar o webhook automaticamente e receber/enviar dados do WhatsApp, informe também a API Key (aut_live_...).';
      }
    }

    const state = await this.getPublicAuthStateAsync();
    return {
      ...state,
      webhookSynced,
      ...(hubWarning ? { hubWarning } : {})
    };
  }

  async ativarConexaoManual({ phoneNumberId, accessToken, wabaId, businessId, verifyToken, appSecret, apiVersion, usarEnv = false } = {}) {
    const meta = this.getMetaConfig();
    const resolvedPhoneId = String((usarEnv ? meta.phoneNumberId : phoneNumberId) || meta.phoneNumberId || '').trim();
    const resolvedToken = String((usarEnv ? meta.accessToken : accessToken) || meta.accessToken || '').trim();
    const resolvedVersion = String(apiVersion || meta.apiVersion || 'v24.0').trim();

    if (!resolvedPhoneId || !resolvedToken) {
      return {
        sucesso: false,
        erro: 'Informe o Phone Number ID e o Access Token da Meta para conectar.'
      };
    }

    const teste = await this.testConnection({
      accessToken: resolvedToken,
      phoneNumberId: resolvedPhoneId,
      apiVersion: resolvedVersion
    });

    if (!teste.sucesso) {
      return {
        sucesso: false,
        erro: teste.erro || 'Não foi possível validar o token na Meta Graph API.',
        codigoErro: teste.codigoErro || null
      };
    }

    const patch = {
      metaPhoneNumberId: resolvedPhoneId,
      metaAccessToken: resolvedToken,
      metaApiVersion: resolvedVersion
    };
    if (wabaId) patch.metaWabaId = String(wabaId).trim();
    if (businessId) patch.metaBusinessId = String(businessId).trim();
    if (verifyToken) patch.metaVerifyToken = String(verifyToken).trim();
    if (appSecret) patch.metaAppSecret = String(appSecret).trim();
    dbService.saveConfig(patch);

    dbService.upsertWhatsappAccount({
      phoneNumberId: resolvedPhoneId,
      wabaId: wabaId ? String(wabaId).trim() : (meta.wabaId || ''),
      businessId: businessId ? String(businessId).trim() : (meta.businessId || ''),
      displayPhoneNumber: teste.displayPhoneNumber || '',
      verifiedName: teste.verifiedName || 'WhatsApp Business (Cloud API)',
      qualityRating: teste.qualityRating || '',
      status: teste.status || 'CONNECTED',
      accessToken: resolvedToken,
      userName: 'Configuração Oficial',
      isCoexistence: false,
      onboardingMode: 'system_user',
      authType: 'system_user'
    });

    return {
      sucesso: true,
      ...this.getPublicAuthState()
    };
  }

  async _postSmbAppSync(phoneNumberId, token, syncType, apiVersion) {
    try {
      const resp = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/smb_app_data`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            sync_type: syncType
          }),
          signal: AbortSignal.timeout(15000)
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, warning: `Sync "${syncType}": ${data?.error?.message || `HTTP ${resp.status}`}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, warning: `Sync "${syncType}": ${err.message}` };
    }
  }

  async triggerCoexistenceSync(phoneNumberId, overrideToken) {
    const hub = this.getHubConfig();
    if (hub.hasApiKey && !overrideToken) {
      const resp = await fetch(`${hub.hubUrl}/api/hub/v1/coexistence/sync`, {
        method: 'POST',
        headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ phoneNumberId: phoneNumberId || undefined }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await resp.json().catch(() => ({}));
      const sr = data.syncResult || {};
      return {
        sucesso: Boolean(data.success),
        contactsSynced: Boolean(sr.contactsSynced),
        historySynced: Boolean(sr.historySynced),
        syncedAt: sr.syncedAt || new Date().toISOString(),
        warnings: Array.isArray(sr.warnings) ? sr.warnings : (data.error ? [data.error] : []),
        ...(await this.getPublicAuthStateAsync())
      };
    }
    if (hub.enabled && !hub.hasApiKey && !overrideToken && !this.resolveAccountToken(phoneNumberId)) {
      return {
        sucesso: false,
        erro: 'Configure a API Key do projeto (aut_live_...) para sincronizar pelo Automatas Hub.'
      };
    }

    const meta = this.getMetaConfig();
    const targetPhoneId = String(phoneNumberId || meta.phoneNumberId || '').trim();
    const token = this.resolveAccountToken(targetPhoneId, overrideToken);
    const warnings = [];
    const syncedAt = new Date().toISOString();

    if (!targetPhoneId) {
      return { sucesso: false, erro: 'Phone Number ID não informado para sincronização.' };
    }
    if (!token) {
      return {
        sucesso: false,
        contactsSynced: false,
        historySynced: false,
        syncedAt,
        warnings: ['Token de acesso indisponível. Configure META_APP_SECRET ou META_ACCESS_TOKEN.']
      };
    }

    const contactsRes = await this._postSmbAppSync(targetPhoneId, token, 'smb_app_state_sync', meta.apiVersion);
    if (!contactsRes.ok && contactsRes.warning) warnings.push(contactsRes.warning);

    const historyRes = await this._postSmbAppSync(targetPhoneId, token, 'history', meta.apiVersion);
    if (!historyRes.ok && historyRes.warning) warnings.push(historyRes.warning);

    if (dbService.upsertWhatsappAccount) {
      dbService.upsertWhatsappAccount({
        phoneNumberId: targetPhoneId,
        isCoexistence: true,
        onboardingMode: 'coexistence',
        contactsSynced: contactsRes.ok,
        historySynced: historyRes.ok,
        lastSyncAt: syncedAt,
        syncWarnings: warnings
      });
    }

    return {
      sucesso: contactsRes.ok || historyRes.ok,
      contactsSynced: contactsRes.ok,
      historySynced: historyRes.ok,
      syncedAt,
      warnings,
      ...this.getPublicAuthState()
    };
  }

  async discoverWhatsappNumbersFromUserToken(userToken, apiVersion) {
    const discovered = [];
    const seen = new Set();

    const addPhones = (waba, biz) => {
      const phones = waba?.phone_numbers?.data || [];
      for (const p of phones) {
        if (!p?.id || seen.has(String(p.id))) continue;
        seen.add(String(p.id));
        discovered.push({
          phoneNumberId: String(p.id),
          displayPhoneNumber: p.display_phone_number || '',
          verifiedName: p.verified_name || waba?.name || '',
          qualityRating: p.quality_rating || '',
          status: p.status || 'active',
          wabaId: waba?.id ? String(waba.id) : '',
          businessId: biz?.id ? String(biz.id) : '',
          businessName: biz?.name || ''
        });
      }
    };

    const url = `https://graph.facebook.com/${apiVersion}/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,status}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,status}}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${userToken}` },
      signal: AbortSignal.timeout(15000)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error?.message || `Erro ao buscar contas WhatsApp via Facebook Login (HTTP ${resp.status})`);
    }

    for (const biz of data?.data || []) {
      for (const waba of biz?.owned_whatsapp_business_accounts?.data || []) {
        addPhones(waba, biz);
      }
      for (const waba of biz?.client_whatsapp_business_accounts?.data || []) {
        addPhones(waba, biz);
      }
    }

    return discovered;
  }

  /**
   * Processa onboarding via Facebook Login / WhatsApp Embedded Signup v4
   */
  async processarFacebookAuth(payload = {}) {
    const meta = this.getMetaConfig();
    const {
      authType = 'embedded_signup',
      userId,
      userName,
      userEmail,
      userPicture,
      phoneNumberId,
      wabaId,
      businessId,
      displayPhoneNumber,
      verifiedName,
      accessToken,
      code,
      appId,
      configId,
      isCoexistence,
      onboardingMode,
      embeddedEvent
    } = payload;

    if (authType === 'embedded_signup') {
      if (embeddedEvent === 'CANCEL' || embeddedEvent === 'ERROR') {
        return {
          sucesso: false,
          erro: 'Onboarding cancelado ou encerrado com erro na Meta.'
        };
      }
      if (!wabaId && !phoneNumberId) {
        return {
          sucesso: false,
          erro: 'Onboarding incompleto: nenhuma WABA ou número de WhatsApp foi selecionado na Meta.'
        };
      }
    }

    const effectiveAppId = (appId || meta.appId || '').trim();
    const effectiveAppSecret = (meta.appSecret || '').trim();
    const apiVersion = meta.apiVersion || 'v24.0';

    const coexistenceFlag = Boolean(
      isCoexistence ||
      onboardingMode === 'coexistence' ||
      embeddedEvent === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
    );

    const onboardingDetails = {
      tokenExchanged: false,
      phoneResolvedFromWaba: false,
      webhookSubscribed: false,
      contactsSynced: false,
      historySynced: false,
      warnings: []
    };

    // 1. Trocar authorization code OAuth por access_token se META_APP_SECRET estiver disponível
    let exchangedToken = '';
    if (code && !accessToken) {
      if (effectiveAppId && effectiveAppSecret) {
        try {
          const tokenUrl = new URL(`https://graph.facebook.com/${apiVersion}/oauth/access_token`);
          tokenUrl.searchParams.set('client_id', effectiveAppId);
          tokenUrl.searchParams.set('client_secret', effectiveAppSecret);
          tokenUrl.searchParams.set('code', String(code));

          const tokenRes = await fetch(tokenUrl.toString(), { method: 'GET', signal: AbortSignal.timeout(15000) });
          const tokenData = await tokenRes.json().catch(() => ({}));
          if (tokenRes.ok && tokenData?.access_token) {
            exchangedToken = String(tokenData.access_token);
            onboardingDetails.tokenExchanged = true;
          } else {
            onboardingDetails.warnings.push(
              `Falha na troca do code OAuth: ${tokenData?.error?.message || `HTTP ${tokenRes.status}`}`
            );
          }
        } catch (err) {
          onboardingDetails.warnings.push(`Erro ao trocar code OAuth: ${err.message}`);
        }
      } else {
        onboardingDetails.warnings.push(
          'META_APP_SECRET não configurado: a troca automática do code OAuth pelo token ficará pendente (usando token já configurado se houver).'
        );
      }
    }

    const userSuppliedToken = (exchangedToken || accessToken || '').trim();
    const effectiveToken = userSuppliedToken || (meta.accessToken || '').trim();

    let phonesToPersist = [];

    // 2A. Facebook Login simples: descobre números disponíveis nas WABAs do usuário
    if (authType === 'facebook_login' && !phoneNumberId && !wabaId) {
      if (!effectiveToken) {
        return {
          sucesso: false,
          erro: 'Token do Facebook não retornado para consultar números de WhatsApp.'
        };
      }
      try {
        phonesToPersist = await this.discoverWhatsappNumbersFromUserToken(effectiveToken, apiVersion);
        if (phonesToPersist.length === 0) {
          onboardingDetails.warnings.push(
            'Login realizado, mas nenhum número de WhatsApp Business foi retornado nas contas vinculadas a este perfil do Facebook.'
          );
        }
      } catch (err) {
        return { sucesso: false, erro: err.message };
      }
    } else {
      // 2B. Embedded Signup ou seleção direta de phoneNumberId/wabaId
      let resolvedPhoneId = phoneNumberId ? String(phoneNumberId).trim() : '';
      let resolvedDisplay = displayPhoneNumber || '';
      let resolvedVerified = verifiedName || '';

      if (!resolvedPhoneId && wabaId && effectiveToken) {
        try {
          const phonesRes = await fetch(
            `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`,
            { headers: { Authorization: `Bearer ${effectiveToken}` }, signal: AbortSignal.timeout(15000) }
          );
          const phonesData = await phonesRes.json().catch(() => ({}));
          if (phonesRes.ok && Array.isArray(phonesData?.data) && phonesData.data.length > 0) {
            onboardingDetails.phoneResolvedFromWaba = true;
            for (const p of phonesData.data) {
              if (!p?.id) continue;
              phonesToPersist.push({
                phoneNumberId: String(p.id),
                displayPhoneNumber: p.display_phone_number || '',
                verifiedName: p.verified_name || '',
                qualityRating: p.quality_rating || '',
                status: p.status || 'active',
                wabaId: String(wabaId),
                businessId: businessId ? String(businessId) : ''
              });
            }
          } else if (!phonesRes.ok) {
            onboardingDetails.warnings.push(
              `Não foi possível consultar números da WABA: ${phonesData?.error?.message || `HTTP ${phonesRes.status}`}`
            );
          }
        } catch (err) {
          onboardingDetails.warnings.push(`Erro ao consultar WABA: ${err.message}`);
        }
      }

      if (phonesToPersist.length === 0 && resolvedPhoneId) {
        if (effectiveToken && (!resolvedDisplay || !resolvedVerified)) {
          try {
            const infoRes = await fetch(
              `https://graph.facebook.com/${apiVersion}/${resolvedPhoneId}?fields=display_phone_number,verified_name,quality_rating,status`,
              { headers: { Authorization: `Bearer ${effectiveToken}` }, signal: AbortSignal.timeout(15000) }
            );
            const infoData = await infoRes.json().catch(() => ({}));
            if (infoRes.ok) {
              resolvedDisplay = infoData.display_phone_number || resolvedDisplay;
              resolvedVerified = infoData.verified_name || resolvedVerified;
            }
          } catch { }
        }
        phonesToPersist.push({
          phoneNumberId: resolvedPhoneId,
          displayPhoneNumber: resolvedDisplay,
          verifiedName: resolvedVerified,
          wabaId: wabaId ? String(wabaId) : '',
          businessId: businessId ? String(businessId) : ''
        });
      }
    }

    // 3. Inscrever webhook na(s) WABA(s) se Embedded Signup
    const targetWaba = wabaId || phonesToPersist[0]?.wabaId || '';
    if (targetWaba && effectiveToken && authType === 'embedded_signup') {
      try {
        const subRes = await fetch(
          `https://graph.facebook.com/${apiVersion}/${targetWaba}/subscribed_apps`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${effectiveToken}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
          }
        );
        const subData = await subRes.json().catch(() => ({}));
        if (subRes.ok && subData?.success !== false) {
          onboardingDetails.webhookSubscribed = true;
        } else {
          onboardingDetails.warnings.push(
            `Falha ao inscrever webhook na WABA: ${subData?.error?.message || `HTTP ${subRes.status}`}`
          );
        }
      } catch (err) {
        onboardingDetails.warnings.push(`Erro ao inscrever webhook na WABA: ${err.message}`);
      }
    }

    const resolvedMode = authType === 'system_user'
      ? 'system_user'
      : (coexistenceFlag ? 'coexistence' : 'standard');

    // 4. Persistir conta(s) e atualizar configuração ativa
    for (const item of phonesToPersist) {
      dbService.upsertWhatsappAccount({
        phoneNumberId: item.phoneNumberId,
        wabaId: item.wabaId || targetWaba || '',
        businessId: item.businessId || businessId || '',
        displayPhoneNumber: item.displayPhoneNumber || '',
        verifiedName: item.verifiedName || '',
        qualityRating: item.qualityRating || '',
        status: item.status || 'active',
        accessToken: userSuppliedToken || '',
        userId: userId || '',
        userName: userName || item.verifiedName || 'WhatsApp Business Integrado',
        userEmail: userEmail || '',
        userPicture: userPicture || '',
        isCoexistence: coexistenceFlag,
        onboardingMode: resolvedMode,
        authType,
        tokenExchanged: onboardingDetails.tokenExchanged,
        webhookSubscribed: onboardingDetails.webhookSubscribed,
        syncWarnings: onboardingDetails.warnings
      });
    }

    const primaryPhone = phonesToPersist[0];
    const configPatch = {};
    if (effectiveAppId) configPatch.metaAppId = effectiveAppId;
    if (configId && String(configId).trim()) configPatch.metaConfigId = String(configId).trim();
    if (primaryPhone?.phoneNumberId) {
      configPatch.metaPhoneNumberId = primaryPhone.phoneNumberId;
      if (primaryPhone.wabaId) configPatch.metaWabaId = primaryPhone.wabaId;
      if (primaryPhone.businessId) configPatch.metaBusinessId = primaryPhone.businessId;
    }
    if (userSuppliedToken) {
      configPatch.metaAccessToken = userSuppliedToken;
    }
    if (Object.keys(configPatch).length > 0 && dbService.saveConfig) {
      dbService.saveConfig(configPatch);
    }

    // 5. Se modo Coexistência ativo, solicita sync de contatos e histórico (até 6 meses)
    if (coexistenceFlag && primaryPhone?.phoneNumberId && effectiveToken) {
      const syncRes = await this.triggerCoexistenceSync(primaryPhone.phoneNumberId, effectiveToken);
      onboardingDetails.contactsSynced = Boolean(syncRes.contactsSynced);
      onboardingDetails.historySynced = Boolean(syncRes.historySynced);
      if (Array.isArray(syncRes.warnings) && syncRes.warnings.length > 0) {
        onboardingDetails.warnings.push(...syncRes.warnings);
      }
    }

    return {
      sucesso: true,
      onboardingDetails,
      discoveredCount: phonesToPersist.length,
      ...this.getPublicAuthState()
    };
  }

  async selectActiveAccount(phoneNumberId) {
    const hub = this.getHubConfig();
    if (hub.hasApiKey) {
      const resp = await fetch(`${hub.hubUrl}/api/hub/v1/accounts/select`, {
        method: 'POST',
        headers: this.buildHubHeaders(hub, { headers: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ phoneNumberId }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        return { sucesso: false, erro: data.error || 'Falha ao alternar número no Hub.' };
      }
      return {
        sucesso: true,
        ...(await this.getPublicAuthStateAsync())
      };
    }
    if (hub.enabled && !hub.hasApiKey) {
      return {
        sucesso: false,
        erro: 'Configure a API Key do projeto (aut_live_...) para alternar contas no Automatas Hub.'
      };
    }

    const pid = String(phoneNumberId || '').trim();
    const accounts = dbService.getWhatsappAccounts ? dbService.getWhatsappAccounts() : [];
    const found = accounts.find(a => String(a.phoneNumberId) === pid);
    if (!found) {
      return { sucesso: false, erro: 'Número não encontrado nas contas vinculadas.' };
    }
    const patch = {
      metaPhoneNumberId: found.phoneNumberId,
      metaWabaId: found.wabaId || '',
      metaBusinessId: found.businessId || ''
    };
    if (found.accessToken) {
      patch.metaAccessToken = found.accessToken;
    }
    dbService.saveConfig(patch);
    return {
      sucesso: true,
      ...this.getPublicAuthState()
    };
  }

  async disconnectAccount(phoneNumberId) {
    const hub = this.getHubConfig();
    if (hub.hasApiKey) {
      const resp = await fetch(
        `${hub.hubUrl}/api/hub/v1/accounts/${encodeURIComponent(phoneNumberId)}`,
        {
          method: 'DELETE',
          headers: this.buildHubHeaders(hub),
          signal: AbortSignal.timeout(10000)
        }
      );
      const data = await resp.json().catch(() => ({}));
      return {
        sucesso: Boolean(data.success !== false),
        removido: Boolean(data.removed),
        ...(await this.getPublicAuthStateAsync())
      };
    }
    if (hub.enabled && !hub.hasApiKey) {
      return {
        sucesso: false,
        erro: 'Configure a API Key do projeto (aut_live_...) para remover contas no Automatas Hub.'
      };
    }

    const removed = dbService.deleteWhatsappAccount ? dbService.deleteWhatsappAccount(phoneNumberId) : false;
    return {
      sucesso: true,
      removido: removed,
      ...this.getPublicAuthState()
    };
  }
}

module.exports = new MetaWhatsAppService();
