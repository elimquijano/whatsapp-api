import React from 'react';
import { Alert, Box } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import AiCrmConfig from '../components/AiCrmConfig';

const AiCrmConfigPage = () => {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();

  if (!sessionId) return <Alert severity="error">No se indicó una sesión de WhatsApp.</Alert>;

  return (
    <Box sx={{ minWidth: 0, minHeight: '100%' }}>
      <AiCrmConfig
        variant="page"
        open
        sessionId={sessionId}
        onClose={() => navigate(`/dashboard/sessions/${encodeURIComponent(sessionId)}/crm`)}
      />
    </Box>
  );
};

export default AiCrmConfigPage;
