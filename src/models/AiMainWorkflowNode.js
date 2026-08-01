import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiMainWorkflow from "./AiMainWorkflow.js";
import AiPermission from "./AiPermission.js";

const AiMainWorkflowNode = sequelize.define("AiMainWorkflowNode", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  aiMainWorkflowId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiMainWorkflow, key: "id" },
  },
  aiPermissionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: AiPermission, key: "id" },
  },
  key: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.STRING(64), allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  positionX: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  positionY: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  config: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
    get() {
      try { return JSON.parse(this.getDataValue("config") || "{}"); } catch { return {}; }
    },
    set(value) { this.setDataValue("config", JSON.stringify(value || {})); },
  },
}, {
  indexes: [
    { unique: true, fields: ["aiMainWorkflowId", "key"] },
    { fields: ["aiMainWorkflowId", "type"] },
    { fields: ["aiPermissionId"] },
  ],
});

AiMainWorkflow.hasMany(AiMainWorkflowNode, { foreignKey: "aiMainWorkflowId", as: "nodes", onDelete: "CASCADE" });
AiMainWorkflowNode.belongsTo(AiMainWorkflow, { foreignKey: "aiMainWorkflowId", as: "workflow" });
AiPermission.hasMany(AiMainWorkflowNode, { foreignKey: "aiPermissionId", as: "mainWorkflowNodes", onDelete: "SET NULL" });
AiMainWorkflowNode.belongsTo(AiPermission, { foreignKey: "aiPermissionId", as: "agent" });

export default AiMainWorkflowNode;
