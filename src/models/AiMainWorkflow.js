import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiSessionConfig from "./AiSessionConfig.js";

const AiMainWorkflow = sequelize.define("AiMainWorkflow", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  aiSessionConfigId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: AiSessionConfig, key: "id" },
  },
  name: { type: DataTypes.STRING, allowNull: false, defaultValue: "Workflow principal" },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  viewport: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
    get() {
      try { return JSON.parse(this.getDataValue("viewport") || "{}"); } catch { return {}; }
    },
    set(value) { this.setDataValue("viewport", JSON.stringify(value || {})); },
  },
}, {
  indexes: [{ unique: true, fields: ["aiSessionConfigId"] }],
});

AiSessionConfig.hasOne(AiMainWorkflow, { foreignKey: "aiSessionConfigId", as: "mainWorkflow", onDelete: "CASCADE" });
AiMainWorkflow.belongsTo(AiSessionConfig, { foreignKey: "aiSessionConfigId", as: "aiConfig" });

export default AiMainWorkflow;
