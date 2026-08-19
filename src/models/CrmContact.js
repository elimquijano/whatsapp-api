import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";

const jsonField = (field, fallback) => ({
  type: DataTypes.TEXT("long"), allowNull: true,
  get() { try { return JSON.parse(this.getDataValue(field) || JSON.stringify(fallback)); } catch { return fallback; } },
  set(value) { this.setDataValue(field, JSON.stringify(value ?? fallback)); },
});

const CrmContact = sequelize.define("CrmContact", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  whatsappSessionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: WhatsAppSession, key: "id" } },
  contactJid: { type: DataTypes.STRING, allowNull: true },
  phone: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "new" },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  automationMode: { type: DataTypes.STRING, allowNull: false, defaultValue: "inherit" },
  webhookMode: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "inherit" },
  notes: { type: DataTypes.TEXT("long"), allowNull: true },
  tags: jsonField("tags", []),
  metadata: jsonField("metadata", {}),
  source: { type: DataTypes.STRING, allowNull: false, defaultValue: "whatsapp" },
  externalId: { type: DataTypes.STRING, allowNull: true },
  lastMessageAt: { type: DataTypes.DATE, allowNull: true },
  lastMessagePreview: { type: DataTypes.STRING(500), allowNull: true },
  unreadCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  indexes: [
    { unique: true, fields: ["whatsappSessionId", "phone"] },
    { fields: ["whatsappSessionId", "status", "priority"] },
    { fields: ["whatsappSessionId", "lastMessageAt"] },
  ],
});

WhatsAppSession.hasMany(CrmContact, { foreignKey: "whatsappSessionId", as: "crmContacts", onDelete: "CASCADE" });
CrmContact.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });

export default CrmContact;
