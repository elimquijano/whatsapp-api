import test from "node:test";
import assert from "node:assert/strict";
import { callNotificationDetails } from "./aiCrmService.js";

test("convierte una llamada sin respuesta en notificación perdida", () => {
  assert.deepEqual(callNotificationDetails({ status: "timeout", isVideo: false }), {
    type: "call",
    content: "[Llamada perdida]",
    direction: "incoming",
    role: "user",
  });
});

test("distingue llamadas recibidas, videollamadas y llamadas realizadas", () => {
  assert.equal(callNotificationDetails({ status: "accept" }).content, "[Llamada recibida]");
  assert.equal(callNotificationDetails({ status: "reject", isVideo: true }).content, "[Videollamada perdida]");
  assert.equal(callNotificationDetails({ status: "offer" }, { fromMe: true }).content, "[Llamada realizada]");
});

test("ignora estados intermedios para no duplicar la conversación", () => {
  assert.equal(callNotificationDetails({ status: "ringing" }), null);
  assert.equal(callNotificationDetails({ status: "offer" }), null);
  assert.equal(callNotificationDetails({ status: "terminate" }), null);
});
