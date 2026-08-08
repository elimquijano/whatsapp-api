import express from "express";
import cors from "cors";
import sequelize from "./src/database/db.js";
import User from "./src/models/User.js";
import Role from "./src/models/Role.js";
import Plan from "./src/models/Plan.js";
import WhatsAppSession from "./src/models/WhatsAppSession.js";
import AiSessionConfig from "./src/models/AiSessionConfig.js";
import CrmContact from "./src/models/CrmContact.js";
import "./src/models/CrmImportSource.js";
import "./src/models/CrmCampaign.js";
import "./src/models/CrmCampaignRecipient.js";
import "./src/models/CampaignAiConfig.js";
import "./src/models/AiPermission.js";
import "./src/models/AiWorkflowNode.js";
import "./src/models/AiWorkflowEdge.js";
import "./src/models/AiMainWorkflow.js";
import "./src/models/AiMainWorkflowNode.js";
import "./src/models/AiMainWorkflowEdge.js";
import "./src/models/AiWorkflowExecution.js";
import "./src/models/AiWorkflowNodeExecution.js";
import AiMessage from "./src/models/AiMessage.js";
import sessionManager from "./src/manager/SessionManager.js";
import * as authController from "./src/controllers/authController.js";
import * as userController from "./src/controllers/userController.js";
import * as aiCrmController from "./src/controllers/aiCrmController.js";
import * as crmController from "./src/controllers/crmController.js";
import * as campaignAiController from "./src/controllers/campaignAiController.js";
import campaignService from "./src/services/campaignService.js";
import { prepareMediaPayload, resolveMediaInput, sendMediaMessage, sendTextMessage } from "./src/services/messageService.js";
import { runDatabaseMigrations } from "./src/database/migrations.js";
import { sessionIdFromRequest } from "./src/utils/sessionScope.js";
import { isInternalLidJid, normalizePhoneNumber, phoneJidFromNumber } from "./src/utils/whatsappIdentity.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Op } from "sequelize";

const app = express();
let serverReady = false;
const standardJsonBody = express.json();
const largeJsonBody = express.json({ limit: "15mb" });
const isLargeJsonRoute = (path, method) => method === "POST" && (
  path === "/api/v1/messages/media"
  || path === "/api/crm/campaigns"
  || /^\/api\/v1\/sessions\/[^/]+\/messages\/media$/.test(path)
  || /^\/api\/v1\/sessions\/[^/]+\/crm\/contacts\/[^/]+\/messages$/.test(path)
  || /^\/api\/v1\/sessions\/[^/]+\/crm\/campaigns$/.test(path)
  || /^\/api\/v1\/sessions\/[^/]+\/crm\/campaign-ai\/generate$/.test(path)
);

app.use(cors());
// Keep the normal JSON ceiling for every route. The two authenticated routes
// that accept base64 install their larger parser after authentication.
app.use((req, res, next) => {
  const normalizedPath = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
  if (isLargeJsonRoute(normalizedPath, req.method)) return next();
  return standardJsonBody(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (serverReady) return next();
  return res.status(503).json({ success: false, error: "Servidor iniciando, intente nuevamente en unos segundos" });
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, error: "Token no proporcionado" });

  // 1. Intentar validar como JWT (Token de sesión temporal)
  jwt.verify(token, process.env.JWT_SECRET, async (err, decodedUser) => {
    if (!err) {
      req.user = decodedUser;
      return next();
    }

    // 2. Si el JWT falla (expirado o inválido), intentar validar como API Key permanente
    try {
      const user = await User.findOne({ 
        where: { apiKey: token },
        include: [{ model: Role, as: "roleData" }]
      });
      
      if (user) {
        req.user = { 
          id: user.id, 
          username: user.username, 
          role: user.roleData?.name || "user" 
        };
        return next();
      }
      
      return res.status(403).json({ success: false, error: "Token inválido o expirado" });
    } catch (dbError) {
      return res.status(500).json({ success: false, error: "Error de servidor al validar token" });
    }
  });
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ success: false, error: "Acceso denegado: Se requieren permisos de administrador" });
  }
};

