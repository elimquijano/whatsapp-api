import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import AiPermission from "./AiPermission.js";
import { decryptSecret, encryptSecret } from "../utils/secret.js";

const jsonField = (field, fallback = {}) => ({
  type: DataTypes.TEXT("long"),
  allowNull: true,
  get() {
    const raw = this.getDataValue(field);
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  set(value) { this.setDataValue(field, JSON.stringify(value ?? fallback)); },
});

const AiWorkflowNode = sequelize.define("AiWorkflowNode", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  aiPermissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AiPermission, key: "id" },
  },
  key: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  positionX: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  positionY: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  config: jsonField("config"),
  credentials: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
    get() {
      try { return JSON.parse(decryptSecret(this.getDataValue("credentials")) || "{}"); } catch { return {}; }
    },
    set(value) { this.setDataValue("credentials", encryptSecret(JSON.stringify(value || {}))); },
  },
});

AiPermission.hasMany(AiWorkflowNode, { foreignKey: "aiPermissionId", as: "nodes", onDelete: "CASCADE" });
AiWorkflowNode.belongsTo(AiPermission, { foreignKey: "aiPermissionId", as: "permission" });

export default AiWorkflowNode;
