import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeForTrace } from "./workflowTraceService.js";

test("los objetos compartidos no se muestran falsamente como circulares", () => {
  const shared = { id: 7, name: "dato compartido" };
  assert.deepEqual(sanitizeForTrace({ input: shared, output: shared }), {
    input: shared,
    output: shared,
  });
});

test("las referencias realmente circulares se siguen bloqueando", () => {
  const cyclic = { id: 7 };
  cyclic.self = cyclic;
  assert.deepEqual(sanitizeForTrace(cyclic), { id: 7, self: "[CIRCULAR]" });
});
