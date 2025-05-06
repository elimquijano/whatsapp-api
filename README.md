# WhatsApp API con Node.js

API para enviar mensajes a través de WhatsApp usando `whatsapp-web.js` y `Express`.

## Requisitos

- Node.js
- npm
- Número de WhatsApp para autenticación

## Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu_usuario/whatsapp-api.git
   cd whatsapp-api

2. Instala dependencias:
```bash
npm install

3. Crea un archivo .env:

```plaintext
API_TOKEN=tu_token_secreto
PORT=3000

# Uso

1. Inicia el servidor:

```bash
node index.js

2. Escanea el código QR en la consola.

3. Endpoints

GET /status: Verifica si el cliente de WhatsApp está listo.
POST /send-message: Envía un mensaje.
Headers: Authorization: Bearer tu_token_secreto
Body:
```json
{
  "number": "CODIGOPAISNUMERO",
  "message": "Tu mensaje"
}

# Notas

Asegúrate de que el número esté registrado en WhatsApp.

# Licencia

Licencia MIT.