const checkPlanExpiration = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });

    if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
      return res.status(403).json({ success: false, error: "Tu plan ha expirado. Por favor, renueva tu suscripción." });
    }
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const checkMediaMessagingAccess = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { include: [{ model: Plan, as: "planData" }] });
    if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
      return res.status(403).json({ success: false, error: "Tu plan ha expirado. Por favor, renueva tu suscripción." });
    }
    if (!user.planData?.features?.includes("media")) {
      return res.status(403).json({ success: false, error: "Tu plan no incluye mensajes multimedia" });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const requestedSessionId = (req) => sessionIdFromRequest(req, { allowLegacyBody: true });

const findOwnedSessionRecord = (userId, sessionId) => WhatsAppSession.findOne({
  where: { userId, sessionId },
});

const requireOpenSession = async (req, res) => {
  const sessionId = requestedSessionId(req);
  if (!sessionId) {
    res.status(400).json({
      success: false,
      error: "Debes indicar sessionId. La API nunca selecciona una sesión automáticamente.",
    });
    return null;
  }

  const record = await findOwnedSessionRecord(req.user.id, sessionId);
  if (!record) {
    res.status(404).json({ success: false, error: "La sesión no existe o no pertenece a tu cuenta" });
    return null;
  }

  const live = sessionManager.getSession(req.user.id, sessionId);
  if (!live || live.status !== "open") {
    res.status(409).json({ success: false, error: "La sesión de WhatsApp no está conectada" });
    return null;
  }
  return { sessionId, record, live };
};

const sendText = async (req, res) => {
  try {
    const scoped = await requireOpenSession(req, res);
    if (!scoped) return;
    const result = await sendTextMessage({
      sock: scoped.live.sock,
      recipient: req.body.recipient,
      body: req.body.body,
    });
    res.json({ success: true, sessionId: scoped.sessionId, message_id: result.key.id, status: "sent" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

const sendMedia = async (req, res) => {
  try {
    const scoped = await requireOpenSession(req, res);
    if (!scoped) return;
    const { recipient, type, payload, caption, filename } = req.body;
    const mediaInput = resolveMediaInput({ payload, base64: req.body.base64, mimetype: req.body.mimetype });
    const preparedMedia = await prepareMediaPayload(mediaInput, req.body.mimetype);
    const result = await sendMediaMessage({
      sock: scoped.live.sock,
      recipient,
      type,
      payload: mediaInput,
      caption,
      filename,
      mimetype: req.body.mimetype,
      preparedMedia,
    });
    res.json({ success: true, sessionId: scoped.sessionId, message_id: result.key.id, status: "sent" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

app.post("/api/auth/login", authController.login);
app.post("/api/auth/send-otp", authController.sendOTP);
app.post("/api/auth/register", authController.register);

app.get("/api/users/profile", authenticateToken, userController.getProfile);
app.put("/api/users/webhook", authenticateToken, userController.updateWebhook);
app.get("/api/users", authenticateToken, isAdmin, userController.getAllUsers);
app.post("/api/users", authenticateToken, isAdmin, userController.createUser);
app.put("/api/users/:id", authenticateToken, isAdmin, userController.updateUser);
app.delete("/api/users/:id", authenticateToken, isAdmin, userController.deleteUser);
app.get("/api/roles", authenticateToken, isAdmin, userController.getRoles);
app.get("/api/plans", authenticateToken, isAdmin, userController.getPlans);

// API canónica: toda operación funcional vive bajo una sesión explícita.
app.put("/api/v1/sessions/:sessionId/webhook", authenticateToken, userController.updateWebhook);
app.get("/api/v1/sessions/:sessionId/ai/config", authenticateToken, aiCrmController.getConfig);
app.put("/api/v1/sessions/:sessionId/ai/config", authenticateToken, aiCrmController.saveConfig);
app.put("/api/v1/sessions/:sessionId/ai/toggle", authenticateToken, aiCrmController.toggleAutomation);
app.post("/api/v1/sessions/:sessionId/ai/presets/sales", authenticateToken, aiCrmController.applySalesPreset);
app.get("/api/v1/sessions/:sessionId/ai/messages", authenticateToken, aiCrmController.getMessages);
app.get("/api/v1/sessions/:sessionId/ai/workflow-executions", authenticateToken, aiCrmController.listWorkflowExecutions);
app.get("/api/v1/sessions/:sessionId/ai/workflow-executions/:executionId", authenticateToken, aiCrmController.getWorkflowExecution);
app.post("/api/v1/sessions/:sessionId/ai/workflows/tasks/:taskKey/test", authenticateToken, aiCrmController.testWorkflowTask);
app.get("/api/v1/sessions/:sessionId/crm/contacts", authenticateToken, crmController.listContacts);
app.get("/api/v1/sessions/:sessionId/crm/contacts/:contactId/messages", authenticateToken, crmController.getContactMessages);
app.get("/api/v1/sessions/:sessionId/crm/contacts/:contactId/messages/:messageId/media", authenticateToken, crmController.getMessageMedia);
app.put("/api/v1/sessions/:sessionId/crm/contacts/:contactId", authenticateToken, crmController.updateContact);
app.put("/api/v1/sessions/:sessionId/crm/contacts/:contactId/read", authenticateToken, crmController.markRead);
app.post("/api/v1/sessions/:sessionId/crm/contacts/:contactId/messages", authenticateToken, crmController.sendManualMessage);
app.get("/api/v1/sessions/:sessionId/crm/import-sources", authenticateToken, crmController.listImportSources);
app.post("/api/v1/sessions/:sessionId/crm/import-sources", authenticateToken, crmController.saveImportSource);
app.post("/api/v1/sessions/:sessionId/crm/import-sources/:sourceId/run", authenticateToken, crmController.runImport);
app.get("/api/v1/sessions/:sessionId/crm/campaigns", authenticateToken, crmController.listCampaigns);
app.post("/api/v1/sessions/:sessionId/crm/campaigns/audience-preview", authenticateToken, crmController.previewCampaignAudience);
app.post("/api/v1/sessions/:sessionId/crm/campaigns", authenticateToken, crmController.requireProfessionalAccess, largeJsonBody, crmController.createCampaign);
app.post("/api/v1/sessions/:sessionId/crm/campaigns/:campaignId/run", authenticateToken, crmController.runCampaign);
app.post("/api/v1/sessions/:sessionId/crm/campaigns/:campaignId/pause", authenticateToken, crmController.pauseCampaign);
app.get("/api/v1/sessions/:sessionId/crm/campaign-ai/settings", authenticateToken, campaignAiController.getCampaignAiSettings);
app.put("/api/v1/sessions/:sessionId/crm/campaign-ai/settings", authenticateToken, campaignAiController.saveCampaignAiSettings);
app.post("/api/v1/sessions/:sessionId/crm/campaign-ai/generate", authenticateToken, largeJsonBody, campaignAiController.generateCampaignDraft);

// Alias anteriores conservados durante la transición. Los endpoints de
// mensajería antiguos también exigen account_id; ya no existe fallback.
app.get("/api/ai/sessions/:sessionId/config", authenticateToken, aiCrmController.getConfig);
app.put("/api/ai/sessions/:sessionId/config", authenticateToken, aiCrmController.saveConfig);
app.put("/api/ai/sessions/:sessionId/toggle", authenticateToken, aiCrmController.toggleAutomation);
app.post("/api/ai/sessions/:sessionId/presets/sales", authenticateToken, aiCrmController.applySalesPreset);
app.get("/api/ai/sessions/:sessionId/messages", authenticateToken, aiCrmController.getMessages);
app.get("/api/ai/sessions/:sessionId/workflow-executions", authenticateToken, aiCrmController.listWorkflowExecutions);
app.get("/api/ai/sessions/:sessionId/workflow-executions/:executionId", authenticateToken, aiCrmController.getWorkflowExecution);
app.post("/api/ai/sessions/:sessionId/workflows/tasks/:taskKey/test", authenticateToken, aiCrmController.testWorkflowTask);
app.get("/api/crm/sessions/:sessionId/contacts", authenticateToken, crmController.listContacts);
app.get("/api/crm/contacts/:contactId/messages", authenticateToken, crmController.getContactMessages);
app.get("/api/crm/contacts/:contactId/messages/:messageId/media", authenticateToken, crmController.getMessageMedia);
app.put("/api/crm/contacts/:contactId", authenticateToken, crmController.updateContact);
app.put("/api/crm/contacts/:contactId/read", authenticateToken, crmController.markRead);
app.post("/api/crm/contacts/:contactId/messages", authenticateToken, crmController.sendManualMessage);
app.get("/api/crm/sessions/:sessionId/import-sources", authenticateToken, crmController.listImportSources);
app.post("/api/crm/sessions/:sessionId/import-sources", authenticateToken, crmController.saveImportSource);
app.post("/api/crm/import-sources/:sourceId/run", authenticateToken, crmController.runImport);
app.get("/api/crm/campaigns", authenticateToken, crmController.listCampaigns);
app.post("/api/crm/campaigns", authenticateToken, crmController.requireProfessionalAccess, largeJsonBody, crmController.createCampaign);
app.post("/api/crm/campaigns/:campaignId/run", authenticateToken, crmController.runCampaign);
app.post("/api/crm/campaigns/:campaignId/pause", authenticateToken, crmController.pauseCampaign);

const connectWhatsApp = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Plan, as: 'planData' }]
    });

    const sessionRecords = await WhatsAppSession.findAll({ where: { userId: user.id }, attributes: ['id', 'sessionId'] });
    const maxSessions = user.planData?.maxSessions || 1;
    const bodySessionId = req.params?.sessionId || (req.body ? req.body.sessionId : null);
    const resetAuth = req.body?.resetAuth === true;

    const existingRecord = bodySessionId ? sessionRecords.find(record => record.sessionId === bodySessionId) : null;
    if (bodySessionId && !existingRecord) {
      return res.status(404).json({ success: false, error: "La sesión solicitada no pertenece al usuario" });
    }
    if (!bodySessionId && sessionRecords.length >= maxSessions) {
      return res.status(403).json({
        success: false,
        error: `Has alcanzado el límite de ${maxSessions} sesión(es) para tu plan ${user.planData?.name || 'Gratis'}.`
      });
    }

    const sessionId = bodySessionId || crypto.randomBytes(4).toString("hex");
    const session = resetAuth
      ? await sessionManager.resetSessionAuth(user.id, sessionId)
      : await sessionManager.createSession(user.id, sessionId);
    
    if (!session) throw new Error("No se pudo crear o recuperar la sesión");
    if (user.planData?.features?.includes("ai_crm")) {
      const sessionRecord = await WhatsAppSession.findOne({ where: { userId: user.id, sessionId } });
      if (sessionRecord) await aiCrmController.ensureIntroductoryAiConfig(sessionRecord.id);
    }

    res.json({ 
      success: true, 
      status: session.status || 'connecting', 
      hasQR: !!session.qrDataUrl, 
      sessionId: session.sessionId || sessionId 
    });
  } catch (error) {
    console.error("Error en connect:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

app.post("/api/whatsapp/connect", authenticateToken, checkPlanExpiration, connectWhatsApp);
app.post("/api/v1/sessions/:sessionId/connect", authenticateToken, checkPlanExpiration, connectWhatsApp);

const listWhatsAppSessions = async (req, res) => {
  try {
    const sessionRecords = await WhatsAppSession.findAll({ where: { userId: req.user.id } });
    const webhooksBySession = new Map(sessionRecords.map(record => [record.sessionId, record.webhookUrl || ""]));
    const aiConfigs = await AiSessionConfig.findAll({ where: { whatsappSessionId: sessionRecords.map(record => record.id) } });
    const aiBySession = new Map(aiConfigs.map(config => [config.whatsappSessionId, config.autoReplyEnabled]));
    const recordByPublicId = new Map(sessionRecords.map(record => [record.sessionId, record]));
    const liveBySession = new Map(sessionManager.getUserSessions(req.user.id).map(session => [session.sessionId, session]));
    const sessions = sessionRecords.map(record => {
      const live = liveBySession.get(record.sessionId);
      const connectedJid = String(live?.sock?.user?.id || "");
      const phoneNumber = connectedJid ? connectedJid.split(":")[0].split("@")[0] : null;
      return {
        sessionId: record.sessionId,
        phoneNumber: phoneNumber || record.phoneNumber || null,
        displayName: live?.sock?.user?.name || record.displayName || null,
        status: live?.status || "disconnected",
        qr: live?.qrDataUrl || null,
        reconnectAttempt: live?.reconnectAttempt || 0,
        lastError: live?.lastDisconnect?.message || null,
        disconnectCode: live?.lastDisconnect?.statusCode || null,
        webhookUrl: webhooksBySession.get(record.sessionId) || "",
        aiAutoReplyEnabled: Boolean(aiBySession.get(recordByPublicId.get(record.sessionId)?.id))
      };
    });
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

app.get("/api/whatsapp/sessions", authenticateToken, listWhatsAppSessions);
app.get("/api/v1/sessions", authenticateToken, listWhatsAppSessions);

const getWhatsAppStatus = async (req, res) => {
  try {
    const session = sessionManager.getSession(req.user.id, req.params.sessionId);
    if (!session) {
      const record = await WhatsAppSession.findOne({ where: { userId: req.user.id, sessionId: req.params.sessionId } });
      if (!record) return res.status(404).json({ success: false, error: "Sesión no encontrada" });
      return res.json({ success: true, status: "disconnected", message: "WhatsApp no está vinculado; la configuración permanece guardada" });
    }

    res.json({
      success: true,
      status: session.status,
      qr: session.qrDataUrl,
      userId: session.userId,
      sessionId: session.sessionId,
      reconnectAttempt: session.reconnectAttempt || 0,
      lastError: session.lastDisconnect?.message || null,
      disconnectCode: session.lastDisconnect?.statusCode || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

app.get("/api/whatsapp/status/:sessionId", authenticateToken, getWhatsAppStatus);
app.get("/api/v1/sessions/:sessionId/status", authenticateToken, getWhatsAppStatus);

// API V1 - MESSAGING CORE. sessionId es obligatorio tanto en la ruta canónica
// como en el alias anterior mediante account_id.
app.post("/api/v1/sessions/:sessionId/messages/text", authenticateToken, checkPlanExpiration, sendText);
app.post("/api/v1/sessions/:sessionId/messages/media", authenticateToken, checkMediaMessagingAccess, largeJsonBody, sendMedia);
app.post("/api/v1/messages/text", authenticateToken, checkPlanExpiration, sendText);
app.post("/api/v1/messages/media", authenticateToken, checkMediaMessagingAccess, largeJsonBody, sendMedia);

const logoutWhatsApp = async (req, res) => {
  try {
    const sessionId = requestedSessionId(req);
    if (!sessionId) return res.status(400).json({ success: false, error: "Debe proporcionar el sessionId" });
    const record = await findOwnedSessionRecord(req.user.id, sessionId);
    if (!record) return res.status(404).json({ success: false, error: "La sesión no existe o no pertenece a tu cuenta" });
    await sessionManager.disconnectSession(req.user.id, sessionId, { logout: true, archiveAuth: true });
    res.json({ success: true, status: "disconnected", message: "WhatsApp fue desvinculado; la configuración CRM permanece guardada" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

app.post("/api/whatsapp/logout", authenticateToken, logoutWhatsApp);
app.post("/api/v1/sessions/:sessionId/logout", authenticateToken, logoutWhatsApp);

app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ success: false, error: "El cuerpo de la solicitud supera el límite permitido" });
  }
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ success: false, error: "El cuerpo JSON no es válido" });
  }
  return next(error);
});

const startServer = async () => {
  let httpServer;
  try {
    const port = process.env.PORT || 3000;

    // Reserva el puerto antes de abrir la BD o restaurar WhatsApp. Una segunda
    // instancia falla aquí y nunca conecta la misma sesión en Baileys.
    httpServer = await new Promise((resolve, reject) => {
      const candidate = app.listen(port, "0.0.0.0");
      candidate.once("listening", () => resolve(candidate));
      candidate.once("error", reject);
    });
    
    await sequelize.authenticate();
    console.log("✅ Conexión a MySQL establecida.");

    // En el arranque solo crea las tablas que todavía no existan. `alter: true`
    // no es idempotente con índices UNIQUE en MySQL y puede añadir un índice
    // duplicado en cada reinicio hasta alcanzar el límite de 64 claves.
    // Los cambios de esquema sobre tablas existentes deben hacerse mediante
    // migraciones explícitas, no durante el inicio del servidor.
    await sequelize.sync();
    await runDatabaseMigrations(sequelize);

    // Elimina registros internos de Baileys guardados por versiones anteriores.
    const unsupportedMessages = await AiMessage.findAll({ where: { [Op.or]: [{ messageType: "unsupported" }, { content: "[Mensaje no compatible]" }] }, attributes: ["id", "crmContactId"] });
    const contactsWithUnsupportedPreview = await CrmContact.findAll({ where: { lastMessagePreview: "[Mensaje no compatible]" }, attributes: ["id"] });
    const affectedContactIds = [...new Set([
      ...unsupportedMessages.map(message => message.crmContactId).filter(Boolean),
      ...contactsWithUnsupportedPreview.map(contact => contact.id),
    ])];
    if (unsupportedMessages.length) await AiMessage.destroy({ where: { id: { [Op.in]: unsupportedMessages.map(message => message.id) } } });
    for (const contactId of affectedContactIds) {
      const latestMessage = await AiMessage.findOne({ where: { crmContactId: contactId }, order: [["messageTimestamp", "DESC"]] });
      await CrmContact.update({ lastMessageAt: latestMessage?.messageTimestamp || null, lastMessagePreview: latestMessage?.content?.slice(0, 500) || null }, { where: { id: contactId } });
    }

    // Vincula mensajes creados antes del CRM con su ficha de contacto.
    const messagesWithoutContact = await AiMessage.findAll({ where: { crmContactId: null }, limit: 5000 });
    for (const message of messagesWithoutContact) {
      if (isInternalLidJid(message.contactJid)) continue;
      const phone = normalizePhoneNumber(message.contactJid || message.contactNumber);
      const contactJid = phoneJidFromNumber(phone);
      if (!phone || !contactJid) continue;
      const [contact] = await CrmContact.findOrCreate({
        where: { whatsappSessionId: message.whatsappSessionId, phone },
        defaults: { contactJid, status: "new", source: "whatsapp", lastMessageAt: message.messageTimestamp || message.createdAt, lastMessagePreview: message.content.slice(0, 500) },
      });
      await message.update({ crmContactId: contact.id, contactNumber: phone, contactJid });
    }

    // Migra webhooks guardados anteriormente como JSON a la tabla normalizada.
    const usersWithLegacyWebhooks = await User.findAll();
    for (const user of usersWithLegacyWebhooks) {
      for (const [sessionId, webhookUrl] of Object.entries(user.sessionWebhooks || {})) {
        if (webhookUrl) await WhatsAppSession.upsert({ userId: user.id, sessionId, webhookUrl });
      }
    }
    console.log("📊 Base de datos sincronizada.");

    // Restaurar sesiones persistentes de WhatsApp
    await sessionManager.restoreSessions();

    // CREACIÓN DE ROLES ROBUSTA
    const [adminRole] = await Role.findOrCreate({ 
      where: { name: "admin" }, 
      defaults: { name: "admin", permissions: ["whatsapp", "admin", "users"] } 
    });
    
    await Role.findOrCreate({ 
      where: { name: "user" }, 
      defaults: { name: "user", permissions: ["whatsapp"] } 
    });

    // CONFIGURACIÓN DE PLANES COMERCIALES
    const [trialPlan] = await Plan.findOrCreate({
      where: { name: "Free Trial" },
      defaults: { 
        name: "Free Trial", 
        maxSessions: 1, 
        price: 0, 
        features: ["text", "media", "files"] 
      }
    });

    const [premiumPlan] = await Plan.findOrCreate({
      where: { name: "Premium" },
      defaults: { 
        name: "Premium", 
        maxSessions: 1, 
        price: 3, 
        features: ["text", "media", "files", "webhook"]
      }
    });

    const [professionalPlan] = await Plan.findOrCreate({
      where: { name: "Profesional" },
      defaults: { 
        name: "Profesional", 
        maxSessions: 5, // Un límite técnico razonable pero no comercializado
        price: 7, 
        features: ["text", "media", "files", "webhook", "ai_crm"]
      }
    });

    // FORZAR ACTUALIZACIÓN DE LÓGICA COMERCIAL
    await trialPlan.update({ maxSessions: 1, price: 0, features: ["text", "media", "files", "webhook"] });
    await premiumPlan.update({ maxSessions: 1, price: 3, features: ["text", "media", "files", "webhook"] });
    await professionalPlan.update({ maxSessions: 5, price: 7, features: ["text", "media", "files", "webhook", "ai_crm"] });

    // Migra los nombres anteriores y conserva las asignaciones de usuarios.
    for (const [legacyName, targetPlan] of [["Trial", trialPlan], ["Basic", premiumPlan], ["Professional", professionalPlan]]) {
      const legacyPlan = await Plan.findOne({ where: { name: legacyName } });
      if (legacyPlan) {
        await User.update({ planId: targetPlan.id }, { where: { planId: legacyPlan.id } });
        await legacyPlan.destroy();
      }
    }

    // Toda sesión Profesional nace con un ejemplo seguro y pausado. No se
    // sobrescriben configuraciones o agentes que el usuario ya haya creado.
    const professionalUsers = await User.findAll({ where: { planId: professionalPlan.id }, attributes: ["id"] });
    const professionalUserIds = professionalUsers.map((user) => user.id);
    if (professionalUserIds.length) {
      const professionalSessions = await WhatsAppSession.findAll({
        where: { userId: { [Op.in]: professionalUserIds } },
        attributes: ["id", "sessionId"],
      });
      for (const session of professionalSessions) {
        try {
          await aiCrmController.ensureIntroductoryAiConfig(session.id);
        } catch (error) {
          console.warn(`No se pudo crear el ejemplo IA de la sesión ${session.sessionId}: ${error.message}`);
        }
      }
    }

    const userCount = await User.count();
    if (userCount === 0) {
      await User.create({
        username: process.env.INITIAL_ADMIN_USERNAME || "admin",
        whatsappNumber: process.env.INITIAL_ADMIN_WHATSAPP || "5215500000000",
        password: process.env.INITIAL_ADMIN_PASSWORD || "admin_password_123",
        roleId: adminRole.id,
        planId: trialPlan.id
      });
      console.log(`👤 Usuario admin creado: ${process.env.INITIAL_ADMIN_USERNAME || "admin"}`);
    } else {
      // Si ya existe, aseguramos que tenga un plan para evitar errores
      const admin = await User.findOne({ where: { username: process.env.INITIAL_ADMIN_USERNAME || "admin" } });
      if (admin && !admin.planId) {
        admin.planId = trialPlan.id;
        await admin.save();
        console.log("✅ Plan 'Gratis' asignado al administrador existente.");
      }
    }

    // Tarea programada: Limpiar sesiones expiradas cada hora
    setInterval(() => {
      sessionManager.cleanupExpiredSessions();
    }, 60 * 60 * 1000);

    // Reanuda campañas programadas cuya fecha ya llegó.
    setInterval(() => campaignService.runDueCampaigns().catch(error => console.error("Error revisando campañas:", error.message)), 60 * 1000);

    serverReady = true;
    console.log(`🚀 Servidor SaaS en puerto ${port}`);
  } catch (error) {
    if (httpServer) {
      await new Promise(resolve => httpServer.close(resolve));
      await sequelize.close().catch(() => {});
    }
    if (error?.code === "EADDRINUSE") {
      console.error(`⛔ Ya existe una instancia del backend usando el puerto ${process.env.PORT || 3000}. No se iniciará otra para evitar conflictos de sesión.`);
    } else {
      console.error("❌ Error fatal al iniciar:", error);
    }
    process.exitCode = 1;
  }
};

startServer();
