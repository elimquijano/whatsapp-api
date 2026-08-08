import test from "node:test";
import assert from "node:assert/strict";
import { canQuoteMessage } from "./crmController.js";

test("solo permite responder mensajes reales compatibles con WhatsApp", () => {
  const payload = { key: { id: "abc" }, message: { conversation: "hola" } };
  assert.equal(canQuoteMessage({ messageType: "text" }, payload), true);
  assert.equal(canQuoteMessage({ messageType: "call" }, payload), false);
  assert.equal(canQuoteMessage({ messageType: "text" }, { key: { id: "abc" } }), false);
  assert.equal(canQuoteMessage({ messageType: "text" }, null), false);
});
