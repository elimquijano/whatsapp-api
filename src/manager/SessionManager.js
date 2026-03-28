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
    this.sessions = new Map(); // userId (string) -> Map(sessionId -> sessionData)
    this.logger = pino({
      level: "info",
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }

  async createSession(rawUserId, sessionId) {
    const userId = String(rawUserId); // Normalizar a string
    
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
            if (!msg.message) continue;

            const remoteJid = msg.key.remoteJid;
            const participant = msg.key.participant;
            let senderJid = participant || remoteJid;

            // LOG SEGURO
            this.logger.info(`📩 Mensaje de ${msg.pushName || 'Desconocido'} (${remoteJid})`);

            // RESOLUCIÓN DE LID A NÚMERO REAL
            if (senderJid.endsWith('@lid')) {
              // TRUCO: Buscar cualquier JID real escondido en el objeto del mensaje
              const msgString = JSON.stringify(msg);
              const realJidMatch = msgString.match(/(\d+)@s\.whatsapp\.net/);
              
              if (realJidMatch) {
                senderJid = realJidMatch[0];
                this.logger.info(`🎯 ¡Número real encontrado en metadatos!: ${senderJid}`);
              } else {
                // Si no hay match, intentar buscar en la caché (lo que ya teníamos)
                const contact = sock.contacts ? sock.contacts[senderJid] : null;
                if (contact && contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                  senderJid = contact.id;
                }
              }
            } else if (msg.key.fromMe) {
              senderJid = sock.user.id;
            }

            // Limpiar el ID para obtener solo el número
            const senderNumber = senderJid.split('@')[0].split(':')[0];

            this.logger.info(`✅ Remitente final: ${senderNumber} (Nombre: ${msg.pushName || '?'})`);

            // Prepare payload
            const payload = {
              event: 'message.received',
              instanceId: sessionId,
              data: {
                id: msg.key.id,
                from: remoteJid,
                senderJid: senderJid,
                senderNumber: senderNumber,
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
    const userId = String(rawUserId);
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