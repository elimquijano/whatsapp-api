import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  ListItemText,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add,
  Campaign,
  CheckCircleOutline,
  Close,
  CloudUploadOutlined,
  DeleteOutline,
  DescriptionOutlined,
  ImageOutlined,
  Pause,
  PeopleAltOutlined,
  PlayArrow,
  ScheduleOutlined,
  SendOutlined,
  TextFieldsOutlined,
  TuneOutlined,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import axios from 'axios';

const statusLabels = {
  new: 'Nuevo',
  interested: 'Interesado',
  urgent: 'Urgente',
  follow_up: 'Seguimiento',
  customer: 'Cliente',
  not_interested: 'No interesado',
};

const campaignStatusLabels = {
  draft: 'Borrador',
  scheduled: 'Programada',
  running: 'En curso',
  completed: 'Completada',
  paused: 'Pausada',
  failed: 'Fallida',
};

const campaignColors = {
  draft: 'default',
  scheduled: 'info',
  running: 'warning',
  completed: 'success',
  paused: 'secondary',
  failed: 'error',
};

const steps = ['Audiencia', 'Mensaje', 'Programación y revisión'];

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const mediaTypeLabels = {
  image: 'Imagen',
  video: 'Video',
  audio: 'Audio',
  document: 'Documento',
};

