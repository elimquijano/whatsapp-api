import AiWorkflowExecution from "../models/AiWorkflowExecution.js";
import AiWorkflowNodeExecution from "../models/AiWorkflowNodeExecution.js";
import sequelize from "../database/db.js";
import { Op } from "sequelize";

const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|apikey|access[-_]?token|refresh[-_]?token|token|secret|client[-_]?secret|password|passwd|pass|credential|credentials|auth[-_]?value|private[-_]?key)$/i;
const SENSITIVE_QUERY_KEY = /(token|secret|password|passwd|api[-_]?key|authorization|auth|signature|credential)/i;
const REDACTED = "[REDACTED]";

const sanitizeString = (value) => {
  let output = String(value)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    .replace(/\b(token|secret|password|passwd|api[-_]?key|auth[-_]?value|client[-_]?secret)(\s*[=:]\s*["']?)[^\s,"'}&]+/gi, `$1$2${REDACTED}`);
  output = output.replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      for (const key of [...url.searchParams.keys()]) {
        if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, REDACTED);
      }
      return url.toString();
    } catch { return rawUrl; }
  });
  return output.length > 20000 ? `${output.slice(0, 20000)}...[TRUNCATED]` : output;
};

export const sanitizeForTrace = (value, options = {}) => {
  const maxDepth = Math.min(12, Math.max(1, Number(options.maxDepth || 8)));
  const maxArray = Math.min(500, Math.max(1, Number(options.maxArray || 100)));
  // Track only the current ancestry. Reusing the same object in two branches
  // is common in workflow inputs and is not a circular reference.
  const ancestors = new WeakSet();

  const walk = (item, depth, parentKey = "") => {
    if (item === null || item === undefined) return item ?? null;
    if (SENSITIVE_KEY.test(parentKey)) return REDACTED;
    if (typeof item === "string") return sanitizeString(item);
    if (["number", "boolean"].includes(typeof item)) return item;
    if (typeof item === "bigint") return item.toString();
    if (typeof item !== "object") return String(item);
    if (depth >= maxDepth) return "[MAX_DEPTH]";
    if (item instanceof Date) return item.toISOString();
    if (Buffer.isBuffer(item)) return `[BUFFER ${item.length} bytes]`;
    if (ancestors.has(item)) return "[CIRCULAR]";
    ancestors.add(item);
    if (Array.isArray(item)) {
      const result = item.slice(0, maxArray).map((entry) => walk(entry, depth + 1));
      if (item.length > maxArray) result.push(`[${item.length - maxArray} ITEMS TRUNCATED]`);
      ancestors.delete(item);
      return result;
    }
    const result = {};
    for (const [key, entry] of Object.entries(item)) {
      result[key] = SENSITIVE_KEY.test(key) ? REDACTED : walk(entry, depth + 1, key);
    }
    ancestors.delete(item);
    return result;
  };

  const sanitized = walk(value, 0);
  try {
    const serialized = JSON.stringify(sanitized);
    if (serialized.length <= 150000) return sanitized;
    return { truncated: true, preview: sanitizeString(serialized.slice(0, 140000)) };
  } catch {
    return { serializationError: true };
  }
};

const safeError = (error) => sanitizeString(error?.message || error || "Error desconocido");
const TERMINAL_EXECUTION_STATUSES = new Set(["success", "error", "skipped"]);
const traceMapKey = (scope, value) => `${scope}:${String(value)}`;
const MAIN_SEQUENCE = {
  whatsapp_input: 100000,
  interaction_filter: 200000,
  orchestrator: 300000,
  agent: 400000,
  whatsapp_output: 900000,
};

const createNodeTrace = async ({ execution, node, scope, sequence, transaction }) => {
  const disabled = node.enabled === false;
  const now = disabled ? new Date() : null;
  return AiWorkflowNodeExecution.create({
    workflowExecutionId: execution.id,
    aiWorkflowNodeId: scope === "task" ? (node.id || null) : null,
    aiMainWorkflowNodeId: scope === "main" ? (node.id || null) : null,
    nodeKey: node.key,
    nodeName: node.name || node.key,
    nodeType: node.type,
    scope,
    sequence,
    status: disabled ? "skipped" : "waiting",
    input: {},
    output: disabled ? { reason: "Nodo deshabilitado" } : {},
    startedAt: now,
    finishedAt: now,
    durationMs: disabled ? 0 : null,
  }, { transaction });
};

const registerTrace = (context, trace, node) => {
  const scope = trace.scope || "task";
  context.traces.set(traceMapKey(scope, node.id || node.key), trace);
  context.traces.set(traceMapKey(scope, `key:${node.key}`), trace);
};

