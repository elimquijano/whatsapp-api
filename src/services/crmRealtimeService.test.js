import test from "node:test";
import assert from "node:assert/strict";
import { publishCrmUpdate, subscribeToCrmUpdates } from "./crmRealtimeService.js";

test("CRM realtime events stay scoped to their user and session", () => {
  const received = [];
  const unsubscribe = subscribeToCrmUpdates({ userId: 7, sessionId: "primary" }, (event) => received.push(event));

  publishCrmUpdate({ userId: 8, sessionId: "primary", contactId: 1 });
  publishCrmUpdate({ userId: 7, sessionId: "secondary", contactId: 2 });
  publishCrmUpdate({ userId: 7, sessionId: "primary", contactId: 3, reason: "message.sent" });
  unsubscribe();
  publishCrmUpdate({ userId: 7, sessionId: "primary", contactId: 4 });

  assert.equal(received.length, 1);
  assert.equal(received[0].contactId, 3);
  assert.equal(received[0].reason, "message.sent");
  assert.equal(typeof received[0].timestamp, "number");
});
