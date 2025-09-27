# WhatsApp API Server

API REST completa para WhatsApp usando `whatsapp-web.js` con autenticación, logging, y arquitectura robusta.

## 🚀 Características

- ✅ **Leer mensajes entrantes** (logging en consola y archivos)
- ✅ **Enviar mensajes de texto, imágenes y documentos**
- ✅ **Reaccionar automáticamente** a palabras clave
- ✅ **Detectar conexiones/desconexiones**
- ✅ **Manejar grupos y chats individuales**
- ✅ **Autenticación Basic Auth**
- ✅ **Logging diario con Winston**
- ✅ **Arquitectura no bloqueante**
- ✅ **Health check**
- ✅ **Manejo robusto de errores**

## 📋 Requisitos

- Node.js >= 16.0.0
- npm o yarn

## 🛠️ Instalación

1. **Clonar o crear el proyecto:**
```bash
git clone https://github.com/elimquijano/whatsapp-api.git
```

2. **Instalar dependencias:**
```bash
npm install
```

3. **Configurar variables de entorno:**
```bash
cp .env.example .env
```
Editar `.env` con tus credenciales:
```env
PORT=3000
API_USERNAME=admin
API_PASSWORD=tu_password_super_seguro_123
NODE_ENV=development
```

4. **Crear directorios necesarios:**
```bash
mkdir uploads logs
```

5. **Iniciar el servidor:**
```bash
# Desarrollo (con nodemon)
npm run dev

# Producción
npm start
```

## 🔐 Autenticación

Todas las rutas (excepto `/health` y `/qr`) requieren **Basic Authentication**.

**Header requerido:**
```
Authorization: Basic base64(username:password)
```

**Ejemplo con curl:**
```bash
curl -u admin:tu_password_super_seguro_123 http://localhost:3000/chats
```

## 📱 Primera vez - Escanear QR

1. Iniciar el servidor
2. Ir a `http://localhost:3000/qr`
3. Escanear el código QR con WhatsApp
4. El cliente quedará autenticado

## 📚 Documentación de la API

### Base URL
```
http://localhost:3000
```

---

### **GET** `/health`
**Descripción:** Verificar estado del servicio y cliente WhatsApp.

**Auth:** No requiere

**Response:**
```json
{
  "success": true,
  "service": "WhatsApp API",
  "status": "running",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "whatsapp": {
    "ready": true,
    "needsQR": false
  }
}
```

---

### **GET** `/qr`
**Descripción:** Obtener código QR para autenticación inicial.

**Auth:** No requiere

**Response:**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,...",
  "message": "Escanea este código QR con WhatsApp"
}
```

---

### **POST** `/send/text`
**Descripción:** Enviar mensaje de texto.

**Auth:** Requerida

**Body Parameters:**
- `number` (string, required): Número de teléfono (ej: 5493511234567)
- `message` (string, required): Mensaje a enviar

**Example:**
```bash
curl -X POST \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5493511234567",
    "message": "¡Hola! Este es un mensaje de prueba"
  }' \
  http://localhost:3000/send/text
```

**Response:**
```json
{
  "success": true,
  "message": "Mensaje enviado correctamente",
  "messageId": "3EB0123456789ABCDEF@c.us_1234567890",
  "to": "5493511234567"
}
```

---

### **POST** `/send/image`
**Descripción:** Enviar imagen con texto opcional.

**Auth:** Requerida

**Form Parameters:**
- `number` (string, required): Número de teléfono
- `caption` (string, optional): Texto que acompaña la imagen
- `image` (file, required): Archivo de imagen

**Example:**
```bash
curl -X POST \
  -u admin:password \
  -F "number=5493511234567" \
  -F "caption=¡Mira esta imagen!" \
  -F "image=@/ruta/a/imagen.jpg" \
  http://localhost:3000/send/image
```

**Response:**
```json
{
  "success": true,
  "message": "Imagen enviada correctamente",
  "messageId": "3EB0123456789ABCDEF@c.us_1234567890",
  "to": "5493511234567",
  "caption": "¡Mira esta imagen!"
}
```

---

### **POST** `/send/document`
**Descripción:** Enviar documento con texto opcional.

**Auth:** Requerida

**Form Parameters:**
- `number` (string, required): Número de teléfono
- `caption` (string, optional): Texto que acompaña el documento
- `document` (file, required): Archivo del documento

**Example:**
```bash
curl -X POST \
  -u admin:password \
  -F "number=5493511234567" \
  -F "caption=Aquí está el documento solicitado" \
  -F "document=@/ruta/a/documento.pdf" \
  http://localhost:3000/send/document
