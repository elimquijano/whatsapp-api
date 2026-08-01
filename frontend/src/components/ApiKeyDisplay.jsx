import React, { useState } from 'react';
import { Chip, IconButton, Paper, Stack, TextField, Tooltip } from '@mui/material';
import { ContentCopy, Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const ApiKeyDisplay = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiKey = user?.apiKey || 'No disponible. Vuelve a iniciar sesión.';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 3, overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5}>
        <Chip label="API KEY DE LA CUENTA" color="primary" size="small" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
        <TextField
          value={show ? apiKey : '•'.repeat(32)}
          size="small"
          fullWidth
          aria-label="API Key"
          InputProps={{
            readOnly: true,
            sx: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', letterSpacing: show ? 0 : 2 },
            endAdornment: (
              <Stack direction="row" spacing={0.5}>
                <Tooltip title={show ? 'Ocultar' : 'Mostrar'}>
                  <IconButton size="small" onClick={() => setShow((current) => !current)}>
                    {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title={copied ? 'Copiada' : 'Copiar'}>
                  <IconButton size="small" color={copied ? 'success' : 'primary'} onClick={handleCopy}>
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ),
          }}
        />
      </Stack>
    </Paper>
  );
};

export default ApiKeyDisplay;
