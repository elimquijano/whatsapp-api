import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiMainWorkflow from "./AiMainWorkflow.js";
import AiMainWorkflowNode from "./AiMainWorkflowNode.js";

const AiMainWorkflowEdge = sequelize.define("AiMainWorkflowEdge", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  aiMainWorkflowId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiMainWorkflow, key: "id" },
  },
  sourceNodeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiMainWorkflowNode, key: "id" },
  },
  targetNodeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiMainWorkflowNode, key: "id" },
  },
  sourceHandle: { type: DataTypes.STRING, allowNull: true },
  targetHandle: { type: DataTypes.STRING, allowNull: true },
  label: { type: DataTypes.STRING, allowNull: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  indexes: [
    { name: "main_edges_workflow_order", fields: ["aiMainWorkflowId", "sortOrder"] },
    { name: "main_edges_unique_route", unique: true, fields: ["aiMainWorkflowId", "sourceNodeId", "targetNodeId", "sourceHandle", "targetHandle"] },
  ],
});

AiMainWorkflow.hasMany(AiMainWorkflowEdge, { foreignKey: "aiMainWorkflowId", as: "edges", onDelete: "CASCADE" });
AiMainWorkflowEdge.belongsTo(AiMainWorkflow, { foreignKey: "aiMainWorkflowId", as: "workflow" });
AiMainWorkflowNode.hasMany(AiMainWorkflowEdge, { foreignKey: "sourceNodeId", as: "mainOutgoingEdges", onDelete: "CASCADE" });
AiMainWorkflowNode.hasMany(AiMainWorkflowEdge, { foreignKey: "targetNodeId", as: "mainIncomingEdges", onDelete: "CASCADE" });
AiMainWorkflowEdge.belongsTo(AiMainWorkflowNode, { foreignKey: "sourceNodeId", as: "sourceNode" });
AiMainWorkflowEdge.belongsTo(AiMainWorkflowNode, { foreignKey: "targetNodeId", as: "targetNode" });

export default AiMainWorkflowEdge;
