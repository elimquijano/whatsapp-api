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
app.post("/api/auth/register", authController.register);

app.get("/api/users/profile", authenticateToken, userController.getProfile);
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

    if (activeSessions.length >= maxSessions) {
      // Si ya tiene el máximo, pero intenta reconectar una existente que no está "open", se lo permitimos
      const { sessionId } = req.body;
      if (!sessionId || !activeSessions.find(s => s.sessionId === sessionId)) {
        return res.status(403).json({ 
          success: false, 
          error: `Has alcanzado el límite de ${maxSessions} sesión(es) para tu plan ${user.planData?.name || 'Gratis'}.` 
        });
      }
    }

    const sessionId = req.body.sessionId || crypto.randomBytes(4).toString("hex");
    const session = await sessionManager.createSession(user.id, sessionId);
    
    res.json({ success: true, status: session.status, hasQR: !!session.qrDataUrl, sessionId });
  } catch (error) {
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

app.post("/api/whatsapp/send-text", authenticateToken, checkPlanExpiration, async (req, res) => {
  const { number, message, sessionId } = req.body;
  
  // Si no envía sessionId, intentamos usar la primera sesión abierta que tenga
  let session;
  if (sessionId) {
    session = sessionManager.getSession(req.user.id, sessionId);
  } else {
    session = sessionManager.getUserSessions(req.user.id).find(s => s.status === 'open');
  }

  if (!session || session.status !== "open") {
    return res.status(503).json({ success: false, error: "Sesión de WhatsApp no está conectada" });
  }

  try {
    const jid = `${number}@s.whatsapp.net`;
    const result = await session.sock.sendMessage(jid, { text: message });
    res.json({ success: true, messageId: result.key.id });
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

    await sequelize.sync({ force: false });
    console.log("📊 Base de datos sincronizada.");

    // CREACIÓN DE ROLES ROBUSTA
    const [adminRole] = await Role.findOrCreate({ 
      where: { name: "admin" }, 
      defaults: { name: "admin", permissions: ["whatsapp", "admin", "users"] } 
    });
    
    await Role.findOrCreate({ 
      where: { name: "user" }, 
      defaults: { name: "user", permissions: ["whatsapp"] } 
    });

    // CREACIÓN DE PLANES POR DEFECTO
    const [freePlan] = await Plan.findOrCreate({
      where: { name: "Gratis" },
      defaults: { name: "Gratis", maxSessions: 1, price: 0, features: ["1 Sesión"] }
    });

    await Plan.findOrCreate({
      where: { name: "Premium" },
      defaults: { name: "Premium", maxSessions: 5, price: 10, features: ["5 Sesiones", "Soporte Prioritario"] }
    });

    const userCount = await User.count();
    if (userCount === 0) {
      await User.create({
        username: process.env.INITIAL_ADMIN_USERNAME || "admin",
        email: process.env.INITIAL_ADMIN_EMAIL || "admin@example.com",
        password: process.env.INITIAL_ADMIN_PASSWORD || "admin_password_123",
        roleId: adminRole.id,
        planId: freePlan.id,
        whatsappSessionId: "admin_session_root"
      });
      console.log(`👤 Usuario admin creado: ${process.env.INITIAL_ADMIN_USERNAME || "admin"}`);
    } else {
      // Si ya existe, aseguramos que tenga un plan para evitar errores
      const admin = await User.findOne({ where: { username: process.env.INITIAL_ADMIN_USERNAME || "admin" } });
      if (admin && !admin.planId) {
        admin.planId = freePlan.id;
        await admin.save();
        console.log("✅ Plan 'Gratis' asignado al administrador existente.");
      }
    }

    app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Servidor SaaS en puerto ${port}`);
    });
  } catch (error) {
    console.error("❌ Error fatal al iniciar:", error);
  }
};

startServer();