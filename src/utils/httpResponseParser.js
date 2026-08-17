import { Worker } from "node:worker_threads";

const DEFAULT_PARSE_TIMEOUT_MS = 30000;

// JSON.parse of a large integration response is synchronous. Keeping it on the
// API event loop can make health checks and workflow polling time out, causing a
// process manager to restart an otherwise healthy server. A disposable worker
// also contains parser OOM failures so they become node errors instead of taking
// down the WhatsApp process.
export const parseHttpResponseBuffer = (buffer, options = {}) => new Promise((resolve, reject) => {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  // safeFetchBuffer produces a full-span Buffer in normal operation. Transfer
  // that allocation instead of copying the complete response a second time.
  // A sliced buffer still needs an exact copy so unrelated pooled bytes are not
  // exposed to the worker.
  const transferable = source.byteOffset === 0 && source.byteLength === source.buffer.byteLength
    ? source.buffer
    : source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const worker = new Worker(new URL("./httpResponseParserWorker.js", import.meta.url), {
    workerData: {
      buffer: transferable,
      responsePath: options.responsePath || "",
      responseMapping: options.responseMapping || {},
      stateMapping: options.stateMapping || {},
    },
    transferList: [transferable],
    resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
  });
  const timeoutMs = Math.min(120000, Math.max(1000, Number(options.timeoutMs) || DEFAULT_PARSE_TIMEOUT_MS));
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    callback(value);
  };
  const timer = setTimeout(() => {
    const error = new Error(`La respuesta HTTP tardó más de ${timeoutMs} ms en procesarse`);
    error.code = "HTTP_RESPONSE_PARSE_TIMEOUT";
    finish(reject, error);
    void worker.terminate();
  }, timeoutMs);

  worker.once("message", (message) => {
    if (message?.ok) finish(resolve, message.value);
    else {
      const error = new Error(message?.error || "No se pudo procesar la respuesta HTTP");
      error.code = message?.code || "HTTP_RESPONSE_PARSE_ERROR";
      finish(reject, error);
    }
    void worker.terminate();
  });
  worker.once("error", (cause) => {
    const error = new Error(`El procesador aislado de la respuesta HTTP falló: ${cause.message}`);
    error.code = "HTTP_RESPONSE_WORKER_ERROR";
    error.cause = cause;
    finish(reject, error);
  });
  worker.once("exit", (code) => {
    if (!settled) {
      const error = new Error(`El procesador aislado de la respuesta HTTP terminó sin devolver datos (código ${code})`);
      error.code = "HTTP_RESPONSE_WORKER_EXIT";
      finish(reject, error);
    }
  });
});
