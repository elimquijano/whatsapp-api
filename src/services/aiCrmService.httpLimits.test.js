import test from "node:test";
import assert from "node:assert/strict";
import { mapHttpResponseBody, resolveHttpNodeLimits } from "./aiCrmService.js";

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

test("el mapeo de respuesta conserva solo los campos elegidos de cada elemento de un array", () => {
  const response = [
    { id: 1, details: { name: "Producto A", cost: 12 }, internal: "secreto" },
    { id: 2, details: { name: "Producto B", cost: 18 }, internal: "secreto" },
  ];

  assert.deepEqual(mapHttpResponseBody(response, {
    codigo: "id",
    nombre: "details.name",
    precio: "details.cost",
  }), [
    { codigo: 1, nombre: "Producto A", precio: 12 },
    { codigo: 2, nombre: "Producto B", precio: 18 },
  ]);
});

test("sin mapeo se conserva la respuesta HTTP completa", () => {
  const response = [{ id: 1, name: "Producto A" }];
  assert.deepEqual(mapHttpResponseBody(response, {}), response);
});

test("las respuestas masivas se limitan antes de mapear para proteger memoria y trazas", () => {
  const response = Array.from({ length: 10000 }, (_, id) => ({ id, payload: "innecesario" }));
  const mapped = mapHttpResponseBody(response, { id: "id" }, 200);
  assert.equal(mapped.length, 200);
  assert.deepEqual(mapped.at(-1), { id: 199 });
});
