import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Alert, Box, Button, Chip, Dialog, Divider, IconButton, Menu, MenuItem, Paper, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add, AutoAwesome, Close, Delete, FilterAlt, Hub, Input, OpenInNew, Output, Search,
} from '@mui/icons-material';
import JsonDataTree from './JsonDataTree';

const TYPE_META = {
  whatsapp_input: { label: 'Entrada WhatsApp', color: '#22c55e', icon: Input },
  interaction_filter: { label: 'Filtro de interacción', color: '#f59e0b', icon: FilterAlt },
  orchestrator: { label: 'Orquestador', color: '#8b5cf6', icon: Hub },
  agent: { label: 'Agente / task-handler', color: '#3b82f6', icon: AutoAwesome },
  whatsapp_output: { label: 'Enviar WhatsApp', color: '#14b8a6', icon: Output },
};

const statusColor = (status) => ({
  running: '#3b82f6', waiting_delivery: '#f59e0b', success: '#22c55e', error: '#ef4444', skipped: '#64748b', waiting: '#94a3b8',
}[status] || '#94a3b8');

const workflowNode = ({ data, selected }) => {
  const meta = TYPE_META[data.type] || TYPE_META.agent;
  const Icon = meta.icon;
  const state = data.runState;
  const border = selected ? meta.color : state ? statusColor(state.status) : 'var(--xy-node-border, #cbd5e1)';
  const isRunning = ['running', 'waiting_delivery'].includes(state?.status);
  const agentHandles = data.type === 'orchestrator' ? data.agentHandles || [] : [];
  return (
    <Paper
      elevation={selected || isRunning ? 8 : 2}
      sx={{
        width: 244, minHeight: 92, border: '2px solid', borderColor: border, borderRadius: 2,
        overflow: 'visible', opacity: data.enabled === false || state?.status === 'skipped' ? 0.58 : 1,
        animation: isRunning ? 'mainNodePulse 1.15s ease-in-out infinite' : 'none',
        bgcolor: 'background.paper', transition: 'border-color .18s, box-shadow .18s',
      }}
    >
      {data.type !== 'whatsapp_input' && <Handle id="input" type="target" position={Position.Left} style={{ width: 12, height: 12, border: '2px solid white', background: meta.color }} />}
      <Box sx={{ height: 5, bgcolor: meta.color, borderRadius: '7px 7px 0 0' }} />
      <Stack direction="row" spacing={1.15} alignItems="center" sx={{ p: 1.35 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: meta.color, bgcolor: `${meta.color}1a`, flex: '0 0 auto' }}><Icon fontSize="small" /></Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={800} noWrap>{data.label}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{meta.label}</Typography>
        </Box>
        {state && <Box title={state.error || state.status} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: statusColor(state.status), boxShadow: isRunning ? `0 0 0 5px ${statusColor(state.status)}25` : 'none' }} />}
      </Stack>
      {data.type === 'agent' && <Stack direction="row" spacing={0.5} sx={{ px: 1.35, pb: 1.1 }}><Chip size="small" label={data.agentKey} sx={{ maxWidth: 155 }} /><Chip size="small" variant="outlined" label={`${data.internalNodes || 0} nodos`} /></Stack>}
      {data.type === 'whatsapp_input' && <Handle id="message" type="source" position={Position.Right} style={{ width: 12, height: 12, border: '2px solid white', background: meta.color }} />}
      {data.type === 'interaction_filter' && <Handle id="respond" type="source" position={Position.Right} style={{ width: 12, height: 12, border: '2px solid white', background: meta.color }} />}
      {data.type === 'agent' && <Handle id="output" type="source" position={Position.Right} style={{ width: 12, height: 12, border: '2px solid white', background: meta.color }} />}
      {data.type === 'orchestrator' && (agentHandles.length ? agentHandles : ['route']).map((handle, index) => (
        <Handle
          key={handle} id={handle} type="source" position={Position.Right}
          title={handle}
          style={{ width: 11, height: 11, border: '2px solid white', background: meta.color, top: `${((index + 1) / ((agentHandles.length || 1) + 1)) * 100}%` }}
        />
      ))}
    </Paper>
  );
};

const RunningEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }) => {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const color = data?.color || '#94a3b8';
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: selected ? 3.5 : 2.4, strokeDasharray: data?.running ? '8 7' : undefined, animation: data?.running ? 'mainEdgeDash .55s linear infinite' : undefined }} />
    {selected && <EdgeLabelRenderer><Box className="nodrag nopan" sx={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}><Chip size="small" color="error" variant="filled" label="Supr para eliminar" /></Box></EdgeLabelRenderer>}
  </>;
};

const nodeTypes = { crmMainNode: workflowNode };
const edgeTypes = { running: RunningEdge };

const toFlowNodes = (workflow, permissions, nodeStates) => {
  const permissionByKey = new Map((permissions || []).map((agent) => [agent.key, agent]));
  const agentHandles = (workflow?.nodes || []).filter((node) => node.type === 'agent').map((node) => node.config?.agentKey).filter(Boolean);
  return (workflow?.nodes || []).map((node) => {
    const agent = node.type === 'agent' ? permissionByKey.get(node.config?.agentKey) : null;
    return {
      id: node.key,
      type: 'crmMainNode',
      position: { x: Number(node.positionX ?? node.position?.x ?? 0), y: Number(node.positionY ?? node.position?.y ?? 0) },
      deletable: node.type === 'agent',
      data: {
        type: node.type, label: node.name || node.key, enabled: node.enabled !== false,
        agentKey: node.config?.agentKey, internalNodes: agent?.nodes?.length || 0,
        agentHandles, runState: nodeStates?.[node.key] || null,
      },
    };
  });
};

const toFlowEdges = (workflow, nodeStates) => (workflow?.edges || []).map((edge, index) => {
  const state = nodeStates?.[edge.target] || nodeStates?.[edge.source];
  const running = ['running', 'waiting_delivery'].includes(nodeStates?.[edge.target]?.status)
    || (nodeStates?.[edge.source]?.status === 'running' && !nodeStates?.[edge.target]);
  return {
    id: String(edge.id || `${edge.source}:${edge.sourceHandle || ''}->${edge.target}:${edge.targetHandle || ''}:${index}`),
    source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || undefined, targetHandle: edge.targetHandle || undefined,
    type: 'running', deletable: true, data: { running, color: statusColor(state?.status) },
  };
});

const serialize = (base, nodes, edges, viewport) => ({
  ...base,
  viewport: viewport || base?.viewport || { x: 0, y: 0, zoom: 0.85 },
  nodes: nodes.map((node) => {
    const original = (base?.nodes || []).find((item) => item.key === node.id) || {};
    return { ...original, key: node.id, positionX: node.position.x, positionY: node.position.y };
  }),
  edges: edges.map((edge, index) => {
    const original = (base?.edges || []).find((item) => String(item.id || '') === String(edge.id)) || {};
    return { ...original, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || null, targetHandle: edge.targetHandle || null, sortOrder: index };
  }),
});

const allowedConnection = (connection, nodeMap) => {
  const source = nodeMap.get(connection.source);
  const target = nodeMap.get(connection.target);
  return Boolean(
    (source?.type === 'whatsapp_input' && target?.type === 'interaction_filter')
    || (source?.type === 'interaction_filter' && target?.type === 'orchestrator')
    || (source?.type === 'orchestrator' && target?.type === 'agent')
    || (source?.type === 'agent' && target?.type === 'whatsapp_output')
  );
};

const expectedMainData = (type, direction) => {
  const input = {
    whatsapp_input: { message: 'Mensaje del cliente', messageType: 'text', messageId: 'id WhatsApp', contact: { number: '51999999999', name: 'Cliente', jid: 'numero@s.whatsapp.net' }, session: { id: 'sessionId' }, history: [], state: {}, activeTask: null },
    interaction_filter: { message: 'Mensaje del cliente', history: [], activeTask: null, state: {}, previousAnalysis: {} },
    orchestrator: { analysis: { shouldRespond: true, topic: 'tema', entities: {} }, history: [], activeTask: null, state: {}, availableTasks: [{ key: 'responder', name: 'Responder' }] },
    agent: expectedAgentInput,
    whatsapp_output: { proposedContent: 'Respuesta del agente', evidence: {}, analysis: {}, state: {}, recipient: 'numero@s.whatsapp.net' },
  };
  const output = {
    whatsapp_input: { ...input.whatsapp_input, accepted: true },
    interaction_filter: { shouldRespond: true, topic: 'tema', requestType: 'consulta', entities: {}, priority: 0 },
    orchestrator: { taskKey: 'responder', taskName: 'Responder', reason: 'Coincide con la consulta', arguments: {} },
    agent: { content: 'Respuesta generada', state: {}, evidence: {}, nodes: {} },
    whatsapp_output: { content: 'Respuesta enviada', recipient: 'numero@s.whatsapp.net', messageId: 'id de salida', deliveryStatus: 'sent' },
  };
  return (direction === 'input' ? input : output)[type] || {};
};

