import { Worker } from "node:worker_threads";

const DEFAULT_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 10000;

const boundedTimeout = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(MAX_TIMEOUT_MS, Math.max(100, Math.trunc(numeric)))
    : DEFAULT_TIMEOUT_MS;
};

// User scripts must not run on the HTTP server's event loop. Apart from making
// the VM timeout unable to cover structuredClone(), doing so made moderately
// large API responses freeze polling and left executions apparently "running".
export const runWorkflowSandbox = (payload, options = {}) => new Promise((resolve, reject) => {
  const timeoutMs = boundedTimeout(options.timeoutMs);
  const worker = new Worker(new URL("./workflowSandboxWorker.js", import.meta.url), {
    workerData: payload,
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
  });
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    callback(value);
  };
  const timer = setTimeout(() => {
    const error = new Error(`El script excedió el tiempo máximo de ${timeoutMs} ms`);
    error.code = "WORKFLOW_SCRIPT_TIMEOUT";
    finish(reject, error);
    void worker.terminate();
  }, timeoutMs);

  worker.once("message", (message) => {
    if (message?.ok) finish(resolve, message.value);
    else {
      const error = new Error(message?.error || "El script del workflow falló");
      error.code = message?.code || "WORKFLOW_SCRIPT_ERROR";
      finish(reject, error);
    }
    void worker.terminate();
  });
  worker.once("error", (error) => finish(reject, error));
  worker.once("exit", (code) => {
    if (!settled && code !== 0) {
      const error = new Error(`El proceso aislado del script terminó con código ${code}`);
      error.code = "WORKFLOW_SCRIPT_WORKER_EXIT";
      finish(reject, error);
    }
  });
});

