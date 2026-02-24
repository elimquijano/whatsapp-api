import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";

const Role = sequelize.define("Role", {
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
  permissions: {
    type: DataTypes.TEXT, // Cambiamos a TEXT para manejarlo nosotros como JSON de forma segura
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('permissions');
      try {
        return rawValue ? JSON.parse(rawValue) : [];
      } catch (e) { return []; }
    },
    set(value) {
      this.setDataValue('permissions', JSON.stringify(value));
    }
  }
});

export default Role;