const expectedAgentInput = {
  message: 'Mensaje del cliente', messageType: 'text', contact: { number: '51999999999', name: 'Cliente' },
  arguments: {}, analysis: {}, state: {}, history: [], session: { id: 'sessionId' }, task: { key: 'responder', name: 'Responder' },
};

const sampleForType = (field) => {
  if (field?.type === 'number' || field?.type === 'integer') return 1;
  if (field?.type === 'boolean') return true;
  if (field?.type === 'array') return [];
  if (field?.type === 'object') return {};
  return `valor de ${field?.name || 'campo'}`;
};

const contractPreview = (fields = []) => Object.fromEntries(fields.filter((field) => field?.name).map((field) => [field.name, sampleForType(field)]));

const mainNodeOutputPreview = (definition, permissions) => {
  if (!definition) return {};
  if (definition.type === 'agent') {
    const agent = (permissions || []).find((item) => item.key === definition.config?.agentKey);
    return contractPreview(agent?.stateSchema?.outputFields || []);
  }
  return expectedMainData(definition.type, 'output');
};

const mainAvailableVariables = (workflow, definition, permissions) => {
  if (!definition) return {};
  const incoming = new Map();
  (workflow?.edges || []).forEach((edge) => incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]));
  const ancestors = new Set();
  const visit = (key) => (incoming.get(key) || []).forEach((source) => { if (!ancestors.has(source)) { ancestors.add(source); visit(source); } });
  visit(definition.key);
  const definitions = new Map((workflow?.nodes || []).map((node) => [node.key, node]));
  const nodes = {};
  ancestors.forEach((key) => { nodes[key] = mainNodeOutputPreview(definitions.get(key), permissions); });
  const trigger = [...ancestors].map((key) => definitions.get(key)).find((node) => node?.type === 'whatsapp_input');
  return { ...(trigger ? expectedMainData('whatsapp_input', 'output') : {}), nodes };
};

const JsonConfigField = ({ value, onChange }) => {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [error, setError] = useState('');
  useEffect(() => { setText(JSON.stringify(value || {}, null, 2)); setError(''); }, [value]);
  return <TextField
    fullWidth multiline minRows={7} label="Mapeo de entrada (JSON)" value={text}
    error={Boolean(error)} helperText={error || 'Puedes usar variables como {{message}}, {{analysis.topic}} o {{contact.number}}.'}
    onChange={(event) => setText(event.target.value)}
    onBlur={() => { try { onChange(JSON.parse(text || '{}')); setError(''); } catch { setError('JSON inválido; no se guardó este cambio.'); } }}
    InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
  />;
};

const DroppableTextField = ({ value, onChange, ...props }) => <TextField
  {...props} value={value} onChange={onChange}
  onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-workflow-token')) event.preventDefault(); }}
  onDrop={(event) => {
    const token = event.dataTransfer.getData('application/x-workflow-token') || event.dataTransfer.getData('text/plain');
    if (!token) return;
    event.preventDefault();
    const start = Number.isInteger(event.target.selectionStart) ? event.target.selectionStart : String(value || '').length;
    const end = Number.isInteger(event.target.selectionEnd) ? event.target.selectionEnd : start;
    onChange({ target: { value: `${String(value || '').slice(0, start)}${token}${String(value || '').slice(end)}` } });
  }}
/>;

