import test from "node:test";
import assert from "node:assert/strict";
import { buildCallWebhook, buildMessageWebhook, detectWebhookMessageType, shouldDeliverWebhook } from "./webhookService.js";

test("el ajuste por chat sobrescribe el ajuste general del webhook", () => {
  assert.equal(shouldDeliverWebhook(true, "disabled"), false);
  assert.equal(shouldDeliverWebhook(false, "enabled"), true);
  assert.equal(shouldDeliverWebhook(false, "inherit"), false);
  assert.equal(shouldDeliverWebhook(true), true);
});

test("clasifica el contenido multimedia del mensaje", () => {
  assert.equal(detectWebhookMessageType({ conversation: "hola" }), "text");
  assert.equal(detectWebhookMessageType({ imageMessage: {} }), "image");
  assert.equal(detectWebhookMessageType({ audioMessage: { ptt: true } }), "voice");
  assert.equal(detectWebhookMessageType({ videoMessage: {} }), "video");
  assert.equal(detectWebhookMessageType({ documentMessage: {} }), "document");
});

test("diferencia mensajes recibidos y enviados por el propio usuario", () => {
  const identity = { phone: "521551234567", phoneJid: "521551234567@s.whatsapp.net" };
  const incoming = buildMessageWebhook({ sessionId: "ventas", identity, upsertType: "notify", msg: { key: { id: "in", fromMe: false }, message: { conversation: "hola" }, messageTimestamp: 1 } });
  const outgoing = buildMessageWebhook({ sessionId: "ventas", identity, upsertType: "append", msg: { key: { id: "out", fromMe: true }, message: { conversation: "hola" }, messageTimestamp: 1 } });
  assert.equal(incoming.event, "message.received");
  assert.equal(outgoing.event, "message.sent");
  assert.equal(outgoing.data.to, identity.phoneJid);
});

test("publica la dirección y todos los estados de llamada", () => {
  const identity = { phone: "521551234567", phoneJid: "521551234567@s.whatsapp.net" };
  const incoming = buildCallWebhook({ sessionId: "ventas", identity, fromMe: false, call: { id: "call-1", status: "offer", isVideo: true } });
  const outgoing = buildCallWebhook({ sessionId: "ventas", identity, fromMe: true, call: { id: "call-2", status: "accept" } });
  assert.equal(incoming.event, "call.incoming");
  assert.equal(incoming.data.status, "offer");
  assert.equal(incoming.data.isVideo, true);
  assert.equal(outgoing.event, "call.outgoing");
});
