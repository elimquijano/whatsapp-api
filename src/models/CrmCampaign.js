import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";

const jsonField = (field, fallback = {}) => ({
  type: DataTypes.TEXT("long"), allowNull: true,
  get() { try { return JSON.parse(this.getDataValue(field) || JSON.stringify(fallback)); } catch { return fallback; } },
  set(value) { this.setDataValue(field, JSON.stringify(value ?? fallback)); },
});

const CrmCampaign = sequelize.define("CrmCampaign", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  whatsappSessionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: WhatsAppSession, key: "id" } },
  name: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "draft" },
  messageType: { type: DataTypes.STRING, allowNull: false, defaultValue: "text" },
  message: { type: DataTypes.TEXT("long"), allowNull: false },
  mediaUrl: { type: DataTypes.STRING(2048), allowNull: true },
  mediaPayload: { type: DataTypes.TEXT("long"), allowNull: true },
  mediaStorageKey: { type: DataTypes.STRING(128), allowNull: true },
  mediaMimeType: { type: DataTypes.STRING(255), allowNull: true },
  mediaFilename: { type: DataTypes.STRING(255), allowNull: true },
  filters: jsonField("filters"),
  scheduledAt: { type: DataTypes.DATE, allowNull: true },
  delayMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1500 },
  totalRecipients: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastError: { type: DataTypes.TEXT, allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ fields: ["whatsappSessionId", "status"] }] });

WhatsAppSession.hasMany(CrmCampaign, { foreignKey: "whatsappSessionId", as: "crmCampaigns", onDelete: "CASCADE" });
CrmCampaign.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });

export default CrmCampaign;