const findDeliveryOutputTrace = async (executionId) => (
  await AiWorkflowNodeExecution.findOne({
    where: { workflowExecutionId: executionId, nodeType: "whatsapp_output", status: "waiting_delivery", scope: "main" },
    order: [["sequence", "DESC"]],
  })
  || await AiWorkflowNodeExecution.findOne({
    where: { workflowExecutionId: executionId, nodeType: "whatsapp_output", status: "waiting_delivery", scope: "global" },
    order: [["sequence", "DESC"]],
  })
  || await AiWorkflowNodeExecution.findOne({
    where: { workflowExecutionId: executionId, nodeType: "whatsapp_output", status: "waiting_delivery", scope: "task" },
    order: [["sequence", "DESC"]],
  })
);

const terminalizeRemainingTraces = async (executionId, reason) => {
  if (!executionId || typeof AiWorkflowNodeExecution.update !== "function") return;
  const now = new Date();
  // Los nodos que nunca arrancaron sí tienen duración cero.
  await AiWorkflowNodeExecution.update({
    status: "skipped",
    output: sanitizeForTrace({ reason }),
    error: null,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
  }, {
    where: {
      workflowExecutionId: executionId,
      status: "waiting",
    },
  });
  // Para estados que sí comenzaron conservamos startedAt. SQL no puede
  // calcular aquí una duración portable por fila; null es más honesto que un
  // cero fabricado y finishedAt permite reconstruirla si hiciera falta.
  await AiWorkflowNodeExecution.update({
    status: "skipped",
    output: sanitizeForTrace({ reason }),
    error: null,
    finishedAt: now,
  }, {
    where: {
      workflowExecutionId: executionId,
      status: { [Op.in]: ["running", "waiting_delivery"] },
    },
  });
};