```

**Response:**
```json
{
  "success": true,
  "message": "Documento enviado correctamente",
  "messageId": "3EB0123456789ABCDEF@c.us_1234567890",
  "to": "5493511234567",
  "caption": "Aquí está el documento solicitado"
}
```

---

### **GET** `/chat/:number`
**Descripción:** Obtener información detallada de un chat específico.

**Auth:** Requerida

**Path Parameters:**
- `number` (string, required): Número de teléfono o ID del grupo

**Example:**
```bash
curl -u admin:password http://localhost:3000/chat/5493511234567
```

**Response (Chat Individual):**
```json
{
  "success": true,
  "chat": {
    "id": "5493511234567@c.us",
    "name": "Juan Pérez",
    "isGroup": false,
    "isMuted": false,
    "unreadCount": 0,
    "timestamp": 1640995200,
    "contact": {
      "name": "Juan Pérez",
      "pushname": "Juan",
      "isBlocked": false,
      "isWAContact": true
    }
  }
}
```

**Response (Grupo):**
```json
{
  "success": true,
  "chat": {
    "id": "120363012345678901@g.us",
    "name": "Grupo de Trabajo",
    "isGroup": true,
    "isMuted": false,
    "unreadCount": 5,
    "timestamp": 1640995200,
    "contact": null,
    "participants": [
      {
        "id": "5493511234567@c.us",
        "isAdmin": true,
        "isSuperAdmin": false
      },
      {
        "id": "5493511234568@c.us",
        "isAdmin": false,
        "isSuperAdmin": false
      }
    ],
    "description": "Grupo para coordinar el trabajo del equipo",
    "groupMetadata": {
      "creation": 1640995200,
      "owner": "5493511234567@c.us",
      "participantsCount": 15
    }
  }
}
```

---

### **GET** `/chats`
**Descripción:** Listar todos los chats (individuales y grupos).

**Auth:** Requerida

**Example:**
```bash
curl -u admin:password http://localhost:3000/chats
```

**Response:**
```json
{
  "success": true,
  "count": 25,
  "chats": [
    {
      "id": "5493511234567@c.us",
      "name": "Juan Pérez",
      "isGroup": false,
      "unreadCount": 2,
      "timestamp": 1640995200,
      "lastMessage": {
        "body": "¡Hola! ¿Cómo estás?",
        "timestamp": 1640995200,
        "from": "5493511234567@c.us"
      }
    },
    {
      "id": "120363012345678901@g.us",
      "name": "Grupo de Trabajo",
      "isGroup": true,
      "unreadCount": 0,
      "timestamp": 1640995100,
      "lastMessage": {
        "body": "Perfecto, nos vemos mañana",
        "timestamp": 1640995100,
        "from": "5493511234568@c.us"
      }
    }
  ]
}
```

## 🤖 Auto-Respuestas

El sistema responde automáticamente a ciertas palabras clave:

| Palabra Clave | Respuesta |
|---------------|-----------|
| `hola`, `hi`, `hello` | "¡Hola! 👋 ¿En qué puedo ayudarte?" |
| `precio`, `costo`, `cuanto` | "📋 Para consultar precios, por favor visita nuestro catálogo o contacta a ventas." |
| `horario`, `hora`, `abierto` | "🕐 Nuestro horario de atención es de Lunes a Viernes, 9:00 AM - 6:00 PM" |
| `gracias`, `thank` | "¡De nada! 😊 Estoy aquí para ayudarte." |

## 📝 Logs

El sistema genera logs diarios automáticamente:

- **Ubicación:** `./logs/`
- **Formato:** `YYYY-MM-DD-combined.log` y `YYYY-MM-DD-error.log`
- **Información registrada:**
  - Mensajes entrantes y salientes
  - Errores de autenticación
  - Estados de conexión
  - Accesos a la API

**Ejemplo de log:**
```json
{
  "level": "info",
  "message": "📨 Mensaje recibido:",
  "from": "Juan Pérez",
  "body": "Hola, ¿cómo están?",
  "type": "chat",
  "isGroup": false,
  "timestamp": "2024-01-01T12:30:45.123Z"
}
```

## 🏗️ Arquitectura

### **Componentes principales:**
- **Express.js:** Servidor HTTP no bloqueante
- **whatsapp-web.js:** Cliente de WhatsApp
- **Winston:** Sistema de logging
- **Multer:** Manejo de archivos
- **Basic Auth:** Autenticación simple y segura

### **Estructura de directorios:**
```
whatsapp-api/
├── server.js          # Aplicación principal
├── package.json       # Dependencias
├── .env               # Variables de entorno
├── .env.example       # Ejemplo de configuración
├── uploads/           # Archivos temporales (auto-generado)
├── logs/              # Logs diarios (auto-generado)
└── .wwebjs_auth/      # Sesión de WhatsApp (auto-generado)
```

## 🔒 Códigos de Error

| Código | Descripción |
|--------|-------------|
| `AUTH_MISSING` | Header de autorización faltante |
| `AUTH_TYPE_INVALID` | Tipo de autorización incorrecto |
| `AUTH_INVALID` | Credenciales inválidas |
| `CLIENT_NOT_READY` | Cliente WhatsApp no conectado |
| `MISSING_PARAMS` | Parámetros requeridos faltantes |
| `QR_NOT_AVAILABLE` | Código QR no disponible |
| `CHAT_NOT_FOUND` | Chat no encontrado |
| `SEND_TEXT_ERROR` | Error enviando texto |
| `SEND_IMAGE_ERROR` | Error enviando imagen |
| `SEND_DOCUMENT_ERROR` | Error enviando documento |
| `GET_CHATS_ERROR` | Error obteniendo chats |
| `ROUTE_NOT_FOUND` | Ruta no encontrada |
| `INTERNAL_ERROR` | Error interno del servidor |

## 🚀 Uso en Producción

### **Recomendaciones:**

1. **Usar PM2 para gestión de procesos:**
```bash
npm install -g pm2
pm2 start server.js --name whatsapp-api
pm2 startup
pm2 save
```

2. **Configurar reverse proxy con Nginx:**
```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. **Variables de entorno para producción:**
```env
NODE_ENV=production
PORT=3000
API_USERNAME=admin_produccion
API_PASSWORD=password_muy_seguro_123456
```

