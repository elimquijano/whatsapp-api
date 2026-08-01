const CORE_NODE_DEFINITIONS = [
  { key: "whatsapp_trigger", name: "Mensaje de WhatsApp", type: "whatsapp_trigger", positionX: 40, positionY: 220 },
  { key: "preanalysis", name: "Preanálisis", type: "preanalysis", positionX: 300, positionY: 220 },
  { key: "orchestrator", name: "Orquestador", type: "orchestrator", positionX: 560, positionY: 220 },
  { key: "response_guard", name: "Validador de respuesta", type: "response_guard", positionX: 1100, positionY: 220 },
  { key: "whatsapp_output", name: "Enviar a WhatsApp", type: "whatsapp_output", positionX: 1360, positionY: 220 },
];

export const GLOBAL_WORKFLOW_MESSAGE_TYPES = Object.freeze([
  "text",
  "image",
  "video",
  "audio",
  "document",
  "location",
  "sticker",
  "contact",
  "contacts",
]);

const SUPPORTED_MESSAGE_TYPES = new Set(GLOBAL_WORKFLOW_MESSAGE_TYPES);
const CORE_PROMPT_LIMIT = 50000;
const CONTENT_TEMPLATE_LIMIT = 10000;
const INPUT_MAPPING_LIMIT = 50000;
const unsafeObjectKeys = new Set(["__proto__", "prototype", "constructor"]);

