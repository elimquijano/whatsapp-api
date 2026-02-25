import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Button,
  IconButton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Alert, CircularProgress,
  Tooltip, Card, Grid, InputAdornment, Avatar
} from '@mui/material';
import {
  Add, Delete, Edit, PersonAdd, Person, WhatsApp,
  Shield, AdminPanelSettings, Search,
  ContactPage as BadgeIcon
} from '@mui/icons-material';
import axios from 'axios';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  // Modal state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    whatsappNumber: '',
    password: '',
    roleId: '',
    planId: '',
    expirationDate: ''
  });

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
      setUsers(Array.isArray(res.data.users) ? res.data.users : []);
    } catch (err) {
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/roles', { headers: { Authorization: `Bearer ${token}` } });
      setRoles(Array.isArray(res.data.roles) ? res.data.roles : []);
    } catch (err) {
      console.error("Error al cargar roles", err);
    }
  };

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/plans', { headers: { Authorization: `Bearer ${token}` } });
      setPlans(Array.isArray(res.data.plans) ? res.data.plans : []);
    } catch (err) {
      console.error("Error al cargar planes", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchPlans();
  }, []);

  const handleOpen = (user = null) => {
    if (user) {
      setEditingId(user.id);
      setFormData({
        username: user.username,
        whatsappNumber: user.whatsappNumber || '',
        password: '', // Dejar vacío para no cambiar si no se desea
        roleId: user.roleId,
        planId: user.planId || '',
        expirationDate: user.expirationDate ? user.expirationDate.split('T')[0] : ''
      });
    } else {
      setEditingId(null);
      setFormData({ username: '', whatsappNumber: '', password: '', roleId: '', planId: '', expirationDate: '' });
    }
    setOpen(true);
    setFormError('');
  };
  
  const handleClose = () => {
    setOpen(false);
    setEditingId(null);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    const token = localStorage.getItem('token');
    try {
      if (editingId) {
        await axios.put(`/api/users/${editingId}`, formData, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post('/api/users', formData, { headers: { Authorization: `Bearer ${token}` } });
      }
      fetchUsers();
      handleClose();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Error al procesar usuario');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) return;
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const filteredUsers = users.filter(u => 
    (u.username || '').toLowerCase().includes(search.toLowerCase()) || 
    (u.whatsappNumber || '').includes(search)
  );

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#1e293b' }}>
            Gestión de Usuarios
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Administra los accesos y roles de tu plataforma SaaS
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpen()}
          sx={{ borderRadius: 2, px: 3, py: 1, bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' } }}
        >
          Nuevo Cliente
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Card elevation={0} sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <TextField
            placeholder="Buscar por usuario o número..."
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: '#64748b' }} />
                </InputAdornment>
              ),
            }}
            sx={{ maxWidth: 400, bgcolor: 'white', borderRadius: 2 }}
          />
        </Box>
        <TableContainer>
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Usuario</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>WhatsApp</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Rol</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Plan</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Vencimiento</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar sx={{ width: 32, height: 32, mr: 1.5, bgcolor: '#e0f2fe', color: '#0ea5e9' }}>
                        {(user.username?.[0] || 'U').toUpperCase()}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.username}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{user.whatsappNumber}</TableCell>
                  <TableCell>
                    <Chip 
                      label={user.role || 'user'} 
                      size="small" 
                      color={user.role === 'admin' ? 'secondary' : 'default'}
                      icon={user.role === 'admin' ? <AdminPanelSettings /> : <BadgeIcon />}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={user.plan || 'Sin Plan'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {user.expirationDate ? new Date(user.expirationDate).toLocaleDateString() : 'Nunca'}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar Usuario">
                      <IconButton color="primary" onClick={() => handleOpen(user)}>
                        <Edit />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar Usuario">
                      <IconButton color="error" onClick={() => handleDelete(user.id)}>
                        <Delete />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          {editingId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Box component="form" sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Usuario" name="username" value={formData.username} onChange={handleChange} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField 
                   fullWidth 
                   label="WhatsApp (521...)" 
                   name="whatsappNumber" 
                   value={formData.whatsappNumber} 
                   onChange={handleChange} 
                   helperText="Incluir código de país, solo números."
                />
              </Grid>
              <Grid item xs={12}>
                <TextField 
                  fullWidth 
                  label={editingId ? "Password (dejar en blanco para no cambiar)" : "Password"} 
                  name="password" 
                  type="password" 
                  value={formData.password} 
                  onChange={handleChange} 
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth label="Rol" name="roleId" value={formData.roleId} onChange={handleChange}>
                  {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name.toUpperCase()}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth label="Plan" name="planId" value={formData.planId} onChange={handleChange}>
                  <MenuItem value=""><em>Sin Plan</em></MenuItem>
                  {plans.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField 
                  fullWidth 
                  label="Fecha de Vencimiento" 
                  name="expirationDate" 
                  type="date" 
                  value={formData.expirationDate} 
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={formLoading}>
            {editingId ? 'Actualizar' : 'Crear Usuario'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;