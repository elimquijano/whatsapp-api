import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiSessionConfig from "./AiSessionConfig.js";

const AiPermission = sequelize.define("AiPermission", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  aiSessionConfigId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiSessionConfig, key: "id" },
  },
  key: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  description: { type: DataTypes.TEXT, allowNull: true },
  routingPrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  executionPrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  responsePrompt: { type: DataTypes.TEXT("long"), allowNull: true },
  continuationEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stateSchema: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
    get() {
      try { return JSON.parse(this.getDataValue("stateSchema") || "{}"); } catch { return {}; }
    },
    set(value) { this.setDataValue("stateSchema", JSON.stringify(value || {})); },
  },
}, {
  indexes: [{ unique: true, fields: ["aiSessionConfigId", "key"] }],
});

AiSessionConfig.hasMany(AiPermission, { foreignKey: "aiSessionConfigId", as: "permissions", onDelete: "CASCADE" });
AiPermission.belongsTo(AiSessionConfig, { foreignKey: "aiSessionConfigId", as: "aiConfig" });

export default AiPermission;
