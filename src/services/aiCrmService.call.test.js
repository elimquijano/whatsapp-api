import test from "node:test";
import assert from "node:assert/strict";
import aiCrmService, { callNotificationDetails, ensureLastUserMessage, hasSendableWorkflowContent, retrieveRelevantContext, selectRelevantHistory, simpleTurnAnalysis } from "./aiCrmService.js";

test("convierte una llamada sin respuesta en notificación perdida", () => {
  assert.deepEqual(callNotificationDetails({ status: "timeout", isVideo: false }), {
    type: "call",
    content: "[Llamada perdida]",
    direction: "incoming",
    role: "user",
  });
});

test("distingue llamadas recibidas, videollamadas y llamadas realizadas", () => {
  assert.equal(callNotificationDetails({ status: "accept" }).content, "[Llamada recibida]");
  assert.equal(callNotificationDetails({ status: "reject", isVideo: true }).content, "[Videollamada perdida]");
  assert.equal(callNotificationDetails({ status: "offer" }, { fromMe: true }).content, "[Llamada realizada]");
  assert.deepEqual(callNotificationDetails({ status: "reject", isVideo: true }, { fromMe: true }), {
    type: "call",
    content: "[Videollamada no contestada]",
    direction: "outgoing",
    role: "assistant",
  });
});

test("ignora estados intermedios para no duplicar la conversación", () => {
  assert.equal(callNotificationDetails({ status: "ringing" }), null);
  assert.equal(callNotificationDetails({ status: "offer" }), null);
});

test("registra terminate como perdida cuando nunca llegó accept", () => {
  assert.equal(callNotificationDetails({ status: "terminate" }).content, "[Llamada perdida]");
  assert.equal(callNotificationDetails({ status: "terminate" }, { fromMe: true }).content, "[Llamada no contestada]");
});

test("usa ruta rápida local para saludos sin perder inteligencia en consultas", () => {
  assert.equal(simpleTurnAnalysis([{ role: "user", content: "hola" }], {}).localFastPath, true);
  assert.equal(simpleTurnAnalysis([{ role: "user", content: "¿Cuál es el precio?" }], {}), null);
  assert.equal(simpleTurnAnalysis([{ role: "user", content: "hola" }], { activeTaskKey: "venta" }), null);
});

test("recupera únicamente memoria relacionada dentro del presupuesto", () => {
  const context = "Vendemos café colombiano.\n\nLas bicicletas tienen garantía de dos años.\n\nLa oficina abre los lunes.";
  const selected = retrieveRelevantContext(context, "garantía de bicicletas", 80);
  assert.match(selected, /bicicletas/i);
  assert.doesNotMatch(selected, /café/i);
  assert.ok(selected.length <= 80);
});

test("combina continuidad reciente con mensajes históricos relacionados", () => {
  const history = [
    { role: "user", content: "Necesito una bicicleta urbana" },
    { role: "assistant", content: "Tenemos varios productos" },
    { role: "user", content: "Hablemos de otra cosa" },
    { role: "assistant", content: "Claro, dime" },
    { role: "user", content: "¿Qué garantía tiene la bicicleta?" },
  ];
  const selected = selectRelevantHistory(history, 500, 2);
  assert.equal(selected.at(-1).content, history.at(-1).content);
  assert.ok(selected.some((item) => item.content.includes("bicicleta urbana")));
});

test("respeta la cantidad configurable de mensajes recientes", () => {
  const contents = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
  const history = contents.map((content, index) => ({ role: index % 2 ? "assistant" : "user", content }));
  const twoRecent = selectRelevantHistory(history, 2000, 2);
  const fiveRecent = selectRelevantHistory(history, 2000, 5);
  assert.deepEqual(twoRecent.map(({ content }) => content), contents.slice(-2));
  assert.deepEqual(fiveRecent.map(({ content }) => content), contents.slice(-5));
});

test("garantiza que las solicitudes compatibles con OpenAI terminen con un mensaje de usuario", () => {
  const alreadyValid = [{ role: "user", content: "hola" }];
  assert.deepEqual(ensureLastUserMessage(alreadyValid), alreadyValid);
  assert.equal(ensureLastUserMessage([]).at(-1).role, "user");
  assert.equal(ensureLastUserMessage([{ role: "assistant", content: "respuesta previa" }]).at(-1).role, "user");
});

test("la entrada de una tarea no recibe el historial reservado al orquestador", async () => {
  const result = await aiCrmService.executeNode({}, { type: "agent_input", config: {} }, {
    message: "Necesito soporte",
    history: [{ role: "user", content: "dato anterior" }],
    analysis: { topic: "soporte" },
    arguments: { ticket: "A-1" },
  });
  assert.equal(result.history, undefined);
  assert.deepEqual(result.analysis, { topic: "soporte" });
  assert.deepEqual(result.arguments, { ticket: "A-1" });
});

test("una salida vacía significa no contestar y no generar un fallback", () => {
  assert.equal(hasSendableWorkflowContent(""), false);
  assert.equal(hasSendableWorkflowContent("   \n"), false);
  assert.equal(hasSendableWorkflowContent(null), false);
  assert.equal(hasSendableWorkflowContent("Respuesta real"), true);
});
