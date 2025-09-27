/**
 * Middleware de autenticación Basic Auth
 * Requiere usuario y contraseña desde variables de entorno
 */ const express = require("express");
const multer = require("multer");
const {
  Client,
  LocalAuth,
  MessageMedia,
  Location,
} = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");
const winston = require("winston");
const qrcode = require("qrcode-terminal");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Crear directorios necesarios
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

if (!fs.existsSync("./received_media")) {
  fs.mkdirSync("./received_media");
  fs.mkdirSync("./received_media/images");
  fs.mkdirSync("./received_media/documents");
  fs.mkdirSync("./received_media/audio");
  fs.mkdirSync("./received_media/videos");
  fs.mkdirSync("./received_media/stickers");
}

// Configuración de logs por día
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: `logs/${new Date().toISOString().split("T")[0]}-error.log`,
      level: "error",
    }),
    new winston.transports.File({
      filename: `logs/${new Date().toISOString().split("T")[0]}-combined.log`,
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Crear directorio de logs si no existe
if (!fs.existsSync("./logs")) {
  fs.mkdirSync("./logs");
}

// Variables globales
let client;
let isClientReady = false;
let qrCode = null;
let qrToken = null; // Token para acceder al QR

/**
 * Generar token aleatorio para QR
 */
const generateQRToken = () => {
  return require("crypto").randomBytes(32).toString("hex");
};

/**
 * Middleware de autenticación Bearer Token para QR
 * Requiere token específico desde variables de entorno o generado dinámicamente
 */
const qrTokenAuth = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    logger.warn("Acceso denegado al QR: Sin Bearer token");
    return res.status(401).json({
      success: false,
      error: "Bearer token requerido para acceder al QR",
      code: "QR_AUTH_MISSING",
      help: "Use: Authorization: Bearer <token>",
    });
  }

  const token = auth.split(" ")[1];

  // Verificar token de QR
  if (token !== qrToken && token !== process.env.QR_ACCESS_TOKEN) {
    logger.warn(
      `Acceso denegado al QR: Token inválido ${token.substring(0, 8)}...`
    );
    return res.status(401).json({
      success: false,
      error: "Token inválido para acceder al QR",
      code: "QR_AUTH_INVALID",
    });
  }

  logger.info(`Acceso autorizado al QR con token: ${token.substring(0, 8)}...`);
  next();
};
const basicAuth = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth) {
    logger.warn("Acceso denegado: Sin headers de autorización");
    return res.status(401).json({
      success: false,
      error: "Authorization header requerido",
      code: "AUTH_MISSING",
    });
  }

  const [type, credentials] = auth.split(" ");

  if (type !== "Basic") {
    logger.warn("Acceso denegado: Tipo de auth incorrecto");
    return res.status(401).json({
      success: false,
      error: "Tipo de autorización debe ser Basic",
      code: "AUTH_TYPE_INVALID",
    });
  }

  const [username, password] = Buffer.from(credentials, "base64")
    .toString()
    .split(":");

  if (
    username !== process.env.API_USERNAME ||
    password !== process.env.API_PASSWORD
  ) {
    logger.warn(
      `Acceso denegado: Credenciales incorrectas para usuario ${username}`
    );
    return res.status(401).json({
      success: false,
      error: "Credenciales inválidas",
      code: "AUTH_INVALID",
    });
  }

  logger.info(`Acceso autorizado para usuario: ${username}`);
  next();
};

/**
 * Middleware para verificar que el cliente esté listo
 */
const checkClientReady = (req, res, next) => {
  if (!isClientReady) {
    logger.warn("Cliente WhatsApp no está listo");
    return res.status(503).json({
      success: false,
      error: "Cliente WhatsApp no está listo. Escanea el código QR primero.",
      code: "CLIENT_NOT_READY",
    });
  }
  next();
};

/**
 * Inicializar cliente de WhatsApp
 */
