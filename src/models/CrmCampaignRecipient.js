import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import CrmCampaign from "./CrmCampaign.js";
import CrmContact from "./CrmContact.js";

const CrmCampaignRecipient = sequelize.define("CrmCampaignRecipient", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  crmCampaignId: { type: DataTypes.BIGINT, allowNull: false, references: { model: CrmCampaign, key: "id" } },
  crmContactId: { type: DataTypes.BIGINT, allowNull: true, references: { model: CrmContact, key: "id" } },
  phone: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "queued" },
  error: { type: DataTypes.TEXT, allowNull: true },
  whatsappMessageId: { type: DataTypes.STRING, allowNull: true },
  sentAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ unique: true, fields: ["crmCampaignId", "phone"] }] });

CrmCampaign.hasMany(CrmCampaignRecipient, { foreignKey: "crmCampaignId", as: "recipients", onDelete: "CASCADE" });
CrmCampaignRecipient.belongsTo(CrmCampaign, { foreignKey: "crmCampaignId", as: "campaign" });
CrmContact.hasMany(CrmCampaignRecipient, { foreignKey: "crmContactId", as: "campaignRecipients", onDelete: "SET NULL" });
CrmCampaignRecipient.belongsTo(CrmContact, { foreignKey: "crmContactId", as: "contact" });

export default CrmCampaignRecipient;
