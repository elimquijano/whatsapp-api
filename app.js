require("dotenv").config(); // Carga las variables de entorno desde .env al inicio

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");

// --- Variables de Entorno ---
const API_TOKEN = process.env.API_TOKEN;
const PORT = process.env.PORT || 3000; // Usa el puerto del .env o 3000 por defecto

if (!API_TOKEN) {
  console.error("Error: La variable de entorno API_TOKEN no está definida.");
  console.error(
    "Por favor, crea un archivo .env con API_TOKEN='tu_token_secreto'"
  );
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

// --- Middleware de Autenticación por Token ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  // El token se espera en formato "Bearer TU_TOKEN"
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    console.warn("[Auth] Token no proporcionado");
    return res
      .status(401)
      .json({
        success: false,
        error: "Acceso no autorizado: Token no proporcionado.",
      });
  }

  if (token === API_TOKEN) {
    console.log("[Auth] Token válido.");
    next(); // Token válido, continuar con la solicitud
  } else {
    console.warn("[Auth] Token inválido recibido.");
    return res
      .status(403)
      .json({ success: false, error: "Acceso prohibido: Token inválido." });
  }
};

// --- Servidor API con Express ---
function startApiServer() {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
  });

  // Rutas públicas (ej. status, no requieren token)
  app.get("/status", (req, res) => {
    console.log("Endpoint /status (GET) alcanzado.");
    if (!isWhatsappReady) {
      return res.status(503).json({
        success: false,
        status: "WhatsApp client not ready",
        message: "El cliente de WhatsApp no está listo o está desconectado.",
      });
    }
    res.status(200).json({
      success: true,
      status: "WhatsApp client ready",
      clientInfo: whatsappClientInfo
        ? {
            pushname: whatsappClientInfo.pushname,
            phoneNumber: whatsappClientInfo.wid?.user,
            platform: whatsappClientInfo.platform,
          }
        : null,
    });
  });

  // Rutas protegidas por token
  // Aplicar el middleware de autenticación a las rutas que lo necesiten
  app.post("/send-message", authenticateToken, async (req, res) => {
    // <--- authenticateToken AÑADIDO AQUÍ
    console.log("Endpoint /send-message (POST) alcanzado.");
    console.log("Body recibido:", req.body);

    if (!isWhatsappReady) {
      return res
        .status(503)
        .json({
          success: false,
          error: "El cliente de WhatsApp no está listo todavía.",
        });
    }

    const { number, message } = req.body;

    if (!number || !message) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            'Faltan los parámetros "number" (string) o "message" (string).',
        });
    }

    const cleanedNumber = String(number).replace(/\D/g, "");
    // Ajusta la validación del número si es necesario para otros países, o hazla más genérica
    // Para Perú: const peruNumberRegex = /^519\d{8}$/;
    // if (!peruNumberRegex.test(cleanedNumber)) { ... }
    const chatId = `${cleanedNumber}@c.us`;

    try {
      console.log(`Intentando enviar mensaje a ${chatId}: "${message}"`);
      const msgSent = await client.sendMessage(chatId, message);
      console.log(`Mensaje enviado a ${chatId} (ID: ${msgSent.id.id})`);
      res
        .status(200)
        .json({
          success: true,
          message: "Mensaje enviado exitosamente.",
          messageId: msgSent.id.id,
          to: chatId,
        });
    } catch (error) {
      console.error(`Error al enviar mensaje a ${chatId}:`, error);
      let errorMessage = "Error al enviar el mensaje.";
      if (error.message && error.message.includes("message to unknown user")) {
        errorMessage = "El número de destino no existe o no tiene WhatsApp.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      res
        .status(500)
        .json({
          success: false,
          error: errorMessage,
          details: error.toString(),
          numberUsed: chatId,
        });
    }
  });

  // Puedes añadir más rutas protegidas de la misma manera:
  // app.post('/send-media', authenticateToken, async (req, res) => { /* ... */ });

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
    console.log(
      `API de WhatsApp escuchando en http://localhost:${PORT} (y en tu IP local)`
    );
    console.log("Rutas públicas:");
    console.log(`  GET http://localhost:${PORT}/status`);
    console.log(
      'Rutas protegidas (requieren cabecera "Authorization: Bearer TU_TOKEN"):'
    );
    console.log(`  POST http://localhost:${PORT}/send-message`);
    console.log(
      '     Body JSON: { "number": "CODIGOPAISNUMERO", "message": "Tu mensaje" }'
    );
    console.log(
      `TOKEN configurado: ${API_TOKEN ? "Sí (desde .env)" : "NO (¡PELIGRO!)"}`
    );
    console.log(
      "================================================================================"
    );
  });
}
