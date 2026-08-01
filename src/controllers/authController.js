import User from "../models/User.js";
import Role from "../models/Role.js";
import Plan from "../models/Plan.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Op } from "sequelize";

import sessionManager from "../manager/SessionManager.js";

// Almacén temporal de OTPs (En producción usar Redis o una tabla)
const otpStore = new Map();

export const sendOTP = async (req, res) => {
  try {
    const { whatsappNumber } = req.body;
    if (!whatsappNumber) return res.status(400).json({ success: false, error: "Número requerido" });

    // Verificar si el número ya existe
    const existingUser = await User.findOne({ where: { whatsappNumber } });
    if (existingUser) return res.status(400).json({ success: false, error: "Este número ya tiene una cuenta activa." });

    // Generar código
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(whatsappNumber, { otp, expires: Date.now() + 600000 }); // 10 min

    // Enviar vía sesión Admin
    const adminUser = await User.findOne({ where: { roleId: 1 } }); // El primer admin
    const adminSession = sessionManager.getUserSessions(adminUser.id).find(s => s.status === 'open');

    if (!adminSession) {
      console.error("Sesión de administrador no conectada para enviar OTP");
      return res.status(503).json({ success: false, error: "Servicio de verificación temporalmente fuera de línea. Contacte soporte." });
    }

    await adminSession.sock.sendMessage(`${whatsappNumber}@s.whatsapp.net`, { 
      text: `*WA-API PRO*\n\nTu código de verificación es: *${otp}*\n\nEste código expira en 10 minutos.` 
    });

    res.json({ success: true, message: "Código enviado a tu WhatsApp" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ success: false, error: "Datos incompletos" });

    const user = await User.findOne({
      where: {
        [Op.or]: [{ username: identifier }, { whatsappNumber: identifier }]
      },
      include: [
        { model: Role, as: 'roleData' },
        { model: Plan, as: 'planData' }
      ],
    });
// ... resto igual


    if (!user) {
      console.log(`Login fallido: Usuario '${identifier}' no encontrado.`);
      return res.status(401).json({ success: false, error: "Usuario no encontrado" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log(`Login fallido: Contraseña incorrecta para '${identifier}'.`);
      return res.status(401).json({ success: false, error: "Contraseña incorrecta" });
    }

    // Generar apiKey si no existe (Migración automática)
    if (!user.apiKey) {
      user.apiKey = `sk_${crypto.randomBytes(24).toString("hex")}`;
      await user.save();
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
      apiKey: user.apiKey,
      user: {
        id: user.id,
        username: user.username,
        role: roleName,
        permissions: permissions,
        plan: planName,
        apiKey: user.apiKey,
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
    const { username, password, whatsappNumber, code } = req.body;
    
    // Validar OTP
    const stored = otpStore.get(whatsappNumber);
    if (!stored || stored.otp !== code || Date.now() > stored.expires) {
      return res.status(400).json({ success: false, error: "Código de verificación inválido o expirado." });
    }

    const trialPlan = await Plan.findOne({ where: { name: "Free Trial" } });
    const userRole = await Role.findOne({ where: { name: "user" } });

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 3);

    const user = await User.create({
      username,
      password,
      whatsappNumber,
      roleId: userRole?.id || 2,
      planId: trialPlan?.id,
      expirationDate,
      whatsappSessionId: crypto.randomBytes(8).toString("hex"),
      apiKey: `sk_${crypto.randomBytes(24).toString("hex")}`,
    });

    otpStore.delete(whatsappNumber); // Limpiar

    res.json({ success: true, message: "¡Verificación exitosa! Tu cuenta está lista." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
