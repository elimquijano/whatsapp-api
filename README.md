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

## API Endpoints (Protegidos con JWT)
- `POST /api/auth/login`: Iniciar sesión.
- `POST /api/auth/register`: Registrar nuevo usuario (incluye generación automática de `sessionId`).
- `POST /api/whatsapp/connect`: Inicializa el proceso de conexión para el usuario.
- `GET /api/whatsapp/status`: Obtiene el estado y el código QR.
- `POST /api/whatsapp/send-text`: Envía un mensaje desde la sesión del usuario.
- `POST /api/whatsapp/logout`: Desconecta WhatsApp del usuario.
- `GET /api/ai/sessions/:sessionId/config`: Obtiene agente, modelo, permisos y grafo de nodos de una sesión Profesional.
- `PUT /api/ai/sessions/:sessionId/config`: Guarda la configuración completa y sus credenciales cifradas.
- `PUT /api/ai/sessions/:sessionId/toggle`: Cambia entre atención manual y respuesta automática.
- `POST /api/ai/sessions/:sessionId/presets/sales`: Aplica una plantilla inicial de ventas generales.
- `GET /api/ai/sessions/:sessionId/messages`: Consulta las conversaciones persistidas en BD.
- `GET /api/crm/sessions/:sessionId/contacts`: Lista y prioriza los contactos de una sesión.
- `PUT /api/crm/contacts/:contactId`: Cambia clasificación, prioridad, notas, etiquetas o atención humana/IA.
- `POST /api/crm/contacts/:contactId/messages`: Envía una respuesta manual y toma únicamente ese chat.
- `POST /api/crm/sessions/:sessionId/import-sources`: Guarda una integración HTTP para importar clientes.
- `POST /api/crm/import-sources/:sourceId/run`: Ejecuta la importación y actualiza clientes.
- `GET|POST /api/crm/campaigns`: Consulta o crea campañas segmentadas.
- `POST /api/crm/campaigns/:campaignId/run`: Inicia una campaña de difusión.
