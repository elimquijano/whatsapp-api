import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowBundle, parseWorkflowBundle, WORKFLOW_BUNDLE_FORMAT } from './workflowTransfer.js';

test('exports portable workflows without database ids or credentials', () => {
  const bundle = createWorkflowBundle({
    permissions: [{ id: 4, key: 'ventas', nodes: [{ id: 8, key: 'crm', credentials: { apiToken: 'secret' } }], edges: [{ id: 9, source: 'a', target: 'b' }] }],
    mainWorkflow: { id: 10, nodes: [{ id: 11, key: 'agent_ventas' }], edges: [] },
  }, 'sesion-a');

  assert.equal(bundle.format, WORKFLOW_BUNDLE_FORMAT);
  assert.equal(bundle.source.sessionId, 'sesion-a');
  assert.equal(bundle.workflow.permissions[0].id, undefined);
  assert.equal(bundle.workflow.permissions[0].nodes[0].id, undefined);
  assert.deepEqual(bundle.workflow.permissions[0].nodes[0].credentials, {});
  assert.equal(bundle.workflow.mainWorkflow.id, undefined);
});

test('imports a bundle as new records and rejects invalid files', () => {
  const bundle = createWorkflowBundle({
    permissions: [{ key: 'soporte', nodes: [], edges: [] }],
    mainWorkflow: { nodes: [], edges: [] },
  });
  assert.equal(parseWorkflowBundle(JSON.stringify(bundle)).permissions[0].key, 'soporte');
  assert.throws(() => parseWorkflowBundle('{}'), /no es un paquete/);
  assert.throws(() => parseWorkflowBundle('{'), /JSON válido/);
});
