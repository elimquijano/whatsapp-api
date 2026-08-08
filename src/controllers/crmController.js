import { Op } from "sequelize";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import CrmContact from "../models/CrmContact.js";
import CrmImportSource from "../models/CrmImportSource.js";
import CrmCampaign from "../models/CrmCampaign.js";
import CrmCampaignRecipient from "../models/CrmCampaignRecipient.js";
import AiMessage from "../models/AiMessage.js";
import sequelize from "../database/db.js";
import sessionManager from "../manager/SessionManager.js";
import campaignService from "../services/campaignService.js";
import { buildMediaMessage, MAX_MEDIA_BYTES, resolveMediaInput } from "../services/messageService.js";
import { deleteCampaignMedia, storeCampaignMedia } from "../services/campaignMediaStorage.js";
import { parseSafeHttpUrl, safeFetchJson } from "../utils/safeHttp.js";
import { sessionIdFromRequest, sessionOwnershipWhere } from "../utils/sessionScope.js";
import { isInternalLidJid, normalizePhoneNumber, phoneJidFromNumber } from "../utils/whatsappIdentity.js";
import { campaignAudienceWhere } from "../utils/campaignAudience.js";
import { downloadMediaMessage } from "@whiskeysockets/baileys";

const statuses = new Set(["new", "interested", "urgent", "follow_up", "customer", "not_interested"]);
const automationModes = new Set(["inherit", "automatic", "human"]);
const importMethods = new Set(["GET", "POST"]);
const IMPORT_TIMEOUT_MS = 20000;
const MAX_IMPORT_RESPONSE_BYTES = 10 * 1024 * 1024;
const ownedSession = (userId, sessionId) => WhatsAppSession.findOne({ where: { userId, sessionId } });
const requestedSessionId = (req) => (
  sessionIdFromRequest(req, { allowLegacyBody: true })
  || String(req.query?.sessionId || "").trim()
);
const sessionOwnershipInclude = (req) => ({
  model: WhatsAppSession,
  as: "whatsappSession",
  attributes: ["id", "sessionId"],
  where: sessionOwnershipWhere(req),
});
const ownedContact = (req) => CrmContact.findByPk(req.params.contactId, {
  include: [sessionOwnershipInclude(req)],
});
const ownedImportSource = (req) => CrmImportSource.findByPk(req.params.sourceId, {
  include: [sessionOwnershipInclude(req)],
});
const ownedCampaign = (req) => CrmCampaign.findByPk(req.params.campaignId, {
  include: [sessionOwnershipInclude(req)],
});
const getPath = (source, path) => String(path || "").split(".").filter(Boolean).reduce((value, key) => value?.[key], source);
const parseWhatsAppPayload = (value) => JSON.parse(value, (_key, item) => (
  item?.type === "Buffer" && Array.isArray(item.data) ? Buffer.from(item.data) : item
));
const REPLYABLE_MESSAGE_TYPES = new Set(["text", "image", "gif", "video", "audio", "document", "sticker", "location", "live_location", "contact", "contacts"]);
export const canQuoteMessage = (record, payload) => Boolean(
  record
  && REPLYABLE_MESSAGE_TYPES.has(record.messageType)
  && payload?.key?.id
  && payload?.message
  && typeof payload.message === "object"
);
const unwrapMessage = (payload = {}) => payload.message?.ephemeralMessage?.message
  || payload.message?.viewOnceMessageV2?.message
  || payload.message?.viewOnceMessage?.message
  || payload.message?.documentWithCaptionMessage?.message
  || payload.message || {};

const quotedMessageDetails = (payload = {}) => {
  const message = unwrapMessage(payload);
  const entry = message.extendedTextMessage || message.imageMessage || message.videoMessage
    || message.audioMessage || message.documentMessage || message.locationMessage
    || message.liveLocationMessage || message.contactMessage;
  const context = entry?.contextInfo;
  if (!context?.quotedMessage) return null;
  const quotedPayload = { message: context.quotedMessage };
  const quoted = unwrapMessage(quotedPayload);
  const content = quoted.conversation || quoted.extendedTextMessage?.text
    || quoted.imageMessage?.caption || quoted.videoMessage?.caption
    || quoted.documentMessage?.fileName || (quoted.audioMessage ? "Audio" : "")
    || (quoted.stickerMessage ? "Sticker" : "") || "Mensaje";
  return { whatsappMessageId: context.stanzaId || null, participant: context.participant || null, content };
};

