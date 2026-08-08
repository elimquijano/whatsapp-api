import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channel = (userId, sessionId) => `crm:${userId}:${sessionId}`;

export const publishCrmUpdate = ({ userId, sessionId, contactId = null, reason = "messages" }) => {
  emitter.emit(channel(userId, sessionId), { contactId, reason, timestamp: Date.now() });
};

export const subscribeToCrmUpdates = ({ userId, sessionId }, listener) => {
  const eventName = channel(userId, sessionId);
  emitter.on(eventName, listener);
  return () => emitter.off(eventName, listener);
};
