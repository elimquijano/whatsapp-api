import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";

const Plan = sequelize.define("Plan", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  maxSessions: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  features: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('features');
      try {
        return rawValue ? JSON.parse(rawValue) : [];
      } catch (e) { return []; }
    },
    set(value) {
      this.setDataValue('features', JSON.stringify(value));
    }
  }
});

export default Plan;
