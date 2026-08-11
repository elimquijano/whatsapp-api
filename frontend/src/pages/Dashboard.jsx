import React, { lazy, Suspense, useState } from 'react';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  Grid,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AutoAwesome,
  Code as CodeIcon,
  Dashboard as DashboardIcon,
  DarkMode,
  LightMode,
  Logout,
  Menu as MenuIcon,
  People,
  WhatsApp,
} from '@mui/icons-material';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useColorMode } from '../context/ColorModeContext';

const WhatsAppConnector = lazy(() => import('../components/WhatsAppConnector'));
const MessageSender = lazy(() => import('../components/MessageSender'));
const SessionWorkspace = lazy(() => import('../components/SessionWorkspace'));
const ApiKeyDisplay = lazy(() => import('../components/ApiKeyDisplay'));
const Users = lazy(() => import('./Users'));
const CrmInbox = lazy(() => import('./CrmInbox'));
const Campaigns = lazy(() => import('./Campaigns'));
const AiCrmConfigPage = lazy(() => import('./AiCrmConfigPage'));
const SessionApiPage = lazy(() => import('./SessionApiPage'));

const SIDEBAR_WIDTH = 276;

const LegacyAiRedirect = () => {
  const { sessionId = '' } = useParams();
  return <Navigate to={`/dashboard/sessions/${encodeURIComponent(sessionId)}/ai`} replace />;
};

const PageIntro = ({ eyebrow, title, description, action }) => (
  <Stack
    direction={{ xs: 'column', sm: 'row' }}
    alignItems={{ xs: 'flex-start', sm: 'center' }}
    justifyContent="space-between"
    spacing={2}
    sx={{ mb: { xs: 2.5, md: 3.5 } }}
  >
    <Box sx={{ minWidth: 0 }}>
      {eyebrow && (
        <Typography variant="overline" color="primary.main" sx={{ fontWeight: 850, letterSpacing: 1.2 }}>
          {eyebrow}
        </Typography>
      )}
      <Typography variant="h4" sx={{ fontSize: { xs: '1.65rem', md: '2rem' } }}>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: 0.6, maxWidth: 720 }}>{description}</Typography>}
    </Box>
    {action}
  </Stack>
);

const SubscriptionCard = ({ user }) => {
  const planName = user?.planData?.name || user?.plan || 'Sin plan';
  const expiration = user?.expirationDate ? new Date(user.expirationDate).toLocaleDateString() : 'Sin vencimiento';
  const professional = user?.planData?.features?.includes('ai_crm');

  return (
    <Paper
      sx={(theme) => ({
        p: 3,
        color: '#f8fafc',
        background: `linear-gradient(145deg, ${theme.palette.mode === 'dark' ? '#172554' : '#0f172a'} 0%, #172033 54%, #0c4a6e 100%)`,
        border: `1px solid ${alpha('#38bdf8', 0.22)}`,
        overflow: 'hidden',
        position: 'relative',
      })}
    >
      <Box sx={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', bgcolor: alpha('#38bdf8', 0.12), top: -72, right: -38 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ position: 'relative' }}>
        <Box>
          <Typography variant="overline" sx={{ color: '#7dd3fc', fontWeight: 800, letterSpacing: 1.1 }}>Tu suscripción</Typography>
          <Typography variant="h5" sx={{ mt: 0.25 }}>{planName}</Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: alpha('#f8fafc', 0.7) }}>Vigencia: {expiration}</Typography>
        </Box>
        <AutoAwesome sx={{ color: '#7dd3fc' }} />
      </Stack>
      {professional && <Typography variant="body2" sx={{ mt: 3, color: '#bae6fd', position: 'relative' }}>CRM, campañas y agentes se administran desde cada sesión.</Typography>}
    </Paper>
  );
};

