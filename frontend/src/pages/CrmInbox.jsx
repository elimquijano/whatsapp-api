import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Grid, IconButton, InputAdornment,
  MenuItem, Paper, Stack, Switch, TextField, Tooltip, Typography, useMediaQuery,
  useTheme
} from '@mui/material';
import {
  ArrowBack, AttachFile, CallMade, CallMissed, CallReceived, Close, CloudDownload, InfoOutlined, LocationOn, PersonOutline,
  Refresh, Reply, Search, Send, SmartToy, WhatsApp
} from '@mui/icons-material';
import axios from 'axios';
import { useOutletContext, useParams } from 'react-router-dom';

const statusInfo = {
  new: { label: 'Nuevo', tone: 'default' },
  interested: { label: 'Interesado', tone: 'info' },
  urgent: { label: 'Urgente', tone: 'error' },
  follow_up: { label: 'Seguimiento', tone: 'warning' },
  customer: { label: 'Cliente', tone: 'success' },
  not_interested: { label: 'No interesado', tone: 'default' },
};

const automationInfo = (contact, sessionAutoEnabled) => {
  const inherited = contact?.automationMode === 'inherit';
  const enabled = contact?.automationMode === 'automatic' || (inherited && Boolean(sessionAutoEnabled));
  if (inherited) return {
    enabled,
    label: enabled ? 'Hereda IA' : 'Hereda humano',
    description: enabled ? 'IA activa por la configuración general' : 'IA pausada por la configuración general',
  };
  return {
    enabled,
    label: enabled ? 'IA en este chat' : 'Atención humana',
    description: enabled ? 'Excepción: la IA responde solo en este chat' : 'Excepción: este chat lo atiende una persona',
  };
};

const newImportForm = () => ({
  name: 'Sistema de ventas',
  method: 'GET',
  url: '',
  authType: 'none',
  authHeader: '',
  authValue: '',
  headers: '{}',
  requestBody: '{}',
  responsePath: 'data',
  fieldMapping: '{\n  "phone": "phone",\n  "name": "name",\n  "externalId": "id"\n}',
});

const importSourceForm = (source) => ({
  ...source,
  authValue: '',
  headers: JSON.stringify(source.headers || {}, null, 2),
  requestBody: JSON.stringify(source.requestBody || {}, null, 2),
  fieldMapping: JSON.stringify(source.fieldMapping || {}, null, 2),
});

const messageDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((startOfToday - startOfDate) / 86400000);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (daysAgo === 0) return time;
  if (daysAgo === 1) return `Ayer, ${time}`;
  const formattedDate = date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${formattedDate}, ${time}`;
};

const conversationDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((startOfToday - startOfDate) / 86400000);
  if (daysAgo === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (daysAgo === 1) return 'Ayer';
  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: '2-digit' }),
  });
};

const LinkifiedText = ({ children }) => String(children || '').split(/(https?:\/\/[^\s]+)/gi).map((part, index) => (
  /^https?:\/\//i.test(part)
    ? <Box component="a" key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" sx={{ color: 'inherit', textDecoration: 'underline' }}>{part}</Box>
    : part
));

const MessageContent = memo(({ item, sessionId, contactId }) => {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaError, setMediaError] = useState(false);
  const type = item.messageType || 'text';
  const mediaEndpoint = `/api/v1/sessions/${sessionId}/crm/contacts/${contactId}/messages/${item.id}/media`;

  useEffect(() => {
    if (!item.media?.available) return undefined;
    let active = true;
    let objectUrl = '';
    axios.get(mediaEndpoint, { responseType: 'blob' }).then(({ data }) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(data);
      setMediaUrl(objectUrl);
    }).catch(() => active && setMediaError(true));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaEndpoint, item.media?.available]);

  const quoted = item.quoted && (
    <Paper elevation={0} sx={{ mb: 0.75, px: 1, py: 0.65, bgcolor: 'rgba(0,0,0,0.07)', borderLeft: 4, borderLeftColor: '#00a884', borderRadius: 1 }}>
      <Typography variant="caption" fontWeight={600} noWrap component="div">{item.quoted.content || 'Mensaje'}</Typography>
    </Paper>
  );

  if (type === 'call') {
    const missed = /perdida|no contestada/i.test(item.content || '');
    const outgoing = item.direction === 'outgoing';
    const CallIcon = missed ? CallMissed : outgoing ? CallMade : CallReceived;
    return <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 190 }}><Avatar sx={{ width: 36, height: 36, bgcolor: missed ? 'error.main' : 'success.main' }}><CallIcon fontSize="small" /></Avatar><Box><Typography variant="body2" fontWeight={600}>{String(item.content || '').replace(/^\[|\]$/g, '')}</Typography><Typography variant="caption" sx={{ opacity: 0.7 }}>{outgoing ? 'Saliente' : 'Entrante'}</Typography></Box></Stack>;
  }

  if (item.location) {
    const { latitude, longitude, live, name } = item.location;
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    return <>{quoted}<Stack component="a" href={mapUrl} target="_blank" rel="noreferrer" direction="row" spacing={1} alignItems="center" sx={{ color: 'inherit', textDecoration: 'none', minWidth: 220 }}><LocationOn /><Box><Typography variant="body2" fontWeight={700}>{live ? 'Ubicación en tiempo real' : (name || 'Ubicación compartida')}</Typography><Typography variant="caption">Abrir en el mapa</Typography></Box></Stack></>;
  }

  if (item.media?.available) {
    if (!mediaUrl && !mediaError) return <Box sx={{ minWidth: 180, py: 2, textAlign: 'center' }}><CircularProgress size={24} color="inherit" /></Box>;
    if (mediaError) return <Alert severity="warning">No se pudo cargar este archivo.</Alert>;
    return <Stack spacing={0.75}>{quoted}
      {item.viewOnce && <Chip size="small" label="Ver una vez" variant="outlined" sx={{ alignSelf: 'flex-start' }} />}
      {(type === 'image' || type === 'sticker') && <Box component="img" src={mediaUrl} alt={type === 'sticker' ? 'Sticker' : 'Imagen'} sx={{ display: 'block', maxWidth: '100%', width: type === 'sticker' ? 180 : 360, maxHeight: 420, objectFit: 'contain', borderRadius: 1 }} />}
      {type === 'gif' && <Box component="video" src={mediaUrl} autoPlay loop muted playsInline sx={{ display: 'block', maxWidth: '100%', maxHeight: 420, borderRadius: 1 }} />}
      {type === 'video' && <Box component="video" src={mediaUrl} controls playsInline sx={{ display: 'block', maxWidth: '100%', maxHeight: 420, borderRadius: 1 }} />}
      {type === 'audio' && <Box component="audio" src={mediaUrl} controls sx={{ display: 'block', maxWidth: '100%' }} />}
      {type === 'document' && <Button component="a" href={mediaUrl} download={item.media.filename} color="inherit" startIcon={<AttachFile />} sx={{ justifyContent: 'flex-start', textTransform: 'none' }}>{item.media.filename || 'Descargar archivo'}</Button>}
      {item.content && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><LinkifiedText>{item.content}</LinkifiedText></Typography>}
    </Stack>;
  }

  return <>{quoted}<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><LinkifiedText>{item.content}</LinkifiedText></Typography></>;
});

const MessageList = memo(({ messages, sessionId, contactId, onReply }) => (
  <Stack spacing={0.5} sx={{ minHeight: '100%', justifyContent: messages.length ? 'flex-start' : 'center' }}>
    {!messages.length && <Typography variant="body2" color="text.secondary" textAlign="center">Todavía no hay mensajes en esta conversación.</Typography>}
    {messages.map((item) => {
      const outgoing = item.direction === 'outgoing';
      return (
        <Box key={item.id} sx={{ alignSelf: outgoing ? 'flex-end' : 'flex-start', maxWidth: { xs: '88%', sm: '78%' }, position: 'relative', '&:hover .reply-action, &:focus-within .reply-action': { opacity: 1 } }}>
          <Box sx={{ bgcolor: outgoing ? '#d9fdd3' : '#fff', color: '#111b21', px: 1.25, pt: 0.75, pb: 0.5, borderRadius: 1.25, boxShadow: '0 1px 1px rgba(11,20,26,.13)' }}>
            <MessageContent item={item} sessionId={sessionId} contactId={contactId} />
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 0.25, color: '#667781', fontSize: 10.5 }}>
              {messageDate(item.messageTimestamp || item.createdAt)}
            </Typography>
          </Box>
          {item.canReply && <Tooltip title="Responder"><IconButton className="reply-action" size="small" onClick={() => onReply(item)} aria-label="Responder a este mensaje" sx={{ position: 'absolute', top: 2, [outgoing ? 'left' : 'right']: -32, opacity: 0, color: '#54656f', transition: 'opacity .1s', '&:focus-visible': { opacity: 1 } }}><Reply sx={{ fontSize: 17 }} /></IconButton></Tooltip>}
        </Box>
      );
    })}
  </Stack>
));

const ChatComposer = memo(({ sending, replyingTo, onCancelReply, onSend }) => {
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);

  const submit = async () => {
    if (sending || (!draft.trim() && !attachment)) return;
    const sent = await onSend(draft, attachment);
    if (sent) {
      setDraft('');
      setAttachment(null);
    }
  };

  return (
    <Box sx={{ p: 1.25, display: 'flex', alignItems: 'flex-end', gap: 1, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', position: { xs: 'sticky', lg: 'static' }, bottom: 0, zIndex: 2 }}>
      <IconButton component="label" disabled={sending} aria-label="Adjuntar archivo" sx={{ mb: 2.75, border: 1, borderColor: 'divider' }}>
        <AttachFile />
        <input hidden type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => {
          const file = event.target.files?.[0] || null;
          if (file?.size > 10 * 1024 * 1024) return;
          setAttachment(file);
        }} />
      </IconButton>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {(replyingTo || attachment) && <Paper variant="outlined" sx={{ mb: 0.75, px: 1, py: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              {replyingTo && <Typography variant="caption" noWrap component="div">Respondiendo a: {replyingTo.content || replyingTo.messageType}</Typography>}
              {attachment && <Typography variant="caption" noWrap component="div">Adjunto: {attachment.name}</Typography>}
            </Box>
            <IconButton size="small" onClick={() => { onCancelReply(); setAttachment(null); }} aria-label="Quitar respuesta y adjunto"><Close fontSize="small" /></IconButton>
          </Stack>
        </Paper>}
        <TextField fullWidth multiline maxRows={4} size="small" placeholder="Escribe una respuesta…" helperText="Al enviar, este chat pasará a atención humana." value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} />
      </Box>
      <IconButton color="primary" disabled={sending || (!draft.trim() && !attachment)} onClick={submit} aria-label="Enviar mensaje" sx={{ mb: 2.75, border: 1, borderColor: 'divider' }}>
        {sending ? <CircularProgress size={22} /> : <Send />}
      </IconButton>
    </Box>
  );
});

const CrmInbox = () => {
  const theme = useTheme();
  const isCompactLayout = useMediaQuery(theme.breakpoints.down('lg'));
  const { sessionId = '' } = useParams();
  const { session: selectedSession, reloadSessions } = useOutletContext();
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [sessionAutomationSaving, setSessionAutomationSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('contacts');
  const messageViewportRef = useRef(null);
  const renderedConversationRef = useRef({ contactId: null, signature: '', visible: false });
  const contactsRequestRef = useRef({ id: 0, controller: null });
  const messagesRequestRef = useRef({ id: 0, controller: null });
  const messagesLoadingRef = useRef(false);
  const selectedRef = useRef(null);
  const contactMutationRef = useRef({
    id: 0,
    queues: new Map(),
    latestFields: new Map(),
    pendingByContact: new Map(),
  });

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    contactsRequestRef.current.controller?.abort();
    messagesRequestRef.current.controller?.abort();
    setContacts([]);
    setSelected(null);
    selectedRef.current = null;
    setMessages([]);
    setReplyingTo(null);
    setImportOpen(false);
    setMobilePanel('contacts');
  }, [sessionId]);

  const loadContacts = useCallback(async () => {
    if (!sessionId) return;
    contactsRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = contactsRequestRef.current.id + 1;
    contactsRequestRef.current = { id: requestId, controller };
    try {
      const { data } = await axios.get(`/api/v1/sessions/${sessionId}/crm/contacts`, {
        params: { ...(search ? { search } : {}), ...(status ? { status } : {}) },
        signal: controller.signal,
      });
      if (contactsRequestRef.current.id !== requestId) return;
      const nextContacts = (data.contacts || []).map((contact) => {
        const pending = contactMutationRef.current.pendingByContact.get(String(contact.id));
        if (!pending?.size) return contact;
        return {
          ...contact,
          ...Object.fromEntries([...pending.entries()].map(([field, entry]) => [field, entry.value])),
        };
      });
      setContacts(nextContacts);
      setSelected((current) => {
        if (!current) return null;
        const fresh = nextContacts.find((item) => String(item.id) === String(current.id));
        if (!fresh) return current;
        return { ...fresh, name: current.name, notes: current.notes, tags: current.tags };
      });
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.error || 'No se pudieron cargar los contactos');
    }
  }, [sessionId, search, status]);

  useEffect(() => {
    loadContacts();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') loadContacts(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      contactsRequestRef.current.controller?.abort();
    };
  }, [loadContacts]);

  const loadMessages = useCallback(async () => {
    if (!selected?.id || messagesLoadingRef.current) return;
    messagesLoadingRef.current = true;
    const controller = new AbortController();
    const requestId = messagesRequestRef.current.id + 1;
    const contactId = selected.id;
    messagesRequestRef.current = { id: requestId, controller };
    try {
      const { data } = await axios.get(`/api/v1/sessions/${sessionId}/crm/contacts/${contactId}/messages`, { signal: controller.signal });
      if (messagesRequestRef.current.id !== requestId) return;
      const nextMessages = data.messages || [];
      setMessages((current) => {
        const isUnchanged = current.length === nextMessages.length
          && current.every((item, index) => {
            const next = nextMessages[index];
            return String(item.id) === String(next?.id)
              && item.direction === next?.direction
              && item.content === next?.content
              && (item.messageTimestamp || item.createdAt) === (next?.messageTimestamp || next?.createdAt);
          });
        return isUnchanged ? current : nextMessages;
      });
      if (Number(selectedRef.current?.unreadCount) > 0) {
        await axios.put(`/api/v1/sessions/${sessionId}/crm/contacts/${contactId}/read`, undefined, { signal: controller.signal });
        setContacts((current) => current.map((item) => String(item.id) === String(contactId) ? { ...item, unreadCount: 0 } : item));
      }
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.error || 'No se pudo cargar la conversación');
    } finally { messagesLoadingRef.current = false; }
  }, [selected?.id, sessionId]);

  useEffect(() => {
    loadMessages();
    return () => {
      messagesRequestRef.current.controller?.abort();
    };
  }, [loadMessages]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const controller = new AbortController();
    let reconnectTimer;
    let active = true;

    const connect = async () => {
      try {
        const token = localStorage.getItem('token');
        const url = axios.getUri({ url: `/api/v1/sessions/${sessionId}/crm/events` });
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('Canal CRM no disponible');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          if (events.some((event) => event.includes('event: update'))) {
            loadContacts();
            if (selectedRef.current?.id) loadMessages();
          }
        }
      } catch (eventError) {
        if (eventError.name !== 'AbortError' && active) reconnectTimer = window.setTimeout(connect, 3000);
      }
    };
    connect();
    return () => { active = false; controller.abort(); window.clearTimeout(reconnectTimer); };
  }, [loadContacts, loadMessages, sessionId]);

  useLayoutEffect(() => {
    if (!selected?.id) return undefined;
    if (isCompactLayout && mobilePanel !== 'chat') {
      renderedConversationRef.current.visible = false;
      return undefined;
    }

    const lastMessage = messages[messages.length - 1];
    const signature = lastMessage
      ? `${messages.length}:${lastMessage.id}:${lastMessage.messageTimestamp || lastMessage.createdAt || ''}`
      : 'empty';
    const previous = renderedConversationRef.current;
    const sameConversation = String(previous.contactId) === String(selected.id);

    if (sameConversation && previous.signature === signature && previous.visible) return undefined;

    const viewport = messageViewportRef.current;
    if (!viewport) return undefined;
    const shouldAnimate = sameConversation
      && previous.visible
      && previous.signature
      && previous.signature !== 'empty';

    renderedConversationRef.current = { contactId: selected.id, signature, visible: true };

    if (!shouldAnimate) {
      viewport.scrollTop = viewport.scrollHeight;
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isCompactLayout, messages, mobilePanel, selected?.id]);

  const updateContact = async (patch) => {
    const target = selectedRef.current;
    if (!target?.id || !patch || typeof patch !== 'object') return;

    const contactId = String(target.id);
    const fields = Object.keys(patch);
    if (!fields.length) return;

    const mutationState = contactMutationRef.current;
    const mutationId = mutationState.id + 1;
    mutationState.id = mutationId;
    const previousValues = Object.fromEntries(fields.map((field) => [field, target[field]]));
    const pendingFields = mutationState.pendingByContact.get(contactId) || new Map();
    fields.forEach((field) => {
      mutationState.latestFields.set(`${contactId}:${field}`, mutationId);
      pendingFields.set(field, { mutationId, value: patch[field] });
    });
    mutationState.pendingByContact.set(contactId, pendingFields);

    const settleLatestFields = () => {
      const currentPending = mutationState.pendingByContact.get(contactId);
      fields.forEach((field) => {
        const fieldKey = `${contactId}:${field}`;
        if (mutationState.latestFields.get(fieldKey) !== mutationId) return;
        mutationState.latestFields.delete(fieldKey);
        if (currentPending?.get(field)?.mutationId === mutationId) currentPending.delete(field);
      });
      if (currentPending && currentPending.size === 0) mutationState.pendingByContact.delete(contactId);
    };

    const applyPatch = (values) => {
      if (!Object.keys(values).length) return;
      setSelected((current) => {
        if (String(current?.id) !== contactId) return current;
        const next = { ...current, ...values };
        selectedRef.current = next;
        return next;
      });
      setContacts((current) => current.map((item) => (
        String(item.id) === contactId ? { ...item, ...values } : item
      )));
    };

    // The switch and editable fields react immediately. Requests for the same
    // contact are serialized so an older response can never win in the DB.
    applyPatch(patch);
    const previousQueue = mutationState.queues.get(contactId) || Promise.resolve();
    const task = previousQueue.catch(() => {}).then(async () => {
      try {
        const { data } = await axios.put(`/api/v1/sessions/${sessionId}/crm/contacts/${contactId}`, patch);
        const confirmed = {};
        fields.forEach((field) => {
          if (mutationState.latestFields.get(`${contactId}:${field}`) === mutationId) {
            confirmed[field] = data.contact?.[field];
          }
        });
        applyPatch(confirmed);
        settleLatestFields();
      } catch (err) {
        const rollback = {};
        fields.forEach((field) => {
          if (mutationState.latestFields.get(`${contactId}:${field}`) === mutationId) {
            rollback[field] = previousValues[field];
          }
        });
        applyPatch(rollback);
        settleLatestFields();
        setError(err.response?.data?.error || 'No se pudo actualizar el cliente');
      }
    });

    mutationState.queues.set(contactId, task);
    try {
      await task;
    } finally {
      if (mutationState.queues.get(contactId) === task) mutationState.queues.delete(contactId);
    }
  };

  const sendMessage = async (content, attachment) => {
    const target = selectedRef.current;
    if ((!content.trim() && !attachment) || !target?.id) return false;
    const contactId = String(target.id);
    const optimisticId = `pending-${Date.now()}`;
    setError('');
    setSending(true);
    setMessages((current) => [...current, { id: optimisticId, direction: 'outgoing', messageType: attachment ? 'document' : 'text', content, createdAt: new Date().toISOString() }]);
    try {
      let media = {};
      if (attachment) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
          reader.readAsDataURL(attachment);
        });
        const type = attachment.type.startsWith('image/') ? 'image'
          : attachment.type.startsWith('video/') ? 'video'
            : attachment.type.startsWith('audio/') ? 'audio' : 'document';
        media = { type, payload: dataUrl, filename: attachment.name, mimetype: attachment.type || 'application/octet-stream' };
      }
      const { data } = await axios.post(`/api/v1/sessions/${sessionId}/crm/contacts/${contactId}/messages`, {
        message: content,
        quotedMessageId: replyingTo?.id,
        ...media,
      });
      setReplyingTo(null);
      setSelected((current) => {
        if (String(current?.id) !== contactId) return current;
        const next = { ...current, automationMode: 'human' };
        selectedRef.current = next;
        return next;
      });
      setContacts((current) => current.map((item) => (
        String(item.id) === contactId ? { ...item, automationMode: 'human' } : item
      )));
      if (data.message) setMessages((current) => current.map((item) => item.id === optimisticId ? data.message : item));
      window.setTimeout(() => { loadMessages(); loadContacts(); }, 250);
      return true;
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      setError(err.response?.data?.error || 'No se pudo enviar el mensaje');
      return false;
    }
    finally { setSending(false); }
  };

  const toggleSessionAutomation = async (enabled) => {
    if (!sessionId || sessionAutomationSaving) return;

    setError('');
    setSessionAutomationSaving(true);
    try {
      await axios.put(`/api/v1/sessions/${sessionId}/ai/toggle`, { enabled });
      await reloadSessions();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el modo general de IA');
    } finally {
      setSessionAutomationSaving(false);
    }
  };

  const selectedChatAutoEnabled = selected?.automationMode === 'automatic'
    || (selected?.automationMode === 'inherit' && Boolean(selectedSession?.aiAutoReplyEnabled));
  const selectedAutomation = automationInfo(selected, selectedSession?.aiAutoReplyEnabled);

  const handleContactSelect = (contact) => {
    messagesRequestRef.current.controller?.abort();
    setSelected(contact);
    selectedRef.current = contact;
    setMessages([]);
    setReplyingTo(null);
    setMobilePanel('chat');
  };

  return (
    <Box
      sx={{
        minWidth: 0,
        height: { xs: 'auto', lg: '100%' },
        minHeight: 0,
        p: { xs: 1.5, sm: 2, lg: 2.5 },
        display: { xs: 'block', lg: 'flex' },
        flexDirection: 'column',
        overflow: { xs: 'visible', lg: 'hidden' },
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2, flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" fontWeight={900} noWrap>Conversaciones</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
            Atiende un chat personalmente mientras la IA continúa con los demás.
          </Typography>
        </Box>
        <Stack
          direction="row"
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: { sm: 'flex-end' } }}
        >
          <Tooltip title="Define el modo predeterminado de la sesión. Los chats configurados como excepción mantienen su propio modo.">
            <Paper
              component="label"
              variant="outlined"
              sx={{
                minHeight: 40,
                px: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                cursor: sessionAutomationSaving ? 'wait' : 'pointer',
                bgcolor: selectedSession?.aiAutoReplyEnabled ? 'success.main' : 'background.paper',
                color: selectedSession?.aiAutoReplyEnabled ? 'success.contrastText' : 'text.primary',
                transition: (theme) => theme.transitions.create(['background-color', 'color']),
              }}
            >
              <SmartToy fontSize="small" />
              <Box sx={{ lineHeight: 1, minWidth: 82 }}>
                <Typography variant="caption" component="div" fontWeight={800} color="inherit">IA general</Typography>
                <Typography variant="caption" component="div" color="inherit" sx={{ opacity: 0.78 }}>
                  {selectedSession?.aiAutoReplyEnabled ? 'Activada' : 'Pausada'}
                </Typography>
              </Box>
              <Switch
                size="small"
                color="default"
                checked={Boolean(selectedSession?.aiAutoReplyEnabled)}
                disabled={!sessionId || sessionAutomationSaving}
                onChange={(event) => toggleSessionAutomation(event.target.checked)}
                inputProps={{ 'aria-label': 'Cambiar el modo general de IA de la sesión' }}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: 'common.white' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'common.white' },
                }}
              />
              {sessionAutomationSaving && <CircularProgress size={14} color="inherit" />}
            </Paper>
          </Tooltip>
          <Tooltip title="Actualizar conversaciones">
            <span>
              <IconButton size="small" disabled={!sessionId} onClick={loadContacts} sx={{ border: 1, borderColor: 'divider' }} aria-label="Actualizar conversaciones">
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<CloudDownload />} disabled={!sessionId} onClick={() => setImportOpen(true)}>
            Importar
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, flexShrink: 0 }}>{error}</Alert>}

      {!sessionId ? (
        <Alert severity="info">Conecta una sesión de WhatsApp para usar el CRM.</Alert>
      ) : (
        <Paper
          variant="outlined"
          elevation={0}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(250px, 1fr) minmax(390px, 1.5fr) minmax(250px, 1fr)' },
            flex: { lg: 1 },
            height: { xs: 'auto', lg: 'auto' },
            minHeight: 0,
            overflow: { xs: 'visible', lg: 'hidden' },
            borderRadius: 3,
            bgcolor: 'background.paper',
          }}
        >
          <Box
            component="section"
            aria-label="Lista de conversaciones"
            sx={{
              minWidth: 0,
              minHeight: 0,
              display: { xs: mobilePanel === 'contacts' ? 'flex' : 'none', lg: 'flex' },
              flexDirection: 'column',
              borderRight: { xs: 0, lg: 1 },
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>Chats</Typography>
                  <Typography variant="caption" color="text.secondary">{contacts.length} conversaciones</Typography>
                </Box>
                <Chip size="small" label={status ? statusInfo[status]?.label : 'Todos'} variant="outlined" />
              </Stack>
              <TextField
                fullWidth
                size="small"
                placeholder="Buscar cliente o número"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
              />
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75} sx={{ mt: 1.25 }}>
                <Chip size="small" label="Todos" color={!status ? 'primary' : 'default'} variant={!status ? 'filled' : 'outlined'} onClick={() => setStatus('')} />
                {Object.entries(statusInfo).map(([key, item]) => (
                  <Chip
                    key={key}
                    size="small"
                    label={item.label}
                    color={status === key ? (item.tone === 'default' ? 'primary' : item.tone) : 'default'}
                    variant={status === key ? 'filled' : 'outlined'}
                    onClick={() => setStatus(key)}
                  />
                ))}
              </Stack>
            </Box>
            <Divider />

            <Box sx={{ flexGrow: { lg: 1 }, minHeight: 0, overflowY: { xs: 'visible', lg: 'auto' } }}>
              {contacts.map((contact) => {
                const contactStatus = statusInfo[contact.status] || statusInfo.new;
                const contactAutomation = automationInfo(contact, selectedSession?.aiAutoReplyEnabled);
                const isNeutralStatus = contactStatus.tone === 'default';
                const isSelected = String(selected?.id) === String(contact.id);
                return (
                  <Box
                    key={contact.id}
                    role="button"
                    tabIndex={0}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => handleContactSelect(contact)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') handleContactSelect(contact); }}
                    sx={{
                      p: 1.5,
                      display: 'flex',
                      gap: 1.25,
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'action.selected' : 'background.paper',
                      borderBottom: 1,
                      borderColor: 'divider',
                      transition: (theme) => theme.transitions.create('background-color'),
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
                    }}
                  >
                    <Avatar sx={{
                      width: 42,
                      height: 42,
                      bgcolor: isNeutralStatus ? 'action.selected' : `${contactStatus.tone}.main`,
                      color: isNeutralStatus ? 'text.primary' : `${contactStatus.tone}.contrastText`,
                    }}>
                      {(contact.name || contact.phone)[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Stack direction="row" alignItems="baseline" spacing={1}>
                        <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1 }}>{contact.name || contact.phone}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {conversationDate(contact.lastMessageAt)}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" noWrap>{contact.lastMessagePreview || 'Sin mensajes'}</Typography>
                      <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.5} alignItems="center" sx={{ mt: 0.75 }}>
                        <Chip size="small" color={contactStatus.tone} variant="outlined" label={contactStatus.label} sx={{ height: 21, fontSize: 10 }} />
                        <Chip size="small" color={contactAutomation.enabled ? 'success' : 'default'} label={contactAutomation.label} sx={{ height: 21, fontSize: 10 }} />
                        {contact.priority > 0 && <Chip size="small" color="error" variant="outlined" label={`P${contact.priority}`} sx={{ height: 21, fontSize: 10 }} />}
                      </Stack>
                    </Box>
                    {contact.unreadCount > 0 && <Chip size="small" color="success" label={contact.unreadCount} sx={{ alignSelf: 'center', minWidth: 28 }} />}
                  </Box>
                );
              })}
              {!contacts.length && (
                <Stack alignItems="center" spacing={1} sx={{ px: 3, py: 6, color: 'text.secondary', textAlign: 'center' }}>
                  <Search />
                  <Typography variant="body2">No hay conversaciones con estos filtros.</Typography>
                </Stack>
              )}
            </Box>
          </Box>

          <Box
            component="section"
            aria-label="Conversación"
            sx={{
              minWidth: 0,
              minHeight: 0,
              display: { xs: mobilePanel === 'chat' ? 'flex' : 'none', lg: 'flex' },
              flexDirection: 'column',
              bgcolor: 'transparent',
            }}
          >
            {!selected ? (
              <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ minHeight: { xs: '55dvh', lg: '100%' }, p: 4, color: 'text.secondary', textAlign: 'center' }}>
                <WhatsApp sx={{ fontSize: 64, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.primary">Selecciona una conversación</Typography>
                <Typography variant="body2">Elige un contacto para revisar sus mensajes.</Typography>
              </Stack>
            ) : (
              <>
                <Box sx={{
                  p: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'background.paper',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}>
                  <IconButton onClick={() => setMobilePanel('contacts')} sx={{ display: { xs: 'inline-flex', lg: 'none' } }} aria-label="Volver a conversaciones">
                    <ArrowBack />
                  </IconButton>
                  <Avatar sx={{ width: 38, height: 38 }}>{(selected.name || selected.phone)[0]?.toUpperCase()}</Avatar>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} noWrap>{selected.name || selected.phone}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">+{selected.phone}</Typography>
                  </Box>
                  <Tooltip title={selectedAutomation.description}>
                    <Chip
                      size="small"
                      color={selectedAutomation.enabled ? 'success' : 'default'}
                      variant="outlined"
                      icon={selectedAutomation.enabled ? <SmartToy /> : undefined}
                      label={selectedAutomation.label}
                      sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Tooltip>
                  <Tooltip title={selectedChatAutoEnabled ? 'Pausar IA solo en este chat' : 'Activar IA solo en este chat'}>
                    <Switch
                      size="small"
                      color="success"
                      checked={selectedChatAutoEnabled}
                      onChange={(event) => updateContact({ automationMode: event.target.checked ? 'automatic' : 'human' })}
                      inputProps={{ 'aria-label': 'Cambiar modo de atención del chat' }}
                    />
                  </Tooltip>
                  <Tooltip title="Ver ficha del cliente">
                    <IconButton onClick={() => setMobilePanel('details')} sx={{ display: { xs: 'inline-flex', lg: 'none' } }} aria-label="Ver ficha del cliente">
                      <InfoOutlined />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Box ref={messageViewportRef} sx={{
                  flexGrow: 1,
                  height: { xs: 'min(58dvh, 560px)', lg: 'auto' },
                  minHeight: { xs: 360, lg: 0 },
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  p: { xs: 1.25, sm: 2 },
                  backgroundColor: 'transparent',
                }}>
                  <MessageList messages={messages} sessionId={sessionId} contactId={selected.id} onReply={setReplyingTo} />
                </Box>

                <ChatComposer
                  key={selected.id}
                  sending={sending}
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                  onSend={sendMessage}
                />
              </>
            )}
          </Box>

          <Box
            component="aside"
            aria-label="Ficha del cliente"
            sx={{
              minWidth: 0,
              minHeight: 0,
              display: { xs: mobilePanel === 'details' ? 'flex' : 'none', lg: 'flex' },
              flexDirection: 'column',
              overflowY: { xs: 'visible', lg: 'auto' },
              bgcolor: 'background.paper',
              borderLeft: { xs: 0, lg: 1 },
              borderColor: 'divider',
            }}
          >
            {!selected ? (
              <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height: '100%', p: 3, color: 'text.secondary', textAlign: 'center' }}>
                <PersonOutline sx={{ fontSize: 48, color: 'text.disabled' }} />
                <Typography variant="subtitle1" color="text.primary">Ficha del cliente</Typography>
                <Typography variant="body2">Selecciona un chat para ver sus datos.</Typography>
              </Stack>
            ) : (
              <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <IconButton onClick={() => setMobilePanel('chat')} sx={{ display: { xs: 'inline-flex', lg: 'none' } }} aria-label="Volver al chat">
                    <ArrowBack />
                  </IconButton>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" fontWeight={800}>Ficha del cliente</Typography>
                    <Typography variant="caption" color="text.secondary">Datos y modo de atención</Typography>
                  </Box>
                </Stack>

                <Paper variant="outlined" elevation={0} sx={{ p: 1.5, mb: 2, bgcolor: 'background.default' }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Avatar>{(selected.name || selected.phone)[0]?.toUpperCase()}</Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="subtitle2" noWrap>{selected.name || selected.phone}</Typography>
                      <Typography variant="caption" color="text.secondary">+{selected.phone}</Typography>
                    </Box>
                    <Chip size="small" color={selectedAutomation.enabled ? 'success' : 'default'} label={selectedAutomation.label} />
                  </Stack>
                </Paper>

                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Nombre"
                    value={selected.name || ''}
                    onChange={(event) => setSelected((current) => ({ ...current, name: event.target.value }))}
                    onBlur={() => updateContact({ name: selected.name })}
                  />
                  <TextField fullWidth size="small" select label="Clasificación" value={selected.status} onChange={(event) => updateContact({ status: event.target.value })}>
                    {Object.entries(statusInfo).map(([key, item]) => <MenuItem key={key} value={key}>{item.label}</MenuItem>)}
                  </TextField>
                  <TextField fullWidth size="small" select label="Prioridad" value={selected.priority || 0} onChange={(event) => updateContact({ priority: Number(event.target.value) })}>
                    {[0, 1, 2, 3, 4, 5].map((value) => <MenuItem key={value} value={value}>{value === 0 ? 'Normal' : `Prioridad ${value}`}</MenuItem>)}
                  </TextField>
                  <TextField
                    fullWidth
                    size="small"
                    select
                    label="Modo de atención"
                    value={selected.automationMode}
                    onChange={(event) => updateContact({ automationMode: event.target.value })}
                    helperText={selectedAutomation.description}
                  >
                    <MenuItem value="inherit">Heredar de sesión</MenuItem>
                    <MenuItem value="automatic">IA automática</MenuItem>
                    <MenuItem value="human">Atención humana</MenuItem>
                  </TextField>
                  <Paper variant="outlined" elevation={0} sx={{ p: 1.25, bgcolor: 'background.default' }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.25 }}>
                      <InfoOutlined color="info" fontSize="small" sx={{ mt: 0.15 }} />
                      <Box>
                        <Typography variant="subtitle2" fontWeight={800}>Notas privadas del equipo</Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          Úsalas para registrar acuerdos, preferencias o recordatorios. Solo las ve tu equipo: no se envían por WhatsApp ni se incluyen en el contexto de la IA.
                        </Typography>
                      </Box>
                    </Stack>
                    <TextField
                      fullWidth
                      multiline
                      minRows={4}
                      label="Añadir una nota interna"
                      placeholder="Ej.: Prefiere entregas por la tarde; llamar antes de enviar."
                      value={selected.notes || ''}
                      onChange={(event) => setSelected((current) => ({ ...current, notes: event.target.value }))}
                      onBlur={() => updateContact({ notes: selected.notes })}
                      helperText="Se guarda al salir de este campo."
                    />
                  </Paper>
                  <TextField
                    fullWidth
                    size="small"
                    label="Etiquetas separadas por coma"
                    value={(selected.tags || []).join(', ')}
                    onChange={(event) => setSelected((current) => ({ ...current, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }))}
                    onBlur={() => updateContact({ tags: selected.tags })}
                  />
                </Stack>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      <ImportContactsDialog open={importOpen} onClose={() => setImportOpen(false)} sessionId={sessionId} onImported={loadContacts} />
    </Box>
  );
};

const ImportContactsDialog = ({ open, onClose, sessionId, onImported }) => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState(newImportForm);
  const [sources, setSources] = useState([]);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const sourcesRequestRef = useRef({ id: 0, controller: null });

  useEffect(() => {
    sourcesRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = sourcesRequestRef.current.id + 1;
    sourcesRequestRef.current = { id: requestId, controller };

    // Never carry an integration URL, headers or source id into another
    // WhatsApp session while its own source is still loading.
    setSaved(null);
    setSources([]);
    setForm(newImportForm());
    setMessage(null);
    setSourceLoading(Boolean(open && sessionId));
    if (!open || !sessionId) return () => controller.abort();

    axios.get(`/api/v1/sessions/${sessionId}/crm/import-sources`, { signal: controller.signal })
      .then(({ data }) => {
        if (sourcesRequestRef.current.id !== requestId) return;
        const receivedSources = data.sources || [];
        setSources(receivedSources);
        const source = receivedSources[0];
        if (!source) return;
        setSaved(source);
        setForm(importSourceForm(source));
      })
      .catch((error) => {
        if (error.code !== 'ERR_CANCELED' && sourcesRequestRef.current.id === requestId) {
          setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudo cargar la fuente de importación' });
        }
      })
      .finally(() => {
        if (sourcesRequestRef.current.id === requestId) setSourceLoading(false);
      });

    return () => controller.abort();
  }, [open, sessionId]);

  const saveAndRun = async () => {
    if (sourceLoading) return;
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        ...form,
        id: saved?.id,
        headers: JSON.parse(form.headers || '{}'),
        requestBody: JSON.parse(form.requestBody || '{}'),
        fieldMapping: JSON.parse(form.fieldMapping || '{}'),
      };
      const savedResponse = await axios.post(`/api/v1/sessions/${sessionId}/crm/import-sources`, payload);
      setSaved(savedResponse.data.source);
      setSources((current) => {
        const exists = current.some((source) => String(source.id) === String(savedResponse.data.source.id));
        return exists
          ? current.map((source) => String(source.id) === String(savedResponse.data.source.id) ? savedResponse.data.source : source)
          : [...current, savedResponse.data.source];
      });
      const run = await axios.post(`/api/v1/sessions/${sessionId}/crm/import-sources/${savedResponse.data.source.id}/run`);
      setMessage({ type: 'success', text: `${run.data.imported} clientes importados de ${run.data.totalReceived}` });
      onImported?.();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth fullScreen={mobile} maxWidth="md">
      <DialogTitle>Importar clientes en la sesión {sessionId}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {sourceLoading && <Alert severity="info">Cargando la configuración de importación de esta sesión…</Alert>}
          {message && <Alert severity={message.type}>{message.text}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              fullWidth
              select
              label="Fuente de esta sesión"
              value={saved?.id || ''}
              onChange={(event) => {
                const source = sources.find((item) => String(item.id) === String(event.target.value));
                setSaved(source || null);
                setForm(source ? importSourceForm(source) : newImportForm());
                setMessage(null);
              }}
            >
              {!sources.length && <MenuItem value="" disabled>No hay fuentes guardadas</MenuItem>}
              {sources.map((source) => <MenuItem key={source.id} value={source.id}>{source.name}</MenuItem>)}
            </TextField>
            <Button
              variant="outlined"
              sx={{ flexShrink: 0 }}
              onClick={() => { setSaved(null); setForm(newImportForm()); setMessage(null); }}
            >
              Nueva fuente
            </Button>
          </Stack>
          <TextField fullWidth label="Nombre de la integración" value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Método" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                {['GET', 'POST'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth label="URL" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Autenticación" value={form.authType} onChange={(event) => setForm({ ...form, authType: event.target.value })}>
                {['none', 'bearer', 'basic', 'api_key', 'custom_header'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Header auth" value={form.authHeader || ''} onChange={(event) => setForm({ ...form, authHeader: event.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth type="password" label="Token/clave" value={form.authValue || ''} onChange={(event) => setForm({ ...form, authValue: event.target.value })} placeholder={saved?.hasAuthValue ? 'Guardado' : ''} />
            </Grid>
          </Grid>
          <TextField
            fullWidth
            label="Ruta de la lista en la respuesta"
            value={form.responsePath || ''}
            onChange={(event) => setForm({ ...form, responsePath: event.target.value })}
            helperText="Ejemplo: data, results.items o déjalo vacío si la respuesta ya es un array"
          />
          <TextField fullWidth multiline minRows={4} label="Headers JSON" value={form.headers} onChange={(event) => setForm({ ...form, headers: event.target.value })} InputProps={{ sx: { fontFamily: 'monospace' } }} />
          <TextField fullWidth multiline minRows={4} label="Body JSON" value={form.requestBody} onChange={(event) => setForm({ ...form, requestBody: event.target.value })} InputProps={{ sx: { fontFamily: 'monospace' } }} />
          <TextField
            fullWidth
            multiline
            minRows={5}
            label="Mapeo de campos JSON"
            value={form.fieldMapping}
            onChange={(event) => setForm({ ...form, fieldMapping: event.target.value })}
            helperText='Las rutas apuntan a cada objeto recibido: { "phone":"customer.phone", "name":"customer.name", "externalId":"id" }'
            InputProps={{ sx: { fontFamily: 'monospace' } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" disabled={loading || sourceLoading} onClick={saveAndRun}>
          {sourceLoading ? 'Cargando configuración...' : loading ? 'Importando...' : 'Guardar e importar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CrmInbox;
