/**
 * Cliente de prueba para WhatsApp API
 * Uso: node test-client.js
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Configuración
const API_BASE_URL = "http://localhost:3000";
const USERNAME = "admin";
const PASSWORD = "whatsapp_api_2024_secure";
const TEST_NUMBER = "5493511234567"; // Cambiar por un número real para pruebas

// Crear headers de autenticación
const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
const authHeaders = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/json",
};

/**
 * Hacer petición HTTP
 */
function makeRequest(method, path, data = null, isFormData = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: method,
      headers: isFormData
        ? { Authorization: authHeaders.Authorization }
        : authHeaders,
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on("error", reject);

    if (data && !isFormData) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Enviar archivo con form data
 */
function sendFile(endpoint, filePath, number, caption = "") {
  return new Promise((resolve, reject) => {
    const FormData = require("form-data");
    const form = new FormData();

    form.append("number", number);
    form.append("caption", caption);

    // Determinar el nombre del campo según el endpoint
    const fieldName = endpoint.includes("image") ? "image" : "document";
    form.append(fieldName, fs.createReadStream(filePath));

    const url = new URL(API_BASE_URL + endpoint);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        ...form.getHeaders(),
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on("error", reject);
    form.pipe(req);
  });
}

/**
 * Función principal de pruebas
 */
async function runTests() {
  console.log("🧪 Iniciando pruebas de WhatsApp API...\n");

  try {
    // 1. Health Check
    console.log("1️⃣ Probando Health Check...");
    const health = await makeRequest("GET", "/health");
    console.log(`   Status: ${health.status}`);
    console.log(`   Ready: ${health.data.whatsapp?.ready || false}`);
    console.log(`   Needs QR: ${health.data.whatsapp?.needsQR || false}\n`);

    if (!health.data.whatsapp?.ready) {
      console.log(
        "⚠️ Cliente WhatsApp no está listo. Verifica el QR code en /qr"
      );

      // Mostrar QR
      console.log("2️⃣ Obteniendo código QR...");
      const qr = await makeRequest("GET", "/qr");
      console.log(`   Status: ${qr.status}`);
      if (qr.data.qrCode) {
        console.log("   📱 Código QR disponible - escanear con WhatsApp");
      } else {
        console.log(`   Message: ${qr.data.message}`);
      }
      return;
    }

    // 2. Listar chats
    console.log("2️⃣ Obteniendo lista de chats...");
    const chats = await makeRequest("GET", "/chats");
    console.log(`   Status: ${chats.status}`);
    console.log(`   Chats encontrados: ${chats.data.count || 0}\n`);

    // 3. Enviar mensaje de texto
    console.log("3️⃣ Enviando mensaje de texto...");
    const textMessage = await makeRequest("POST", "/send/text", {
      number: TEST_NUMBER,
      message:
        "🤖 Mensaje de prueba desde la API - " + new Date().toLocaleString(),
    });
    console.log(`   Status: ${textMessage.status}`);
    console.log(`   Success: ${textMessage.data.success}`);
    if (textMessage.data.messageId) {
      console.log(`   Message ID: ${textMessage.data.messageId}`);
    }
    console.log("");

    // 4. Obtener información de chat específico
    console.log("4️⃣ Obteniendo info del chat...");
    const chatInfo = await makeRequest("GET", `/chat/${TEST_NUMBER}`);
    console.log(`   Status: ${chatInfo.status}`);
    if (chatInfo.data.success) {
      console.log(`   Chat: ${chatInfo.data.chat.name}`);
      console.log(`   Es grupo: ${chatInfo.data.chat.isGroup}`);
      console.log(`   Mensajes no leídos: ${chatInfo.data.chat.unreadCount}`);
    }
    console.log("");

    // 5. Crear imagen de prueba y enviarla
    console.log("5️⃣ Creando y enviando imagen de prueba...");
    const testImagePath = "./test-image.png";
    createTestImage(testImagePath);

    if (fs.existsSync(testImagePath)) {
      try {
        const imageMessage = await sendFile(
          "/send/image",
          testImagePath,
          TEST_NUMBER,
          "📸 Imagen de prueba desde la API"
        );
        console.log(`   Status: ${imageMessage.status}`);
        console.log(`   Success: ${imageMessage.data.success}`);

        // Limpiar archivo de prueba
        fs.unlinkSync(testImagePath);
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    } else {
      console.log("   ⚠️ No se pudo crear imagen de prueba");
    }
    console.log("");

    // 6. Crear documento de prueba y enviarlo
    console.log("6️⃣ Creando y enviando documento de prueba...");
    const testDocPath = "./test-document.txt";
    createTestDocument(testDocPath);

    if (fs.existsSync(testDocPath)) {
      try {
        const docMessage = await sendFile(
          "/send/document",
          testDocPath,
          TEST_NUMBER,
          "📄 Documento de prueba desde la API"
        );
        console.log(`   Status: ${docMessage.status}`);
        console.log(`   Success: ${docMessage.data.success}`);

        // Limpiar archivo de prueba
        fs.unlinkSync(testDocPath);
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    } else {
      console.log("   ⚠️ No se pudo crear documento de prueba");
    }
    console.log("");

    console.log("✅ Pruebas completadas!");

    // Instrucciones finales
    console.log(
      "\n📝 Para probar las auto-respuestas, envía estos mensajes al número conectado:"
    );
    console.log('   - "Hola" → Respuesta de saludo');
    console.log('   - "precio" → Información de precios');
    console.log('   - "horario" → Horarios de atención');
    console.log('   - "gracias" → Respuesta de agradecimiento');
  } catch (error) {
    console.error("❌ Error en las pruebas:", error.message);
  }
}

/**
 * Crear imagen de prueba simple (1x1 pixel PNG)
 */
function createTestImage(filepath) {
  try {
    // PNG de 1x1 pixel transparente
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    fs.writeFileSync(filepath, pngData);
    return true;
  } catch (error) {
    console.log("Error creando imagen:", error.message);
    return false;
  }
}

/**
 * Crear documento de prueba
 */
function createTestDocument(filepath) {
  try {
    const content = `Documento de prueba - WhatsApp API
=====================================

Este es un documento de prueba generado automáticamente.

Fecha: ${new Date().toLocaleString()}
API: WhatsApp REST API
Versión: 1.0.0

Contenido de prueba para verificar la funcionalidad de envío de documentos.

¡Prueba completada exitosamente! ✅
`;

    fs.writeFileSync(filepath, content, "utf8");
    return true;
  } catch (error) {
    console.log("Error creando documento:", error.message);
    return false;
  }
}

/**
 * Verificar argumentos de línea de comandos
 */
if (process.argv.length > 2) {
  const testNumber = process.argv[2];
  if (testNumber.match(/^\d{10,15}$/)) {
    TEST_NUMBER = testNumber;
    console.log(`📱 Usando número de prueba: ${TEST_NUMBER}`);
  } else {
    console.log(
      "❌ Número de teléfono inválido. Usa formato: node test-client.js 5493511234567"
    );
    process.exit(1);
  }
}

// Instalar form-data si no está disponible
try {
  require("form-data");
} catch (error) {
  console.log("📦 Instalando dependencia form-data...");
  const { execSync } = require("child_process");
  execSync("npm install form-data", { stdio: "inherit" });
  console.log("✅ form-data instalado\n");
}

// Ejecutar pruebas
runTests().catch(console.error);