export const GLOBAL_WORKFLOW_VERSION = 1;
export const GLOBAL_WORKFLOW_CORE_TYPES = new Set(CORE_NODE_DEFINITIONS.map((node) => node.type));
export const GLOBAL_WORKFLOW_NODE_TYPES = new Set([...GLOBAL_WORKFLOW_CORE_TYPES, "task_subworkflow"]);

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const boundedString = (value, maximum) => String(value ?? "").slice(0, maximum);
const normalizedBoolean = (value, fallback, label) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label} debe ser booleano`);
  return value;
};
const normalizeMessageTypes = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("messageTypes del trigger debe ser una lista");
  if (value.length > GLOBAL_WORKFLOW_MESSAGE_TYPES.length) {
    throw new Error(`messageTypes admite como máximo ${GLOBAL_WORKFLOW_MESSAGE_TYPES.length} tipos`);
  }
  const normalized = [];
  const seen = new Set();
  for (const rawType of value) {
    const type = String(rawType || "").trim().toLowerCase();
    if (!SUPPORTED_MESSAGE_TYPES.has(type)) throw new Error(`El tipo de mensaje global "${type || "vacío"}" no está soportado`);
    if (!seen.has(type)) {
      seen.add(type);
      normalized.push(type);
    }
  }
  return normalized;
};
const normalizeMappingValue = (value, label, state, depth = 0) => {
  if (depth > 8) throw new Error(`${label} supera la profundidad máxima`);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(`${label} contiene una lista demasiado grande`);
    return value.map((item, index) => normalizeMappingValue(item, `${label}[${index}]`, state, depth + 1));
  }
  if (!isPlainObject(value)) throw new Error(`${label} contiene un valor no compatible`);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error(`${label} contiene demasiados campos`);
  const output = {};
  for (const [key, item] of entries) {
    if (!key || key.length > 255 || unsafeObjectKeys.has(key)) throw new Error(`${label} contiene la clave no segura "${key}"`);
    state.entries += 1;
    if (state.entries > 1000) throw new Error(`${label} supera 1000 campos anidados`);
    output[key] = normalizeMappingValue(item, `${label}.${key}`, state, depth + 1);
  }
  return output;
};
const normalizeInputMapping = (value, label) => {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw new Error(`${label} debe ser un objeto`);
  const normalized = normalizeMappingValue(value, label, { entries: 0 });
  if (JSON.stringify(normalized).length > INPUT_MAPPING_LIMIT) throw new Error(`${label} supera ${INPUT_MAPPING_LIMIT} caracteres`);
  return normalized;
};
const normalizeCoreConfig = (type, value) => {
  const config = value === undefined || value === null ? {} : value;
  if (!isPlainObject(config)) throw new Error(`La configuración de ${type} debe ser un objeto`);
  if (type === "whatsapp_trigger") {
    return { messageTypes: normalizeMessageTypes(config.messageTypes) };
  }
  if (type === "preanalysis") {
    return {
      prompt: boundedString(config.prompt, CORE_PROMPT_LIMIT),
      ignoreUnrelatedMessages: normalizedBoolean(config.ignoreUnrelatedMessages, true, "ignoreUnrelatedMessages"),
    };
  }
  if (type === "orchestrator") {
    const fallbackTaskKey = String(config.fallbackTaskKey || "").trim();
    return {
      prompt: boundedString(config.prompt, CORE_PROMPT_LIMIT),
      fallbackTaskKey: fallbackTaskKey ? safeTaskKey(fallbackTaskKey, "fallbackTaskKey") : "",
    };
  }
  if (type === "response_guard") {
    const failureMode = String(config.failureMode || "use_proposed").trim().toLowerCase();
    if (!["block", "use_proposed"].includes(failureMode)) {
      throw new Error('failureMode debe ser "block" o "use_proposed"');
    }
    return {
      enabled: normalizedBoolean(config.enabled, true, "enabled de response_guard"),
      prompt: boundedString(config.prompt, CORE_PROMPT_LIMIT),
      failureMode,
    };
  }
  if (type === "whatsapp_output") {
    return { contentTemplate: boundedString(config.contentTemplate, CONTENT_TEMPLATE_LIMIT) };
  }
  return {};
};
const safeNodeKey = (value, label) => {
  const key = String(value || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,299}$/.test(key)) throw new Error(`${label} no es una clave de nodo válida`);
  return key;
};
const safeTaskKey = (value, label) => {
  const key = String(value || "").trim();
  // Compatibilidad con las claves que ya genera el controlador, incluidas las
  // históricas que comienzan con un número. El prefijo `task_` se aplica solo
  // a la clave visual del nodo, nunca modifica AiPermission.key.
  if (!/^[a-z0-9_]{1,255}$/.test(key)) throw new Error(`${label} no es una taskKey válida`);
  return key;
};
const finitePosition = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(10000, Math.max(-10000, numeric)) : fallback;
};
const taskNodeKey = (taskKey) => `task_${taskKey}`;

const permissionDescriptors = (permissions = []) => {
  if (!Array.isArray(permissions)) return [];
  const seen = new Set();
  return permissions.map((permission, index) => {
    const key = safeTaskKey(permission?.key, `La tarea ${index + 1}`);
    if (seen.has(key)) throw new Error(`La tarea "${key}" está repetida`);
    seen.add(key);
    return { key, name: String(permission?.name || key).slice(0, 255), enabled: permission?.enabled !== false };
  });
};

const defaultTaskNode = (permission, index) => ({
  key: taskNodeKey(permission.key),
  name: `Tarea: ${permission.name}`,
  type: "task_subworkflow",
  enabled: permission.enabled,
  positionX: 820,
  positionY: 60 + (index * 150),
  config: { taskKey: permission.key, inputMapping: {} },
});

const canonicalEdges = (nodes) => {
  const byType = new Map(nodes.filter((node) => node.type !== "task_subworkflow").map((node) => [node.type, node]));
  const taskNodes = nodes.filter((node) => node.type === "task_subworkflow");
  const trigger = byType.get("whatsapp_trigger");
  const preanalysis = byType.get("preanalysis");
  const orchestrator = byType.get("orchestrator");
  const guard = byType.get("response_guard");
  const output = byType.get("whatsapp_output");
  return [
    { source: trigger.key, target: preanalysis.key },
    { source: preanalysis.key, target: orchestrator.key },
    ...taskNodes.flatMap((node) => [
      { source: orchestrator.key, target: node.key, sourceHandle: node.config.taskKey },
      { source: node.key, target: guard.key },
    ]),
    { source: guard.key, target: output.key },
  ];
};

export const buildDefaultGlobalWorkflow = (permissions = []) => {
  const descriptors = permissionDescriptors(permissions);
  if (descriptors.length > 495) throw new Error("El workflow general no admite más de 495 tareas enlazadas");
  const nodes = [
    ...CORE_NODE_DEFINITIONS.map((node) => ({ ...node, enabled: true, config: normalizeCoreConfig(node.type, {}) })),
    ...descriptors.map(defaultTaskNode),
  ];
  // Orden visual: las tareas quedan entre orquestador y validador, sin copiar
  // dentro del flujo general los nodos HTTP/IA/script de cada subworkflow.
  nodes.sort((left, right) => left.positionX - right.positionX || left.positionY - right.positionY);
  return { version: GLOBAL_WORKFLOW_VERSION, nodes, edges: canonicalEdges(nodes) };
};

const normalizeSubmittedNode = (node, index) => {
  if (!isPlainObject(node)) throw new Error(`El nodo global ${index + 1} no es válido`);
  const type = String(node.type || "").trim();
  if (!GLOBAL_WORKFLOW_NODE_TYPES.has(type)) {
    throw new Error(`El tipo global "${type || "vacío"}" no está permitido; HTTP, Script, IA y condiciones pertenecen al subworkflow de la tarea`);
  }
  const key = safeNodeKey(node.key, `El nodo global ${index + 1}`);
  const normalized = {
    key,
    name: String(node.name || key).trim().slice(0, 255) || key,
    type,
    enabled: node.enabled !== false,
    positionX: finitePosition(node.positionX, 0),
    positionY: finitePosition(node.positionY, 0),
    config: type === "task_subworkflow"
      ? {
        taskKey: safeTaskKey(node.config?.taskKey, `La referencia de ${key}`),
        inputMapping: normalizeInputMapping(node.config?.inputMapping, `inputMapping de ${key}`),
      }
      : normalizeCoreConfig(type, node.config),
  };
  return normalized;
};

const validateSubmittedEdges = (rawEdges, submittedNodes, activeTaskKeys) => {
  if (!Array.isArray(rawEdges)) throw new Error("Las conexiones del workflow general deben ser una lista");
  if (rawEdges.length > 1000) throw new Error("El workflow general supera 1000 conexiones");
  const nodesByKey = new Map(submittedNodes.map((node) => [node.key, node]));
  const coreByType = new Map(submittedNodes.filter((node) => node.type !== "task_subworkflow").map((node) => [node.type, node]));
  const seen = new Set();
  const routedPairs = new Set();
  for (const [index, edge] of rawEdges.entries()) {
    if (!isPlainObject(edge)) throw new Error(`La conexión global ${index + 1} no es válida`);
    const source = safeNodeKey(edge.source, `Origen de la conexión ${index + 1}`);
    const target = safeNodeKey(edge.target, `Destino de la conexión ${index + 1}`);
    const sourceNode = nodesByKey.get(source);
    const targetNode = nodesByKey.get(target);
    if (!sourceNode || !targetNode) throw new Error(`La conexión global ${source} -> ${target} referencia un nodo inexistente`);
    const signature = `${source}->${target}:${String(edge.sourceHandle || "")}`;
    if (seen.has(signature)) throw new Error(`La conexión global ${source} -> ${target} está repetida`);
    seen.add(signature);
    const trigger = coreByType.get("whatsapp_trigger")?.key;
    const preanalysis = coreByType.get("preanalysis")?.key;
    const orchestrator = coreByType.get("orchestrator")?.key;
    const guard = coreByType.get("response_guard")?.key;
    const output = coreByType.get("whatsapp_output")?.key;
    const sourceTask = sourceNode.type === "task_subworkflow" ? sourceNode.config.taskKey : null;
    const targetTask = targetNode.type === "task_subworkflow" ? targetNode.config.taskKey : null;
    if ((sourceTask && !activeTaskKeys.has(sourceTask)) || (targetTask && !activeTaskKeys.has(targetTask))) continue;
    const allowed = (source === trigger && target === preanalysis)
      || (source === preanalysis && target === orchestrator)
      || (source === orchestrator && targetTask && activeTaskKeys.has(targetTask))
      || (sourceTask && activeTaskKeys.has(sourceTask) && target === guard)
      || (source === guard && target === output);
    if (!allowed) throw new Error(`La conexión global ${source} -> ${target} no pertenece al flujo core permitido`);
    if (source === orchestrator && targetTask && String(edge.sourceHandle || "") !== targetTask) {
      throw new Error(`La ruta del orquestador hacia ${target} debe usar sourceHandle "${targetTask}"`);
    }
    routedPairs.add(`${source}->${target}`);
  }

  const trigger = coreByType.get("whatsapp_trigger")?.key;
  const preanalysis = coreByType.get("preanalysis")?.key;
  const orchestrator = coreByType.get("orchestrator")?.key;
  const guard = coreByType.get("response_guard")?.key;
  const output = coreByType.get("whatsapp_output")?.key;
  for (const [source, target] of [[trigger, preanalysis], [preanalysis, orchestrator], [guard, output]]) {
    if (!routedPairs.has(`${source}->${target}`)) throw new Error(`Falta la conexión core ${source} -> ${target}`);
  }
  for (const taskNode of submittedNodes.filter((node) => (
    node.type === "task_subworkflow" && activeTaskKeys.has(node.config.taskKey)
  ))) {
    if (!routedPairs.has(`${orchestrator}->${taskNode.key}`)) {
      throw new Error(`Falta la ruta del orquestador hacia la tarea ${taskNode.config.taskKey}`);
    }
    if (!routedPairs.has(`${taskNode.key}->${guard}`)) {
      throw new Error(`Falta la conexión de la tarea ${taskNode.config.taskKey} hacia response_guard`);
    }
  }
};

export const normalizeGlobalWorkflow = (rawWorkflow, permissions = []) => {
  const descriptors = permissionDescriptors(permissions);
  if (rawWorkflow === undefined || rawWorkflow === null || rawWorkflow === "") {
    return buildDefaultGlobalWorkflow(descriptors);
  }
  if (rawWorkflow?.__invalidGlobalWorkflow === true) {
    throw new Error("El JSON persistido del workflow general está corrupto");
  }
  if (!isPlainObject(rawWorkflow)) throw new Error("El workflow general debe ser un objeto JSON");
  if (Number(rawWorkflow.version ?? GLOBAL_WORKFLOW_VERSION) !== GLOBAL_WORKFLOW_VERSION) {
    throw new Error(`La versión ${rawWorkflow.version} del workflow general no es compatible`);
  }
  if (!Array.isArray(rawWorkflow.nodes)) throw new Error("Los nodos del workflow general deben ser una lista");
  if (rawWorkflow.nodes.length > 500) throw new Error("El workflow general supera 500 nodos");

  const submittedNodes = rawWorkflow.nodes.map(normalizeSubmittedNode);
  const keys = new Set();
  for (const node of submittedNodes) {
    if (keys.has(node.key)) throw new Error(`El nodo global "${node.key}" está repetido`);
    keys.add(node.key);
  }
  for (const definition of CORE_NODE_DEFINITIONS) {
    const matches = submittedNodes.filter((node) => node.type === definition.type);
    if (matches.length !== 1) throw new Error(`El workflow general necesita exactamente un nodo ${definition.type}`);
    if (matches[0].enabled === false) throw new Error(`El nodo core ${definition.type} no puede deshabilitarse`);
  }

  const descriptorByKey = new Map(descriptors.map((permission) => [permission.key, permission]));
  const submittedTaskKeys = new Set();
  const synchronizedTasks = [];
  for (const node of submittedNodes.filter((item) => item.type === "task_subworkflow")) {
    const permission = descriptorByKey.get(node.config.taskKey);
    // Al borrar una tarea, su referencia y sus aristas desaparecen del grafo
    // persistido. Una tarea nueva no se enlaza hasta que la UI lo solicite.
    if (!permission) continue;
    if (submittedTaskKeys.has(node.config.taskKey)) throw new Error(`La tarea "${node.config.taskKey}" está referenciada más de una vez`);
    submittedTaskKeys.add(node.config.taskKey);
    synchronizedTasks.push({
      ...node,
      name: `Tarea: ${permission.name}`,
      enabled: permission.enabled,
      config: {
        taskKey: permission.key,
        inputMapping: node.config.inputMapping || {},
      },
    });
  }
  const coreNodes = submittedNodes.filter((node) => node.type !== "task_subworkflow");
  const linkedEnabledTaskKeys = new Set(synchronizedTasks
    .filter((node) => node.enabled !== false)
    .map((node) => node.config.taskKey));
  const orchestrator = coreNodes.find((node) => node.type === "orchestrator");
  if (orchestrator?.config?.fallbackTaskKey && !linkedEnabledTaskKeys.has(orchestrator.config.fallbackTaskKey)) {
    orchestrator.config = { ...orchestrator.config, fallbackTaskKey: "" };
  }
  const synchronizedNodes = [...coreNodes, ...synchronizedTasks];
  const synchronizedKeys = new Set();
  for (const node of synchronizedNodes) {
    if (synchronizedKeys.has(node.key)) throw new Error(`La sincronización produjo la clave de nodo duplicada "${node.key}"`);
    synchronizedKeys.add(node.key);
  }
  validateSubmittedEdges(rawWorkflow.edges, submittedNodes, new Set(descriptors.map((item) => item.key)));
  synchronizedNodes.sort((left, right) => left.positionX - right.positionX || left.positionY - right.positionY);
  return {
    version: GLOBAL_WORKFLOW_VERSION,
    nodes: synchronizedNodes,
    // El core es fijo. Canonicalizar las aristas evita guardar conexiones que
    // la ejecución no vaya a respetar o elementos meramente decorativos.
    edges: canonicalEdges(synchronizedNodes),
  };
};

export const getEnabledGlobalTaskKeys = (workflow, permissions = []) => {
  const descriptors = permissionDescriptors(permissions);
  const normalized = normalizeGlobalWorkflow(workflow, descriptors);
  const enabledPermissions = new Set(descriptors.filter((item) => item.enabled).map((item) => item.key));
  const taskKeys = new Set(normalized.nodes
    .filter((node) => node.type === "task_subworkflow" && node.enabled !== false && enabledPermissions.has(node.config.taskKey))
    .map((node) => node.config.taskKey));
  return { workflow: normalized, taskKeys };
};
