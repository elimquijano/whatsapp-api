import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Box, Button, CircularProgress,
  Alert, Chip, Grid, Card, CardContent, CardActions, TextField, Switch, FormControlLabel
} from '@mui/material';
import {
  WhatsApp, Logout, CloudDone,
  CloudOff, QrCodeScanner, Add, Settings, Chat, Campaign, Send, Code
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useSmartPolling from '../hooks/useSmartPolling';

const WhatsAppConnector = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [webhookUrls, setWebhookUrls] = useState({});
  const [savingWebhook, setSavingWebhook] = useState('');

  const fetchSessions = useCallback(async () => {
    try {
      const response = await axios.get('/api/v1/sessions');
      const receivedSessions = response.data.sessions || [];
      setSessions(receivedSessions);
      setWebhookUrls((current) => {
        const next = { ...current };
        receivedSessions.forEach((session) => {
          if (next[session.sessionId] === undefined) next[session.sessionId] = session.webhookUrl || '';
        });
        return next;
      });
    } catch (err) {
      setError('Error al obtener las sesiones de WhatsApp');
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPolling(fetchSessions, 15000);

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

  const reconnect = async (sessionId) => {
    setActionLoading(true);
    setError('');
    try {
      await axios.post(`/api/v1/sessions/${sessionId}/connect`, { resetAuth: true });
      await fetchSessions();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo volver a vincular la sesión');
    } finally {
      setActionLoading(false);
    }
  };

  const logout = async (sessionId) => {
    if (!window.confirm('¿Desvincular este WhatsApp? La configuración CRM, chats y workflows permanecerán guardados.')) return;
    setActionLoading(true);
    try {
      await axios.post(`/api/v1/sessions/${sessionId}/logout`);
      await fetchSessions();
    } catch (err) {
      setError('Error al cerrar la sesión');
    } finally {
      setActionLoading(false);
    }
  };

  const saveWebhook = async (sessionId) => {
    setSavingWebhook(sessionId);
    setError('');
    try {
      await axios.put(`/api/v1/sessions/${sessionId}/webhook`, { webhookUrl: webhookUrls[sessionId] || '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar el webhook');
    } finally {
      setSavingWebhook('');
    }
  };

  const toggleAi = async (sessionId, enabled) => {
    setError('');
    try {
      const response = await axios.put(`/api/v1/sessions/${sessionId}/ai/toggle`, { enabled });
      setSessions((current) => current.map((session) => session.sessionId === sessionId ? { ...session, aiAutoReplyEnabled: response.data.autoReplyEnabled } : session));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el modo de respuesta');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'success';
      case 'waiting_qr':
      case 'reconnecting': return 'warning';
      case 'disconnected':
      case 'logged_out':
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'open': return 'Conectado';
      case 'waiting_qr': return 'Esperando QR';
      case 'disconnected': return 'Desconectado';
      case 'logged_out': return 'Desvinculado desde WhatsApp';
      case 'error': return 'Conexión detenida';
      case 'reconnecting': return 'Reconectando con espera...';
      case 'connecting': return 'Conectando...';
      default: return status;
    }
  };

  const maxSessions = user?.planData?.maxSessions || 1;

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 2.5, bgcolor: 'success.main', color: 'common.white' }}>
            <WhatsApp />
          </Box>
          <Box>
            <Typography variant="h6">Sesiones de WhatsApp</Typography>
            <Typography variant="body2" color="text.secondary">Conexión, webhook y automatización por número</Typography>
          </Box>
        </Box>
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
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center', bgcolor: 'surface.soft' }}>
          <QrCodeScanner sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6">No tienes sesiones activas</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Conecta tu primer número para empezar a enviar mensajes.</Typography>
          <Button variant="contained" onClick={connectNew}>Conectar WhatsApp</Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {sessions.filter(s => s && s.sessionId).map((session) => (
            <Grid item xs={12} sm={6} key={session.sessionId}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1 }}>
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
                  {(session.displayName || session.phoneNumber) && (
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      {session.displayName || `+${session.phoneNumber}`}
                    </Typography>
                  )}

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
                  ) : ['connecting', 'reconnecting'].includes(session.status) ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CircularProgress size={40} />
                      <Typography variant="body2" sx={{ mt: 1 }}>{getStatusText(session.status)}</Typography>
                      {session.reconnectAttempt > 0 && <Typography variant="caption" color="text.secondary">Intento controlado {session.reconnectAttempt}/6</Typography>}
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CloudOff sx={{ fontSize: 60, color: 'error.main' }} />
                      <Typography variant="body1" sx={{ mt: 1, fontWeight: 'bold' }}>{getStatusText(session.status)}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        La configuración, chats y workflows siguen guardados.
                      </Typography>
                      {session.lastError && <Alert severity="warning" sx={{ mt: 1.5, textAlign: 'left', wordBreak: 'break-word' }}>{session.lastError}</Alert>}
                      <Button sx={{ mt: 2 }} variant="contained" startIcon={<QrCodeScanner />} disabled={actionLoading} onClick={() => reconnect(session.sessionId)}>
                        Volver a vincular
                      </Button>
                    </Box>
                  )}

                  {user?.planData?.features?.includes('webhook') && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Webhook de esta sesión</Typography>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="https://tu-app.com/webhook"
                        value={webhookUrls[session.sessionId] || ''}
                        onChange={(event) => setWebhookUrls((current) => ({ ...current, [session.sessionId]: event.target.value }))}
                      />
                      <Button
                        fullWidth
                        size="small"
                        variant="outlined"
                        sx={{ mt: 1 }}
                        disabled={savingWebhook === session.sessionId}
                        onClick={() => saveWebhook(session.sessionId)}
                      >
                        {savingWebhook === session.sessionId ? 'Guardando...' : 'Guardar webhook'}
                      </Button>
                    </Box>
                  )}
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Trabajar en esta sesión</Typography>
                    <Grid container spacing={1}>
                      {user?.planData?.features?.includes('ai_crm') && <>
                        <Grid item xs={6}><Button fullWidth size="small" variant="outlined" startIcon={<Chat />} onClick={() => navigate(`/dashboard/sessions/${encodeURIComponent(session.sessionId)}/crm`)}>CRM / Contactos</Button></Grid>
                        <Grid item xs={6}><Button fullWidth size="small" variant="outlined" startIcon={<Campaign />} onClick={() => navigate(`/dashboard/sessions/${encodeURIComponent(session.sessionId)}/campaigns`)}>Campañas</Button></Grid>
                      </>}
                      <Grid item xs={6}><Button fullWidth size="small" variant="outlined" startIcon={<Send />} onClick={() => navigate(`/dashboard/sessions/${encodeURIComponent(session.sessionId)}/send`)}>Enviar</Button></Grid>
                      <Grid item xs={6}><Button fullWidth size="small" variant="outlined" startIcon={<Code />} onClick={() => navigate(`/dashboard/sessions/${encodeURIComponent(session.sessionId)}/api`)}>API</Button></Grid>
                    </Grid>
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, p: 1.5, bgcolor: 'surface.soft', borderTop: '1px solid', borderColor: 'divider' }}>
                  {user?.planData?.features?.includes('ai_crm') && <>
                    <FormControlLabel
                      sx={{ mr: 'auto', ml: 0, maxWidth: '100%', '& .MuiFormControlLabel-label': { fontSize: 13 } }}
                      control={<Switch checked={Boolean(session.aiAutoReplyEnabled)} onChange={(event) => toggleAi(session.sessionId, event.target.checked)} />}
                      label={session.aiAutoReplyEnabled ? 'IA general activa' : 'IA general pausada'}
                    />
                    <Button size="small" startIcon={<Settings />} onClick={() => navigate(`/dashboard/sessions/${encodeURIComponent(session.sessionId)}/ai`)}>Configurar IA</Button>
                  </>}
                  {!['disconnected', 'logged_out', 'error'].includes(session.status) && <Button 
                    size="small" 
                    color="error" 
                    startIcon={<Logout />}
                    onClick={() => logout(session.sessionId)}
                  >
                    Desconectar
                  </Button>}
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