4. **Rotación de logs:**
El sistema crea automáticamente logs diarios. Para rotación automática, usar `logrotate`.

## 🧪 Testing

### **Probar conectividad:**
```bash
curl http://localhost:3000/health
```

### **Probar autenticación:**
```bash
curl -u admin:password http://localhost:3000/chats
```

### **Enviar mensaje de prueba:**
```bash
curl -X POST \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{"number":"5493511234567","message":"Hola desde la API"}' \
  http://localhost:3000/send/text
```

## ⚠️ Consideraciones Importantes

1. **WhatsApp Terms:** Usar responsablemente para evitar bloqueos
2. **Rate Limiting:** WhatsApp tiene límites de mensajes por minuto
3. **Sesión:** La sesión se guarda en `.wwebjs_auth/` - no eliminar
4. **Archivos:** Los uploads se eliminan automáticamente después del envío
5. **Seguridad:** Cambiar credenciales por defecto en producción

## 🐛 Troubleshooting

### **Cliente no se conecta:**
1. Verificar que el código QR sea escaneado
2. Revisar logs en `./logs/`
3. Eliminar `.wwebjs_auth/` y reiniciar

### **Error de autenticación:**
1. Verificar credenciales en `.env`
2. Usar encoding correcto para Basic Auth

### **Archivos no se envían:**
1. Verificar permisos de directorio `uploads/`
2. Comprobar tamaño del archivo
3. Revisar logs para detalles del error

## 📞 Formato de Números

Los números deben incluir código de país sin '+' ni espacios:
- ✅ `5493511234567` (Argentina)
- ✅ `1234567890` (US)
- ❌ `+54 9 351 1234567`
- ❌ `0351 1234567`

## 🆘 Soporte

Para problemas o preguntas:
1. Revisar logs en `./logs/`
2. Verificar `/health` endpoint
3. Comprobar documentación de `whatsapp-web.js`
    "