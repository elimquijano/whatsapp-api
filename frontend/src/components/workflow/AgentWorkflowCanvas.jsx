import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Panel, Position,
  ReactFlow, ReactFlowProvider, addEdge, getBezierPath, useEdgesState, useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Button, Chip, Divider, IconButton, Menu, MenuItem, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { Add, CenterFocusStrong, Code, Hub, Http, Input, Output, PlayArrow, Psychology, Settings, Tune } from '@mui/icons-material';

const TYPES = {
  agent_input: { label: 'Entrada del agente', color: '#16a34a', icon: Input, fixed: true },
  http_request: { label: 'HTTP Request', color: '#0ea5e9', icon: Http },
  script: { label: 'Script', color: '#8b5cf6', icon: Code },
  transform: { label: 'Transformar', color: '#a855f7', icon: Tune },
  state_update: { label: 'Actualizar estado', color: '#64748b', icon: Settings },
  condition: { label: 'Condición', color: '#f59e0b', icon: Hub },
  ai: { label: 'Modelo IA', color: '#10b981', icon: Psychology },
  agent_output: { label: 'Salida del agente', color: '#0f766e', icon: Output, fixed: true },
  whatsapp_output: { label: 'Salida heredada', color: '#64748b', icon: Hub, hidden: true },
};

const INSERTABLE = Object.entries(TYPES).filter(([, meta]) => !meta.fixed && !meta.hidden);
const statusColor = (status) => ({ running: '#2563eb', success: '#16a34a', error: '#dc2626', skipped: '#64748b', waiting: '#94a3b8' }[status] || '#94a3b8');

const AgentNode = ({ data, selected }) => {
  const meta = TYPES[data.type] || TYPES.transform;
  const Icon = meta.icon;
  const running = data.state?.status === 'running';
  return <Paper elevation={selected || running ? 8 : 2} sx={{ width: 232, position: 'relative', borderRadius: 2, border: '2px solid', borderColor: selected ? meta.color : data.state ? statusColor(data.state.status) : 'divider', overflow: 'visible', opacity: data.state?.status === 'skipped' ? 0.6 : 1, animation: running ? 'agentNodePulse 1.1s ease-in-out infinite' : 'none', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
    {data.type !== 'agent_input' && <Handle id="input" type="target" position={Position.Left} style={{ width: 13, height: 13, background: meta.color, border: '2px solid white' }} />}
    <Box sx={{ height: 5, bgcolor: meta.color, borderRadius: '7px 7px 0 0' }} />
    <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.25 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: 1.3, display: 'grid', placeItems: 'center', color: meta.color, bgcolor: `${meta.color}18` }}><Icon fontSize="small" /></Box>
      <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="subtitle2" fontWeight={800} noWrap>{data.label}</Typography><Typography variant="caption" color="text.secondary" noWrap>{meta.label}</Typography></Box>
      {data.state && <Box title={data.state.error || data.state.status} sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: statusColor(data.state.status) }} />}
    </Stack>
    {data.type === 'condition' ? <>
      <Typography variant="caption" sx={{ position: 'absolute', right: -38, top: '22%', color: 'success.main', fontWeight: 900 }}>SÍ</Typography>
      <Typography variant="caption" sx={{ position: 'absolute', right: -38, top: '60%', color: 'error.main', fontWeight: 900 }}>NO</Typography>
      <Handle id="true" type="source" position={Position.Right} title="Verdadero" style={{ width: 12, height: 12, top: '36%', background: '#16a34a', border: '2px solid white' }} />
      <Handle id="false" type="source" position={Position.Right} title="Falso" style={{ width: 12, height: 12, top: '72%', background: '#dc2626', border: '2px solid white' }} />
    </> : data.type !== 'agent_output' && <Handle id="output" type="source" position={Position.Right} style={{ width: 13, height: 13, background: meta.color, border: '2px solid white' }} />}
  </Paper>;
};

const InsertEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data }) => {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const color = data?.color || '#94a3b8';
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: selected ? 3.2 : 2.2, strokeDasharray: data?.running ? '8 7' : undefined, animation: data?.running ? 'agentEdgeDash .55s linear infinite' : undefined }} />
    <EdgeLabelRenderer>
      <Tooltip title="Insertar nodo aquí">
        <IconButton
          className="nodrag nopan" size="small"
          onClick={(event) => { event.stopPropagation(); data?.onInsert?.(event, { x: labelX, y: labelY }); }}
          sx={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', width: 27, height: 27, bgcolor: 'background.paper', border: '1px solid', borderColor: selected ? 'primary.main' : 'divider', boxShadow: 2, '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}
        ><Add sx={{ fontSize: 17 }} /></IconButton>
      </Tooltip>
    </EdgeLabelRenderer>
  </>;
};

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { insertable: InsertEdge };

