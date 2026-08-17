import test from "node:test";
import assert from "node:assert/strict";
import { runWorkflowSandbox } from "./workflowSandbox.js";

test("ejecuta scripts con colecciones grandes fuera del hilo principal", async () => {
  const records = Array.from({ length: 1200 }, (_, id) => ({ id, active: id % 2 === 0 }));
  const result = await runWorkflowSandbox({
    sandbox: { input: { records }, output: null },
    code: "output = input.records.filter((item) => item.active).map((item) => item.id);",
    resultKey: "output",
  }, { timeoutMs: 3000 });
  assert.equal(result.length, 600);
  assert.equal(result.at(-1), 1198);
});

test("termina y reporta scripts que no responden", async () => {
  await assert.rejects(
    runWorkflowSandbox({ sandbox: { output: null }, code: "while (true) {}", resultKey: "output" }, { timeoutMs: 100 }),
    (error) => error.code === "WORKFLOW_SCRIPT_TIMEOUT",
  );
});
