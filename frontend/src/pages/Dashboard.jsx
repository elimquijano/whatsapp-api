import React, { useState } from 'react';
import {
  Container, Grid, Typography, Box, Paper,
  List, ListItem, ListItemIcon, ListItemText, Divider,
  AppBar, Toolbar, IconButton, Avatar, Menu, MenuItem, Tooltip,
  ListItemButton, useTheme, TextField, Button, Alert, CircularProgress
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People,
  Logout,
  Menu as MenuIcon,
  Code as CodeIcon,
  Visibility,
  VisibilityOff,
  ContentCopy,
  Webhook as WebhookIcon,
  Save
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import WhatsAppConnector from '../components/WhatsAppConnector';
import MessageSender from '../components/MessageSender';
import ApiConsole from '../components/ApiConsole';
import Users from './Users';
import axios from 'axios';

// Minimalist API Key Component
const ApiKeyDisplay = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const apiKey = user?.apiKey || 'No disponible (Re-inicia sesión)';

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    alert('API Key copiada al portapapeles');
  };

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2, 
        mb: 4, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2, 
        bgcolor: '#1e293b', 
        color: 'white',
        borderRadius: 3,
        border: '1px solid #334155'
      }}
    >
      <Box sx={{ bgcolor: '#38bdf8', px: 1, py: 0.5, borderRadius: 1, color: '#0f172a', fontWeight: 800, fontSize: '0.75rem' }}>
        API KEY PERMANENTE
      </Box>
      <TextField
        value={show ? apiKey : '•'.repeat(32)}
        variant="standard"
        fullWidth
        InputProps={{ 
          disableUnderline: true, 
          readOnly: true, 
          sx: { 
            color: 'white', 
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            letterSpacing: show ? 0 : 2
          } 
        }}
      />
      <Tooltip title={show ? "Ocultar" : "Mostrar"}>
        <IconButton onClick={() => setShow(!show)} sx={{ color: '#94a3b8' }}>
          {show ? <VisibilityOff /> : <Visibility />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Copiar API Key">
        <IconButton onClick={handleCopy} sx={{ color: '#38bdf8' }}>
          <ContentCopy />
        </IconButton>
      </Tooltip>
    </Paper>
  );
};

const WebhookConfig = ({ currentUrl }) => {
  const [url, setUrl] = useState(currentUrl || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSave = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/users/webhook', { webhookUrl: url }, { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: 'success', text: 'Webhook actualizado correctamente' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Error al guardar' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'white', mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <WebhookIcon sx={{ mr: 1, color: '#f59e0b' }} />
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#1e293b' }}>Configuración Webhook</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Recibe notificaciones en tiempo real cuando lleguen mensajes a tu número.
      </Typography>
      
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={9}>
           <TextField 
             fullWidth 
             label="URL del Webhook (https://...)" 
             variant="outlined" 
             value={url}
             onChange={(e) => setUrl(e.target.value)}
             size="small"
           />
        </Grid>
        <Grid item xs={12} md={3}>
           <Button 
             fullWidth 
             variant="contained" 
             startIcon={loading ? <CircularProgress size={20} color="inherit"/> : <Save />}
             onClick={handleSave}
             disabled={loading}
             sx={{ bgcolor: '#0f172a', fontWeight: 700 }}
           >
             Guardar
           </Button>
        </Grid>
      </Grid>
      {msg && <Alert severity={msg.type} sx={{ mt: 2 }}>{msg.text}</Alert>}
    </Paper>
  );
};

