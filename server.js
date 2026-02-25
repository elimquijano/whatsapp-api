import express from "express";
import cors from "cors";
import sequelize from "./src/database/db.js";
import User from "./src/models/User.js";
import Role from "./src/models/Role.js";
import Plan from "./src/models/Plan.js";
import sessionManager from "./src/manager/SessionManager.js";
import * as authController from "./src/controllers/authController.js";
import * as userController from "./src/controllers/userController.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, error: "Token no proporcionado" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
    if (err) return res.status(403).json({ success: false, error: "Token inválido o expirado" });
    req.user = decodedUser;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ success: false, error: "Acceso denegado: Se requieren permisos de administrador" });
  }
};

const checkPlanExpiration = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });

    if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
      return res.status(403).json({ success: false, error: "Tu plan ha expirado. Por favor, renueva tu suscripción." });
    }
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

app.post("/api/auth/login", authController.login);
app.post("/api/auth/send-otp", authController.sendOTP);
app.post("/api/auth/register", authController.register);

app.get("/api/users/profile", authenticateToken, userController.getProfile);
app.put("/api/users/webhook", authenticateToken, userController.updateWebhook);
app.get("/api/users", authenticateToken, isAdmin, userController.getAllUsers);
app.post("/api/users", authenticateToken, isAdmin, userController.createUser);
app.put("/api/users/:id", authenticateToken, isAdmin, userController.updateUser);
app.delete("/api/users/:id", authenticateToken, isAdmin, userController.deleteUser);
app.get("/api/roles", authenticateToken, isAdmin, userController.getRoles);
app.get("/api/plans", authenticateToken, isAdmin, userController.getPlans);

