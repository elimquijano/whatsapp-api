import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, Divider, IconButton, MenuItem, Paper, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Close, Delete, Lock, PlayArrow, Psychology, Tune } from '@mui/icons-material';
import AgentWorkflowCanvas from './AgentWorkflowCanvas';
import JsonDataTree from './JsonDataTree';

const FIXED_TYPES = new Set(['agent_input', 'agent_output']);
const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'any'];
const droppedToken = (event) => event.dataTransfer.getData('application/x-workflow-token') || event.dataTransfer.getData('text/plain');

const DroppableText = ({ value, onChange, ...props }) => <TextField
  {...props} value={value} onChange={onChange}
  onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-workflow-token')) event.preventDefault(); }}
  onDrop={(event) => {
    const token = droppedToken(event);
    if (!token) return;
    event.preventDefault();
    const start = Number.isInteger(event.target.selectionStart) ? event.target.selectionStart : String(value || '').length;
    const end = Number.isInteger(event.target.selectionEnd) ? event.target.selectionEnd : start;
    onChange({ target: { value: `${String(value || '').slice(0, start)}${token}${String(value || '').slice(end)}` } });
  }}
/>;

const JsonEditor = ({ label, value, onChange, rows = 6 }) => {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [error, setError] = useState('');
  useEffect(() => { setText(JSON.stringify(value || {}, null, 2)); setError(''); }, [value]);
  return <TextField
    fullWidth multiline minRows={rows} label={label} value={text} error={Boolean(error)}
    helperText={error || 'JSON válido. Acepta variables arrastradas desde la pestaña Entrada.'}
    onChange={(event) => setText(event.target.value)}
    onBlur={() => { try { onChange(JSON.parse(text || '{}')); setError(''); } catch { setError('JSON inválido; se conserva el valor anterior.'); } }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-workflow-token')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
    onDrop={(event) => {
      const token = droppedToken(event);
      if (!token) return;
      event.preventDefault();
      const path = event.dataTransfer.getData('application/x-workflow-path');
      const key = String(path.split('.').pop() || 'dato').replace(/[^a-zA-Z0-9_]/g, '_');
      const current = value && typeof value === 'object' ? value : {};
      const next = Array.isArray(current) ? [...current, token] : { ...current, [key]: token };
      setText(JSON.stringify(next, null, 2));
      onChange(next);
      setError('');
    }}
    InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
  />;
};

const sampleForType = (type, name) => {
  if (type === 'number') return 1;
  if (type === 'boolean') return true;
  if (type === 'array') return [];
  if (type === 'object') return {};
  if (type === 'any') return `valor de ${name}`;
  return `valor de ${name}`;
};

const fieldsPreview = (fields = []) => Object.fromEntries(fields.filter((field) => field?.name).map((field) => [field.name, sampleForType(field.type, field.name)]));

const FieldEditor = ({ title, fields = [], onChange, sourceHelp }) => {
  const update = (index, patch) => onChange(fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } : field));
  const remove = (index) => onChange(fields.filter((_, itemIndex) => itemIndex !== index));
  const add = () => {
    let suffix = fields.length + 1;
    const used = new Set(fields.map((field) => field.name));
    while (used.has(`campo_${suffix}`)) suffix += 1;
    onChange([...fields, { name: `campo_${suffix}`, type: 'string', source: `campo_${suffix}`, required: false, description: '' }]);
  };
  return <Paper variant="outlined" sx={{ p: 1.25 }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      <Typography variant="subtitle2" fontWeight={900} sx={{ flex: 1 }}>{title}</Typography>
      <Button size="small" startIcon={<Add />} onClick={add}>Agregar campo</Button>
    </Stack>
    {!fields.length && <Typography variant="caption" color="text.secondary">Todavía no hay campos declarados.</Typography>}
    <Stack spacing={1}>
      {fields.map((field, index) => <Paper key={`field-${index}`} variant="outlined" sx={{ p: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8} alignItems={{ sm: 'center' }}>
          <TextField size="small" label="Nombre" value={field.name || ''} onChange={(event) => update(index, { name: event.target.value.replace(/[^a-zA-Z0-9_.-]/g, '_') })} sx={{ flex: 1 }} />
          <TextField select size="small" label="Tipo" value={field.type || 'string'} onChange={(event) => update(index, { type: event.target.value })} sx={{ minWidth: 105 }}>{FIELD_TYPES.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField>
          <TextField select size="small" label="Obligatorio" value={field.required ? 'yes' : 'no'} onChange={(event) => update(index, { required: event.target.value === 'yes' })} sx={{ minWidth: 115 }}><MenuItem value="no">No</MenuItem><MenuItem value="yes">Sí</MenuItem></TextField>
          <Tooltip title="Eliminar campo"><IconButton size="small" color="error" onClick={() => remove(index)}><Delete fontSize="small" /></IconButton></Tooltip>
        </Stack>
        {sourceHelp && <DroppableText size="small" fullWidth label="Origen / expresión" value={field.source || ''} onChange={(event) => update(index, { source: event.target.value })} helperText={sourceHelp} sx={{ mt: 0.8 }} />}
      </Paper>)}
    </Stack>
  </Paper>;
};

const MappingEditor = ({ title, value = {}, onChange, helperText = 'Arrastra una variable desde Entrada hasta el valor.' }) => {
  const entries = Object.entries(value || {});
  const write = (nextEntries) => onChange(Object.fromEntries(nextEntries.filter(([key]) => key)));
  const update = (index, part, nextValue) => write(entries.map((entry, itemIndex) => itemIndex === index ? (part === 'key' ? [nextValue.replace(/[^a-zA-Z0-9_.-]/g, '_'), entry[1]] : [entry[0], nextValue]) : entry));
  const add = () => {
    let suffix = entries.length + 1;
    const used = new Set(entries.map(([key]) => key));
    while (used.has(`campo_${suffix}`)) suffix += 1;
    write([...entries, [`campo_${suffix}`, '']]);
  };
  return <Paper variant="outlined" sx={{ p: 1.25 }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}><Typography variant="subtitle2" fontWeight={900} sx={{ flex: 1 }}>{title}</Typography><Button size="small" startIcon={<Add />} onClick={add}>Agregar</Button></Stack>
    {!entries.length && <Alert severity="info" icon={false}>Sin mapeo manual, <b>nodeInput</b> recibe la salida inmediata conectada. Las salidas de todos los nodos anteriores siguen disponibles en <b>nodes.*</b>.</Alert>}
    <Stack spacing={0.8}>{entries.map(([key, expression], index) => <Stack key={`mapping-${index}`} direction="row" spacing={0.7} alignItems="flex-start">
      <TextField size="small" label="Campo" value={key} onChange={(event) => update(index, 'key', event.target.value)} sx={{ width: 125 }} />
      <DroppableText size="small" fullWidth label="Valor / variable" value={typeof expression === 'string' ? expression : JSON.stringify(expression)} onChange={(event) => update(index, 'value', event.target.value)} helperText={helperText} />
      <IconButton size="small" color="error" onClick={() => write(entries.filter((_, itemIndex) => itemIndex !== index))}><Delete fontSize="small" /></IconButton>
    </Stack>)}</Stack>
  </Paper>;
};

const valueAtPath = (value, path) => String(path || '').split('.').filter(Boolean).reduce((current, key) => current?.[key], value);

const conditionPaths = (value, prefix = '', output = [], depth = 0) => {
  if (output.length >= 180 || depth > 6 || value === null || value === undefined) return output;
  if (prefix) output.push(prefix);
  if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => conditionPaths(child, prefix ? `${prefix}.${key}` : key, output, depth + 1));
  return output;
};

const ConditionEditor = ({ config, availableData, updateConfig }) => {
  const [advanced, setAdvanced] = useState(false);
  const firstMappedField = Object.keys(config.inputMapping || {})[0];
  const condition = config.condition || { leftPath: firstMappedField ? `nodeInput.${firstMappedField}` : '', operator: 'equals', rightValue: true, rightType: 'boolean' };
  const paths = [...new Set([condition.leftPath, ...conditionPaths(availableData)].filter(Boolean))];
  const needsValue = !['truthy', 'falsy', 'exists', 'not_exists'].includes(condition.operator);
  const patch = (next) => updateConfig({ condition: { ...condition, ...next } });
  const currentValue = valueAtPath(availableData, condition.leftPath);
  const expectedValue = condition.rightType === 'boolean' ? (condition.rightValue === true || String(condition.rightValue).toLowerCase() === 'true') : condition.rightType === 'number' ? Number(condition.rightValue) : condition.rightType === 'null' ? null : String(condition.rightValue ?? '');
  const previewResult = ({
    equals: () => Object.is(currentValue, expectedValue), not_equals: () => !Object.is(currentValue, expectedValue),
    truthy: () => Boolean(currentValue), falsy: () => !currentValue,
    exists: () => currentValue !== undefined && currentValue !== null, not_exists: () => currentValue === undefined || currentValue === null,
    contains: () => Array.isArray(currentValue) ? currentValue.includes(expectedValue) : String(currentValue ?? '').includes(String(expectedValue ?? '')),
    greater_than: () => Number(currentValue) > Number(expectedValue), less_than: () => Number(currentValue) < Number(expectedValue),
  }[condition.operator || 'equals']?.() ?? false);
  return <Paper variant="outlined" sx={{ p: 1.25 }}>
    <Typography variant="subtitle2" fontWeight={900}>Regla de decisión</Typography>
    <Typography variant="caption" color="text.secondary">Elige un dato de la entrada; no necesitas escribir código.</Typography>
    <Stack spacing={1} sx={{ mt: 1.25 }}>
      <TextField select size="small" fullWidth label="Dato a evaluar" value={condition.leftPath || ''} onChange={(event) => patch({ leftPath: event.target.value })} helperText={condition.leftPath ? `Valor actual: ${typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue)}` : 'Primero mapea o selecciona un campo de los datos anteriores.'}>
        {!paths.length && <MenuItem value="" disabled>Sin campos disponibles</MenuItem>}
        {paths.map((path) => <MenuItem key={path} value={path}>{path}</MenuItem>)}
      </TextField>
      <TextField select size="small" fullWidth label="Operador" value={condition.operator || 'equals'} onChange={(event) => patch({ operator: event.target.value })}>
        <MenuItem value="equals">Es igual a</MenuItem><MenuItem value="not_equals">No es igual a</MenuItem>
        <MenuItem value="truthy">Es verdadero / tiene valor</MenuItem><MenuItem value="falsy">Es falso / está vacío</MenuItem>
        <MenuItem value="exists">Existe</MenuItem><MenuItem value="not_exists">No existe</MenuItem>
        <MenuItem value="contains">Contiene</MenuItem><MenuItem value="greater_than">Es mayor que</MenuItem><MenuItem value="less_than">Es menor que</MenuItem>
      </TextField>
      {needsValue && <Stack direction="row" spacing={1}>
        <TextField select size="small" label="Tipo" value={condition.rightType || 'boolean'} onChange={(event) => patch({ rightType: event.target.value })} sx={{ width: 120 }}><MenuItem value="boolean">Booleano</MenuItem><MenuItem value="string">Texto</MenuItem><MenuItem value="number">Número</MenuItem><MenuItem value="null">Nulo</MenuItem></TextField>
        {condition.rightType === 'boolean' ? <TextField select size="small" fullWidth label="Valor esperado" value={condition.rightValue === false ? 'false' : 'true'} onChange={(event) => patch({ rightValue: event.target.value === 'true' })}><MenuItem value="true">true</MenuItem><MenuItem value="false">false</MenuItem></TextField> : <TextField size="small" fullWidth label="Valor esperado" disabled={condition.rightType === 'null'} value={condition.rightValue ?? ''} onChange={(event) => patch({ rightValue: event.target.value })} />}
      </Stack>}
      <Alert severity={previewResult ? 'success' : 'warning'} icon={false}>Valor actual: <code>{JSON.stringify(currentValue)}</code>. Esta regla tomaría la salida <b>{previewResult ? 'SÍ / true' : 'NO / false'}</b>.</Alert>
      <Button size="small" onClick={() => setAdvanced((value) => !value)} sx={{ alignSelf: 'flex-start' }}>{advanced ? 'Ocultar código avanzado' : 'Usar condición JavaScript avanzada'}</Button>
      {advanced && <TextField multiline minRows={4} fullWidth label="Condición JavaScript heredada" value={config.expression || ''} onChange={(event) => updateConfig({ expression: event.target.value, condition: null })} helperText="Solo se usa al quitar la regla visual. Ejemplo: input.nodeInput.success === true. También puedes escribir success === true para campos mapeados." />}
    </Stack>
  </Paper>;
};

const DataPanel = ({ title, real, fallback, basePath = '' }) => <Box sx={{ p: 1.5, height: '100%', overflow: 'auto' }}>
  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
    <Typography variant="caption" fontWeight={900}>{title}</Typography>
    <Chip size="small" color={real ? 'success' : 'default'} variant={real ? 'filled' : 'outlined'} label={real ? 'EJECUCIÓN REAL' : 'DATOS DISPONIBLES'} />
  </Stack>
  <JsonDataTree data={real || fallback} basePath={basePath} mode="template" emptyText="Sin datos" />
</Box>;

const upstreamNodeKeys = (permission, selectedKey) => {
  const incoming = new Map();
  (permission?.edges || []).forEach((edge) => incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]));
  const found = new Set();
  const visit = (key) => (incoming.get(key) || []).forEach((source) => { if (!found.has(source)) { found.add(source); visit(source); } });
  visit(selectedKey);
  return [...found];
};