const DashboardHome = ({ user }) => (
  <Grid container spacing={4}>
    <Grid item xs={12} lg={8}>
      <WhatsAppConnector />
      {user?.planData?.features?.includes('webhook') && (
        <WebhookConfig currentUrl={user?.webhookUrl} />
      )}
    </Grid>
    <Grid item xs={12} lg={4}>
      <MessageSender />
      <Paper sx={{ p: 4, mt: 4, borderRadius: 4, bgcolor: '#1e293b', color: 'white' }}>
        <Typography variant="h5" gutterBottom sx={{ color: '#0ea5e9', fontWeight: 'bold' }}>Suscripción</Typography>
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1">Plan: <b>{user?.plan}</b></Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
            Vence: {user?.expirationDate ? new Date(user.expirationDate).toLocaleDateString() : 'N/A'}
          </Typography>
        </Box>
      </Paper>
    </Grid>
  </Grid>
);

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const handleLogout = () => {
    handleClose();
    logout();
  };

  const isPlanExpired = user?.expirationDate && new Date() > new Date(user.expirationDate);
  
  const menuItems = [
    { text: 'Panel de Control', icon: <DashboardIcon />, path: '/dashboard' },
    { text: 'Documentación API', icon: <CodeIcon />, path: '/dashboard/docs' },
    ...(user?.role === 'admin' ? [{ text: 'Gestionar Usuarios', icon: <People />, path: '/dashboard/users' }] : [])
  ];

  const drawerContent = (
    <Box sx={{ height: '100%', bgcolor: '#0f172a', color: 'white' }}>
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 900, color: 'primary.main', letterSpacing: '-0.5px' }}>
          WA-API<span style={{ color: 'white' }}>PRO</span>
        </Typography>
      </Box>
      <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
      <List sx={{ mt: 2, px: 2 }}>
        {menuItems.map((item) => {
          const isSelected = location.pathname === item.path;
          return (
            <ListItem disablePadding key={item.text} sx={{ mb: 1 }}>
              <ListItemButton 
                onClick={() => navigate(item.path)} 
                selected={isSelected}
                sx={{ 
                  borderRadius: 2, 
                  bgcolor: isSelected ? 'rgba(14, 165, 233, 0.1) !important' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                }}
              >
                <ListItemIcon sx={{ color: isSelected ? '#0ea5e9' : 'rgba(255,255,255,0.7)' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: isSelected ? 700 : 500 }} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f1f5f9' }}>
      {/* Sidebar Desktop */}
      <Box sx={{ width: 280, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
        {drawerContent}
      </Box>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', width: { md: `calc(100% - 280px)` } }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #e2e8f0', bgcolor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}>
          <Toolbar>
            <IconButton edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { md: 'none' } }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 800, color: '#0f172a' }}>
              {menuItems.find(i => i.path === location.pathname)?.text || 'Panel'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{user?.username}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>{user?.role}</Typography>
              </Box>
              <Tooltip title="Cuenta">
                <IconButton onClick={handleMenu} size="small" sx={{ border: '2px solid white', boxShadow: '0 0 0 2px #e2e8f0' }}>
                  <Avatar sx={{ width: 36, height: 36, bgcolor: isPlanExpired ? '#ef4444' : '#0ea5e9' }}>
                    {(user?.username?.[0] || 'U').toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                <MenuItem onClick={handleLogout}><Logout sx={{ mr: 1, fontSize: 20 }} /> Cerrar Sesión</MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ mt: 4, mb: 8, flexGrow: 1 }}>
          {isPlanExpired && (
            <Paper sx={{ p: 2, mb: 4, bgcolor: '#fee2e2', border: '1px solid #ef4444', borderRadius: 2 }}>
              <Typography color="error" variant="body1" sx={{ fontWeight: 'bold' }}>
                ⚠️ Tu suscripción ha vencido. Por favor contacta a soporte para renovar.
              </Typography>
            </Paper>
          )}
          
          <Routes>
            <Route path="/" element={<DashboardHome user={user} />} />
            <Route path="/docs" element={
              <Box>
                <ApiKeyDisplay />
                <Paper sx={{ p: 3, mb: 2, borderRadius: 2, bgcolor: 'white', border: '1px solid #e2e8f0' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>Consola Interactiva</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Selecciona un tipo de petición en la izquierda, modifica el cuerpo JSON y presiona "Run" para probar.
                  </Typography>
                </Paper>
                <ApiConsole mode="private" userToken={localStorage.getItem('token')} />
              </Box>
            } />
            <Route path="/users" element={user?.role === 'admin' ? <Users /> : <Navigate to="/dashboard" />} />
          </Routes>
        </Container>
      </Box>
    </Box>
  );
};

export default Dashboard;