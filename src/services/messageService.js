import { parseSafeHttpUrl, safeFetchBuffer } from "../utils/safeHttp.js";
import { phoneJidFromNumber, phoneNumberFromJid } from "../utils/whatsappIdentity.js";

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MEDIA_DOWNLOAD_TIMEOUT_MS = 20000;

const SUPPORTED_MEDIA_TYPES = new Set(["image", "video", "audio", "document"]);
const DATA_URI_PATTERN = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/;
const validationError = (message) => Object.assign(new Error(message), { statusCode: 400 });
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

const normalizeMimeType = (value) => {
  const mimeType = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (!mimeType) return "";
  if (!MIME_PATTERN.test(mimeType)) throw validationError("El tipo MIME multimedia no es válido");
  if (mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "audio/mp3") return "audio/mpeg";
  return mimeType;
};

export const resolveMediaInput = ({ payload, base64, mimetype } = {}) => {
  const regularPayload = String(payload || "").trim();
  if (regularPayload) return regularPayload;

  const rawBase64 = String(base64 || "").trim();
  if (!rawBase64) return "";
  if (rawBase64.startsWith("data:")) return rawBase64;

  const mimeType = normalizeMimeType(mimetype);
  if (!mimeType) {
    throw validationError("Cuando envías Base64 puro debes indicar mimetype, por ejemplo image/png o audio/mpeg");
  }
  return `data:${mimeType};base64,${rawBase64.replace(/\s/g, "")}`;
};

export const normalizeRecipientJid = (recipient) => {
  const value = String(recipient || "").trim();
  if (value.includes("@")) {
    const phone = phoneNumberFromJid(value);
    if (!phone) throw validationError("El destinatario debe ser un número real de WhatsApp; los identificadores LID no son teléfonos");
    return `${phone}@s.whatsapp.net`;
  }
  const jid = phoneJidFromNumber(value);
  if (!jid) throw validationError("El destinatario no es válido");
  return jid;
};

export const inspectMediaPayload = (payload, declaredMimeType = "") => {
  const value = String(payload || "").trim();
  if (!value) throw validationError("El archivo o URL multimedia es obligatorio");

  if (value.startsWith("data:")) {
    const match = value.match(DATA_URI_PATTERN);
    if (!match) throw validationError("El archivo base64 no tiene un formato data URI válido");
    const mimeType = normalizeMimeType(match[1]);
    const normalizedDeclaredMimeType = normalizeMimeType(declaredMimeType);
    if (normalizedDeclaredMimeType && mimeType !== normalizedDeclaredMimeType) {
      throw validationError("El tipo MIME declarado no coincide con el archivo");
    }
    const compactBase64 = match[2].replace(/\s/g, "");
    const buffer = Buffer.from(compactBase64, "base64");
    if (!buffer.length) throw validationError("El archivo base64 está vacío");
    if (buffer.length > MAX_MEDIA_BYTES) {
      throw validationError(`El archivo supera el límite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB`);
    }
    return { source: buffer, mimeType, size: buffer.length, isBase64: true };
  }

  let url;
  try { url = parseSafeHttpUrl(value); }
  catch (error) { throw validationError(error.message.replace("de integración", "multimedia")); }
  return {
    source: null,
    url: url.href,
    mimeType: normalizeMimeType(declaredMimeType) || null,
    size: null,
    isBase64: false,
  };
};

export const prepareMediaPayload = async (payload, declaredMimeType = "") => {
  const inspected = inspectMediaPayload(payload, declaredMimeType);
  if (inspected.isBase64) return inspected;

  const response = await safeFetchBuffer(inspected.url, {
    timeoutMs: MEDIA_DOWNLOAD_TIMEOUT_MS,
    maxBytes: MAX_MEDIA_BYTES,
    maxRedirects: 3,
  });
  if (!response.ok) {
    throw Object.assign(new Error(`La URL multimedia respondió HTTP ${response.status}`), { statusCode: 400 });
  }
  if (!response.buffer.length) throw validationError("La URL multimedia devolvió un archivo vacío");

  const responseMimeType = normalizeMimeType(response.headers["content-type"]);
  if (!responseMimeType) throw validationError("La URL multimedia no informó un tipo MIME válido");
  const declared = normalizeMimeType(declaredMimeType);
  if (declared && responseMimeType !== declared && responseMimeType !== "application/octet-stream") {
    throw validationError("El tipo MIME declarado no coincide con la respuesta multimedia");
  }
  const mimeType = declared || responseMimeType;
  return {
    source: response.buffer,
    mimeType,
    size: response.buffer.length,
    isBase64: false,
    isRemote: true,
  };
};

const assertMediaTypeMatchesMime = (mediaType, media) => {
  if (mediaType === "document" || !media.mimeType) return;
  if (!media.mimeType.startsWith(`${mediaType}/`)) {
    throw validationError(`El archivo ${media.mimeType} no corresponde al tipo ${mediaType}`);
  }
};

export const buildMediaMessage = ({ type, payload, caption = "", filename, mimetype, preparedMedia }) => {
  const mediaType = String(type || "").toLowerCase();
  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) throw validationError("Tipo multimedia no compatible");
  const media = preparedMedia || inspectMediaPayload(payload, mimetype);
  if (!media.source) throw validationError("La URL multimedia debe descargarse y validarse antes de enviarla");
  assertMediaTypeMatchesMime(mediaType, media);
  const safeCaption = String(caption || "");
  if (safeCaption.length > 1024) throw validationError("El texto del archivo no puede superar 1024 caracteres");

  if (mediaType === "image") return { image: media.source, caption: safeCaption, mimetype: media.mimeType || undefined };
  if (mediaType === "video") return { video: media.source, caption: safeCaption, mimetype: media.mimeType || undefined };
  if (mediaType === "audio") return { audio: media.source, ptt: true, mimetype: media.mimeType || undefined };
  return {
    document: media.source,
    caption: safeCaption,
    fileName: String(filename || "archivo").slice(0, 255),
    mimetype: media.mimeType || "application/octet-stream",
  };
};

export const sendTextMessage = async ({ sock, recipient, body }) => {
  const text = String(body || "").trim();
  if (!text) throw validationError("El mensaje es obligatorio");
  if (text.length > 4096) throw validationError("El mensaje no puede superar 4096 caracteres");
  return sock.sendMessage(normalizeRecipientJid(recipient), { text });
};

export const sendMediaMessage = async ({ sock, recipient, type, payload, caption, filename, mimetype, preparedMedia }) => {
  // URL and base64 are normalized once before Baileys receives the bytes.
  // Baileys never performs an uncontrolled second HTTP request.
  const media = preparedMedia || await prepareMediaPayload(payload, mimetype);
  return sock.sendMessage(
    normalizeRecipientJid(recipient),
    buildMediaMessage({ type, payload, caption, filename, mimetype, preparedMedia: media }),
  );
};

export const sendOutboundMessage = async ({ sock, recipient, type = "text", body = "", payload, filename, mimetype, preparedMedia }) => {
  if (type === "text") return sendTextMessage({ sock, recipient, body });
  return sendMediaMessage({ sock, recipient, type, payload, caption: body, filename, mimetype, preparedMedia });
};
