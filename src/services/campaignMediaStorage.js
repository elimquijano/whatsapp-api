import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_MEDIA_BYTES, prepareMediaPayload } from "./messageService.js";

const STORAGE_KEY_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), "uploads", "campaign-media");
const DEFAULT_MAX_STORAGE_MB = 1024;
const storageError = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });
const isStorageExhausted = (error) => ["ENOSPC", "EDQUOT"].includes(error?.code);

// Process-local serialization makes the usage check plus write atomic relative
// to other uploads/deletions handled by this Node process.
let storageMutationQueue = Promise.resolve();
const withStorageMutationLock = async (operation) => {
  const previous = storageMutationQueue;
  let release;
  storageMutationQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
};

export const getCampaignMediaDirectory = () => path.resolve(
  process.env.CAMPAIGN_MEDIA_DIR || DEFAULT_STORAGE_DIR,
);

export const getCampaignMediaMaxStorageBytes = () => {
  const configured = process.env.CAMPAIGN_MEDIA_MAX_STORAGE_MB;
  const megabytes = configured === undefined || String(configured).trim() === ""
    ? DEFAULT_MAX_STORAGE_MB
    : Number(configured);
  if (!Number.isFinite(megabytes) || megabytes <= 0) {
    throw storageError("La cuota global de multimedia no tiene una configuracion valida");
  }
  return Math.floor(megabytes * 1024 * 1024);
};

const resolveStoragePath = (storageKey) => {
  const key = String(storageKey || "");
  if (!STORAGE_KEY_PATTERN.test(key)) {
    throw storageError("La referencia del archivo multimedia no es valida", 400);
  }

  const directory = getCampaignMediaDirectory();
  const resolved = path.resolve(directory, key);
  if (path.dirname(resolved) !== directory) {
    throw storageError("La referencia del archivo multimedia no es valida", 400);
  }
  return resolved;
};

const ensureStorageDirectory = async () => {
  try {
    await mkdir(getCampaignMediaDirectory(), { recursive: true, mode: 0o700 });
  } catch (error) {
    if (isStorageExhausted(error)) throw storageError("No hay espacio disponible para multimedia", 507);
    throw storageError("No se pudo preparar el almacenamiento multimedia");
  }
};

const calculateStorageUsage = async () => {
  const directory = getCampaignMediaDirectory();
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw storageError("No se pudo comprobar la cuota de almacenamiento multimedia");
  }

  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const details = await lstat(path.resolve(directory, entry.name));
      if (details.isFile() && !details.isSymbolicLink()) total += details.size;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw storageError("No se pudo comprobar la cuota de almacenamiento multimedia");
      }
    }
  }
  return total;
};

const writeOpaqueFile = async (buffer) => {
  await ensureStorageDirectory();
  const maximumBytes = getCampaignMediaMaxStorageBytes();
  if (buffer.length > maximumBytes) {
    throw storageError("El archivo supera la cuota global permitida para multimedia", 413);
  }
  const usedBytes = await calculateStorageUsage();
  if (usedBytes > maximumBytes - buffer.length) {
    throw storageError("No hay espacio disponible en la cuota global de multimedia", 507);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const storageKey = randomBytes(32).toString("hex");
    const target = resolveStoragePath(storageKey);
    try {
      await writeFile(target, buffer, { flag: "wx", mode: 0o600 });
      return storageKey;
    } catch (error) {
      if (error.code !== "EEXIST") {
        try { await unlink(target); } catch { /* Nothing to clean or cleanup is best effort. */ }
      }
      if (isStorageExhausted(error)) throw storageError("No hay espacio disponible para multimedia", 507);
      if (error.code !== "EEXIST") throw storageError("No se pudo guardar el archivo multimedia");
    }
  }
  throw storageError("No se pudo reservar un nombre seguro para el archivo multimedia");
};

// Both URL and base64 inputs are materialized once. This prevents a campaign
// from downloading the same remote file again for every recipient or retry.
export const storeCampaignMedia = async (payload, declaredMimeType = "") => {
  const preparedMedia = await prepareMediaPayload(payload, declaredMimeType);
  const storageKey = await withStorageMutationLock(() => writeOpaqueFile(preparedMedia.source));
  return { storageKey, preparedMedia };
};

export const loadCampaignMedia = async (storageKey, mimeType = "") => {
  const filePath = resolveStoragePath(storageKey);
  let details;
  try {
    details = await lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") throw storageError("El archivo multimedia de la campana no existe");
    throw storageError("No se pudo acceder al archivo multimedia de la campana");
  }
  if (!details.isFile() || details.isSymbolicLink()) {
    throw storageError("La referencia multimedia no apunta a un archivo valido");
  }
  if (details.size <= 0 || details.size > MAX_MEDIA_BYTES) {
    throw storageError("El archivo multimedia almacenado tiene un tamano no permitido");
  }

  let source;
  try {
    source = await readFile(filePath);
  } catch {
    throw storageError("No se pudo leer el archivo multimedia de la campana");
  }
  if (!source.length || source.length > MAX_MEDIA_BYTES) {
    throw storageError("El archivo multimedia almacenado tiene un tamano no permitido");
  }
  return {
    source,
    mimeType: mimeType || null,
    size: source.length,
    isBase64: false,
    isStored: true,
  };
};

export const deleteCampaignMedia = async (storageKey) => {
  if (!storageKey) return;
  const filePath = resolveStoragePath(storageKey);
  await withStorageMutationLock(async () => {
    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw storageError("No se pudo eliminar el archivo multimedia");
    }
  });
};
