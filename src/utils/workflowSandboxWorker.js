import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";

try {
  const sandbox = workerData.sandbox || {};
  vm.runInNewContext(workerData.code, sandbox, {
    // The parent worker owns the wall-clock timeout and can terminate this
    // entire isolate, including cloning and serialization of large results.
    contextCodeGeneration: { strings: false, wasm: false },
  });
  parentPort.postMessage({ ok: true, value: sandbox[workerData.resultKey] });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: String(error?.message || error || "Error desconocido"),
    code: error?.code || "WORKFLOW_SCRIPT_ERROR",
  });
}