const initializeWhatsAppClient = () => {
  logger.info("Inicializando cliente WhatsApp...");

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  // Generar QR Code
  client.on("qr", (qr) => {
    qrCode = qr;
    qrToken = generateQRToken(); // Generar nuevo token cada vez

    logger.info("Código QR generado. Token de acceso creado.");

    // Mostrar QR en la consola para fácil escaneo
    console.log("\n📱 CÓDIGO QR DE WHATSAPP GENERADO");
    console.log("=".repeat(60));
    qrcode.generate(qr, { small: true });
    console.log("=".repeat(60));
    console.log(`🔐 TOKEN DE ACCESO: ${qrToken}`);
    console.log("📍 URL Segura: http://localhost:3000/qr");
    console.log("🛡️  Header requerido: Authorization: Bearer " + qrToken);
    console.log("=".repeat(60));
    console.log("IMPORTANTE: Este token expira al conectarse o reiniciar\n");
  });

  // Cliente listo
  client.on("ready", () => {
    isClientReady = true;
    qrCode = null;
    qrToken = null; // Limpiar token al conectarse
    logger.info("Cliente WhatsApp listo y conectado - Token QR limpiado");
  });

  // Cliente autenticado
  client.on("authenticated", () => {
    logger.info("Cliente WhatsApp autenticado correctamente");
  });

  // Error de autenticación
  client.on("auth_failure", (msg) => {
    logger.error("Error de autenticación WhatsApp:", msg);
    isClientReady = false;
    qrToken = null; // Limpiar token en caso de fallo
  });

  // Cliente desconectado
  client.on("disconnected", (reason) => {
    logger.warn("Cliente WhatsApp desconectado:", reason);
    isClientReady = false;
    qrToken = null; // Limpiar token al desconectarse
  });

  /**
   * Leer mensajes entrantes completos con descarga de medios
   */
  client.on("message", async (message) => {
    try {
      const contact = await message.getContact();
      const chat = await message.getChat();

      // Información base del mensaje
      const messageInfo = {
        id: message.id._serialized,
        from: contact.name || contact.pushname || message.from,
        fromNumber: message.from.replace("@c.us", "").replace("@g.us", ""),
        body: message.body,
        type: message.type,
        timestamp: new Date(message.timestamp * 1000).toISOString(),
        isGroup: chat.isGroup,
        groupName: chat.isGroup ? chat.name : null,
        isForwarded: message.isForwarded,
        hasMedia: message.hasMedia,
        ack: message.ack, // Estado de entrega
      };

      // Procesar según el tipo de mensaje
      await processMessageByType(message, messageInfo);
    } catch (error) {
      logger.error("Error procesando mensaje:", error);
    }
  });

  /**
   * Procesar mensaje según su tipo y descargar medios
   */
  async function processMessageByType(message, messageInfo) {
    let additionalInfo = {};

    try {
      switch (message.type) {
        case "chat": // Mensaje de texto
          logger.info("📝 Mensaje de texto recibido:", messageInfo);
          break;

        case "image": // Imagen
          additionalInfo = await processImageMessage(message);
          logger.info("🖼️ Imagen recibida:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "document": // Documento
          additionalInfo = await processDocumentMessage(message);
          logger.info("📄 Documento recibido:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "ptt": // Nota de voz (Push to Talk)
        case "audio": // Audio
          additionalInfo = await processAudioMessage(message);
          logger.info("🎵 Audio/Nota de voz recibida:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "video": // Video
          additionalInfo = await processVideoMessage(message);
          logger.info("🎥 Video recibido:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "sticker": // Sticker
          additionalInfo = await processStickerMessage(message);
          logger.info("😊 Sticker recibido:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "location": // Ubicación
          additionalInfo = processLocationMessage(message);
          logger.info("📍 Ubicación recibida:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "vcard": // Contacto
          additionalInfo = processContactMessage(message);
          logger.info("👤 Contacto recibido:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "multi_vcard": // Múltiples contactos
          additionalInfo = processMultiContactMessage(message);
          logger.info("👥 Múltiples contactos recibidos:", {
            ...messageInfo,
            ...additionalInfo,
          });
          break;

        case "revoked": // Mensaje eliminado
          logger.info("🗑️ Mensaje eliminado:", messageInfo);
          break;

        case "ciphertext": // Mensaje cifrado (no descifrable)
          logger.info("🔒 Mensaje cifrado recibido:", messageInfo);
          break;

        default:
          logger.info("❓ Mensaje de tipo desconocido:", {
            ...messageInfo,
            rawType: message.type,
          });
          break;
      }

      // Auto-respuestas solo para mensajes de texto
      if (message.type === "chat") {
        await handleAutoResponses(message);
      }
    } catch (error) {
      logger.error(`Error procesando mensaje tipo ${message.type}:`, error);
    }
  }

  /**
   * Procesar mensaje de imagen
   */
  async function processImageMessage(message) {
    try {
      const media = await message.downloadMedia();
      if (media) {
        const filename = `image_${Date.now()}_${message.id._serialized.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.${media.mimetype.split("/")[1]}`;
        const filepath = path.join("./received_media/images", filename);

        // Guardar imagen
        fs.writeFileSync(filepath, media.data, "base64");

        return {
          mediaInfo: {
            filename: filename,
            filepath: filepath,
            mimetype: media.mimetype,
            filesize: Buffer.byteLength(media.data, "base64"),
            caption: message.body || null,
          },
        };
      }
    } catch (error) {
      logger.error("Error descargando imagen:", error);
      return { error: "Error al descargar imagen" };
    }
    return {};
  }

  /**
   * Procesar mensaje de documento
   */
  async function processDocumentMessage(message) {
    try {
      const media = await message.downloadMedia();
      if (media) {
        // Obtener extensión del tipo MIME o nombre original
        let extension = media.mimetype.split("/")[1];
        if (message._data && message._data.filename) {
          const originalExt = path.extname(message._data.filename);
          if (originalExt) extension = originalExt.substring(1);
        }

        const filename = `document_${Date.now()}_${message.id._serialized.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.${extension}`;
        const filepath = path.join("./received_media/documents", filename);

        // Guardar documento
        fs.writeFileSync(filepath, media.data, "base64");

        return {
          mediaInfo: {
            filename: filename,
            originalName: message._data?.filename || "unknown",
            filepath: filepath,
            mimetype: media.mimetype,
            filesize: Buffer.byteLength(media.data, "base64"),
            caption: message.body || null,
          },
        };
      }
    } catch (error) {
      logger.error("Error descargando documento:", error);
      return { error: "Error al descargar documento" };
    }
    return {};
  }

  /**
   * Procesar mensaje de audio/nota de voz
   */
  async function processAudioMessage(message) {
    try {
      const media = await message.downloadMedia();
      if (media) {
        const isVoiceNote = message.type === "ptt";
        const prefix = isVoiceNote ? "voice_note" : "audio";
        const extension = media.mimetype.includes("ogg") ? "ogg" : "mp3";
        const filename = `${prefix}_${Date.now()}_${message.id._serialized.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.${extension}`;
        const filepath = path.join("./received_media/audio", filename);

        // Guardar audio
        fs.writeFileSync(filepath, media.data, "base64");

        return {
          mediaInfo: {
            filename: filename,
            filepath: filepath,
            mimetype: media.mimetype,
            filesize: Buffer.byteLength(media.data, "base64"),
            isVoiceNote: isVoiceNote,
            duration: message._data?.duration || null,
          },
        };
      }
    } catch (error) {
      logger.error("Error descargando audio:", error);
      return { error: "Error al descargar audio" };
    }
    return {};
  }

  /**
   * Procesar mensaje de video
   */
  async function processVideoMessage(message) {
    try {
      const media = await message.downloadMedia();
      if (media) {
        const extension = media.mimetype.split("/")[1];
        const filename = `video_${Date.now()}_${message.id._serialized.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.${extension}`;
        const filepath = path.join("./received_media/videos", filename);

        // Guardar video
        fs.writeFileSync(filepath, media.data, "base64");

        return {
          mediaInfo: {
            filename: filename,
            filepath: filepath,
            mimetype: media.mimetype,
            filesize: Buffer.byteLength(media.data, "base64"),
            caption: message.body || null,
            duration: message._data?.duration || null,
          },
        };
      }
    } catch (error) {
      logger.error("Error descargando video:", error);
      return { error: "Error al descargar video" };
    }
    return {};
  }

  /**
   * Procesar sticker
   */
  async function processStickerMessage(message) {
    try {
      const media = await message.downloadMedia();
      if (media) {
        const extension = media.mimetype.includes("webp") ? "webp" : "png";
        const filename = `sticker_${Date.now()}_${message.id._serialized.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.${extension}`;
        const filepath = path.join("./received_media/stickers", filename);

        // Guardar sticker
        fs.writeFileSync(filepath, media.data, "base64");

        return {
          mediaInfo: {
            filename: filename,
            filepath: filepath,
            mimetype: media.mimetype,
            filesize: Buffer.byteLength(media.data, "base64"),
            isAnimated: media.mimetype.includes("webp"),
          },
        };
      }
    } catch (error) {
      logger.error("Error descargando sticker:", error);
      return { error: "Error al descargar sticker" };
    }
    return {};
  }

  /**
   * Procesar mensaje de ubicación
   */
  function processLocationMessage(message) {
    try {
      const location = message.location;
      if (location) {
        return {
          locationInfo: {
            latitude: location.latitude,
            longitude: location.longitude,
            description: location.description || null,
            name: message.body || null,
            googleMapsUrl: `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
          },
        };
      }
    } catch (error) {
      logger.error("Error procesando ubicación:", error);
    }
    return {};
  }

  /**
   * Procesar mensaje de contacto
   */
  function processContactMessage(message) {
    try {
      const vcard = message.vCards && message.vCards[0];
      if (vcard) {
        return {
          contactInfo: {
            vcard: vcard,
            name: vcard.displayName || "Sin nombre",
            phone: vcard.waid ? `+${vcard.waid}` : null,
            formattedName: vcard.fn || null,
            organization: vcard.org || null,
          },
        };
      }
    } catch (error) {
      logger.error("Error procesando contacto:", error);
    }
    return {};
  }

  /**
   * Procesar múltiples contactos
   */
  function processMultiContactMessage(message) {
    try {
      const vcards = message.vCards || [];
      const contacts = vcards.map((vcard) => ({
        name: vcard.displayName || "Sin nombre",
        phone: vcard.waid ? `+${vcard.waid}` : null,
        formattedName: vcard.fn || null,
        organization: vcard.org || null,
      }));

      return {
        contactsInfo: {
          count: contacts.length,
          contacts: contacts,
        },
      };
    } catch (error) {
      logger.error("Error procesando múltiples contactos:", error);
    }
    return {};
  }

  /**
   * Detectar cuando alguien se conecta/desconecta
   */
  client.on("change_state", (state) => {
    logger.info("🔄 Cambio de estado detectado:", {
      state: state,
      timestamp: new Date().toISOString(),
    });
  });

  // Inicializar cliente
  client.initialize();
};

/**
 * Manejar respuestas automáticas basadas en palabras clave
 * @param {Object} message - Mensaje de WhatsApp
 */
const handleAutoResponses = async (message) => {
  const body = message.body.toLowerCase();

  try {
    // Respuesta a "hola"
    if (
      body.includes("hola") ||
      body.includes("hi") ||
      body.includes("hello")
    ) {
      await message.reply("¡Hola! 👋 ¿En qué puedo ayudarte?");
      logger.info(`Auto-respuesta enviada a ${message.from}: saludo`);
    }

    // Respuesta a "precio" o "costo"
    else if (
      body.includes("precio") ||
      body.includes("costo") ||
      body.includes("cuanto")
    ) {
      await message.reply(
        "📋 Para consultar precios, por favor visita nuestro catálogo o contacta a ventas."
      );
      logger.info(`Auto-respuesta enviada a ${message.from}: precios`);
    }

    // Respuesta a "horario"
    else if (
      body.includes("horario") ||
      body.includes("hora") ||
      body.includes("abierto")
    ) {
      await message.reply(
        "🕐 Nuestro horario de atención es de Lunes a Viernes, 9:00 AM - 6:00 PM"
      );
      logger.info(`Auto-respuesta enviada a ${message.from}: horario`);
    }

    // Respuesta a "gracias"
    else if (body.includes("gracias") || body.includes("thank")) {
      await message.reply("¡De nada! 😊 Estoy aquí para ayudarte.");
      logger.info(`Auto-respuesta enviada a ${message.from}: agradecimiento`);
    }
  } catch (error) {
    logger.error("Error enviando auto-respuesta:", error);
  }
};

// ====== RUTAS DE LA API ======

/**
 * Health Check - Verificar estado del servicio
 * @route GET /health
 * @returns {Object} Estado del servicio y cliente WhatsApp
 */
app.get("/health", (req, res) => {
  const healthStatus = {
    success: true,
    service: "WhatsApp API",
    status: "running",
    timestamp: new Date().toISOString(),
    whatsapp: {
      ready: isClientReady,
      needsQR: !!qrCode,
    },
  };

  logger.info("Health check solicitado");
  res.json(healthStatus);
});

/**
 * Generar token de acceso para QR (protegido con Basic Auth)
 * @route POST /auth/qr-token
 * @returns {Object} Token temporal para acceder al QR
 */
app.post("/auth/qr-token", basicAuth, (req, res) => {
  if (isClientReady) {
    return res.status(400).json({
      success: false,
      error: "Cliente ya está autenticado, no se necesita QR",
      code: "CLIENT_ALREADY_READY",
    });
  }

  if (!qrCode) {
    return res.status(404).json({
      success: false,
      error: "No hay código QR disponible actualmente",
      code: "QR_NOT_AVAILABLE",
    });
  }

  // Generar nuevo token si no existe
  if (!qrToken) {
    qrToken = generateQRToken();
  }

  logger.info("Token QR solicitado y generado");

  res.json({
    success: true,
    token: qrToken,
    expiresIn: "30 minutes or until connected",
    usage: {
      endpoint: "/qr",
      method: "GET",
      header: `Authorization: Bearer ${qrToken}`,
    },
    message: "Use este token para acceder al código QR",
  });
});
/**
 * Obtener código QR para autenticación (protegido con Bearer Token)
 * @route GET /qr
 * @returns {HTML/JSON} Página web con QR visual o JSON con código QR
 */
app.get("/qr", qrTokenAuth, (req, res) => {
  if (isClientReady) {
    return res.json({
      success: true,
      message: "Cliente ya está autenticado",
      authenticated: true,
    });
  }

  if (!qrCode) {
    return res.json({
      success: false,
      message: "Código QR no disponible. Reinicia el servicio.",
      code: "QR_NOT_AVAILABLE",
    });
  }

  // Si el navegador acepta HTML, mostrar página visual
  const acceptsHtml =
    req.headers.accept && req.headers.accept.includes("text/html");

  if (acceptsHtml) {
    // Generar página HTML con QR visual
    const htmlPage = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp API - Código QR</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
            }
            
            .container {
                text-align: center;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 2rem;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                max-width: 500px;
                width: 90%;
            }
            
            .title {
                font-size: 2rem;
                margin-bottom: 0.5rem;
                background: linear-gradient(45deg, #fff, #f0f0f0);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .subtitle {
                font-size: 1.1rem;
                margin-bottom: 2rem;
                opacity: 0.9;
            }
            
            .qr-container {
                background: white;
                padding: 2rem;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                margin-bottom: 2rem;
                display: inline-block;
            }
            
            .qr-code {
                width: 256px;
                height: 256px;
            }
            
            .instructions {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 1rem;
                margin-bottom: 1rem;
                text-align: left;
            }
            
            .step {
                display: flex;
                align-items: center;
                margin-bottom: 0.5rem;
                font-size: 0.95rem;
            }
            
            .step-number {
                background: #4CAF50;
                color: white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 10px;
                font-weight: bold;
                font-size: 0.8rem;
            }
            
            .status {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                margin-bottom: 1rem;
            }
            
            .status-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #ff6b35;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            .refresh-btn {
                background: linear-gradient(45deg, #4CAF50, #45a049);
                color: white;
                border: none;
                padding: 0.8rem 1.5rem;
                border-radius: 25px;
                cursor: pointer;
                font-size: 0.9rem;
                transition: transform 0.2s, box-shadow 0.2s;
                text-decoration: none;
                display: inline-block;
            }
            
            .refresh-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(76, 175, 80, 0.3);
            }
            
            .loading {
                display: none;
                margin-top: 1rem;
            }
            
            .spinner {
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-top: 3px solid white;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">📱 WhatsApp API</div>
            <div class="subtitle">Escanea el código QR para conectar</div>
            
            <div class="status">
                <div class="status-dot"></div>
                <span>Esperando conexión...</span>
            </div>
            
            <div class="qr-container">
                <div id="qrcode"></div>
            </div>
            
            <div class="instructions">
                <div class="step">
                    <div class="step-number">1</div>
                    <span>Abre WhatsApp en tu teléfono</span>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <span>Ve a Menú → Dispositivos vinculados</span>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <span>Toca "Vincular un dispositivo"</span>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <span>Escanea este código QR</span>
                </div>
            </div>
            
            <button class="refresh-btn" onclick="location.reload()">
                🔄 Actualizar código
            </button>
            
            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p style="margin-top: 10px;">Conectando...</p>
            </div>
        </div>

        <!-- Incluir QRCode.js desde CDN -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
        
        <script>
            // Generar QR Code visual
            const qr = qrcode(0, 'M');
            qr.addData('${qrCode}');
            qr.make();
            
            // Insertar QR en el contenedor
            document.getElementById('qrcode').innerHTML = qr.createImgTag(4, 8);
            
            // Auto-refresh cada 30 segundos para verificar si ya se conectó
            let refreshTimer = setInterval(() => {
                fetch('/health')
                    .then(response => response.json())
                    .then(data => {
                        if (data.whatsapp && data.whatsapp.ready) {
                            clearInterval(refreshTimer);
                            document.querySelector('.container').innerHTML = \`
                                <div class="title">✅ Conectado</div>
                                <div class="subtitle">WhatsApp se ha vinculado correctamente</div>
                                <div style="margin: 2rem 0;">
                                    <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
                                    <p style="font-size: 1.1rem; opacity: 0.9;">
                                        La API está lista para usar
                                    </p>
                                </div>
                                <a href="/health" class="refresh-btn">
                                    📊 Ver estado de la API
                                </a>
                            \`;
                        }
                    })
                    .catch(console.error);
            }, 5000);
            
            // Limpiar timer al cerrar la página
            window.addEventListener('beforeunload', () => {
                if (refreshTimer) clearInterval(refreshTimer);
            });
        </script>
    </body>
    </html>
    `;

    res.setHeader("Content-Type", "text/html");
    res.send(htmlPage);
  } else {
    // Respuesta JSON para APIs
    res.json({
      success: true,
      qrCode: qrCode,
      message: "Escanea este código QR con WhatsApp",
      instructions: [
        "Abre WhatsApp en tu teléfono",
        "Ve a Menú → Dispositivos vinculados",
        'Toca "Vincular un dispositivo"',
        "Escanea el código QR",
      ],
    });
  }
});

/**
 * Enviar mensaje de texto
 * @route POST /send/text
 * @param {string} number - Número de teléfono (formato: 5493511234567)
 * @param {string} message - Mensaje a enviar
 * @returns {Object} Resultado del envío
 */
app.post("/send/text", basicAuth, checkClientReady, async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: "Parámetros requeridos: number, message",
        code: "MISSING_PARAMS",
      });
    }

    const chatId = `${number}@c.us`;
    const result = await client.sendMessage(chatId, message);

    logger.info(`Mensaje de texto enviado a ${number}: ${message}`);

    res.json({
      success: true,
      message: "Mensaje enviado correctamente",
      messageId: result.id._serialized,
      to: number,
    });
  } catch (error) {
    logger.error("Error enviando mensaje de texto:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      code: "SEND_TEXT_ERROR",
      details: error.message,
    });
  }
});

/**
 * Enviar imagen con texto
 * @route POST /send/image
 * @param {string} number - Número de teléfono
 * @param {string} caption - Texto que acompaña la imagen (opcional)
 * @param {file} image - Archivo de imagen
 * @returns {Object} Resultado del envío
 */
app.post(
  "/send/image",
  basicAuth,
  checkClientReady,
  upload.single("image"),
  async (req, res) => {
    try {
      const { number, caption = "" } = req.body;

      if (!number || !req.file) {
        return res.status(400).json({
          success: false,
          error: "Parámetros requeridos: number, image (archivo)",
          code: "MISSING_PARAMS",
        });
      }

      const media = MessageMedia.fromFilePath(req.file.path);
      const chatId = `${number}@c.us`;

      const result = await client.sendMessage(chatId, media, { caption });

      // Eliminar archivo temporal
      fs.unlinkSync(req.file.path);

      logger.info(`Imagen enviada a ${number} con caption: ${caption}`);

      res.json({
        success: true,
        message: "Imagen enviada correctamente",
        messageId: result.id._serialized,
        to: number,
        caption: caption,
      });
    } catch (error) {
      logger.error("Error enviando imagen:", error);

      // Limpiar archivo si existe
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: "Error interno del servidor",
        code: "SEND_IMAGE_ERROR",
        details: error.message,
      });
    }
  }
);

/**
 * Enviar documento con texto
 * @route POST /send/document
 * @param {string} number - Número de teléfono
 * @param {string} caption - Texto que acompaña el documento (opcional)
 * @param {file} document - Archivo del documento
 * @returns {Object} Resultado del envío
 */
app.post(
  "/send/document",
  basicAuth,
  checkClientReady,
  upload.single("document"),
  async (req, res) => {
    try {
      const { number, caption = "" } = req.body;

      if (!number || !req.file) {
        return res.status(400).json({
          success: false,
          error: "Parámetros requeridos: number, document (archivo)",
          code: "MISSING_PARAMS",
        });
      }

      const media = MessageMedia.fromFilePath(req.file.path);
      const chatId = `${number}@c.us`;

      const result = await client.sendMessage(chatId, media, {
        caption,
        sendMediaAsDocument: true,
      });

      // Eliminar archivo temporal
      fs.unlinkSync(req.file.path);

      logger.info(`Documento enviado a ${number} con caption: ${caption}`);

      res.json({
        success: true,
        message: "Documento enviado correctamente",
        messageId: result.id._serialized,
        to: number,
        caption: caption,
      });
    } catch (error) {
      logger.error("Error enviando documento:", error);

      // Limpiar archivo si existe
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: "Error interno del servidor",
        code: "SEND_DOCUMENT_ERROR",
        details: error.message,
      });
    }
  }
);

