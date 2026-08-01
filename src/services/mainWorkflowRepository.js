import AiMainWorkflow from "../models/AiMainWorkflow.js";
import AiMainWorkflowNode from "../models/AiMainWorkflowNode.js";
import AiMainWorkflowEdge from "../models/AiMainWorkflowEdge.js";
import { buildDefaultMainWorkflow, compileMainWorkflow, serializeMainWorkflow } from "../utils/mainWorkflow.js";

export const mainWorkflowInclude = [{
  model: AiMainWorkflowNode,
  as: "nodes",
}, {
  model: AiMainWorkflowEdge,
  as: "edges",
  include: [
    { model: AiMainWorkflowNode, as: "sourceNode", attributes: ["id", "key"] },
    { model: AiMainWorkflowNode, as: "targetNode", attributes: ["id", "key"] },
  ],
}];

const agentKey = (agent) => String(agent?.key || "").trim().toLowerCase();

const pruneRemovedAgents = (definition, agents) => {
  if (!definition || typeof definition !== "object" || !Array.isArray(definition.nodes)) return definition;
  const available = new Set((agents || []).map(agentKey));
  const nodes = definition.nodes.filter((node) => node?.type !== "agent" || available.has(agentKey({ key: node.config?.agentKey || node.config?.taskKey })));
  const keys = new Set(nodes.map((node) => node.key));
  const edges = Array.isArray(definition.edges)
    ? definition.edges.filter((edge) => keys.has(edge.source) && keys.has(edge.target))
    : [];
  return { ...definition, nodes, edges };
};

export const findMainWorkflow = async (aiSessionConfigId, options = {}) => AiMainWorkflow.findOne({
  where: { aiSessionConfigId },
  include: mainWorkflowInclude,
  ...(options.transaction ? { transaction: options.transaction } : {}),
});

export const persistMainWorkflow = async (aiSessionConfigId, rawDefinition, agents = [], transaction) => {
  const definition = compileMainWorkflow(
    pruneRemovedAgents(rawDefinition, agents) || buildDefaultMainWorkflow(agents),
    agents,
  ).workflow;
  let workflow = await AiMainWorkflow.findOne({ where: { aiSessionConfigId }, transaction });
  if (!workflow) {
    workflow = await AiMainWorkflow.create({
      aiSessionConfigId,
      name: definition.name,
      version: definition.version,
      revision: 1,
      active: definition.active,
      viewport: definition.viewport,
    }, { transaction });
  } else {
    await workflow.update({
      name: definition.name,
      version: definition.version,
      revision: Number(workflow.revision || 0) + 1,
      active: definition.active,
      viewport: definition.viewport,
    }, { transaction });
  }

  const existingNodes = await AiMainWorkflowNode.findAll({ where: { aiMainWorkflowId: workflow.id }, transaction });
  const existingById = new Map(existingNodes.map((node) => [String(node.id), node]));
  const existingByKey = new Map(existingNodes.map((node) => [node.key, node]));
  const agentsByKey = new Map((agents || []).map((agent) => [agentKey(agent), agent]));
  const keptIds = new Set();
  const savedByKey = new Map();

  for (const node of definition.nodes) {
    let existing = null;
    if (node.id !== undefined && node.id !== null) {
      existing = existingById.get(String(node.id));
      if (!existing) throw new Error(`El nodo principal ${node.key} no pertenece a este workflow`);
    } else {
      existing = existingByKey.get(node.key);
    }
    const linkedAgent = node.type === "agent" ? agentsByKey.get(node.config.agentKey) : null;
    const values = {
      aiMainWorkflowId: workflow.id,
      aiPermissionId: linkedAgent?.id || null,
      key: node.key,
      name: node.name,
      type: node.type,
      enabled: node.enabled !== false,
      positionX: node.positionX,
      positionY: node.positionY,
      config: node.config,
    };
    const saved = existing
      ? await existing.update(values, { transaction })
      : await AiMainWorkflowNode.create(values, { transaction });
    keptIds.add(String(saved.id));
    savedByKey.set(saved.key, saved);
  }

  const removedIds = existingNodes.filter((node) => !keptIds.has(String(node.id))).map((node) => node.id);
  if (removedIds.length) await AiMainWorkflowNode.destroy({ where: { id: removedIds }, transaction });

  await AiMainWorkflowEdge.destroy({ where: { aiMainWorkflowId: workflow.id }, transaction });
  for (let index = 0; index < definition.edges.length; index += 1) {
    const edge = definition.edges[index];
    const source = savedByKey.get(edge.source);
    const target = savedByKey.get(edge.target);
    if (!source || !target) throw new Error(`No se pudo persistir la conexión ${edge.source} → ${edge.target}`);
    await AiMainWorkflowEdge.create({
      aiMainWorkflowId: workflow.id,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null,
      label: edge.label || null,
      sortOrder: Number(edge.sortOrder ?? index),
    }, { transaction });
  }

  return findMainWorkflow(aiSessionConfigId, { transaction });
};

