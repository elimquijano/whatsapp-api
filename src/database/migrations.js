import { DataTypes, Op } from "sequelize";
import { buildDefaultGlobalWorkflow } from "../utils/globalWorkflow.js";
import { buildDefaultMainWorkflow } from "../utils/mainWorkflow.js";
import { migrateLegacyWorkflowDefinition } from "../services/mainWorkflowRepository.js";

const addColumnIfMissing = async (queryInterface, table, description, name, definition) => {
  if (description[name]) return;
  await queryInterface.addColumn(table, name, definition);
};

// Migrations are explicit and idempotent because sequelize.sync({ alter: true })
// creates duplicate indexes in MySQL on repeated starts in this project.
export const runDatabaseMigrations = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  const sessionTable = "WhatsAppSessions";
  const sessionDescription = await queryInterface.describeTable(sessionTable);
  await addColumnIfMissing(queryInterface, sessionTable, sessionDescription, "phoneNumber", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, sessionTable, sessionDescription, "displayName", {
    type: DataTypes.STRING,
    allowNull: true,
  });

  const table = "CrmCampaigns";
  const description = await queryInterface.describeTable(table);

  await addColumnIfMissing(queryInterface, table, description, "mediaPayload", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, description, "mediaStorageKey", {
    type: DataTypes.STRING(128),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, description, "mediaMimeType", {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, description, "mediaFilename", {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, description, "lastError", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  const aiConfigTable = "AiSessionConfigs";
  const aiConfigDescription = await queryInterface.describeTable(aiConfigTable);
  await addColumnIfMissing(queryInterface, aiConfigTable, aiConfigDescription, "globalWorkflow", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, aiConfigTable, aiConfigDescription, "responseValidationFailureMode", {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: "block",
  });

  const nodeExecutionTable = "AiWorkflowNodeExecutions";
  const nodeExecutionDescription = await queryInterface.describeTable(nodeExecutionTable);
  await addColumnIfMissing(queryInterface, nodeExecutionTable, nodeExecutionDescription, "scope", {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: "task",
  });
  await addColumnIfMissing(queryInterface, nodeExecutionTable, nodeExecutionDescription, "aiMainWorkflowNodeId", {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "AiMainWorkflowNodes", key: "id" },
    onDelete: "SET NULL",
  });
  const workflowExecutionTable = "AiWorkflowExecutions";
  const workflowExecutionDescription = await queryInterface.describeTable(workflowExecutionTable);
  await addColumnIfMissing(queryInterface, workflowExecutionTable, workflowExecutionDescription, "aiMainWorkflowId", {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "AiMainWorkflows", key: "id" },
    onDelete: "SET NULL",
  });
  // Una instalación interrumpida podría haber alcanzado a crear la columna
  // nullable. Repara los registros legacy antes de endurecer el esquema.
  await queryInterface.bulkUpdate(nodeExecutionTable, { scope: "task" }, { scope: null });
  if (nodeExecutionDescription.scope?.allowNull !== false && typeof queryInterface.changeColumn === "function") {
    await queryInterface.changeColumn(nodeExecutionTable, "scope", {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "task",
    });
  }

  // Backfill de configuraciones existentes. Las tareas continúan almacenando
  // sus grafos; el workflow general solo guarda nodos de referencia por taskKey.
  if (typeof queryInterface.select === "function") {
    const configs = await queryInterface.select(null, aiConfigTable, {
      attributes: ["id", "globalWorkflow"],
    });
    const permissions = await queryInterface.select(null, "AiPermissions", {
      attributes: ["id", "aiSessionConfigId", "key", "name", "enabled", "priority"],
    });
    const permissionsByConfig = new Map();
    for (const permission of permissions || []) {
      const key = String(permission.aiSessionConfigId);
      if (!permissionsByConfig.has(key)) permissionsByConfig.set(key, []);
      permissionsByConfig.get(key).push(permission);
    }
    for (const config of configs || []) {
      if (config.globalWorkflow !== null && config.globalWorkflow !== undefined && String(config.globalWorkflow).trim()) continue;
      const taskDefinitions = (permissionsByConfig.get(String(config.id)) || [])
        .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0))
        .map((permission) => ({
          key: permission.key,
          name: permission.name,
          enabled: permission.enabled !== false && Number(permission.enabled) !== 0,
        }));
      await queryInterface.bulkUpdate(aiConfigTable, {
        globalWorkflow: JSON.stringify(buildDefaultGlobalWorkflow(taskDefinitions)),
      }, { id: config.id });
    }

    const existingMainWorkflows = await queryInterface.select(null, "AiMainWorkflows", {
      attributes: ["id", "aiSessionConfigId"],
    });
    const mainByConfig = new Map((existingMainWorkflows || []).map((workflow) => [String(workflow.aiSessionConfigId), workflow]));
    for (const config of configs || []) {
      if (mainByConfig.has(String(config.id))) continue;
      const taskDefinitions = (permissionsByConfig.get(String(config.id)) || [])
        .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0))
        .map((permission) => ({
          id: permission.id,
          key: permission.key,
          name: permission.name,
          enabled: permission.enabled !== false && Number(permission.enabled) !== 0,
        }));
      let legacy = null;
      try { legacy = config.globalWorkflow ? JSON.parse(config.globalWorkflow) : null; } catch { legacy = null; }
      const definition = legacy
        ? migrateLegacyWorkflowDefinition(legacy, taskDefinitions)
        : buildDefaultMainWorkflow(taskDefinitions);
      const now = new Date();
      await queryInterface.bulkInsert("AiMainWorkflows", [{
        aiSessionConfigId: config.id,
        name: definition.name,
        version: definition.version,
        revision: 1,
        active: definition.active,
        viewport: JSON.stringify(definition.viewport || {}),
        createdAt: now,
        updatedAt: now,
      }]);
      const insertedWorkflows = await queryInterface.select(null, "AiMainWorkflows", {
        where: { aiSessionConfigId: config.id },
        attributes: ["id", "aiSessionConfigId"],
      });
      const workflow = insertedWorkflows?.[0];
      if (!workflow) throw new Error(`No se pudo crear el workflow principal para AiSessionConfig ${config.id}`);
      await queryInterface.bulkInsert("AiMainWorkflowNodes", definition.nodes.map((node) => ({
        aiMainWorkflowId: workflow.id,
        aiPermissionId: node.type === "agent"
          ? taskDefinitions.find((permission) => permission.key === node.config.agentKey)?.id || null
          : null,
        key: node.key,
        name: node.name,
        type: node.type,
        enabled: node.enabled !== false,
        positionX: node.positionX,
        positionY: node.positionY,
        config: JSON.stringify(node.config || {}),
        createdAt: now,
        updatedAt: now,
      })));
      const insertedNodes = await queryInterface.select(null, "AiMainWorkflowNodes", {
        where: { aiMainWorkflowId: workflow.id },
        attributes: ["id", "key"],
      });
      const nodeByKey = new Map((insertedNodes || []).map((node) => [node.key, node]));
      const edgeRows = definition.edges.map((edge, index) => ({
        aiMainWorkflowId: workflow.id,
        sourceNodeId: nodeByKey.get(edge.source)?.id,
        targetNodeId: nodeByKey.get(edge.target)?.id,
        sourceHandle: edge.sourceHandle || null,
        targetHandle: edge.targetHandle || null,
        label: edge.label || null,
        sortOrder: Number(edge.sortOrder ?? index),
        createdAt: now,
        updatedAt: now,
      })).filter((edge) => edge.sourceNodeId && edge.targetNodeId);
      if (edgeRows.length) await queryInterface.bulkInsert("AiMainWorkflowEdges", edgeRows);
    }
  }

  // Contacts imported by the HTTP connector are already customers. Keep any
  // stronger manual classification, but repair records created by older code
  // that left imported contacts in the generic `new` state.
  await queryInterface.bulkUpdate(
    "CrmContacts",
    { status: "customer" },
    { source: "http_import", status: "new" },
  );

  // A campaign can only remain `running` when this process owns its worker.
  // At startup any such row came from an interrupted process, so expose it as
  // paused and let the user resume only the still-queued recipients.
  await queryInterface.bulkUpdate(
    table,
    { status: "paused", lastError: "La ejecución fue interrumpida por un reinicio del servidor" },
    { status: "running" },
  );

  // Al arrancar no puede existir un worker anterior que siga procesando estas
  // ejecuciones. Terminalizarlas evita polling eterno y diferencia claramente
  // un reinicio de un fallo funcional del workflow.
  const interruptedAt = new Date();
  await queryInterface.bulkUpdate(
    nodeExecutionTable,
    {
      status: "error",
      error: "La ejecución fue interrumpida por un reinicio del servidor",
      finishedAt: interruptedAt,
    },
    { status: { [Op.in]: ["running", "waiting_delivery"] } },
  );
  await queryInterface.bulkUpdate(
    nodeExecutionTable,
    {
      status: "skipped",
      output: JSON.stringify({ reason: "No ejecutado por reinicio del servidor" }),
      finishedAt: interruptedAt,
      durationMs: 0,
    },
    { status: "waiting" },
  );
  await queryInterface.bulkUpdate(
    "AiWorkflowExecutions",
    {
      status: "error",
      currentNodeKey: null,
      error: "La ejecución fue interrumpida por un reinicio del servidor",
      finishedAt: interruptedAt,
    },
    { status: { [Op.in]: ["waiting", "running", "waiting_delivery"] } },
  );
};
