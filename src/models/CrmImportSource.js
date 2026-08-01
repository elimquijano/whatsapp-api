import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";
import { decryptSecret, encryptSecret } from "../utils/secret.js";

const jsonField = (field, fallback = {}) => ({
  type: DataTypes.TEXT("long"), allowNull: true,
  get() { try { return JSON.parse(this.getDataValue(field) || JSON.stringify(fallback)); } catch { return fallback; } },
  set(value) { this.setDataValue(field, JSON.stringify(value ?? fallback)); },
});

const CrmImportSource = sequelize.define("CrmImportSource", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  whatsappSessionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: WhatsAppSession, key: "id" } },
  name: { type: DataTypes.STRING, allowNull: false, defaultValue: "Sistema de ventas" },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  method: { type: DataTypes.STRING, allowNull: false, defaultValue: "GET" },
  url: { type: DataTypes.STRING(2048), allowNull: false },
  authType: { type: DataTypes.STRING, allowNull: false, defaultValue: "none" },
  authHeader: { type: DataTypes.STRING, allowNull: true },
  authValue: {
    type: DataTypes.TEXT, allowNull: true,
    get() { return decryptSecret(this.getDataValue("authValue")); },
    set(value) { this.setDataValue("authValue", value ? encryptSecret(value) : null); },
  },
  headers: jsonField("headers"),
  requestBody: jsonField("requestBody"),
  responsePath: { type: DataTypes.STRING, allowNull: true },
  fieldMapping: jsonField("fieldMapping", { phone: "phone", name: "name", externalId: "id" }),
  lastImportedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ fields: ["whatsappSessionId"] }] });

WhatsAppSession.hasMany(CrmImportSource, { foreignKey: "whatsappSessionId", as: "crmImportSources", onDelete: "CASCADE" });
CrmImportSource.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });

export default CrmImportSource;
