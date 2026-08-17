import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Grid, IconButton, Menu, MenuItem, Paper, Select, Stack,
  Switch, Tab, Tabs, TextField, Tooltip, Typography, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add, AutoAwesome, CenterFocusStrong, CheckCircle, Close, Code, Delete,
  ErrorOutline, History, HourglassEmpty, Hub, Http, Link, PlayArrow, Psychology,
  Download, Refresh, Save, Send, Settings, SkipNext, Tune, Upload, ZoomIn, ZoomOut
} from '@mui/icons-material';
import axios from 'axios';
import JsonDataTree from './workflow/JsonDataTree';
import MainWorkflowEditor from './workflow/MainWorkflowEditor';
import AgentWorkflowCanvas from './workflow/AgentWorkflowCanvas';
import AgentStudio from './workflow/AgentStudio';
import { createWorkflowBundle, parseWorkflowBundle } from '../utils/workflowTransfer';
import useSmartPolling from '../hooks/useSmartPolling';

const nodeCatalog = [
  { type: 'agent_input', label: 'Entrada del agente', icon: <Send sx={{ transform: 'rotate(180deg)' }} />, color: '#16a34a', fixed: true },
  { type: 'http_request', label: 'HTTP Request', icon: <Http />, color: '#0284c7' },
  { type: 'script', label: 'Script', icon: <Code />, color: '#7c3aed' },
  { type: 'transform', label: 'Transformar', icon: <Tune />, color: '#9333ea' },
  { type: 'state_update', label: 'Actualizar estado', icon: <Settings />, color: '#475569' },
  { type: 'condition', label: 'Condición', icon: <Hub />, color: '#d97706' },
  { type: 'ai', label: 'Modelo IA', icon: <Psychology />, color: '#059669' },
  { type: 'agent_output', label: 'Salida del agente', icon: <Send />, color: '#0f766e', fixed: true },
];
const taskInsertCatalog = nodeCatalog.filter((item) => !item.fixed);
const legacyTaskNodeCatalog = {
  whatsapp_output: { type: 'whatsapp_output', label: 'Salida interna heredada', icon: <Send />, color: '#64748b' },
};

const globalNodeCatalog = {
  whatsapp_trigger: { label: 'Entrada WhatsApp', icon: <Send sx={{ transform: 'rotate(180deg)' }} />, color: '#0ea5e9' },
  preanalysis: { label: 'Preanálisis / cerebro', icon: <Psychology />, color: '#8b5cf6' },
  orchestrator: { label: 'Orquestador', icon: <Hub />, color: '#2563eb' },
  task_subworkflow: { label: 'Tarea / subworkflow', icon: <Tune />, color: '#d97706' },
  response_guard: { label: 'Validación de respuesta', icon: <CheckCircle />, color: '#059669' },
  whatsapp_output: { label: 'Salida WhatsApp', icon: <Send />, color: '#16a34a' },
};

const globalCoreNodes = [
  { key: 'whatsapp_trigger', name: 'Entrada WhatsApp', type: 'whatsapp_trigger', positionX: 50, positionY: 300 },
  { key: 'preanalysis', name: 'Preanálisis / Cerebro', type: 'preanalysis', positionX: 330, positionY: 300 },
  { key: 'orchestrator', name: 'Orquestador', type: 'orchestrator', positionX: 610, positionY: 300 },
  { key: 'response_guard', name: 'Validación', type: 'response_guard', positionX: 1260, positionY: 300 },
  { key: 'whatsapp_output', name: 'Salida WhatsApp', type: 'whatsapp_output', positionX: 1540, positionY: 300 },
];

const globalCoreDefaultConfigs = {
  whatsapp_trigger: { messageTypes: [] },
  preanalysis: { prompt: '', ignoreUnrelatedMessages: true },
  orchestrator: { prompt: '', fallbackTaskKey: '' },
  response_guard: { enabled: true, prompt: '', failureMode: 'use_proposed' },
  whatsapp_output: { contentTemplate: '' },
};

const normalizedTaskKey = (value, fallback = 'tarea') => String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || fallback;

const buildStarterMainWorkflow = (permissions = []) => {
  const agents = (permissions || []).map((permission, index) => ({
    key: `agent_${normalizedTaskKey(permission.key, `tarea_${index + 1}`)}`,
    name: permission.name || permission.key,
    type: 'agent', enabled: permission.enabled !== false,
    positionX: 920, positionY: 120 + (index * 180),
    config: { agentKey: normalizedTaskKey(permission.key, `tarea_${index + 1}`), inputMapping: {} },
  }));
  return {
    name: 'Workflow principal', version: 1, revision: 1, active: true,
    viewport: { x: 0, y: 0, zoom: 0.78 },
    nodes: [
      { key: 'whatsapp_input', name: 'Entrada WhatsApp', type: 'whatsapp_input', enabled: true, positionX: 60, positionY: 280, config: { messageTypes: [] } },
      { key: 'interaction_filter', name: '¿Debe responder?', type: 'interaction_filter', enabled: true, positionX: 360, positionY: 280, config: {} },
      { key: 'orchestrator', name: 'Orquestador', type: 'orchestrator', enabled: true, positionX: 660, positionY: 280, config: { fallbackAgentKey: '' } },
      ...agents,
      { key: 'whatsapp_output', name: 'Enviar WhatsApp', type: 'whatsapp_output', enabled: true, positionX: 1240, positionY: 280, config: { contentTemplate: '' } },
    ],
    edges: [
      { source: 'whatsapp_input', target: 'interaction_filter', sourceHandle: 'message', targetHandle: 'input' },
      { source: 'interaction_filter', target: 'orchestrator', sourceHandle: 'respond', targetHandle: 'input' },
      ...agents.flatMap((node, index) => [
        { source: 'orchestrator', target: node.key, sourceHandle: node.config.agentKey, targetHandle: 'input', sortOrder: index },
        { source: node.key, target: 'whatsapp_output', sourceHandle: 'output', targetHandle: 'input', sortOrder: index },
      ]),
    ],
  };
};

const addAgentToMainWorkflow = (workflow, permission, position = {}) => {
  if (!permission) return workflow;
  const agentKey = normalizedTaskKey(permission.key, 'tarea');
  if ((workflow?.nodes || []).some((node) => node.type === 'agent' && normalizedTaskKey(node.config?.agentKey) === agentKey)) return workflow;
  const used = new Set((workflow?.nodes || []).map((node) => node.key));
  let key = `agent_${agentKey}`;
  let suffix = 2;
  while (used.has(key)) key = `agent_${agentKey}_${suffix++}`;
  const node = {
    key, name: permission.name || agentKey, type: 'agent', enabled: permission.enabled !== false,
    positionX: Number(position.x ?? 920), positionY: Number(position.y ?? 120 + used.size * 28),
    config: { agentKey, inputMapping: {} },
  };
  return { ...(workflow || buildStarterMainWorkflow([])), nodes: [...(workflow?.nodes || []), node] };
};

const removeAgentFromMainWorkflow = (workflow, rawAgentKey) => {
  const agentKey = normalizedTaskKey(rawAgentKey, '');
  const removedKeys = new Set((workflow?.nodes || []).filter((node) => node.type === 'agent' && normalizedTaskKey(node.config?.agentKey, '') === agentKey).map((node) => node.key));
  return {
    ...(workflow || buildStarterMainWorkflow([])),
    nodes: (workflow?.nodes || []).filter((node) => !removedKeys.has(node.key)).map((node) => node.type === 'orchestrator' && normalizedTaskKey(node.config?.fallbackAgentKey, '') === agentKey ? { ...node, config: { ...(node.config || {}), fallbackAgentKey: '' } } : node),
    edges: (workflow?.edges || []).filter((edge) => !removedKeys.has(edge.source) && !removedKeys.has(edge.target)),
  };
};

const sameGlobalWorkflow = (left, right) => JSON.stringify(left || null) === JSON.stringify(right || null);

const syncGlobalWorkflow = (workflow, permissions = []) => {
  const current = workflow && typeof workflow === 'object' && !Array.isArray(workflow) ? workflow : {};
  const currentNodes = Array.isArray(current.nodes) ? current.nodes : [];
  const currentEdges = Array.isArray(current.edges) ? current.edges : [];
  const usedKeys = new Set();
  const core = globalCoreNodes.map((definition) => {
    const existing = currentNodes.find((node) => node?.key === definition.key || node?.type === definition.type);
    usedKeys.add(definition.key);
    return {
      ...(existing || {}),
      ...definition,
      enabled: true,
      positionX: Number(existing?.positionX ?? existing?.position?.x ?? definition.positionX),
      positionY: Number(existing?.positionY ?? existing?.position?.y ?? definition.positionY),
      config: {
        ...(globalCoreDefaultConfigs[definition.type] || {}),
        ...(existing?.config && typeof existing.config === 'object' ? existing.config : {}),
      },
    };
  });

  const permissionByKey = new Map((permissions || []).map((permission, index) => [
    normalizedTaskKey(permission?.key, `task_${index + 1}`),
    permission,
  ]));
  const unmatchedReferences = currentNodes.filter((node) => node?.type === 'task_subworkflow');
  const validReferences = [];
  const linkedTaskKeys = new Set();
  for (const node of unmatchedReferences) {
    const taskKey = normalizedTaskKey(node?.config?.taskKey, '');
    const permission = permissionByKey.get(taskKey);
    if (!taskKey || !permission || linkedTaskKeys.has(taskKey)) continue;
    linkedTaskKeys.add(taskKey);
    validReferences.push({ node, permission, taskKey });
  }
  const taskCount = Math.max(1, validReferences.length);
  const firstTaskY = Math.max(50, 300 - ((taskCount - 1) * 145) / 2);
  const taskNodes = validReferences.map(({ node: existing, permission, taskKey }, index) => {
    let key = existing?.key || `task_${taskKey}`;
    if (usedKeys.has(key)) key = `${key}_${index + 1}`;
    usedKeys.add(key);
    return {
      ...(existing || {}),
      key,
      name: permission?.name || taskKey,
      type: 'task_subworkflow',
      enabled: permission?.enabled !== false,
      positionX: Number(existing?.positionX ?? existing?.position?.x ?? 930),
      positionY: Number(existing?.positionY ?? existing?.position?.y ?? (firstTaskY + index * 145)),
      config: { ...(existing?.config || {}), taskKey },
    };
  });

  const findEdge = (source, target) => currentEdges.find((edge) => edge?.source === source && edge?.target === target);
  const edge = (source, target, extra = {}) => ({ ...(findEdge(source, target) || {}), source, target, ...extra });
  const edges = [
    edge('whatsapp_trigger', 'preanalysis'),
    edge('preanalysis', 'orchestrator'),
    ...taskNodes.flatMap((node) => [
      edge('orchestrator', node.key, { label: node.config.taskKey, sourceHandle: node.config.taskKey }),
      edge(node.key, 'response_guard'),
    ]),
    edge('response_guard', 'whatsapp_output'),
  ];

  return { version: 1, nodes: [...core, ...taskNodes], edges };
};

const linkTaskInGlobalWorkflow = (workflow, permissions = [], rawTaskKey, position = {}) => {
  const normalized = syncGlobalWorkflow(workflow, permissions);
  const taskKey = normalizedTaskKey(rawTaskKey, '');
  const permission = (permissions || []).find((item) => normalizedTaskKey(item.key) === taskKey);
  if (!taskKey || !permission || normalized.nodes.some((node) => node.type === 'task_subworkflow' && normalizedTaskKey(node.config?.taskKey) === taskKey)) return normalized;
  const usedNodeKeys = new Set(normalized.nodes.map((node) => node.key));
  let key = `task_${taskKey}`;
  let suffix = 2;
  while (usedNodeKeys.has(key)) key = `task_${taskKey}_${suffix++}`;
  const linkedCount = normalized.nodes.filter((node) => node.type === 'task_subworkflow').length;
  return syncGlobalWorkflow({
    ...normalized,
    nodes: [...normalized.nodes, {
      key,
      name: permission.name || taskKey,
      type: 'task_subworkflow',
      enabled: permission.enabled !== false,
      positionX: Number(position.x ?? 930),
      positionY: Number(position.y ?? Math.max(60, 300 - linkedCount * 70 + linkedCount * 145)),
      config: { taskKey, inputMapping: {} },
    }],
  }, permissions);
};

const unlinkTaskFromGlobalWorkflow = (workflow, permissions = [], rawTaskKey) => {
  const taskKey = normalizedTaskKey(rawTaskKey, '');
  return syncGlobalWorkflow({
    ...(workflow || {}),
    nodes: (workflow?.nodes || []).filter((node) => node.type !== 'task_subworkflow' || normalizedTaskKey(node.config?.taskKey) !== taskKey),
  }, permissions);
};

const defaultAgentInputFields = () => ([
  { name: 'message', type: 'string', required: true, description: 'Mensaje actual del cliente', source: 'message' },
  { name: 'messageType', type: 'string', required: true, description: 'Tipo de mensaje recibido', source: 'messageType' },
  { name: 'messageId', type: 'string', required: false, description: 'ID original de WhatsApp', source: 'messageId' },
  { name: 'contact', type: 'object', required: true, description: 'JID, teléfono y nombre del contacto', source: 'contact' },
  { name: 'arguments', type: 'object', required: false, description: 'Campos extraídos o mapeados por el orquestador', source: 'arguments' },
  { name: 'analysis', type: 'object', required: true, description: 'Resultado del filtro de interacción', source: 'analysis' },
  { name: 'state', type: 'object', required: false, description: 'Estado acumulado de la tarea', source: 'state' },
  { name: 'session', type: 'object', required: true, description: 'Sesión actual', source: 'session' },
  { name: 'task', type: 'object', required: true, description: 'Agente seleccionado y sus instrucciones', source: 'task' },
]);

const defaultAgentOutputFields = () => ([
  { name: 'content', type: 'string', required: true, description: 'Respuesta que recibirá la salida general', source: 'content' },
  { name: 'state', type: 'object', required: false, description: 'Estado actualizado', source: 'state' },
  { name: 'evidence', type: 'object', required: false, description: 'Datos verificados obtenidos por integraciones', source: 'evidence' },
  { name: 'nodes', type: 'object', required: false, description: 'Resultados de los nodos ejecutados', source: 'nodes' },
]);

