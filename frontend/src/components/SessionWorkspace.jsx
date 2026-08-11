import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import axios from 'axios';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import useSmartPolling from '../hooks/useSmartPolling';

const sections = ['crm', 'campaigns', 'send', 'api', 'ai'];

const SessionWorkspace = () => {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useSmartPolling(loadSessions, 30000);

  const selected = useMemo(
    () => sessions.find((session) => session.sessionId === sessionId),
    [sessionId, sessions],
  );
  const currentPathSection = location.pathname.split('/').filter(Boolean).at(-1);
  const currentSection = sections.includes(currentPathSection) ? currentPathSection : 'crm';

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
      <Paper square elevation={0} sx={{ px: { xs: 1.5, md: 2.5 }, py: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        {error && <Alert severity="warning" sx={{ my: 0.5 }}>{error}</Alert>}
        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cambiar sesión:</Typography>
          <TextField
            select
            size="small"
            variant="standard"
            value={sessionId}
            onChange={(event) => switchSession(event.target.value)}
            inputProps={{ 'aria-label': 'Cambiar sesión' }}
            SelectProps={{ displayEmpty: true }}
            sx={{ width: { xs: 150, sm: 210 }, '& .MuiInputBase-root': { fontSize: 13 } }}
          >
            {sessions.map((session) => (
              <MenuItem key={session.sessionId} value={session.sessionId}>
                {session.displayName || (session.phoneNumber ? `+${session.phoneNumber}` : session.sessionId)}
              </MenuItem>
            ))}
          </TextField>
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