export const ensureMainWorkflow = async (config, agents = [], transaction) => {
  const existing = await findMainWorkflow(config.id, { transaction });
  if (existing) return existing;
  const legacy = config.globalWorkflow && typeof config.globalWorkflow === "object"
    ? config.globalWorkflow
    : null;
  const initial = legacy
    ? migrateLegacyWorkflowDefinition(legacy, agents)
    : buildDefaultMainWorkflow(agents);
  return persistMainWorkflow(config.id, initial, agents, transaction);
};

export const migrateLegacyWorkflowDefinition = (legacy, agents = []) => {
  const byLegacyType = new Map((legacy?.nodes || []).map((node) => [node.type, node]));
  const defaults = buildDefaultMainWorkflow([], { linkAgents: false });
  const defaultByType = new Map(defaults.nodes.map((node) => [node.type, node]));
  const legacyType = {
    whatsapp_input: "whatsapp_trigger",
    interaction_filter: "preanalysis",
    orchestrator: "orchestrator",
    whatsapp_output: "whatsapp_output",
  };
  const nodes = ["whatsapp_input", "interaction_filter", "orchestrator", "whatsapp_output"].map((type) => {
    const previous = byLegacyType.get(legacyType[type]);
    const fallback = defaultByType.get(type);
    const config = type === "whatsapp_input"
      ? { messageTypes: previous?.config?.messageTypes || [] }
      : type === "orchestrator"
        ? { fallbackAgentKey: previous?.config?.fallbackTaskKey || "" }
        : type === "whatsapp_output"
          ? { contentTemplate: previous?.config?.contentTemplate || "" }
          : {};
    return {
      ...fallback,
      positionX: Number(previous?.positionX ?? fallback.positionX),
      positionY: Number(previous?.positionY ?? fallback.positionY),
      config,
    };
  });
  const agentsByKey = new Map((agents || []).map((agent) => [agentKey(agent), agent]));
  const legacyAgentNodes = (legacy?.nodes || []).filter((node) => node.type === "task_subworkflow");
  for (const [index, previous] of legacyAgentNodes.entries()) {
    const key = agentKey({ key: previous.config?.taskKey });
    const agent = agentsByKey.get(key);
    if (!agent) continue;
    nodes.push({
      key: `agent_${key}`,
      name: agent.name || key,
      type: "agent",
      enabled: previous.enabled !== false && agent.enabled !== false,
      positionX: Number(previous.positionX ?? 1010),
      positionY: Number(previous.positionY ?? 80 + index * 180),
      aiPermissionId: agent.id,
      config: { agentKey: key, inputMapping: previous.config?.inputMapping || {} },
    });
  }
  const agentNodes = nodes.filter((node) => node.type === "agent");
  return {
    ...defaults,
    nodes,
    edges: [
      { source: "whatsapp_input", target: "interaction_filter", sourceHandle: "message", targetHandle: "input" },
      { source: "interaction_filter", target: "orchestrator", sourceHandle: "respond", targetHandle: "input" },
      ...agentNodes.flatMap((node, index) => ([
        { source: "orchestrator", target: node.key, sourceHandle: node.config.agentKey, targetHandle: "input", sortOrder: index },
        { source: node.key, target: "whatsapp_output", sourceHandle: "output", targetHandle: "input", sortOrder: index },
      ])),
    ],
  };
};

export const mainWorkflowForApi = (workflowModel) => serializeMainWorkflow(workflowModel);
