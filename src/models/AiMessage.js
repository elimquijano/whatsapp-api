import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";
import CrmContact from "./CrmContact.js";

const AiMessage = sequelize.define("AiMessage", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  whatsappSessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: WhatsAppSession, key: "id" },
  },
  crmContactId: { type: DataTypes.BIGINT, allowNull: true, references: { model: CrmContact, key: "id" } },
  contactJid: { type: DataTypes.STRING, allowNull: false },
  contactNumber: { type: DataTypes.STRING, allowNull: false },
  whatsappMessageId: { type: DataTypes.STRING, allowNull: true },
  messageTimestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  direction: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  messageType: { type: DataTypes.STRING, allowNull: false, defaultValue: "text" },
  content: { type: DataTypes.TEXT("long"), allowNull: false },
  rawPayload: { type: DataTypes.TEXT("long"), allowNull: true },
  metadata: { type: DataTypes.TEXT("long"), allowNull: true },
}, {
  indexes: [
    { unique: true, fields: ["whatsappSessionId", "whatsappMessageId"] },
    { fields: ["whatsappSessionId", "contactNumber", "createdAt"] },
  ],
});

WhatsAppSession.hasMany(AiMessage, { foreignKey: "whatsappSessionId", as: "aiMessages", onDelete: "CASCADE" });
AiMessage.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });
CrmContact.hasMany(AiMessage, { foreignKey: "crmContactId", as: "messages", onDelete: "SET NULL" });
AiMessage.belongsTo(CrmContact, { foreignKey: "crmContactId", as: "contact" });

export default AiMessage;
