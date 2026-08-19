import React, { useCallback, useEffect, useState } from 'react';
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
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add,
  AutoAwesome,
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
import useSmartPolling from '../hooks/useSmartPolling';
import { useParams } from 'react-router-dom';

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

const newCampaignForm = (sessionId = '') => ({
  sessionId,
  name: '',
  messageType: 'text',
  message: '',
  mediaUrl: '',
  mediaPayload: '',
  mediaBase64: '',
  mediaSource: 'upload',
  mediaMimeType: '',
  mediaFilename: '',
  mediaSize: 0,
  statuses: ['interested', 'follow_up', 'customer'],
  nameTerms: '',
  nameMatchMode: 'any',
  delayMs: 1500,
  scheduledAt: '',
});

const initialAiSettings = {
  aiProvider: 'openai_compatible',
  aiApiUrl: '',
  aiModel: '',
  aiApiToken: '',
  brandVoice: '',
  campaignInstructions: '',
};

const initialAiRequest = {
  objective: '',
  offer: '',
  audience: '',
  tone: 'Cercano, claro y profesional',
  constraints: '',
};

const providerApiUrls = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
  openai_compatible: '',
};

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
  const { sessionId = '' } = useParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [campaigns, setCampaigns] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [captionGenerating, setCaptionGenerating] = useState(false);
  const [captionNotice, setCaptionNotice] = useState('');
  const [captionImageDescription, setCaptionImageDescription] = useState('');
  const [audiencePreview, setAudiencePreview] = useState({ count: null, samples: [], error: '' });
  const [audiencePreviewLoading, setAudiencePreviewLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState(() => newCampaignForm(sessionId));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState(initialAiSettings);
  const [aiRequest, setAiRequest] = useState(initialAiRequest);
  const [aiDraft, setAiDraft] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  const load = useCallback(async () => {
    try {
      const campaignResponse = await axios.get(`/api/v1/sessions/${sessionId}/crm/campaigns`);
      setCampaigns(campaignResponse.data.campaigns || []);
      setForm((current) => ({
        ...current,
        sessionId,
      }));
    } catch (err) {
      setError(
        err.response?.data?.error || 'No se pudieron cargar las campañas',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setCampaigns([]);
    setLoading(true);
    setOpen(false);
    setCaptionNotice('');
    setCaptionImageDescription('');
    setAiOpen(false);
    setAiDraft(null);
    setForm(newCampaignForm(sessionId));
  }, [sessionId]);

  useSmartPolling(load, 15000);

  useEffect(() => {
    if (!open || activeStep !== 0 || !sessionId) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAudiencePreviewLoading(true);
      try {
        const response = await axios.post(
          `/api/v1/sessions/${sessionId}/crm/campaigns/audience-preview`,
          {
            filters: {
              statuses: form.statuses,
              nameTerms: form.nameTerms,
              nameMatchMode: form.nameMatchMode,
            },
          },
          { signal: controller.signal },
        );
        setAudiencePreview({
          count: Number(response.data.count || 0),
          samples: response.data.samples || [],
          error: '',
        });
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          setAudiencePreview({ count: null, samples: [], error: err.response?.data?.error || 'No se pudo calcular la audiencia' });
        }
      } finally {
        if (!controller.signal.aborted) setAudiencePreviewLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, activeStep, sessionId, form.statuses, form.nameTerms, form.nameMatchMode]);

  const create = async () => {
    setCreating(true);
    try {
      const campaignPayload = { ...form };
      delete campaignPayload.mediaSize;
      delete campaignPayload.mediaSource;
      delete campaignPayload.nameTerms;
      delete campaignPayload.nameMatchMode;
      if (campaignPayload.messageType === 'text') {
        campaignPayload.mediaUrl = '';
        campaignPayload.mediaPayload = '';
        campaignPayload.mediaBase64 = '';
        campaignPayload.mediaMimeType = '';
        campaignPayload.mediaFilename = '';
      }
      await axios.post(`/api/v1/sessions/${sessionId}/crm/campaigns`, {
        ...campaignPayload,
        filters: {
          statuses: form.statuses,
          nameTerms: form.nameTerms,
          nameMatchMode: form.nameMatchMode,
        },
        scheduledAt: form.scheduledAt || null,
      });
      setOpen(false);
      setActiveStep(0);
      setCaptionNotice('');
      setCaptionImageDescription('');
      setForm((current) => ({
        ...current,
        name: '',
        message: '',
        mediaUrl: '',
        mediaPayload: '',
        mediaBase64: '',
        mediaSource: 'upload',
        mediaMimeType: '',
        mediaFilename: '',
        mediaSize: 0,
        nameTerms: '',
        nameMatchMode: 'any',
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
      await axios.post(`/api/v1/sessions/${sessionId}/crm/campaigns/${id}/${operation}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la campaña');
    }
  };

  const openCreator = () => {
    setError('');
    setCaptionNotice('');
    setCaptionImageDescription('');
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
      setCaptionImageDescription('');
      setForm((current) => ({
        ...current,
        messageType: detectMediaType(file.type),
        mediaPayload,
        mediaMimeType: mimeType,
        mediaFilename: file.name,
        mediaSize: file.size,
        mediaUrl: '',
        mediaBase64: '',
        mediaSource: 'upload',
      }));
    };
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setCaptionImageDescription('');
    setForm((current) => ({
      ...current,
      mediaPayload: '',
      mediaBase64: '',
      mediaUrl: '',
      mediaMimeType: '',
      mediaFilename: '',
      mediaSize: 0,
    }));
  };

  const isMediaMessage = form.messageType !== 'text';
  const hasMedia = Boolean(form.mediaPayload || form.mediaUrl || form.mediaBase64);

  const openAiAssistant = async () => {
    setAiOpen(true);
    setAiError('');
    setAiLoading(true);
    try {
      const response = await axios.get(`/api/v1/sessions/${sessionId}/crm/campaign-ai/settings`);
      setAiSettings({ ...initialAiSettings, ...(response.data.settings || {}), aiApiToken: '' });
    } catch (err) {
      setAiError(err.response?.data?.error || 'No se pudo cargar el asistente de campañas');
    } finally {
      setAiLoading(false);
    }
  };

  const saveAiSettings = async () => {
    setAiSaving(true);
    setAiError('');
    try {
      const response = await axios.put(`/api/v1/sessions/${sessionId}/crm/campaign-ai/settings`, aiSettings);
      setAiSettings((current) => ({ ...current, ...response.data.settings, aiApiToken: '' }));
      return true;
    } catch (err) {
      setAiError(err.response?.data?.error || 'No se pudo guardar la configuración de IA');
      return false;
    } finally {
      setAiSaving(false);
    }
  };

  const generateAiDraft = async () => {
    if (!aiRequest.objective.trim()) {
      setAiError('Describe primero el objetivo de la campaña.');
      return;
    }
    setAiGenerating(true);
    setAiError('');
    try {
      const saved = await saveAiSettings();
      if (!saved) return;
      const response = await axios.post(`/api/v1/sessions/${sessionId}/crm/campaign-ai/generate`, {
        ...aiRequest,
        currentMessage: form.message,
      });
      setAiDraft(response.data.draft || null);
    } catch (err) {
      setAiError(err.response?.data?.error || 'La IA no pudo preparar la campaña');
    } finally {
      setAiGenerating(false);
    }
  };

  const applyAiDraft = () => {
    if (!aiDraft) return;
    setForm((current) => ({
      ...current,
      name: aiDraft.campaignName || current.name,
      message: aiDraft.message || current.message,
      messageType: aiDraft.messageType || 'text',
      statuses: aiDraft.recommendedStatuses?.length ? aiDraft.recommendedStatuses : current.statuses,
    }));
    setAiOpen(false);
    setActiveStep(0);
    setOpen(true);
  };

  const generateCaption = async () => {
    if (!form.name.trim()) {
      setError('Indica el nombre de la campaña antes de redactar con IA.');
      return;
    }
    setCaptionGenerating(true);
    setCaptionNotice('');
    setCaptionImageDescription('');
    setError('');
    try {
      let safeFileReference = form.mediaFilename || '';
      if (!safeFileReference && form.mediaUrl) {
        try {
          safeFileReference = decodeURIComponent(new URL(form.mediaUrl).pathname.split('/').filter(Boolean).pop() || 'archivo remoto');
        } catch {
          safeFileReference = 'archivo remoto';
        }
      }
      const format = form.messageType === 'text'
        ? 'mensaje de texto'
        : `${mediaTypeLabels[form.messageType] || 'archivo multimedia'}${safeFileReference ? ` llamado "${safeFileReference}"` : ''}`;
      const statusAudience = form.statuses
        .map((status) => statusLabels[status])
        .filter(Boolean)
        .join(', ');
      const audience = [
        statusAudience,
        form.nameTerms.trim() ? `nombres filtrados por: ${form.nameTerms.trim()}` : '',
      ].filter(Boolean).join('; ');
      const visualInput = form.messageType === 'image' && hasMedia
        ? {
            imagePayload: form.mediaPayload || form.mediaUrl || '',
            imageBase64: form.mediaBase64 || '',
            imageMimeType: form.mediaMimeType || '',
            mediaFilename: form.mediaFilename || safeFileReference,
          }
        : {};
      const response = await axios.post(`/api/v1/sessions/${sessionId}/crm/campaign-ai/generate`, {
        objective: `Redactar el ${form.messageType === 'text' ? 'mensaje' : 'caption'} final para la campaña "${form.name}" que acompañará un ${format}.`,
        audience: audience || 'Todos los contactos del CRM de esta sesión',
        tone: 'Cercano, atractivo y profesional, con emojis pertinentes y moderados',
        constraints: 'Entregar un texto listo para WhatsApp, visualmente ordenado, fácil de leer y con una llamada a la acción clara. No inventar precios, descuentos, fechas, stock ni beneficios. Evitar exceso de emojis, mayúsculas, hashtags y lenguaje engañoso.',
        currentMessage: form.message,
        ...visualInput,
      });
      const generatedMessage = String(response.data.draft?.message || '').trim();
      if (!generatedMessage) throw new Error('La IA no devolvió un mensaje utilizable');
      setForm((current) => ({ ...current, message: generatedMessage }));
      setCaptionImageDescription(String(response.data.draft?.imageDescription || '').trim());
      setCaptionNotice(response.data.analyzedImage
        ? 'La IA analizó la imagen real y redactó el caption según el tema de la campaña.'
        : form.message.trim()
          ? 'La IA pulió tu texto. Revísalo antes de continuar.'
          : 'Caption generado. Puedes editarlo libremente antes de enviar.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'No se pudo redactar el caption con IA');
    } finally {
      setCaptionGenerating(false);
    }
  };

  const canContinue =
    activeStep === 0
      ? Boolean(form.sessionId && form.name && audiencePreview.count !== 0)
      : activeStep === 1
        ? Boolean(isMediaMessage ? hasMedia : form.message)
        : true;

  const selectedSegments = form.statuses
    .map((status) => statusLabels[status])
    .filter(Boolean);

  const selectedNameTerms = form.nameTerms
    .split(/[,\n]+/)
    .map((term) => term.trim())
    .filter(Boolean);

  const nameFilterSummary = selectedNameTerms.length
    ? `Nombre contiene ${form.nameMatchMode === 'all' ? 'todos' : 'cualquiera'}: ${selectedNameTerms.join(', ')}`
    : 'Sin filtro por nombre';

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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="large"
            startIcon={<AutoAwesome />}
            onClick={openAiAssistant}
          >
            Planificar con IA
          </Button>
          <Button
            variant="contained"
            size="large"
            startIcon={<Add />}
            onClick={openCreator}
            sx={{ px: 2.5 }}
          >
            Nueva campaña
          </Button>
        </Stack>
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

                    {Boolean(item.filters?.nameTerms?.length) && (
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={800}>
                          Nombre {item.filters.nameMatchMode === 'all' ? 'contiene todas:' : 'contiene:'}
                        </Typography>
                        {item.filters.nameTerms.map((term) => (
                          <Chip key={term} size="small" variant="outlined" label={term} />
                        ))}
                      </Stack>
                    )}

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
        </Paper>
      )}

      <Dialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        fullWidth
        fullScreen={isMobile}
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle component="div" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <AutoAwesome color="primary" />
                <Typography variant="h6" fontWeight={900}>Asistente de campañas</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Usa el contexto empresarial de esta sesión para crear estrategia, copy y brief visual.
              </Typography>
            </Box>
            <IconButton onClick={() => setAiOpen(false)} aria-label="Cerrar asistente"><Close /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          {aiLoading ? (
            <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress /></Stack>
          ) : (
            <Stack spacing={2.5}>
              {aiError && <Alert severity="error" onClose={() => setAiError('')}>{aiError}</Alert>}

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="subtitle1" fontWeight={900}>Motor de IA de esta sesión</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Configura aquí las credenciales que usará exclusivamente el asistente de campañas.
                </Typography>
                <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                  Para analizar imágenes, el modelo elegido debe aceptar entrada visual. Si es únicamente de texto, el sistema bloqueará el análisis en lugar de inventar una descripción.
                </Alert>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        select
                        label="Proveedor"
                        value={aiSettings.aiProvider}
                        onChange={(event) => {
                          const aiProvider = event.target.value;
                          setAiSettings({ ...aiSettings, aiProvider, aiApiUrl: providerApiUrls[aiProvider] || '' });
                        }}
                      >
                        <MenuItem value="openai">OpenAI</MenuItem>
                        <MenuItem value="groq">Groq</MenuItem>
                        <MenuItem value="gemini">Gemini</MenuItem>
                        <MenuItem value="openai_compatible">Compatible con OpenAI</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} sm={8}>
                      <TextField fullWidth label="URL de la API" value={aiSettings.aiApiUrl} onChange={(event) => setAiSettings({ ...aiSettings, aiApiUrl: event.target.value })} placeholder="https://api.proveedor.com/v1/chat/completions" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Modelo multimodal" value={aiSettings.aiModel} onChange={(event) => setAiSettings({ ...aiSettings, aiModel: event.target.value })} placeholder="modelo con visión" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        type="password"
                        label={aiSettings.hasCustomToken ? 'Token (guardado; escribe para reemplazar)' : 'Token de API'}
                        value={aiSettings.aiApiToken}
                        onChange={(event) => setAiSettings({ ...aiSettings, aiApiToken: event.target.value })}
                        autoComplete="new-password"
                      />
                    </Grid>
                </Grid>
                <Grid container spacing={2} sx={{ mt: 0 }}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth multiline minRows={3} label="Voz de marca" value={aiSettings.brandVoice} onChange={(event) => setAiSettings({ ...aiSettings, brandVoice: event.target.value })} placeholder="Ej. Cercana, directa, sin exageraciones..." />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth multiline minRows={3} label="Reglas para campañas" value={aiSettings.campaignInstructions} onChange={(event) => setAiSettings({ ...aiSettings, campaignInstructions: event.target.value })} placeholder="Condiciones, palabras prohibidas, CTA preferido..." />
                  </Grid>
                </Grid>
                <Button sx={{ mt: 2 }} variant="outlined" disabled={aiSaving} onClick={saveAiSettings}>
                  {aiSaving ? 'Guardando…' : 'Guardar configuración'}
                </Button>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="subtitle1" fontWeight={900}>¿Qué quieres lograr?</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  La IA no inventará precios, fechas ni stock: lo no confirmado quedará marcado como supuesto.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField required fullWidth multiline minRows={2} label="Objetivo" value={aiRequest.objective} onChange={(event) => setAiRequest({ ...aiRequest, objective: event.target.value })} placeholder="Ej. Recuperar clientes interesados con un descuento de fin de mes" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth multiline minRows={2} label="Oferta o información confirmada" value={aiRequest.offer} onChange={(event) => setAiRequest({ ...aiRequest, offer: event.target.value })} placeholder="Precio, descuento, vigencia, condiciones..." />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth multiline minRows={2} label="Público objetivo" value={aiRequest.audience} onChange={(event) => setAiRequest({ ...aiRequest, audience: event.target.value })} placeholder="Quiénes son y qué necesitan" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Tono" value={aiRequest.tone} onChange={(event) => setAiRequest({ ...aiRequest, tone: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Restricciones" value={aiRequest.constraints} onChange={(event) => setAiRequest({ ...aiRequest, constraints: event.target.value })} placeholder="Qué evitar o respetar" />
                  </Grid>
                </Grid>
                <Button variant="contained" startIcon={aiGenerating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesome />} disabled={aiGenerating || aiSaving} onClick={generateAiDraft} sx={{ mt: 2 }}>
                  {aiGenerating ? 'Preparando campaña…' : 'Crear propuesta'}
                </Button>
              </Paper>

              {aiDraft && (
                <Paper variant="outlined" sx={{ p: 2.5, borderColor: 'primary.main' }}>
                  <Typography variant="overline" color="primary.main" fontWeight={900}>Propuesta editable</Typography>
                  <Typography variant="h6" fontWeight={900}>{aiDraft.campaignName}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{aiDraft.strategySummary}</Typography>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    label="Copy para WhatsApp"
                    value={aiDraft.message || ''}
                    onChange={(event) => setAiDraft({ ...aiDraft, message: event.target.value })}
                    sx={{ mt: 2 }}
                    helperText="Puedes editarlo aquí; {{name}} y {{phone}} se personalizan al enviar."
                  />
                  <Grid container spacing={2} sx={{ mt: 0 }}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth multiline minRows={4} label="Brief visual" value={aiDraft.visualBrief || ''} onChange={(event) => setAiDraft({ ...aiDraft, visualBrief: event.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth multiline minRows={4} label="Prompt para generar imagen" value={aiDraft.imagePrompt || ''} onChange={(event) => setAiDraft({ ...aiDraft, imagePrompt: event.target.value })} />
                    </Grid>
                  </Grid>
                  {Boolean(aiDraft.checklist?.length) && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <strong>Antes de enviar:</strong> {aiDraft.checklist.join(' · ')}
                    </Alert>
                  )}
                  {Boolean(aiDraft.assumptions?.length) && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      <strong>Datos por confirmar:</strong> {aiDraft.assumptions.join(' · ')}
                    </Alert>
                  )}
                  <Button variant="contained" onClick={applyAiDraft} sx={{ mt: 2 }}>Usar esta propuesta</Button>
                </Paper>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setAiOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

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

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Sesión de envío"
                    value={form.sessionId}
                    helperText="La campaña y su audiencia pertenecen exclusivamente a esta sesión."
                    InputProps={{ readOnly: true }}
                  />
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
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label="Filtrar por palabras en el nombre"
                    value={form.nameTerms}
                    onChange={(event) => setForm({ ...form, nameTerms: event.target.value })}
                    placeholder="restaurante, mercado, minimarket"
                    helperText="Separa varios términos con comas. La búsqueda no distingue mayúsculas en la configuración habitual de la base de datos."
                    inputProps={{ maxLength: 980 }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Cómo combinar palabras"
                    value={form.nameMatchMode}
                    onChange={(event) => setForm({ ...form, nameMatchMode: event.target.value })}
                    helperText="Cualquiera amplía; todas restringe."
                  >
                    <MenuItem value="any">Contiene cualquiera</MenuItem>
                    <MenuItem value="all">Contiene todas</MenuItem>
                  </TextField>
                </Grid>
              </Grid>

              {audiencePreview.error && <Alert severity="error">{audiencePreview.error}</Alert>}
              {!audiencePreviewLoading && audiencePreview.count === 0 && (
                <Alert severity="warning">
                  Ningún contacto coincide con estos filtros. Ajusta las clasificaciones o las palabras del nombre.
                </Alert>
              )}

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
                    <Typography variant="body2" color="text.secondary">
                      {nameFilterSummary}
                    </Typography>
                    {Boolean(audiencePreview.samples.length) && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                        Ejemplos: {audiencePreview.samples.map((contact) => contact.name).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    icon={<TuneOutlined />}
                    color="primary"
                    variant="outlined"
                    label={audiencePreviewLoading
                      ? 'Calculando…'
                      : audiencePreview.count === null
                        ? 'Sin estimación'
                        : `${audiencePreview.count} ${audiencePreview.count === 1 ? 'contacto' : 'contactos'}`}
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
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      select
                      label="Tipo de archivo"
                      value={form.messageType}
                      onChange={(event) => setForm({ ...form, messageType: event.target.value })}
                    >
                      {Object.entries(mediaTypeLabels).map(([value, label]) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={8}>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      value={form.mediaSource}
                      onChange={(_event, value) => {
                        if (!value) return;
                        setForm({
                          ...form,
                          mediaSource: value,
                          mediaPayload: '',
                          mediaUrl: '',
                          mediaBase64: '',
                          mediaSize: 0,
                        });
                      }}
                    >
                      <ToggleButton value="upload">Subir archivo</ToggleButton>
                      <ToggleButton value="url">URL</ToggleButton>
                      <ToggleButton value="base64">Base64</ToggleButton>
                    </ToggleButtonGroup>
                  </Grid>
                </Grid>
              )}

              {isMediaMessage && form.mediaSource === 'upload' && (
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

              {isMediaMessage && form.mediaSource === 'url' && (
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

              {isMediaMessage && form.mediaSource === 'base64' && (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={4}
                      label="Contenido Base64"
                      value={form.mediaBase64}
                      onChange={(event) => setForm({ ...form, mediaBase64: event.target.value.trim() })}
                      placeholder="iVBORw0KGgo... o data:image/png;base64,iVBORw0KGgo..."
                      helperText="Acepta Base64 puro o data URI. Máximo 10 MB una vez decodificado."
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Tipo MIME"
                      value={form.mediaMimeType}
                      onChange={(event) => setForm({ ...form, mediaMimeType: event.target.value })}
                      placeholder="image/png, video/mp4, audio/mpeg..."
                      helperText="Es obligatorio cuando pegas Base64 puro."
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Nombre del archivo"
                      value={form.mediaFilename}
                      onChange={(event) => setForm({ ...form, mediaFilename: event.target.value })}
                      placeholder="oferta.png"
                    />
                  </Grid>
                </Grid>
              )}

              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  spacing={1.5}
                  sx={{ mb: 2 }}
                >
                  <Box>
                    <Typography variant="subtitle2" fontWeight={900}>
                      {isMediaMessage ? 'Caption del archivo' : 'Contenido del mensaje'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {form.messageType === 'image' && hasMedia
                        ? 'La IA multimodal verá la imagen real y la relacionará con el tema de la campaña.'
                        : 'Escribe una idea y la IA la pulirá, o déjalo vacío para que redacte desde cero.'}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={captionGenerating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesome />}
                    disabled={captionGenerating || !form.name}
                    onClick={generateCaption}
                    sx={{ flexShrink: 0 }}
                  >
                    {captionGenerating
                      ? 'Redactando…'
                      : form.messageType === 'image' && hasMedia
                        ? 'Analizar imagen y redactar'
                        : form.message.trim()
                        ? 'Mejorar con IA'
                        : 'Redactar con IA'}
                  </Button>
                </Stack>
                <TextField
                  fullWidth
                  multiline
                  minRows={5}
                  label={isMediaMessage ? 'Caption' : 'Mensaje'}
                  value={form.message}
                  onChange={(event) => {
                    setCaptionNotice('');
                    setForm({ ...form, message: event.target.value });
                  }}
                  helperText="La IA usa el contexto empresarial de esta sesión. Puedes usar {{name}} y {{phone}} para personalizar."
                />
                {captionNotice && (
                  <Alert severity="success" sx={{ mt: 1.5 }} onClose={() => setCaptionNotice('')}>
                    {captionNotice}
                  </Alert>
                )}
                {captionImageDescription && (
                  <Alert severity="info" sx={{ mt: 1.5 }}>
                    <strong>Descripción detectada:</strong> {captionImageDescription}
                  </Alert>
                )}
              </Paper>

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
                          : 'Todos los contactos del CRM') +
                        '\n' +
                        nameFilterSummary +
                        (audiencePreview.count === null ? '' : `\nDestinatarios: ${audiencePreview.count}`)}
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
                disabled={creating || !form.sessionId || !form.name || audiencePreview.count === 0 || (isMediaMessage ? !hasMedia : !form.message)}
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
