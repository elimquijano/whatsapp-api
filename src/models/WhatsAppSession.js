import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import User from "./User.js";

const WhatsAppSession = sequelize.define("WhatsAppSession", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: "id" },
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  webhookUrl: {
    type: DataTypes.STRING(2048),
    allowNull: true,
  },
}, {
  indexes: [{ unique: true, fields: ["userId", "sessionId"] }],
});

User.hasMany(WhatsAppSession, { foreignKey: "userId", as: "whatsappSessions", onDelete: "CASCADE" });
WhatsAppSession.belongsTo(User, { foreignKey: "userId", as: "user" });

export default WhatsAppSession;