/**
 * Enviar audio o nota de voz
 * @route POST /send/audio
 * @param {string} number - Número de teléfono
 * @param {string} caption - Texto que acompaña el audio (opcional)
 * @param {boolean} isVoiceNote - Si debe enviarse como nota de voz (opcional, default: true)
 * @param {file} audio - Archivo de audio
 * @returns {Object} Resultado del envío
 */
app.post(
  "/send/audio",
  basicAuth,
  checkClientReady,
  upload.single("audio"),
  async (req, res) => {
    try {
      const { number, caption = "", isVoiceNote = "true" } = req.body;

      if (!number || !req.file) {
        return res.status(400).json({
          success: false,
          error: "Parámetros requeridos: number, audio (archivo)",
          code: "MISSING_PARAMS",
        });
      }

      const media = MessageMedia.fromFilePath(req.file.path);
      const chatId = `${number}@c.us`;

      // Configurar opciones para nota de voz
      const options = {
        caption: caption || undefined,
        sendAudioAsVoice: isVoiceNote === "true",
      };

      const result = await client.sendMessage(chatId, media, options);

      // Eliminar archivo temporal
      fs.unlinkSync(req.file.path);

      const audioType = isVoiceNote === "true" ? "nota de voz" : "audio";
      logger.info(`${audioType} enviado a ${number} con caption: ${caption}`);

      res.json({
        success: true,
        message: `${audioType} enviado correctamente`,
        messageId: result.id._serialized,
        to: number,
        caption: caption,
        sentAsVoiceNote: isVoiceNote === "true",
      });
    } catch (error) {
      logger.error("Error enviando audio:", error);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: "Error interno del servidor",
        code: "SEND_AUDIO_ERROR",
        details: error.message,
      });
    }
  }
);

