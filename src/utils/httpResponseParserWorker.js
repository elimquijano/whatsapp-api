import { parentPort, workerData } from "node:worker_threads";

const unsafeParts = new Set(["__proto__", "prototype", "constructor"]);
const getPath = (source, path) => {
  if (!path) return source;
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  if (parts.some((part) => unsafeParts.has(part))) return undefined;
  return parts.reduce((value, part) => value?.[part], source);
};

try {
  const text = Buffer.from(workerData.buffer).toString("utf8");
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  const selected = workerData.responsePath ? getPath(parsed, workerData.responsePath) : parsed;
  const mapping = workerData.responseMapping && typeof workerData.responseMapping === "object"
    ? workerData.responseMapping
    : {};
  const project = (item) => Object.fromEntries(
    Object.entries(mapping).map(([key, path]) => [key, getPath(item, path)]),
  );
  const body = Object.keys(mapping).length
    ? (Array.isArray(selected) ? selected.map(project) : project(selected))
    : selected;
  const stateUpdates = Object.fromEntries(
    Object.entries(workerData.stateMapping || {}).map(([key, path]) => [key, getPath(selected, path)]),
  );
  parentPort.postMessage({ ok: true, value: { body, stateUpdates } });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: String(error?.message || error || "Error desconocido"),
    code: error?.code || "HTTP_RESPONSE_PARSE_ERROR",
  });
}
