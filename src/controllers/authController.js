import User from "../models/User.js";
import Role from "../models/Role.js";
import Plan from "../models/Plan.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Op } from "sequelize";

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ success: false, error: "Datos incompletos" });

    const user = await User.findOne({
      where: {
        [Op.or]: [{ username: identifier }, { email: identifier }]
      },
      include: [
        { model: Role, as: 'roleData' },
        { model: Plan, as: 'planData' }
      ],
    });

    if (!user) {
      console.log(`Login fallido: Usuario '${identifier}' no encontrado.`);
      return res.status(401).json({ success: false, error: "Usuario no encontrado" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log(`Login fallido: Contraseña incorrecta para '${identifier}'.`);
      return res.status(401).json({ success: false, error: "Contraseña incorrecta" });
    }

    const roleName = user.roleData?.name || "user";
    const permissions = user.roleData?.permissions || [];
    const planName = user.planData?.name || "Sin Plan";

    const token = jwt.sign(
      { id: user.id, username: user.username, role: roleName },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: roleName,
        permissions: permissions,
        plan: planName,
        planData: user.planData ? {
          name: user.planData.name,
          maxSessions: user.planData.maxSessions,
          features: user.planData.features
        } : null,
        expirationDate: user.expirationDate,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ success: false, error: error.message || "Error interno del servidor" });
  }
};

export const register = async (req, res) => {
  try {
    const { username, password, email, roleId } = req.body;
    const whatsappSessionId = crypto.randomBytes(8).toString("hex");

    const user = await User.create({
      username,
      password,
      email,
      roleId: roleId || 2, // Por defecto Rol 'user'
      whatsappSessionId,
    });

    res.json({ success: true, message: "Usuario creado", userId: user.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