/**
 * Enviar video con texto
 * @route POST /send/video
 * @param {string} number - Número de teléfono
 * @param {string} caption - Texto que acompaña el video (opcional)
 * @param {file} video - Archivo de video
 * @returns {Object} Resultado del envío
 */
app.post(
  "/send/video",
  basicAuth,
  checkClientReady,
  upload.single("video"),
  async (req, res) => {
    try {
      const { number, caption = "" } = req.body;

      if (!number || !req.file) {
        return res.status(400).json({
          success: false,
          error: "Parámetros requeridos: number, video (archivo)",
          code: "MISSING_PARAMS",
        });
      }

      const media = MessageMedia.fromFilePath(req.file.path);
      const chatId = `${number}@c.us`;

      const result = await client.sendMessage(chatId, media, {
        caption: caption || undefined,
      });

      // Eliminar archivo temporal
      fs.unlinkSync(req.file.path);

      logger.info(`Video enviado a ${number} con caption: ${caption}`);

      res.json({
        success: true,
        message: "Video enviado correctamente",
        messageId: result.id._serialized,
        to: number,
        caption: caption,
      });
    } catch (error) {
      logger.error("Error enviando video:", error);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: "Error interno del servidor",
        code: "SEND_VIDEO_ERROR",
        details: error.message,
      });
    }
  }
);