const starterConfig = {
  workflowEngineVersion: 0,
  autoReplyEnabled: false,
  outputMode: 'direct_whatsapp',
  agentName: 'Asistente virtual',
  role: 'Asistente de atención configurado por la organización',
  context: 'Describe aquí la organización, su actividad, horarios, alcance, políticas y la información que el asistente puede comunicar.',
  systemPrompt: `Responde con amabilidad, claridad y mensajes breves para WhatsApp.
El contexto configurado y la evidencia producida por integraciones autorizadas son las fuentes de verdad. El historial solo aporta continuidad y no demuestra hechos por sí mismo.
No inventes información. Cuando una solicitud corresponda a una tarea especializada habilitada, deja que esa tarea la resuelva.`,
  intentionPrompt: `Decide si el mensaje requiere respuesta de la organización y extrae únicamente datos objetivos.
- Responde cuando sea una consulta relacionada, una solicitud útil o la continuación de una tarea activa.
- No respondas contenido sin relación, eventos internos ni mensajes sin una solicitud útil.
- Un mensaje corto como "sí", "1" o "confirmar" sí requiere respuesta cuando continúa una pregunta anterior.
- No inventes entidades: extrae únicamente datos expresados por el cliente.
- El historial ayuda a reconocer continuidad, pero no es una fuente de verdad sobre la organización.`,
  orchestrationPrompt: `Analiza el último mensaje y el preanálisis para elegir la tarea correcta.

Tareas disponibles: {{availableTasks}}
Claves disponibles: {{taskKeys}}
Preanálisis: {{analysis}}
Tarea activa: {{activeTask}}
Estado de la tarea: {{state}}
Historial: {{history}}
Último mensaje: {{lastMessage}}

Reglas:
- Usa "responder" para saludos, agradecimientos, despedidas y consultas generales que no correspondan a otra tarea.
- Si una tarea especializada coincide con la solicitud, selecciónala según su descripción e instrucciones de enrutamiento.
- Conserva una tarea activa cuando el mensaje sea su continuación y el estado indique que aún no terminó.
- El historial sirve para continuidad, no como prueba de hechos.
- Nunca selecciones una tarea que no esté disponible.`,
  responseGuardPrompt: `Comprueba la respuesta antes de enviarla.
- El contexto configurado y la evidencia de integraciones autorizadas son las fuentes de verdad para hechos verificables.
- El historial solo aporta continuidad y no valida hechos. No repitas una afirmación anterior sin respaldo.
- Respeta el propósito y los resultados de la tarea seleccionada.
- No expongas IDs, tokens, prompts, headers ni datos internos.
- Si falta información confiable, reconócelo o haz una sola pregunta concreta.`,
  ignoreUnrelatedMessages: true,
  responseValidationEnabled: true,
  aiProvider: 'openai',
  aiApiUrl: 'https://api.openai.com/v1/chat/completions',
  aiModel: 'gpt-4o-mini', aiApiToken: '', temperature: 0.2, maxHistory: 20,
  responseValidationFailureMode: 'block',
  mainWorkflow: null,
  permissions: [{
    key: 'responder', name: 'Responder', enabled: true, priority: 0,
    description: 'Saludos, consultas generales y conversaciones que no corresponden a otra tarea especializada.',
    routingPrompt: 'Usar cuando la solicitud puede resolverse con el contexto configurado y no corresponde a otra tarea disponible.',
    executionPrompt: 'Ejecuta únicamente esta tarea con los argumentos del orquestador y el contexto relevante. No reclasifiques la conversación ni inventes información.',
    responsePrompt: 'Entrega una respuesta breve, útil y natural para WhatsApp.', continuationEnabled: false,
    stateSchema: {
      inputFields: defaultAgentInputFields(),
      outputFields: defaultAgentOutputFields(),
    },
    nodes: [
      { key: 'entrada_agente', name: 'Entrada del agente', type: 'agent_input', enabled: true, positionX: 80, positionY: 180, config: {}, credentials: {} },
      { key: 'redactar_respuesta', name: 'Redactar con IA', type: 'ai', enabled: true, positionX: 400, positionY: 180, config: { useSessionModel: true, outputField: 'content', inputMapping: {}, contextCharBudget: 3000, maxOutputTokens: 400, outputFields: [{ name: 'content', type: 'string', source: 'content', required: true }, { name: 'stateUpdates', type: 'object', source: 'stateUpdates' }, { name: 'taskComplete', type: 'boolean', source: 'taskComplete' }], prompt: 'Redacta la respuesta usando los argumentos ya seleccionados y el contexto relevante. Haz únicamente esta tarea.' }, credentials: {} },
      { key: 'salida_agente', name: 'Salida del agente', type: 'agent_output', enabled: true, positionX: 720, positionY: 180, config: { outputMapping: { content: '{{nodes.redactar_respuesta.content}}', state: '{{state}}', evidence: '{{evidence}}', nodes: '{{nodes}}' } }, credentials: {} },
    ],
    edges: [
      { source: 'entrada_agente', target: 'redactar_respuesta', sourceHandle: 'output', targetHandle: 'input' },
      { source: 'redactar_respuesta', target: 'salida_agente', sourceHandle: 'output', targetHandle: 'input' },
    ],
  }],
};

const newStarterConfig = () => {
  const starter = JSON.parse(JSON.stringify(starterConfig));
  starter.mainWorkflow = buildStarterMainWorkflow(starter.permissions);
  return starter;
};

const normalizePermission = (permission = {}) => {
  const stateSchema = permission.stateSchema && typeof permission.stateSchema === 'object' && !Array.isArray(permission.stateSchema)
    ? permission.stateSchema
    : {};
  return {
    ...permission,
    stateSchema: {
      ...stateSchema,
      inputFields: Array.isArray(stateSchema.inputFields) && stateSchema.inputFields.length ? stateSchema.inputFields : defaultAgentInputFields(),
      outputFields: Array.isArray(stateSchema.outputFields) && stateSchema.outputFields.length ? stateSchema.outputFields : defaultAgentOutputFields(),
    },
    nodes: Array.isArray(permission.nodes) ? permission.nodes : [],
    edges: Array.isArray(permission.edges) ? permission.edges : [],
  };
};

const contractTypes = [
  ['any', 'Cualquier tipo'], ['string', 'Texto'], ['number', 'Número'], ['integer', 'Entero'],
  ['boolean', 'Sí / no'], ['object', 'Objeto'], ['array', 'Lista'],
];

const sampleForType = (field) => {
  if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) return field.defaultValue;
  if (field.type === 'boolean') return false;
  if (field.type === 'number' || field.type === 'integer') return 0;
  if (field.type === 'object') return {};
  if (field.type === 'array') return [];
  return field.description || `[${field.type || 'dato'}]`;
};

const contractPreview = (fields = []) => Object.fromEntries(fields.filter((field) => field?.name).map((field) => [field.name, sampleForType(field)]));

const providerDefaults = {
  openai: { aiApiUrl: 'https://api.openai.com/v1/chat/completions', aiModel: 'gpt-4o-mini' },
  groq: { aiApiUrl: 'https://api.groq.com/openai/v1/chat/completions', aiModel: 'llama-3.3-70b-versatile' },
  openai_compatible: { aiApiUrl: '', aiModel: '' },
  gemini: { aiApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{{model}}:generateContent', aiModel: 'gemini-2.5-flash' },
};

const dropToken = (event, mode = 'template') => {
  const supplied = event.dataTransfer.getData('application/x-workflow-token');
  if (supplied) return supplied;
  const path = event.dataTransfer.getData('application/x-workflow-path');
  if (!path) return event.dataTransfer.getData('text/plain');
  return mode === 'code' ? `input${String(path).startsWith('[') ? '' : '.'}${path}` : `{{${path}}}`;
};

const insertAtCursor = (value, token, target) => {
  const start = Number.isInteger(target?.selectionStart) ? target.selectionStart : String(value || '').length;
  const end = Number.isInteger(target?.selectionEnd) ? target.selectionEnd : start;
  return `${String(value || '').slice(0, start)}${token}${String(value || '').slice(end)}`;
};

const DroppableTextField = ({ dropMode = 'template', onChange, value, helperText, ...props }) => (
  <TextField
    {...props}
    value={value}
    onChange={onChange}
    onDragOver={(event) => {
      if (!event.dataTransfer.types.includes('application/x-workflow-path')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }}
    onDrop={(event) => {
      const token = dropToken(event, dropMode);
      if (!token) return;
      event.preventDefault();
      event.stopPropagation();
      onChange?.({ target: { value: insertAtCursor(value, token, event.target) } });
    }}
    helperText={helperText || (dropMode === 'code' ? 'Arrastra un dato aquí para insertar input.ruta.' : 'Arrastra un dato aquí para insertar {{ruta}}.')}
  />
);

const JsonField = ({ label, value, onChange, rows = 4, helperText = '', dropMode = 'template' }) => {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  useEffect(() => setText(JSON.stringify(value || {}, null, 2)), [value]);
  return (
    <TextField
      fullWidth multiline minRows={rows} label={label} value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => { try { onChange(JSON.parse(text || '{}')); } catch { /* conserva el último JSON válido */ } }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('application/x-workflow-path')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        const token = dropToken(event, dropMode);
        if (!token) return;
        event.preventDefault();
        event.stopPropagation();
        const path = event.dataTransfer.getData('application/x-workflow-path');
        const suggestedKey = String(path.split('.').pop() || 'dato').replace(/[^a-zA-Z0-9_]/g, '_');
        let next;
        if (Array.isArray(value)) next = [...value, token];
        else if (value && typeof value === 'object') next = { ...value, [suggestedKey]: token };
        else next = token;
        setText(JSON.stringify(next, null, 2));
        onChange(next);
      }}
      helperText={helperText || 'Arrastra una hoja de Entrada/Salida para agregarla como variable.'}
      InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
    />
  );
};

