import React, { useState } from 'react';
import {
  Box, Container, Typography, Button, Grid, Card, 
  CardContent, Paper, AppBar, Toolbar, Stack, Divider, 
  Chip, Switch, Avatar, Accordion, AccordionSummary, AccordionDetails,
  useTheme, useMediaQuery, IconButton
} from '@mui/material';
import { 
  WhatsApp, Speed, Security, Code, 
  CheckCircle, ArrowForward, RocketLaunch, 
  ExpandMore, Star, VerifiedUser, TrendingUp,
  Language
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import ApiConsole from '../components/ApiConsole';

const Landing = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Custom gradients
  const heroGradient = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
  const glowEffect = 'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.15) 0%, rgba(15, 23, 42, 0) 50%)';

  const features = [
    {
      title: "Integración en Minutos",
      desc: "SDKs listos para usar y una API RESTful documentada con ejemplos en tiempo real.",
      icon: <Code fontSize="large" sx={{ color: '#38bdf8' }} />
    },
    {
      title: "Escalabilidad Global",
      desc: "Infraestructura distribuida capaz de manejar millones de mensajes sin latencia.",
      icon: <Language fontSize="large" sx={{ color: '#818cf8' }} />
    },
    {
      title: "Seguridad Bancaria",
      desc: "Cifrado de extremo a extremo y cumplimiento estricto de normativas de privacidad.",
      icon: <Security fontSize="large" sx={{ color: '#34d399' }} />
    }
  ];

  return (
    <Box sx={{ bgcolor: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Navbar with Glassmorphism */}
      <AppBar 
        position="sticky" 
        color="transparent" 
        elevation={0} 
        sx={{ 
          backdropFilter: 'blur(10px)', 
          bgcolor: 'rgba(255,255,255,0.8)',
          borderBottom: '1px solid rgba(0,0,0,0.05)' 
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ py: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => navigate('/')}>
              <WhatsApp sx={{ color: 'primary.main', fontSize: 32 }} />
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'slate.900', letterSpacing: '-0.5px' }}>
                WA-API<span style={{ color: theme.palette.primary.main }}>PRO</span>
              </Typography>
            </Stack>

            {!isMobile && (
              <Stack direction="row" spacing={1} sx={{ mr: 4 }}>
                <Button color="inherit" sx={{ fontWeight: 600, color: '#64748b' }} onClick={() => navigate('/docs')}>Documentación</Button>
                <Button color="inherit" sx={{ fontWeight: 600, color: '#64748b' }} onClick={() => document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' })}>Precios</Button>
                <Button color="inherit" sx={{ fontWeight: 600, color: '#64748b' }} onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}>Características</Button>
              </Stack>
            )}

            <Stack direction="row" spacing={2}>
              <Button variant="outlined" sx={{ fontWeight: 700, borderRadius: '8px', border: '2px solid', borderColor: 'primary.light', color: 'primary.main', '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(56,189,248,0.05)' } }} onClick={() => navigate('/login')}>
                Ingresar
              </Button>
              <Button 
                variant="contained" 
                disableElevation
                sx={{ 
                  borderRadius: '8px', 
                  px: 3, 
                  fontWeight: 800, 
                  background: 'linear-gradient(90deg, #0ea5e9 0%, #2563eb 100%)',
                  boxShadow: '0 4px 14px 0 rgba(14, 165, 233, 0.39)'
                }} 
                onClick={() => navigate('/login', { state: { showRegister: true } })}
              >
                Comenzar Gratis
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Hero Section */}
      <Box sx={{ 
        pt: { xs: 8, md: 12 }, 
        pb: { xs: 12, md: 20 }, 
        bgcolor: '#0f172a', 
        color: 'white', 
        position: 'relative', 
        overflow: 'hidden' 
      }}>
        {/* Abstract Background Elements */}
        <Box sx={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', background: glowEffect, filter: 'blur(80px)', opacity: 0.6 }} />
        <Box sx={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(80px)', opacity: 0.5 }} />

        <Container maxWidth="xl">
          <Grid container spacing={8} alignItems="center">
            <Grid item xs={12} md={6} sx={{ zIndex: 1 }}>
              <Chip 
                icon={<RocketLaunch sx={{ fontSize: '1rem !important' }} />} 
                label="NUEVO: API V2.0 DISPONIBLE" 
                sx={{ 
                  bgcolor: 'rgba(56, 189, 248, 0.1)', 
                  color: '#38bdf8', 
                  fontWeight: 700, 
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  mb: 4
                }} 
              />
              <Typography variant="h1" sx={{ 
                fontWeight: 900, 
                fontSize: { xs: '2.8rem', md: '4.5rem' }, 
                mb: 3, 
                lineHeight: 1.1,
                letterSpacing: '-1px'
              }}>
                Infraestructura de mensajería para <span style={{ 
                  background: 'linear-gradient(to right, #38bdf8, #818cf8)', 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent' 
                }}>Desarrolladores Modernos</span>
              </Typography>
              <Typography variant="h6" sx={{ color: '#94a3b8', mb: 5, fontWeight: 400, maxWidth: 550, lineHeight: 1.6 }}>
                Conecta tu software con WhatsApp en minutos. Envía notificaciones OTP, alertas multimedia y soporte automatizado con una API diseñada para escalar.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button 
                  size="large" 
                  variant="contained" 
                  endIcon={<ArrowForward />}
                  sx={{ 
                    px: 4, 
                    py: 1.8, 
                    fontWeight: 800, 
                    fontSize: '1rem',
                    background: 'white',
                    color: '#0f172a',
                    '&:hover': { bgcolor: '#f1f5f9' }
                  }} 
                  onClick={() => navigate('/login', { state: { showRegister: true } })}
                >
                  Obtener API Key
                </Button>
                <Button 
                  size="large" 
                  variant="outlined" 
                  startIcon={<Code />}
                  sx={{ 
                    px: 4, 
                    py: 1.8, 
                    color: 'white', 
                    borderColor: 'rgba(255,255,255,0.2)',
                    fontWeight: 600,
                    '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.05)' }
                  }} 
                  onClick={() => navigate('/docs')}
                >
                  Ver Documentación
                </Button>
              </Stack>
              
              <Stack direction="row" spacing={3} sx={{ mt: 6, color: '#64748b', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircle sx={{ fontSize: 18, mr: 1, color: '#22c55e' }} /> Sin tarjeta de crédito
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircle sx={{ fontSize: 18, mr: 1, color: '#22c55e' }} /> 3 días de prueba Pro
                </Box>
              </Stack>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box sx={{ 
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: -20,
                  background: 'linear-gradient(180deg, rgba(56,189,248,0.2) 0%, rgba(0,0,0,0) 100%)',
                  transform: 'skewY(-2deg)',
                  borderRadius: 4,
                  zIndex: 0
                }
              }}>
                <Paper elevation={24} sx={{ 
                  position: 'relative', 
                  zIndex: 1, 
                  borderRadius: 3, 
                  overflow: 'hidden', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  bgcolor: '#1e293b'
                }}>
                  <ApiConsole mode="public" />
                </Paper>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Social Proof (Logos) */}
      <Box sx={{ py: 6, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
        <Container maxWidth="xl">
          <Typography variant="overline" display="block" align="center" sx={{ mb: 4, fontWeight: 800, color: '#94a3b8', letterSpacing: 2 }}>
            EMPRESAS QUE ESCALAN CON NOSOTROS
          </Typography>
          <Grid container spacing={4} justifyContent="center" alignItems="center" sx={{ opacity: 0.6, filter: 'grayscale(100%)' }}>
            {['ACME Corp', 'Global Logistics', 'FinTech IO', 'HealthPlus', 'DevStream'].map((name, i) => (
              <Grid item xs={6} md={2} key={i}>
                <Typography variant="h5" align="center" sx={{ fontWeight: 900, color: '#475569' }}>{name}</Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="xl" id="features" sx={{ py: 15 }}>
        <Box sx={{ textAlign: 'center', maxWidth: 700, mx: 'auto', mb: 10 }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800 }}>CARACTERÍSTICAS PRINCIPALES</Typography>
          <Typography variant="h2" sx={{ fontWeight: 900, mb: 3, color: '#0f172a' }}>Todo lo que necesitas para construir</Typography>
          <Typography variant="h6" color="text.secondary">
            Nuestra plataforma elimina la complejidad de WhatsApp, permitiéndote enfocarte en la experiencia de usuario.
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {features.map((f, i) => (
            <Grid item xs={12} md={4} key={i}>
              <Paper 
                elevation={0} 
                sx={{ 
                  p: 4, 
                  height: '100%', 
                  borderRadius: 4, 
                  bgcolor: '#f8fafc', 
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.3s ease',
                  '&:hover': { transform: 'translateY(-5px)', borderColor: 'primary.main', boxShadow: '0 10px 30px -10px rgba(14, 165, 233, 0.15)' }
                }}
              >
                <Box sx={{ 
                  width: 60, height: 60, borderRadius: 3, bgcolor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  mb: 3, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                }}>
                  {f.icon}
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>{f.title}</Typography>
                <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>{f.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Stats Section with Dark Theme */}
      <Box sx={{ bgcolor: '#0f172a', py: 12, color: 'white' }}>
        <Container maxWidth="xl">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h3" sx={{ fontWeight: 900, mb: 2 }}>Rendimiento en el que puedes confiar</Typography>
              <Typography sx={{ color: '#94a3b8', mb: 6, fontSize: '1.1rem' }}>
                Monitoreamos cada mensaje en tiempo real para asegurar la entrega.
              </Typography>
              
              <Stack spacing={4}>
                {[
                  { label: "Uptime Garantizado", value: "99.99%", desc: "SLA Empresarial disponible" },
                  { label: "Latencia Promedio", value: "< 200ms", desc: "Entrega instantánea global" },
                  { label: "Mensajes Diarios", value: "5M+", desc: "Procesados sin interrupciones" }
                ].map((stat, i) => (
                  <Box key={i}>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: '#38bdf8' }}>{stat.value}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{stat.label}</Typography>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>{stat.desc}</Typography>
                  </Box>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
               {/* Decorative Graphic */}
               <Box sx={{ 
                 height: 400, 
                 width: '100%', 
                 background: 'linear-gradient(135deg, rgba(56,189,248,0.1) 0%, rgba(56,189,248,0) 100%)',
                 borderRadius: 4,
                 border: '1px solid rgba(255,255,255,0.1)',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 position: 'relative'
               }}>
                 <Speed sx={{ fontSize: 120, color: '#38bdf8', opacity: 0.8 }} />
                 <Box sx={{ position: 'absolute', bottom: 40, left: 40, right: 40 }}>
                   <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 4, mb: 2, overflow: 'hidden' }}>
                     <Box sx={{ width: '92%', height: '100%', bgcolor: '#38bdf8' }} />
                   </Box>
                   <Stack direction="row" justifyContent="space-between">
                     <Typography variant="caption" sx={{ color: '#94a3b8' }}>System Load</Typography>
                     <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 700 }}>92% Optimal</Typography>
                   </Stack>
                 </Box>
               </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Pricing Section */}
      <Box id="pricing" sx={{ py: 15, bgcolor: '#f8fafc' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography variant="h3" sx={{ fontWeight: 900, mb: 2, color: '#0f172a' }}>Precios Transparentes</Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>Sin costos ocultos ni contratos a largo plazo.</Typography>
            
            <Box sx={{ display: 'inline-flex', bgcolor: 'white', p: 0.5, borderRadius: 3, border: '1px solid #e2e8f0' }}>
              <Button 
                variant={billingCycle === 'monthly' ? 'contained' : 'text'} 
                onClick={() => setBillingCycle('monthly')}
                sx={{ borderRadius: 2.5, px: 3, fontWeight: 700, boxShadow: billingCycle === 'monthly' ? 2 : 0 }}
              >
                Mensual
              </Button>
              <Button 
                variant={billingCycle === 'annual' ? 'contained' : 'text'} 
                onClick={() => setBillingCycle('annual')}
                sx={{ borderRadius: 2.5, px: 3, fontWeight: 700, boxShadow: billingCycle === 'annual' ? 2 : 0 }}
              >
                Anual (-20%)
              </Button>
            </Box>
          </Box>

          <Grid container spacing={4} justifyContent="center" alignItems="stretch">
            {/* Starter Plan */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 4, borderRadius: 4, height: '100%', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#64748b' }}>Free Trial</Typography>
                <Box sx={{ my: 2 }}>
                   <Typography variant="h3" sx={{ fontWeight: 900, display: 'inline' }}>$0</Typography>
                   <Typography variant="body1" color="text.secondary" sx={{ display: 'inline' }}>/3 días</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>Todo Premium gratis durante 3 días, sin tarjeta.</Typography>
                <Divider sx={{ mb: 4 }} />
                <Stack spacing={2} sx={{ mb: 4, flexGrow: 1 }}>
                  {['1 sesión de WhatsApp', 'Webhook de la sesión', 'Todos los endpoints', 'Texto, imágenes, audio, video y archivos'].map((item, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
                      <CheckCircle sx={{ fontSize: 20, mr: 1.5, color: '#cbd5e1' }} />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{item}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Button fullWidth variant="outlined" sx={{ py: 1.5, borderRadius: 2, fontWeight: 700, border: '2px solid' }} onClick={() => navigate('/login')}>
                  Comenzar
                </Button>
              </Paper>
            </Grid>

            {/* Pro Plan */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ 
                p: 4, borderRadius: 4, height: '100%', 
                bgcolor: '#0f172a', color: 'white', 
                display: 'flex', flexDirection: 'column',
                position: 'relative',
                boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.3)',
                transform: { md: 'scale(1.05)' },
                zIndex: 2
              }}>
                <Chip label="MÁS POPULAR" size="small" sx={{ position: 'absolute', top: 20, right: 20, bgcolor: '#38bdf8', color: '#0f172a', fontWeight: 800 }} />
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#38bdf8' }}>Premium</Typography>
                <Box sx={{ my: 2 }}>
                   <Typography variant="h3" sx={{ fontWeight: 900, display: 'inline' }}>${billingCycle === 'monthly' ? '3' : '29'}</Typography>
                   <Typography variant="body1" sx={{ color: '#94a3b8', display: 'inline' }}>/{billingCycle === 'monthly' ? 'mes' : 'año'}</Typography>
                </Box>
                <Typography variant="body2" sx={{ color: '#94a3b8', mb: 4 }}>La API completa para una línea de WhatsApp.</Typography>
                <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.1)' }} />
                <Stack spacing={2} sx={{ mb: 4, flexGrow: 1 }}>
                  {['3 sesiones de WhatsApp', 'Webhook independiente por sesión', 'Todos los endpoints', 'Texto, imágenes, audio, video y archivos'].map((item, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
                      <CheckCircle sx={{ fontSize: 20, mr: 1.5, color: '#38bdf8' }} />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{item}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Button fullWidth variant="contained" sx={{ py: 1.5, borderRadius: 2, fontWeight: 700, bgcolor: '#38bdf8', color: '#0f172a', '&:hover': { bgcolor: '#7dd3fc' } }} onClick={() => navigate('/login', { state: { showRegister: true } })}>
                  Elegir Premium
                </Button>
              </Paper>
            </Grid>

             {/* Enterprise Plan */}
             <Grid item xs={12} md={4}>
              <Paper sx={{ p: 4, borderRadius: 4, height: '100%', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#64748b' }}>Profesional</Typography>
                <Box sx={{ my: 2 }}>
                   <Typography variant="h3" sx={{ fontWeight: 900, display: 'inline' }}>${billingCycle === 'monthly' ? '7' : '67'}</Typography>
                   <Typography variant="body1" color="text.secondary" sx={{ display: 'inline' }}>/{billingCycle === 'monthly' ? 'mes' : 'año'}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>Diez líneas, API ampliada y herramientas comerciales.</Typography>
                <Divider sx={{ mb: 4 }} />
                <Stack spacing={2} sx={{ mb: 4, flexGrow: 1 }}>
                  {['Todo lo incluido en Premium', '10 sesiones simultáneas', 'Webhook separado por cada sesión', 'API de historial y llamadas', 'Bandeja de conversaciones', 'Campañas e importación de clientes'].map((item, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
                      <CheckCircle sx={{ fontSize: 20, mr: 1.5, color: '#cbd5e1' }} />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{item}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Button fullWidth variant="outlined" sx={{ py: 1.5, borderRadius: 2, fontWeight: 700, border: '2px solid' }}>
                  Elegir Profesional
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: 15, bgcolor: '#f8fafc' }}>
        <Container maxWidth="md">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800 }}>SOPORTE</Typography>
            <Typography variant="h3" sx={{ fontWeight: 900, mb: 2, color: '#0f172a' }}>Preguntas Frecuentes</Typography>
          </Box>
          <Stack spacing={2}>
            {[
              { q: '¿Cómo funciona la prueba de 3 días?', a: 'Al registrarte, recibes automáticamente todas las funciones del plan Premium durante 72 horas. No requiere tarjeta de crédito.' },
              { q: '¿Necesito mantener mi teléfono encendido?', a: 'No. Nuestra infraestructura utiliza la tecnología Multi-Device de WhatsApp, por lo que tu teléfono no necesita estar conectado una vez vinculada la sesión.' },
              { q: '¿Puedo enviar mensajes masivos?', a: 'Sí, pero debes respetar las políticas de SPAM de WhatsApp para evitar bloqueos. Nuestra API incluye herramientas para gestionar la velocidad de envío.' },
              { q: '¿Qué sucede si excedo el límite de mi plan?', a: 'El sistema pausará los envíos y recibirás una notificación. Puedes actualizar tu plan en cualquier momento desde el panel.' },
              { q: '¿Ofrecen reembolso?', a: 'Ofrecemos una garantía de devolución de 7 días si el servicio no cumple con tus expectativas técnicas.' }
            ].map((faq, i) => (
              <Accordion key={i} elevation={0} sx={{ bgcolor: 'white', borderRadius: '12px !important', '&:before': { display: 'none' }, border: '1px solid #e2e8f0' }}>
                <AccordionSummary expandMore={<ExpandMore sx={{ color: 'primary.main' }} />}>
                  <Typography sx={{ fontWeight: 700, color: '#1e293b' }}>{faq.q}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography color="text.secondary">{faq.a}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* CTA Final */}
      <Box sx={{ py: 10, bgcolor: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" sx={{ fontWeight: 900, mb: 3 }}>¿Listo para empezar?</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 5 }}>
            Únete a miles de desarrolladores que ya están construyendo el futuro de la comunicación.
          </Typography>
          <Button 
            variant="contained" 
            size="large"
            sx={{ 
              px: 6, py: 2, 
              borderRadius: 10, 
              fontSize: '1.2rem', 
              fontWeight: 800,
              boxShadow: '0 20px 40px -10px rgba(14, 165, 233, 0.4)'
            }}
            onClick={() => navigate('/login', { state: { showRegister: true } })}
          >
            Crear Cuenta Gratis
          </Button>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ py: 8, bgcolor: '#0f172a', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <Container maxWidth="xl">
          <Grid container spacing={8}>
            <Grid item xs={12} md={4}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <WhatsApp sx={{ color: 'white', fontSize: 28 }} />
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'white' }}>WA-API PRO</Typography>
              </Stack>
              <Typography variant="body2" sx={{ mb: 4, maxWidth: 300 }}>
                La plataforma de mensajería más confiable para desarrolladores y empresas en crecimiento.
              </Typography>
              <Stack direction="row" spacing={2}>
                {/* Social Icons Placeholder */}
                <Box sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                <Box sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                <Box sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
              </Stack>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 700, mb: 3 }}>PRODUCTO</Typography>
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Características</Typography>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Precios</Typography>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>API Docs</Typography>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Changelog</Typography>
              </Stack>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 700, mb: 3 }}>COMPAÑÍA</Typography>
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Acerca de</Typography>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Blog</Typography>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Carreras</Typography>
                <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { color: 'white' } }}>Legal</Typography>
              </Stack>
            </Grid>
          </Grid>
          <Divider sx={{ my: 8, borderColor: 'rgba(255,255,255,0.1)' }} />
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center">
            <Typography variant="body2">© 2026 Enterprise Messaging Solutions Inc.</Typography>
            <Stack direction="row" spacing={4} sx={{ mt: { xs: 2, md: 0 } }}>
              <Typography variant="body2">Privacidad</Typography>
              <Typography variant="body2">Términos</Typography>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

export default Landing;