/**
 * Enviar ubicación
 * @route POST /send/location
 * @param {string} number - Número de teléfono
 * @param {number} latitude - Latitud (requerido)
 * @param {number} longitude - Longitud (requerido)
 * @param {string} name - Nombre del lugar (opcional)
 * @param {string} address - Dirección (opcional)
 * @returns {Object} Resultado del envío
 */
app.post("/send/location", basicAuth, checkClientReady, async (req, res) => {
  try {
    const { number, latitude, longitude, name = "", address = "" } = req.body;

    if (!number || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: "Parámetros requeridos: number, latitude, longitude",
        code: "MISSING_PARAMS",
      });
    }

    // Validar coordenadas
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Coordenadas inválidas. Latitude: -90 a 90, Longitude: -180 a 180",
        code: "INVALID_COORDINATES",
      });
    }

    const chatId = `${number}@c.us`;

    // Crear objeto de ubicación
    const location = new Location(lat, lng, name, address);
    const result = await client.sendMessage(chatId, location);

    logger.info(`Ubicación enviada a ${number}: ${lat}, ${lng} - ${name}`);

    res.json({
      success: true,
      message: "Ubicación enviada correctamente",
      messageId: result.id._serialized,
      to: number,
      location: {
        latitude: lat,
        longitude: lng,
        name: name,
        address: address,
        googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
      },
    });
  } catch (error) {
    logger.error("Error enviando ubicación:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      code: "SEND_LOCATION_ERROR",
      details: error.message,
    });
  }
});

