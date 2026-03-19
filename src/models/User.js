import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";
import bcrypt from "bcryptjs";
import Role from "./Role.js";
import Plan from "./Plan.js";

const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  whatsappNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  whatsappSessionId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  roleId: {
    type: DataTypes.INTEGER,
    references: { model: Role, key: "id" },
  },
  planId: {
    type: DataTypes.INTEGER,
    references: { model: Plan, key: "id" },
    allowNull: true,
  },
  expirationDate: {
    type: DataTypes.DATE,
    allow_null: true,
    },
    apiKey: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    },
    webhookUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed("password")) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
  },
});

User.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// RELACIONES EXPLICITAS
User.belongsTo(Role, { foreignKey: "roleId", as: "roleData" });
Role.hasMany(User, { foreignKey: "roleId" });

User.belongsTo(Plan, { foreignKey: "planId", as: "planData" });
Plan.hasMany(User, { foreignKey: "planId" });

export default User;