class WorkflowTraceService {
  async start({ sessionConfig, permission, input, trigger = "message", safeMode = false }) {
    const transaction = await sequelize.transaction();
    try {
      const execution = await AiWorkflowExecution.create({
        whatsappSessionId: sessionConfig.whatsappSessionId,
        aiPermissionId: permission.id || null,
        permissionKey: permission.key,
        permissionName: permission.name || permission.key,
        trigger,
        status: "waiting",
        safeMode,
        contactNumber: input.contact?.number || null,
        messageId: input.messageId || null,
        input: sanitizeForTrace(input),
        output: {},
      }, { transaction });
      const traces = new Map();
      const nodes = permission.nodes || [];
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const trace = await createNodeTrace({ execution, node, scope: "task", sequence: index, transaction });
        const context = { traces };
        registerTrace(context, trace, node);
      }
      const startedAt = new Date();
      await execution.update({ status: "running", startedAt }, { transaction });
      await transaction.commit();
      return { execution, traces, startedAt, mode: "task" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async startMain({ sessionConfig, mainWorkflow, input, trigger = "message" }) {
    const transaction = await sequelize.transaction();
    try {
      const execution = await AiWorkflowExecution.create({
        whatsappSessionId: sessionConfig.whatsappSessionId,
        aiPermissionId: null,
        aiMainWorkflowId: mainWorkflow.id || null,
        permissionKey: "__main_pending__",
        permissionName: mainWorkflow.name || "Workflow principal",
        trigger,
        status: "waiting",
        safeMode: false,
        contactNumber: input.contact?.number || null,
        messageId: input.messageId || null,
        input: sanitizeForTrace(input),
        output: {},
      }, { transaction });
      const context = {
        execution,
        traces: new Map(),
        startedAt: new Date(),
        mode: "main",
        mainWorkflow,
      };
      const typeIndexes = new Map();
      for (const node of mainWorkflow.nodes || []) {
        const typeIndex = typeIndexes.get(node.type) || 0;
        typeIndexes.set(node.type, typeIndex + 1);
        const sequence = (MAIN_SEQUENCE[node.type] || 700000) + typeIndex;
        const trace = await createNodeTrace({ execution, node, scope: "main", sequence, transaction });
        registerTrace(context, trace, node);
      }
      await execution.update({ status: "running", startedAt: context.startedAt }, { transaction });
      await transaction.commit();
      return context;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async startGlobal({ sessionConfig, globalWorkflow, input, trigger = "message" }) {
    const legacyMain = {
      ...globalWorkflow,
      nodes: (globalWorkflow?.nodes || []).map((node) => ({
        ...node,
        type: ({
          whatsapp_trigger: "whatsapp_input",
          preanalysis: "interaction_filter",
          task_subworkflow: "agent",
          response_guard: "whatsapp_output",
        })[node.type] || node.type,
      })),
    };
    return this.startMain({ sessionConfig, mainWorkflow: legacyMain, input, trigger });
  }

  async attachTask(context, permission) {
    if (!context?.execution || !["main", "global"].includes(context.mode)) return context;
    if (context.attachedTaskKey) {
      if (context.attachedTaskKey === permission.key) return context;
      throw new Error(`La ejecución global ya está vinculada a la tarea ${context.attachedTaskKey}`);
    }
    const transaction = await sequelize.transaction();
    try {
      await context.execution.update({
        aiPermissionId: permission.id || null,
        permissionKey: permission.key,
        permissionName: permission.name || permission.key,
      }, { transaction });
      for (let index = 0; index < (permission.nodes || []).length; index += 1) {
        const node = permission.nodes[index];
        const trace = await createNodeTrace({
          execution: context.execution,
          node,
          scope: "task",
          sequence: 500000 + index,
          transaction,
        });
        registerTrace(context, trace, node);
      }
      await transaction.commit();
      context.attachedTaskKey = permission.key;
      return context;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  getNodeTrace(context, node, scope = "task") {
    return context?.traces?.get(traceMapKey(scope, node.id || node.key))
      || context?.traces?.get(traceMapKey(scope, `key:${node.key}`))
      || null;
  }

  async orderTaskNodes(context, orderedNodes = []) {
    if (!context?.traces) return;
    const base = ["main", "global"].includes(context.mode) ? 500000 : 0;
    for (let index = 0; index < orderedNodes.length; index += 1) {
      const trace = this.getNodeTrace(context, orderedNodes[index], "task");
      if (trace && Number(trace.sequence) !== base + index) {
        await trace.update({ sequence: base + index });
      }
    }
  }

  async nodeRunning(context, node, input, options = {}) {
    const trace = this.getNodeTrace(context, node, options.scope || "task");
    if (!trace) return;
    await trace.update({ status: "running", input: sanitizeForTrace(input), output: {}, error: null, startedAt: new Date(), finishedAt: null, durationMs: null });
    if (context?.execution) await context.execution.update({ status: "running", currentNodeKey: node.key });
  }

  async nodeSuccess(context, node, output, options = {}) {
    const trace = this.getNodeTrace(context, node, options.scope || "task");
    if (!trace) return;
    const finishedAt = new Date();
    const startedAt = trace.startedAt ? new Date(trace.startedAt) : finishedAt;
    await trace.update({ status: "success", output: sanitizeForTrace(output), finishedAt, durationMs: Math.max(0, finishedAt - startedAt) });
  }

  async nodeError(context, node, error, options = {}) {
    const trace = this.getNodeTrace(context, node, options.scope || "task");
    if (!trace) return;
    const finishedAt = new Date();
    const startedAt = trace.startedAt ? new Date(trace.startedAt) : finishedAt;
    await trace.update({ status: "error", error: safeError(error), output: {}, finishedAt, durationMs: Math.max(0, finishedAt - startedAt) });
  }

  async nodeSkipped(context, node, reason = "Ruta no ejecutada", options = {}) {
    const trace = this.getNodeTrace(context, node, options.scope || "task");
    if (!trace || !["waiting", "running", "waiting_delivery"].includes(trace.status)) return;
    const now = new Date();
    const startedAt = trace.startedAt ? new Date(trace.startedAt) : now;
    await trace.update({
      status: "skipped",
      input: options.input === undefined ? trace.input : sanitizeForTrace(options.input),
      output: sanitizeForTrace({ reason, ...(options.output || {}) }),
      error: options.error ? safeError(options.error) : null,
      startedAt,
      finishedAt: now,
      durationMs: Math.max(0, now - startedAt),
    });
  }

  async skipUnselectedGlobalTasks(context, selectedTaskKey, reason = "Otra tarea fue seleccionada") {
    if (!context?.globalWorkflow) return;
    for (const node of context.globalWorkflow.nodes || []) {
      if (node.type !== "task_subworkflow" || node.config?.taskKey === selectedTaskKey) continue;
      await this.nodeSkipped(context, node, reason, {
        scope: "global",
        output: { selectedTaskKey },
      });
    }
  }

  async skipUnselectedMainAgents(context, selectedAgentKey, reason = "Otro agente fue seleccionado") {
    if (!context?.mainWorkflow) return;
    for (const node of context.mainWorkflow.nodes || []) {
      if (node.type !== "agent" || node.config?.agentKey === selectedAgentKey) continue;
      await this.nodeSkipped(context, node, reason, {
        scope: "main",
        output: { selectedAgentKey },
      });
    }
  }

  async skipPending(context, reason = "Etapa no ejecutada", options = {}) {
    const scope = options.scope;
    const pending = [...new Set(context?.traces?.values() || [])].filter((trace) => (
      ["waiting", "running", "waiting_delivery"].includes(trace.status) && (!scope || trace.scope === scope)
    ));
    for (const trace of pending) {
      const now = new Date();
      await trace.update({
        status: "skipped",
        output: sanitizeForTrace({ reason, ...(options.output || {}) }),
        error: null,
        startedAt: trace.startedAt || now,
        finishedAt: now,
        durationMs: trace.startedAt ? Math.max(0, now - new Date(trace.startedAt)) : 0,
      });
    }
  }

  async finishSkipped(context, reason, output = {}) {
    if (!context?.execution) return;
    await this.skipPending(context, reason);
    const finishedAt = new Date();
    await context.execution.update({
      status: "skipped",
      currentNodeKey: null,
      output: sanitizeForTrace({ skipped: true, reason, ...output }),
      error: null,
      finishedAt,
      durationMs: Math.max(0, finishedAt - new Date(context.startedAt || finishedAt)),
    });
  }

  async awaitingDelivery(context, output, options = {}) {
    if (!context?.execution) return;
    const uniqueTraces = [...new Set(context.traces?.values() || [])];
    const requestedCandidate = options.outputNode
      ? this.getNodeTrace(context, options.outputNode, options.scope || "task")
      : null;
    const requestedTrace = requestedCandidate && ["running", "success"].includes(requestedCandidate.status)
      ? requestedCandidate
      : null;
    const mainOutput = context.mode === "main"
      ? uniqueTraces.find((trace) => trace.nodeType === "whatsapp_output" && trace.scope === "main")
      : context.mode === "global"
        ? uniqueTraces.find((trace) => trace.nodeType === "whatsapp_output" && trace.scope === "global")
      : null;
    const executedTaskOutputs = uniqueTraces.filter((trace) => (
      trace.nodeType === "whatsapp_output"
      && (trace.scope || "task") === "task"
      && ["running", "success"].includes(trace.status)
    ));
    const outputTrace = requestedTrace || mainOutput || executedTaskOutputs.at(-1) || null;
    // Nunca reactivar un output deshabilitado, omitido o de una rama que no se
    // recorrió. La ejecución puede esperar entrega sin traza de nodo cuando la
    // respuesta fue compuesta fuera de un whatsapp_output legacy.
    if (outputTrace && ["running", "success"].includes(outputTrace.status)) {
      await outputTrace.update({
        status: "waiting_delivery",
        output: sanitizeForTrace({
          ...(outputTrace.output || {}),
          ...(output?.content ? { content: output.content } : {}),
          deliveryStatus: "pending",
        }),
        error: null,
        finishedAt: null,
        durationMs: null,
      });
    }
    await context.execution.update({
      status: "waiting_delivery",
      currentNodeKey: outputTrace?.nodeKey || null,
      output: sanitizeForTrace({ ...output, delivery: { status: "pending" } }),
      error: null,
      finishedAt: null,
      durationMs: null,
    });
  }

  async deliverySuccess(executionId, delivery = {}) {
    if (!executionId) return;
    const execution = await AiWorkflowExecution.findByPk(executionId);
    if (!execution) return;
    if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return;
    const outputTrace = await findDeliveryOutputTrace(executionId);
    const deliveredAt = new Date();
    const safeDelivery = sanitizeForTrace({ status: "sent", deliveredAt: deliveredAt.toISOString(), ...delivery });
    if (outputTrace) {
      await outputTrace.update({
        status: "success",
        output: sanitizeForTrace({ ...(outputTrace.output || {}), deliveryStatus: "sent", delivery: safeDelivery }),
        error: null,
        finishedAt: deliveredAt,
        durationMs: Math.max(0, deliveredAt - new Date(outputTrace.startedAt || deliveredAt)),
      });
    }
    await terminalizeRemainingTraces(executionId, "La entrega finalizó correctamente");
    await execution.update({
      status: "success",
      currentNodeKey: null,
      output: sanitizeForTrace({ ...(execution.output || {}), delivery: safeDelivery }),
      error: null,
      finishedAt: deliveredAt,
      durationMs: Math.max(0, deliveredAt - new Date(execution.startedAt || deliveredAt)),
    });
  }

  async deliveryError(executionId, error) {
    if (!executionId) return;
    const execution = await AiWorkflowExecution.findByPk(executionId);
    if (!execution) return;
    if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return;
    const outputTrace = await findDeliveryOutputTrace(executionId);
    const finishedAt = new Date();
    const message = safeError(error);
    if (outputTrace) {
      await outputTrace.update({
        status: "error",
        error: message,
        output: sanitizeForTrace({ ...(outputTrace.output || {}), deliveryStatus: "error" }),
        finishedAt,
        durationMs: Math.max(0, finishedAt - new Date(outputTrace.startedAt || finishedAt)),
      });
    }
    await terminalizeRemainingTraces(executionId, "La entrega terminó con error");
    await execution.update({
      status: "error",
      currentNodeKey: null,
      error: message,
      output: sanitizeForTrace({ ...(execution.output || {}), delivery: { status: "error", error: message } }),
      finishedAt,
      durationMs: Math.max(0, finishedAt - new Date(execution.startedAt || finishedAt)),
    });
  }

  async deliveryCancelled(executionId, cancellation = {}) {
    if (!executionId) return;
    const execution = await AiWorkflowExecution.findByPk(executionId);
    if (!execution) return;
    if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return;
    const outputTrace = await findDeliveryOutputTrace(executionId);
    const finishedAt = new Date();
    const { content: _discardedContent, ...cancellationDetails } = cancellation || {};
    const safeCancellation = sanitizeForTrace({
      cancelled: true,
      code: "AUTOREPLY_DISABLED_BEFORE_DELIVERY",
      reason: "Envío cancelado antes de WhatsApp",
      ...cancellationDetails,
    });
    if (outputTrace) {
      await outputTrace.update({
        status: "skipped",
        // Sobrescribe la salida del nodo para no conservar el texto que ya no
        // está autorizado a enviarse.
        output: safeCancellation,
        error: null,
        finishedAt,
        durationMs: Math.max(0, finishedAt - new Date(outputTrace.startedAt || finishedAt)),
      });
    }
    await terminalizeRemainingTraces(executionId, "La entrega fue cancelada");
    await execution.update({
      status: "skipped",
      currentNodeKey: null,
      // La ejecución cancelada nunca expone contenido de salida; conserva solo
      // el motivo operativo necesario para auditar el cambio IA/humano.
      output: safeCancellation,
      error: null,
      finishedAt,
      durationMs: Math.max(0, finishedAt - new Date(execution.startedAt || finishedAt)),
    });
  }

  async finish(context, output) {
    if (!context?.execution) return;
    await this.skipPending(context, "La ejecución terminó sin recorrer esta rama");
    const finishedAt = new Date();
    await context.execution.update({
      status: "success",
      currentNodeKey: null,
      output: sanitizeForTrace(output),
      finishedAt,
      durationMs: Math.max(0, finishedAt - new Date(context.startedAt || finishedAt)),
    });
  }

  async fail(context, error) {
    if (!context?.execution) return;
    if (["main", "global"].includes(context.mode) && context.execution.id) {
      try {
        const latest = await AiWorkflowExecution.findByPk(context.execution.id, { attributes: ["status"] });
        if (latest && TERMINAL_EXECUTION_STATUSES.has(latest.status)) return;
      } catch {
        // El error original sigue siendo la causa principal; si la lectura de
        // protección falla, se intenta cerrar usando la instancia disponible.
      }
    }
    if (TERMINAL_EXECUTION_STATUSES.has(context.execution.status)) return;
    const running = [...new Set(context.traces?.values() || [])].filter((trace) => trace.status === "running");
    for (const trace of running) {
      const finishedAt = new Date();
      await trace.update({
        status: "error",
        error: safeError(error),
        output: {},
        finishedAt,
        durationMs: Math.max(0, finishedAt - new Date(trace.startedAt || finishedAt)),
      });
    }
    const pending = [...new Set(context.traces?.values() || [])].filter((trace) => ["waiting", "waiting_delivery"].includes(trace.status));
    for (const trace of pending) {
      const now = new Date();
      await trace.update({ status: "skipped", output: { reason: "No ejecutado por error previo" }, startedAt: now, finishedAt: now, durationMs: 0 });
    }
    const finishedAt = new Date();
    await context.execution.update({
      status: "error",
      currentNodeKey: null,
      error: safeError(error),
      finishedAt,
      durationMs: Math.max(0, finishedAt - new Date(context.startedAt || finishedAt)),
    });
  }
}

export default new WorkflowTraceService();
