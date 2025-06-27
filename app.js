require("dotenv").config();

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");

const logger = require("./logger");
const MAX_MESSAGE_LENGTH = 1000;

// --- Variables de Entorno ---
const API_TOKEN = process.env.API_TOKEN;
const PORT = process.env.PORT || 3000;

if (!API_TOKEN) {
  logger.error("Error: La variable de entorno API_TOKEN no está definida.");
  process.exit(1);
}

// Configuración del cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "whatsapp_session",
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

let isWhatsappReady = false;
let whatsappClientInfo = null;

logger.info("Inicializando cliente de WhatsApp...");

client.on("qr", (qr) => {
  logger.info(
    "¡Código QR recibido! Escanéalo con tu WhatsApp para vincular un dispositivo:"
  );
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  logger.info("¡Autenticado con WhatsApp!");
});

client.on("auth_failure", (msg) => {
  logger.error("¡Falló la autenticación de WhatsApp!", msg);
  process.exit(1);
});

client.on("ready", () => {
  isWhatsappReady = true;
  whatsappClientInfo = client.info;
  logger.info("¡Cliente de WhatsApp listo y conectado!");
  if (whatsappClientInfo) {
    logger.info("Nombre:", whatsappClientInfo.pushname);
    logger.info("Número:", whatsappClientInfo.wid.user);
  }
  startApiServer();
});

client.on("disconnected", (reason) => {
  logger.warn("Cliente de WhatsApp desconectado:", reason);
  isWhatsappReady = false;
  whatsappClientInfo = null;
});

client.on("loading_screen", (percent, message) => {
  logger.info("Cargando WhatsApp Web:", percent + "%", message);
});

client.initialize().catch((err) => {
  logger.error("Error CRÍTICO al inicializar el cliente de WhatsApp:", err);
  process.exit(1);
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null)
    return res
      .status(401)
      .json({ success: false, error: "Token no proporcionado." });
  if (token === API_TOKEN) {
    next();
  } else {
    return res.status(403).json({ success: false, error: "Token inválido." });
  }
};

