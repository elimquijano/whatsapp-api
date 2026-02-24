import User from "../models/User.js";
import Role from "../models/Role.js";
import Plan from "../models/Plan.js";
import crypto from "crypto";

export const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        { model: Role, as: 'roleData', attributes: ['name', 'permissions'] },
        { model: Plan, as: 'planData', attributes: ['name', 'maxSessions', 'features'] }
      ],
      attributes: { exclude: ['password'] }
    });

    if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });

    res.json({
      success: true,
      user: {
        ...user.toJSON(),
        role: user.roleData?.name || 'user',
        permissions: user.roleData?.permissions || [],
        plan: user.planData?.name || 'Sin Plan',
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      include: [
        { model: Role, as: 'roleData', attributes: ['name', 'permissions'] },
        { model: Plan, as: 'planData', attributes: ['name', 'maxSessions'] }
      ],
      attributes: { exclude: ['password'] }
    });
    
    const formattedUsers = users.map(u => ({
      ...u.toJSON(),
      role: u.roleData?.name || 'unknown',
      plan: u.planData?.name || 'Sin Plan'
    }));

    res.json({ success: true, users: formattedUsers });
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, roleId, planId, expirationDate } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, error: "Usuario no encontrado" });

    const updateData = { username, email, roleId, planId, expirationDate };
    if (password && password.trim() !== "") {
      updateData.password = password;
    }

    await user.update(updateData);
    res.json({ success: true, message: "Usuario actualizado" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { username, email, password, roleId, planId, expirationDate } = req.body;
    if (!username || !email || !password || !roleId) {
      return res.status(400).json({ success: false, error: "Todos los campos son obligatorios" });
    }

    const whatsappSessionId = crypto.randomBytes(8).toString("hex");

    const user = await User.create({
      username,
      email,
      password,
      roleId,
      planId,
      expirationDate,
      whatsappSessionId
    });

    res.json({ success: true, message: "Usuario creado", userId: user.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, error: "No puedes eliminarte a ti mismo" });
    }
    await User.destroy({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll();
    res.json({ success: true, roles: roles || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.findAll();
    res.json({ success: true, plans: plans || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};