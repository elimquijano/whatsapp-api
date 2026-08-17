import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import aiCrmService from "./aiCrmService.js";

test("el subflujo HTTP entrega 2000 registros completos al nodo siguiente", async (t) => {
  const records = Array.from({ length: 2000 }, (_, id) => ({
    id,
    name: `Cliente ${id}`,
    phone: `519${String(id).padStart(7, "0")}`,
    address: `Dirección ${id}`,
  }));
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(records));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const previousAllowedHosts = process.env.HTTP_INTEGRATION_ALLOWED_HOSTS;
  process.env.HTTP_INTEGRATION_ALLOWED_HOSTS = "127.0.0.1";
  t.after(() => {
    if (previousAllowedHosts === undefined) delete process.env.HTTP_INTEGRATION_ALLOWED_HOSTS;
    else process.env.HTTP_INTEGRATION_ALLOWED_HOSTS = previousAllowedHosts;
  });

  const port = server.address().port;
  const permission = {
    key: "clientes",
    name: "Consultar clientes",
    stateSchema: {},
    nodes: [
      {
        key: "consulta",
        name: "HTTP clientes",
        type: "http_request",
        enabled: true,
        config: {
          method: "GET",
          url: `http://127.0.0.1:${port}/api/clients?per_page=-1`,
          timeoutMs: 30000,
          maxResponseMb: 25,
          responseMapping: { id: "id", name: "name", phone: "phone", address: "address" },
          outputFields: [
            { name: "ok", source: "ok" },
            { name: "status", source: "status" },
            { name: "body", source: "body" },
          ],
        },
      },
      {
        key: "contar",
        name: "Contar clientes",
        type: "script",
        enabled: true,
        config: {
          timeoutMs: 5000,
          code: "return { total: input.nodeInput.body.length, ultimo: input.nodeInput.body.at(-1) };",
        },
      },
    ],
    edges: [{ sourceNodeId: "consulta", targetNodeId: "contar" }],
  };
  const result = await aiCrmService.executeWorkflow({}, permission, {
    message: "consulta clientes",
    state: {},
    task: { key: permission.key, stateSchema: {} },
  }, {
    safeMode: true,
    trigger: "test",
    // Avoid database dependencies while exercising the real planner and node executor.
    traceContext: { traces: new Map() },
  });

  assert.equal(result.nodes.consulta.status, 200);
  assert.equal(result.nodes.consulta.body.length, 2000);
  assert.equal(result.nodes.consulta.responseMeta.itemCount, 2000);
  assert.ok(result.nodes.consulta.responseMeta.bytes > 100000);
  assert.equal(result.nodes.contar.total, 2000);
  assert.deepEqual(result.nodes.contar.ultimo, records.at(-1));
});
