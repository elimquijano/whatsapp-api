import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";
import { decryptSecret, encryptSecret } from "../utils/secret.js";

const CampaignAiConfig = sequelize.define("CampaignAiConfig", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  whatsappSessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: WhatsAppSession, key: "id" },
  },
  mode: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "inherit" },
  aiProvider: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "openai_compatible" },
  aiApiUrl: { type: DataTypes.STRING(2048), allowNull: true },
  aiModel: { type: DataTypes.STRING(255), allowNull: true },
  aiApiToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() { return decryptSecret(this.getDataValue("aiApiToken")); },
    set(value) { this.setDataValue("aiApiToken", value ? encryptSecret(value) : null); },
  },
  brandVoice: { type: DataTypes.TEXT, allowNull: true },
  campaignInstructions: { type: DataTypes.TEXT("long"), allowNull: true },
}, {
  indexes: [{ unique: true, fields: ["whatsappSessionId"] }],
});

WhatsAppSession.hasOne(CampaignAiConfig, { foreignKey: "whatsappSessionId", as: "campaignAiConfig", onDelete: "CASCADE" });
CampaignAiConfig.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });

export default CampaignAiConfig;