const detectMediaType = (mimeType) => {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'document';
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const SectionHeading = ({ icon, eyebrow, title, description }) => (
  <Stack direction="row" spacing={1.5} alignItems="flex-start">
    <Box
      sx={(theme) => ({
        width: 42,
        height: 42,
        borderRadius: 2,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        color: 'primary.main',
        bgcolor: alpha(
          theme.palette.primary.main,
          theme.palette.mode === 'dark' ? 0.2 : 0.1,
        ),
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="overline"
        color="primary.main"
        sx={{ fontWeight: 800, lineHeight: 1.2, letterSpacing: 1 }}
      >
        {eyebrow}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {description}
      </Typography>
    </Box>
  </Stack>
);

const ReviewBlock = ({ icon, title, children }) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2,
      height: '100%',
      borderColor: 'divider',
      bgcolor: 'background.paper',
      boxShadow: 'none',
    }}
  >
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
        {title}
      </Typography>
    </Stack>
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
    >
      {children}
    </Typography>
  </Paper>
);

const Campaigns = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [campaigns, setCampaigns] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState({
    sessionId: '',
    name: '',
    messageType: 'text',
    message: '',
    mediaUrl: '',
    mediaPayload: '',
    mediaMimeType: '',
    mediaFilename: '',
    mediaSize: 0,
    statuses: ['interested', 'follow_up', 'customer'],
    delayMs: 1500,
    scheduledAt: '',
  });

  const load = async () => {
    try {
      const [campaignResponse, sessionResponse] = await Promise.all([
        axios.get('/api/crm/campaigns'),
        axios.get('/api/whatsapp/sessions'),
      ]);
      setCampaigns(campaignResponse.data.campaigns || []);
      setSessions(sessionResponse.data.sessions || []);
      setForm((current) => ({
        ...current,
        sessionId:
          current.sessionId ||
          sessionResponse.data.sessions?.[0]?.sessionId ||
          '',
      }));
    } catch (err) {
      setError(
        err.response?.data?.error || 'No se pudieron cargar las campañas',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const campaignPayload = { ...form };
      delete campaignPayload.mediaSize;
      if (campaignPayload.messageType === 'text') {
        campaignPayload.mediaUrl = '';
        campaignPayload.mediaPayload = '';
        campaignPayload.mediaMimeType = '';
        campaignPayload.mediaFilename = '';
      }
      await axios.post('/api/crm/campaigns', {
        ...campaignPayload,
        filters: { statuses: form.statuses },
        scheduledAt: form.scheduledAt || null,
      });
      setOpen(false);
      setActiveStep(0);
      setForm((current) => ({
        ...current,
        name: '',
        message: '',
        mediaUrl: '',
        mediaPayload: '',
        mediaMimeType: '',
        mediaFilename: '',
        mediaSize: 0,
        scheduledAt: '',
      }));
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la campaña');
    } finally {
      setCreating(false);
    }
  };

  const action = async (id, operation) => {
    try {
      await axios.post('/api/crm/campaigns/' + id + '/' + operation);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la campaña');
    }
  };

  const openCreator = () => {
    setError('');
    setActiveStep(0);
    setOpen(true);
  };

  const closeCreator = () => {
    setOpen(false);
    setActiveStep(0);
  };

  const handleMediaFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      setError(`El archivo supera el l\u00edmite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError('No se pudo leer el archivo seleccionado.');
    reader.onload = () => {
      const mimeType = file.type || 'application/octet-stream';
      const rawPayload = String(reader.result || '');
      const mediaPayload = rawPayload.startsWith('data:;base64,')
        ? rawPayload.replace('data:;base64,', `data:${mimeType};base64,`)
        : rawPayload;
      setError('');
      setForm((current) => ({
        ...current,
        messageType: detectMediaType(file.type),
        mediaPayload,
        mediaMimeType: mimeType,
        mediaFilename: file.name,
        mediaSize: file.size,
        mediaUrl: '',
      }));
    };
    reader.readAsDataURL(file);
  };

  const clearMedia = () => setForm((current) => ({
    ...current,
    mediaPayload: '',
    mediaMimeType: '',
    mediaFilename: '',
    mediaSize: 0,
  }));

  const isMediaMessage = form.messageType !== 'text';
  const hasMedia = Boolean(form.mediaPayload || form.mediaUrl);

  const canContinue =
    activeStep === 0
      ? Boolean(form.sessionId && form.name)
      : activeStep === 1
        ? Boolean(isMediaMessage ? hasMedia : form.message)
        : true;

  const selectedSegments = form.statuses
    .map((status) => statusLabels[status])
    .filter(Boolean);

  const scheduleSummary = form.scheduledAt
    ? 'Programada para ' + formatDate(form.scheduledAt)
    : 'Sin fecha: se guardará como borrador';

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 0.75 }}
          >
            <Typography
              variant="overline"
              color="primary.main"
              sx={{ fontWeight: 800, letterSpacing: 1.2 }}
            >
              CRM · Difusión
            </Typography>
            {!loading && (
              <Chip
                size="small"
                variant="outlined"
                label={
                  campaigns.length +
                  (campaigns.length === 1 ? ' campaña' : ' campañas')
                }
              />
            )}
          </Stack>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', sm: '2.125rem' },
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              color: 'text.primary',
            }}
          >
            Campañas de difusión
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 1, maxWidth: 720, lineHeight: 1.6 }}
          >
            Organiza mensajes personalizados por audiencia, controla el ritmo
            de envío y revisa el progreso desde un solo lugar.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<Add />}
          onClick={openCreator}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            flexShrink: 0,
            px: 2.5,
          }}
        >
          Nueva campaña
        </Button>
      </Stack>

      <Alert
        severity="warning"
        variant="outlined"
        sx={(currentTheme) => ({
          mb: 3,
          alignItems: 'center',
          bgcolor: alpha(
            currentTheme.palette.warning.main,
            currentTheme.palette.mode === 'dark' ? 0.12 : 0.06,
          ),
          '& .MuiAlert-message': { width: '100%' },
        })}
      >
        Envía únicamente a contactos que hayan autorizado comunicaciones.
        Mantén intervalos prudentes y respeta las políticas de WhatsApp para
        reducir el riesgo de bloqueos.
      </Alert>

      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ mb: 3 }}
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Grid container spacing={2.5}>
          {[0, 1, 2].map((item) => (
            <Grid item xs={12} md={6} xl={4} key={item}>
              <Card
                variant="outlined"
                sx={{ borderColor: 'divider', boxShadow: 'none' }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Skeleton variant="rounded" width={44} height={44} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Skeleton width="65%" />
                      <Skeleton width="35%" />
                    </Box>
                  </Stack>
                  <Skeleton height={72} sx={{ my: 2 }} />
                  <Skeleton variant="rounded" height={8} />
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                    <Skeleton variant="rounded" width="33%" height={56} />
                    <Skeleton variant="rounded" width="33%" height={56} />
                    <Skeleton variant="rounded" width="33%" height={56} />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : campaigns.length ? (
        <Grid container spacing={2.5}>
          {campaigns.map((item) => {
            const sentCount = Number(item.sentCount || 0);
            const failedCount = Number(item.failedCount || 0);
            const totalRecipients = Number(item.totalRecipients || 0);
            const itemIsMedia = item.messageType !== 'text';
            const processed = sentCount + failedCount;
            const progress = totalRecipients
              ? Math.min(100, (processed / totalRecipients) * 100)
              : 0;
            const dateLabel = item.scheduledAt
              ? 'Programada · ' + formatDate(item.scheduledAt)
              : item.createdAt
                ? 'Creada · ' + formatDate(item.createdAt)
                : '';

            return (
              <Grid item xs={12} md={6} xl={4} key={item.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    boxShadow: 'none',
                    transition:
                      'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: theme.shadows[4],
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardContent
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      '&:last-child': { pb: { xs: 2, sm: 2.5 } },
                      flexGrow: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: 0,
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="flex-start"
                      spacing={1.5}
                    >
                      <Box
                        sx={(currentTheme) => ({
                          width: 44,
                          height: 44,
                          borderRadius: 2,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          color: 'primary.main',
                          bgcolor: alpha(
                            currentTheme.palette.primary.main,
                            currentTheme.palette.mode === 'dark' ? 0.2 : 0.1,
                          ),
                        })}
                      >
                        <Campaign />
                      </Box>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 800,
                            lineHeight: 1.25,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mt: 0.5 }}
                        >
                          {dateLabel ||
                            (itemIsMedia
                              ? `${mediaTypeLabels[item.messageType] || 'Multimedia'} con texto`
                              : 'Mensaje de texto')}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={campaignColors[item.status] || 'default'}
                        label={
                          campaignStatusLabels[item.status] || item.status
                        }
                        sx={{ flexShrink: 0, fontWeight: 700 }}
                      />
                    </Stack>

                    <Box
                      sx={{
                        my: 2,
                        p: 1.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'action.hover',
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ mb: 0.75 }}
                      >
                        {itemIsMedia ? (
                          <ImageOutlined
                            color="action"
                            sx={{ fontSize: 17 }}
                          />
                        ) : (
                          <TextFieldsOutlined
                            color="action"
                            sx={{ fontSize: 17 }}
                          />
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 700 }}
                        >
                          {itemIsMedia
                            ? mediaTypeLabels[item.messageType] || 'Multimedia'
                            : 'Mensaje'}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        color="text.primary"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 3,
                          overflow: 'hidden',
                        }}
                      >
                        {item.message}
                      </Typography>
                    </Box>

                    {item.status === 'failed' && item.lastError && (
                      <Alert
                        severity="error"
                        variant="outlined"
                        sx={{ mb: 2, '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}
                      >
                        {item.lastError}
                      </Alert>
                    )}

                    <Box sx={{ mt: 'auto' }}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={2}
                        sx={{ mb: 0.75 }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 700 }}
                        >
                          Progreso
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {processed} de {totalRecipients}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        color={failedCount ? 'warning' : 'primary'}
                        sx={{
                          height: 8,
                          borderRadius: 999,
                          bgcolor: 'action.selected',
                        }}
                      />

                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                          gap: 1,
                          mt: 1.5,
                        }}
                      >
                        {[
                          {
                            label: 'Enviados',
                            value: sentCount,
                            color: 'success.main',
                          },
                          {
                            label: 'Fallidos',
                            value: failedCount,
                            color: failedCount
                              ? 'error.main'
                              : 'text.primary',
                          },
                          {
                            label: 'Total',
                            value: totalRecipients,
                            color: 'text.primary',
                          },
                        ].map((metric) => (
                          <Box
                            key={metric.label}
                            sx={{
                              minWidth: 0,
                              p: 1,
                              textAlign: 'center',
                              borderRadius: 1.5,
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 900,
                                color: metric.color,
                                lineHeight: 1.2,
                              }}
                            >
                              {metric.value}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mt: 0.25 }}
                            >
                              {metric.label}
                            </Typography>
                          </Box>
                        ))}
                      </Box>

                      <Box sx={{ mt: 2 }}>
                        {item.status !== 'running' &&
                          item.status !== 'completed' && (
                            <Button
                              fullWidth
                              variant="contained"
                              startIcon={<PlayArrow />}
                              onClick={() => action(item.id, 'run')}
                            >
                              {item.status === 'failed' ? 'Reintentar campaña' : 'Iniciar campaña'}
                            </Button>
                          )}
                        {item.status === 'running' && (
                          <Button
                            fullWidth
                            variant="outlined"
                            color="warning"
                            startIcon={<Pause />}
                            onClick={() => action(item.id, 'pause')}
                          >
                            Pausar envío
                          </Button>
                        )}
                        {item.status === 'completed' && (
                          <Stack
                            direction="row"
                            spacing={0.75}
                            alignItems="center"
                            justifyContent="center"
                            sx={{ color: 'success.main', py: 0.75 }}
                          >
                            <CheckCircleOutline fontSize="small" />
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 800 }}
                            >
                              Envío completado
                            </Typography>
                          </Stack>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <Paper
          variant="outlined"
          sx={(currentTheme) => ({
            px: { xs: 2.5, sm: 5 },
            py: { xs: 5, sm: 7 },
            textAlign: 'center',
            borderStyle: 'dashed',
            borderColor: 'divider',
            boxShadow: 'none',
            bgcolor: alpha(
              currentTheme.palette.primary.main,
              currentTheme.palette.mode === 'dark' ? 0.08 : 0.025,
            ),
          })}
        >
          <Box
            sx={(currentTheme) => ({
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              mx: 'auto',
              mb: 2,
              color: 'primary.main',
              bgcolor: alpha(
                currentTheme.palette.primary.main,
                currentTheme.palette.mode === 'dark' ? 0.2 : 0.1,
              ),
            })}
          >
            <Campaign sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Tu primera campaña empieza aquí
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 1, mb: 2.5, mx: 'auto', maxWidth: 520 }}
          >
            Selecciona una audiencia, prepara el mensaje y decide cuándo
            enviarlo. Podrás revisar todo antes de crearla.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openCreator}
          >
            Crear primera campaña
          </Button>
          {!sessions.length && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1.5 }}
            >
              Necesitarás una sesión de WhatsApp disponible para continuar.
            </Typography>
          )}
        </Paper>
      )}

      <Dialog
        open={open}
        onClose={closeCreator}
        fullWidth
        fullScreen={isMobile}
        maxWidth="md"
        scroll="paper"
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 2 },
            borderRadius: { xs: 0, sm: 3 },
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        <DialogTitle
          component="div"
          sx={{
            px: { xs: 2, sm: 3 },
            pt: { xs: 2, sm: 2.5 },
            pb: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={2}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                Nueva campaña
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Completa tres pasos y revisa la configuración antes de crearla.
              </Typography>
            </Box>
            <IconButton
              aria-label="Cerrar creación de campaña"
              onClick={closeCreator}
              size="small"
              sx={{ flexShrink: 0 }}
            >
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>

        <Box
          sx={(currentTheme) => ({
            px: { xs: 2, sm: 3 },
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(
              currentTheme.palette.primary.main,
              currentTheme.palette.mode === 'dark' ? 0.08 : 0.035,
            ),
          })}
        >
          <Stepper
            activeStep={activeStep}
            orientation={isMobile ? 'vertical' : 'horizontal'}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <DialogContent
          sx={{
            px: { xs: 2, sm: 3 },
            py: 3,
            minWidth: 0,
          }}
        >
          {error && (
            <Alert
              severity="error"
              onClose={() => setError('')}
              sx={{ mb: 2.5 }}
            >
              {error}
            </Alert>
          )}

          {activeStep === 0 && (
            <Stack spacing={3}>
              <SectionHeading
                icon={<PeopleAltOutlined />}
                eyebrow="Paso 1"
                title="Define la audiencia"
                description="Elige la sesión que enviará los mensajes y las clasificaciones del CRM que deseas incluir."
              />

              <Alert severity="info" variant="outlined">
                La audiencia usa directamente los contactos del CRM de esta sesi&oacute;n. Los contactos importados aparecen como Clientes y no necesitas importarlos otra vez. Al guardar la campa&ntilde;a se congela su lista de destinatarios, para que futuros cambios del CRM no alteren un env&iacute;o ya revisado.
              </Alert>

              {!sessions.length && (
                <Alert severity="info">
                  No hay sesiones de WhatsApp disponibles. Conecta una sesión
                  antes de crear la campaña.
                </Alert>
              )}

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="Sesión de envío"
                    value={form.sessionId}
                    onChange={(event) =>
                      setForm({ ...form, sessionId: event.target.value })
                    }
                    helperText="La cuenta de WhatsApp que realizará el envío."
                  >
                    {!sessions.length && (
                      <MenuItem value="" disabled>
                        No hay sesiones disponibles
                      </MenuItem>
                    )}
                    {sessions.map((item) => (
                      <MenuItem
                        key={item.sessionId}
                        value={item.sessionId}
                      >
                        {item.sessionId}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Nombre de la campaña"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    placeholder="Ej. Seguimiento clientes de julio"
                    helperText="Solo es visible dentro de tu panel."
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    label="Clasificaciones incluidas"
                    value={form.statuses}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm({
                        ...form,
                        statuses:
                          typeof value === 'string'
                            ? value.split(',')
                            : value,
                      });
                    }}
                    helperText="Si no eliges ninguna clasificación, se incluirán todos los contactos del CRM."
                    SelectProps={{
                      multiple: true,
                      renderValue: (selected) => (
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 0.75,
                          }}
                        >
                          {selected.map((value) => (
                            <Chip
                              key={value}
                              size="small"
                              label={statusLabels[value] || value}
                            />
                          ))}
                        </Box>
                      ),
                    }}
                  >
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <MenuItem key={key} value={key}>
                        <Checkbox
                          size="small"
                          checked={form.statuses.includes(key)}
                        />
                        <ListItemText primary={label} />
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  boxShadow: 'none',
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Resumen de audiencia
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedSegments.length
                        ? selectedSegments.join(', ')
                        : 'Todos los contactos del CRM'}
                    </Typography>
                  </Box>
                  <Chip
                    icon={<TuneOutlined />}
                    color="primary"
                    variant="outlined"
                    label={
                      selectedSegments.length
                        ? selectedSegments.length +
                          (selectedSegments.length === 1
                            ? ' segmento'
                            : ' segmentos')
                        : 'Sin filtros'
                    }
                  />
                </Stack>
              </Paper>
            </Stack>
          )}

          {activeStep === 1 && (
            <Stack spacing={3}>
              <SectionHeading
                icon={<TextFieldsOutlined />}
                eyebrow="Paso 2"
                title="Prepara el mensaje"
                description="Escoge el formato, escribe el contenido y comprueba cómo se verá antes de continuar."
              />

              <Box>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 800, mb: 1 }}
                >
                  Tipo de mensaje
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={isMediaMessage ? 'media' : 'text'}
                  onChange={(_event, value) => {
                    if (value) setForm({ ...form, messageType: value === 'text' ? 'text' : (form.messageType === 'text' ? 'image' : form.messageType) });
                  }}
                  aria-label="Tipo de mensaje"
                  sx={{
                    '& .MuiToggleButton-root': {
                      py: 1.25,
                      gap: 1,
                      textTransform: 'none',
                      fontWeight: 700,
                    },
                  }}
                >
                  <ToggleButton value="text" aria-label="Mensaje de texto">
                    <TextFieldsOutlined fontSize="small" />
                    Texto
                  </ToggleButton>
                  <ToggleButton value="media" aria-label="Archivo multimedia">
                    <ImageOutlined fontSize="small" />
                    Multimedia
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {isMediaMessage && (
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderStyle: 'dashed', borderColor: hasMedia ? 'primary.main' : 'divider', bgcolor: 'action.hover' }}
                >
                  <Stack spacing={1.5} alignItems={form.mediaPayload ? 'stretch' : 'center'}>
                    {form.mediaPayload ? (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <Box sx={{ width: { xs: '100%', sm: 64 }, height: 64, borderRadius: 1.5, bgcolor: 'background.paper', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {form.messageType === 'image' ? (
                            <Box component="img" src={form.mediaPayload} alt="Vista previa" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <DescriptionOutlined color="primary" />
                          )}
                        </Box>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800 }}>{form.mediaFilename}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {mediaTypeLabels[form.messageType]} · {formatBytes(form.mediaSize)} · carga segura mediante base64
                          </Typography>
                        </Box>
                        <IconButton onClick={clearMedia} color="error" aria-label="Quitar archivo"><DeleteOutline /></IconButton>
                      </Stack>
                    ) : (
                      <>
                        <CloudUploadOutlined color="primary" sx={{ fontSize: 36 }} />
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Sube una imagen o archivo</Typography>
                          <Typography variant="caption" color="text.secondary">Imagen, video, audio o documento. M&aacute;ximo 10 MB.</Typography>
                        </Box>
                      </>
                    )}
                    <Button component="label" variant={form.mediaPayload ? 'outlined' : 'contained'} startIcon={<CloudUploadOutlined />} sx={{ alignSelf: form.mediaPayload ? { xs: 'stretch', sm: 'flex-start' } : 'center' }}>
                      {form.mediaPayload ? 'Cambiar archivo' : 'Seleccionar archivo'}
                      <input hidden type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleMediaFile} />
                    </Button>
                  </Stack>
                </Paper>
              )}

              {isMediaMessage && !form.mediaPayload && (
                <TextField
                  fullWidth
                  type="url"
                  label="URL pública del archivo"
                  value={form.mediaUrl}
                  onChange={(event) => setForm({ ...form, mediaUrl: event.target.value })}
                  placeholder="https://..."
                  helperText="Se descargará y guardará una sola vez al crear la campaña."
                />
              )}

              <TextField
                fullWidth
                multiline
                minRows={5}
                label="Mensaje"
                value={form.message}
                onChange={(event) =>
                  setForm({ ...form, message: event.target.value })
                }
                helperText="Puedes usar {{name}} y {{phone}} para personalizar cada mensaje."
              />

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Typography variant="caption" color="text.secondary">
                  Variables disponibles:
                </Typography>
                <Stack direction="row" spacing={0.75}>
                  <Chip size="small" variant="outlined" label="{{name}}" />
                  <Chip size="small" variant="outlined" label="{{phone}}" />
                </Stack>
              </Stack>

              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2, sm: 2.5 },
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  boxShadow: 'none',
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={2}
                  sx={{ mb: 1.5 }}
                >
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ fontWeight: 800, lineHeight: 1 }}
                  >
                    Vista previa
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {form.message.length} caracteres
                  </Typography>
                </Stack>
                {form.mediaFilename && (
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25, color: 'text.secondary' }}>
                    {form.messageType === 'document' ? <DescriptionOutlined fontSize="small" /> : <ImageOutlined fontSize="small" />}
                    <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{form.mediaFilename} · {formatBytes(form.mediaSize)}</Typography>
                  </Stack>
                )}
                {isMediaMessage && !form.mediaFilename && (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                    sx={{ mb: 1.25, color: 'text.secondary' }}
                  >
                    {form.messageType === 'document' ? <DescriptionOutlined fontSize="small" /> : <ImageOutlined fontSize="small" />}
                    <Typography
                      variant="caption"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {form.mediaUrl || 'La URL de la imagen aparecerá aquí'}
                    </Typography>
                  </Stack>
                )}
                <Typography
                  variant="body2"
                  color={form.message ? 'text.primary' : 'text.secondary'}
                  sx={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    fontStyle: form.message ? 'normal' : 'italic',
                    lineHeight: 1.65,
                  }}
                >
                  {form.message || 'Tu mensaje aparecerá aquí.'}
                </Typography>
              </Paper>
            </Stack>
          )}

          {activeStep === 2 && (
            <Stack spacing={3}>
              <SectionHeading
                icon={<ScheduleOutlined />}
                eyebrow="Paso 3"
                title="Programa y revisa"
                description="Define el ritmo de salida y confirma los datos principales de la campaña."
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Intervalo entre mensajes (ms)"
                    value={form.delayMs}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        delayMs: Number(event.target.value),
                      })
                    }
                    inputProps={{ min: 1000, max: 60000, step: 500 }}
                    helperText="Mínimo técnico: 1000 ms. Se recomienda un intervalo mayor."
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="Programar (opcional)"
                    value={form.scheduledAt}
                    onChange={(event) =>
                      setForm({ ...form, scheduledAt: event.target.value })
                    }
                    InputLabelProps={{ shrink: true }}
                    helperText="Déjalo vacío para guardar la campaña como borrador."
                  />
                </Grid>
              </Grid>

              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1.5 }}>
                  Revisión final
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={12} md={4}>
                    <ReviewBlock
                      icon={<PeopleAltOutlined fontSize="small" />}
                      title="Audiencia"
                    >
                      {'Sesión: ' +
                        (form.sessionId || 'Sin seleccionar') +
                        '\n' +
                        (selectedSegments.length
                          ? selectedSegments.join(', ')
                          : 'Todos los contactos del CRM')}
                    </ReviewBlock>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <ReviewBlock
                      icon={
                        isMediaMessage ? (
                          <ImageOutlined fontSize="small" />
                        ) : (
                          <TextFieldsOutlined fontSize="small" />
                        )
                      }
                      title="Mensaje"
                    >
                      {(isMediaMessage
                        ? `${mediaTypeLabels[form.messageType] || 'Multimedia'}${form.mediaFilename ? `: ${form.mediaFilename}` : ''}`
                        : 'Mensaje de texto') +
                        '\n' +
                        form.message.length +
                        ' caracteres'}
                    </ReviewBlock>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <ReviewBlock
                      icon={<ScheduleOutlined fontSize="small" />}
                      title="Entrega"
                    >
                      {scheduleSummary +
                        '\nIntervalo: ' +
                        form.delayMs +
                        ' ms'}
                    </ReviewBlock>
                  </Grid>
                </Grid>
              </Box>

              <Alert severity="warning" variant="outlined">
                Al crear la campaña confirmas que esta audiencia autorizó
                recibir comunicaciones. Revisa el contenido y evita reintentos
                agresivos.
              </Alert>
            </Stack>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Button onClick={closeCreator}>Cancelar</Button>
          <Stack direction="row" spacing={1}>
            {activeStep > 0 && (
              <Button onClick={() => setActiveStep((step) => step - 1)}>
                Atrás
              </Button>
            )}
            {activeStep < steps.length - 1 ? (
              <Button
                variant="contained"
                disabled={!canContinue}
                onClick={() => setActiveStep((step) => step + 1)}
              >
                Continuar
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <SendOutlined />}
                disabled={creating || !form.sessionId || !form.name || (isMediaMessage ? !hasMedia : !form.message)}
                onClick={create}
              >
                {creating ? 'Creando…' : 'Crear campaña'}
              </Button>
            )}
          </Stack>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Campaigns;