const startApiServer = () => {
  const app = express();
  app.use(express.json({ limit: "10mb" })); // Aumentar límite para base64 si es necesario
  app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Para formularios, también con límite

  app.use((req, res, next) => {
    logger.info(`[API Request] ${req.method} ${req.url}`);
    next();
  });

  app.get("/status", (req, res) => {
    logger.info("Endpoint /status (GET) alcanzado.");
    res.status(isWhatsappReady ? 200 : 503).json({
      success: isWhatsappReady,
      status: isWhatsappReady
        ? "WhatsApp client ready"
        : "WhatsApp client not ready",
      clientInfo:
        isWhatsappReady && whatsappClientInfo
          ? {
              pushname: whatsappClientInfo.pushname,
              phoneNumber: whatsappClientInfo.wid?.user,
              platform: whatsappClientInfo.platform,
            }
          : null,
    });
  });

  // --- RUTA PARA ENVIAR MENSAJES ---
  app.post("/send-message", authenticateToken, async (req, res) => {
    logger.info("Endpoint /send-message (POST) alcanzado.");

    if (!isWhatsappReady) {
      return res.status(503).json({
        success: false,
        error: "Cliente de WhatsApp no listo.",
      });
    }

    const { numbers: numbersString, message } = req.body;

    if (!numbersString || !message) {
      return res.status(400).json({
        success: false,
        error: 'Los campos "numbers" y "message" son requeridos.',
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      logger.warn(
        `Solicitud /send-message rechazada por exceder el límite de caracteres. Longitud: ${message.length}`
      );
      return res.status(413).json({
        // 413 Payload Too Large
        error: `El mensaje excede el límite de ${MAX_MESSAGE_LENGTH} caracteres.`,
        longitud_enviada: message.length,
        limite_permitido: MAX_MESSAGE_LENGTH,
      });
    }

    const validNumbers = parseNumbers(numbersString);

    if (validNumbers.length === 0) {
      logger.warn("Solicitud /send-message sin números válidos.");
      return res.status(400).json({
        error:
          'El campo "numbers" debe ser un string con números válidos de 9 dígitos separados por comas.',
      });
    }

    const sentMessages = [];
    const failedMessages = [];

    logger.info(`Iniciando envío masivo a ${validNumbers.length} números.`);

    // Usamos un bucle for...of para enviar los mensajes secuencialmente
    // Esto evita sobrecargar al cliente o ser bloqueado por enviar demasiado rápido
    for (const number of validNumbers) {
      const chatId = `${number}@c.us`;
      try {
        logger.info(`Enviando mensaje a ${chatId}: "${message}"`);
        const msgSent = await client.sendMessage(chatId, message);
        sentMessages.push({
          to: chatId,
          messageId: msgSent.id.id,
          status: "sent",
        });
      } catch (error) {
        logger.error(`Error enviando mensaje a ${chatId}:`, error);
        failedMessages.push({
          to: chatId,
          status: "failed",
          error: error.message,
        });
      }
    }

    logger.info(
      `Envío masivo completado. Éxitos: ${sentMessages.length}, Fallos: ${failedMessages.length}`
    );

    res.status(200).json({
      success: true,
      summary: {
        total_requested: validNumbers.length,
        total_sent: sentMessages.length,
        total_failed: failedMessages.length,
      },
      results: {
        sent: sentMessages,
        failed: failedMessages,
      },
    });
  });

  // --- RUTA PARA ENVIAR MEDIA (IMÁGENES) ---
  app.post("/send-media", authenticateToken, async (req, res) => {
    logger.info("Endpoint /send-media (POST) alcanzado.");

    if (!isWhatsappReady) {
      return res.status(503).json({
        success: false,
        error: "Cliente de WhatsApp no listo.",
      });
    }

    // Cambiamos 'number' por 'numbers' para aceptar múltiples destinatarios
    const {
      numbers: numbersString,
      caption,
      mediaUrl,
      mediaBase64,
      mimetype,
    } = req.body;

    if (!numbersString || (!mediaUrl && !mediaBase64)) {
      return res.status(400).json({
        success: false,
        error:
          'Los campos "numbers" y ("mediaUrl" o "mediaBase64") son requeridos.',
      });
    }

    const validNumbers = parseNumbers(numbersString);

    if (validNumbers.length === 0) {
      logger.warn("Solicitud /send-media sin números válidos.");
      return res.status(400).json({
        error:
          'El campo "numbers" debe ser un string con números válidos de 9 dígitos separados por comas.',
      });
    }

    let media;
    try {
      // Preparamos el objeto media UNA SOLA VEZ antes del bucle.
      // Esto es crucial para la eficiencia, especialmente con fromUrl.
      logger.info("Preparando el archivo multimedia para el envío...");
      if (mediaUrl) {
        media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      } else if (mediaBase64 && mimetype) {
        media = new MessageMedia(mimetype, mediaBase64);
      } else {
        // Esta validación es redundante por la de arriba, pero es una buena defensa
        return res.status(400).json({
          success: false,
          error: 'Debe proveer "mediaUrl" o un par "mediaBase64" y "mimetype".',
        });
      }
      logger.info("Archivo multimedia preparado con éxito.");
    } catch (error) {
      logger.error(
        "Error al preparar el archivo multimedia desde la fuente proporcionada:",
        error
      );
      return res.status(500).json({
        success: false,
        error: "No se pudo procesar el archivo multimedia desde la fuente.",
        details: error.message,
      });
    }

    const sentMedia = [];
    const failedMedia = [];
    const sendOptions = { caption: caption || "" };

    logger.info(`Iniciando envío de media a ${validNumbers.length} números.`);

    // Iteramos sobre cada número validado y enviamos el archivo
    for (const number of validNumbers) {
      const chatId = `${number}@c.us`;
      try {
        logger.info(`Enviando media a ${chatId}...`);
        const msgSent = await client.sendMessage(chatId, media, sendOptions);
        sentMedia.push({
          to: chatId,
          messageId: msgSent.id.id,
          status: "sent",
        });
      } catch (error) {
        logger.error(`Error enviando media a ${chatId}:`, error);
        failedMedia.push({
          to: chatId,
          status: "failed",
          error: error.message,
        });
      }
    }

    logger.info(
      `Envío de media completado. Éxitos: ${sentMedia.length}, Fallos: ${failedMedia.length}`
    );

    // Devolvemos un resumen detallado, igual que en /send-message
    res.status(200).json({
      success: true,
      summary: {
        total_requested: validNumbers.length,
        total_sent: sentMedia.length,
        total_failed: failedMedia.length,
      },
      results: {
        sent: sentMedia,
        failed: failedMedia,
      },
    });
  });

  app.use((req, res, next) => {
    logger.error(`Ruta no encontrada: ${req.method} ${req.url}`);
    res
      .status(404)
      .json({ success: false, error: "Ruta no encontrada (404)." });
  });

  app.use((err, req, res, next) => {
    logger.error("Error no manejado en Express:", err.stack);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`API de WhatsApp escuchando en puerto ${PORT}`);
    logger.info(`TOKEN configurado: ${API_TOKEN ? "Sí" : "NO"}`);
  });
};

function parseNumbers(input) {
  if (!input) return [];
  const numbers = input
    .split(",")
    .map((num) => num.trim())
    .filter((num) => /^\d{9}$/.test(num));
  const formattedNumbers = numbers.map((num) => `51${num}`);
  return formattedNumbers.length > 0 ? formattedNumbers : [];
}
