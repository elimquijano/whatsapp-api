require("dotenv").config();

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js"); // <--- AÑADIR MessageMedia
const qrcode = require("qrcode-terminal");
const express = require("express");
const axios = require("axios"); // Para descargar la imagen desde una URL
const fs = require("fs"); // Para manejar archivos si fuera necesario (ej. base64)
const path = require("path"); // Para manejar rutas de archivos

// --- Variables de Entorno ---
const API_TOKEN = process.env.API_TOKEN;
const PORT = process.env.PORT || 3000;

if (!API_TOKEN) {
  console.error("Error: La variable de entorno API_TOKEN no está definida.");
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

console.log("Inicializando cliente de WhatsApp...");

client.on("qr", (qr) => {
  console.log(
    "--------------------------------------------------------------------------------"
  );
  console.log(
    "¡Código QR recibido! Escanéalo con tu WhatsApp para vincular un dispositivo:"
  );
  qrcode.generate(qr, { small: true });
  console.log(
    "--------------------------------------------------------------------------------"
  );
});

client.on("authenticated", () => {
  console.log("¡Autenticado con WhatsApp!");
});

client.on("auth_failure", (msg) => {
  console.error("¡Falló la autenticación de WhatsApp!", msg);
  process.exit(1);
});

client.on("ready", () => {
  isWhatsappReady = true;
  whatsappClientInfo = client.info;
  console.log(
    "--------------------------------------------------------------------------------"
  );
  console.log("¡Cliente de WhatsApp listo y conectado!");
  if (whatsappClientInfo) {
    console.log("Nombre:", whatsappClientInfo.pushname);
    console.log("Número:", whatsappClientInfo.wid.user);
  }
  console.log(
    "--------------------------------------------------------------------------------"
  );
  startApiServer();
});

client.on("disconnected", (reason) => {
  console.warn("Cliente de WhatsApp desconectado:", reason);
  isWhatsappReady = false;
  whatsappClientInfo = null;
});

client.on("loading_screen", (percent, message) => {
  console.log("Cargando WhatsApp Web:", percent + "%", message);
});

client.initialize().catch((err) => {
  console.error("Error CRÍTICO al inicializar el cliente de WhatsApp:", err);
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

function startApiServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" })); // Aumentar límite para base64 si es necesario
  app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Para formularios, también con límite

  app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
  });

  app.get("/status", (req, res) => {
    console.log("Endpoint /status (GET) alcanzado.");
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

  app.post("/send-message", authenticateToken, async (req, res) => {
    console.log("Endpoint /send-message (POST) alcanzado.");
    if (!isWhatsappReady)
      return res
        .status(503)
        .json({ success: false, error: "Cliente de WhatsApp no listo." });

    const { number, message } = req.body;
    if (!number || !message)
      return res
        .status(400)
        .json({ success: false, error: 'Faltan "number" o "message".' });

    const cleanedNumber = String(number).replace(/\D/g, "");
    const chatId = `${cleanedNumber}@c.us`;

    try {
      console.log(`Enviando mensaje de texto a ${chatId}: "${message}"`);
      const msgSent = await client.sendMessage(chatId, message);
      res
        .status(200)
        .json({
          success: true,
          message: "Mensaje enviado.",
          messageId: msgSent.id.id,
          to: chatId,
        });
    } catch (error) {
      console.error(`Error enviando mensaje a ${chatId}:`, error);
      res
        .status(500)
        .json({
          success: false,
          error: "Error al enviar mensaje.",
          details: error.message,
        });
    }
  });

  // --- NUEVA RUTA PARA ENVIAR MEDIA (IMÁGENES) ---
  app.post("/send-media", authenticateToken, async (req, res) => {
    console.log("Endpoint /send-media (POST) alcanzado.");
    if (!isWhatsappReady)
      return res
        .status(503)
        .json({ success: false, error: "Cliente de WhatsApp no listo." });

    const { number, caption, mediaUrl, mediaBase64, mimetype } = req.body;

    if (!number || (!mediaUrl && !mediaBase64)) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            'Faltan "number" y ("mediaUrl" o "mediaBase64" con "mimetype").',
        });
    }

    const cleanedNumber = String(number).replace(/\D/g, "");
    const chatId = `${cleanedNumber}@c.us`;
    let media;

    try {
      if (mediaUrl) {
        console.log(`Descargando media desde URL: ${mediaUrl}`);
        // Para MessageMedia.fromUrl, la biblioteca se encarga de descargar
        // y obtener el mimetype si es posible. A veces es mejor ser explícito.
        media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true }); // unsafeMime puede ayudar con algunos servidores
        console.log(
          `Media obtenida de URL. Mimetype detectado/usado: ${media.mimetype}, Tamaño: ${media.data.length}`
        );
      } else if (mediaBase64 && mimetype) {
        console.log(
          `Creando media desde Base64. Mimetype: ${mimetype}, Longitud Base64: ${mediaBase64.length}`
        );
        media = new MessageMedia(mimetype, mediaBase64);
        // No es necesario `filename` para MessageMedia si se envía directamente,
        // pero puede ser útil si WhatsApp lo necesita para mostrarlo bien.
        // media.filename = "image.jpg"; // Opcional, puedes hacerlo dinámico
      } else {
        return res
          .status(400)
          .json({
            success: false,
            error: 'Debe proveer "mediaUrl" o ("mediaBase64" y "mimetype").',
          });
      }

      console.log(
        `Enviando media a ${chatId}${
          caption ? ` con caption: "${caption}"` : ""
        }`
      );
      const msgSent = await client.sendMessage(chatId, media, {
        caption: caption || "",
      });
      res
        .status(200)
        .json({
          success: true,
          message: "Media enviada.",
          messageId: msgSent.id.id,
          to: chatId,
        });
    } catch (error) {
      console.error(`Error enviando media a ${chatId}:`, error);
      let errorDetails = error.message;
      if (error.response && error.response.data) {
        // Si es un error de axios al descargar
        errorDetails = error.response.data;
      }
      res
        .status(500)
        .json({
          success: false,
          error: "Error al enviar media.",
          details: errorDetails,
        });
    }
  });

  app.use((req, res, next) => {
    console.error(`Ruta no encontrada: ${req.method} ${req.url}`);
    res
      .status(404)
      .json({ success: false, error: "Ruta no encontrada (404)." });
  });

  app.use((err, req, res, next) => {
    console.error("Error no manejado en Express:", err.stack);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      "================================================================================"
    );
    console.log(`API de WhatsApp escuchando en http://localhost:${PORT}`);
    console.log("Rutas públicas:");
    console.log(`  GET http://localhost:${PORT}/status`);
    console.log(
      'Rutas protegidas (requieren cabecera "Authorization: Bearer TU_TOKEN"):'
    );
    console.log(`  POST http://localhost:${PORT}/send-message`);
    console.log(
      '     Body JSON: { "number": "CODIGOPAISNUMERO", "message": "Tu mensaje" }'
    );
    console.log(`  POST http://localhost:${PORT}/send-media`);
    console.log(
      '     Body JSON (Opción 1 - URL): { "number": "...", "caption": "(opcional)", "mediaUrl": "URL_IMAGEN" }'
    );
    console.log(
      '     Body JSON (Opción 2 - Base64): { "number": "...", "caption": "(opcional)", "mediaBase64": "DATOS_BASE64", "mimetype": "image/jpeg" }'
    );
    console.log(`TOKEN configurado: ${API_TOKEN ? "Sí" : "NO"}`);
    console.log(
      "================================================================================"
    );
  });
}
