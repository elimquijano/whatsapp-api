import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, 
  Tabs, Tab, IconButton, CircularProgress, Stack,
  List, ListItemButton, ListItemText, TextField,
  useTheme
} from '@mui/material';
import { 
  PlayArrow, Code, Terminal, Wifi,
  InsertDriveFile, Image, Audiotrack, Videocam,
  History, DeleteSweep, PhoneDisabled, TaskAlt
} from '@mui/icons-material';
import { API_HOST, apiUrl } from '../utils/apiUrl';

const ApiConsole = ({ mode = 'public', userToken = null, sessionId = '' }) => {
  const theme = useTheme();
  const sessionSegment = encodeURIComponent(sessionId || 'SESSION_ID');
  const messagesBase = `/api/v1/sessions/${sessionSegment}/messages`;
  const [method, setMethod] = useState('POST');
  const [activeTab, setActiveTab] = useState(0); // 0: Body, 1: Auth, 2: Response
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState('Text Message');

  // Initial State
  const [endpoint, setEndpoint] = useState(`${messagesBase}/text`);
  const [body, setBody] = useState('');
  const requestUrl = apiUrl(endpoint);

  const collections = [
    {
      name: 'Text Message',
      method: 'POST',
      endpoint: `${messagesBase}/text`,
      icon: <Code fontSize="small" />,
      body: {
        recipient: "5215500000000",
        body: "Hello from WA-API PRO! 🚀"
      }
    },
    {
      name: 'Image (URL)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <Image fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "image",
        payload: "https://via.placeholder.com/150",
        caption: "Check this image!"
      }
    },
    {
      name: 'Image (Base64)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <Image fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "image",
        base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        mimetype: "image/png",
        caption: "Base64 Image"
      }
    },
    {
      name: 'Video (URL)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <Videocam fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "video",
        payload: "https://example.com/video.mp4",
        mimetype: "video/mp4",
        caption: "Video de la campaña"
      }
    },
    {
      name: 'Video (Base64)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <Videocam fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "video",
        base64: "AAAAIGZ0eXBpc29tLi4u",
        mimetype: "video/mp4",
        caption: "Video Base64"
      }
    },
    {
      name: 'Document (URL)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <InsertDriveFile fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "document",
        payload: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        filename: "invoice.pdf"
      }
    },
    {
      name: 'Audio (URL)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <Audiotrack fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "audio",
        payload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
      }
    },
    {
      name: 'Audio (Base64)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <Audiotrack fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "audio",
        base64: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMA==",
        mimetype: "audio/mpeg"
      }
    },
    {
      name: 'Document (Base64)',
      method: 'POST',
      endpoint: `${messagesBase}/media`,
      icon: <InsertDriveFile fontSize="small" />,
      body: {
        recipient: "5215500000000",
        type: "document",
        base64: "JVBERi0xLjQKJcTl8uXrCg==",
        mimetype: "application/pdf",
        filename: "oferta.pdf",
        caption: "Condiciones de la oferta"
      }
    },
    {
      name: 'Historial del chat',
      method: 'GET',
      endpoint: `/api/v1/sessions/${sessionSegment}/chats/521551234567/messages?limit=50`,
      icon: <History fontSize="small" />,
      body: null
    },
    {
      name: 'Eliminar mes',
      method: 'DELETE',
      endpoint: `/api/v1/sessions/${sessionSegment}/chats/521551234567/messages/month/2026-07`,
      icon: <DeleteSweep fontSize="small" />,
      body: null
    },
    {
      name: 'Estado de eliminación',
      method: 'GET',
      endpoint: `/api/v1/sessions/${sessionSegment}/message-deletion-jobs/UUID`,
      icon: <TaskAlt fontSize="small" />,
      body: null
    },
    {
      name: 'Rechazar llamada',
      method: 'POST',
      endpoint: `/api/v1/sessions/${sessionSegment}/calls/reject`,
      icon: <PhoneDisabled fontSize="small" />,
      body: {
        callId: "CALL_ID_DEL_WEBHOOK"
      }
    }
  ];

  // Load first collection item on mount
  useEffect(() => {
    setEndpoint(collections[0].endpoint);
    setMethod(collections[0].method);
    setBody(JSON.stringify(collections[0].body, null, 2));
    setSelectedRequest(collections[0].name);
    setResponse(null);
  }, [sessionId]);

  const handleSelectRequest = (item) => {
    setEndpoint(item.endpoint);
    setMethod(item.method);
    setBody(item.body ? JSON.stringify(item.body, null, 2) : '');
    setSelectedRequest(item.name);
    setResponse(null);
    setActiveTab(0);
  };

  const handleRun = async () => {
    setLoading(true);
    setActiveTab(2); // Switch to response tab
    
    if (mode === 'public') {
      setTimeout(() => {
        setLoading(false);
        setResponse({
          status: 200,
          time: '45ms',
          data: {
            success: true,
            message_id: "wamid.HBgLMTU1NTU1N...",
            status: "sent",
            timestamp: new Date().toISOString()
          }
        });
      }, 800);
      return;
    }

    // Actual API Call
    try {
      const startTime = Date.now();
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        }
      };
      if (!['GET', 'HEAD'].includes(method) && body.trim()) options.body = body;
      const res = await fetch(requestUrl, options);
      const data = await res.json();
      setLoading(false);
      setResponse({
        status: res.status,
        time: `${Date.now() - startTime}ms`,
        data: data
      });
    } catch (error) {
      setLoading(false);
      setResponse({
        status: 500,
        time: '0ms',
        data: { error: error.message }
      });
    }
  };

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        width: '100%', 
        height: { xs: 'auto', md: 600 },
        minHeight: { xs: 720, md: 600 },
        bgcolor: '#0f172a', // Slate 900
        color: '#e2e8f0',
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid #334155',
        fontFamily: '"Fira Code", monospace'
      }}
    >
      {/* Sidebar (Collections) */}
      <Box sx={{ 
        width: { xs: '100%', md: 220 },
        flexShrink: 0,
        borderRight: { xs: 0, md: '1px solid #334155' },
        borderBottom: { xs: '1px solid #334155', md: 0 },
        bgcolor: '#0b1120', 
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #334155', display: { xs: 'none', md: 'block' } }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, letterSpacing: 1 }}>COLLECTIONS</Typography>
        </Box>
        <List sx={{ p: { xs: 1, md: 0 }, display: { xs: 'flex', md: 'block' }, gap: { xs: 0.75, md: 0 }, overflowX: { xs: 'auto', md: 'hidden' }, overflowY: { xs: 'hidden', md: 'auto' } }}>
          {collections.map((item, index) => (
            <ListItemButton 
              key={index} 
              onClick={() => handleSelectRequest(item)}
              selected={selectedRequest === item.name}
              sx={{ 
                py: 1, 
                minWidth: { xs: 'max-content', md: 0 },
                borderRadius: { xs: 1.5, md: 0 },
                '&.Mui-selected': { bgcolor: 'rgba(56, 189, 248, 0.1)', borderLeft: '3px solid #38bdf8' },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
              }}
            >
              <Box sx={{ color: item.method === 'DELETE' ? '#f87171' : item.method === 'POST' ? '#f59e0b' : '#22c55e', mr: 1, display: 'flex' }}>
                {item.icon}
              </Box>
              <ListItemText 
                primary={item.name} 
                primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 500, color: '#e2e8f0' }} 
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Main Area */}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        
        {/* Window Header (Mac Style) */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          px: 2, py: 1.5, 
          bgcolor: '#1e293b', 
          borderBottom: '1px solid #334155'
        }}>
          <Stack direction="row" spacing={1} sx={{ mr: 2 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
          </Stack>
          <Typography sx={{ 
            fontSize: '0.8rem', 
            color: '#94a3b8', 
            fontFamily: 'monospace', 
            flexGrow: 1, 
            textAlign: 'center',
            opacity: 0.7
          }}>
            {API_HOST} — API console
          </Typography>
        </Box>

        {/* Address Bar / Actions */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          p: 2, 
          gap: 1.5,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          bgcolor: '#0f172a'
        }}>
          <Box sx={{ 
            px: 1, py: 0.5, 
            bgcolor: method === 'DELETE' ? '#f87171' : method === 'POST' ? '#f59e0b' : '#22c55e',
            color: '#0f172a', 
            borderRadius: 1, 
            fontSize: '0.75rem', 
            fontWeight: 800 
          }}>
            {method}
          </Box>
          <TextField
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            aria-label="Ruta del endpoint"
            variant="standard"
            InputProps={{ disableUnderline: true }}
            sx={{
            flexGrow: 1, 
            minWidth: 0,
            width: { xs: 'calc(100% - 72px)', sm: 'auto' },
            '& input': { fontFamily: 'monospace', fontSize: '0.9rem', color: '#cbd5e1' }
          }} />
          <Button 
            variant="contained" 
            size="small"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <PlayArrow />}
            onClick={handleRun}
            disabled={loading}
            sx={{ 
              bgcolor: '#22c55e', 
              color: '#064e3b', 
              fontWeight: 800,
              '&:hover': { bgcolor: '#4ade80' }
            }}
          >
            Run
          </Button>
        </Box>

        {/* Editor Area */}
        <Box sx={{ display: 'flex', flexGrow: 1, minHeight: { xs: 480, md: 0 } }}>
          {/* Sidebar Tabs */}
          <Box sx={{ 
            width: 50, 
            borderRight: '1px solid #334155', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            py: 2, 
            gap: 2 
          }}>
            <IconButton onClick={() => setActiveTab(0)} sx={{ color: activeTab === 0 ? '#38bdf8' : '#475569' }}>
              <Code fontSize="small" />
            </IconButton>
            <IconButton onClick={() => setActiveTab(1)} sx={{ color: activeTab === 1 ? '#38bdf8' : '#475569' }}>
              <Wifi fontSize="small" />
            </IconButton>
            <IconButton onClick={() => setActiveTab(2)} sx={{ color: activeTab === 2 ? '#38bdf8' : '#475569' }}>
              <Terminal fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ flexGrow: 1, p: 0, overflow: 'auto', bgcolor: '#0b1120' }}>
            {activeTab === 0 && (
              <Box sx={{ p: 2, height: '100%' }}>
                 <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    spellCheck="false"
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'transparent',
                      color: '#e2e8f0',
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      resize: 'none',
                      lineHeight: 1.5
                    }}
                 />
              </Box>
            )}

            {activeTab === 1 && (
              <Box sx={{ p: 3 }}>
                <Typography variant="caption" sx={{ color: '#64748b', mb: 1, display: 'block' }}>AUTHORIZATION</Typography>
                <Box sx={{ 
                  p: 2, 
                  border: '1px dashed #334155', 
                  borderRadius: 2, 
                  bgcolor: 'rgba(51, 65, 85, 0.3)' 
                }}>
                  <Typography sx={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Authorization: Bearer <span style={{ color: '#38bdf8' }}>{mode === 'public' ? 'sk_live_51M...' : (userToken ? `${userToken.substring(0, 10)}...` : '...')}</span>
                  </Typography>
                </Box>
              </Box>
            )}

            {activeTab === 2 && (
              <Box sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ 
                  px: 2, py: 1, 
                  borderBottom: '1px solid #334155', 
                  bgcolor: '#1e293b', 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700 }}>RESPONSE</Typography>
                  {response && (
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography variant="caption" sx={{ color: '#22c55e' }}>{response.status} OK</Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>{response.time}</Typography>
                    </Box>
                  )}
                </Box>
                
                <Box sx={{ p: 2, flexGrow: 1, overflow: 'auto', color: '#a5b4fc' }}>
                  {response ? (
                    <pre style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {JSON.stringify(response.data, null, 2)}
                    </pre>
                  ) : (
                    <Box sx={{ 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      opacity: 0.3 
                    }}>
                      <Terminal sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="body2">Waiting for request...</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        {/* Footer Status Bar */}
        <Box sx={{ 
          px: 2, py: 0.5, 
          bgcolor: '#38bdf8', 
          color: '#0f172a', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>CONNECTED</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>v2.4.0</Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default ApiConsole;