const nodeOutputPreview = (node, permission) => {
  if (node?.type === 'agent_input') return fieldsPreview(permission?.stateSchema?.inputFields || []);
  if (node?.type === 'agent_output') return fieldsPreview(permission?.stateSchema?.outputFields || []);
  return fieldsPreview(node?.config?.outputFields || []);
};

const availableVariables = (permission, node) => {
  const contract = fieldsPreview(permission?.stateSchema?.inputFields || []);
  const nodes = {};
  upstreamNodeKeys(permission, node?.key).forEach((key) => {
    const source = permission?.nodes?.find((item) => item.key === key);
    if (source) nodes[key] = nodeOutputPreview(source, permission);
  });
  return { ...contract, nodes };
};

const NodeInspector = ({ node, trace, permission, onUpdatePermission, onUpdate, onDelete, onClose, onTest }) => {
  const fallbackInput = useMemo(() => node ? availableVariables(permission, node) : {}, [node, permission]);
  const fallbackOutput = useMemo(() => node ? nodeOutputPreview(node, permission) : {}, [node, permission]);
  if (!node) return <Paper variant="outlined" sx={{ height: '100%', p: 2 }}><Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ minHeight: 260 }}><Tune color="disabled" sx={{ fontSize: 42 }} /><Typography fontWeight={800}>Selecciona un nodo</Typography><Typography variant="body2" color="text.secondary" align="center">Aquí editarás sus entradas, parámetros, salidas y verás datos reales de ejecución.</Typography></Stack></Paper>;
  const config = node.config || {};
  const fixed = FIXED_TYPES.has(node.type);
  const updateConfig = (patch) => onUpdate(node.key, { config: { ...config, ...patch } });
  const updateSchema = (patch) => onUpdatePermission({ stateSchema: { ...(permission.stateSchema || {}), ...patch } });
  return <Paper variant="outlined" sx={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5 }}>
      <Psychology color="primary" />
      <Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={900} noWrap>{node.name}</Typography><Typography variant="caption" color="text.secondary">{node.type} · {node.key}</Typography></Box>
      {fixed ? <Tooltip title="Nodo estructural fijo"><Lock color="disabled" /></Tooltip> : <Tooltip title="Eliminar nodo"><IconButton color="error" onClick={() => onDelete(node.key)}><Delete /></IconButton></Tooltip>}
      <Tooltip title="Ejecuta este borrador en modo seguro, sin guardarlo"><Button size="small" color="success" variant="outlined" startIcon={<PlayArrow />} onClick={onTest}>Probar borrador</Button></Tooltip>
      <Tooltip title="Cerrar editor"><IconButton onClick={onClose}><Close /></IconButton></Tooltip>
    </Stack>
    <Divider />
    <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '230px minmax(360px, 1fr) 230px' }, overflow: { xs: 'auto', lg: 'hidden' } }}>
      <Box sx={{ minHeight: 0, overflow: 'auto', borderRight: { lg: '1px solid' }, borderColor: 'divider', bgcolor: 'surface.soft' }}><DataPanel title="ENTRADA · ARRASTRA CAMPOS" real={trace?.input} fallback={fallbackInput} /></Box>
      <Stack spacing={1.5} sx={{ p: 1.75, minHeight: 0, overflow: 'auto' }}>
        <TextField size="small" fullWidth label="Nombre del nodo" value={node.name || ''} onChange={(event) => onUpdate(node.key, { name: event.target.value })} />

        {node.type === 'agent_input' && <>
          <Alert severity="info">Este nodo recibe los datos simulados durante una prueba aislada y los datos reales del chat cuando el agente está conectado al workflow principal.</Alert>
          <FieldEditor title="Campos que entrega la entrada" fields={permission.stateSchema?.inputFields || []} onChange={(inputFields) => updateSchema({ inputFields })} />
        </>}

        {!FIXED_TYPES.has(node.type) && <MappingEditor title="Entradas elegidas para este nodo" value={config.inputMapping || {}} onChange={(inputMapping) => updateConfig({ inputMapping })} />}

        {node.type === 'ai' && <>
          <Alert severity="info" icon={false}>
            {Object.keys(config.inputMapping || {}).length
              ? <><b>Contexto controlado:</b> la IA recibe los campos mapeados y los fragmentos relevantes del contexto general; el historial queda exclusivamente en el orquestador.</>
              : <><b>Contexto automatico:</b> la IA recibe solo la salida del nodo conectado inmediatamente antes. No se envian por defecto todos los resultados anteriores.</>}
          </Alert>
          <TextField select size="small" fullWidth label="Modelo" value={config.useSessionModel === false ? 'custom' : 'session'} onChange={(event) => updateConfig({ useSessionModel: event.target.value === 'session' })}><MenuItem value="session">Usar modelo del Cerebro general</MenuItem><MenuItem value="custom">Modelo propio del nodo</MenuItem></TextField>
          {config.useSessionModel === false && <><TextField size="small" fullWidth label="URL del proveedor" value={config.apiUrl || ''} onChange={(event) => updateConfig({ apiUrl: event.target.value })} /><TextField size="small" fullWidth label="Modelo" value={config.model || ''} onChange={(event) => updateConfig({ model: event.target.value })} /></>}
          <DroppableText multiline minRows={9} fullWidth label="Prompt del agente" value={config.prompt || ''} onChange={(event) => updateConfig({ prompt: event.target.value })} helperText="Arrastra variables desde Entrada. Este nodo genera datos; no envía WhatsApp." />
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>Límites de este nodo</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField size="small" fullWidth type="number" label="Datos de entrada (caracteres)" value={config.contextCharBudget ?? 3000} onChange={(event) => updateConfig({ contextCharBudget: Number(event.target.value) })} inputProps={{ min: 800, max: 6500, step: 100 }} helperText="Solo la entrada elegida o conectada." />
              <TextField size="small" fullWidth type="number" label="Respuesta maxima (tokens)" value={config.maxOutputTokens ?? 400} onChange={(event) => updateConfig({ maxOutputTokens: Number(event.target.value) })} inputProps={{ min: 128, max: 800, step: 25 }} helperText="Limite de salida del modelo." />
            </Stack>
          </Paper>
          <TextField size="small" fullWidth label="Guardar respuesta en" value={config.outputField || 'content'} onChange={(event) => updateConfig({ outputField: event.target.value })} />
        </>}
        {node.type === 'http_request' && <>
          <Alert severity="info" icon={false}><b>HTTP, paso a paso:</b> elige el método, pega la URL y agrega Headers o Body solo si la API los solicita. Al probar verás a la derecha la respuesta real con <code>ok</code>, <code>status</code> y <code>body</code>.</Alert>
          <Stack direction="row" spacing={1}><TextField select size="small" label="Método" value={config.method || 'GET'} onChange={(event) => updateConfig({ method: event.target.value })} sx={{ width: 110 }}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}</TextField><DroppableText size="small" fullWidth label="URL" value={config.url || ''} onChange={(event) => updateConfig({ url: event.target.value })} /></Stack>
          <JsonEditor label="Headers" value={config.headers || {}} onChange={(headers) => updateConfig({ headers })} />
          <JsonEditor label="Body" value={config.requestBody || {}} onChange={(requestBody) => updateConfig({ requestBody })} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField size="small" fullWidth type="number" label="Respuesta máxima (MB)" value={config.maxResponseMb ?? 5} onChange={(event) => updateConfig({ maxResponseMb: Number(event.target.value) })} inputProps={{ min: 1, max: 25, step: 1 }} helperText="Hasta 25 MB. Mapea solo los campos necesarios cuando la API devuelva listas grandes." />
            <TextField size="small" fullWidth type="number" label="Tiempo máximo (segundos)" value={Math.round((config.timeoutMs ?? 30000) / 1000)} onChange={(event) => updateConfig({ timeoutMs: Number(event.target.value) * 1000 })} inputProps={{ min: 1, max: 120, step: 1 }} helperText="Hasta 120 segundos para APIs lentas." />
          </Stack>
          <TextField size="small" fullWidth label="Qué parte de la respuesta usar (opcional)" value={config.responsePath || ''} onChange={(event) => updateConfig({ responsePath: event.target.value })} placeholder="body.data" helperText="Déjalo vacío para usar la respuesta completa. Ejemplo: si la API devuelve { body: { data: [...] } }, escribe body.data para quedarte solo con la lista." />
          <JsonEditor label="Renombrar o elegir campos de la respuesta (opcional)" value={config.responseMapping || {}} onChange={(responseMapping) => updateConfig({ responseMapping })} rows={5} />
          <Alert severity="info" icon={false}>Ejemplo de mapeo: <code>{'{ "cliente": "{{body.name}}", "identificador": "{{body.id}}" }'}</code>. La palabra de la izquierda será el nombre que usarán los siguientes nodos; la variable de la derecha indica de dónde sale el dato. Puedes dejarlo vacío.</Alert>
        </>}
        {node.type === 'script' && <>
          <Alert severity="info" icon={false}><b>Script:</b> <code>input.nodeInput</code> contiene la entrada inmediata o mapeada; <code>input.nodes</code> contiene todos los nodos anteriores. Debes terminar con <code>return {'{ ... }'}</code>. Declara abajo esos campos de salida para que el siguiente nodo pueda usarlos antes de hacer una prueba.</Alert>
          <TextField select size="small" fullWidth label="Cargar una plantilla" value="" onChange={(event) => updateConfig({ code: event.target.value })}><MenuItem value="" disabled>Elige un ejemplo…</MenuItem><MenuItem value={'const datos = input.nodeInput;\nreturn { ...datos, procesado: true };'}>Copiar entrada y agregar un campo</MenuItem><MenuItem value={'const items = input.nodeInput.items || [];\nreturn {\n  items: items.map((item) => ({ ...item, procesado: true })),\n  total: items.length,\n};'}>Procesar un array</MenuItem><MenuItem value={'const anteriores = input.nodes;\nreturn { nodosEjecutados: Object.keys(anteriores), datos: anteriores };'}>Usar todas las salidas anteriores</MenuItem></TextField>
          <TextField multiline minRows={13} fullWidth label="JavaScript" value={config.code || 'return input.nodeInput;'} onChange={(event) => updateConfig({ code: event.target.value })} helperText="Ejemplo: const items = input.nodeInput.items || []; luego return { items, total: items.length };" InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }} />
        </>}
        {node.type === 'condition' && <ConditionEditor config={config} availableData={trace?.input || fallbackInput} updateConfig={updateConfig} />}
        {node.type === 'transform' && <><Alert severity="info" icon={false}><b>Transformar:</b> escribe una sola expresión JavaScript, sin <code>return</code>. Ejemplo: <code>{'{ total: input.nodeInput.items.length }'}</code>.</Alert><TextField multiline minRows={8} fullWidth label="Expresión" value={config.expression || 'input.nodeInput'} onChange={(event) => updateConfig({ expression: event.target.value })} /></>}
        {node.type === 'state_update' && <><Alert severity="info" icon={false}><b>Actualizar estado:</b> guarda datos para los siguientes mensajes del mismo chat. Puedes arrastrar valores, objetos o arrays completos dentro del JSON.</Alert><JsonEditor label="Datos a guardar en el estado" value={config.updates || {}} onChange={(updates) => updateConfig({ updates })} /></>}

        {!FIXED_TYPES.has(node.type) && <FieldEditor title="Campos de salida de este nodo" fields={config.outputFields || []} onChange={(outputFields) => updateConfig({ outputFields })} sourceHelp="Ruta de la salida original (por ejemplo body.id o content) o una variable arrastrada." />}

        {node.type === 'agent_output' && <>
          <Alert severity="success">Esta salida devuelve el resultado al workflow principal. El envío real ocurre únicamente en el nodo fijo Enviar WhatsApp de la sección 3.</Alert>
          <MappingEditor title="Resultado final del agente" value={config.outputMapping || {}} onChange={(outputMapping) => updateConfig({ outputMapping })} />
          <FieldEditor title="Contrato de salida del agente" fields={permission.stateSchema?.outputFields || []} onChange={(outputFields) => updateSchema({ outputFields })} sourceHelp="Nombre del campo producido por el mapeo final." />
        </>}
      </Stack>
      <Box sx={{ minHeight: 0, overflow: 'auto', borderLeft: { lg: '1px solid' }, borderColor: 'divider', bgcolor: 'surface.soft' }}><DataPanel title="SALIDA DEL NODO" real={trace?.output} fallback={fallbackOutput} basePath={trace?.output ? '' : `nodes.${node.key}`} /></Box>
    </Box>
  </Paper>;
};

