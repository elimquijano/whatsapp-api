import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Box, Button, CircularProgress,
  Alert, Divider, Chip, Grid, Card, CardContent, CardActions
} from '@mui/material';
import {
  WhatsApp, Refresh, Logout, CloudDone,
  CloudOff, QrCodeScanner, Add
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const WhatsAppConnector = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await axios.get('/api/whatsapp/sessions');
      setSessions(response.data.sessions || []);
    } catch (err) {
      setError('Error al obtener las sesiones de WhatsApp');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const connectNew = async () => {
    setActionLoading(true);
    setError('');
    try {
      await axios.post('/api/whatsapp/connect');
      await fetchSessions();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar nueva conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const logout = async (sessionId) => {
    if (!window.confirm('¿Estás seguro de cerrar esta sesión de WhatsApp?')) return;
    setActionLoading(true);
    try {
      await axios.post('/api/whatsapp/logout', { sessionId });
      await fetchSessions();
    } catch (err) {
      setError('Error al cerrar la sesión');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'success';
      case 'waiting_qr': return 'warning';
      case 'disconnected': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'open': return 'Conectado';
      case 'waiting_qr': return 'Esperando QR';
      case 'disconnected': return 'Desconectado';
      case 'connecting': return 'Conectando...';
      default: return status;
    }
  };

  const maxSessions = user?.planData?.maxSessions || 1;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          <WhatsApp sx={{ color: '#25D366', mr: 2 }} /> Mis Sesiones de WhatsApp
        </Typography>
        <Button
          variant="contained"
          startIcon={actionLoading ? <CircularProgress size={20} /> : <Add />}
          onClick={connectNew}
          disabled={actionLoading || sessions.length >= maxSessions}
        >
          Nueva Sesión ({sessions.length}/{maxSessions})
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {loading && sessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress /></Box>
      ) : sessions.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 3, bgcolor: '#f8fafc' }}>
          <QrCodeScanner sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6">No tienes sesiones activas</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Conecta tu primer número para empezar a enviar mensajes.</Typography>
          <Button variant="contained" onClick={connectNew}>Conectar WhatsApp</Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {sessions.map((session) => (
            <Grid item xs={12} sm={6} key={session.sessionId}>
              <Card elevation={2} sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      ID: {session.sessionId}
                    </Typography>
                    <Chip 
                      label={getStatusText(session.status)} 
                      size="small"
                      color={getStatusColor(session.status)}
                    />
                  </Box>

                  {session.status === 'waiting_qr' && session.qr ? (
                    <Box sx={{ textAlign: 'center', mt: 2 }}>
                      <img src={session.qr} alt="QR" style={{ width: '100%', maxWidth: 200, borderRadius: 8 }} />
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>Escanea con tu WhatsApp</Typography>
                    </Box>
                  ) : session.status === 'open' ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CloudDone sx={{ fontSize: 60, color: 'success.main' }} />
                      <Typography variant="body1" sx={{ mt: 1, fontWeight: 'bold' }}>Sesión Activa</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CircularProgress size={40} />
                      <Typography variant="body2" sx={{ mt: 1 }}>{getStatusText(session.status)}</Typography>
                    </Box>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', p: 2, bgcolor: '#f8fafc' }}>
                  <Button 
                    size="small" 
                    color="error" 
                    startIcon={<Logout />}
                    onClick={() => logout(session.sessionId)}
                  >
                    Desconectar
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default WhatsAppConnector;