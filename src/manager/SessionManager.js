import pkg from "@whiskeysockets/baileys";
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = pkg.default || pkg; // Fix for different Baileys versions

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import QRCode from "qrcode";

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
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

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
}

export default new SessionManager();
