import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestWaWebVersion,
} from "@whiskeysockets/baileys";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import QRCode from "qrcode";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import aiCrmService from "../services/aiCrmService.js";
import { normalizePhoneNumber, resolveWhatsAppIdentity } from "../utils/whatsappIdentity.js";
import { repairStoredLidContacts } from "../services/crmIdentityService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VERSION_CACHE_TTL_MS = 30 * 60 * 1000;
const LAST_KNOWN_WA_VERSION = [2, 3000, 1044015310];

const parseWaVersion = (value) => {
  if (Array.isArray(value) && value.length === 3) {
    const parsed = value.map(Number);
    return parsed.every(Number.isInteger) ? parsed : null;
  }

  if (typeof value !== "string") return null;
  const parsed = value.split(/[.,]/).map(part => Number(part.trim()));
  return parsed.length === 3 && parsed.every(Number.isInteger) ? parsed : null;
};

class SessionManager {
  constructor() {
    this.sessions = new Map(); // userId (string) -> Map(sessionId -> sessionData)
    this.connectionPromises = new Map();
    this.reconnectTimers = new Map();
    this.reconnectAttempts = new Map();
    this.sessionGenerations = new Map();
    this.waVersionCache = null;
    this.logger = pino({
      level: "info",
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }

  async resolveWaWebVersion({ force = false } = {}) {
    const configuredVersion = parseWaVersion(process.env.WA_WEB_VERSION);
    if (configuredVersion) {
      return { version: configuredVersion, source: "WA_WEB_VERSION" };
    }

    if (!force && this.waVersionCache && Date.now() - this.waVersionCache.fetchedAt < VERSION_CACHE_TTL_MS) {
      return this.waVersionCache;
    }

    try {
      const result = await fetchLatestWaWebVersion();
      const version = parseWaVersion(result?.version);
      if (!result?.isLatest || !version) {
        throw result?.error || new Error("WhatsApp Web no devolvió una versión válida");
      }

      this.waVersionCache = { version, source: "web.whatsapp.com", fetchedAt: Date.now() };
    } catch (error) {
      const previousVersion = parseWaVersion(this.waVersionCache?.version);
      this.waVersionCache = {
        version: previousVersion || LAST_KNOWN_WA_VERSION,
        source: previousVersion ? "memory-cache" : "last-known",
        fetchedAt: Date.now(),
      };
      this.logger.warn({ error: error.message, version: this.waVersionCache.version }, "No se pudo consultar la versión de WhatsApp Web; usando respaldo");
    }

    return this.waVersionCache;
  }

  async createSession(rawUserId, sessionId) {
    const userId = String(rawUserId); // Normalizar a string
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new Map());
    }

    const userSessions = this.sessions.get(userId);
    const sessionKey = `${userId}:${sessionId}`;

    // Evitar duplicados para este sessionId específico
    if (userSessions.has(sessionId)) {
      const sess = userSessions.get(sessionId);
      if (["open", "connecting", "waiting_qr", "reconnecting"].includes(sess.status)) {
        return sess;
      }
    }

    if (this.connectionPromises.has(sessionKey)) {
      return this.connectionPromises.get(sessionKey);
    }

    const connectionPromise = this.initializeSession(userId, sessionId, userSessions, sessionKey)
      .finally(() => {
        if (this.connectionPromises.get(sessionKey) === connectionPromise) {
          this.connectionPromises.delete(sessionKey);
        }
      });
    this.connectionPromises.set(sessionKey, connectionPromise);
    return connectionPromise;
  }

