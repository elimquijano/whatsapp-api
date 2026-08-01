import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Campaign, Chat, Code, Send, SmartToy } from '@mui/icons-material';
import axios from 'axios';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const sections = [
  { key: 'crm', label: 'CRM y contactos', icon: <Chat fontSize="small" />, professional: true },
  { key: 'campaigns', label: 'Campañas', icon: <Campaign fontSize="small" />, professional: true },
  { key: 'send', label: 'Envío directo', icon: <Send fontSize="small" /> },
  { key: 'api', label: 'API', icon: <Code fontSize="small" /> },
  { key: 'ai', label: 'Agentes e IA', icon: <SmartToy fontSize="small" />, professional: true },
];

const statusLabel = {
  open: 'Conectada',
  waiting_qr: 'Esperando QR',
  reconnecting: 'Reconectando',
  connecting: 'Conectando',
  disconnected: 'Desconectada',
  logged_out: 'Desvinculada',
  error: 'Con error',
};

const SessionWorkspace = () => {
  const { sessionId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const professional = user?.planData?.features?.includes('ai_crm');

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/v1/sessions');
      setSessions(data.sessions || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'No se pudo cargar la sesión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const timer = window.setInterval(loadSessions, 10000);
    return () => window.clearInterval(timer);
  }, [loadSessions]);

  const selected = useMemo(
    () => sessions.find((session) => session.sessionId === sessionId),
    [sessionId, sessions],
  );
  const currentPathSection = location.pathname.split('/').filter(Boolean).at(-1);
  const currentSection = sections.some((section) => section.key === currentPathSection) ? currentPathSection : 'crm';
  const availableSections = sections.filter((section) => !section.professional || professional);

  const switchSession = (nextSessionId) => {
    navigate(`/dashboard/sessions/${encodeURIComponent(nextSessionId)}/${currentSection}`);
  };

  if (loading) {
    return <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress /></Stack>;
  }

  if (!selected) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/dashboard')}>Ver sesiones</Button>}>
          La sesión solicitada no existe o no pertenece a tu cuenta.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, height: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Paper square elevation={0} sx={{ px: { xs: 1.5, md: 2.5 }, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }}>{error}</Alert>}
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="primary.main" fontWeight={800}>Espacio de sesión</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" noWrap>{selected.displayName || (selected.phoneNumber ? `+${selected.phoneNumber}` : `Sesión ${selected.sessionId}`)}</Typography>
              <Chip
                size="small"
                color={selected.status === 'open' ? 'success' : selected.status === 'error' ? 'error' : 'default'}
                label={statusLabel[selected.status] || selected.status}
              />
            </Stack>
          </Box>
          <TextField
            select
            size="small"
            label="Cambiar sesión"
            value={sessionId}
            onChange={(event) => switchSession(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 230 } }}
          >
            {sessions.map((session) => (
              <MenuItem key={session.sessionId} value={session.sessionId}>
                {session.displayName || (session.phoneNumber ? `+${session.phoneNumber}` : session.sessionId)}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ flex: 1, justifyContent: { lg: 'flex-end' } }}>
            {availableSections.map((section) => (
              <Button
                key={section.key}
                size="small"
                variant={currentSection === section.key ? 'contained' : 'outlined'}
                startIcon={section.icon}
                onClick={() => navigate(`/dashboard/sessions/${encodeURIComponent(sessionId)}/${section.key}`)}
              >
                {section.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Paper>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowX: 'hidden',
          overflowY: currentSection === 'crm' ? { xs: 'auto', lg: 'hidden' } : 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <Outlet context={{ session: selected, sessions, reloadSessions: loadSessions }} />
      </Box>
    </Box>
  );
};

export default SessionWorkspace;