app.post("/api/whatsapp/connect", authenticateToken, checkPlanExpiration, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Plan, as: 'planData' }]
    });

    const activeSessions = sessionManager.getUserSessions(user.id);
    const maxSessions = user.planData?.maxSessions || 1;
    const bodySessionId = req.body ? req.body.sessionId : null;

    if (activeSessions.length >= maxSessions) {
      // Si ya tiene el máximo, pero intenta reconectar una existente que no está "open", se lo permitimos
      if (!bodySessionId || !activeSessions.find(s => s.sessionId === bodySessionId)) {
        return res.status(403).json({ 
          success: false, 
          error: `Has alcanzado el límite de ${maxSessions} sesión(es) para tu plan ${user.planData?.name || 'Gratis'}.` 
        });
      }
    }

    const sessionId = bodySessionId || crypto.randomBytes(4).toString("hex");
    const session = await sessionManager.createSession(user.id, sessionId);
    
    if (!session) throw new Error("No se pudo crear o recuperar la sesión");

    res.json({ 
      success: true, 
      status: session.status || 'connecting', 
      hasQR: !!session.qrDataUrl, 
      sessionId: session.sessionId || sessionId 
    });
  } catch (error) {
    console.error("Error en connect:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/whatsapp/sessions", authenticateToken, async (req, res) => {
  try {
    const sessions = sessionManager.getUserSessions(req.user.id).map(s => ({
      sessionId: s.sessionId,
      status: s.status,
      qr: s.qrDataUrl
    }));
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/whatsapp/status/:sessionId", authenticateToken, async (req, res) => {
  try {
    const session = sessionManager.getSession(req.user.id, req.params.sessionId);
    if (!session) {
      return res.json({ success: true, status: "disconnected", message: "Sesión no encontrada" });
    }

    res.json({
      success: true,
      status: session.status,
      qr: session.qrDataUrl,
      userId: session.userId,
      sessionId: session.sessionId,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API V1 - MESSAGING CORE
app.post("/api/v1/messages/text", authenticateToken, checkPlanExpiration, async (req, res) => {
  const { recipient, body, account_id } = req.body;
  const session = account_id ? sessionManager.getSession(req.user.id, account_id) : sessionManager.getUserSessions(req.user.id).find(s => s.status === 'open');
  if (!session) return res.status(404).json({ success: false, error: "Active account not found." });

  try {
    const result = await session.sock.sendMessage(`${recipient}@s.whatsapp.net`, { text: body });
    res.json({ success: true, message_id: result.key.id, status: "sent" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/v1/messages/media", authenticateToken, checkPlanExpiration, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { include: [{ model: Plan, as: 'planData' }] });
    if (!user.planData?.features.includes("media")) return res.status(403).json({ success: false, error: "Upgrade required for media messaging." });

    const { recipient, type, payload, caption, filename, account_id } = req.body;
    const session = account_id ? sessionManager.getSession(req.user.id, account_id) : sessionManager.getUserSessions(req.user.id).find(s => s.status === 'open');
    if (!session) return res.status(404).json({ success: false, error: "Active account not found." });

    let mediaSource;
    if (payload.startsWith('data:') && payload.includes(';base64,')) {
      const base64Data = payload.split(';base64,').pop();
      mediaSource = Buffer.from(base64Data, 'base64');
    } else {
      mediaSource = { url: payload };
    }

    let msgConfig = {};
    if (type === 'image') msgConfig = { image: mediaSource, caption };
    else if (type === 'video') msgConfig = { video: mediaSource, caption };
    else if (type === 'document') msgConfig = { document: mediaSource, fileName: filename || 'file', mimetype: 'application/octet-stream' };
    else if (type === 'audio') msgConfig = { audio: mediaSource, ptt: true };

    const result = await session.sock.sendMessage(`${recipient}@s.whatsapp.net`, msgConfig);
    res.json({ success: true, message_id: result.key.id, status: "sent" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/whatsapp/logout", authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: "Debe proporcionar el sessionId" });
    
    await sessionManager.deleteSession(req.user.id, sessionId);
    res.json({ success: true, message: "Sesión de WhatsApp cerrada" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const startServer = async () => {
  try {
    const port = process.env.PORT || 3000;
    
    await sequelize.authenticate();
    console.log("✅ Conexión a MySQL establecida.");

    await sequelize.sync({ alter: true });
    console.log("📊 Base de datos sincronizada.");

    // Restaurar sesiones persistentes de WhatsApp
    await sessionManager.restoreSessions();

    // CREACIÓN DE ROLES ROBUSTA
    const [adminRole] = await Role.findOrCreate({ 
      where: { name: "admin" }, 
      defaults: { name: "admin", permissions: ["whatsapp", "admin", "users"] } 
    });
    
    await Role.findOrCreate({ 
      where: { name: "user" }, 
      defaults: { name: "user", permissions: ["whatsapp"] } 
    });

    // CONFIGURACIÓN DE PLANES COMERCIALES
    const [trialPlan] = await Plan.findOrCreate({
      where: { name: "Trial" },
      defaults: { 
        name: "Trial", 
        maxSessions: 1, 
        price: 0, 
        features: ["text", "media", "files"] 
      }
    });

    const [basicPlan] = await Plan.findOrCreate({
      where: { name: "Basic" },
      defaults: { 
        name: "Basic", 
        maxSessions: 1, 
        price: 3, 
        features: ["text"] 
      }
    });

    const [proPlan] = await Plan.findOrCreate({
      where: { name: "Professional" },
      defaults: { 
        name: "Professional", 
        maxSessions: 5, // Un límite técnico razonable pero no comercializado
        price: 7, 
        features: ["text", "media", "files"] 
      }
    });

    // FORZAR ACTUALIZACIÓN DE LÓGICA COMERCIAL
    await trialPlan.update({ features: ["text", "media", "files", "webhook"] });
    await basicPlan.update({ features: ["text"] });
    await proPlan.update({ features: ["text", "media", "files", "webhook"] });

    const userCount = await User.count();
    if (userCount === 0) {
      await User.create({
        username: process.env.INITIAL_ADMIN_USERNAME || "admin",
        whatsappNumber: process.env.INITIAL_ADMIN_WHATSAPP || "5215500000000",
        password: process.env.INITIAL_ADMIN_PASSWORD || "admin_password_123",
        roleId: adminRole.id,
        planId: trialPlan.id,
        whatsappSessionId: "admin_session_root"
      });
      console.log(`👤 Usuario admin creado: ${process.env.INITIAL_ADMIN_USERNAME || "admin"}`);
    } else {
      // Si ya existe, aseguramos que tenga un plan para evitar errores
      const admin = await User.findOne({ where: { username: process.env.INITIAL_ADMIN_USERNAME || "admin" } });
      if (admin && !admin.planId) {
        admin.planId = trialPlan.id;
        await admin.save();
        console.log("✅ Plan 'Gratis' asignado al administrador existente.");
      }
    }

    // Tarea programada: Limpiar sesiones expiradas cada hora
    setInterval(() => {
      sessionManager.cleanupExpiredSessions();
    }, 60 * 60 * 1000);

    app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Servidor SaaS en puerto ${port}`);
    });
  } catch (error) {
    console.error("❌ Error fatal al iniciar:", error);
  }
};

startServer();