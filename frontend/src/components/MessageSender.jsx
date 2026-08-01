import React, { useEffect, useState } from 'react';
import {
  Paper, Typography, Box, TextField, Button,
  Alert, CircularProgress, InputAdornment
} from '@mui/material';
import { Send, PhoneAndroid, Message, AccountTree } from '@mui/icons-material';
import axios from 'axios';
import { useOutletContext, useParams } from 'react-router-dom';

const MessageSender = () => {
  const { sessionId = '' } = useParams();
  const { session } = useOutletContext();
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setNumber('');
    setMessage('');
    setSuccess('');
    setError('');
  }, [sessionId]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!sessionId || session?.status !== 'open') {
      setError('Esta sesión debe estar conectada para enviar mensajes');
      return;
    }

    setLoading(true);
    setSuccess('');
    setError('');

    try {
      const response = await axios.post(`/api/v1/sessions/${sessionId}/messages/text`, {
        recipient: number,
        body: message
      });
      setSuccess(`Mensaje enviado con ID: ${response.data.message_id}`);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar el mensaje');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>
          <Message sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6">Mensaje directo</Typography>
          <Typography variant="caption" color="text.secondary">Envía una respuesta puntual sin abrir el CRM</Typography>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSend} sx={{ mt: 2 }}>
        <TextField
          fullWidth
          label="Enviar desde"
          value={sessionId}
          sx={{ mb: 3 }}
          helperText={session?.status === 'open' ? 'Sesión conectada' : 'La sesión no está conectada'}
          InputProps={{
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start">
                <AccountTree />
              </InputAdornment>
            ),
          }}
        />

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
          disabled={loading || session?.status !== 'open'}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
          sx={{ py: 1.25 }}
        >
          {loading ? 'Enviando...' : session?.status !== 'open' ? 'Conecta esta sesión primero' : 'Enviar Mensaje'}
        </Button>
      </Box>
    </Paper>
  );
};

export default MessageSender;
