import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiWorkflowExecution from "./AiWorkflowExecution.js";
import AiWorkflowNode from "./AiWorkflowNode.js";
import AiMainWorkflowNode from "./AiMainWorkflowNode.js";

const jsonField = (field, fallback = {}) => ({
  type: DataTypes.TEXT("long"),
  allowNull: true,
  get() {
    const raw = this.getDataValue(field);
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  set(value) { this.setDataValue(field, JSON.stringify(value ?? fallback)); },
});

const AiWorkflowNodeExecution = sequelize.define("AiWorkflowNodeExecution", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  workflowExecutionId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: AiWorkflowExecution, key: "id" },
  },
  aiWorkflowNodeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: AiWorkflowNode, key: "id" },
  },
  aiMainWorkflowNodeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: AiMainWorkflowNode, key: "id" },
  },
  nodeKey: { type: DataTypes.STRING, allowNull: false },
  nodeName: { type: DataTypes.STRING, allowNull: false },
  nodeType: { type: DataTypes.STRING, allowNull: false },
  scope: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "task" },
  sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "waiting" },
  input: jsonField("input"),
  output: jsonField("output"),
  error: { type: DataTypes.TEXT("long"), allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true },
  durationMs: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ["workflowExecutionId", "sequence"] },
    { fields: ["workflowExecutionId", "scope", "sequence"] },
    { fields: ["workflowExecutionId", "status"] },
  ],
});

AiWorkflowExecution.hasMany(AiWorkflowNodeExecution, { foreignKey: "workflowExecutionId", as: "nodeExecutions", onDelete: "CASCADE" });
AiWorkflowNodeExecution.belongsTo(AiWorkflowExecution, { foreignKey: "workflowExecutionId", as: "execution" });
AiWorkflowNode.hasMany(AiWorkflowNodeExecution, { foreignKey: "aiWorkflowNodeId", as: "executions", onDelete: "SET NULL" });
AiWorkflowNodeExecution.belongsTo(AiWorkflowNode, { foreignKey: "aiWorkflowNodeId", as: "node" });
AiMainWorkflowNode.hasMany(AiWorkflowNodeExecution, { foreignKey: "aiMainWorkflowNodeId", as: "executions", onDelete: "SET NULL" });
AiWorkflowNodeExecution.belongsTo(AiMainWorkflowNode, { foreignKey: "aiMainWorkflowNodeId", as: "mainNode" });

export default AiWorkflowNodeExecution;
