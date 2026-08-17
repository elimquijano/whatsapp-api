import test from "node:test";
import assert from "node:assert/strict";
import { parseHttpResponseBuffer } from "./httpResponseParser.js";

test("procesa miles de registros fuera del hilo principal sin recortarlos", async () => {
  const records = Array.from({ length: 2000 }, (_, id) => ({ id, profile: { name: `Cliente ${id}` }, unused: "x".repeat(100) }));
  const result = await parseHttpResponseBuffer(Buffer.from(JSON.stringify({ data: records })), {
    responsePath: "data",
    responseMapping: { id: "id", name: "profile.name" },
  });

  assert.equal(result.body.length, 2000);
  assert.deepEqual(result.body.at(-1), { id: 1999, name: "Cliente 1999" });
});

test("conserva respuestas que no son JSON", async () => {
  const result = await parseHttpResponseBuffer(Buffer.from("respuesta simple"));
  assert.equal(result.body, "respuesta simple");
});
