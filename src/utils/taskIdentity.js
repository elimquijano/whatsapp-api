const persistedId = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  try { return BigInt(text).toString(); } catch { return null; }
};

export const normalizeTaskKey = (value, fallback = "task") => (
  String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_")
);

// A task key is referenced by active chat state and by idempotency/effect keys.
// Treat the database ID as its stable identity: renaming in place could make an
// already executed sale look like a new task and run its side effects again.
export const assertPersistedTaskKeysUnchanged = (submittedPermissions, persistedPermissions = []) => {
  if (!Array.isArray(submittedPermissions)) return;
  const persistedById = new Map((Array.isArray(persistedPermissions) ? persistedPermissions : [])
    .map((permission) => [persistedId(permission?.id), permission])
    .filter(([id]) => id));
  const submittedIds = new Set();

  for (let index = 0; index < submittedPermissions.length; index += 1) {
    const item = submittedPermissions[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (item.id === undefined || item.id === null || item.id === "") continue;

    const id = persistedId(item.id);
    if (!id) throw new Error(`La tarea ${index + 1} contiene un ID persistido inválido`);
    if (submittedIds.has(id)) throw new Error(`El ID de tarea ${id} está repetido en la configuración`);
    submittedIds.add(id);

    const persisted = persistedById.get(id);
    if (!persisted) {
      throw new Error(`La tarea con ID ${id} no pertenece a esta configuración de IA`);
    }
    const previousKey = String(persisted.key || "");
    const requestedKey = normalizeTaskKey(item.key, `task_${index + 1}`);
    if (requestedKey !== previousKey) {
      throw new Error(
        `No se puede cambiar la clave técnica de la tarea persistida "${previousKey}" a "${requestedKey}". `
        + "La clave protege conversaciones activas y evita repetir efectos; crea una tarea nueva si necesitas otra clave.",
      );
    }
  }
};
