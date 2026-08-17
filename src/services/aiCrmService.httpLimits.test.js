import test from "node:test";
import assert from "node:assert/strict";
import { mapHttpResponseBody, resolveHttpNodeLimits } from "./aiCrmService.js";

test("los nodos HTTP no recortan la descarga que usan los nodos siguientes", () => {
  assert.deepEqual(resolveHttpNodeLimits({ timeoutMs: 90000 }), {
    maxResponseBytes: Number.MAX_SAFE_INTEGER,
    timeoutMs: 90000,
  });
});

test("los nodos HTTP conservan el tiempo máximo por defecto", () => {
  assert.deepEqual(resolveHttpNodeLimits(), {
    maxResponseBytes: Number.MAX_SAFE_INTEGER,
    timeoutMs: 30000,
  });
});

test("el tiempo de nodos HTTP se acota en el servidor", () => {
  assert.deepEqual(resolveHttpNodeLimits({ timeoutMs: 999999 }), {
    maxResponseBytes: Number.MAX_SAFE_INTEGER,
    timeoutMs: 120000,
  });
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

test("las respuestas masivas se conservan completas para los nodos siguientes", () => {
  const response = Array.from({ length: 10000 }, (_, id) => ({ id, payload: "innecesario" }));
  const mapped = mapHttpResponseBody(response, { id: "id" });
  assert.equal(mapped.length, response.length);
  assert.deepEqual(mapped.at(-1), { id: 9999 });
});
