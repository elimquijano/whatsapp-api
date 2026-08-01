export const MAIN_WORKFLOW_VERSION = 1;
export const MAIN_NODE_TYPES = Object.freeze([
  "whatsapp_input",
  "interaction_filter",
  "orchestrator",
  "agent",
  "whatsapp_output",
]);
export const MAIN_CORE_NODE_TYPES = new Set([
  "whatsapp_input",
  "interaction_filter",
  "orchestrator",
  "whatsapp_output",
]);
export const MAIN_MESSAGE_TYPES = Object.freeze([
  "text", "image", "video", "audio", "document", "location", "sticker", "contact", "contacts",
]);

const typeSet = new Set(MAIN_NODE_TYPES);
const messageTypeSet = new Set(MAIN_MESSAGE_TYPES);
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const boundedString = (value, max = 255) => String(value ?? "").slice(0, max);
const finitePosition = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100000, Math.max(-100000, number)) : fallback;
};
const safeNodeKey = (value, label = "node key") => {
  const key = String(value || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,254}$/.test(key)) throw new Error(`${label} no es válido`);
  return key;
};
const safeAgentKey = (value, label = "agent key") => {
  const key = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,255}$/.test(key)) throw new Error(`${label} no es válido`);
  return key;
};
const normalizeMessageTypes = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("messageTypes debe ser una lista");
  return [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter((item) => {
    if (!messageTypeSet.has(item)) throw new Error(`El tipo de mensaje ${item || "vacío"} no está soportado`);
    return true;
  }))];
};
const normalizeMappingValue = (value, state, depth = 0) => {
  if (depth > 8) throw new Error("El mapeo de entrada supera la profundidad permitida");
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error("El mapeo contiene una lista demasiado grande");
    return value.map((item) => normalizeMappingValue(item, state, depth + 1));
  }
  if (!isObject(value)) throw new Error("El mapeo contiene un valor no compatible");
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.length > 255 || unsafeKeys.has(key)) throw new Error(`El mapeo contiene la clave insegura ${key}`);
    state.entries += 1;
    if (state.entries > 1000) throw new Error("El mapeo supera 1000 campos");
    output[key] = normalizeMappingValue(item, state, depth + 1);
  }
  return output;
};
const normalizeMapping = (value) => {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error("inputMapping debe ser un objeto");
  const normalized = normalizeMappingValue(value, { entries: 0 });
  if (JSON.stringify(normalized).length > 50000) throw new Error("inputMapping supera 50000 caracteres");
  return normalized;
};

const agentDescriptors = (agents = []) => new Map((agents || []).map((agent) => {
  const key = safeAgentKey(agent?.key, "La clave del agente");
  return [key, {
    id: agent?.id === undefined || agent?.id === null ? null : Number(agent.id),
    key,
    name: boundedString(agent?.name || key),
    enabled: agent?.enabled !== false,
  }];
}));

const defaultCoreNodes = () => ([
  { key: "whatsapp_input", name: "Entrada WhatsApp", type: "whatsapp_input", enabled: true, positionX: 80, positionY: 260, config: { messageTypes: [] } },
  { key: "interaction_filter", name: "¿Debe responder?", type: "interaction_filter", enabled: true, positionX: 390, positionY: 260, config: {} },
  { key: "orchestrator", name: "Orquestador", type: "orchestrator", enabled: true, positionX: 700, positionY: 260, config: { fallbackAgentKey: "" } },
  { key: "whatsapp_output", name: "Enviar WhatsApp", type: "whatsapp_output", enabled: true, positionX: 1330, positionY: 260, config: { contentTemplate: "" } },
]);

export const buildDefaultMainWorkflow = (agents = [], options = {}) => {
  const descriptors = [...agentDescriptors(agents).values()];
  const linked = options.linkAgents === false ? [] : descriptors;
  const agentNodes = linked.map((agent, index) => ({
    key: `agent_${agent.key}`,
    name: agent.name,
    type: "agent",
    enabled: agent.enabled,
    positionX: 1010,
    positionY: 80 + (index * 180),
    aiPermissionId: agent.id,
    config: { agentKey: agent.key, inputMapping: {} },
  }));
  const nodes = [...defaultCoreNodes(), ...agentNodes];
  const edges = [
    { source: "whatsapp_input", target: "interaction_filter", sourceHandle: "message", targetHandle: "input" },
    { source: "interaction_filter", target: "orchestrator", sourceHandle: "respond", targetHandle: "input" },
    ...agentNodes.flatMap((node, index) => ([
      { source: "orchestrator", target: node.key, sourceHandle: node.config.agentKey, targetHandle: "input", sortOrder: index },
      { source: node.key, target: "whatsapp_output", sourceHandle: "output", targetHandle: "input", sortOrder: index },
    ])),
  ];
  return {
    name: "Workflow principal",
    version: MAIN_WORKFLOW_VERSION,
    revision: 1,
    active: true,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    nodes,
    edges,
  };
};

