import React, { useState } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, 
  Divider, List, ListItem, ListItemButton, ListItemText,
  Chip, Tabs, Tab, IconButton, CircularProgress, AppBar, Toolbar, Container, Stack
} from '@mui/material';
import { 
  Send, ContentCopy, Folder, ArrowBack, Terminal
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/apiUrl';
import { useNavigate } from 'react-router-dom';

const Documentation = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMethod, setSelectedMethod] = useState('POST');
  const [url, setUrl] = useState(apiUrl('/api/v1/messages/text'));
  const [activeTab, setActiveTab] = useState(0);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const token = user ? (localStorage.getItem('token') || 'LOGUEADO_PERO_SIN_TOKEN') : 'TU_API_TOKEN_AQUÍ';

  const allEndpoints = [
    { 
      method: 'POST', 
      path: '/api/v1/messages/text', 
      name: 'Text Messaging', 
      feature: 'text', 
      body: { 
        recipient: "5493511234567", 
        body: "Hello! This is a professional message." 
      } 
    },
    { 
      method: 'POST', 
      path: '/api/v1/messages/media', 
      name: 'Send Image (URL)', 
      feature: 'media', 
      body: { 
        recipient: "5493511234567", 
        type: "image",
        payload: "https://example.com/image.jpg", 
        caption: "Check this out" 
      } 
    },
    { 
      method: 'POST', 
      path: '/api/v1/messages/media', 
      name: 'Send Image (Base64)', 
      feature: 'media', 
      body: { 
        recipient: "5493511234567", 
        type: "image",
        payload: "data:image/jpeg;base64,/9j/4AAQSkZJRg...", 
        caption: "High quality encoded image" 
      } 
    },
        { 
          method: 'POST', 
          path: '/api/v1/messages/media', 
          name: 'Send Document (URL)', 
          feature: 'files', 
          body: { 
            recipient: "5493511234567", 
            type: "document",
            payload: "https://example.com/file.pdf", 
            filename: "e-ticket.pdf" 
          } 
        },
        { 
          method: 'POST', 
          path: '/api/v1/messages/media', 
          name: 'Send Document (Base64)', 
          feature: 'files', 
          body: { 
            recipient: "5493511234567", 
            type: "document",
            payload: "data:application/pdf;base64,JVBERi0xLjQK...", 
            filename: "invoice_2024.pdf" 
          } 
        },
        { 
          method: 'POST', 
          path: '/api/v1/messages/media', 
          name: 'Send Audio (URL)', 
          feature: 'media', 
          body: { 
            recipient: "5493511234567", 
            type: "audio",
            payload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
          } 
        },
        { 
          method: 'POST', 
          path: '/api/v1/messages/media', 
          name: 'Send Audio (Base64)', 
          feature: 'media', 
          body: { 
            recipient: "5493511234567", 
            type: "audio",
            payload: "data:audio/mp3;base64,SUQzBAAAAAAA..."
          } 
        },
      ];
  const userFeatures = user?.planData?.features || ['text', 'media', 'files'];
  const endpoints = allEndpoints.filter(ep => !user || userFeatures.includes(ep.feature) || user?.role === 'admin');

  const [body, setBody] = useState(JSON.stringify(endpoints[0]?.body || {}, null, 2));

  const handleEndpointSelect = (ep) => {
    setSelectedMethod(ep.method);
    setUrl(apiUrl(ep.path));
    setBody(ep.method === 'GET' ? '' : JSON.stringify(ep.body || {}, null, 2));
    setResponse(null);
  };

  const handleSend = async () => {
    if (!user) {
      alert("Inicia sesión para probar la API con tu cuenta real.");
      return;
    }
    setLoading(true);
    setResponse(null);
    const start = Date.now();
    try {
      const options = {
        method: selectedMethod,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      };
      if (selectedMethod !== 'GET') options.body = body;

      const res = await fetch(url, options);
      const data = await res.json();
      setResponse({ status: res.status, statusText: res.statusText, data, time: Date.now() - start });
    } catch (err) {
      setResponse({ status: 500, data: { error: err.message }, time: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #e2e8f0' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters>
            <IconButton onClick={() => navigate('/')} sx={{ mr: 2 }}><ArrowBack /></IconButton>
            <Typography variant="h6" sx={{ fontWeight: 900, color: 'primary.main', flexGrow: 1 }}>
              WA-API <span style={{ color: '#0f172a' }}>DOCS</span>
            </Typography>
            {user ? (
              <Button variant="contained" onClick={() => navigate('/dashboard')}>Ir al Panel</Button>
            ) : (
              <Stack direction="row" spacing={2}>
                <Button onClick={() => navigate('/login')}>Login</Button>
                <Button variant="contained" onClick={() => navigate('/login')}>Sign Up</Button>
              </Stack>
            )}
          </Toolbar>
        </Container>
      </AppBar>

      <Box sx={{ flexGrow: 1, p: { xs: 1, md: 4 }, display: 'flex', justifyContent: 'center' }}>
        <Paper sx={{ display: 'flex', width: '100%', maxWidth: '1600px', height: 'calc(100vh - 160px)', borderRadius: 3, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
          {/* Sidebar */}
          <Box sx={{ width: 280, borderRight: '1px solid #e2e8f0', bgcolor: '#f1f5f9', display: { xs: 'none', md: 'block' } }}>
            <Box sx={{ p: 2.5, borderBottom: '1px solid #e2e8f0' }}>
              <Typography variant="overline" sx={{ fontWeight: 800, color: '#64748b' }}>Messaging V1</Typography>
            </Box>
            <List sx={{ p: 1 }}>
              {endpoints.map((ep) => (
                <ListItem disablePadding key={ep.name} sx={{ mb: 0.5 }}>
                  <ListItemButton 
                    onClick={() => handleEndpointSelect(ep)}
                    selected={url.includes(ep.path) && ep.name === endpoints.find(e => url.includes(e.path))?.name}
                    sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } }}
                  >
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 900, color: ep.method === 'POST' ? '#f59e0b' : '#10b981', width: 35 }}>{ep.method}</Typography>
                    <ListItemText primary={ep.name} primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 600 }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Core */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', gap: 1, borderBottom: '1px solid #e2e8f0' }}>
              <Chip label={selectedMethod} size="small" sx={{ borderRadius: 1, fontWeight: 900, bgcolor: '#0f172a', color: 'white' }} />
              <TextField fullWidth size="small" value={url} InputProps={{ readOnly: true, sx: { fontSize: '0.85rem', fontFamily: 'monospace', bgcolor: '#f8fafc' } }} />
              <Button variant="contained" onClick={handleSend} disabled={loading} sx={{ px: 4 }}>{loading ? <CircularProgress size={20} /> : 'Send'}</Button>
            </Box>

            <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: '1px solid #e2e8f0', minHeight: 40 }}>
                <Tab label="Auth & Headers" sx={{ fontSize: '0.7rem', minHeight: 40 }} />
                <Tab label="Body (JSON)" sx={{ fontSize: '0.7rem', minHeight: 40 }} />
              </Tabs>

              <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto' }}>
                {activeTab === 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b' }}>AUTHENTICATION</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: '#f8fafc', position: 'relative' }}>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>Bearer {token}</Typography>
                      <IconButton size="small" sx={{ position: 'absolute', right: 5, top: 5 }} onClick={() => { navigator.clipboard.writeText(`Bearer ${token}`); alert('Copied'); }}><ContentCopy fontSize="inherit" /></IconButton>
                    </Paper>
                  </Box>
                )}
                {activeTab === 1 && (
                  <TextField fullWidth multiline rows={12} value={body} onChange={(e) => setBody(e.target.value)} sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '0.85rem' } }} />
                )}
              </Box>

              <Box sx={{ height: '40%', borderTop: '2px solid #e2e8f0', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="overline" sx={{ fontWeight: 800 }}>Response</Typography>
                  {response && <Typography variant="caption" sx={{ fontWeight: 700, color: '#10b981' }}>{response.status} {response.statusText} • {response.time}ms</Typography>}
                </Box>
                <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
                  {response ? (
                    <pre style={{ margin: 0, fontSize: '0.8rem', fontFamily: 'monospace' }}>{JSON.stringify(response.data, null, 2)}</pre>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 4, opacity: 0.3 }}>
                      <Terminal sx={{ fontSize: 40 }} />
                      <Typography variant="body2">Hit Send to get a response</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default Documentation;
