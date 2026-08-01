import { Op } from "sequelize";
import sequelize from "../database/db.js";
import CrmContact from "../models/CrmContact.js";
import AiMessage from "../models/AiMessage.js";
import AiWorkflowExecution from "../models/AiWorkflowExecution.js";
import CrmCampaignRecipient from "../models/CrmCampaignRecipient.js";
import CrmCampaign from "../models/CrmCampaign.js";
import { resolveWhatsAppIdentity } from "../utils/whatsappIdentity.js";

const newestContact = (left, right) => {
  const leftTime = new Date(left?.lastMessageAt || 0).getTime();
  const rightTime = new Date(right?.lastMessageAt || 0).getTime();
  return rightTime > leftTime ? right : left;
};

const mergeAutomationMode = (left, right) => {
  if ([left, right].includes("human")) return "human";
  if ([left, right].includes("automatic")) return "automatic";
  return "inherit";
};

const mergeContactValues = (target, legacy, identity, pushName) => {
  const newest = newestContact(target, legacy);
  return {
    phone: identity.phone,
    contactJid: identity.phoneJid,
    name: target.name || legacy?.name || pushName || null,
    status: target.status !== "new" ? target.status : (legacy?.status || target.status),
    priority: Math.max(Number(target.priority || 0), Number(legacy?.priority || 0)),
    automationMode: mergeAutomationMode(target.automationMode, legacy?.automationMode),
    notes: target.notes || legacy?.notes || null,
    tags: [...new Set([...(legacy?.tags || []), ...(target.tags || [])])],
    metadata: { ...(legacy?.metadata || {}), ...(target.metadata || {}) },
    source: target.source || legacy?.source || "whatsapp",
    externalId: target.externalId || legacy?.externalId || null,
    lastMessageAt: newest?.lastMessageAt || null,
    lastMessagePreview: newest?.lastMessagePreview || null,
    unreadCount: Number(target.unreadCount || 0) + Number(legacy?.unreadCount || 0),
  };
};

const reconcileCampaignRecipients = async ({ whatsappSessionId, legacyContactId, targetContactId, legacyPhone, phone, transaction }) => {
  const recipients = await CrmCampaignRecipient.findAll({
    where: {
      [Op.or]: [
        ...(legacyContactId ? [{ crmContactId: legacyContactId }] : []),
        ...(legacyPhone ? [{ phone: legacyPhone }] : []),
      ],
    },
    include: [{
      model: CrmCampaign,
      as: "campaign",
      attributes: [],
      where: { whatsappSessionId },
      required: true,
    }],
    transaction,
  });
  for (const recipient of recipients) {
    const duplicate = await CrmCampaignRecipient.findOne({
      where: { crmCampaignId: recipient.crmCampaignId, phone, id: { [Op.ne]: recipient.id } },
      transaction,
    });
    if (duplicate) {
      if (!duplicate.crmContactId) await duplicate.update({ crmContactId: targetContactId }, { transaction });
      await recipient.destroy({ transaction });
    } else {
      await recipient.update({ crmContactId: targetContactId, phone }, { transaction });
    }
  }
};

export const findOrCreateResolvedContact = async ({ sessionRecord, identity, pushName, messageDate }) => {
  if (!identity?.resolved || !identity.phone || !identity.phoneJid) return null;

  return sequelize.transaction(async (transaction) => {
    const contactWhere = { whatsappSessionId: sessionRecord.id };
    let target = await CrmContact.findOne({
      where: { ...contactWhere, phone: identity.phone },
      transaction,
    });
    const legacy = identity.legacyLidNumber && identity.legacyLidNumber !== identity.phone
      ? await CrmContact.findOne({
        where: {
          ...contactWhere,
          [Op.or]: [
            { phone: identity.legacyLidNumber },
            ...(identity.lidJid ? [{ contactJid: identity.lidJid }] : []),
          ],
        },
        transaction,
      })
      : null;

    if (!target && legacy) {
      target = legacy;
      await target.update({ phone: identity.phone, contactJid: identity.phoneJid }, { transaction });
    } else if (!target) {
      target = await CrmContact.create({
        whatsappSessionId: sessionRecord.id,
        phone: identity.phone,
        contactJid: identity.phoneJid,
        name: pushName || null,
        source: "whatsapp",
        status: "new",
        lastMessageAt: messageDate || new Date(),
      }, { transaction });
    }

    const separateLegacy = legacy && String(legacy.id) !== String(target.id) ? legacy : null;
    await target.update(mergeContactValues(target, separateLegacy, identity, pushName), { transaction });

    const legacyMessageConditions = [
      ...(identity.legacyLidNumber ? [{ contactNumber: identity.legacyLidNumber }] : []),
      ...(identity.lidJid ? [{ contactJid: identity.lidJid }] : []),
      ...(separateLegacy ? [{ crmContactId: separateLegacy.id }] : []),
    ];
    if (legacyMessageConditions.length) {
      await AiMessage.update({
        crmContactId: target.id,
        contactNumber: identity.phone,
        contactJid: identity.phoneJid,
      }, {
        where: { whatsappSessionId: sessionRecord.id, [Op.or]: legacyMessageConditions },
        transaction,
      });
    }
    if (identity.legacyLidNumber) {
      await AiWorkflowExecution.update({ contactNumber: identity.phone }, {
        where: { whatsappSessionId: sessionRecord.id, contactNumber: identity.legacyLidNumber },
        transaction,
      });
      await reconcileCampaignRecipients({
        whatsappSessionId: sessionRecord.id,
        legacyContactId: separateLegacy?.id,
        targetContactId: target.id,
        legacyPhone: identity.legacyLidNumber,
        phone: identity.phone,
        transaction,
      });
    }
    if (separateLegacy) await separateLegacy.destroy({ transaction });
    return target;
  });
};

export const repairStoredLidContacts = async ({ sock, sessionRecord }) => {
  if (!sock || !sessionRecord) return { repaired: 0, unresolved: 0 };
  const legacyContacts = await CrmContact.findAll({
    where: { whatsappSessionId: sessionRecord.id, contactJid: { [Op.like]: "%@lid" } },
  });
  let repaired = 0;
  let unresolved = 0;

  for (const contact of legacyContacts) {
    const recentMessages = await AiMessage.findAll({
      where: { whatsappSessionId: sessionRecord.id, crmContactId: contact.id },
      order: [["messageTimestamp", "DESC"]],
      limit: 10,
      attributes: ["rawPayload"],
    });
    const messagePayloads = recentMessages.map((message) => {
      try { return JSON.parse(message.rawPayload || "null"); } catch { return null; }
    }).filter(Boolean);
    messagePayloads.push({ key: { remoteJid: contact.contactJid } });

    let identity = null;
    for (const msg of messagePayloads) {
      identity = await resolveWhatsAppIdentity({ sock, msg });
      if (identity.resolved) break;
    }
    if (!identity?.resolved) {
      unresolved += 1;
      continue;
    }
    await findOrCreateResolvedContact({
      sessionRecord,
      identity,
      pushName: contact.name,
      messageDate: contact.lastMessageAt,
    });
    repaired += 1;
  }
  return { repaired, unresolved };
};