const DashboardHome = ({ user }) => (
  <Box>
    <PageIntro
      eyebrow="Centro de operaciones"
      title={`Hola${user?.username ? `, ${user.username}` : ''}`}
      description="Conecta tus sesiones, supervisa su estado y gestiona tus conversaciones desde un solo lugar."
      action={<Chip icon={<WhatsApp />} color="success" variant="outlined" label="Canal WhatsApp" />}
    />
    <Grid container spacing={{ xs: 2, md: 3 }} alignItems="flex-start">
      <Grid item xs={12} xl={9} sx={{ minWidth: 0 }}>
        <WhatsAppConnector />
      </Grid>
      <Grid item xs={12} xl={3} sx={{ minWidth: 0 }}>
        <Stack spacing={{ xs: 2, md: 3 }}>
          <SubscriptionCard user={user} />
        </Stack>
      </Grid>
    </Grid>
  </Box>
);

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { mode, toggleMode } = useColorMode();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPlanExpired = user?.expirationDate && new Date() > new Date(user.expirationDate);
  const hasCrm = user?.planData?.features?.includes('ai_crm');

  const menuItems = [
    { text: 'Panel de control', icon: <DashboardIcon />, path: '/dashboard' },
    { text: 'Documentación API', icon: <CodeIcon />, path: '/dashboard/docs' },
    ...(user?.role === 'admin' ? [{ text: 'Usuarios', icon: <People />, path: '/dashboard/users' }] : []),
  ];

  const selected = (path) => path === '/dashboard'
    ? location.pathname === path || location.pathname === `${path}/`
    : location.pathname.startsWith(path);
  const activeItem = location.pathname.startsWith('/dashboard/sessions/')
    ? { text: 'Espacio de sesión' }
    : [...menuItems].reverse().find((item) => selected(item.path));
  const workspace = location.pathname.startsWith('/dashboard/sessions/');

  const goTo = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const drawerContent = (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'surface.sidebar', color: '#e2e8f0' }}>
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 2.5, height: 72, flexShrink: 0 }}>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 2.5, background: 'linear-gradient(135deg, #0ea5e9, #2563eb)' }}>
          <WhatsApp sx={{ fontSize: 22, color: 'white' }} />
        </Box>
        <Box>
          <Typography sx={{ color: 'white', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em' }}>WA API</Typography>
          <Typography variant="caption" sx={{ color: '#7dd3fc', fontWeight: 800, letterSpacing: 1 }}>CRM PRO</Typography>
        </Box>
      </Stack>
      <Divider sx={{ borderColor: alpha('#94a3b8', 0.16) }} />
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', py: 2 }}>
        <Typography variant="overline" sx={{ display: 'block', px: 2.5, mb: 0.75, color: '#64748b', fontWeight: 800, letterSpacing: 1.2 }}>
          Navegación
        </Typography>
        <List disablePadding sx={{ px: 1.5 }}>
          {menuItems.map((item) => {
            const isSelected = selected(item.path);
            return (
              <ListItemButton
                key={item.path}
                selected={isSelected}
                onClick={() => goTo(item.path)}
                sx={{
                  minHeight: 46,
                  mb: 0.5,
                  px: 1.5,
                  borderRadius: 2.5,
                  color: isSelected ? '#ffffff' : '#a8b3c5',
                  '&.Mui-selected': { bgcolor: alpha('#0ea5e9', 0.17), '&:hover': { bgcolor: alpha('#0ea5e9', 0.22) } },
                  '&:hover': { bgcolor: alpha('#ffffff', 0.055), color: '#ffffff' },
                }}
              >
                <ListItemIcon sx={{ color: isSelected ? '#38bdf8' : 'inherit', minWidth: 38 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: 14, fontWeight: isSelected ? 800 : 600 }} />
                {isSelected && <Box sx={{ width: 4, height: 22, borderRadius: 4, bgcolor: 'primary.main' }} />}
              </ListItemButton>
            );
          })}
        </List>
      </Box>
      <Box sx={{ p: 1.5, flexShrink: 0 }}>
        <Paper sx={{ p: 1.5, bgcolor: alpha('#ffffff', 0.055), color: 'inherit', border: `1px solid ${alpha('#94a3b8', 0.14)}`, boxShadow: 'none' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Avatar sx={{ width: 35, height: 35, bgcolor: isPlanExpired ? 'error.main' : 'primary.main', fontSize: 14, fontWeight: 800 }}>
              {(user?.username?.[0] || 'U').toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap sx={{ color: 'white', fontWeight: 800 }}>{user?.username}</Typography>
              <Typography variant="caption" noWrap sx={{ color: '#94a3b8', display: 'block' }}>{user?.planData?.name || user?.plan || user?.role}</Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ height: '100dvh', display: 'flex', overflow: 'hidden', bgcolor: 'background.default' }}>
      {desktop ? (
        <Box component="aside" sx={{ width: SIDEBAR_WIDTH, height: '100%', flexShrink: 0, overflow: 'hidden' }}>{drawerContent}</Box>
      ) : (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: 'min(86vw, 304px)', overflow: 'hidden', border: 0 } }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AppBar
          position="static"
          color="transparent"
          elevation={0}
          sx={{ flexShrink: 0, bgcolor: alpha(theme.palette.background.paper, 0.84), backdropFilter: 'blur(16px)', borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Toolbar sx={{ minHeight: { xs: 62, md: 70 }, px: { xs: 1.5, sm: 2.5, lg: 3.5 } }}>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ mr: 1, display: { md: 'none' } }} aria-label="Abrir menú">
              <MenuIcon />
            </IconButton>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" noWrap sx={{ fontSize: { xs: 16, sm: 18 } }}>{activeItem?.text || 'Panel'}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
                Administra tu operación de WhatsApp
              </Typography>
            </Box>
            <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} alignItems="center">
              <Tooltip title={mode === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}>
                <IconButton onClick={toggleMode} aria-label="Cambiar tema" sx={{ border: '1px solid', borderColor: 'divider' }}>
                  {mode === 'dark' ? <LightMode /> : <DarkMode />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Cuenta">
                <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} size="small" sx={{ ml: 0.5 }}>
                  <Avatar sx={{ width: 38, height: 38, bgcolor: isPlanExpired ? 'error.main' : 'primary.main', fontWeight: 800 }}>
                    {(user?.username?.[0] || 'U').toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
            </Stack>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <Box sx={{ px: 2, py: 1, minWidth: 190 }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{user?.username}</Typography>
                <Typography variant="caption" color="text.secondary">{user?.role}</Typography>
              </Box>
              <Divider />
              <MenuItem onClick={() => { setAnchorEl(null); logout(); }}><Logout sx={{ mr: 1.25, fontSize: 20 }} /> Cerrar sesión</MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: workspace ? 'hidden' : 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <Container
            maxWidth={workspace ? false : 'xl'}
            disableGutters={workspace}
            sx={{
              height: workspace ? '100%' : 'auto',
              minHeight: workspace ? 0 : '100%',
              display: workspace ? 'flex' : 'block',
              flexDirection: workspace ? 'column' : undefined,
              overflow: workspace ? 'hidden' : 'visible',
              px: workspace ? 0 : { xs: 2, sm: 2.5, lg: 3.5 },
              py: workspace ? 0 : { xs: 2.5, md: 3.5 },
            }}
          >
            {isPlanExpired && (
              <Alert severity="error" sx={{ mb: workspace ? 0 : 3, borderRadius: workspace ? 0 : 2, flexShrink: 0 }}>
                Tu suscripción venció. Contacta a soporte para renovarla y reactivar la automatización.
              </Alert>
            )}
            <Suspense fallback={<Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={32} /></Stack>}>
              <Routes>
              <Route path="/" element={<DashboardHome user={user} />} />
              <Route path="/docs" element={(
                <Box>
                  <PageIntro eyebrow="Desarrolladores" title="Credenciales y documentación API" description="Copia la credencial de tu cuenta. Las pruebas interactivas se abren desde una sesión concreta." />
                  <ApiKeyDisplay />
                  <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2 }}>
                    <Typography variant="h6">La sesión siempre es explícita</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Entra a una sesión desde el panel y abre su sección API para probar endpoints sin riesgo de enviar desde otro número.
                    </Typography>
                  </Paper>
                </Box>
              )} />
              <Route path="/users" element={user?.role === 'admin' ? <Users /> : <Navigate to="/dashboard" />} />
              <Route path="/sessions/:sessionId" element={<SessionWorkspace />}>
                <Route index element={<Navigate to="send" replace />} />
                <Route path="send" element={<Box sx={{ p: { xs: 1.5, sm: 2, lg: 2.5 } }}><MessageSender /></Box>} />
                <Route path="api" element={<SessionApiPage />} />
                <Route path="crm" element={hasCrm ? <CrmInbox /> : <Navigate to="/dashboard" />} />
                <Route path="campaigns" element={hasCrm ? <Campaigns /> : <Navigate to="/dashboard" />} />
                <Route path="ai" element={hasCrm ? <AiCrmConfigPage /> : <Navigate to="/dashboard" />} />
              </Route>
              <Route path="/crm" element={<Navigate to="/dashboard" replace />} />
              <Route path="/campaigns" element={<Navigate to="/dashboard" replace />} />
              <Route path="/ai/:sessionId" element={<LegacyAiRedirect />} />
              </Routes>
            </Suspense>
          </Container>
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
