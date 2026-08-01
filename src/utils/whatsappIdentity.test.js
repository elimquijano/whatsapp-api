import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecipientJid } from "../services/messageService.js";
import { parseModelJson } from "../services/aiCrmService.js";
import {
  normalizePhoneNumber,
  resolveWhatsAppIdentity,
} from "./whatsappIdentity.js";

test("persists the PN number without device suffix and never treats myLID as a phone", () => {
  assert.equal(normalizePhoneNumber("51927702663:4@s.whatsapp.net"), "51927702663");
  assert.equal(normalizePhoneNumber("87583694540971:4@lid"), null);
  assert.equal(normalizePhoneNumber("927702663"), "51927702663");
  assert.equal(normalizeRecipientJid("927702663"), "51927702663@s.whatsapp.net");
  assert.throws(() => normalizeRecipientJid("87583694540971:4@lid"), /LID/);
});

test("prefers the PN alternate supplied by Baileys", async () => {
  const identity = await resolveWhatsAppIdentity({
    sock: {},
    msg: { key: { remoteJid: "87583694540971:4@lid", remoteJidAlt: "51927702663:4@s.whatsapp.net" } },
  });
  assert.deepEqual(identity, {
    phone: "51927702663",
    phoneJid: "51927702663@s.whatsapp.net",
    lidJid: "87583694540971@lid",
    legacyLidNumber: "87583694540971",
    resolved: true,
  });
});

test("uses Baileys LID mapping and fails closed when no PN exists", async () => {
  const mapped = await resolveWhatsAppIdentity({
    sock: { signalRepository: { lidMapping: { getPNForLID: async () => "51927702663:4@s.whatsapp.net" } } },
    msg: { key: { remoteJid: "87583694540971:4@lid" } },
  });
  assert.equal(mapped.phone, "51927702663");

  const unresolved = await resolveWhatsAppIdentity({
    sock: { signalRepository: { lidMapping: { getPNForLID: async () => null } } },
    msg: { key: { remoteJid: "87583694540971:4@lid" } },
  });
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.phone, null);
});

test("AI JSON parser accepts common provider wrappers and labels invalid output", () => {
  assert.deepEqual(parseModelJson("```json\n{\"content\":\"Hola\"}\n```"), { content: "Hola" });
  assert.deepEqual(parseModelJson("razonamiento previo\n{\"content\":\"Hola\",}"), { content: "Hola" });
  assert.deepEqual(parseModelJson(JSON.stringify('{"content":"Hola"}')), { content: "Hola" });
  assert.throws(
    () => parseModelJson("solo texto"),
    (error) => error.code === "AI_MODEL_INVALID_JSON" && /JSON valido/.test(error.message),
  );
});