const normalizeNodeConfig = (type, config, agentsByKey) => {
  const source = isObject(config) ? config : {};
  if (type === "whatsapp_input") return { messageTypes: normalizeMessageTypes(source.messageTypes) };
  if (type === "interaction_filter") return {};
  if (type === "orchestrator") {
    const rawFallback = String(source.fallbackAgentKey || source.fallbackTaskKey || "").trim().toLowerCase();
    return { fallbackAgentKey: rawFallback && agentsByKey.has(rawFallback) ? rawFallback : "" };
  }
  if (type === "agent") {
    const agentKey = safeAgentKey(source.agentKey || source.taskKey, "La referencia del agente");
    if (!agentsByKey.has(agentKey)) throw new Error(`El agente ${agentKey} no existe en la sección 2`);
    return { agentKey, inputMapping: normalizeMapping(source.inputMapping) };
  }
  if (type === "whatsapp_output") return { contentTemplate: boundedString(source.contentTemplate, 10000) };
  return {};
};

export const normalizeMainWorkflow = (raw, agents = []) => {
  const agentsByKey = agentDescriptors(agents);
  const source = raw && isObject(raw) ? raw : buildDefaultMainWorkflow(agents);
  if (Number(source.version ?? MAIN_WORKFLOW_VERSION) !== MAIN_WORKFLOW_VERSION) throw new Error("La versión del workflow principal no es compatible");
  if (!Array.isArray(source.nodes) || source.nodes.length > 500) throw new Error("Los nodos del workflow principal no son válidos");
  if (!Array.isArray(source.edges) || source.edges.length > 1000) throw new Error("Las conexiones del workflow principal no son válidas");

  const keys = new Set();
  const nodes = source.nodes.map((node, index) => {
    if (!isObject(node)) throw new Error(`El nodo ${index + 1} no es válido`);
    const type = String(node.type || "").trim();
    if (!typeSet.has(type)) throw new Error(`El tipo de nodo principal ${type || "vacío"} no está permitido`);
    const key = safeNodeKey(node.key, `La clave del nodo ${index + 1}`);
    if (keys.has(key)) throw new Error(`El nodo ${key} está repetido`);
    keys.add(key);
    const config = normalizeNodeConfig(type, node.config, agentsByKey);
    const agent = type === "agent" ? agentsByKey.get(config.agentKey) : null;
    return {
      ...(node.id !== undefined && node.id !== null ? { id: Number(node.id) } : {}),
      key,
      name: boundedString(node.name || agent?.name || key),
      type,
      enabled: MAIN_CORE_NODE_TYPES.has(type) ? true : node.enabled !== false && agent?.enabled !== false,
      positionX: finitePosition(node.position?.x ?? node.positionX, index * 280),
      positionY: finitePosition(node.position?.y ?? node.positionY, 200),
      ...(agent ? { aiPermissionId: agent.id } : {}),
      config,
    };
  });

  for (const coreType of MAIN_CORE_NODE_TYPES) {
    const matches = nodes.filter((node) => node.type === coreType);
    if (matches.length !== 1) throw new Error(`El workflow principal necesita exactamente un nodo ${coreType}`);
  }

  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const edgeSignatures = new Set();
  const edges = source.edges.map((edge, index) => {
    if (!isObject(edge)) throw new Error(`La conexión ${index + 1} no es válida`);
    const sourceKey = safeNodeKey(edge.source, `El origen de la conexión ${index + 1}`);
    const targetKey = safeNodeKey(edge.target, `El destino de la conexión ${index + 1}`);
    const sourceNode = nodeByKey.get(sourceKey);
    const targetNode = nodeByKey.get(targetKey);
    if (!sourceNode || !targetNode) throw new Error(`La conexión ${sourceKey} → ${targetKey} referencia un nodo inexistente`);
    if (sourceKey === targetKey) throw new Error(`El nodo ${sourceKey} no puede conectarse consigo mismo`);
    const sourceHandle = boundedString(edge.sourceHandle || "", 255) || null;
    const targetHandle = boundedString(edge.targetHandle || "", 255) || null;
    const signature = `${sourceKey}|${targetKey}|${sourceHandle || ""}|${targetHandle || ""}`;
    if (edgeSignatures.has(signature)) throw new Error(`La conexión ${sourceKey} → ${targetKey} está repetida`);
    edgeSignatures.add(signature);
    const allowed = (sourceNode.type === "whatsapp_input" && targetNode.type === "interaction_filter")
      || (sourceNode.type === "interaction_filter" && targetNode.type === "orchestrator")
      || (sourceNode.type === "orchestrator" && targetNode.type === "agent")
      || (sourceNode.type === "agent" && targetNode.type === "whatsapp_output");
    if (!allowed) throw new Error(`La conexión ${sourceNode.type} → ${targetNode.type} no está permitida en el flujo principal`);
    if (sourceNode.type === "orchestrator" && sourceHandle !== targetNode.config.agentKey) {
      throw new Error(`La salida del orquestador hacia ${targetNode.name} debe usar el handle ${targetNode.config.agentKey}`);
    }
    return {
      ...(edge.id !== undefined && edge.id !== null ? { id: Number(edge.id) } : {}),
      source: sourceKey,
      target: targetKey,
      sourceHandle,
      targetHandle,
      label: boundedString(edge.label || "", 255) || null,
      sortOrder: Number.isFinite(Number(edge.sortOrder)) ? Number(edge.sortOrder) : index,
    };
  });

  const outgoing = new Map(nodes.map((node) => [node.key, []]));
  const indegree = new Map(nodes.map((node) => [node.key, 0]));
  for (const edge of edges) {
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.key) === 0).map((node) => node.key);
  let visited = 0;
  while (queue.length) {
    const key = queue.shift();
    visited += 1;
    for (const target of outgoing.get(key) || []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodes.length) throw new Error("El workflow principal contiene un ciclo");

  return {
    ...(source.id !== undefined && source.id !== null ? { id: Number(source.id) } : {}),
    name: boundedString(source.name || "Workflow principal"),
    version: MAIN_WORKFLOW_VERSION,
    revision: Math.max(1, Number(source.revision || 1)),
    active: source.active !== false,
    viewport: isObject(source.viewport) ? {
      x: finitePosition(source.viewport.x, 0),
      y: finitePosition(source.viewport.y, 0),
      zoom: Math.min(2, Math.max(0.1, Number(source.viewport.zoom || 0.85))),
    } : { x: 0, y: 0, zoom: 0.85 },
    nodes,
    edges,
  };
};

