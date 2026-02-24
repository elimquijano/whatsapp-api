import React, { useState } from 'react';
import {
  Container, Grid, Typography, Box, Paper,
  List, ListItem, ListItemIcon, ListItemText, Divider,
  AppBar, Toolbar, IconButton, Avatar, Menu, MenuItem, Tooltip,
  ListItemButton
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  WhatsApp,
  People,
  Logout,
  Menu as MenuIcon,
  AccountCircle,
  Settings
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import WhatsAppConnector from '../components/WhatsAppConnector';
import MessageSender from '../components/MessageSender';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleLogout = () => {
    handleClose();
    logout();
  };

  const isPlanExpired = user?.expirationDate && new Date() > new Date(user.expirationDate);

  const renderPermissions = () => {
    if (Array.isArray(user?.permissions)) {
      return user.permissions.join(', ');
    }
    return 'WhatsApp';
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f1f5f9' }}>
      <Box sx={{ width: 280, bgcolor: '#0f172a', color: 'white', display: { xs: 'none', md: 'block' } }}>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0ea5e9' }}>WA-SAAS</Typography>
        </Box>
        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
        <List sx={{ mt: 2, px: 2 }}>
          <ListItem disablePadding sx={{ mb: 1 }}>
            <ListItemButton selected sx={{ borderRadius: 2, bgcolor: 'rgba(14, 165, 233, 0.1) !important' }}>
              <ListItemIcon sx={{ color: '#0ea5e9' }}><DashboardIcon /></ListItemIcon>
              <ListItemText primary="Panel de Control" />
            </ListItemButton>
          </ListItem>
          
          {user?.role === 'admin' && (
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton onClick={() => navigate('/users')} sx={{ borderRadius: 2 }}>
                <ListItemIcon sx={{ color: 'rgba(255,255,255,0.7)' }}><People /></ListItemIcon>
                <ListItemText primary="Gestionar Usuarios" />
              </ListItemButton>
            </ListItem>
          )}
        </List>
      </Box>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #e2e8f0' }}>
          <Toolbar>
            <IconButton edge="start" color="inherit" sx={{ mr: 2, display: { md: 'none' } }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: '#1e293b' }}>Panel</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{user?.username || 'Usuario'}</Typography>
                <Typography variant="caption" color="text.secondary">{(user?.role || 'user').toUpperCase()} - {user?.plan || 'Gratis'}</Typography>
              </Box>
              <Tooltip title="Cuenta">
                <IconButton onClick={handleMenu} size="small">
                  <Avatar sx={{ width: 40, height: 40, bgcolor: isPlanExpired ? '#ef4444' : '#0ea5e9' }}>
                    {(user?.username?.[0] || 'U').toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                <MenuItem onClick={handleLogout}><Logout sx={{ mr: 1 }} /> Cerrar Sesión</MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ mt: 5, mb: 5 }}>
          {isPlanExpired && (
            <Paper sx={{ p: 2, mb: 4, bgcolor: '#fee2e2', border: '1px solid #ef4444', borderRadius: 2 }}>
              <Typography color="error" variant="body1" sx={{ fontWeight: 'bold' }}>
                ⚠️ Tu plan ha expirado el {new Date(user.expirationDate).toLocaleDateString()}. Algunas funciones pueden estar limitadas.
              </Typography>
            </Paper>
          )}
          <Grid container spacing={4}>
            <Grid item xs={12} lg={8}><WhatsAppConnector /></Grid>
            <Grid item xs={12} lg={4}>
              <MessageSender />
              <Paper sx={{ p: 4, mt: 4, borderRadius: 4, bgcolor: '#1e293b', color: 'white' }}>
                <Typography variant="h5" gutterBottom sx={{ color: '#0ea5e9', fontWeight: 'bold' }}>Suscripción</Typography>
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle1">Plan: <b>{user?.plan || 'Gratis'}</b></Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
                    Vencimiento: {user?.expirationDate ? new Date(user.expirationDate).toLocaleDateString() : 'Nunca'}
                  </Typography>
                  <Typography variant="body2">Permisos: {renderPermissions()}</Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

export default Dashboard;
