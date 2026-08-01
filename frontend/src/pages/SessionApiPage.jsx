import React from 'react';
import { Alert, Box, Paper, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import ApiConsole from '../components/ApiConsole';
import ApiKeyDisplay from '../components/ApiKeyDisplay';

const SessionApiPage = () => {
  const { sessionId = '' } = useParams();

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, lg: 2.5 } }}>
      <Typography variant="h5" fontWeight={900}>API de esta sesión</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        La API key autoriza tu cuenta y la URL fija la sesión que ejecutará cada operación.
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Todas las pruebas usarán exclusivamente la sesión <strong>{sessionId}</strong>. Los archivos aceptan URL en <code>payload</code>, data URI en <code>payload</code> o Base64 puro mediante <code>base64</code> + <code>mimetype</code>.
      </Alert>
      <ApiKeyDisplay />
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2" component="code" sx={{ overflowWrap: 'anywhere' }}>
          /api/v1/sessions/{sessionId}/messages/...
        </Typography>
      </Paper>
      <ApiConsole mode="private" userToken={localStorage.getItem('token')} sessionId={sessionId} />
    </Box>
  );
};

export default SessionApiPage;
