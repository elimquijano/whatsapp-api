import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";
import { decryptSecret, encryptSecret } from "../utils/secret.js";

const AiSessionConfig = sequelize.define("AiSessionConfig", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  whatsappSessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: WhatsAppSession, key: "id" },
  },
  autoReplyEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  outputMode: { type: DataTypes.STRING, allowNull: false, defaultValue: "direct_whatsapp" },
  agentName: { type: DataTypes.STRING, allowNull: false, defaultValue: "Asistente de ventas" },
  role: { type: DataTypes.TEXT, allowNull: true },
  context: { type: DataTypes.TEXT("long"), allowNull: true },
  systemPrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  intentionPrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  orchestrationPrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  responseGuardPrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  ignoreUnrelatedMessages: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  responseValidationEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  responseValidationFailureMode: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "block" },
  globalWorkflow: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
    get() {
      const raw = this.getDataValue("globalWorkflow");
      try { return raw ? JSON.parse(raw) : null; }
      catch { return { __invalidGlobalWorkflow: true, reason: "invalid_json" }; }
    },
    set(value) { this.setDataValue("globalWorkflow", value ? JSON.stringify(value) : null); },
  },
  aiProvider: { type: DataTypes.STRING, allowNull: false, defaultValue: "openai_compatible" },
  aiApiUrl: { type: DataTypes.STRING(2048), allowNull: true },
  aiModel: { type: DataTypes.STRING, allowNull: true },
  aiApiToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() { return decryptSecret(this.getDataValue("aiApiToken")); },
    set(value) { if (value) this.setDataValue("aiApiToken", encryptSecret(value)); else this.setDataValue("aiApiToken", null); },
  },
  temperature: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.2 },
  maxHistory: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
});

WhatsAppSession.hasOne(AiSessionConfig, { foreignKey: "whatsappSessionId", as: "aiConfig", onDelete: "CASCADE" });
AiSessionConfig.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });

export default AiSessionConfig;
