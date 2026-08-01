import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import WhatsAppSession from "./WhatsAppSession.js";
import AiPermission from "./AiPermission.js";
import AiMainWorkflow from "./AiMainWorkflow.js";

const jsonField = (field, fallback = {}) => ({
  type: DataTypes.TEXT("long"),
  allowNull: true,
  get() {
    const raw = this.getDataValue(field);
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  set(value) { this.setDataValue(field, JSON.stringify(value ?? fallback)); },
});

const AiWorkflowExecution = sequelize.define("AiWorkflowExecution", {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  whatsappSessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: WhatsAppSession, key: "id" },
  },
  aiPermissionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: AiPermission, key: "id" },
  },
  aiMainWorkflowId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: AiMainWorkflow, key: "id" },
  },
  permissionKey: { type: DataTypes.STRING, allowNull: false },
  permissionName: { type: DataTypes.STRING, allowNull: false },
  trigger: { type: DataTypes.STRING, allowNull: false, defaultValue: "message" },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "waiting" },
  currentNodeKey: { type: DataTypes.STRING, allowNull: true },
  safeMode: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  contactNumber: { type: DataTypes.STRING, allowNull: true },
  messageId: { type: DataTypes.STRING, allowNull: true },
  input: jsonField("input"),
  output: jsonField("output"),
  error: { type: DataTypes.TEXT("long"), allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true },
  durationMs: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ["whatsappSessionId", "createdAt"] },
    { fields: ["whatsappSessionId", "status"] },
    { fields: ["permissionKey"] },
  ],
});

WhatsAppSession.hasMany(AiWorkflowExecution, { foreignKey: "whatsappSessionId", as: "workflowExecutions", onDelete: "CASCADE" });
AiWorkflowExecution.belongsTo(WhatsAppSession, { foreignKey: "whatsappSessionId", as: "whatsappSession" });
AiPermission.hasMany(AiWorkflowExecution, { foreignKey: "aiPermissionId", as: "executions", onDelete: "SET NULL" });
AiWorkflowExecution.belongsTo(AiPermission, { foreignKey: "aiPermissionId", as: "permission" });
AiMainWorkflow.hasMany(AiWorkflowExecution, { foreignKey: "aiMainWorkflowId", as: "executions", onDelete: "SET NULL" });
AiWorkflowExecution.belongsTo(AiMainWorkflow, { foreignKey: "aiMainWorkflowId", as: "mainWorkflow" });

export default AiWorkflowExecution;
