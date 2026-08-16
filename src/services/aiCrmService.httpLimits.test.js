import test from "node:test";
import assert from "node:assert/strict";
import { resolveHttpNodeLimits } from "./aiCrmService.js";

const MIB = 1024 * 1024;

test("los nodos HTTP aceptan respuestas grandes configuradas en MB", () => {
  assert.deepEqual(resolveHttpNodeLimits({ maxResponseMb: 20, timeoutMs: 90000 }), {
    maxResponseBytes: 20 * MIB,
    timeoutMs: 90000,
  });
});

test("los nodos HTTP usan límites amplios y seguros por defecto", () => {
  assert.deepEqual(resolveHttpNodeLimits(), {
    maxResponseBytes: 5 * MIB,
    timeoutMs: 30000,
  });
});

test("los límites de nodos HTTP se acotan en el servidor", () => {
  assert.deepEqual(resolveHttpNodeLimits({ maxResponseMb: 100, timeoutMs: 999999 }), {
    maxResponseBytes: 25 * MIB,
    timeoutMs: 120000,
  });
});

test("se conserva compatibilidad con maxResponseBytes", () => {
  assert.equal(resolveHttpNodeLimits({ maxResponseBytes: 3 * MIB }).maxResponseBytes, 3 * MIB);
});
