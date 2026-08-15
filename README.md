# WhatsApp Multi-Session API & Dashboard

Este proyecto es una plataforma completa para gestionar múltiples sesiones de WhatsApp mediante la librería `@whiskeysockets/baileys`, con un backend en Node.js (Express + MySQL) y un dashboard profesional en React + Material UI.

## Características
- **Multi-Sesión:** Cada usuario puede conectar su propio WhatsApp.
- **Autenticación:** Sistema de usuarios con roles y privilegios (Admin/User) y tokens JWT.
- **Base de Datos:** Persistencia de usuarios, sesiones, webhooks, conversaciones y workflows IA CRM en MySQL mediante Sequelize.
- **IA CRM (Profesional):** Respuesta manual/automática por chat, memoria de 20 mensajes, bandeja estilo WhatsApp Web, clasificación comercial, campañas, importación HTTP y constructor visual de workflows.
- **Dashboard:** Interfaz moderna para ver el estado de conexión, escanear el QR y enviar mensajes.
- **Logs:** Sistema de logging profesional con `pino`.

## Requisitos
- Node.js v20+
- MySQL Server
- Un teléfono con WhatsApp para escanear el QR.

## Instalación

1. **Clonar el repositorio e instalar dependencias del backend:**
   ```bash
   npm install
   ```

2. **Instalar dependencias del frontend:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

3. **Configurar variables de entorno:**
   Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=tu_password
   DB_NAME=whatsapp_sessions_db
   JWT_SECRET=una_clave_secreta_muy_segura
   AI_CREDENTIALS_SECRET=otra_clave_larga_para_cifrar_tokens
   ```

4. **Crear la base de datos en MySQL:**
   ```sql
   CREATE DATABASE whatsapp_sessions_db;
   ```

## Ejecución

1. **Iniciar el Backend:**
   ```bash
   npm start
   ```
   *Nota: La primera vez que inicies, se crearán las tablas y un usuario administrador por defecto:*
   - **Usuario:** admin
   - **Password:** admin_password_123

2. **Iniciar el Frontend:**
   En otra terminal:
   ```bash
   cd frontend
   npm run dev
   ```
   Accede a `http://localhost:3001` e inicia sesión.

## Estructura del Proyecto
- `src/`: Lógica del backend (Modelos, Controladores, Rutas, Manager de sesiones).
- `frontend/`: Aplicación React + Material UI.
- `sessions/`: Carpeta (ignorada por git) donde se guardan los archivos de autenticación de cada usuario.

## API Endpoints (protegidos con JWT o API key)

La credencial autentica la cuenta y `:sessionId` delimita siempre la sesión de WhatsApp. Ningún endpoint de envío selecciona automáticamente la primera sesión conectada.
- `POST /api/auth/login`: Iniciar sesión.
- `POST /api/auth/register`: Registrar nuevo usuario (incluye generación automática de `sessionId`).
- `GET /api/v1/sessions`: Lista las sesiones de la cuenta.
- `POST /api/v1/sessions/:sessionId/connect|logout`: Vincula nuevamente o desvincula una sesión.
- `POST /api/v1/sessions/:sessionId/messages/text|media`: Envía desde la sesión indicada.
  En `media`, `type` puede ser `image`, `video`, `audio` o `document`; el archivo se entrega como URL/data URI en `payload` o como Base64 puro en `base64` junto con `mimetype` (máximo 10 MB).
- `GET|PUT /api/v1/sessions/:sessionId/ai/config`: Consulta o guarda los agentes y workflows de una sesión Profesional.
- Los workflows actualmente se ejecutan y persisten por sesión. Desde el editor IA CRM se pueden **exportar e importar** como JSON para reutilizarlos entre cualquier sesión de la misma cuenta; el archivo nunca incluye tokens ni credenciales de nodos, que deben configurarse de nuevo en la sesión de destino.
- `PUT /api/v1/sessions/:sessionId/ai/toggle`: Cambia la automatización de esa sesión.
- `GET /api/v1/sessions/:sessionId/crm/contacts`: Lista los contactos de esa sesión.
- `PUT|POST /api/v1/sessions/:sessionId/crm/contacts/:contactId/...`: Administra un contacto dentro de su sesión.
- `GET|POST /api/v1/sessions/:sessionId/crm/import-sources`: Administra importaciones de esa sesión.
- `POST /api/v1/sessions/:sessionId/crm/import-sources/:sourceId/run`: Importa clientes en esa sesión.
- `GET|POST /api/v1/sessions/:sessionId/crm/campaigns`: Consulta o crea campañas de esa sesión.
- `POST /api/v1/sessions/:sessionId/crm/campaigns/:campaignId/run|pause`: Controla una campaña de esa sesión.
- `GET|PUT /api/v1/sessions/:sessionId/crm/campaign-ai/settings`: Configura el asistente de campañas de esa sesión, heredando la IA de flujos o usando proveedor/modelo/token propios.
- `POST /api/v1/sessions/:sessionId/crm/campaign-ai/generate`: Genera estrategia, audiencia sugerida, copy editable, brief visual, prompt de imagen y checklist usando el contexto empresarial de la sesión.
