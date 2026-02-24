import React, { useState, useEffect } from 'react';
import {
  Paper, Typography, Box, TextField, Button,
  Alert, CircularProgress, InputAdornment, MenuItem
} from '@mui/material';
import { Send, PhoneAndroid, Message, AccountTree } from '@mui/icons-material';
import axios from 'axios';

const MessageSender = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingSessions, setFetchingSessions] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchSessions = async () => {
    try {
      const response = await axios.get('/api/whatsapp/sessions');
      const openSessions = (response.data.sessions || []).filter(s => s.status === 'open');
      setSessions(openSessions);
      if (openSessions.length > 0 && !selectedSession) {
        setSelectedSession(openSessions[0].sessionId);
      }
    } catch (err) {
      console.error("Error al cargar sesiones para envío");
    } finally {
      setFetchingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedSession) {
      setError('Debes seleccionar una sesión conectada');
      return;
    }

    setLoading(true);
    setSuccess('');
    setError('');

    try {
      const response = await axios.post('/api/whatsapp/send-text', {
        number,
        message,
        sessionId: selectedSession
      });
      setSuccess(`Mensaje enviado con ID: ${response.data.messageId}`);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar el mensaje');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, borderRadius: 3, mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Message sx={{ color: '#1976d2', mr: 2, fontSize: 32 }} />
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          Enviar Mensaje Directo
        </Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSend} sx={{ mt: 2 }}>
        <TextField
          select
          fullWidth
          label="Enviar desde"
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          sx={{ mb: 3 }}
          disabled={fetchingSessions || sessions.length === 0}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AccountTree />
              </InputAdornment>
            ),
          }}
        >
          {sessions.length === 0 ? (
            <MenuItem value=""><em>No hay sesiones conectadas</em></MenuItem>
          ) : (
            sessions.map((s) => (
              <MenuItem key={s.sessionId} value={s.sessionId}>
                Sesión: {s.sessionId}
              </MenuItem>
            ))
          )}
        </TextField>

        <TextField
          fullWidth
          label="Número de Teléfono"
          variant="outlined"
          placeholder="Ej: 5493511234567"
          required
          sx={{ mb: 3 }}
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ''))}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <PhoneAndroid />
              </InputAdornment>
            ),
          }}
          helperText="Incluye el código de país sin el símbolo +"
        />

        <TextField
          fullWidth
          label="Mensaje"
          variant="outlined"
          placeholder="Escribe tu mensaje aquí..."
          required
          multiline
          rows={4}
          sx={{ mb: 3 }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={loading || sessions.length === 0}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
          sx={{ py: 1.5, fontSize: '1.1rem', borderRadius: 10 }}
        >
          {loading ? 'Enviando...' : sessions.length === 0 ? 'Conecta un número primero' : 'Enviar Mensaje'}
        </Button>
      </Box>
    </Paper>
  );
};

export default MessageSender;