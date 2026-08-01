import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const localCaPath = path.join(projectRoot, "certs", "local-ca.pem");
const isDevelopment = process.argv.includes("--dev");
const childEnv = { ...process.env };

// NODE_EXTRA_CA_CERTS debe existir antes de iniciar el proceso que abre TLS.
// Este archivo es opcional y local; nunca se desactiva la validación SSL.
if (!childEnv.NODE_EXTRA_CA_CERTS && fs.existsSync(localCaPath)) {
  childEnv.NODE_EXTRA_CA_CERTS = localCaPath;
  console.log(`🔐 CA local adicional habilitada: ${path.relative(projectRoot, localCaPath)}`);
}

const args = isDevelopment
  ? [path.join(projectRoot, "node_modules", "nodemon", "bin", "nodemon.js"), "server.js"]
  : ["server.js"];

const child = spawn(process.execPath, args, {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
});

let stopping = false;
const stopChild = (signal) => {
  if (stopping) return;
  stopping = true;
  try { child.kill(signal); } catch { /* el proceso ya terminó */ }
};

process.once("SIGINT", () => stopChild("SIGINT"));
process.once("SIGTERM", () => stopChild("SIGTERM"));
child.once("error", (error) => {
  console.error("No se pudo iniciar el backend:", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal && !stopping) console.error(`Backend finalizado por señal ${signal}`);
  process.exitCode = Number.isInteger(code) ? code : 0;
});