export const compileMainWorkflow = (raw, agents = []) => {
  const workflow = normalizeMainWorkflow(raw, agents);
  const nodeByKey = new Map(workflow.nodes.map((node) => [node.key, node]));
  const nodesByType = new Map(MAIN_NODE_TYPES.map((type) => [type, workflow.nodes.filter((node) => node.type === type)]));
  const edgesFrom = new Map(workflow.nodes.map((node) => [node.key, []]));
  const edgesTo = new Map(workflow.nodes.map((node) => [node.key, []]));
  for (const edge of workflow.edges) {
    edgesFrom.get(edge.source).push(edge);
    edgesTo.get(edge.target).push(edge);
  }
  const input = nodesByType.get("whatsapp_input")[0];
  const filter = nodesByType.get("interaction_filter")[0];
  const orchestrator = nodesByType.get("orchestrator")[0];
  const output = nodesByType.get("whatsapp_output")[0];
  const hasEdge = (source, target) => workflow.edges.some((edge) => edge.source === source.key && edge.target === target.key);
  if (!hasEdge(input, filter)) throw new Error("La entrada no está conectada al filtro de interacción");
  if (!hasEdge(filter, orchestrator)) throw new Error("El filtro no está conectado al orquestador");

  const agentsByKey = agentDescriptors(agents);
  const executableAgents = [];
  for (const node of nodesByType.get("agent")) {
    const agent = agentsByKey.get(node.config.agentKey);
    if (!agent?.enabled || node.enabled === false) continue;
    const routed = (edgesTo.get(node.key) || []).some((edge) => edge.source === orchestrator.key && edge.sourceHandle === agent.key);
    const delivered = (edgesFrom.get(node.key) || []).some((edge) => edge.target === output.key);
    if (routed && delivered) executableAgents.push({ node, agent });
  }
  const fallbackAgentKey = executableAgents.some(({ agent }) => agent.key === orchestrator.config.fallbackAgentKey)
    ? orchestrator.config.fallbackAgentKey
    : "";
  return {
    workflow,
    nodeByKey,
    edgesFrom,
    edgesTo,
    input,
    filter,
    orchestrator,
    output,
    executableAgents,
    fallbackAgentKey,
  };
};

export const serializeMainWorkflow = (workflowModel) => {
  if (!workflowModel) return null;
  const workflow = typeof workflowModel.toJSON === "function" ? workflowModel.toJSON() : workflowModel;
  const nodes = (workflow.nodes || []).map((node) => ({
    id: node.id,
    key: node.key,
    name: node.name,
    type: node.type,
    enabled: node.enabled !== false,
    positionX: Number(node.positionX || 0),
    positionY: Number(node.positionY || 0),
    aiPermissionId: node.aiPermissionId ?? null,
    config: node.config || {},
  }));
  const nodeKeyById = new Map(nodes.map((node) => [String(node.id), node.key]));
  const edges = (workflow.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.sourceNode?.key || nodeKeyById.get(String(edge.sourceNodeId)),
    target: edge.targetNode?.key || nodeKeyById.get(String(edge.targetNodeId)),
    sourceHandle: edge.sourceHandle || null,
    targetHandle: edge.targetHandle || null,
    label: edge.label || null,
    sortOrder: Number(edge.sortOrder || 0),
  })).filter((edge) => edge.source && edge.target);
  return {
    id: workflow.id,
    name: workflow.name,
    version: workflow.version,
    revision: workflow.revision,
    active: workflow.active !== false,
    viewport: workflow.viewport || {},
    nodes,
    edges,
  };
};
