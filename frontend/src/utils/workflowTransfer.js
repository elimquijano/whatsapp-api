export const WORKFLOW_BUNDLE_FORMAT = 'whatsapp-api/workflow-bundle';
export const WORKFLOW_BUNDLE_VERSION = 2;

const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
const PORTABLE_CONFIG_FIELDS = [
  'autoReplyEnabled', 'outputMode', 'agentName', 'role', 'context', 'systemPrompt',
  'intentionPrompt', 'orchestrationPrompt', 'responseGuardPrompt', 'ignoreUnrelatedMessages',
  'responseValidationEnabled', 'responseValidationFailureMode', 'aiProvider', 'aiApiUrl',
  'aiModel', 'temperature', 'maxHistory',
];

const withoutDatabaseIdentity = (value) => {
  if (Array.isArray(value)) return value.map(withoutDatabaseIdentity);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['id', 'createdAt', 'updatedAt', 'aiPermissionId', 'aiSessionConfigId', 'aiMainWorkflowId', 'sourceNodeId', 'targetNodeId'].includes(key))
    .map(([key, item]) => [key, withoutDatabaseIdentity(item)]));
};

const portablePermission = (permission = {}) => {
  const clean = withoutDatabaseIdentity(permission);
  return {
    ...clean,
    nodes: (clean.nodes || []).map(({ credentials, hasCredentials, ...node }) => ({
      ...node,
      // Las credenciales nunca forman parte de un archivo portable.
      credentials: {},
    })),
    edges: clean.edges || [],
  };
};

export const createWorkflowBundle = (config = {}, sourceSessionId = '') => ({
  format: WORKFLOW_BUNDLE_FORMAT,
  version: WORKFLOW_BUNDLE_VERSION,
  exportedAt: new Date().toISOString(),
  source: sourceSessionId ? { sessionId: sourceSessionId } : {},
  // La configuración del Cerebro viaja junto a los flujos para que el paquete
  // sea reproducible. La clave API se excluye deliberadamente.
  config: Object.fromEntries(PORTABLE_CONFIG_FIELDS
    .filter((field) => config[field] !== undefined)
    .map((field) => [field, withoutDatabaseIdentity(config[field])])),
  workflow: {
    permissions: (config.permissions || []).map(portablePermission),
    mainWorkflow: withoutDatabaseIdentity(config.mainWorkflow || {}),
  },
});

export const parseWorkflowBundle = (contents) => {
  if (typeof contents !== 'string' || !contents.trim()) throw new Error('El archivo está vacío');
  if (new TextEncoder().encode(contents).length > MAX_BUNDLE_BYTES) throw new Error('El archivo supera el límite de 5 MB');

  let bundle;
  try { bundle = JSON.parse(contents); } catch { throw new Error('El archivo no contiene JSON válido'); }
  if (bundle?.format !== WORKFLOW_BUNDLE_FORMAT) throw new Error('El archivo no es un paquete de workflows compatible');
  if (![1, WORKFLOW_BUNDLE_VERSION].includes(bundle.version)) throw new Error(`La versión ${bundle.version ?? 'desconocida'} del paquete no es compatible`);
  if (!Array.isArray(bundle.workflow?.permissions) || !bundle.workflow?.mainWorkflow || typeof bundle.workflow.mainWorkflow !== 'object') {
    throw new Error('El paquete no contiene agentes y workflow principal válidos');
  }

  const permissions = bundle.workflow.permissions.map(portablePermission);
  const keys = permissions.map((permission) => String(permission.key || '').trim());
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) throw new Error('Los agentes importados necesitan claves únicas');
  return {
    config: bundle.version >= 2 && bundle.config && typeof bundle.config === 'object'
      ? Object.fromEntries(PORTABLE_CONFIG_FIELDS.filter((field) => bundle.config[field] !== undefined).map((field) => [field, bundle.config[field]]))
      : {},
    permissions,
    mainWorkflow: withoutDatabaseIdentity(bundle.workflow.mainWorkflow),
    sourceSessionId: String(bundle.source?.sessionId || ''),
  };
};
