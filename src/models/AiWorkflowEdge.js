import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiPermission from "./AiPermission.js";
import AiWorkflowNode from "./AiWorkflowNode.js";

const AiWorkflowEdge = sequelize.define("AiWorkflowEdge", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  aiPermissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiPermission, key: "id" },
  },
  sourceNodeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiWorkflowNode, key: "id" },
  },
  targetNodeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiWorkflowNode, key: "id" },
  },
  sourceHandle: { type: DataTypes.STRING, allowNull: true },
  targetHandle: { type: DataTypes.STRING, allowNull: true },
  label: { type: DataTypes.STRING, allowNull: true },
});

AiPermission.hasMany(AiWorkflowEdge, { foreignKey: "aiPermissionId", as: "edges", onDelete: "CASCADE" });
AiWorkflowEdge.belongsTo(AiPermission, { foreignKey: "aiPermissionId", as: "permission" });
AiWorkflowNode.hasMany(AiWorkflowEdge, { foreignKey: "sourceNodeId", as: "outgoingEdges", onDelete: "CASCADE" });
AiWorkflowNode.hasMany(AiWorkflowEdge, { foreignKey: "targetNodeId", as: "incomingEdges", onDelete: "CASCADE" });
AiWorkflowEdge.belongsTo(AiWorkflowNode, { foreignKey: "sourceNodeId", as: "sourceNode" });
AiWorkflowEdge.belongsTo(AiWorkflowNode, { foreignKey: "targetNodeId", as: "targetNode" });

export default AiWorkflowEdge;