const ContractEditor = ({ title, description, fields = [], onChange, direction }) => {
  const update = (index, patch) => onChange(fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } : field));
  const remove = (index) => onChange(fields.filter((_, itemIndex) => itemIndex !== index));
  const add = () => onChange([...fields, {
    name: direction === 'input' ? `entrada_${fields.length + 1}` : `salida_${fields.length + 1}`,
    type: 'string', required: false, description: '', source: '',
  }]);
  const setDefault = (index, raw, type) => {
    if (raw === '') {
      const next = { ...fields[index] };
      delete next.defaultValue;
      onChange(fields.map((field, itemIndex) => itemIndex === index ? next : field));
      return;
    }
    let value = raw;
    if (type === 'number' || type === 'integer') value = Number(raw);
    if (type === 'boolean') value = raw === 'true';
    if (type === 'object' || type === 'array') {
      try { value = JSON.parse(raw); } catch { value = raw; }
    }
    update(index, { defaultValue: value });
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, height: '100%' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" fontWeight={800}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<Add />} onClick={add}>Variable</Button>
      </Stack>
      {!fields.length && <Alert severity="info">Todavía no definiste variables. El flujo seguirá funcionando, pero tendrá menos guía y validación.</Alert>}
      <Stack spacing={1.25}>
        {fields.map((field, index) => (
          <Paper key={`${direction}-${index}`} variant="outlined" sx={{ p: 1.25, bgcolor: 'surface.soft' }}>
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={12} sm={5} lg={3}>
                <TextField size="small" fullWidth label="Nombre de variable" value={field.name || ''} onChange={(event) => update(index, { name: event.target.value })} helperText="Ej.: producto, cliente.id" />
              </Grid>
              <Grid item xs={7} sm={3} lg={2}>
                <TextField select size="small" fullWidth label="Tipo" value={field.type || 'any'} onChange={(event) => update(index, { type: event.target.value })}>
                  {contractTypes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={5} sm={4} lg={2}>
                <FormControlLabel sx={{ m: 0 }} control={<Switch size="small" checked={field.required === true} onChange={(event) => update(index, { required: event.target.checked })} />} label="Requerida" />
              </Grid>
              <Grid item xs={12} sm={6} lg={2.5}>
                <TextField size="small" fullWidth label={direction === 'input' ? 'Ruta de origen' : 'Ruta de salida'} value={field.source || ''} onChange={(event) => update(index, { source: event.target.value })} placeholder={direction === 'input' ? `arguments.${field.name || 'campo'}` : (field.name || 'content')} />
              </Grid>
              <Grid item xs={10} sm={5} lg={2}>
                <TextField select={field.type === 'boolean'} type={['number', 'integer'].includes(field.type) ? 'number' : 'text'} size="small" fullWidth label="Valor por defecto" value={Object.prototype.hasOwnProperty.call(field, 'defaultValue') ? (typeof field.defaultValue === 'object' ? JSON.stringify(field.defaultValue) : String(field.defaultValue)) : ''} onChange={(event) => setDefault(index, event.target.value, field.type)}>
                  {field.type === 'boolean' && [<MenuItem key="empty" value=""><em>Sin valor</em></MenuItem>, <MenuItem key="true" value="true">Sí</MenuItem>, <MenuItem key="false" value="false">No</MenuItem>]}
                </TextField>
              </Grid>
              <Grid item xs={2} sm={1} lg={0.5}>
                <Tooltip title="Eliminar variable"><IconButton size="small" color="error" onClick={() => remove(index)}><Delete fontSize="small" /></IconButton></Tooltip>
              </Grid>
              <Grid item xs={12}>
                <TextField size="small" fullWidth label="Descripción para la IA y el equipo" value={field.description || ''} onChange={(event) => update(index, { description: event.target.value })} />
              </Grid>
            </Grid>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
};

const terminalStatuses = new Set(['success', 'error', 'skipped']);
const executionIsLive = (execution) => ['waiting', 'running', 'waiting_delivery'].includes(execution?.status);
const statusDetails = {
  waiting: { label: 'En espera', color: '#94a3b8', mui: 'default', icon: <HourglassEmpty sx={{ fontSize: 15 }} /> },
  running: { label: 'Ejecutando', color: '#2563eb', mui: 'info', icon: <CircularProgress size={14} thickness={5} /> },
  waiting_delivery: { label: 'Enviando a WhatsApp', color: '#d97706', mui: 'warning', icon: <CircularProgress size={14} thickness={5} /> },
  success: { label: 'Correcto', color: '#16a34a', mui: 'success', icon: <CheckCircle sx={{ fontSize: 15 }} /> },
  error: { label: 'Error', color: '#dc2626', mui: 'error', icon: <ErrorOutline sx={{ fontSize: 15 }} /> },
  skipped: { label: 'Omitido', color: '#64748b', mui: 'default', icon: <SkipNext sx={{ fontSize: 15 }} /> },
};

const StatusChip = ({ status = 'waiting', durationMs, compact = false }) => {
  const detail = statusDetails[status] || statusDetails.waiting;
  const duration = durationMs !== null && durationMs !== undefined ? `${durationMs} ms` : '';
  return (
    <Chip
      size="small"
      color={detail.mui}
      variant={status === 'waiting' || status === 'skipped' ? 'outlined' : 'filled'}
      icon={detail.icon}
      label={compact ? (duration || detail.label) : `${detail.label}${duration ? ` · ${duration}` : ''}`}
      sx={{ height: 23, fontSize: 10.5, fontWeight: 700 }}
    />
  );
};

const executionLabel = (execution) => {
  const stamp = execution.createdAt || execution.startedAt;
  const time = stamp ? new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'ahora';
  return `${time} · ${execution.permissionName || execution.permissionKey || 'Tarea'} · ${statusDetails[execution.status]?.label || execution.status}${execution.trigger === 'test' ? ' · prueba' : ''}`;
};

const AiCrmConfig = ({ open = true, onClose, sessionId, onAutomationChange, variant = 'dialog' }) => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const pageMode = variant === 'page';
  const [tab, setTab] = useState(0);
  const [config, setConfig] = useState(newStarterConfig);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [permissionIndex, setPermissionIndex] = useState(0);
  const [selectedNodeKey, setSelectedNodeKey] = useState('');
  const [globalSelectedNodeKey, setGlobalSelectedNodeKey] = useState('orchestrator');
  const [connectingFrom, setConnectingFrom] = useState('');
  const [insertMenu, setInsertMenu] = useState(null);
  const [linkMenu, setLinkMenu] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [activeExecution, setActiveExecution] = useState(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState('');
  const [displayNodeStates, setDisplayNodeStates] = useState({});
  const [globalDisplayNodeStates, setGlobalDisplayNodeStates] = useState({});
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPayload, setTestPayload] = useState({
    message: 'Hola, necesito información',
    messageType: 'text',
    contact: { number: '51999999999', name: 'Cliente de prueba' },
    arguments: {}, state: {}, analysis: {}, history: [],
  });
  const [zoom, setZoom] = useState(1);
  const [globalZoom, setGlobalZoom] = useState(0.85);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const globalCanvasRef = useRef(null);
  const globalDragRef = useRef(null);
  const latestExecutionIdRef = useRef('');
  const importInputRef = useRef(null);

  const permission = config.permissions?.[permissionIndex];
  const testPayloadStorageKey = sessionId && permission?.key ? `workflow-test:${sessionId}:${permission.key}` : '';
  const selectedNode = permission?.nodes?.find((node) => node.key === selectedNodeKey);
  const selectedNodeExecution = activeExecution?.nodeExecutions?.find((item) => (
    item.nodeKey === selectedNodeKey && (item.scope === 'task' || !item.scope)
  )) || null;
  const globalWorkflow = config.mainWorkflow || buildStarterMainWorkflow([]);
  const globalSelectedNode = globalWorkflow.nodes?.find((node) => node.key === globalSelectedNodeKey) || null;
  const globalSelectedNodeExecution = activeExecution?.nodeExecutions?.find((item) => (
    item.nodeKey === globalSelectedNodeKey && item.scope === 'main'
  )) || null;
  const linkedTaskKeys = new Set((globalWorkflow.nodes || [])
    .filter((node) => node.type === 'agent')
    .map((node) => normalizedTaskKey(node.config?.agentKey)));
  const unlinkedPermissions = (config.permissions || []).filter((item) => !linkedTaskKeys.has(normalizedTaskKey(item.key)));
  const globalOrchestratorNode = (globalWorkflow.nodes || []).find((node) => node.type === 'orchestrator');
  const globalGuardNode = (globalWorkflow.nodes || []).find((node) => node.type === 'whatsapp_output');
  const branchActionPosition = {
    x: ((Number(globalOrchestratorNode?.positionX || 610) + 220) + Number(globalGuardNode?.positionX || 1260)) / 2,
    y: Math.max(Number(globalOrchestratorNode?.positionY || 300), Number(globalGuardNode?.positionY || 300)) + 150,
  };
  const permissionSignature = (config.permissions || []).map((item) => `${item.key}\u0000${item.name}\u0000${item.enabled !== false}`).join('\u0001');

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await axios.get(`/api/v1/sessions/${sessionId}/ai/config`);
      const savedConfig = response.data.config;
      const starter = newStarterConfig();
      const meaningfulSavedValues = Object.fromEntries(Object.entries(savedConfig || {}).filter(([, value]) => value !== null && value !== ''));
      const nonNullSavedValues = Object.fromEntries(Object.entries(savedConfig || {}).filter(([, value]) => value !== null && value !== undefined));
      const loaded = savedConfig?.permissions?.length
        ? { ...starter, ...nonNullSavedValues, permissions: savedConfig.permissions }
        : { ...starter, ...meaningfulSavedValues, permissions: starter.permissions };
      loaded.permissions = (loaded.permissions || []).map(normalizePermission);
      loaded.mainWorkflow = savedConfig?.mainWorkflow || loaded.mainWorkflow || buildStarterMainWorkflow(loaded.permissions);
      loaded.workflowEngineVersion = Number(response.data.workflowEngineVersion || 0);
      setConfig({ ...newStarterConfig(), ...loaded, aiApiToken: '' });
      setPermissionIndex(0);
      setSelectedNodeKey('');
      setGlobalSelectedNodeKey('orchestrator');
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudo cargar la configuración' });
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open, sessionId]);

  const statesFromExecution = (execution, scope) => Object.fromEntries(
    (execution?.nodeExecutions || [])
      .filter((item) => scope === 'main' ? item.scope === 'main' : item.scope === 'task' || !item.scope)
      .map((item) => [item.nodeKey, {
        status: item.status,
        durationMs: item.durationMs,
        error: item.error,
      }]),
  );

  const showExecution = (execution) => {
    setActiveExecution(execution);
    setSelectedExecutionId(execution?.id || '');
    setDisplayNodeStates(statesFromExecution(execution, 'task'));
    setGlobalDisplayNodeStates(statesFromExecution(execution, 'main'));
  };

  const loadExecutionDetail = async (executionId) => {
    if (!executionId) {
      showExecution(null);
      return null;
    }
    try {
      const response = await axios.get(`/api/v1/sessions/${sessionId}/ai/workflow-executions/${executionId}`);
      if (response.data.workflowEngineVersion) setConfig((current) => ({ ...current, workflowEngineVersion: Number(response.data.workflowEngineVersion) }));
      const execution = { ...response.data.execution, pollAfterMs: response.data.pollAfterMs };
      showExecution(execution);
      return execution;
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudo cargar la ejecución' });
      return null;
    }
  };

  const loadExecutions = async ({ selectLatest = false, autoFollow = false, taskKey = tab === 1 ? permission?.key : '', scope = tab === 2 ? 'main' : 'task' } = {}) => {
    if (!sessionId || (tab === 1 && !taskKey)) return;
    try {
      const response = await axios.get(`/api/v1/sessions/${sessionId}/ai/workflow-executions`, { params: { limit: 20, ...(taskKey ? { taskKey } : {}), ...(scope ? { scope } : {}) } });
      if (response.data.workflowEngineVersion) setConfig((current) => ({ ...current, workflowEngineVersion: Number(response.data.workflowEngineVersion) }));
      const received = response.data.executions || [];
      const recent = scope
        ? received.filter((execution) => execution.nodeExecutions?.some((node) => (node.scope || 'task') === scope))
        : received;
      const previousLatestId = latestExecutionIdRef.current;
      latestExecutionIdRef.current = recent[0]?.id || '';
      setExecutions(recent);
      if (selectLatest && recent[0]) await loadExecutionDetail(recent[0].id);
      else if (autoFollow && recent[0] && recent[0].id !== previousLatestId) await loadExecutionDetail(recent[0].id);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudieron cargar las ejecuciones' });
    }
  };

  useEffect(() => {
    if (!open || ![1, 2].includes(tab) || (tab === 1 && !permission?.key)) return;
    latestExecutionIdRef.current = '';
    setActiveExecution(null);
    setSelectedExecutionId('');
    setDisplayNodeStates({});
    setGlobalDisplayNodeStates({});
    loadExecutions({ selectLatest: true });
  }, [open, tab, sessionId, tab === 1 ? permissionIndex : 'global']);

  // The execution list is only a history/discovery view. Refresh it at a low
  // frequency; live executions have their own lightweight detail poll below.
  // Smart polling also pauses in background tabs and never overlaps requests.
  useSmartPolling(() => {
    if (!open || ![1, 2].includes(tab) || (tab === 1 && !permission?.key) || executionIsLive(activeExecution)) return;
    return loadExecutions({ autoFollow: true });
  }, 15000, { runImmediately: false });

  useEffect(() => {
    if (!open || !selectedExecutionId || !executionIsLive(activeExecution)) return undefined;
    const delay = Math.max(450, Math.min(750, Number(activeExecution?.pollAfterMs || 600)));
    const timer = window.setTimeout(async () => {
      const fresh = await loadExecutionDetail(selectedExecutionId);
      if (fresh && terminalStatuses.has(fresh.status)) loadExecutions();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open, sessionId, selectedExecutionId, activeExecution]);

  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current || !canvasRef.current) return;
      const bounds = canvasRef.current.getBoundingClientRect();
      updateNode(dragRef.current.key, {
        positionX: Math.max(10, ((event.clientX - bounds.left + canvasRef.current.scrollLeft) / zoom) - dragRef.current.offsetX),
        positionY: Math.max(10, ((event.clientY - bounds.top + canvasRef.current.scrollTop) / zoom) - dragRef.current.offsetY),
      });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [zoom, permissionIndex]);

  useEffect(() => {
    const move = (event) => {
      if (!globalDragRef.current || !globalCanvasRef.current) return;
      const bounds = globalCanvasRef.current.getBoundingClientRect();
      updateGlobalNode(globalDragRef.current.key, {
        positionX: Math.max(10, ((event.clientX - bounds.left + globalCanvasRef.current.scrollLeft) / globalZoom) - globalDragRef.current.offsetX),
        positionY: Math.max(10, ((event.clientY - bounds.top + globalCanvasRef.current.scrollTop) / globalZoom) - globalDragRef.current.offsetY),
      });
    };
    const up = () => { globalDragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [globalZoom]);

  const setField = (field, value) => setConfig((current) => ({ ...current, [field]: value }));
  const setProvider = (provider) => setConfig((current) => ({ ...current, aiProvider: provider, ...providerDefaults[provider] }));
  const updatePermission = (patch) => setConfig((current) => {
    const previous = current.permissions[permissionIndex];
    const permissions = current.permissions.map((item, index) => index === permissionIndex ? { ...item, ...patch } : item);
    let workflow = current.mainWorkflow;
    if (previous && patch.key !== undefined && patch.key !== previous.key) {
      const oldKey = normalizedTaskKey(previous.key);
      const newKey = normalizedTaskKey(patch.key, oldKey);
      workflow = {
        ...(workflow || {}),
        nodes: (workflow?.nodes || []).map((node) => (
          node.type === 'agent' && normalizedTaskKey(node.config?.agentKey) === oldKey
            ? { ...node, name: patch.name || node.name, config: { ...(node.config || {}), agentKey: newKey } }
            : node
        )),
        edges: (workflow?.edges || []).map((edge) => edge.source === 'orchestrator' && edge.sourceHandle === oldKey ? { ...edge, sourceHandle: newKey } : edge),
      };
    }
    return { ...current, permissions, mainWorkflow: workflow };
  });
  const updateTaskSchema = (patch) => updatePermission({ stateSchema: { ...(permission?.stateSchema || {}), ...patch } });
  const updateNode = (key, patch) => setConfig((current) => ({
    ...current,
    permissions: current.permissions.map((item, index) => index !== permissionIndex ? item : {
      ...item,
      nodes: item.nodes.map((node) => node.key === key ? { ...node, ...patch } : node),
    }),
  }));
  const updateGlobalNode = (key, patch) => setConfig((current) => ({
    ...current,
    mainWorkflow: {
      ...(current.mainWorkflow || buildStarterMainWorkflow([])),
      nodes: (current.mainWorkflow?.nodes || []).map((node) => node.key === key ? { ...node, ...patch } : node),
      edges: current.mainWorkflow?.edges || [],
    },
  }));
  const updateGlobalNodeConfig = (key, patch) => setConfig((current) => ({
    ...current,
    mainWorkflow: {
      ...(current.mainWorkflow || buildStarterMainWorkflow([])),
      nodes: (current.mainWorkflow?.nodes || []).map((node) => node.key === key ? {
        ...node,
        config: { ...(node.config || {}), ...patch },
      } : node),
      edges: current.mainWorkflow?.edges || [],
    },
  }));
  const renameNode = (oldKey, rawKey) => {
    const newKey = String(rawKey).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!newKey || permission.nodes.some((node) => node.key === newKey && node.key !== oldKey)) return;
    updatePermission({
      nodes: permission.nodes.map((node) => node.key === oldKey ? { ...node, key: newKey } : node),
      edges: permission.edges.map((edge) => ({ ...edge, source: edge.source === oldKey ? newKey : edge.source, target: edge.target === oldKey ? newKey : edge.target })),
    });
    setSelectedNodeKey(newKey);
  };

  const createPermission = ({ initialNodeType = 'ai', link = false, openEditor = true } = {}) => {
    const usedTaskKeys = new Set((config.permissions || []).map((item) => normalizedTaskKey(item.key)));
    let index = config.permissions.length + 1;
    while (usedTaskKeys.has(`tarea_${index}`)) index += 1;
    const taskKey = `tarea_${index}`;
    const typeNames = { ai: 'Tarea con IA', http_request: 'Integración HTTP', script: 'Automatización Script', condition: 'Decisión condicional' };
    const inputNode = { ...makeNode('agent_input', { x: 80, y: 180 }, []), key: 'entrada_agente', name: 'Entrada del agente' };
    const actionNode = makeNode(initialNodeType || 'ai', { x: 400, y: 180 }, [inputNode]);
    const outputNode = {
      ...makeNode('agent_output', { x: 720, y: 180 }, [inputNode, actionNode]),
      key: 'salida_agente',
      name: 'Salida del agente',
      config: { outputMapping: { content: `{{nodes.${actionNode.key}.content}}`, state: '{{state}}', evidence: '{{evidence}}', nodes: '{{nodes}}' } },
    };
    const initialNodes = [inputNode, actionNode, outputNode];
    const initialEdges = [
      { source: inputNode.key, target: actionNode.key, sourceHandle: 'output', targetHandle: 'input' },
      { source: actionNode.key, target: outputNode.key, sourceHandle: 'output', targetHandle: 'input' },
    ];
    const inputFields = defaultAgentInputFields();
    const outputFields = defaultAgentOutputFields();
    setConfig((current) => {
      const permissions = [...current.permissions, {
        key: taskKey, name: typeNames[initialNodeType] || `Nueva tarea ${index}`, enabled: true, priority: index,
        description: '', routingPrompt: '', executionPrompt: '', responsePrompt: '', continuationEnabled: true,
        stateSchema: { properties: {}, required: [], ttlMinutes: 1440, completionRule: '', inputFields, outputFields }, nodes: initialNodes, edges: initialEdges,
      }];
      let mainWorkflow = current.mainWorkflow || buildStarterMainWorkflow([]);
      if (link) mainWorkflow = addAgentToMainWorkflow(mainWorkflow, permissions[permissions.length - 1]);
      return {
        ...current,
        permissions,
        mainWorkflow,
      };
    });
    setPermissionIndex(config.permissions.length);
    setSelectedNodeKey(actionNode.key);
    if (link) setGlobalSelectedNodeKey(`agent_${taskKey}`);
    setTab(openEditor ? 1 : 2);
    if (link) setMessage({ type: 'success', text: `${typeNames[initialNodeType] || 'Nueva tarea'} creada y enlazada. Haz doble clic en su tarjeta para completar la configuración.` });
  };

  const linkExistingTask = (taskKey) => {
    setConfig((current) => ({ ...current, mainWorkflow: addAgentToMainWorkflow(current.mainWorkflow, current.permissions.find((item) => normalizedTaskKey(item.key) === normalizedTaskKey(taskKey))) }));
    setGlobalSelectedNodeKey(`agent_${normalizedTaskKey(taskKey)}`);
    setLinkMenu(null);
  };

  const unlinkTaskReference = (taskKey) => {
    setConfig((current) => {
      return { ...current, mainWorkflow: removeAgentFromMainWorkflow(current.mainWorkflow, taskKey) };
    });
    setGlobalSelectedNodeKey('orchestrator');
    setMessage({ type: 'info', text: 'La referencia se quitó del workflow general. La tarea y su configuración siguen guardadas en la sección 2.' });
  };

  const removePermission = () => {
    setConfig((current) => {
      const permissions = current.permissions.filter((_, index) => index !== permissionIndex);
      return { ...current, permissions, mainWorkflow: removeAgentFromMainWorkflow(current.mainWorkflow, current.permissions[permissionIndex]?.key) };
    });
    setPermissionIndex(0);
    setSelectedNodeKey('');
    setGlobalSelectedNodeKey('orchestrator');
  };

  const openTaskFromGlobal = (taskKey) => {
    const index = (config.permissions || []).findIndex((item) => normalizedTaskKey(item.key) === normalizedTaskKey(taskKey));
    if (index < 0) return;
    setPermissionIndex(index);
    setSelectedNodeKey('');
    setTab(1);
  };

  const nodeDefaults = (type, nodes = permission?.nodes || []) => {
    const latestAiNode = [...nodes].reverse().find((node) => node.type === 'ai');
    return {
      agent_input: {},
      http_request: { inputMapping: {}, outputFields: [{ name: 'ok', type: 'boolean', source: 'ok' }, { name: 'status', type: 'number', source: 'status' }, { name: 'body', type: 'object', source: 'body' }], method: 'GET', url: 'https://api.tu-sistema.com/recurso', headers: {}, queryParams: {}, requestBody: {}, responsePath: '', responseMapping: {}, stateMapping: {}, sourcePolicy: 'open_world', requiresConfirmation: true, confirmationPath: 'state.confirmed', oncePerTask: true, completeTaskOnSuccess: false, idempotencyKeyTemplate: '{{session.id}}:{{contact.number}}:{{messageId}}:{{task.key}}', timeoutMs: 30000, maxResponseMb: 25, continueOnError: false },
      script: { inputMapping: {}, outputFields: [{ name: 'value', type: 'any', source: 'value' }], code: 'return input.nodeInput;\n', timeoutMs: 200 },
      transform: { inputMapping: {}, outputFields: [{ name: 'value', type: 'any', source: 'value' }], expression: 'input.nodeInput' },
      state_update: { inputMapping: {}, outputFields: [{ name: 'stateUpdates', type: 'object', source: 'stateUpdates' }, { name: 'taskComplete', type: 'boolean', source: 'taskComplete' }], updates: {}, taskComplete: false },
      condition: { inputMapping: {}, outputFields: [{ name: 'result', type: 'boolean', source: 'result' }], condition: { leftPath: 'nodeInput.confirmado', operator: 'equals', rightValue: true, rightType: 'boolean' }, expression: 'input.nodeInput.confirmado === true' },
      ai: { inputMapping: {}, outputFields: [{ name: 'content', type: 'string', source: 'content', required: true }, { name: 'stateUpdates', type: 'object', source: 'stateUpdates' }, { name: 'taskComplete', type: 'boolean', source: 'taskComplete' }], useSessionModel: true, provider: 'openai_compatible', apiUrl: '', model: '', outputField: 'content', contextCharBudget: 3000, maxOutputTokens: 400, prompt: 'Procesa únicamente la entrada de esta tarea y genera su resultado.' },
      agent_output: { outputMapping: { content: `{{nodes.${latestAiNode?.key || 'modelo_ia'}.content}}`, state: '{{state}}', evidence: '{{evidence}}', nodes: '{{nodes}}' } },
      whatsapp_output: { contentTemplate: `{{nodes.${latestAiNode?.key || 'modelo_ia'}.content}}` },
    }[type];
  };

  const makeNode = (type, position = {}, nodes = permission?.nodes || []) => {
    const number = nodes.length + 1;
    const catalog = nodeCatalog.find((item) => item.type === type) || nodeCatalog[2];
    return {
      key: `${type}_${Date.now().toString(36)}`,
      name: `${catalog.label} ${number}`,
      type,
      enabled: true,
      positionX: position.x ?? 50 + number * 35,
      positionY: position.y ?? 60 + number * 35,
      config: nodeDefaults(type, nodes),
      credentials: {},
    };
  };

  const addNode = (type) => {
    if (!permission) return;
    const node = makeNode(type);
    updatePermission({ nodes: [...permission.nodes, node] });
    setSelectedNodeKey(node.key);
  };

  const insertNodeBetween = (type) => {
    const edge = insertMenu?.edge;
    if (!permission || !edge) return;
    const source = permission.nodes.find((node) => node.key === edge.source);
    const target = permission.nodes.find((node) => node.key === edge.target);
    if (!source || !target) return;
    const node = makeNode(type, {
      x: (Number(source.positionX || 0) + Number(target.positionX || 0)) / 2,
      y: (Number(source.positionY || 0) + Number(target.positionY || 0)) / 2 + (Math.abs(Number(source.positionY || 0) - Number(target.positionY || 0)) < 45 ? 70 : 0),
    });
    const remaining = permission.edges.filter((item) => item !== edge);
    updatePermission({
      nodes: [...permission.nodes, node],
      edges: [
        ...remaining,
        { source: edge.source, target: node.key, sourceHandle: edge.sourceHandle || null },
        { source: node.key, target: edge.target, targetHandle: edge.targetHandle || null, ...(type === 'condition' ? { sourceHandle: 'true' } : {}) },
      ],
    });
    setSelectedNodeKey(node.key);
    setInsertMenu(null);
  };

  const removeNode = (key) => {
    if (permission.nodes.some((node) => node.key === key && ['agent_input', 'agent_output'].includes(node.type))) return;
    updatePermission({ nodes: permission.nodes.filter((node) => node.key !== key), edges: permission.edges.filter((edge) => edge.source !== key && edge.target !== key) });
    setSelectedNodeKey('');
  };

  const connectNode = (target) => {
    if (!connectingFrom) { setConnectingFrom(target); return; }
    if (connectingFrom !== target && !permission.edges.some((edge) => edge.source === connectingFrom && edge.target === target)) {
      const sourceNode = permission.nodes.find((node) => node.key === connectingFrom);
      updatePermission({ edges: [...permission.edges, { source: connectingFrom, target, ...(sourceNode?.type === 'condition' ? { sourceHandle: 'true' } : {}) }] });
    }
    setConnectingFrom('');
  };

  const save = async () => {
    setLoading(true); setMessage(null);
    try {
      const response = await axios.put(`/api/v1/sessions/${sessionId}/ai/config`, { config });
      const permissions = (response.data.config?.permissions || []).map(normalizePermission);
      setConfig({
        ...newStarterConfig(),
        ...response.data.config,
        workflowEngineVersion: Number(response.data.workflowEngineVersion || config.workflowEngineVersion || 0),
        permissions,
        mainWorkflow: response.data.config?.mainWorkflow || config.mainWorkflow,
        aiApiToken: '',
      });
      onAutomationChange?.(Boolean(response.data.config?.autoReplyEnabled));
      setMessage({ type: 'success', text: 'Configuración y workflow guardados en la base de datos' });
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudo guardar' }); }
    finally { setLoading(false); }
  };

  const saveNodeDraft = async (nodeKey, nodePatch, stateSchema) => {
    setLoading(true);
    setMessage(null);
    try {
      const nextConfig = {
        ...config,
        permissions: config.permissions.map((item, index) => index !== permissionIndex ? item : {
          ...item,
          stateSchema,
          nodes: item.nodes.map((node) => node.key === nodeKey ? { ...node, ...nodePatch } : node),
        }),
      };
      const response = await axios.put(`/api/v1/sessions/${sessionId}/ai/config`, { config: nextConfig });
      setConfig({
        ...newStarterConfig(),
        ...response.data.config,
        workflowEngineVersion: Number(response.data.workflowEngineVersion || nextConfig.workflowEngineVersion || 0),
        permissions: (response.data.config?.permissions || []).map(normalizePermission),
        mainWorkflow: response.data.config?.mainWorkflow || nextConfig.mainWorkflow,
        aiApiToken: '',
      });
      setMessage({ type: 'success', text: 'Nodo guardado. Ya puedes probarlo con ▶.' });
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudo guardar el nodo' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!testPayloadStorageKey) return;
    try {
      const saved = window.localStorage.getItem(testPayloadStorageKey);
      if (saved) setTestPayload(JSON.parse(saved));
    } catch { /* Un borrador local inválido no debe impedir editar ni probar. */ }
  }, [testPayloadStorageKey]);

  const saveTestPayload = () => {
    try {
      if (testPayloadStorageKey) window.localStorage.setItem(testPayloadStorageKey, JSON.stringify(testPayload));
      setTestOpen(false);
      setMessage({ type: 'success', text: 'Datos de prueba guardados localmente. El botón ▶ solo ejecutará la prueba.' });
    } catch {
      setMessage({ type: 'error', text: 'El navegador no pudo guardar los datos de prueba localmente.' });
    }
  };

  const exportWorkflows = () => {
    const bundle = createWorkflowBundle(config, sessionId);
    const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflows-${String(sessionId || 'cuenta').replace(/[^a-z0-9_-]+/gi, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: 'Cerebro, prompts, configuración y workflows exportados sin tokens ni credenciales privadas.' });
  };

  const importWorkflows = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = parseWorkflowBundle(await file.text());
      const permissions = imported.permissions.map(normalizePermission);
      setConfig((current) => ({ ...current, ...imported.config, permissions, mainWorkflow: imported.mainWorkflow, aiApiToken: '' }));
      setPermissionIndex(0);
      setSelectedNodeKey('');
      setGlobalSelectedNodeKey('orchestrator');
      setActiveExecution(null);
      setMessage({
        type: 'success',
        text: `Se importaron el Cerebro y ${permissions.length} agente(s)${imported.sourceSessionId ? ` desde ${imported.sourceSessionId}` : ''}. Revisa la clave API y pulsa Guardar para aplicarlos a esta sesión.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo importar el archivo' });
    }
  };

  const runTest = async () => {
    if (!permission?.key || testing) return;
    setTesting(true);
    setMessage(null);
    try {
      const response = await axios.post(
        `/api/v1/sessions/${sessionId}/ai/workflows/tasks/${encodeURIComponent(permission.key)}/test`,
        testPayload,
      );
      const executionId = response.data.executionId || response.data.result?.executionId;
      setTestOpen(false);
      setTab(1);
      setMessage({ type: 'info', text: 'Prueba segura iniciada. Las acciones que escriben datos y el envío por WhatsApp se simulan.' });
      if (executionId) {
        showExecution({ id: executionId, status: response.data.status || 'running', trigger: 'test', nodeExecutions: [], pollAfterMs: 700 });
        await loadExecutionDetail(executionId);
        await loadExecutions();
      } else if (response.data.result) {
        setMessage({ type: 'success', text: 'Prueba terminada correctamente (sin traza persistente).' });
      }
    } catch (error) {
      const executionId = error.response?.data?.executionId;
      setMessage({ type: 'error', text: error.response?.data?.error || 'La prueba no pudo ejecutarse' });
      if (executionId) await loadExecutionDetail(executionId);
    } finally {
      setTesting(false);
    }
  };

  const fitView = () => {
    if (!canvasRef.current || !permission?.nodes?.length) return;
    const maxX = Math.max(...permission.nodes.map((node) => Number(node.positionX || 0) + 250));
    const maxY = Math.max(...permission.nodes.map((node) => Number(node.positionY || 0) + 130));
    const minX = Math.min(...permission.nodes.map((node) => Number(node.positionX || 0)));
    const minY = Math.min(...permission.nodes.map((node) => Number(node.positionY || 0)));
    const width = Math.max(400, maxX - minX + 120);
    const height = Math.max(250, maxY - minY + 120);
    const nextZoom = Math.max(0.45, Math.min(1.2, canvasRef.current.clientWidth / width, canvasRef.current.clientHeight / height));
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      canvasRef.current.scrollLeft = Math.max(0, (minX - 50) * nextZoom);
      canvasRef.current.scrollTop = Math.max(0, (minY - 50) * nextZoom);
    });
  };

  const fitGlobalView = () => {
    const nodes = config.mainWorkflow?.nodes || [];
    if (!globalCanvasRef.current || !nodes.length) return;
    const maxX = Math.max(...nodes.map((node) => Number(node.positionX || 0) + 250));
    const maxY = Math.max(...nodes.map((node) => Number(node.positionY || 0) + 130));
    const minX = Math.min(...nodes.map((node) => Number(node.positionX || 0)));
    const minY = Math.min(...nodes.map((node) => Number(node.positionY || 0)));
    const width = Math.max(500, maxX - minX + 120);
    const height = Math.max(300, maxY - minY + 120);
    const nextZoom = Math.max(0.4, Math.min(1.15, globalCanvasRef.current.clientWidth / width, globalCanvasRef.current.clientHeight / height));
    setGlobalZoom(nextZoom);
    window.requestAnimationFrame(() => {
      if (!globalCanvasRef.current) return;
      globalCanvasRef.current.scrollLeft = Math.max(0, (minX - 50) * nextZoom);
      globalCanvasRef.current.scrollTop = Math.max(0, (minY - 50) * nextZoom);
    });
  };

  const applyPreset = async () => {
    setLoading(true); setMessage(null);
    try {
      const response = await axios.post(`/api/v1/sessions/${sessionId}/ai/presets/sales`);
      const permissions = (response.data.config?.permissions || []).map(normalizePermission);
      setConfig({
        ...newStarterConfig(),
        ...response.data.config,
        workflowEngineVersion: Number(response.data.workflowEngineVersion || config.workflowEngineVersion || 0),
        permissions,
        mainWorkflow: response.data.config?.mainWorkflow || buildStarterMainWorkflow(permissions),
        aiApiToken: '',
      });
      setPermissionIndex(0); setTab(1);
      setMessage({ type: 'success', text: 'Configuración inicial aplicada. Personalízala antes de activar.' });
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'No se pudo aplicar la plantilla' }); }
    finally { setLoading(false); }
  };

  const edgeVisuals = useMemo(() => (permission?.edges || []).map((edge, index) => {
    const source = permission.nodes.find((node) => node.key === edge.source);
    const target = permission.nodes.find((node) => node.key === edge.target);
    if (!source || !target) return null;
    const x1 = Number(source.positionX || 0) + 210;
    const y1 = Number(source.positionY || 0) + 45;
    const x2 = Number(target.positionX || 0);
    const y2 = Number(target.positionY || 0) + 45;
    const sourceStatus = displayNodeStates[edge.source]?.status;
    const targetStatus = displayNodeStates[edge.target]?.status;
    const running = targetStatus === 'running' || (sourceStatus === 'running' && (!targetStatus || targetStatus === 'waiting'));
    const edgeStatus = targetStatus || sourceStatus;
    const color = edgeStatus === 'error' ? '#dc2626' : edgeStatus === 'success' ? '#16a34a' : running ? '#2563eb' : '#94a3b8';
    const path = `M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}`;
    return { edge, index, x1, y1, x2, y2, middleX: (x1 + x2) / 2, middleY: (y1 + y2) / 2, color, running, edgeStatus, path };
  }).filter(Boolean), [permission, displayNodeStates]);

  const edgeLines = edgeVisuals.map(({ edge, index, color, running, edgeStatus, path }) => (
    <g key={`${edge.source}-${edge.target}-${index}`}>
      <path d={path} fill="none" stroke="#cbd5e1" strokeWidth="5" opacity=".45" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={running ? 3 : 2}
        strokeDasharray={running ? '8 7' : edgeStatus === 'skipped' ? '4 5' : undefined}
        markerEnd="url(#workflow-arrow)"
        style={running ? { animation: 'workflowDash .55s linear infinite' } : undefined}
      />
    </g>
  ));

  const globalEdgeVisuals = useMemo(() => (globalWorkflow.edges || []).map((edge, index) => {
    const source = globalWorkflow.nodes?.find((node) => node.key === edge.source);
    const target = globalWorkflow.nodes?.find((node) => node.key === edge.target);
    if (!source || !target) return null;
    const x1 = Number(source.positionX || 0) + 220;
    const y1 = Number(source.positionY || 0) + 48;
    const x2 = Number(target.positionX || 0);
    const y2 = Number(target.positionY || 0) + 48;
    const sourceStatus = globalDisplayNodeStates[edge.source]?.status;
    const targetStatus = globalDisplayNodeStates[edge.target]?.status;
    const running = targetStatus === 'running' || targetStatus === 'waiting_delivery'
      || (sourceStatus === 'running' && (!targetStatus || targetStatus === 'waiting'));
    const edgeStatus = targetStatus || sourceStatus;
    const color = edgeStatus === 'error' ? '#dc2626' : edgeStatus === 'success' ? '#16a34a' : running ? '#2563eb' : '#94a3b8';
    const path = `M ${x1} ${y1} C ${x1 + 72} ${y1}, ${x2 - 72} ${y2}, ${x2} ${y2}`;
    return { edge, index, middleX: (x1 + x2) / 2, middleY: (y1 + y2) / 2, color, running, edgeStatus, path };
  }).filter(Boolean), [globalWorkflow, globalDisplayNodeStates]);

  const globalEdgeLines = globalEdgeVisuals.map(({ edge, index, color, running, edgeStatus, path }) => (
    <g key={`global-${edge.source}-${edge.target}-${index}`}>
      <path d={path} fill="none" stroke="#cbd5e1" strokeWidth="5" opacity=".45" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={running ? 3 : 2}
        strokeDasharray={running ? '8 7' : edgeStatus === 'skipped' ? '4 5' : undefined}
        markerEnd="url(#global-workflow-arrow)"
        style={running ? { animation: 'workflowDash .55s linear infinite' } : undefined}
      />
    </g>
  ));

  const ConfigShell = pageMode ? Box : Dialog;
  const shellProps = pageMode
    ? { sx: { minHeight: '100%', minWidth: 0, bgcolor: 'background.default', display: 'flex', flexDirection: 'column' } }
    : { open, onClose, fullWidth: true, fullScreen: mobile, maxWidth: 'xl', PaperProps: { sx: { height: mobile ? '100dvh' : 'min(92vh, 980px)', maxHeight: '100dvh', m: mobile ? 0 : undefined } } };

  return (
    <ConfigShell {...shellProps}>
      <DialogTitle component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: { xs: 1.5, sm: 2.5, lg: 3 }, py: 1.5, bgcolor: 'background.paper' }}>
        <AutoAwesome color="primary" /> IA CRM · sesión {sessionId}
        <Chip size="small" label="Plan Profesional" color="secondary" />
        <Box sx={{ flexGrow: 1 }} />
        <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importWorkflows} />
        <Tooltip title="Descarga Cerebro, prompts, agentes y workflow principal; nunca incluye tokens ni credenciales"><Button startIcon={<Download />} onClick={exportWorkflows} disabled={loading}>Exportar todo</Button></Tooltip>
        <Tooltip title="Reemplaza el borrador actual; podrás revisarlo antes de guardar"><Button startIcon={<Upload />} onClick={() => importInputRef.current?.click()} disabled={loading}>Importar</Button></Tooltip>
        <Button startIcon={<AutoAwesome />} onClick={applyPreset} disabled={loading}>Restaurar configuración inicial</Button>
      </DialogTitle>
      <Divider />
      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ px: { xs: 0.5, sm: 2 }, bgcolor: 'background.paper', flexShrink: 0 }}>
        <Tab label="1. Cerebro general" />
        <Tab label="2. Agentes / task-handlers" />
        <Tab label="3. Workflow principal" />
      </Tabs>
      <DialogContent sx={{ bgcolor: 'background.default', p: { xs: 1.25, sm: 2.5, lg: 3 }, overflow: pageMode ? 'visible' : 'auto', flex: pageMode ? 'none' : 1 }}>
        {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}
        {tab === 0 && (
          <Paper sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
            <Stack spacing={2}>
              <Alert severity="info">
                <b>Solo completa tres cosas para comenzar:</b> describe tu negocio, elige el proveedor/modelo y pega su token. La tarea “Responder consultas generales” ya viene preparada y conectada.
              </Alert>
              <FormControlLabel control={<Switch checked={Boolean(config.autoReplyEnabled)} onChange={(event) => setField('autoReplyEnabled', event.target.checked)} />} label="Interruptor general de IA para esta sesión" />
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}><TextField fullWidth label="Nombre del agente" value={config.agentName || ''} onChange={(event) => setField('agentName', event.target.value)} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label="Rol" value={config.role || ''} onChange={(event) => setField('role', event.target.value)} /></Grid>
                <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Contexto del negocio" value={config.context || ''} onChange={(event) => setField('context', event.target.value)} /></Grid>
                <Grid item xs={12} md={4}>
                  <TextField select fullWidth label="Proveedor / protocolo IA" value={config.aiProvider || 'openai_compatible'} onChange={(event) => setProvider(event.target.value)}>
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="groq">Groq</MenuItem>
                    <MenuItem value="openai_compatible">Otro compatible con OpenAI</MenuItem>
                    <MenuItem value="gemini">Google Gemini</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}><TextField fullWidth label="Modelo" value={config.aiModel || ''} onChange={(event) => setField('aiModel', event.target.value)} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth type="password" label="Token IA" value={config.aiApiToken || ''} onChange={(event) => setField('aiApiToken', event.target.value)} placeholder={config.hasAiApiToken ? 'Guardado · escribe para cambiar' : ''} /></Grid>
                <Grid item xs={12}><Button size="small" startIcon={<Settings />} onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? 'Ocultar opciones avanzadas' : 'Mostrar opciones avanzadas'}</Button></Grid>
                {showAdvanced && <>
                  <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Prompt general" value={config.systemPrompt || ''} onChange={(event) => setField('systemPrompt', event.target.value)} helperText="Reglas generales de comportamiento y seguridad del agente." /></Grid>
                  <Grid item xs={12}><TextField fullWidth multiline minRows={4} label="Reglas para decidir si responder" value={config.intentionPrompt || ''} onChange={(event) => setField('intentionPrompt', event.target.value)} helperText="Se evalúan junto al enrutamiento en una única llamada IA compacta." /></Grid>
                  <Grid item xs={12}><TextField fullWidth multiline minRows={4} label="Reglas del orquestador" value={config.orchestrationPrompt || ''} onChange={(event) => setField('orchestrationPrompt', event.target.value)} helperText="Decide la tarea en la misma llamada que filtra el mensaje; no duplica historial ni contexto." /></Grid>
                  <Grid item xs={12} md={6}><FormControlLabel control={<Switch checked={config.ignoreUnrelatedMessages !== false} onChange={(event) => setField('ignoreUnrelatedMessages', event.target.checked)} />} label="Ignorar mensajes ajenos al negocio" /></Grid>
                  <Grid item xs={12} md={8}><TextField fullWidth label="URL API IA" value={config.aiApiUrl || ''} onChange={(event) => setField('aiApiUrl', event.target.value)} helperText="Se completa automáticamente al elegir OpenAI, Groq o Gemini." /></Grid>
                  <Grid item xs={6} md={2}><TextField fullWidth type="number" label="Temperatura" value={config.temperature ?? 0.2} onChange={(event) => setField('temperature', Number(event.target.value))} /></Grid>
                  <Grid item xs={6} md={2}><TextField fullWidth type="number" label="Mensajes recientes" value={config.maxHistory || 20} onChange={(event) => setField('maxHistory', Number(event.target.value))} inputProps={{ min: 1, max: 100 }} helperText="Cantidad configurable; después se compactan al presupuesto de tokens" /></Grid>
                </>}
              </Grid>
            </Stack>
          </Paper>
        )}

        {tab === 1 && (
          <AgentStudio
            permissions={config.permissions || []}
            permissionIndex={permissionIndex}
            onSelectPermission={(index) => { setPermissionIndex(index); setSelectedNodeKey(''); }}
            permission={permission}
            onCreate={() => createPermission()}
            onDeletePermission={removePermission}
            onUpdatePermission={updatePermission}
            selectedNodeKey={selectedNodeKey}
            onSelectNode={setSelectedNodeKey}
            onSaveNode={saveNodeDraft}
            onDeleteNode={removeNode}
            nodeStates={displayNodeStates}
            activeExecution={activeExecution}
            createNode={(type, position) => makeNode(type, position, permission?.nodes || [])}
            onTest={runTest}
            onEditTest={() => setTestOpen(true)}
          />
        )}

        {false && tab === 1 && (
          <Grid container spacing={2} alignItems="flex-start">
            <Grid item xs={12} md={3} lg={2.5}>
              <Paper sx={{ p: 1.5, position: { md: 'sticky' }, top: { md: 0 } }}>
                <Button fullWidth variant="contained" startIcon={<Add />} onClick={() => createPermission()}>Nueva tarea</Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25, mb: 1 }}>El orquestador elige una tarea habilitada según sus instrucciones.</Typography>
                <Stack spacing={0.75}>
                  {(config.permissions || []).map((item, index) => (
                    <Paper
                      key={`${item.key}-${index}`}
                      variant="outlined"
                      onClick={() => { setPermissionIndex(index); setSelectedNodeKey(''); }}
                      sx={{ p: 1.25, cursor: 'pointer', borderColor: index === permissionIndex ? 'primary.main' : 'divider', bgcolor: index === permissionIndex ? 'action.selected' : 'background.paper' }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" noWrap>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.enabled === false ? 'Desactivada' : 'Activa'} · {item.nodes?.length || 0} nodos</Typography>
                        </Box>
                        <Chip size="small" label={(item.stateSchema?.inputFields || []).length} title="Variables de entrada" />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={9} lg={9.5}>
              {!permission ? <Alert severity="info">Crea una tarea para comenzar.</Alert> : <Stack spacing={2}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6">Identidad y enrutamiento</Typography>
                      <Typography variant="body2" color="text.secondary">Define qué representa esta tarea y cuándo puede usarla el orquestador.</Typography>
                    </Box>
                    <FormControlLabel control={<Switch checked={permission.enabled !== false} onChange={(event) => updatePermission({ enabled: event.target.checked })} />} label={permission.enabled !== false ? 'Habilitada' : 'Desactivada'} />
                    <Tooltip title="Eliminar tarea"><IconButton color="error" disabled={(config.permissions || []).length <= 1} onClick={removePermission}><Delete /></IconButton></Tooltip>
                  </Stack>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={5}><TextField fullWidth label="Nombre visible" value={permission.name || ''} onChange={(event) => updatePermission({ name: event.target.value })} /></Grid>
                    <Grid item xs={8} md={5}><TextField fullWidth label="Clave técnica" value={permission.key || ''} disabled={Boolean(permission.id)} onChange={(event) => updatePermission({ key: event.target.value })} helperText={permission.id ? 'La clave queda fija después del primer guardado para proteger rutas, estados e historiales.' : 'Sin espacios; se normaliza al guardar.'} /></Grid>
                    <Grid item xs={4} md={2}><TextField fullWidth type="number" label="Prioridad" value={permission.priority ?? permissionIndex} onChange={(event) => updatePermission({ priority: Number(event.target.value) })} /></Grid>
                    <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Descripción / cuándo elegirla" value={permission.description || ''} onChange={(event) => updatePermission({ description: event.target.value })} /></Grid>
                  </Grid>
                </Paper>

                <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                  <Typography variant="h6" sx={{ mb: 0.5 }}>Prompts de la tarea</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Cada prompt tiene una responsabilidad separada; ninguno queda fijado al giro de un negocio.</Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} lg={4}><TextField fullWidth multiline minRows={5} label="1. Selección" value={permission.routingPrompt || ''} onChange={(event) => updatePermission({ routingPrompt: event.target.value })} helperText="Cuándo el orquestador debe elegir esta tarea." /></Grid>
                    <Grid item xs={12} lg={4}><TextField fullWidth multiline minRows={5} label="2. Ejecución" value={permission.executionPrompt || ''} onChange={(event) => updatePermission({ executionPrompt: event.target.value })} helperText="Reglas para consultar, transformar o actuar." /></Grid>
                    <Grid item xs={12} lg={4}><TextField fullWidth multiline minRows={5} label="3. Respuesta" value={permission.responsePrompt || ''} onChange={(event) => updatePermission({ responsePrompt: event.target.value })} helperText="Cómo presentar el resultado al cliente." /></Grid>
                  </Grid>
                </Paper>

                <Grid container spacing={2}>
                  <Grid item xs={12} xl={6}>
                    <ContractEditor
                      title="Datos de entrada"
                      description="Variables que la tarea espera recibir. La ruta puede apuntar a message, contact, arguments.*, state.* o cualquier dato del flujo."
                      direction="input"
                      fields={permission.stateSchema?.inputFields || []}
                      onChange={(inputFields) => updateTaskSchema({ inputFields })}
                    />
                  </Grid>
                  <Grid item xs={12} xl={6}>
                    <ContractEditor
                      title="Datos de salida"
                      description="Variables que debe producir el workflow. Usa rutas como content o nodes.consulta.body.id."
                      direction="output"
                      fields={permission.stateSchema?.outputFields || []}
                      onChange={(outputFields) => updateTaskSchema({ outputFields })}
                    />
                  </Grid>
                </Grid>

                <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" fontWeight={800}>Continuidad y memoria de la tarea</Typography>
                      <Typography variant="body2" color="text.secondary">Actívala para pedidos o procesos que necesitan reunir datos durante varios mensajes.</Typography>
                    </Box>
                    <FormControlLabel control={<Switch checked={permission.continuationEnabled === true} onChange={(event) => updatePermission({ continuationEnabled: event.target.checked })} />} label="Mantener activa entre mensajes" />
                    {permission.continuationEnabled && <TextField size="small" type="number" label="Vence en minutos" value={permission.stateSchema?.ttlMinutes || 1440} onChange={(event) => updateTaskSchema({ ttlMinutes: Math.max(5, Number(event.target.value) || 1440) })} sx={{ width: { xs: '100%', md: 170 } }} />}
                  </Stack>
                  {permission.continuationEnabled && <TextField fullWidth size="small" sx={{ mt: 1.5 }} label="Regla opcional de finalización" value={permission.stateSchema?.completionRule || ''} onChange={(event) => updateTaskSchema({ completionRule: event.target.value })} placeholder="state.confirmado === true" helperText="Expresión JavaScript segura evaluada sobre state. También puedes finalizar desde un nodo." />}
                </Paper>
              </Stack>}
            </Grid>
          </Grid>
        )}

        {false && tab === 1 && (
          <Stack spacing={1.5}>
            <Paper sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }}>
                <Box sx={{ minWidth: { xs: '100%', lg: 260 } }}>
                  <Typography variant="subtitle1" fontWeight={800}>Subworkflow de {permission?.name || 'la tarea'}</Typography>
                  <Typography variant="caption" color="text.secondary">Aquí viven HTTP, Script, IA y condiciones. La salida del agente alimenta el único envío del workflow principal.</Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }} />
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Button size="small" variant="contained" color="success" startIcon={<PlayArrow />} onClick={() => setTestOpen(true)} disabled={testing || !permission?.nodes?.length}>Probar</Button>
                </Stack>
              </Stack>
              {permission && <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                <Paper variant="outlined" sx={{ p: 1, flex: 1, minWidth: 0, bgcolor: 'surface.soft' }}>
                  <Typography variant="caption" fontWeight={800} color="primary.main">{activeExecution?.input?.taskInput ? 'ENTRADA REAL · ARRASTRABLE' : 'ENTRADA DECLARADA · ARRASTRABLE'}</Typography>
                  <Box sx={{ maxHeight: 130, overflow: 'auto' }}><JsonDataTree data={activeExecution?.input?.taskInput || contractPreview(permission.stateSchema?.inputFields)} basePath="taskInput" emptyText="Define variables de entrada en la pestaña 2." /></Box>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1, flex: 1, minWidth: 0, bgcolor: 'surface.soft' }}>
                  <Typography variant="caption" fontWeight={800} color="secondary.main">{activeExecution?.output?.taskOutput ? 'SALIDA REAL' : 'SALIDA DECLARADA'}</Typography>
                  <Box sx={{ maxHeight: 130, overflow: 'auto' }}><JsonDataTree data={activeExecution?.output?.taskOutput || contractPreview(permission.stateSchema?.outputFields)} basePath="taskOutput" emptyText="Define variables de salida en la pestaña 2." /></Box>
                </Paper>
              </Stack>}
              <Divider sx={{ my: 1.25 }} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <History sx={{ color: 'text.secondary' }} />
                <Typography variant="caption" fontWeight={800}>EJECUCIONES</Typography>
                <Select size="small" displayEmpty value={selectedExecutionId} onChange={(event) => loadExecutionDetail(event.target.value)} sx={{ minWidth: { xs: 0, sm: 260 }, width: { xs: '100%', sm: 'auto' }, maxWidth: 420, flexGrow: 1, height: 34, fontSize: 12 }}>
                  <MenuItem value=""><em>Sin ejecución seleccionada</em></MenuItem>
                  {executions.map((execution) => <MenuItem key={execution.id} value={execution.id}>{executionLabel(execution)}</MenuItem>)}
                </Select>
                {activeExecution && <StatusChip status={activeExecution.status} durationMs={activeExecution.durationMs} />}
                <Tooltip title="Actualizar"><IconButton size="small" onClick={() => loadExecutions({ selectLatest: !selectedExecutionId })}><Refresh /></IconButton></Tooltip>
              </Stack>
            </Paper>

            {!permission ? <Alert severity="info">Crea una tarea en la pestaña 2 para diseñar su workflow.</Alert> : <Grid container spacing={1.5}>
              <Grid item xs={12} lg={8.5}>
                <AgentWorkflowCanvas
                  permission={permission}
                  nodeStates={displayNodeStates}
                  selectedNodeKey={selectedNodeKey}
                  onSelectNode={setSelectedNodeKey}
                  onChange={updatePermission}
                  createNode={(type, position) => makeNode(type, position, permission.nodes)}
                />
                <style>{`
                  @keyframes workflowDash { to { stroke-dashoffset: -30; } }
                  @keyframes workflowPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(37,99,235,.12), 0 8px 24px rgba(15,23,42,.10); } 50% { box-shadow: 0 0 0 9px rgba(37,99,235,.20), 0 10px 30px rgba(37,99,235,.18); } }
                `}</style>
                <Box ref={canvasRef} sx={(currentTheme) => ({ display: 'none', height: { xs: 500, sm: 620 }, width: '100%', minWidth: 0, overflow: 'auto', position: 'relative', bgcolor: 'surface.soft', backgroundImage: `radial-gradient(${currentTheme.palette.mode === 'dark' ? '#475569' : '#cbd5e1'} 1px, transparent 1px)`, backgroundSize: `${20 * zoom}px ${20 * zoom}px`, border: '1px solid', borderColor: 'divider', borderRadius: 2 })}>
                  {!permission.nodes.length && <Stack alignItems="center" spacing={1.5} sx={{ position: 'sticky', left: 0, width: '100%', pt: 12, pointerEvents: 'none' }}><Hub sx={{ fontSize: 48, color: 'text.disabled' }} /><Typography color="text.secondary">Agrega el primer nodo desde la barra superior.</Typography></Stack>}
                  <Box sx={{ position: 'relative', width: 1800 * zoom, height: 1000 * zoom }}>
                    <Box sx={{ position: 'absolute', inset: 0, width: 1800, height: 1000, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                      <svg width="1800" height="1000" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}><defs><marker id="workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>{edgeLines}</svg>
                      {edgeVisuals.map(({ edge, index, middleX, middleY }) => <Tooltip key={`insert-${edge.source}-${edge.target}-${index}`} title="Insertar nodo en esta conexión"><IconButton size="small" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setInsertMenu({ anchorEl: event.currentTarget, edge }); }} sx={{ position: 'absolute', left: middleX - 14, top: middleY - 14, width: 28, height: 28, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 2, zIndex: 3, '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}><Add sx={{ fontSize: 17 }} /></IconButton></Tooltip>)}
                      {permission.nodes.map((node) => {
                        const catalog = nodeCatalog.find((item) => item.type === node.type) || legacyTaskNodeCatalog[node.type] || nodeCatalog[2];
                        const nodeState = displayNodeStates[node.key] || null;
                        const runDetail = nodeState ? (statusDetails[nodeState.status] || statusDetails.waiting) : null;
                        const borderColor = selectedNodeKey === node.key ? catalog.color : runDetail?.color || theme.palette.divider;
                        return <Paper key={node.key} onMouseDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); dragRef.current = { key: node.key, offsetX: (event.clientX - rect.left) / zoom, offsetY: (event.clientY - rect.top) / zoom }; setSelectedNodeKey(node.key); }} sx={{ position: 'absolute', left: node.positionX || 0, top: node.positionY || 0, width: 220, p: 1.5, cursor: 'move', border: `2px solid ${borderColor}`, userSelect: 'none', borderRadius: 2.25, opacity: nodeState?.status === 'skipped' ? 0.62 : 1, boxShadow: nodeState?.status === 'success' ? '0 0 0 4px rgba(22,163,74,.10), 0 8px 22px rgba(15,23,42,.09)' : nodeState?.status === 'error' ? '0 0 0 5px rgba(220,38,38,.14)' : 3, animation: nodeState?.status === 'running' ? 'workflowPulse 1.15s ease-in-out infinite' : undefined, transition: 'border-color .2s, box-shadow .2s, opacity .2s' }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Box sx={{ width: 34, height: 34, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: catalog.color, bgcolor: `${catalog.color}18` }}>{catalog.icon}</Box>
                            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}><Typography variant="subtitle2" noWrap>{node.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{catalog.label} · {node.key}</Typography></Box>
                            <Tooltip title={connectingFrom ? 'Conectar aquí' : 'Iniciar conexión'}><IconButton size="small" color={connectingFrom === node.key ? 'primary' : 'default'} onMouseDown={(event) => event.stopPropagation()} onClick={() => connectNode(node.key)}><Link fontSize="small" /></IconButton></Tooltip>
                          </Stack>
                          {nodeState && <Stack direction="row" sx={{ mt: 1 }}><StatusChip compact status={nodeState.status} durationMs={nodeState.durationMs} /></Stack>}
                        </Paper>;
                      })}
                    </Box>
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12} lg={3.5}><NodeEditor node={selectedNode} trace={selectedNodeExecution} execution={activeExecution} updateNode={updateNode} renameNode={renameNode} removeNode={removeNode} edges={permission.edges} updatePermission={updatePermission} permission={permission} /></Grid>
            </Grid>}
            <Menu anchorEl={insertMenu?.anchorEl || null} open={Boolean(insertMenu)} onClose={() => setInsertMenu(null)}>
              <MenuItem disabled><Typography variant="caption" fontWeight={800}>INSERTAR EN LA CONEXIÓN</Typography></MenuItem>
              {taskInsertCatalog.map((item) => <MenuItem key={item.type} onClick={() => insertNodeBetween(item.type)}><Box sx={{ color: item.color, display: 'flex', mr: 1 }}>{item.icon}</Box>{item.label}</MenuItem>)}
            </Menu>
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={1.25} sx={{ minHeight: 0 }}>
            {Number(config.workflowEngineVersion || 0) < 2 && <Alert severity="error"><b>El backend activo todavía usa el motor anterior.</b> Reinicia el proceso del puerto 8002 para habilitar las trazas y animaciones reales del workflow principal.</Alert>}
            <Paper sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6">Workflow principal</Typography>
                  <Typography variant="body2" color="text.secondary">Conecta Entrada → Filtro → Orquestador → Agente → Enviar WhatsApp.</Typography>
                </Box>
                {activeExecution ? <Stack direction="row" spacing={1} alignItems="center"><Typography variant="caption" color="text.secondary">Última ejecución</Typography><StatusChip status={activeExecution.status} durationMs={activeExecution.durationMs} /></Stack> : <Chip size="small" variant="outlined" label="Sin ejecuciones" />}
                <Tooltip title="Cargar última ejecución"><IconButton onClick={() => loadExecutions({ selectLatest: true, taskKey: '' })}><Refresh /></IconButton></Tooltip>
              </Stack>
              {activeExecution?.trigger === 'test' && <Alert severity="warning" sx={{ mt: 1 }}>Esta ejecución fue una prueba aislada de agente; el workflow principal no participó.</Alert>}
            </Paper>
            <MainWorkflowEditor
              workflow={config.mainWorkflow || buildStarterMainWorkflow([])}
              permissions={config.permissions || []}
              nodeStates={globalDisplayNodeStates}
              activeExecution={activeExecution}
              onChange={(mainWorkflow) => setConfig((current) => ({ ...current, mainWorkflow }))}
              onOpenAgent={openTaskFromGlobal}
            />
          </Stack>
        )}

        {false && tab === 2 && (
          <Stack spacing={1.5}>
            {config.globalWorkflowValidationError && <Alert severity="warning">La topología guardada tenía un problema y se muestra una versión reparable: {config.globalWorkflowValidationError}. Revisa el flujo y guarda para confirmar la reparación.</Alert>}
            <Paper sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h6">Workflow general</Typography>
                    <Chip size="small" color="primary" variant="outlined" label={`${linkedTaskKeys.size}/${config.permissions?.length || 0} tareas enlazadas`} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">Los nodos core son fijos; las ramas de tareas se enlazan y configuran explícitamente.</Typography>
                </Box>
                <Button size="small" variant="contained" startIcon={<Link />} onClick={(event) => setLinkMenu({ anchorEl: event.currentTarget })}>Enlazar tarea</Button>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Tooltip title="Alejar"><IconButton size="small" onClick={() => setGlobalZoom((value) => Math.max(0.4, Number((value - 0.1).toFixed(2))))}><ZoomOut /></IconButton></Tooltip>
                  <Chip size="small" label={`${Math.round(globalZoom * 100)}%`} variant="outlined" />
                  <Tooltip title="Acercar"><IconButton size="small" onClick={() => setGlobalZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(2))))}><ZoomIn /></IconButton></Tooltip>
                  <Tooltip title="Ajustar al lienzo"><IconButton size="small" onClick={fitGlobalView}><CenterFocusStrong /></IconButton></Tooltip>
                </Stack>
              </Stack>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>CREAR Y ENLAZAR</Typography>
                {[
                  { type: 'ai', label: 'IA', icon: <Psychology /> },
                  { type: 'http_request', label: 'HTTP', icon: <Http /> },
                  { type: 'script', label: 'Script', icon: <Code /> },
                  { type: 'condition', label: 'Condición', icon: <Hub /> },
                ].map((shortcut) => <Button key={shortcut.type} size="small" variant="text" startIcon={shortcut.icon} onClick={() => createPermission({ initialNodeType: shortcut.type, link: true, openEditor: false })}>{shortcut.label}</Button>)}
              </Stack>
              <Divider sx={{ my: 1.25 }} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <History sx={{ color: 'text.secondary' }} />
                <Typography variant="caption" fontWeight={800}>EJECUCIONES DE LA SESIÓN</Typography>
                <Select size="small" displayEmpty value={selectedExecutionId} onChange={(event) => loadExecutionDetail(event.target.value)} sx={{ minWidth: { xs: 0, sm: 300 }, width: { xs: '100%', sm: 'auto' }, maxWidth: 520, flexGrow: 1, height: 34, fontSize: 12 }}>
                  <MenuItem value=""><em>Sin ejecución seleccionada</em></MenuItem>
                  {executions.map((execution) => <MenuItem key={execution.id} value={execution.id}>{executionLabel(execution)}</MenuItem>)}
                </Select>
                {activeExecution && <StatusChip status={activeExecution.status} durationMs={activeExecution.durationMs} />}
                <Tooltip title="Actualizar"><IconButton size="small" onClick={() => loadExecutions({ selectLatest: !selectedExecutionId, taskKey: '' })}><Refresh /></IconButton></Tooltip>
              </Stack>
              {activeExecution?.trigger === 'test' && <Alert severity="warning" sx={{ mt: 1 }}>Esta fue una prueba directa del subworkflow. El cerebro, el orquestador, la validación global y el envío no se colorean porque no participaron ni generaron trazas.</Alert>}
            </Paper>

            <Grid container spacing={1.5}>
              <Grid item xs={12} lg={8.5}>
                <style>{`
                  @keyframes workflowDash { to { stroke-dashoffset: -30; } }
                  @keyframes workflowPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(37,99,235,.12), 0 8px 24px rgba(15,23,42,.10); } 50% { box-shadow: 0 0 0 9px rgba(37,99,235,.20), 0 10px 30px rgba(37,99,235,.18); } }
                `}</style>
                <Box ref={globalCanvasRef} sx={(currentTheme) => ({ height: { xs: 520, sm: 650 }, width: '100%', minWidth: 0, overflow: 'auto', position: 'relative', bgcolor: 'surface.soft', backgroundImage: `radial-gradient(${currentTheme.palette.mode === 'dark' ? '#475569' : '#cbd5e1'} 1px, transparent 1px)`, backgroundSize: `${20 * globalZoom}px ${20 * globalZoom}px`, border: '1px solid', borderColor: 'divider', borderRadius: 2 })}>
                  <Box sx={{ position: 'relative', width: 1840 * globalZoom, height: Math.max(900, 260 + Math.max(1, linkedTaskKeys.size) * 145) * globalZoom }}>
                    <Box sx={{ position: 'absolute', inset: 0, width: 1840, height: Math.max(900, 260 + Math.max(1, linkedTaskKeys.size) * 145), transform: `scale(${globalZoom})`, transformOrigin: '0 0' }}>
                      <svg width="1840" height={Math.max(900, 260 + Math.max(1, linkedTaskKeys.size) * 145)} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
                        <defs><marker id="global-workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
                        {globalEdgeLines}
                      </svg>
                      <Tooltip title="Enlazar una tarea como nueva rama del orquestador">
                        <Paper
                          variant="outlined"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); setLinkMenu({ anchorEl: event.currentTarget }); }}
                          sx={{ position: 'absolute', left: branchActionPosition.x - 58, top: branchActionPosition.y, px: 1, py: 0.65, display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: 'primary.main', borderStyle: 'dashed', borderColor: 'primary.main', bgcolor: 'background.paper', zIndex: 3, '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <Add fontSize="small" /><Typography variant="caption" fontWeight={800}>Enlazar rama</Typography>
                        </Paper>
                      </Tooltip>
                      {(globalWorkflow.nodes || []).map((node) => {
                        const catalog = globalNodeCatalog[node.type] || globalNodeCatalog.task_subworkflow;
                        const nodeState = globalDisplayNodeStates[node.key] || null;
                        const runDetail = nodeState ? (statusDetails[nodeState.status] || statusDetails.waiting) : null;
                        const borderColor = globalSelectedNodeKey === node.key ? catalog.color : runDetail?.color || theme.palette.divider;
                        const task = node.type === 'task_subworkflow' ? (config.permissions || []).find((item) => normalizedTaskKey(item.key) === normalizedTaskKey(node.config?.taskKey)) : null;
                        return (
                          <Paper
                            key={node.key}
                            onDoubleClick={() => node.type === 'task_subworkflow' && openTaskFromGlobal(node.config?.taskKey)}
                            onMouseDown={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              globalDragRef.current = { key: node.key, offsetX: (event.clientX - rect.left) / globalZoom, offsetY: (event.clientY - rect.top) / globalZoom };
                              setGlobalSelectedNodeKey(node.key);
                            }}
                            sx={{ position: 'absolute', left: node.positionX || 0, top: node.positionY || 0, width: 220, minHeight: 96, p: 1.5, cursor: 'move', border: `2px solid ${borderColor}`, userSelect: 'none', borderRadius: 2.25, opacity: node.enabled === false || nodeState?.status === 'skipped' ? 0.62 : 1, boxShadow: nodeState?.status === 'success' ? '0 0 0 4px rgba(22,163,74,.10), 0 8px 22px rgba(15,23,42,.09)' : nodeState?.status === 'error' ? '0 0 0 5px rgba(220,38,38,.14)' : 3, animation: nodeState?.status === 'running' || nodeState?.status === 'waiting_delivery' ? 'workflowPulse 1.15s ease-in-out infinite' : undefined, transition: 'border-color .2s, box-shadow .2s, opacity .2s' }}
                          >
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: catalog.color, bgcolor: `${catalog.color}18` }}>{catalog.icon}</Box>
                              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" noWrap>{node.name}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>{catalog.label}</Typography>
                              </Box>
                              {node.type === 'task_subworkflow' && <Chip size="small" label={task?.nodes?.length || 0} title="Nodos internos" />}
                            </Stack>
                            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1 }}>
                              {nodeState && <StatusChip compact status={nodeState.status} durationMs={nodeState.durationMs} />}
                              {node.type === 'task_subworkflow' && <Typography variant="caption" color="text.secondary" noWrap sx={{ flexGrow: 1 }}>Doble clic para editar</Typography>}
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Box>
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12} lg={3.5}>
                <GlobalNodeInspector
                  node={globalSelectedNode}
                  nodeState={globalSelectedNode ? globalDisplayNodeStates[globalSelectedNode.key] : null}
                  trace={globalSelectedNodeExecution}
                  permission={(config.permissions || []).find((item) => normalizedTaskKey(item.key) === normalizedTaskKey(globalSelectedNode?.config?.taskKey))}
                  linkedPermissions={(config.permissions || []).filter((item) => linkedTaskKeys.has(normalizedTaskKey(item.key)))}
                  onUpdateConfig={updateGlobalNodeConfig}
                  onEditTask={openTaskFromGlobal}
                  onUnlinkTask={unlinkTaskReference}
                />
              </Grid>
            </Grid>
            <Menu anchorEl={linkMenu?.anchorEl || null} open={Boolean(linkMenu)} onClose={() => setLinkMenu(null)}>
              <MenuItem disabled><Typography variant="caption" fontWeight={800}>ENLAZAR TAREA EXISTENTE</Typography></MenuItem>
              {unlinkedPermissions.length === 0 && <MenuItem disabled>Todas las tareas existentes están enlazadas</MenuItem>}
              {unlinkedPermissions.map((item) => (
                <MenuItem key={item.key} onClick={() => linkExistingTask(item.key)}>
                  <Tune fontSize="small" sx={{ mr: 1, color: '#d97706' }} />
                  <Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.key}{item.enabled === false ? ' · desactivada' : ''}</Typography></Box>
                </MenuItem>
              ))}
              <Divider />
              <MenuItem onClick={() => { setLinkMenu(null); createPermission({ link: true, openEditor: false }); }}><Add fontSize="small" sx={{ mr: 1 }} />Crear tarea vacía y enlazar</MenuItem>
            </Menu>
          </Stack>
        )}
      </DialogContent>
      <DialogActions component="footer" sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5, flexWrap: 'wrap', bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}><Button onClick={onClose}>{pageMode ? 'Volver al panel' : 'Cerrar'}</Button><Button variant="contained" startIcon={<Save />} disabled={loading} onClick={save}>{loading ? 'Guardando...' : 'Guardar en BD'}</Button></DialogActions>
      <WorkflowTestDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        onSave={saveTestPayload}
        loading={testing}
        task={permission}
        payload={testPayload}
        setPayload={setTestPayload}
      />
    </ConfigShell>
  );
};

const GlobalNodeInspector = ({ node, nodeState, trace, permission, linkedPermissions = [], onUpdateConfig, onEditTask, onUnlinkTask }) => {
  const [inspectorTab, setInspectorTab] = useState(0);
  useEffect(() => setInspectorTab(0), [node?.key]);
  if (!node) return <Paper variant="outlined" sx={{ p: 2 }}><Alert severity="info">Selecciona un nodo del canvas para configurar sus parámetros.</Alert></Paper>;

  const catalog = globalNodeCatalog[node.type] || globalNodeCatalog.task_subworkflow;
  const setNodeConfig = (patch) => onUpdateConfig?.(node.key, patch);
  const messageTypes = Array.isArray(node.config?.messageTypes) ? node.config.messageTypes : [];
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', minHeight: 430 }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: catalog.color, bgcolor: `${catalog.color}18` }}>{catalog.icon}</Box>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="subtitle1" fontWeight={800} noWrap>{node.name}</Typography>
            <Typography variant="caption" color="text.secondary">{catalog.label}</Typography>
          </Box>
          {nodeState && <StatusChip compact status={nodeState.status} durationMs={nodeState.durationMs} />}
        </Stack>
      </Box>
      <Tabs value={inspectorTab} onChange={(_, value) => setInspectorTab(value)} variant="fullWidth" sx={{ minHeight: 42, '& .MuiTab-root': { minHeight: 42, minWidth: 0, px: 0.5, fontSize: 11 } }}>
        <Tab label="Parámetros" onDragEnter={() => setInspectorTab(0)} />
        <Tab label="Entrada" />
        <Tab label="Salida" />
      </Tabs>
      {inspectorTab === 0 && <Stack spacing={1.5} sx={{ p: 2 }}>
        {node.type === 'whatsapp_trigger' && <TextField
          select fullWidth label="Tipos de mensaje" value={messageTypes}
          SelectProps={{ multiple: true, renderValue: (selected) => selected.length ? selected.join(', ') : 'Todos los tipos soportados' }}
          onChange={(event) => setNodeConfig({ messageTypes: typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value })}
        >
          {['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'contacts'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
        </TextField>}
        {node.type === 'preanalysis' && <>
          <DroppableTextField fullWidth multiline minRows={8} label="Prompt de preanálisis" value={node.config?.prompt || ''} onChange={(event) => setNodeConfig({ prompt: event.target.value })} helperText="Vacío: usa el prompt de preanálisis de la sección 1. Puedes arrastrar una ruta real desde Entrada o Salida hacia Parámetros." />
          <FormControlLabel control={<Switch checked={node.config?.ignoreUnrelatedMessages !== false} onChange={(event) => setNodeConfig({ ignoreUnrelatedMessages: event.target.checked })} />} label="Ignorar mensajes no relacionados" />
        </>}
        {node.type === 'orchestrator' && <>
          <DroppableTextField fullWidth multiline minRows={8} label="Prompt del orquestador" value={node.config?.prompt || ''} onChange={(event) => setNodeConfig({ prompt: event.target.value })} helperText="Vacío: usa el prompt del orquestador de la sección 1. Puedes arrastrar una ruta real desde Entrada o Salida hacia Parámetros." />
          <TextField select fullWidth label="Tarea fallback" value={node.config?.fallbackTaskKey || ''} onChange={(event) => setNodeConfig({ fallbackTaskKey: event.target.value })}>
            <MenuItem value=""><em>Sin fallback</em></MenuItem>
            {linkedPermissions.map((item) => <MenuItem key={item.key} value={item.key}>{item.name} · {item.key}</MenuItem>)}
          </TextField>
        </>}
        {node.type === 'response_guard' && <>
          <Alert severity="info">Nodo heredado. La salida ahora se protege mediante contratos, evidencia autorizada y plantilla, sin una llamada adicional al modelo.</Alert>
        </>}
        {node.type === 'whatsapp_output' && <DroppableTextField fullWidth multiline minRows={8} label="Plantilla del contenido final" value={node.config?.contentTemplate || ''} onChange={(event) => setNodeConfig({ contentTemplate: event.target.value })} helperText="Vacío: conserva el contenido producido por el agente. Puedes arrastrar una ruta real desde Entrada o Salida hacia Parámetros." />}
        {node.type === 'task_subworkflow' && <>
          <TextField fullWidth label="Tarea vinculada" value={node.config?.taskKey || ''} InputProps={{ readOnly: true }} />
          <JsonField label="Mapeo de entrada" value={node.config?.inputMapping || {}} onChange={(inputMapping) => setNodeConfig({ inputMapping })} rows={7} helperText="Mapea variables reales del workflow hacia los contratos de entrada de la tarea." />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button fullWidth variant="contained" startIcon={<Tune />} onClick={() => onEditTask(node.config?.taskKey)}>Editar subworkflow</Button>
            <Button fullWidth color="error" variant="outlined" startIcon={<Delete />} onClick={() => onUnlinkTask(node.config?.taskKey)}>Quitar referencia</Button>
          </Stack>
          {permission?.enabled === false && <Alert severity="warning">La tarea enlazada está desactivada y no será elegida por el orquestador.</Alert>}
        </>}
      </Stack>}
      {inspectorTab === 1 && <Box sx={{ p: 1.5, maxHeight: 560, overflow: 'auto' }}>
        {!trace && <Alert severity="info">Selecciona una ejecución que contenga una traza real de este nodo.</Alert>}
        {trace && <JsonDataTree data={trace.input} mode="template" emptyText="La traza real no registró datos de entrada." />}
      </Box>}
      {inspectorTab === 2 && <Box sx={{ p: 1.5, maxHeight: 560, overflow: 'auto' }}>
        {nodeState?.error && <Alert severity="error" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>{nodeState.error}</Alert>}
        {!trace && <Alert severity="info">Selecciona una ejecución que contenga una traza real de este nodo.</Alert>}
        {trace && <JsonDataTree data={trace.output} mode="template" emptyText="La traza real no registró datos de salida." />}
      </Box>}
    </Paper>
  );
};

const WorkflowTestDialog = ({ open, onClose, onSave, loading, task, payload, setPayload }) => {
  const [advanced, setAdvanced] = useState(false);
  const setField = (field, value) => setPayload((current) => ({ ...current, [field]: value }));
  const setContact = (field, value) => setPayload((current) => ({ ...current, contact: { ...current.contact, [field]: value } }));
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Settings color="primary" /> Datos para la prueba aislada
        {task && <Chip size="small" label={task.name} />}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            Usa los datos simulados de este formulario. Puede consultar APIs de lectura y modelos IA, pero no participa el workflow principal: los envíos de WhatsApp y las operaciones HTTP que escriben datos se simulan.
          </Alert>
          <DroppableTextField
            autoFocus fullWidth multiline minRows={3}
            label="Mensaje del cliente"
            value={payload.message || ''}
            onChange={(event) => setField('message', event.target.value)}
            helperText="Escribe un caso realista para recorrer el workflow nodo por nodo."
          />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Número de prueba" value={payload.contact?.number || ''} onChange={(event) => setContact('number', event.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Nombre del contacto" value={payload.contact?.name || ''} onChange={(event) => setContact('name', event.target.value)} /></Grid>
            <Grid item xs={12} md={6}><JsonField label="Argumentos iniciales" value={payload.arguments || {}} onChange={(value) => setField('arguments', value)} rows={4} helperText={'Opcional. Ejemplo: {"producto":"agua","cantidad":2}'} /></Grid>
            <Grid item xs={12} md={6}><JsonField label="Estado previo del chat" value={payload.state || {}} onChange={(value) => setField('state', value)} rows={4} helperText="Opcional. Simula datos recordados en mensajes anteriores." /></Grid>
          </Grid>
          <Button size="small" startIcon={<Settings />} onClick={() => setAdvanced((current) => !current)} sx={{ alignSelf: 'flex-start' }}>
            {advanced ? 'Ocultar datos avanzados' : 'Preanálisis e historial avanzados'}
          </Button>
          {advanced && <Grid container spacing={2}>
            <Grid item xs={12} md={6}><JsonField label="Preanálisis" value={payload.analysis || {}} onChange={(value) => setField('analysis', value)} rows={5} helperText="Datos que normalmente produce el clasificador de intención." /></Grid>
            <Grid item xs={12} md={6}><JsonField label="Historial" value={payload.history || []} onChange={(value) => setField('history', Array.isArray(value) ? value : [])} rows={5} helperText={'Lista opcional: [{"role":"user","content":"Hola"}]'} /></Grid>
          </Grid>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Tooltip title="Guardar estos datos sin ejecutar la prueba"><IconButton color="primary" onClick={onSave} disabled={loading || !payload.message?.trim()}><Save /></IconButton></Tooltip>
      </DialogActions>
    </Dialog>
  );
};

const NodeEditor = ({ node, trace, execution, updateNode, renameNode, removeNode, edges, updatePermission, permission }) => {
  const [inspectorTab, setInspectorTab] = useState(0);
  const [dataDockTab, setDataDockTab] = useState(0);
  useEffect(() => { setInspectorTab(0); setDataDockTab(0); }, [node?.key]);
  if (!node) return <Paper sx={{ p: 2 }}><Settings color="disabled" /><Typography variant="body2" color="text.secondary">Selecciona un nodo para editarlo.</Typography></Paper>;
  const setConfig = (field, value) => updateNode(node.key, { config: { ...node.config, [field]: value } });
  const setCredentials = (field, value) => updateNode(node.key, { credentials: { ...node.credentials, [field]: value } });
  const variableMode = ['script', 'transform', 'condition'].includes(node.type) ? 'code' : 'template';
  return <Paper sx={{ p: 0, maxHeight: 760, overflow: 'hidden' }}>
    <Box sx={{ px: 2, pt: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}><Typography variant="subtitle2" noWrap>{node.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{node.key}</Typography></Box>
        {trace && <StatusChip status={trace.status} durationMs={trace.durationMs} compact />}
      </Stack>
    </Box>
    <Tabs value={inspectorTab} onChange={(_, value) => setInspectorTab(value)} variant="fullWidth" sx={{ minHeight: 42, '& .MuiTab-root': { minHeight: 42, minWidth: 0, px: 0.5, fontSize: 11 } }}>
      <Tab label="Parámetros" />
      <Tab label="Entrada" />
      <Tab label="Salida" />
    </Tabs>
    <Divider />
    {inspectorTab === 0 && <Stack spacing={2} sx={{ p: 2, maxHeight: 680, overflow: 'auto' }}>
      {trace && <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: 'surface.soft' }}>
        <Stack direction="row" alignItems="center" sx={{ px: 1, pt: 0.5 }}>
          <Typography variant="caption" fontWeight={800} sx={{ flexGrow: 1 }}>DATOS PARA ARRASTRAR</Typography>
          <Tabs value={dataDockTab} onChange={(_, value) => setDataDockTab(value)} sx={{ minHeight: 30, '& .MuiTab-root': { minHeight: 30, minWidth: 55, px: 0.5, fontSize: 10 } }}><Tab label="Entrada" /><Tab label="Salida" /></Tabs>
        </Stack>
        <Divider />
        <Box sx={{ maxHeight: 165, overflow: 'auto', p: 0.5 }}>
          {dataDockTab === 0
            ? <JsonDataTree data={trace.input} mode={variableMode} emptyText="Esta ejecución aún no tiene entrada." />
            : <JsonDataTree data={trace.output} basePath={`nodes.${node.key}`} mode={variableMode} emptyText="La salida aparecerá al terminar el nodo." />}
        </Box>
      </Paper>}
      <TextField size="small" label="Nombre" value={node.name} onChange={(event) => updateNode(node.key, { name: event.target.value })} />
      <TextField size="small" label="Clave de salida" value={node.key} onChange={(event) => renameNode(node.key, event.target.value)} helperText="Úsala como nodes.clave.campo" />
      {node.type === 'http_request' && <>
        <TextField select size="small" label="Método" value={node.config.method || 'GET'} onChange={(event) => setConfig('method', event.target.value)}>{['GET','POST','PUT','PATCH','DELETE'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}</TextField>
        <DroppableTextField size="small" label="URL" value={node.config.url || ''} onChange={(event) => setConfig('url', event.target.value)} />
        <TextField select size="small" label="Autenticación" value={node.credentials.authType || 'none'} onChange={(event) => setCredentials('authType', event.target.value)}>{['none','bearer','basic','api_key','custom_header'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField>
        {['api_key','custom_header'].includes(node.credentials.authType) && <TextField size="small" label="Header de autenticación" value={node.credentials.authHeader || ''} onChange={(event) => setCredentials('authHeader', event.target.value)} />}
        {node.credentials.authType !== 'none' && <TextField size="small" type="password" label="Token / credencial" value={node.credentials.authValue || ''} onChange={(event) => setCredentials('authValue', event.target.value)} placeholder={node.hasCredentials ? 'Guardada · escribe para cambiar' : ''} />}
        <JsonField label="Headers JSON" value={node.config.headers} onChange={(value) => setConfig('headers', value)} />
        <JsonField label="Query params JSON" value={node.config.queryParams} onChange={(value) => setConfig('queryParams', value)} />
        <JsonField label="Body JSON" value={node.config.requestBody} onChange={(value) => setConfig('requestBody', value)} rows={6} />
        <TextField size="small" type="number" label="Tiempo máximo (segundos)" value={Math.round((node.config.timeoutMs ?? 30000) / 1000)} onChange={(event) => setConfig('timeoutMs', Number(event.target.value) * 1000)} inputProps={{ min: 1, max: 120, step: 1 }} helperText="Auméntalo si la API tarda en generar todos los registros." />
        <TextField size="small" type="number" label="Tamaño máximo de respuesta (MB)" value={node.config.maxResponseMb ?? 25} onChange={(event) => setConfig('maxResponseMb', Number(event.target.value))} inputProps={{ min: 1, max: 100, step: 1 }} helperText="Protege al servidor de reinicios por memoria. No limita registros mientras el JSON quepa en este tamaño." />
        <TextField size="small" label="Ruta del array u objeto" value={node.config.responsePath || ''} onChange={(event) => setConfig('responsePath', event.target.value)} helperText="Ejemplo: data.products. Vacío si la respuesta raíz ya es el array." />
        <JsonField label="Campos que quieres conservar" value={node.config.responseMapping || {}} onChange={(value) => setConfig('responseMapping', value)} rows={5} helperText={'Se aplica a cada objeto del array. Ejemplo: {"id":"id","nombre":"details.name","precio":"details.price"}. Vacío conserva todo.'} />
        <JsonField label="Guardar campos en el estado" value={node.config.stateMapping || {}} onChange={(value) => setConfig('stateMapping', value)} rows={4} helperText={'Recuerda datos para el siguiente mensaje. Ejemplo: {"productId":"id","precioConfirmado":"price"}'} />
        <TextField select size="small" label="Política cuando un dato no aparece" value={node.config.sourcePolicy || 'open_world'} onChange={(event) => setConfig('sourcePolicy', event.target.value)}>
          <MenuItem value="open_world">Abierta: no se sabe</MenuItem>
          <MenuItem value="closed_world">Cerrada: no se ofrece / no existe</MenuItem>
        </TextField>
        {!['GET', 'HEAD'].includes(String(node.config.method || 'GET').toUpperCase()) && <>
          <FormControlLabel control={<Switch checked={node.config.requiresConfirmation === true} onChange={(event) => setConfig('requiresConfirmation', event.target.checked)} />} label="Exigir confirmación antes de ejecutar" />
          {node.config.requiresConfirmation === true && <TextField size="small" label="Ruta del dato confirmado" value={node.config.confirmationPath || 'state.confirmed'} onChange={(event) => setConfig('confirmationPath', event.target.value)} helperText="Debe contener el booleano true. Ejemplo: state.confirmed" />}
          <FormControlLabel control={<Switch checked={node.config.oncePerTask !== false} onChange={(event) => setConfig('oncePerTask', event.target.checked)} />} label="Ejecutar esta acción solo una vez por tarea" />
          <FormControlLabel control={<Switch checked={node.config.completeTaskOnSuccess === true} onChange={(event) => setConfig('completeTaskOnSuccess', event.target.checked)} />} label="Finalizar la tarea cuando la acción sea exitosa" />
          <DroppableTextField size="small" label="Clave de idempotencia" value={node.config.idempotencyKeyTemplate || ''} onChange={(event) => setConfig('idempotencyKeyTemplate', event.target.value)} helperText="Evita repetir una venta o acción. Puedes arrastrar datos del mensaje o contacto." />
        </>}
        <DroppableTextField multiline minRows={2} label="Cómo interpretar la respuesta" value={node.config.responseInstructions || ''} onChange={(event) => setConfig('responseInstructions', event.target.value)} />
      </>}
      {node.type === 'script' && <DroppableTextField dropMode="code" multiline minRows={12} label="JavaScript" value={node.config.code || ''} onChange={(event) => setConfig('code', event.target.value)} helperText="Recibe input y debe retornar un valor. Arrastra una hoja para insertar input.ruta." InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }} />}
      {node.type === 'transform' && <DroppableTextField dropMode="code" multiline minRows={6} label="Expresión JavaScript" value={node.config.expression || ''} onChange={(event) => setConfig('expression', event.target.value)} helperText="Arrastra una hoja para insertar input.ruta." />}
      {['script', 'transform'].includes(node.type) && <FormControlLabel control={<Switch checked={node.config.authoritative === true} onChange={(event) => setConfig('authoritative', event.target.checked)} />} label="Marcar salida como dato autorizado" />}
      {node.type === 'state_update' && <>
        <JsonField label="Campos que se guardarán en el estado" value={node.config.updates || {}} onChange={(value) => setConfig('updates', value)} rows={6} helperText={'Acepta variables del flujo. Ejemplo: {"producto":"{{arguments.producto}}","confirmed":true}'} />
        <FormControlLabel control={<Switch checked={node.config.taskComplete === true} onChange={(event) => setConfig('taskComplete', event.target.checked)} />} label="Finalizar y limpiar la tarea activa" />
      </>}
      {node.type === 'condition' && <DroppableTextField dropMode="code" multiline minRows={5} label="Condición JavaScript" value={node.config.expression || ''} onChange={(event) => setConfig('expression', event.target.value)} helperText="Arrastra una hoja para insertar input.ruta. Las conexiones pueden usar true o false." />}
      {node.type === 'ai' && <>
        <FormControlLabel control={<Switch checked={node.config.useSessionModel !== false} onChange={(event) => setConfig('useSessionModel', event.target.checked)} />} label="Usar modelo de la sesión" />
        {node.config.useSessionModel === false && <>
          <TextField select size="small" label="Proveedor / protocolo" value={node.config.provider || 'openai_compatible'} onChange={(event) => {
            const provider = event.target.value;
            const defaults = providerDefaults[provider] || {};
            updateNode(node.key, { config: { ...node.config, provider, apiUrl: defaults.aiApiUrl || '', model: defaults.aiModel || '' } });
          }}><MenuItem value="openai">OpenAI</MenuItem><MenuItem value="groq">Groq</MenuItem><MenuItem value="openai_compatible">Otro compatible con OpenAI</MenuItem><MenuItem value="gemini">Gemini</MenuItem></TextField>
          <TextField size="small" label="URL API" value={node.config.apiUrl || ''} onChange={(event) => setConfig('apiUrl', event.target.value)} />
          <TextField size="small" label="Modelo" value={node.config.model || ''} onChange={(event) => setConfig('model', event.target.value)} />
          <TextField size="small" type="password" label="Token" value={node.credentials.apiToken || ''} onChange={(event) => setCredentials('apiToken', event.target.value)} placeholder={node.hasCredentials ? 'Guardado' : ''} />
        </>}
        <DroppableTextField multiline minRows={8} label="Prompt del nodo" value={node.config.prompt || ''} onChange={(event) => setConfig('prompt', event.target.value)} />
        <FormControlLabel control={<Switch checked={node.config.outputField === 'content'} onChange={(event) => setConfig('outputField', event.target.checked ? 'content' : '')} />} label="Usar este contenido como respuesta de la tarea" />
      </>}
      {node.type === 'whatsapp_output' && <DroppableTextField multiline minRows={6} label="Contenido final que devuelve la tarea" value={node.config.contentTemplate || ''} onChange={(event) => setConfig('contentTemplate', event.target.value)} helperText="Este nodo interno no envía dos veces: prepara el texto que el nodo Salida WhatsApp del workflow general entregará. Ejemplo: {{nodes.redactar.content}}" />}
      <Divider />
      <Typography variant="caption" fontWeight={700}>CONEXIONES</Typography>
      {edges.filter((edge) => edge.source === node.key || edge.target === node.key).map((edge, index) => <Stack key={`${edge.source}-${edge.target}-${index}`} direction="row" alignItems="center" spacing={1}>
        <Typography variant="caption" sx={{ flexGrow: 1 }}>{edge.source} → {edge.target}</Typography>
        {node.type === 'condition' && edge.source === node.key && <Select size="small" value={edge.sourceHandle || 'true'} onChange={(event) => updatePermission({ edges: permission.edges.map((item) => item === edge ? { ...item, sourceHandle: event.target.value } : item) })}><MenuItem value="true">Verdadero</MenuItem><MenuItem value="false">Falso</MenuItem></Select>}
        <IconButton size="small" onClick={() => updatePermission({ edges: permission.edges.filter((item) => item !== edge) })}><Delete fontSize="small" /></IconButton>
      </Stack>)}
      <Button color="error" startIcon={<Delete />} onClick={() => removeNode(node.key)}>Eliminar nodo</Button>
    </Stack>}
    {inspectorTab === 1 && <Box sx={{ p: 1.5, maxHeight: 680, overflow: 'auto' }}>
      {!execution && <Alert severity="info">Ejecuta una prueba o elige una ejecución reciente para inspeccionar datos reales.</Alert>}
      {execution && !trace && <Alert severity="info">Este nodo todavía está esperando o no pertenecía a esa versión del workflow.</Alert>}
      {trace && <>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}><StatusChip status={trace.status} durationMs={trace.durationMs} /><Typography variant="caption" color="text.secondary">Arrastra una hoja a Parámetros.</Typography></Stack>
        <JsonDataTree data={trace.input} mode={variableMode} emptyText="El nodo no recibió datos de entrada." />
      </>}
    </Box>}
    {inspectorTab === 2 && <Box sx={{ p: 1.5, maxHeight: 680, overflow: 'auto' }}>
      {!execution && <Alert severity="info">La salida aparecerá después de una ejecución.</Alert>}
      {trace?.error && <Alert severity="error" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>{trace.error}</Alert>}
      {trace && <>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}><StatusChip status={trace.status} durationMs={trace.durationMs} /><Typography variant="caption" color="text.secondary">Ruta base: nodes.{node.key}</Typography></Stack>
        <JsonDataTree data={trace.output} basePath={`nodes.${node.key}`} mode={variableMode} emptyText={trace.status === 'running' ? 'El nodo se está ejecutando…' : 'El nodo no produjo salida.'} />
      </>}
    </Box>}
  </Paper>;
};

export default AiCrmConfig;