const professionalGuard = async (req, res) => {
  if (req.crmProfessionalAccess === true) return true;
  const user = await User.findByPk(req.user.id, { include: [{ model: Plan, as: "planData" }] });
  if (!user?.planData?.features?.includes("ai_crm")) {
    res.status(403).json({ success: false, error: "El CRM está disponible únicamente en el plan Profesional" });
    return false;
  }
  if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
    res.status(403).json({ success: false, error: "Tu plan ha expirado. Renueva tu suscripción para usar el CRM" });
    return false;
  }
  req.crmProfessionalAccess = true;
  return true;
};

export const requireProfessionalAccess = async (req, res, next) => {
  try {
    if (await professionalGuard(req, res)) next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listContacts = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const session = await ownedSession(req.user.id, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
    const where = { whatsappSessionId: session.id };
    if (req.query.status && statuses.has(req.query.status)) where.status = req.query.status;
    if (req.query.search) where[Op.or] = [{ name: { [Op.like]: `%${req.query.search}%` } }, { phone: { [Op.like]: `%${req.query.search}%` } }];
    const storedContacts = await CrmContact.findAll({ where, order: [["priority", "DESC"], ["lastMessageAt", "DESC"]], limit: 500 });
    const contacts = storedContacts.filter((contact) => !isInternalLidJid(contact.contactJid));
    res.json({ success: true, sessionId: session.sessionId, contacts });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const getContactMessages = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const contact = await ownedContact(req);
    if (!contact) return res.status(404).json({ success: false, error: "Contacto no encontrado" });
    const newestFirst = await AiMessage.findAll({
      where: { crmContactId: contact.id },
      order: [["messageTimestamp", "DESC"], ["id", "DESC"]],
      limit: Math.min(500, Math.max(1, Number(req.query.limit) || 200)),
    });
    const messages = newestFirst.reverse().map((record) => {
      const message = record.toJSON();
      delete message.rawPayload;
      if (!record.rawPayload) return message;
      try {
        const payload = parseWhatsAppPayload(record.rawPayload);
        const inner = unwrapMessage(payload);
        const media = mediaMessageDetails(payload);
        if (media) message.media = { available: true, mimetype: media.mimetype, filename: media.filename };
        message.viewOnce = Boolean(payload.message?.viewOnceMessageV2 || payload.message?.viewOnceMessage);
        message.quoted = quotedMessageDetails(payload);
        message.canReply = canQuoteMessage(record, payload);
        const location = inner.locationMessage || inner.liveLocationMessage;
        if (location) message.location = {
          latitude: location.degreesLatitude,
          longitude: location.degreesLongitude,
          live: Boolean(inner.liveLocationMessage),
          name: location.name || location.address || null,
        };
      } catch { /* Los mensajes legacy pueden no contener JSON utilizable. */ }
      return message;
    });
    res.json({ success: true, sessionId: contact.whatsappSession.sessionId, contact, messages });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

const mediaMessageDetails = (payload = {}) => {
  const message = payload.message?.ephemeralMessage?.message
    || payload.message?.viewOnceMessageV2?.message
    || payload.message?.viewOnceMessage?.message
    || payload.message?.documentWithCaptionMessage?.message
    || payload.message
    || {};
  const entry = message.imageMessage || message.videoMessage || message.audioMessage
    || message.documentMessage || message.stickerMessage;
  if (!entry) return null;
  return {
    mimetype: entry.mimetype || (message.stickerMessage ? "image/webp" : "application/octet-stream"),
    filename: entry.fileName || (message.stickerMessage ? "sticker.webp" : "archivo"),
  };
};

export const getMessageMedia = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const contact = await ownedContact(req);
    if (!contact) return res.status(404).json({ success: false, error: "Contacto no encontrado" });
    const message = await AiMessage.findOne({ where: { id: req.params.messageId, crmContactId: contact.id } });
    if (!message?.rawPayload) return res.status(404).json({ success: false, error: "El archivo multimedia no está disponible" });
    const payload = parseWhatsAppPayload(message.rawPayload);
    const details = mediaMessageDetails(payload);
    if (!details) return res.status(404).json({ success: false, error: "Este mensaje no contiene un archivo multimedia" });
    const session = sessionManager.getSession(req.user.id, contact.whatsappSession.sessionId);
    if (!session?.sock) return res.status(409).json({ success: false, error: "Conecta la sesión de WhatsApp para descargar el archivo" });
    const buffer = await downloadMediaMessage(payload, "buffer", {}, { logger: console, reuploadRequest: session.sock.updateMediaMessage });
    res.setHeader("Content-Type", details.mimetype);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(details.filename)}`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: `No se pudo descargar el archivo: ${error.message}` });
  }
};

export const updateContact = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const contact = await ownedContact(req);
    if (!contact) return res.status(404).json({ success: false, error: "Contacto no encontrado" });
    const values = {};
    for (const field of ["name", "notes", "tags"]) if (req.body[field] !== undefined) values[field] = req.body[field];
    if (statuses.has(req.body.status)) values.status = req.body.status;
    if (automationModes.has(req.body.automationMode)) values.automationMode = req.body.automationMode;
    if (req.body.priority !== undefined) values.priority = Math.min(5, Math.max(0, Number(req.body.priority)));
    await contact.update(values);
    res.json({ success: true, sessionId: contact.whatsappSession.sessionId, contact });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const markRead = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const contact = await ownedContact(req);
    if (!contact) return res.status(404).json({ success: false, error: "Contacto no encontrado" });
    await contact.update({ unreadCount: 0 });
    res.json({ success: true, sessionId: contact.whatsappSession.sessionId });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const sendManualMessage = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const content = String(body.message || "").trim();
    const mediaType = String(body.type || "text").toLowerCase();
    if (!content && mediaType === "text") return res.status(400).json({ success: false, error: "El mensaje es obligatorio" });
    const contact = await ownedContact(req);
    if (!contact) return res.status(404).json({ success: false, error: "Contacto no encontrado" });
    const session = sessionManager.getSession(req.user.id, contact.whatsappSession.sessionId);
    if (!session || session.status !== "open") return res.status(409).json({ success: false, error: "La sesión de WhatsApp no está conectada" });
    if (isInternalLidJid(contact.contactJid)) {
      return res.status(409).json({ success: false, error: "WhatsApp aún no entregó el número real de este contacto; no se enviará al identificador interno LID" });
    }
    const jid = phoneJidFromNumber(contact.phone);
    if (!jid) return res.status(400).json({ success: false, error: "El contacto no tiene un número de WhatsApp válido" });
    // Tomar el chat como humano debe quedar persistido antes de enviar. Así,
    // una respuesta IA que ya estaba procesándose lo detecta en su validación
    // final y no compite con el mensaje manual.
    await contact.update({ automationMode: "human" });
    let quoted;
    if (body.quotedMessageId) {
      const quotedRecord = await AiMessage.findOne({ where: { id: body.quotedMessageId, crmContactId: contact.id } });
      if (!quotedRecord?.rawPayload) return res.status(400).json({ success: false, error: "Ese elemento no se puede responder en WhatsApp" });
      const candidate = parseWhatsAppPayload(quotedRecord.rawPayload);
      if (!canQuoteMessage(quotedRecord, candidate)) {
        return res.status(400).json({ success: false, error: "WhatsApp no permite responder a ese elemento" });
      }
      quoted = candidate;
    }
    let outgoingContent;
    let outgoingType;
    let result;
    if (mediaType === "text") {
      outgoingType = "text";
      outgoingContent = content;
      try {
        result = await session.sock.sendMessage(jid, { text: content }, quoted ? { quoted } : undefined);
      } catch (error) {
        // A quoted payload can become incompatible after a Baileys upgrade. The
        // actual message is more important than preserving the visual quote.
        if (!quoted || !/reading ['"]message['"]|quoted/i.test(String(error?.message))) throw error;
        result = await session.sock.sendMessage(jid, { text: content });
      }
    } else {
      const payload = resolveMediaInput({ payload: body.payload, base64: body.base64, mimetype: body.mimetype });
      const messagePayload = buildMediaMessage({ type: mediaType, payload, caption: content, filename: body.filename, mimetype: body.mimetype });
      outgoingType = mediaType;
      outgoingContent = content || (mediaType === "audio" ? "[Audio enviado]" : `[${mediaType} enviado]`);
      result = await session.sock.sendMessage(jid, messagePayload, quoted ? { quoted } : undefined);
    }
    // Algunas versiones de Baileys no devuelven el WebMessageInfo al enviar
    // multimedia. El evento messages.upsert lo persistirá; no debemos intentar
    // leer result.key y convertir un envío correcto en un error HTTP.
    let message = null;
    if (result?.key?.id) {
      [message] = await AiMessage.findOrCreate({
        where: { whatsappSessionId: contact.whatsappSessionId, whatsappMessageId: result.key.id },
        defaults: { crmContactId: contact.id, contactJid: jid, contactNumber: contact.phone, messageTimestamp: new Date(), direction: "outgoing", role: "assistant", messageType: outgoingType, content: outgoingContent, rawPayload: JSON.stringify(result), metadata: JSON.stringify({ automatic: false, sentFromCrm: true }) },
      });
    }
    await contact.update({ lastMessageAt: new Date(), lastMessagePreview: outgoingContent.slice(0, 500) });
    res.json({ success: true, sessionId: contact.whatsappSession.sessionId, message, contact });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, error: error.message }); }
};

export const listImportSources = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const session = await ownedSession(req.user.id, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
    const sources = (await CrmImportSource.findAll({ where: { whatsappSessionId: session.id } })).map((item) => { const data = item.toJSON(); data.hasAuthValue = Boolean(data.authValue); data.authValue = ""; return data; });
    res.json({ success: true, sessionId: session.sessionId, sources });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const saveImportSource = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const session = await ownedSession(req.user.id, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
    parseSafeHttpUrl(req.body.url);
    const method = String(req.body.method || "GET").toUpperCase();
    if (!importMethods.has(method)) throw new Error("La importación solo admite métodos GET o POST");
    let source = null;
    if (req.body.id) {
      source = await CrmImportSource.findOne({ where: { id: req.body.id, whatsappSessionId: session.id } });
      if (!source) return res.status(404).json({ success: false, error: "La fuente de importación no pertenece a esta sesión" });
    }
    const oldSecret = source?.authValue || "";
    const values = { whatsappSessionId: session.id, name: req.body.name || "Sistema de ventas", enabled: req.body.enabled !== false, method, url: req.body.url, authType: req.body.authType || "none", authHeader: req.body.authHeader || "", authValue: req.body.authValue || oldSecret || null, headers: req.body.headers || {}, requestBody: req.body.requestBody || {}, responsePath: req.body.responsePath || "", fieldMapping: req.body.fieldMapping || { phone: "phone", name: "name", externalId: "id" } };
    source = source ? await source.update(values) : await CrmImportSource.create(values);
    res.json({ success: true, sessionId: session.sessionId, source: { ...source.toJSON(), authValue: "", hasAuthValue: Boolean(source.authValue) } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
};

export const runImport = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const source = await ownedImportSource(req);
    if (!source) return res.status(404).json({ success: false, error: "Fuente de importación no encontrada" });
    const headers = { "Content-Type": "application/json", ...(source.headers || {}) };
    if (source.authType === "bearer") headers.Authorization = `Bearer ${source.authValue}`;
    else if (source.authType === "basic") headers.Authorization = `Basic ${Buffer.from(source.authValue).toString("base64")}`;
    else if (["api_key", "custom_header"].includes(source.authType)) headers[source.authHeader || "X-API-Key"] = source.authValue;
    const method = String(source.method || "GET").toUpperCase();
    if (!importMethods.has(method)) throw new Error("La fuente guardada usa un método no permitido; edítala y elige GET o POST");
    const { payload } = await safeFetchJson(source.url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(source.requestBody || {}),
      timeoutMs: IMPORT_TIMEOUT_MS,
      maxBytes: MAX_IMPORT_RESPONSE_BYTES,
      maxRedirects: 3,
    });
    const records = source.responsePath ? getPath(payload, source.responsePath) : payload;
    if (!Array.isArray(records)) throw new Error("La ruta de respuesta no contiene una lista");
    let imported = 0;
    let invalidPhones = 0;
    for (const record of records) {
      const phone = normalizePhoneNumber(getPath(record, source.fieldMapping.phone));
      if (!phone) {
        invalidPhones += 1;
        continue;
      }
      const contactJid = phoneJidFromNumber(phone);
      const importedName = getPath(record, source.fieldMapping.name) || null;
      const externalId = String(getPath(record, source.fieldMapping.externalId) || "") || null;
      const [contact, created] = await CrmContact.findOrCreate({
        where: { whatsappSessionId: source.whatsappSessionId, phone },
        defaults: {
          contactJid,
          name: importedName,
          externalId,
          source: "http_import",
          status: "customer",
          metadata: { importedRecord: record },
        },
      });
      if (!created) {
        const changes = {
          contactJid,
          name: contact.name || importedName,
          externalId: externalId || contact.externalId,
          metadata: { ...(contact.metadata || {}), importedRecord: record },
        };
        // Importing proves the contact is already a customer, but never erases
        // a useful manual classification such as urgent or interested.
        if (contact.status === "new") changes.status = "customer";
        await contact.update(changes);
      }
      imported += 1;
    }
    await source.update({ lastImportedAt: new Date() });
    res.json({ success: true, sessionId: source.whatsappSession.sessionId, imported, invalidPhones, totalReceived: records.length });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
};

export const listCampaigns = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const requestedId = requestedSessionId(req);
    if (!requestedId) {
      return res.status(400).json({
        success: false,
        error: "Debes indicar sessionId. Las campañas siempre se consultan dentro de una sesión.",
      });
    }
    const session = await ownedSession(req.user.id, requestedId);
    if (!session) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
    const storedCampaigns = await CrmCampaign.findAll({
      where: { whatsappSessionId: session.id },
      include: [{ model: WhatsAppSession, as: "whatsappSession", attributes: ["sessionId"] }],
      order: [["createdAt", "DESC"]],
    });
    const campaigns = storedCampaigns.map((item) => {
      const campaign = item.toJSON();
      campaign.sessionId = campaign.whatsappSession?.sessionId || null;
      delete campaign.whatsappSession;
      campaign.hasMedia = Boolean(campaign.mediaStorageKey || campaign.mediaPayload || campaign.mediaUrl);
      delete campaign.mediaPayload;
      delete campaign.mediaStorageKey;
      return campaign;
    });
    res.json({ success: true, sessionId: requestedId, campaigns });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const createCampaign = async (req, res) => {
  let pendingStorageKey = null;
  let campaignPersisted = false;
  try {
    if (!await professionalGuard(req, res)) return;
    const sessionId = requestedSessionId(req);
    if (!sessionId) return res.status(400).json({ success: false, error: "Debes indicar la sesión de la campaña" });
    const session = await ownedSession(req.user.id, sessionId);
    if (!session) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
    const name = String(req.body.name || "").trim();
    const messageType = String(req.body.messageType || "text").toLowerCase();
    const message = String(req.body.message || "").trim();
    const allowedTypes = new Set(["text", "image", "video", "audio", "document"]);
    if (!name) return res.status(400).json({ success: false, error: "El nombre es obligatorio" });
    if (name.length > 255) return res.status(400).json({ success: false, error: "El nombre no puede superar 255 caracteres" });
    if (!allowedTypes.has(messageType)) return res.status(400).json({ success: false, error: "Tipo de mensaje no compatible" });
    if (messageType === "text" && !message) return res.status(400).json({ success: false, error: "El mensaje es obligatorio" });
    if (message.length > (messageType === "text" ? 4096 : 1024)) return res.status(400).json({ success: false, error: `El mensaje supera el limite de ${messageType === "text" ? 4096 : 1024} caracteres` });

    const mediaPayload = messageType === "text"
      ? null
      : resolveMediaInput({
        payload: req.body.mediaPayload,
        base64: req.body.mediaBase64 || req.body.base64,
        mimetype: req.body.mediaMimeType || req.body.mimetype,
      });
    let mediaUrl = messageType === "text" ? null : (req.body.mediaUrl || null);
    let mediaMimeType = messageType === "text" ? null : (req.body.mediaMimeType || null);
    if (messageType !== "text") {
      const storedMedia = await storeCampaignMedia(mediaPayload || mediaUrl, mediaMimeType);
      pendingStorageKey = storedMedia.storageKey;
      mediaMimeType = storedMedia.preparedMedia.mimeType || mediaMimeType;
      buildMediaMessage({
        type: messageType,
        caption: message,
        filename: req.body.mediaFilename,
        mimetype: mediaMimeType,
        preparedMedia: storedMedia.preparedMedia,
      });
      // A URL remains in the database; base64 is represented only by its opaque key.
      mediaUrl = storedMedia.storageKey ? null : String(mediaPayload || mediaUrl).trim();
    }
    const { where, filters } = campaignAudienceWhere(session.id, req.body.filters, req.body.contactIds);
    const campaign = await sequelize.transaction(async (transaction) => {
      const contacts = await CrmContact.findAll({ where, transaction });
      const createdCampaign = await CrmCampaign.create({
        whatsappSessionId: session.id,
        name,
        status: req.body.scheduledAt ? "scheduled" : "draft",
        messageType,
        message,
        mediaUrl,
        mediaPayload: null,
        mediaStorageKey: pendingStorageKey,
        mediaMimeType,
        mediaFilename: req.body.mediaFilename ? String(req.body.mediaFilename).slice(0, 255) : null,
        filters,
        scheduledAt: req.body.scheduledAt || null,
        delayMs: Math.min(60000, Math.max(1000, Number(req.body.delayMs || 1500))),
        totalRecipients: contacts.length,
      }, { transaction });
      if (contacts.length) {
        await CrmCampaignRecipient.bulkCreate(
          contacts.map((contact) => ({ crmCampaignId: createdCampaign.id, crmContactId: contact.id, phone: contact.phone })),
          { transaction },
        );
      }
      return createdCampaign;
    });
    campaignPersisted = true;
    if (campaign.status === "scheduled" && campaign.scheduledAt <= new Date()) campaignService.start(campaign.id);
    const responseCampaign = campaign.toJSON();
    delete responseCampaign.mediaPayload;
    delete responseCampaign.mediaStorageKey;
    responseCampaign.hasMedia = Boolean(pendingStorageKey || mediaUrl);
    responseCampaign.maxMediaBytes = MAX_MEDIA_BYTES;
    responseCampaign.sessionId = session.sessionId;
    res.json({ success: true, campaign: responseCampaign });
  } catch (error) {
    if (pendingStorageKey && !campaignPersisted) {
      try { await deleteCampaignMedia(pendingStorageKey); }
      catch (cleanupError) { console.error("No se pudo limpiar multimedia de campana fallida:", cleanupError.message); }
    }
    res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }
};

export const previewCampaignAudience = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const session = await ownedSession(req.user.id, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
    const { where, filters } = campaignAudienceWhere(session.id, req.body.filters, req.body.contactIds);
    const sampleWhere = {
      ...where,
      name: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
    };
    const [count, sampleContacts] = await Promise.all([
      CrmContact.count({ where }),
      CrmContact.findAll({
        where: sampleWhere,
        attributes: ["id", "name", "phone", "status"],
        order: [["name", "ASC"], ["id", "ASC"]],
        limit: 6,
      }),
    ]);
    res.json({
      success: true,
      sessionId: session.sessionId,
      count,
      filters,
      samples: sampleContacts.map((contact) => ({
        id: contact.id,
        name: contact.name || contact.phone,
        phone: contact.phone,
        status: contact.status,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const runCampaign = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const campaign = await ownedCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    if (campaign.status === "running") {
      return res.status(409).json({ success: false, error: "La campaña ya está en ejecución" });
    }
    if (campaign.status === "completed") {
      return res.status(409).json({ success: false, error: "La campaña ya fue completada" });
    }
    const activeSession = sessionManager.getSession(req.user.id, campaign.whatsappSession.sessionId);
    if (!activeSession || activeSession.status !== "open") {
      return res.status(409).json({ success: false, error: "Conecta la sesión de WhatsApp antes de ejecutar la campaña" });
    }
    await campaign.update({ status: "draft", lastError: null, completedAt: null });
    campaignService.start(campaign.id);
    res.status(202).json({ success: true, message: "Campaña aceptada para ejecución" });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, error: error.message }); }
};

export const pauseCampaign = async (req, res) => {
  try {
    if (!await professionalGuard(req, res)) return;
    const campaign = await ownedCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, error: "Campaña no encontrada" });
    await campaign.update({ status: "paused" });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};
