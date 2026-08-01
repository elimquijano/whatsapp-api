import { isLidUser, isPnUser, jidNormalizedUser } from "@whiskeysockets/baileys";

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

export const isInternalLidJid = (value) => isLidUser(jidNormalizedUser(String(value || "")));

export const normalizePhoneNumber = (value, { defaultCountryCode = "51" } = {}) => {
  const raw = String(value || "").trim();
  if (!raw || isInternalLidJid(raw)) return null;

  const jid = raw.includes("@") ? jidNormalizedUser(raw) : "";
  if (jid && !isPnUser(jid)) return null;

  let phone = digitsOnly(jid ? jid.split("@", 1)[0].split(":", 1)[0] : raw);
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.length === 9 && defaultCountryCode) phone = `${defaultCountryCode}${phone}`;
  return phone.length >= 8 && phone.length <= 15 ? phone : null;
};

export const phoneNumberFromJid = (value) => {
  const jid = jidNormalizedUser(String(value || ""));
  return isPnUser(jid) ? normalizePhoneNumber(jid) : null;
};

export const phoneJidFromNumber = (value) => {
  const phone = normalizePhoneNumber(value);
  return phone ? `${phone}@s.whatsapp.net` : null;
};

const uniqueJids = (values) => [...new Set(values
  .map((value) => jidNormalizedUser(String(value || "")))
  .filter(Boolean))];

export const resolveWhatsAppIdentity = async ({ sock, msg }) => {
  const key = msg?.key || {};
  const directCandidates = uniqueJids([
    key.participantAlt,
    key.remoteJidAlt,
    key.participant,
    key.remoteJid,
  ]);
  const directPhoneJid = directCandidates.find((jid) => isPnUser(jid));
  const lidJid = directCandidates.find((jid) => isLidUser(jid)) || null;

  let phoneJid = directPhoneJid || null;
  if (!phoneJid && lidJid) {
    try {
      const mapped = await sock?.signalRepository?.lidMapping?.getPNForLID?.(lidJid);
      const normalized = jidNormalizedUser(String(mapped || ""));
      if (isPnUser(normalized)) phoneJid = normalized;
    } catch {
      // La ausencia temporal del mapa nunca convierte el LID en un teléfono.
    }
  }

  const phone = phoneNumberFromJid(phoneJid);
  return {
    phone,
    phoneJid: phone ? `${phone}@s.whatsapp.net` : null,
    lidJid,
    legacyLidNumber: lidJid ? digitsOnly(lidJid.split("@", 1)[0]) : null,
    resolved: Boolean(phone),
  };
};

