export const normalizeSessionId = (value) => String(value || '').trim();

export const sessionIdFromRequest = (req, { allowLegacyBody = false } = {}) => {
  const pathSessionId = normalizeSessionId(req?.params?.sessionId);
  if (pathSessionId) return pathSessionId;
  if (!allowLegacyBody) return '';
  return normalizeSessionId(req?.body?.account_id || req?.body?.sessionId);
};

export const sessionOwnershipWhere = (req) => {
  const userId = req?.user?.id;
  const sessionId = sessionIdFromRequest(req);
  return {
    userId,
    ...(sessionId ? { sessionId } : {}),
  };
};