/**
 * Enviar contacto
 * @route POST /send/contact
 * @param {string} number - Número de teléfono
 * @param {string} contactName - Nombre del contacto (requerido)
 * @param {string} contactNumber - Número del contacto (requerido)
 * @param {string} organization - Organización (opcional)
 * @returns {Object} Resultado del envío
 */
app.post("/send/contact", basicAuth, checkClientReady, async (req, res) => {
  try {
    const { number, contactName, contactNumber, organization = "" } = req.body;

    if (!number || !contactName || !contactNumber) {
      return res.status(400).json({
        success: false,
        error: "Parámetros requeridos: number, contactName, contactNumber",
        code: "MISSING_PARAMS",
      });
    }

    const chatId = `${number}@c.us`;

    // Limpiar número de contacto (quitar caracteres especiales)
    const cleanContactNumber = contactNumber.replace(/[^\d+]/g, "");

    // Crear vCard
    const vcard =
      `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `FN:${contactName}\n` +
      `TEL;TYPE=CELL:${cleanContactNumber}\n` +
      (organization ? `ORG:${organization}\n` : "") +
      `END:VCARD`;

    const contact = new MessageMedia(
      "text/vcard",
      Buffer.from(vcard).toString("base64"),
      `${contactName}.vcf`
    );
    const result = await client.sendMessage(chatId, contact);

    logger.info(
      `Contacto enviado a ${number}: ${contactName} - ${cleanContactNumber}`
    );

    res.json({
      success: true,
      message: "Contacto enviado correctamente",
      messageId: result.id._serialized,
      to: number,
      contact: {
        name: contactName,
        number: cleanContactNumber,
        organization: organization,
      },
    });
  } catch (error) {
    logger.error("Error enviando contacto:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      code: "SEND_CONTACT_ERROR",
      details: error.message,
    });
  }
});

/**
 * Enviar sticker
 * @route POST /send/sticker
 * @param {string} number - Número de teléfono
 * @param {file} sticker - Archivo de sticker (imagen)
 * @returns {Object} Resultado del envío
 */
app.post(
  "/send/sticker",
  basicAuth,
  checkClientReady,
  upload.single("sticker"),
  async (req, res) => {
    try {
      const { number } = req.body;

      if (!number || !req.file) {
        return res.status(400).json({
          success: false,
          error: "Parámetros requeridos: number, sticker (archivo de imagen)",
          code: "MISSING_PARAMS",
        });
      }

      const media = MessageMedia.fromFilePath(req.file.path);
      const chatId = `${number}@c.us`;

      const result = await client.sendMessage(chatId, media, {
        sendMediaAsSticker: true,
      });

      // Eliminar archivo temporal
      fs.unlinkSync(req.file.path);

      logger.info(`Sticker enviado a ${number}`);

      res.json({
        success: true,
        message: "Sticker enviado correctamente",
        messageId: result.id._serialized,
        to: number,
      });
    } catch (error) {
      logger.error("Error enviando sticker:", error);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: "Error interno del servidor",
        code: "SEND_STICKER_ERROR",
        details: error.message,
      });
    }
  }
);
app.get("/chat/:number", basicAuth, checkClientReady, async (req, res) => {
  try {
    const { number } = req.params;
    const chatId = number.includes("@g.us") ? number : `${number}@c.us`;

    const chat = await client.getChatById(chatId);
    const contact = await chat.getContact();

    const chatInfo = {
      success: true,
      chat: {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        isMuted: chat.isMuted,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp,
        contact: chat.isGroup
          ? null
          : {
              name: contact.name,
              pushname: contact.pushname,
              isBlocked: contact.isBlocked,
              isWAContact: contact.isWAContact,
            },
      },
    };

    // Si es un grupo, obtener participantes
    if (chat.isGroup) {
      chatInfo.chat.participants = chat.participants.map((p) => ({
        id: p.id._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      }));
      chatInfo.chat.description = chat.description;
      chatInfo.chat.groupMetadata = {
        creation: chat.groupMetadata.creation,
        owner: chat.groupMetadata.owner,
        participantsCount: chat.participants.length,
      };
    }

    logger.info(`Información de chat obtenida: ${chatId}`);
    res.json(chatInfo);
  } catch (error) {
    logger.error("Error obteniendo información del chat:", error);
    res.status(404).json({
      success: false,
      error: "Chat no encontrado o error interno",
      code: "CHAT_NOT_FOUND",
      details: error.message,
    });
  }
});

/**
 * Listar todos los chats
 * @route GET /chats
 * @returns {Object} Lista de todos los chats
 */
app.get("/chats", basicAuth, checkClientReady, async (req, res) => {
  try {
    const chats = await client.getChats();

    const chatsList = chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp,
      lastMessage: chat.lastMessage
        ? {
            body: chat.lastMessage.body,
            timestamp: chat.lastMessage.timestamp,
            from: chat.lastMessage.from,
          }
        : null,
    }));

    logger.info(`Lista de chats obtenida: ${chats.length} chats`);

    res.json({
      success: true,
      count: chats.length,
      chats: chatsList,
    });
  } catch (error) {
    logger.error("Error obteniendo lista de chats:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      code: "GET_CHATS_ERROR",
      details: error.message,
    });
  }
});

// Manejo de errores global
app.use((error, req, res, next) => {
  logger.error("Error no manejado:", error);
  res.status(500).json({
    success: false,
    error: "Error interno del servidor",
    code: "INTERNAL_ERROR",
  });
});

// Ruta 404
app.use((req, res) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "Ruta no encontrada",
    code: "ROUTE_NOT_FOUND",
  });
});

// Inicializar servidor
const server = app.listen(PORT, () => {
  logger.info(`🚀 Servidor iniciado en puerto ${PORT}`);
  logger.info("🔐 Autenticación Basic Auth habilitada");
  logger.info("📱 Inicializando cliente WhatsApp...");

  // Inicializar WhatsApp
  initializeWhatsAppClient();
});

// Manejo de cierre graceful
process.on("SIGINT", async () => {
  logger.info("Cerrando servidor...");

  if (client) {
    await client.destroy();
    logger.info("Cliente WhatsApp cerrado");
  }

  server.close(() => {
    logger.info("Servidor cerrado correctamente");
    process.exit(0);
  });
});

module.exports = app;