const toFlowNodes = (permission, nodeStates, selectedNodeKey) => (permission?.nodes || []).map((node) => ({
  id: node.key,
  type: 'agentNode',
  position: { x: Number(node.positionX ?? 0), y: Number(node.positionY ?? 0) },
  selected: node.key === selectedNodeKey,
  deletable: !TYPES[node.type]?.fixed,
  data: { type: node.type, label: node.name || node.key, nodeKey: node.key, state: nodeStates[node.key] || null },
}));

const serializeEdges = (edges) => edges.map((edge) => ({ source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || null, targetHandle: edge.targetHandle || null }));

const Editor = ({ permission, nodeStates = {}, selectedNodeKey, onSelectNode, onChange, createNode, onTest, onEditTest }) => {
  const wrapperRef = useRef(null);
  const draggingRef = useRef(false);
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(permission, nodeStates, selectedNodeKey));
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [creator, setCreator] = useState(null);

  const openCreator = useCallback((event, position, edgeId = null) => {
    setCreator({ anchor: { top: event.clientY, left: event.clientX }, position, edgeId });
  }, []);

  const decorateEdges = useCallback((rawEdges) => rawEdges.map((edge, index) => {
    const state = nodeStates[edge.target] || nodeStates[edge.source];
    const running = nodeStates[edge.target]?.status === 'running' || (nodeStates[edge.source]?.status === 'running' && !nodeStates[edge.target]);
    const id = String(edge.id || `${edge.source}:${edge.sourceHandle || ''}->${edge.target}:${edge.targetHandle || ''}:${index}`);
    return { id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || undefined, targetHandle: edge.targetHandle || undefined, type: 'insertable', deletable: true, data: { running, color: statusColor(state?.status), onInsert: (event, position) => openCreator(event, position, id) } };
  }), [nodeStates, openCreator]);

  useEffect(() => {
    if (draggingRef.current) return;
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return toFlowNodes(permission, nodeStates, selectedNodeKey).map((node) => ({ ...node, position: positions.get(node.id) || node.position }));
    });
    setEdges(decorateEdges(permission?.edges || []));
  }, [decorateEdges, nodeStates, permission, selectedNodeKey, setEdges, setNodes]);

  const commit = useCallback((nextNodes, nextEdges) => onChange({
    nodes: nextNodes.map((flowNode) => {
      const original = permission.nodes.find((item) => item.key === flowNode.id);
      return { ...original, positionX: flowNode.position.x, positionY: flowNode.position.y };
    }),
    edges: serializeEdges(nextEdges),
    viewport: getViewport(),
  }), [getViewport, onChange, permission.nodes]);

  const addAt = useCallback((type, position, edgeId = null) => {
    const definition = createNode(type, position);
    const flowNode = { id: definition.key, type: 'agentNode', position, deletable: true, selected: true, data: { type: definition.type, label: definition.name, nodeKey: definition.key, state: null } };
    let nextEdges = edges;
    if (edgeId) {
      const replaced = edges.find((edge) => edge.id === edgeId);
      if (replaced) {
        const raw = edges.filter((edge) => edge.id !== edgeId).map((edge) => ({ ...edge }));
        const first = { source: replaced.source, target: definition.key, sourceHandle: replaced.sourceHandle, targetHandle: 'input' };
        const second = { source: definition.key, target: replaced.target, sourceHandle: type === 'condition' ? 'true' : 'output', targetHandle: replaced.targetHandle || 'input' };
        nextEdges = decorateEdges([...raw, first, second]);
      }
    }
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), flowNode];
    setNodes(nextNodes); setEdges(nextEdges); onSelectNode(definition.key);
    onChange({ nodes: [...permission.nodes, definition], edges: serializeEdges(nextEdges) });
    setCreator(null);
  }, [createNode, decorateEdges, edges, nodes, onChange, onSelectNode, permission.nodes, setEdges, setNodes]);

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const source = permission.nodes.find((node) => node.key === connection.source);
    const target = permission.nodes.find((node) => node.key === connection.target);
    if (!source || !target || source.type === 'agent_output' || target.type === 'agent_input') return;
    if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target && edge.sourceHandle === connection.sourceHandle)) return;
    const rawNext = addEdge({ ...connection, targetHandle: 'input' }, edges);
    const next = decorateEdges(rawNext);
    setEdges(next); commit(nodes, next);
  }, [commit, decorateEdges, edges, nodes, permission.nodes, setEdges]);

  const removeNodes = useCallback((deleted) => {
    const removable = new Set(deleted.filter((node) => !TYPES[node.data.type]?.fixed).map((node) => node.id));
    if (!removable.size) return;
    const nextNodes = nodes.filter((node) => !removable.has(node.id));
    const nextEdges = edges.filter((edge) => !removable.has(edge.source) && !removable.has(edge.target));
    setNodes(nextNodes); setEdges(nextEdges); onSelectNode(''); commit(nextNodes, nextEdges);
  }, [commit, edges, nodes, onSelectNode, setEdges, setNodes]);

  return <Box ref={wrapperRef} sx={{ width: '100%', height: '100%', minHeight: 560, position: 'relative', overflow: 'hidden', '& .react-flow': { bgcolor: 'surface.soft' }, '& .react-flow__minimap': { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' } }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-agent-node')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
    onDrop={(event) => { event.preventDefault(); const type = event.dataTransfer.getData('application/x-agent-node'); if (TYPES[type] && !TYPES[type].fixed) addAt(type, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
  >
    <style>{`@keyframes agentNodePulse{0%,100%{box-shadow:0 0 0 3px rgba(37,99,235,.10)}50%{box-shadow:0 0 0 10px rgba(37,99,235,.20)}} @keyframes agentEdgeDash{to{stroke-dashoffset:-30}}`}</style>
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(node.id)} onPaneClick={() => onSelectNode('')}
      onNodeDragStart={() => { draggingRef.current = true; }}
      onNodeDragStop={(_, movedNode) => {
        draggingRef.current = false;
        const next = nodes.map((node) => node.id === movedNode.id ? { ...node, position: movedNode.position } : node);
        setNodes(next); commit(next, edges);
      }}
      onNodesDelete={removeNodes}
      onEdgesDelete={(deleted) => { const ids = new Set(deleted.map((edge) => edge.id)); const next = edges.filter((edge) => !ids.has(edge.id)); setEdges(next); commit(nodes, next); }}
      onDoubleClick={(event) => { if (event.target.closest('.react-flow__node, .react-flow__edge')) return; openCreator(event, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
      onPaneContextMenu={(event) => { event.preventDefault(); openCreator(event, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
      defaultViewport={permission?.viewport || { x: 20, y: 20, zoom: 0.85 }} minZoom={0.2} maxZoom={1.8}
      deleteKeyCode={['Backspace', 'Delete']} selectionKeyCode="Shift" multiSelectionKeyCode="Control"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={22} size={1.2} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(node) => TYPES[node.data.type]?.color || '#64748b'} />
      <Panel position="top-left"><Stack direction="row" spacing={0.7} alignItems="center"><Chip size="small" label={`${nodes.length} nodos`} /><Chip size="small" variant="outlined" label={`${edges.length} conexiones`} /><Chip size="small" variant="outlined" label="Usa + en una conexión · doble clic para nodo libre" /></Stack></Panel>
      <Panel position="top-right"><Stack direction="row" spacing={0.4}>
        <Tooltip title="Editar y guardar datos de prueba"><IconButton size="small" onClick={onEditTest}><Settings /></IconButton></Tooltip>
        <Tooltip title="Probar con los datos guardados"><IconButton size="small" color="success" onClick={onTest}><PlayArrow /></IconButton></Tooltip>
        <Tooltip title="Ajustar vista"><IconButton size="small" onClick={() => fitView({ padding: 0.2, duration: 300 })}><CenterFocusStrong /></IconButton></Tooltip>
      </Stack></Panel>
    </ReactFlow>

    <Menu open={Boolean(creator)} onClose={() => setCreator(null)} anchorReference="anchorPosition" anchorPosition={creator?.anchor} MenuListProps={{ dense: true }}>
      <MenuItem disabled><Typography variant="caption" fontWeight={900}>{creator?.edgeId ? 'INSERTAR EN LA CONEXIÓN' : 'AGREGAR EN ESTA POSICIÓN'}</Typography></MenuItem>
      <Divider />
      {INSERTABLE.map(([type, meta]) => { const Icon = meta.icon; return <MenuItem key={type} onClick={() => addAt(type, creator.position, creator.edgeId)}><Box sx={{ width: 30, height: 30, mr: 1, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: `${meta.color}18`, color: meta.color }}><Icon fontSize="small" /></Box><Box><Typography variant="body2" fontWeight={750}>{meta.label}</Typography></Box></MenuItem>; })}
    </Menu>
  </Box>;
};

const AgentWorkflowCanvas = (props) => <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>;

export default AgentWorkflowCanvas;