const MappingRows = ({ value = {}, onChange }) => {
  const entries = Object.entries(value || {});
  const write = (next) => onChange(Object.fromEntries(next.filter(([key]) => key)));
  const update = (index, part, nextValue) => write(entries.map((entry, itemIndex) => itemIndex === index ? (part === 'key' ? [nextValue.replace(/[^a-zA-Z0-9_.-]/g, '_'), entry[1]] : [entry[0], nextValue]) : entry));
  const add = () => {
    let suffix = entries.length + 1;
    const used = new Set(entries.map(([key]) => key));
    while (used.has(`campo_${suffix}`)) suffix += 1;
    write([...entries, [`campo_${suffix}`, '']]);
  };
  return <Paper variant="outlined" sx={{ p: 1.25 }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}><Box sx={{ flex: 1 }}><Typography variant="subtitle2" fontWeight={900}>Entradas del agente</Typography><Typography variant="caption" color="text.secondary">Arrastra datos anteriores al valor.</Typography></Box><Button size="small" startIcon={<Add />} onClick={add}>Agregar</Button></Stack>
    {!entries.length && <Alert severity="info">Sin mapeo manual: el agente recibe automáticamente todos los datos acumulados anteriores.</Alert>}
    <Stack spacing={0.8}>{entries.map(([key, expression], index) => <Stack key={`mapping-${index}`} direction="row" spacing={0.7} alignItems="flex-start"><TextField size="small" label="Campo" value={key} onChange={(event) => update(index, 'key', event.target.value)} sx={{ width: 125 }} /><DroppableTextField size="small" fullWidth label="Valor / variable" value={typeof expression === 'string' ? expression : JSON.stringify(expression)} onChange={(event) => update(index, 'value', event.target.value)} /><IconButton size="small" color="error" onClick={() => write(entries.filter((_, itemIndex) => itemIndex !== index))}><Delete fontSize="small" /></IconButton></Stack>)}</Stack>
  </Paper>;
};