  async initializeSession(userId, sessionId, userSessions, sessionKey) {
    await WhatsAppSession.findOrCreate({ where: { userId, sessionId } });
    this.clearReconnectTimer(sessionKey);
    const generation = (this.sessionGenerations.get(sessionKey) || 0) + 1;
    this.sessionGenerations.set(sessionKey, generation);

    const sessionDir = path.join(__dirname, "../../sessions", `auth_${userId}_${sessionId}`);
    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
    } catch (e) {
      this.logger.error("Error creando directorio de sesión:", e);
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const waVersion = await this.resolveWaWebVersion();

      this.logger.info({ version: waVersion.version, source: waVersion.source }, "Versión de WhatsApp Web seleccionada");

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        logger: this.logger,
        printQRInTerminal: false,
        browser: Browsers.windows("Chrome"),
        version: waVersion.version,
      });

      const sessionData = {
        sock,
        qrDataUrl: null,
        status: "connecting",
        userId,
        sessionId,
        generation,
        reconnectAttempt: this.reconnectAttempts.get(sessionKey) || 0,
        lastDisconnect: null,
      };

      userSessions.set(sessionId, sessionData);
      const isCurrentSession = () => (
        userSessions.get(sessionId) === sessionData
        && this.sessionGenerations.get(sessionKey) === generation
      );

      sock.ev.on("connection.update", async (update) => {
        try {
          const { connection, lastDisconnect, qr } = update;

          // Los eventos de un socket reemplazado nunca deben alterar al socket vigente.
          if (!isCurrentSession()) return;

          if (qr) {
            const qrDataUrl = await QRCode.toDataURL(qr);
            if (!isCurrentSession()) return;
            sessionData.status = "waiting_qr";
            sessionData.qrDataUrl = qrDataUrl;
            sessionData.lastDisconnect = null;
          }

          if (connection === "close") {
            const disconnect = this.describeDisconnect(lastDisconnect?.error);
            sessionData.status = "closed";
            sessionData.qrDataUrl = null;
            sessionData.lastDisconnect = disconnect;

            this.logger.warn({
              userId,
              sessionId,
              statusCode: disconnect.statusCode,
              reason: disconnect.reason,
              location: disconnect.location,
              error: disconnect.message,
            }, "Conexión de WhatsApp cerrada");

            if (this.shouldReconnect(disconnect)) {
              this.scheduleReconnect(userId, sessionId, sessionData, sessionKey);
            } else {
              if (disconnect.statusCode === 405) this.waVersionCache = null;
              sessionData.status = disconnect.statusCode === DisconnectReason.loggedOut ? "logged_out" : "error";
              this.reconnectAttempts.delete(sessionKey);
            }
          } else if (connection === "open") {
            this.clearReconnectTimer(sessionKey);
            this.reconnectAttempts.delete(sessionKey);
            sessionData.status = "open";
            sessionData.qrDataUrl = null;
            sessionData.reconnectAttempt = 0;
            sessionData.lastDisconnect = null;
            const connectedJid = String(sock.user?.id || "");
            const sessionIdentity = {};
            const connectedPhone = normalizePhoneNumber(connectedJid);
            if (connectedPhone) sessionIdentity.phoneNumber = connectedPhone;
            if (sock.user?.name) sessionIdentity.displayName = sock.user.name;
            if (Object.keys(sessionIdentity).length) {
              await WhatsAppSession.update(sessionIdentity, { where: { userId, sessionId } });
            }
            const openedSessionRecord = await WhatsAppSession.findOne({ where: { userId, sessionId } });
            const repair = await repairStoredLidContacts({ sock, sessionRecord: openedSessionRecord });
            if (repair.repaired || repair.unresolved) {
              this.logger.info({ userId, sessionId, ...repair }, "Reconciliacion de contactos LID completada");
            }
            this.logger.info(`✅ Conectado: Usuario ${userId}, Sesión ${sessionId}`);
          }
        } catch (error) {
          this.logger.error({ userId, sessionId, error: error.message }, "Error manejando estado de conexión");
        }
      });

      // WEBHOOK HANDLING
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        try {
          if (!isCurrentSession()) return;
          if (!['notify', 'append'].includes(type)) return;
          
          const user = await User.findByPk(userId);
          const sessionRecord = await WhatsAppSession.findOne({ where: { userId, sessionId } });
          const webhookUrl = sessionRecord?.webhookUrl || user?.sessionWebhooks?.[sessionId];
          if (!user) return;

          // Verificar expiración del plan
          if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
            this.logger.warn(`⛔ Plan expirado para usuario ${userId}. Webhook bloqueado.`);
            return;
          }

          const tasks = [];
          for (const msg of messages) {
            if (!msg.message) continue;

            // messages.upsert también contiene eventos internos de Baileys.
            // Solo los mensajes con contenido real llegan a BD, IA o webhook.
            const extractedMessage = aiCrmService.extractMessage(msg);
            if (!extractedMessage) continue;

            const identity = await resolveWhatsAppIdentity({ sock, msg });
            if (!identity.resolved) {
              this.logger.warn({
                userId,
                sessionId,
                messageId: msg.key.id,
                hasLid: Boolean(identity.lidJid),
              }, "Mensaje omitido del CRM porque WhatsApp no entrego un numero PN verificable");
            } else {
              this.logger.info({
                userId,
                sessionId,
                senderNumber: identity.phone,
                pushName: msg.pushName || null,
              }, "Numero real de WhatsApp resuelto");
            }

            // Prepare payload
            const payload = {
              event: msg.key.fromMe ? 'message.sent' : 'message.received',
              instanceId: sessionId,
              data: {
                id: msg.key.id,
                from: identity.phoneJid,
                senderJid: identity.phoneJid,
                senderNumber: identity.phone,
                pushName: msg.pushName,
                message: msg.message,
                timestamp: msg.messageTimestamp,
                fromMe: msg.key.fromMe
              }
            };

            // IA CRM directa: guarda todos los mensajes en BD y responde solo si
            // el switch automático de esta sesión está activado.
            if (identity.resolved) {
              tasks.push(aiCrmService
                .handleMessage({ userId, sessionId, sock, msg, identity, allowAutomation: type === 'notify' })
                .catch((err) => {
                  const log = err.code === "AI_MODEL_INVALID_JSON" ? this.logger.warn.bind(this.logger) : this.logger.error.bind(this.logger);
                  log({ userId, sessionId, code: err.code || "AI_CRM_ERROR", error: err.message }, "Fallo procesando IA CRM");
                }));
            }

            // El webhook comercial anterior sigue disponible e independiente.
            if (webhookUrl && type === 'notify') {
              fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              }).catch(err => this.logger.error(`Webhook error for user ${userId}:`, err.message));
            }
          }
          await Promise.allSettled(tasks);
        } catch (error) {
          this.logger.error("Error processing webhook:", error);
        }
      });

      sock.ev.on("call", async (calls) => {
        if (!isCurrentSession()) return;
        for (const call of calls || []) {
          try {
            const ownPhone = normalizePhoneNumber(sock.user?.id);
            const chatPhone = normalizePhoneNumber(call.chatId);
            // En llamadas salientes Baileys informa el JID propio en chatId y
            // el destinatario en from. callerPn no representa de forma fiable
            // quién inició la llamada.
            const fromMe = Boolean(ownPhone && chatPhone && ownPhone === chatPhone)
              || Boolean(call.fromMe === true);
            const remoteJid = fromMe ? (call.callerPn || call.from) : (call.callerPn || call.from || call.chatId);
            const identity = await resolveWhatsAppIdentity({
              sock,
              msg: { key: { remoteJid, remoteJidAlt: call.callerPn } },
            });
            if (!identity.resolved) {
              this.logger.warn({ userId, sessionId, callId: call.id }, "Llamada omitida porque no se pudo resolver el número");
              continue;
            }
            await aiCrmService.handleCall({ userId, sessionId, call, identity, fromMe });
          } catch (error) {
            this.logger.error({ userId, sessionId, callId: call?.id, error: error.message }, "Error procesando llamada de WhatsApp");
          }
        }
      });

      sock.ev.on("creds.update", async () => {
        if (!isCurrentSession()) return;
        try {
          await saveCreds();
        } catch (error) {
          this.logger.error({ userId, sessionId, error: error.message }, "Error guardando credenciales de WhatsApp");
        }
      });
      return sessionData;
    } catch (err) {
      this.logger.error("Error en createSession:", err);
      throw err;
    }
  }

  describeDisconnect(error) {
    const statusCode = Number(error?.output?.statusCode ?? error?.statusCode ?? 0) || null;
    const data = error?.data || error?.output?.payload || {};
    return {
      statusCode,
      message: String(error?.message || "Conexión cerrada sin detalle").slice(0, 500),
      reason: data?.reason || data?.attrs?.reason || null,
      location: data?.location || data?.attrs?.location || null,
    };
  }

  shouldReconnect(disconnect) {
    const nonRetryableCodes = new Set([
      DisconnectReason.loggedOut,
      DisconnectReason.forbidden,
      DisconnectReason.badSession,
      DisconnectReason.multideviceMismatch,
      DisconnectReason.connectionReplaced,
      405,
    ]);
    if (nonRetryableCodes.has(disconnect.statusCode)) return false;
    if (/certificate|unable to verify|self[- ]signed/i.test(disconnect.message)) return false;
    return true;
  }

  scheduleReconnect(userId, sessionId, sessionData, sessionKey) {
    if (this.reconnectTimers.has(sessionKey)) return;
    const attempt = (this.reconnectAttempts.get(sessionKey) || 0) + 1;
    const maxAttempts = 6;
    if (attempt > maxAttempts) {
      sessionData.status = "error";
      sessionData.reconnectAttempt = maxAttempts;
      this.logger.error({ userId, sessionId, maxAttempts }, "Reconexión detenida tras alcanzar el límite de intentos");
      return;
    }

    this.reconnectAttempts.set(sessionKey, attempt);
    sessionData.status = "reconnecting";
    sessionData.reconnectAttempt = attempt;
    const delayMs = Math.min(30000, 1000 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 500);
    this.logger.warn({ userId, sessionId, attempt, delayMs }, "Reconexión de WhatsApp programada");

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(sessionKey);
      const current = this.sessions.get(userId)?.get(sessionId);
      if (current !== sessionData) return;
      try {
        this.sessions.get(userId)?.delete(sessionId);
        await this.createSession(userId, sessionId);
      } catch (error) {
        const disconnect = this.describeDisconnect(error);
        sessionData.lastDisconnect = disconnect;
        if (this.shouldReconnect(disconnect)) {
          this.scheduleReconnect(userId, sessionId, sessionData, sessionKey);
        } else {
          sessionData.status = "error";
        }
      }
    }, delayMs);
    timer.unref?.();
    this.reconnectTimers.set(sessionKey, timer);
  }

  clearReconnectTimer(sessionKey) {
    const timer = this.reconnectTimers.get(sessionKey);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(sessionKey);
  }

  archiveAuthDirectory(userId, sessionId, label = "disconnected") {
    const projectRoot = path.resolve(__dirname, "../..");
    const sessionsRoot = path.join(projectRoot, "sessions");
    const backupRoot = path.join(projectRoot, "session-backups");
    const source = path.join(sessionsRoot, `auth_${userId}_${sessionId}`);
    if (!fs.existsSync(source)) return null;
    fs.mkdirSync(backupRoot, { recursive: true });
    const safeLabel = String(label).replace(/[^a-z0-9_-]/gi, "_");
    const destination = path.join(backupRoot, `${safeLabel}_${userId}_${sessionId}_${Date.now()}`);
    fs.renameSync(source, destination);
    return destination;
  }

  async disconnectSession(rawUserId, sessionId, { logout = true, archiveAuth = true } = {}) {
    const userId = String(rawUserId);
    const sessionKey = `${userId}:${sessionId}`;
    this.clearReconnectTimer(sessionKey);
    this.reconnectAttempts.delete(sessionKey);
    this.sessionGenerations.set(sessionKey, (this.sessionGenerations.get(sessionKey) || 0) + 1);
    const userSessions = this.sessions.get(userId);
    const session = userSessions?.get(sessionId);
    userSessions?.delete(sessionId);

    if (session?.sock) {
      try {
        if (logout && session.status === "open") await session.sock.logout();
        else session.sock.end();
      } catch (error) {
        this.logger.warn({ userId, sessionId, error: error.message }, "No se pudo cerrar el socket limpiamente");
        try { session.sock.end(); } catch { /* ya estaba cerrado */ }
      }
    }

    const backupPath = archiveAuth ? this.archiveAuthDirectory(userId, sessionId, logout ? "logout" : "relink") : null;
    return { sessionId, status: "disconnected", backupPath };
  }

  async resetSessionAuth(rawUserId, sessionId) {
    const userId = String(rawUserId);
    await this.disconnectSession(userId, sessionId, { logout: false, archiveAuth: true });
    return this.createSession(userId, sessionId);
  }

  getSession(rawUserId, sessionId) {
    const userId = String(rawUserId);
    return this.sessions.get(userId)?.get(sessionId);
  }

  getUserSessions(rawUserId) {
    const userId = String(rawUserId);
    const userMap = this.sessions.get(userId);
    return userMap ? Array.from(userMap.values()) : [];
  }

  async deleteSession(rawUserId, sessionId) {
    return this.disconnectSession(rawUserId, sessionId, { logout: true, archiveAuth: true });
  }

  async cleanupExpiredSessions() {
    this.logger.info("🧹 Ejecutando limpieza de sesiones expiradas...");
    for (const [userId, userSessions] of this.sessions.entries()) {
      try {
        const user = await User.findByPk(userId);
        if (user && user.expirationDate && new Date() > new Date(user.expirationDate)) {
          this.logger.warn(`⛔ Usuario ${userId} expirado. Cerrando ${userSessions.size} sesiones.`);
          for (const [sessionId, session] of userSessions.entries()) {
            const sessionKey = `${userId}:${sessionId}`;
            this.clearReconnectTimer(sessionKey);
            this.reconnectAttempts.delete(sessionKey);
            this.sessionGenerations.set(sessionKey, (this.sessionGenerations.get(sessionKey) || 0) + 1);
            userSessions.delete(sessionId);
            try { await session.sock.logout(); } catch (e) {}
          }
          this.sessions.delete(userId);
        }
      } catch (error) {
        this.logger.error(`Error limpiando sesiones de usuario ${userId}:`, error);
      }
    }
  }

  async restoreSessions() {
    const sessionsRoot = path.join(__dirname, "../../sessions");
    if (!fs.existsSync(sessionsRoot)) return;

    const dirs = fs.readdirSync(sessionsRoot);
    this.logger.info(`Restaurando ${dirs.length} posibles sesiones...`);

    for (const dir of dirs) {
      if (dir.startsWith("auth_")) {
        const parts = dir.split("_");
        if (parts.length >= 3) {
          const userId = parts[1];
          const sessionId = parts.slice(2).join("_");
          this.logger.info(`🔄 Restaurando sesión: Usuario ${userId}, ID ${sessionId}`);
          try {
            await this.createSession(userId, sessionId);
          } catch (err) {
            this.logger.error(`Error restaurando ${dir}:`, err.message);
          }
        }
      }
    }
  }
}

export default new SessionManager();
