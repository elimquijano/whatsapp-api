import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import QRCode from "qrcode";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SessionManager {
  constructor() {
    this.sessions = new Map(); // userId -> Map(sessionId -> sessionData)
    this.logger = pino({
      level: "info",
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }

  async createSession(userId, sessionId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new Map());
    }

    const userSessions = this.sessions.get(userId);

    // Evitar duplicados para este sessionId específico
    if (userSessions.has(sessionId)) {
      const sess = userSessions.get(sessionId);
      if (['open', 'connecting', 'waiting_qr'].includes(sess.status)) {
        return sess;
      }
    }

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
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        logger: this.logger,
        printQRInTerminal: false,
        browser: ["WA-SAAS", "Chrome", "1.0.0"],
      });

      const sessionData = {
        sock,
        qrDataUrl: null,
        status: "connecting",
        userId,
        sessionId
      };

      userSessions.set(sessionId, sessionData);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          sessionData.status = "waiting_qr";
          sessionData.qrDataUrl = await QRCode.toDataURL(qr);
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          sessionData.status = "closed";
          sessionData.qrDataUrl = null;

          if (shouldReconnect) {
            this.createSession(userId, sessionId);
          } else {
            userSessions.delete(sessionId);
          }
        } else if (connection === "open") {
          sessionData.status = "open";
          sessionData.qrDataUrl = null;
          this.logger.info(`✅ Conectado: Usuario ${userId}, Sesión ${sessionId}`);
        }
      });

      // WEBHOOK HANDLING
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        try {
          if (type !== 'notify') return;
          
          const user = await User.findByPk(userId);
          if (!user || !user.webhookUrl) return;

          // Verificar expiración del plan
          if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
            this.logger.warn(`⛔ Plan expirado para usuario ${userId}. Webhook bloqueado.`);
            return;
          }

          for (const msg of messages) {
            if (!msg.message) continue; // Skip updates without message content

            // Prepare payload
            const payload = {
              event: 'message.received',
              instanceId: sessionId,
              data: {
                id: msg.key.id,
                from: msg.key.remoteJid,
                to: msg.key.fromMe ? msg.key.remoteJid : sock.user.id,
                pushName: msg.pushName,
                message: msg.message,
                timestamp: msg.messageTimestamp,
                fromMe: msg.key.fromMe
              }
            };

            // Send to webhook
            fetch(user.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(err => this.logger.error(`Webhook error for user ${userId}:`, err.message));
          }
        } catch (error) {
          this.logger.error("Error processing webhook:", error);
        }
      });

      sock.ev.on("creds.update", saveCreds);
      return sessionData;
    } catch (err) {
      this.logger.error("Error en createSession:", err);
      throw err;
    }
  }

  getSession(userId, sessionId) {
    return this.sessions.get(userId)?.get(sessionId);
  }

  getUserSessions(userId) {
    const userMap = this.sessions.get(userId);
    return userMap ? Array.from(userMap.values()) : [];
  }

  async deleteSession(userId, sessionId) {
    const userSessions = this.sessions.get(userId);
    if (userSessions && userSessions.has(sessionId)) {
      const session = userSessions.get(sessionId);
      try { await session.sock.logout(); } catch (e) {}
      userSessions.delete(sessionId);
    }
  }

  async cleanupExpiredSessions() {
    this.logger.info("🧹 Ejecutando limpieza de sesiones expiradas...");
    for (const [userId, userSessions] of this.sessions.entries()) {
      try {
        const user = await User.findByPk(userId);
        if (user && user.expirationDate && new Date() > new Date(user.expirationDate)) {
          this.logger.warn(`⛔ Usuario ${userId} expirado. Cerrando ${userSessions.size} sesiones.`);
          for (const [sessionId, session] of userSessions.entries()) {
            try { await session.sock.logout(); } catch (e) {}
            userSessions.delete(sessionId);
          }
          this.sessions.delete(userId);
        }
      } catch (error) {
        this.logger.error(`Error limpiando sesiones de usuario ${userId}:`, error);
      }
    }
  }
}

export default new SessionManager();
