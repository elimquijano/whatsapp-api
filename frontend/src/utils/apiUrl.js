const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();

export const API_BASE_URL = (() => {
  try {
    const parsed = new URL(configuredApiUrl || window.location.origin, window.location.origin);
    const basePath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${basePath === '/' ? '' : basePath}`;
  } catch (_) {
    return window.location.origin;
  }
})();

export const API_ORIGIN = API_BASE_URL;
export const API_HOST = new URL(API_BASE_URL).host;

export const apiUrl = (path = '') => {
  const suffix = String(path);
  if (!suffix) return API_BASE_URL;
  return `${API_BASE_URL}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
};
