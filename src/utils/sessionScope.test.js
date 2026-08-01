import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionIdFromRequest, sessionOwnershipWhere } from './sessionScope.js';

test('canonical session scope always comes from the URL', () => {
  const req = {
    user: { id: 7 },
    params: { sessionId: 'ventas' },
    body: { sessionId: 'soporte', account_id: 'otro' },
  };
  assert.equal(sessionIdFromRequest(req, { allowLegacyBody: true }), 'ventas');
  assert.deepEqual(sessionOwnershipWhere(req), { userId: 7, sessionId: 'ventas' });
});

test('canonical endpoints never infer a session from the request body', () => {
  const req = { params: {}, body: { account_id: 'ventas' } };
  assert.equal(sessionIdFromRequest(req), '');
  assert.equal(sessionIdFromRequest(req, { allowLegacyBody: true }), 'ventas');
});
