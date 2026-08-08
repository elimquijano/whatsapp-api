import CrmCampaign from "../models/CrmCampaign.js";
import CrmCampaignRecipient from "../models/CrmCampaignRecipient.js";
import CrmContact from "../models/CrmContact.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import AiMessage from "../models/AiMessage.js";
import sessionManager from "../manager/SessionManager.js";
import { prepareMediaPayload, sendOutboundMessage } from "./messageService.js";
import { loadCampaignMedia } from "./campaignMediaStorage.js";
import { isInternalLidJid, phoneJidFromNumber } from "../utils/whatsappIdentity.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const personalize = (text, contact, phone) => String(text || "").replace(/\{\{\s*(name|phone)\s*\}\}/g, (_, field) => field === "name" ? (contact?.name || "cliente") : phone);
const campaignErrorMessage = (error) => String(
  error?.message || "No se pudo completar la ejecución de la campaña",
).slice(0, 2000);

class CampaignService {
  constructor() { this.running = new Set(); }

  start(campaignId) {
    if (this.running.has(String(campaignId))) return;
    setImmediate(() => this.run(campaignId).catch((error) => console.error(`[Campaign ${campaignId}]`, error.message)));
  }

  async run(campaignId) {
    const key = String(campaignId);
    if (this.running.has(key)) return;
    this.running.add(key);
    let campaign = null;
    try {
      campaign = await CrmCampaign.findByPk(campaignId, {
        include: [
          { model: WhatsAppSession, as: "whatsappSession" },
          { model: CrmCampaignRecipient, as: "recipients", include: [{ model: CrmContact, as: "contact" }] },
        ],
      });
      if (!campaign || !["draft", "scheduled", "paused", "running"].includes(campaign.status)) return;

      // Persist that the worker took ownership before any network or storage
      // preflight. From here on, failures are visible and retryable in the UI.
      campaign.status = "running";
      campaign.lastError = null;
      campaign.completedAt = null;
      campaign.startedAt ||= new Date();
      await campaign.save();

      const session = sessionManager.getSession(campaign.whatsappSession.userId, campaign.whatsappSession.sessionId);
      if (!session || session.status !== "open") throw new Error("La sesión de WhatsApp no está conectada");

      // Resolve the source once per execution. Every recipient reuses this Buffer,
      // avoiding both repeated disk reads and repeated base64 decoding.
      const preparedMedia = campaign.messageType === "text"
        ? null
        : campaign.mediaStorageKey
          ? await loadCampaignMedia(campaign.mediaStorageKey, campaign.mediaMimeType)
          : await prepareMediaPayload(campaign.mediaPayload || campaign.mediaUrl, campaign.mediaMimeType);
      for (const recipient of campaign.recipients.filter((item) => item.status === "queued")) {
        if ((await CrmCampaign.findByPk(campaign.id, { attributes: ["status"] }))?.status === "paused") break;
        const content = personalize(campaign.message, recipient.contact, recipient.phone);
        try {
          if (isInternalLidJid(recipient.contact?.contactJid)) {
            throw new Error("El contacto solo tiene un identificador LID; WhatsApp aún no entregó su número real");
          }
          const jid = phoneJidFromNumber(recipient.phone);
          if (!jid) throw new Error("El contacto no tiene un número de WhatsApp válido");
          const result = await sendOutboundMessage({
            sock: session.sock,
            recipient: jid,
            type: campaign.messageType,
            body: content,
            payload: campaign.mediaPayload || campaign.mediaUrl,
            filename: campaign.mediaFilename,
            mimetype: campaign.mediaMimeType,
            preparedMedia,
          });
          await recipient.update({ status: "sent", sentAt: new Date(), whatsappMessageId: result.key.id, error: null });
          campaign.sentCount += 1;
          if (recipient.contact) {
            await AiMessage.findOrCreate({
              where: { whatsappSessionId: campaign.whatsappSessionId, whatsappMessageId: result.key.id },
              defaults: { crmContactId: recipient.contact.id, contactJid: jid, contactNumber: recipient.phone, messageTimestamp: new Date(), direction: "outgoing", role: "assistant", messageType: campaign.messageType, content, rawPayload: campaign.messageType === "text" ? null : JSON.stringify(result), metadata: JSON.stringify({ campaignId: campaign.id }) },
            });
            await recipient.contact.update({ lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 500) });
          }
        } catch (error) {
          await recipient.update({ status: "failed", error: error.message });
          campaign.failedCount += 1;
        }
        await campaign.save();
        await wait(Math.min(60000, Math.max(1000, campaign.delayMs || 1500)));
      }
      await campaign.reload();
      if (campaign.status !== "paused") {
        await campaign.update({ status: "completed", completedAt: new Date(), lastError: null });
      }
    } catch (error) {
      if (campaign?.id) {
        try {
          const current = await CrmCampaign.findByPk(campaign.id, { attributes: ["id", "status"] });
          if (current && !["paused", "completed"].includes(current.status)) {
            await current.update({
              status: "failed",
              lastError: campaignErrorMessage(error),
              completedAt: new Date(),
            });
          }
        } catch (persistenceError) {
          console.error(`[Campaign ${campaignId}] No se pudo guardar el fallo:`, persistenceError.message);
        }
      }
      throw error;
    } finally { this.running.delete(key); }
  }

  async runDueCampaigns() {
    const due = await CrmCampaign.findAll({ where: { status: "scheduled" } });
    for (const campaign of due) if (!campaign.scheduledAt || campaign.scheduledAt <= new Date()) this.start(campaign.id);
  }
}

export default new CampaignService();