const Inspector = ({ node, workflowNode: definition, workflow, trace, state, permissions, onChangeNode, onOpenAgent, onDelete, onClose }) => {
  if (!node || !definition) return null;
  const config = definition.config || {};
  const updateConfig = (patch) => onChangeNode(definition.key, { config: { ...config, ...patch } });
  const messageTypes = Array.isArray(config.messageTypes) ? config.messageTypes : [];
  const availableInput = mainAvailableVariables(workflow, definition, permissions);
  const availableOutput = mainNodeOutputPreview(definition, permissions);
  return <Paper variant="outlined" sx={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5 }}><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={900}>{definition.name}</Typography><Typography variant="caption" color="text.secondary">{TYPE_META[definition.type]?.label} · {definition.key}</Typography></Box><Tooltip title="Cerrar editor"><IconButton onClick={onClose}><Close /></IconButton></Tooltip></Stack>
    <Divider />
    <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '230px minmax(340px, 1fr) 230px' }, overflow: { xs: 'auto', lg: 'hidden' } }}>
      <Box sx={{ minHeight: 0, overflow: 'auto', bgcolor: 'surface.soft', borderRight: { lg: '1px solid' }, borderColor: 'divider', p: 1.25 }}><Typography variant="caption" fontWeight={900}>ENTRADA · DATOS ANTERIORES</Typography><Chip size="small" color={trace ? 'success' : 'default'} label={trace ? 'EJECUCIÓN REAL' : 'ESTRUCTURA'} sx={{ ml: 1 }} /><JsonDataTree data={trace?.input || availableInput} mode="template" emptyText="Sin datos anteriores" /></Box>
      <Stack spacing={1.5} sx={{ p: 1.75, minHeight: 0, overflow: 'auto' }}>
      <TextField fullWidth size="small" label="Nombre" value={definition.name || ''} onChange={(event) => onChangeNode(definition.key, { name: event.target.value })} />
      {definition.type === 'whatsapp_input' && <TextField select fullWidth size="small" label="Tipos de mensaje" value={messageTypes} SelectProps={{ multiple: true, renderValue: (items) => items.length ? items.join(', ') : 'Todos' }} onChange={(event) => updateConfig({ messageTypes: event.target.value })}>{['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'contacts'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField>}
      {definition.type === 'interaction_filter' && <Alert severity="info">Usa el prompt “Filtro de interacción” y la memoria configurados en Cerebro general. Este nodo decide si el mensaje continúa.</Alert>}
      {definition.type === 'orchestrator' && <TextField select fullWidth size="small" label="Agente fallback" value={config.fallbackAgentKey || ''} onChange={(event) => updateConfig({ fallbackAgentKey: event.target.value })}><MenuItem value=""><em>Sin fallback</em></MenuItem>{(permissions || []).map((agent) => <MenuItem key={agent.key} value={agent.key}>{agent.name}</MenuItem>)}</TextField>}
      {definition.type === 'agent' && <>
        <TextField fullWidth size="small" label="Agente" value={config.agentKey || ''} InputProps={{ readOnly: true }} />
        <MappingRows value={config.inputMapping || {}} onChange={(inputMapping) => updateConfig({ inputMapping })} />
        <Alert severity="info">Las entradas disponibles incluyen la salida acumulada de Entrada, Filtro y Orquestador. La salida de este nodo se toma del contrato definido en el agente.</Alert>
        <Button variant="contained" startIcon={<OpenInNew />} onClick={() => onOpenAgent(config.agentKey)}>Abrir subworkflow</Button>
        <Button color="error" variant="outlined" startIcon={<Delete />} onClick={() => onDelete(definition.key)}>Quitar del canvas</Button>
      </>}
      {definition.type === 'whatsapp_output' && <DroppableTextField fullWidth multiline minRows={7} label="Mensaje final" value={config.contentTemplate || ''} onChange={(event) => updateConfig({ contentTemplate: event.target.value })} helperText="Vacío envía content del agente. También puedes arrastrar variables desde Entrada o Salida." />}
      {state?.error && <Alert severity="error">{state.error}</Alert>}
      </Stack>
      <Box sx={{ minHeight: 0, overflow: 'auto', bgcolor: 'surface.soft', borderLeft: { lg: '1px solid' }, borderColor: 'divider', p: 1.25 }}><Typography variant="caption" fontWeight={900}>SALIDA DEL NODO</Typography><Chip size="small" color={trace ? 'success' : 'default'} label={trace ? 'EJECUCIÓN REAL' : 'CONTRATO'} sx={{ ml: 1 }} /><JsonDataTree data={trace?.output || availableOutput} basePath={trace?.output ? '' : `nodes.${definition.key}`} mode="template" emptyText="Sin campos de salida" /></Box>
    </Box>
  </Paper>;
};

const EditorInner = ({ workflow, permissions, nodeStates, activeExecution, onChange, onOpenAgent }) => {
  const wrapperRef = useRef(null);
  const { screenToFlowPosition, getViewport, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(workflow, permissions, nodeStates));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(workflow, nodeStates));
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [search, setSearch] = useState('');
  const [agentCreator, setAgentCreator] = useState(null);
  const applyingExternal = useRef(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (draggingRef.current) return;
    applyingExternal.current = true;
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return toFlowNodes(workflow, permissions, nodeStates).map((node) => ({ ...node, position: positions.get(node.id) || node.position }));
    });
    setEdges(toFlowEdges(workflow, nodeStates));
    queueMicrotask(() => { applyingExternal.current = false; });
  }, [workflow, permissions, nodeStates, setNodes, setEdges]);

  const commit = useCallback((nextNodes = nodes, nextEdges = edges) => {
    if (applyingExternal.current) return;
    onChange(serialize(workflow, nextNodes, nextEdges, getViewport()));
  }, [edges, getViewport, nodes, onChange, workflow]);

  const nodeMap = useMemo(() => new Map((workflow?.nodes || []).map((node) => [node.key, node])), [workflow]);
  const linkedNodeByAgent = new Map((workflow?.nodes || []).filter((node) => node.type === 'agent').map((node) => [node.config?.agentKey, node]));
  const catalogAgents = (permissions || []).filter((agent) => `${agent.name} ${agent.key}`.toLowerCase().includes(search.toLowerCase()));

  const addAgent = useCallback((agent, position) => {
    const keyBase = `agent_${agent.key}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    let key = keyBase;
    let suffix = 2;
    while ((workflow?.nodes || []).some((node) => node.key === key)) key = `${keyBase}_${suffix++}`;
    const definition = { key, name: agent.name, type: 'agent', enabled: agent.enabled !== false, positionX: position.x, positionY: position.y, config: { agentKey: agent.key, inputMapping: {} } };
    const nextWorkflow = { ...workflow, nodes: [...(workflow?.nodes || []), definition] };
    onChange(nextWorkflow);
    setSelectedNodeId(key);
  }, [onChange, workflow]);

  const onConnect = useCallback((connection) => {
    if (!allowedConnection(connection, nodeMap)) return;
    const sourceDefinition = nodeMap.get(connection.source);
    const targetDefinition = nodeMap.get(connection.target);
    const normalized = {
      ...connection,
      sourceHandle: sourceDefinition?.type === 'orchestrator' ? targetDefinition?.config?.agentKey : connection.sourceHandle,
      targetHandle: 'input',
    };
    if (edges.some((edge) => edge.source === normalized.source && edge.target === normalized.target)) return;
    const next = addEdge({ ...normalized, type: 'running', data: { color: '#94a3b8' } }, edges);
    setEdges(next);
    commit(nodes, next);
  }, [commit, edges, nodeMap, nodes, setEdges]);

  const deleteAgent = useCallback((key) => {
    const nextNodes = nodes.filter((node) => node.id !== key);
    const nextEdges = edges.filter((edge) => edge.source !== key && edge.target !== key);
    setNodes(nextNodes); setEdges(nextEdges); setSelectedNodeId('orchestrator'); commit(nextNodes, nextEdges);
  }, [commit, edges, nodes, setEdges, setNodes]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedDefinition = (workflow?.nodes || []).find((node) => node.key === selectedNodeId);
  const selectedTrace = activeExecution?.nodeExecutions?.find((trace) => trace.scope === 'main' && trace.nodeKey === selectedNodeId);

  const updateDefinition = (key, patch) => onChange({ ...workflow, nodes: (workflow?.nodes || []).map((node) => node.key === key ? { ...node, ...patch } : node) });

  const canvasCenter = () => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    return bounds ? screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }) : { x: 850, y: 260 };
  };

  const openAgentCreator = (event, position = canvasCenter()) => setAgentCreator({ anchor: { top: event.clientY, left: event.clientX }, position });

  return <GridShell>
    <Paper variant="outlined" sx={{ borderRadius: 0, borderTop: 0, borderBottom: 0, p: 1.25, overflow: 'auto' }}>
      <Typography variant="overline" fontWeight={900}>NODOS</Typography>
      <TextField size="small" fullWidth placeholder="Buscar agente" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 0.7, color: 'text.secondary' }} /> }} sx={{ my: 1 }} />
      <Typography variant="caption" color="text.secondary">Arrastra un agente al lienzo o pulsa para agregarlo.</Typography>
      <Stack spacing={0.75} sx={{ mt: 1.25 }}>
        {catalogAgents.map((agent) => { const linkedNode = linkedNodeByAgent.get(agent.key); return <Paper
          key={agent.key} variant="outlined" draggable
          onDragStart={(event) => { if (linkedNode) { event.preventDefault(); return; } event.dataTransfer.setData('application/x-crm-agent', agent.key); event.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => linkedNode ? setSelectedNodeId(linkedNode.key) : addAgent(agent, canvasCenter())}
          sx={{ p: 1, cursor: 'grab', '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' } }}
        ><Stack direction="row" spacing={1} alignItems="center"><AutoAwesome color="primary" fontSize="small" /><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" fontWeight={800} noWrap>{agent.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{agent.key} · {agent.nodes?.length || 0} nodos</Typography></Box>{linkedNode ? <Chip size="small" color="success" label="En flujo" /> : <Add fontSize="small" />}</Stack></Paper>; })}
        {!catalogAgents.length && <Alert severity="info">No hay agentes. Créalos en la sección 2.</Alert>}
      </Stack>
      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" color="text.secondary">Los nodos estructurales no se eliminan. Las conexiones sí: selecciónalas y pulsa Supr.</Typography>
    </Paper>
    <Box ref={wrapperRef} sx={{ minWidth: 0, minHeight: 0, position: 'relative' }} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-crm-agent')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={(event) => { event.preventDefault(); const key = event.dataTransfer.getData('application/x-crm-agent'); const agent = permissions.find((item) => item.key === key); if (agent) addAgent(agent, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
      <style>{`@keyframes mainEdgeDash{to{stroke-dashoffset:-30}} @keyframes mainNodePulse{0%,100%{box-shadow:0 0 0 3px rgba(59,130,246,.10)}50%{box-shadow:0 0 0 10px rgba(59,130,246,.20)}}`}</style>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)} onPaneClick={() => setSelectedNodeId('')}
        onNodeDragStart={() => { draggingRef.current = true; }}
        onNodeDragStop={(_, movedNode) => {
          draggingRef.current = false;
          const nextNodes = nodes.map((node) => node.id === movedNode.id ? { ...node, position: movedNode.position } : node);
          setNodes(nextNodes);
          commit(nextNodes, edges);
        }}
        onEdgesDelete={(deleted) => { const ids = new Set(deleted.map((edge) => edge.id)); const next = edges.filter((edge) => !ids.has(edge.id)); setEdges(next); commit(nodes, next); }}
        onNodesDelete={(deleted) => deleted.filter((node) => node.data.type === 'agent').forEach((node) => deleteAgent(node.id))}
        onMoveEnd={(_, viewport) => onChange(serialize(workflow, nodes, edges, viewport))}
        isValidConnection={(connection) => allowedConnection(connection, nodeMap)}
        onPaneContextMenu={(event) => { event.preventDefault(); openAgentCreator(event, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
        defaultViewport={workflow?.viewport || { x: 0, y: 0, zoom: 0.85 }} minZoom={0.25} maxZoom={1.8}
        deleteKeyCode={['Backspace', 'Delete']} selectionKeyCode="Shift" multiSelectionKeyCode="Control"
        fitView={!workflow?.viewport} proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1.2} />
        <MiniMap pannable zoomable nodeColor={(node) => TYPE_META[node.data.type]?.color || '#64748b'} />
        <Controls showInteractive={false} />
        <Panel position="top-left"><Stack direction="row" spacing={0.75}><Button size="small" variant="contained" startIcon={<Add />} onClick={(event) => openAgentCreator(event)}>Agregar agente</Button><Chip label={`${nodes.length} nodos`} size="small" /><Chip label={`${edges.length} conexiones`} size="small" variant="outlined" /><Button size="small" variant="outlined" onClick={() => fitView({ padding: 0.18, duration: 350 })}>Ajustar</Button></Stack></Panel>
      </ReactFlow>
      <Dialog open={Boolean(selectedNodeId && selectedNode && selectedDefinition)} onClose={() => setSelectedNodeId('')} fullWidth maxWidth="xl" PaperProps={{ sx: { height: 'min(88dvh, 900px)', maxHeight: '95dvh', overflow: 'hidden' } }}><Inspector node={selectedNode} workflowNode={selectedDefinition} workflow={workflow} trace={selectedTrace} state={nodeStates?.[selectedNodeId]} permissions={permissions} onChangeNode={updateDefinition} onOpenAgent={onOpenAgent} onDelete={deleteAgent} onClose={() => setSelectedNodeId('')} /></Dialog>
      <Menu open={Boolean(agentCreator)} onClose={() => setAgentCreator(null)} anchorReference="anchorPosition" anchorPosition={agentCreator?.anchor} MenuListProps={{ dense: true }}>
        <MenuItem disabled><Typography variant="caption" fontWeight={900}>AGREGAR AGENTE AQUÍ</Typography></MenuItem>
        <Divider />
        {catalogAgents.filter((agent) => !linkedNodeByAgent.has(agent.key)).map((agent) => <MenuItem key={agent.key} onClick={() => { addAgent(agent, agentCreator.position); setAgentCreator(null); }}><AutoAwesome color="primary" fontSize="small" sx={{ mr: 1 }} /><Box><Typography variant="body2" fontWeight={800}>{agent.name}</Typography><Typography variant="caption" color="text.secondary">{agent.key} · {agent.nodes?.length || 0} nodos internos</Typography></Box></MenuItem>)}
        {!catalogAgents.some((agent) => !linkedNodeByAgent.has(agent.key)) && <MenuItem disabled>No hay agentes sin conectar</MenuItem>}
      </Menu>
    </Box>
  </GridShell>;
};

const GridShell = ({ children }) => <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '240px minmax(0, 1fr)' }, gridTemplateRows: { xs: 'auto 680px', lg: 'minmax(680px, calc(100dvh - 285px))' }, minHeight: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', '& .react-flow': { bgcolor: 'surface.soft' }, '& .react-flow__minimap': { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' } }}>{children}</Box>;

const MainWorkflowEditor = (props) => <ReactFlowProvider><EditorInner {...props} /></ReactFlowProvider>;

export default MainWorkflowEditor;