const AgentStudio = ({
  permissions, permissionIndex, onSelectPermission, permission, onCreate, onDeletePermission,
  onUpdatePermission, selectedNodeKey, onSelectNode, onUpdateNode, onDeleteNode,
  nodeStates, activeExecution, createNode, onTest,
}) => {
  const trace = activeExecution?.nodeExecutions?.find((item) => (item.scope === 'task' || !item.scope) && item.nodeKey === selectedNodeKey);
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '220px minmax(0, 1fr)' }, gridTemplateRows: { xs: 'auto minmax(680px, 1fr)', lg: 'minmax(720px, calc(100dvh - 225px))' }, minHeight: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
    <Paper square variant="outlined" sx={{ border: 0, borderRight: { lg: '1px solid' }, borderColor: 'divider', p: 1.25, overflow: 'auto' }}>
      <Button fullWidth variant="contained" startIcon={<Add />} onClick={onCreate}>Nuevo agente</Button>
      <Stack spacing={0.7} sx={{ mt: 1.2 }}>{permissions.map((item, index) => <Paper key={item.id || item.key} variant="outlined" onClick={() => onSelectPermission(index)} sx={{ p: 1.1, cursor: 'pointer', borderColor: index === permissionIndex ? 'primary.main' : 'divider', bgcolor: index === permissionIndex ? 'action.selected' : 'background.paper' }}><Typography variant="body2" fontWeight={850} noWrap>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.key} · {item.nodes?.length || 0} nodos</Typography></Paper>)}</Stack>
    </Paper>
    {!permission ? <Box sx={{ p: 3 }}><Alert severity="info">Crea un agente para comenzar.</Alert></Box> : <Stack sx={{ minWidth: 0, minHeight: 0, position: 'relative' }}>
      <Paper square elevation={0} sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <TextField size="small" label="Nombre" value={permission.name || ''} onChange={(event) => onUpdatePermission({ name: event.target.value })} sx={{ minWidth: 230 }} />
          <TextField size="small" label="Clave" value={permission.key || ''} disabled={Boolean(permission.id)} onChange={(event) => onUpdatePermission({ key: event.target.value })} sx={{ width: 170 }} />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Eliminar agente"><IconButton color="error" onClick={onDeletePermission}><Delete /></IconButton></Tooltip>
        </Stack>
        <TextField size="small" fullWidth label="Cuándo debe elegirlo el orquestador" value={permission.description || ''} onChange={(event) => onUpdatePermission({ description: event.target.value })} sx={{ mt: 1 }} />
      </Paper>
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <AgentWorkflowCanvas permission={permission} nodeStates={nodeStates} selectedNodeKey={selectedNodeKey} onSelectNode={onSelectNode} onChange={onUpdatePermission} createNode={createNode} onTest={onTest} />
      </Box>
    </Stack>}
    <Dialog open={Boolean(permission && selectedNodeKey)} onClose={() => onSelectNode('')} fullWidth maxWidth="xl" PaperProps={{ sx: { height: 'min(88dvh, 900px)', maxHeight: '95dvh', overflow: 'hidden' } }}>
      <NodeInspector node={permission?.nodes?.find((node) => node.key === selectedNodeKey)} trace={trace} permission={permission} onUpdatePermission={onUpdatePermission} onUpdate={onUpdateNode} onDelete={onDeleteNode} onClose={() => onSelectNode('')} onTest={onTest} />
    </Dialog>
  </Box>;
};

export default AgentStudio;
