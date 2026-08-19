export const shouldDeliverWebhook = (sessionEnabled, contactMode = "inherit") => {
  if (contactMode === "enabled") return true;
  if (contactMode === "disabled") return false;
  return sessionEnabled !== false;
};

const unwrapMessage = (message = {}) => message.ephemeralMessage?.message
  || message.viewOnceMessageV2?.message
  || message.viewOnceMessage?.message
  || message.documentWithCaptionMessage?.message
  || message;

export const detectWebhookMessageType = (message = {}) => {
  const content = unwrapMessage(message);
  if (content.conversation || content.extendedTextMessage) return "text";
  if (content.imageMessage) return "image";
  if (content.audioMessage) return content.audioMessage.ptt ? "voice" : "audio";
  if (content.videoMessage) return content.videoMessage.gifPlayback ? "gif" : "video";
  if (content.documentMessage) return "document";
  if (content.stickerMessage) return "sticker";
  if (content.locationMessage) return "location";
  if (content.liveLocationMessage) return "live_location";
  if (content.contactMessage) return "contact";
  if (content.contactsArrayMessage) return "contacts";
  if (content.reactionMessage) return "reaction";
  if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) return "poll";
  return "unknown";
};

export const buildMessageWebhook = ({ sessionId, msg, identity, upsertType }) => ({
  event: msg.key.fromMe ? "message.sent" : "message.received",
  instanceId: sessionId,
  occurredAt: new Date(Number(msg.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
  data: {
    id: msg.key.id,
    from: msg.key.fromMe ? msg.key.participant || null : identity.phoneJid,
    to: msg.key.fromMe ? identity.phoneJid : null,
    chatId: identity.phoneJid,
    senderJid: identity.phoneJid,
    senderNumber: identity.phone,
    pushName: msg.pushName || null,
    message: msg.message,
    messageType: detectWebhookMessageType(msg.message),
    timestamp: msg.messageTimestamp,
    fromMe: Boolean(msg.key.fromMe),
    upsertType,
  },
});

export const buildMessageStatusWebhook = ({ sessionId, update, identity }) => ({
  event: "message.status",
  instanceId: sessionId,
  occurredAt: new Date().toISOString(),
  data: {
    id: update.key?.id || null,
    chatId: identity.phoneJid,
    senderNumber: identity.phone,
    fromMe: Boolean(update.key?.fromMe),
    status: update.update?.status ?? null,
    receipt: update.update?.messageStubType || null,
  },
});

export const buildCallWebhook = ({ sessionId, call, identity, fromMe }) => ({
  event: fromMe ? "call.outgoing" : "call.incoming",
  instanceId: sessionId,
  occurredAt: new Date().toISOString(),
  data: {
    id: call.id,
    chatId: identity.phoneJid,
    from: fromMe ? null : identity.phoneJid,
    to: fromMe ? identity.phoneJid : null,
    senderNumber: identity.phone,
    fromMe,
    status: call.status || null,
    isVideo: call.isVideo === true,
    raw: call,
  },
});

export const postWebhook = async ({ url, payload, logger, userId, sessionId }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "whatsapp-api-webhook/1.0" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) logger.warn({ userId, sessionId, event: payload.event, status: response.status }, "Webhook respondio con error");
};
