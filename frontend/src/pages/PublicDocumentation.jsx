import React, { useState } from 'react';
import { 
  Box, Container, Typography, AppBar, Toolbar, IconButton, Button, Stack, 
  Grid, Paper, List, ListItem, ListItemButton, ListItemText, Divider, Chip
} from '@mui/material';
import { ArrowBack, Menu as MenuIcon, Code, Webhook, Security, Send, Description } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CodeBlock = ({ code, language = 'json' }) => (
  <Paper 
    variant="outlined" 
    sx={{ 
      p: 2, 
      bgcolor: '#0f172a', 
      color: '#e2e8f0', 
      borderRadius: 2, 
      fontFamily: '"Fira Code", monospace', 
      fontSize: '0.85rem',
      overflowX: 'auto',
      my: 2,
      border: '1px solid #334155'
    }}
  >
    <pre style={{ margin: 0 }}>{code}</pre>
  </Paper>
);

const Section = ({ id, title, children }) => (
  <Box id={id} sx={{ mb: 8, scrollMarginTop: '100px' }}>
    <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, color: '#0f172a' }}>{title}</Typography>
    <Divider sx={{ mb: 4 }} />
    {children}
  </Box>
);

const PublicDocumentation = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sections = [
    { id: 'intro', label: 'Introducción' },
    { id: 'auth', label: 'Autenticación' },
    { id: 'messages-text', label: 'Mensajes de Texto' },
    { id: 'messages-media-url', label: 'Media (URL)' },
    { id: 'messages-media-base64', label: 'Media (Base64)' },
    { id: 'messages-doc-url', label: 'Documentos (URL)' },
    { id: 'messages-doc-base64', label: 'Documentos (Base64)' },
    { id: 'messages-audio', label: 'Audio / Voz' },
    { id: 'webhooks', label: 'Webhooks' },
  ];

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #e2e8f0', zIndex: 1200 }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters>
            <IconButton onClick={() => navigate('/')} sx={{ mr: 2 }}><ArrowBack /></IconButton>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f172a', flexGrow: 1 }}>
              WA-API <span style={{ color: '#0ea5e9' }}>DOCS</span>
            </Typography>
            <Stack direction="row" spacing={2} sx={{ display: { xs: 'none', md: 'flex' } }}>
              {user ? (
                <Button variant="contained" onClick={() => navigate('/dashboard')}>Ir al Panel</Button>
              ) : (
                <Button variant="contained" onClick={() => navigate('/login')}>Login / Registro</Button>
              )}
            </Stack>
            <IconButton sx={{ display: { xs: 'flex', md: 'none' } }} onClick={() => setMobileOpen(!mobileOpen)}>
              <MenuIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="xl" sx={{ flexGrow: 1, display: 'flex', pt: 4 }}>
        {/* Sidebar */}
        <Box sx={{ 
          width: 280, 
          flexShrink: 0, 
          position: { xs: 'fixed', md: 'sticky' }, 
          top: { xs: 64, md: 80 }, 
          height: 'calc(100vh - 80px)', 
          bgcolor: '#f8fafc', 
          borderRight: { md: '1px solid #e2e8f0' },
          overflowY: 'auto',
          display: { xs: mobileOpen ? 'block' : 'none', md: 'block' },
          zIndex: 1100,
          left: 0,
          pl: 2,
          pr: 4
        }}>
          <Typography variant="overline" sx={{ fontWeight: 800, color: '#64748b', mb: 2, display: 'block' }}>CONTENIDO</Typography>
          <List>
            {sections.map((s) => (
              <ListItemButton key={s.id} onClick={() => scrollTo(s.id)} sx={{ borderRadius: 2, mb: 0.5 }}>
                <ListItemText primary={s.label} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Main Content */}
        <Box sx={{ flexGrow: 1, px: { xs: 0, md: 6 }, pb: 10, maxWidth: '100%' }}>
          
          <Section id="intro" title="Introducción">
            <Typography paragraph>
              Bienvenido a la documentación oficial de WA-API PRO. Nuestra API RESTful te permite enviar mensajes de WhatsApp de manera programática, gestionar sesiones y recibir eventos en tiempo real.
            </Typography>
            <Box sx={{ p: 2, bgcolor: '#e0f2fe', borderRadius: 2, border: '1px solid #bae6fd', color: '#0369a1' }}>
              <Typography variant="body2" fontWeight={600}>
                Base URL: <code style={{ background: 'rgba(255,255,255,0.5)', padding: '2px 6px', borderRadius: 4 }}>https://api.tudominio.com</code>
              </Typography>
            </Box>
          </Section>

          <Section id="auth" title="Autenticación">
            <Typography paragraph>
              Todas las peticiones a la API deben incluir el encabezado <code>Authorization</code> con tu token Bearer.
            </Typography>
            <CodeBlock code={`Authorization: Bearer YOUR_API_TOKEN`} />
          </Section>

          <Section id="messages-text" title="1. Mensajes de Texto">
            <Typography paragraph>Envía mensajes de texto simples a cualquier número de WhatsApp.</Typography>
            <Chip label="POST" color="warning" size="small" sx={{ mr: 1, fontWeight: 800 }} /> 
            <code style={{ fontWeight: 600 }}>/api/v1/messages/text</code>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Body (JSON)</Typography>
            <CodeBlock code={`{
  "recipient": "5215500000000", // Código país + número (sin +)
  "body": "Hola, este es un mensaje de prueba.",
  "account_id": "session_id_opcional" // Si tienes múltiples sesiones
}`} />
          </Section>

          <Section id="messages-media-url" title="2. Media vía URL (Imagen/Video)">
            <Typography paragraph>Envía imágenes o videos proporcionando una URL pública accesible.</Typography>
            <Chip label="POST" color="warning" size="small" sx={{ mr: 1, fontWeight: 800 }} /> 
            <code style={{ fontWeight: 600 }}>/api/v1/messages/media</code>

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Body (JSON)</Typography>
            <CodeBlock code={`{
  "recipient": "5215500000000",
  "type": "image", // o "video"
  "payload": "https://example.com/imagen.jpg",
  "caption": "Mira esta imagen increíble"
}`} />
          </Section>

          <Section id="messages-media-base64" title="3. Media vía Base64">
            <Typography paragraph>Envía archivos multimedia codificados directamente en el cuerpo de la petición. Ideal para archivos locales.</Typography>
            <Chip label="POST" color="warning" size="small" sx={{ mr: 1, fontWeight: 800 }} /> 
            <code style={{ fontWeight: 600 }}>/api/v1/messages/media</code>

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Body (JSON)</Typography>
            <CodeBlock code={`{
  "recipient": "5215500000000",
  "type": "image",
  "payload": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...",
  "caption": "Imagen subida desde base64"
}`} />
          </Section>

          <Section id="messages-doc-url" title="4. Documentos vía URL">
            <Typography paragraph>Envía PDFs, Excels, Word, etc., mediante URL.</Typography>
            <Chip label="POST" color="warning" size="small" sx={{ mr: 1, fontWeight: 800 }} /> 
            <code style={{ fontWeight: 600 }}>/api/v1/messages/media</code>

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Body (JSON)</Typography>
            <CodeBlock code={`{
  "recipient": "5215500000000",
  "type": "document",
  "payload": "https://example.com/factura.pdf",
  "filename": "Factura_123.pdf" // Importante para que el usuario vea el nombre
}`} />
          </Section>

          <Section id="messages-doc-base64" title="5. Documentos vía Base64">
            <Typography paragraph>Envía documentos codificados en Base64.</Typography>
            <Chip label="POST" color="warning" size="small" sx={{ mr: 1, fontWeight: 800 }} /> 
            <code style={{ fontWeight: 600 }}>/api/v1/messages/media</code>

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Body (JSON)</Typography>
            <CodeBlock code={`{
  "recipient": "5215500000000",
  "type": "document",
  "payload": "data:application/pdf;base64,JVBERi0xLjQKJ...",
  "filename": "Reporte_Mensual.pdf"
}`} />
          </Section>

          <Section id="messages-audio" title="6. Audio / Notas de Voz">
            <Typography paragraph>
              Envía audios. Si el formato es compatible (mp3, ogg), se puede enviar como PTT (Push To Talk - nota de voz).
            </Typography>
            <Chip label="POST" color="warning" size="small" sx={{ mr: 1, fontWeight: 800 }} /> 
            <code style={{ fontWeight: 600 }}>/api/v1/messages/media</code>

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Body (JSON)</Typography>
            <CodeBlock code={`{
  "recipient": "5215500000000",
  "type": "audio",
  "payload": "https://example.com/audio.mp3" 
  // O base64: "data:audio/mp3;base64,..."
}`} />
          </Section>

          <Section id="webhooks" title="Webhooks (Eventos en Tiempo Real)">
            <Typography paragraph>
              Configura un endpoint HTTPS en tu servidor para recibir notificaciones instantáneas de mensajes entrantes.
              Puedes configurar tu URL en el Panel de Control.
            </Typography>

            <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Estructura del Evento</Typography>
            <Typography paragraph>Tu servidor recibirá un POST con el siguiente JSON:</Typography>
            
            <CodeBlock code={`{
  "event": "message.received",
  "instanceId": "session_12345",
  "data": {
    "id": "3EB0...",
    "from": "521551234567@s.whatsapp.net",
    "to": "5215500000000@s.whatsapp.net",
    "pushName": "Juan Pérez",
    "message": {
      "conversation": "Hola, quiero información"
    },
    "timestamp": 1680000000,
    "fromMe": false
  }
}`} />
            <Box sx={{ p: 2, mt: 2, bgcolor: '#fff7ed', borderRadius: 2, border: '1px solid #ffedd5', color: '#9a3412' }}>
              <Typography variant="body2">
                <strong>Nota:</strong> Asegúrate de que tu endpoint responda con un status 200 OK rápidamente para evitar reintentos.
              </Typography>
            </Box>
          </Section>

        </Box>
      </Container>
    </Box>
  );
};

export default PublicDocumentation;