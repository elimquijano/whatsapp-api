import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class SafeHttpError extends Error {
  constructor(message, { code = "SAFE_HTTP_ERROR", statusCode = 400 } = {}) {
    super(message);
    this.name = "SafeHttpError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const safeHttpError = (message, code, statusCode = 400) => (
  new SafeHttpError(message, { code, statusCode })
);

const normalizeHostname = (hostname) => String(hostname || "")
  .trim()
  .toLowerCase()
  .replace(/\.$/, "")
  .replace(/^\[|\]$/g, "");

export const getAllowedHttpIntegrationHosts = () => new Set(
  String(process.env.HTTP_INTEGRATION_ALLOWED_HOSTS || "")
    .split(/[\s,]+/)
    .map(normalizeHostname)
    .filter(Boolean),
);

const privateNetworksAllowed = () => (
  String(process.env.HTTP_INTEGRATION_ALLOW_PRIVATE || "").trim().toLowerCase() === "true"
);

const ipv4ToInteger = (address) => {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((value, part) => ((value * 256) + part) >>> 0, 0);
};

const ipv4InCidr = (address, base, prefix) => {
  const value = ipv4ToInteger(address);
  const network = ipv4ToInteger(base);
  if (value === null || network === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
};

const BLOCKED_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const expandIpv6 = (input) => {
  let value = String(input).toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = ipv4ToInteger(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    value = `${value.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
};

const ipv6ToBigInt = (address) => {
  const parts = expandIpv6(address);
  if (!parts) return null;
  return parts.reduce((value, part) => (value << 16n) | BigInt(part), 0n);
};

const ipv6InCidr = (address, base, prefix) => {
  const value = ipv6ToBigInt(address);
  const network = ipv6ToBigInt(base);
  if (value === null || network === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (network >> shift);
};

const mappedIpv4 = (address) => {
  if (!ipv6InCidr(address, "::ffff:0:0", 96)) return null;
  const value = ipv6ToBigInt(address);
  const integer = Number(value & 0xffffffffn);
  return [24, 16, 8, 0].map((shift) => (integer >>> shift) & 255).join(".");
};

export const isBlockedIpAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED_IPV4_RANGES.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
  if (family !== 6) return true;

  const mapped = mappedIpv4(address);
  if (mapped) return isBlockedIpAddress(mapped);

  // Only globally routable unicast IPv6 is accepted. Explicit exclusions cover
  // documentation and transition ranges which can encapsulate private IPv4.
  if (!ipv6InCidr(address, "2000::", 3)) return true;
  return [
    ["2001::", 32],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
  ].some(([base, prefix]) => ipv6InCidr(address, base, prefix));
};

export const parseSafeHttpUrl = (input) => {
  let parsed;
  try {
    parsed = new URL(String(input || "").trim());
  } catch {
    throw safeHttpError("La URL de integración no es válida", "INVALID_URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw safeHttpError("La URL de integración debe usar HTTP o HTTPS", "INVALID_PROTOCOL");
  }
  if (parsed.username || parsed.password) {
    throw safeHttpError("La URL de integración no puede incluir credenciales", "URL_CREDENTIALS_FORBIDDEN");
  }
  return parsed;
};

const awaitBeforeDeadline = (promise, deadline) => new Promise((resolve, reject) => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    reject(safeHttpError("La integración excedió el tiempo máximo", "REQUEST_TIMEOUT", 504));
    return;
  }
  const timer = setTimeout(() => {
    reject(safeHttpError("La integración excedió el tiempo máximo", "REQUEST_TIMEOUT", 504));
  }, remaining);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

const resolveSafeAddress = async (url, options = {}, deadline = Date.now() + DEFAULT_TIMEOUT_MS) => {
  const hostname = normalizeHostname(url.hostname);
  const configuredAllowedHosts = options.allowedHosts || getAllowedHttpIntegrationHosts();
  const allowedHosts = configuredAllowedHosts instanceof Set
    ? new Set([...configuredAllowedHosts].map(normalizeHostname))
    : new Set(Array.from(configuredAllowedHosts || [], normalizeHostname));
  const allowPrivate = options.allowPrivate ?? privateNetworksAllowed();
  const explicitlyAllowed = allowedHosts.has(hostname);
  let addresses;

  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      addresses = await awaitBeforeDeadline(
        (options.lookup || dns.lookup)(hostname, { all: true, verbatim: true }),
        deadline,
      );
    } catch (error) {
      if (error instanceof SafeHttpError) throw error;
      throw safeHttpError("No se pudo resolver el host de la integración", "DNS_RESOLUTION_FAILED", 502);
    }
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw safeHttpError("El host de la integración no tiene direcciones disponibles", "DNS_EMPTY", 502);
  }
  if (!allowPrivate && !explicitlyAllowed && addresses.some(({ address }) => isBlockedIpAddress(address))) {
    throw safeHttpError("La URL apunta a una red local, privada o reservada y fue bloqueada", "PRIVATE_ADDRESS_BLOCKED");
  }

  const selected = addresses.find(({ family }) => family === 4) || addresses[0];
  return { hostname, address: selected.address, family: selected.family || net.isIP(selected.address) };
};

const normalizeHeaders = (headers = {}) => {
  const normalized = {};
  const entries = typeof headers.entries === "function" ? [...headers.entries()] : Object.entries(headers || {});
  for (const [name, value] of entries) {
    if (value === undefined || value === null) continue;
    normalized[String(name).toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  delete normalized.host;
  delete normalized.connection;
  delete normalized["transfer-encoding"];
  delete normalized["content-length"];
  // Avoid compressed-response size ambiguity and decompression bombs.
  normalized["accept-encoding"] = "identity";
  return normalized;
};

const responseHeaders = (headers) => {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    normalized[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  return normalized;
};

const requestOnce = async (url, options, deadline) => {
  const { address, family, hostname } = await resolveSafeAddress(url, options, deadline);
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw safeHttpError("La integración excedió el tiempo máximo", "REQUEST_TIMEOUT", 504);

  const body = options.body === undefined || options.body === null
    ? null
    : Buffer.isBuffer(options.body)
      ? options.body
      : Buffer.from(options.body);
  const headers = normalizeHeaders(options.headers);
  headers.host = url.host;
  if (body) headers["content-length"] = String(body.length);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof SafeHttpError
        ? error
        : safeHttpError("No se pudo conectar con el sistema externo", "NETWORK_ERROR", 502));
    };
    const request = transport.request({
      protocol: url.protocol,
      hostname: address,
      family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      headers,
      servername: hostname,
      agent: false,
    }, (response) => {
      if (settled) return;
      settled = true;
      resolve({ request, response });
    });
    request.setTimeout(remaining, () => {
      request.destroy(safeHttpError("La integración excedió el tiempo máximo", "REQUEST_TIMEOUT", 504));
    });
    request.once("error", finishError);
    if (body) request.end(body);
    else request.end();
  });
};

const readLimitedBody = (response, maxBytes, deadline) => new Promise((resolve, reject) => {
  const declaredLength = Number(response.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    response.destroy();
    reject(safeHttpError(`La respuesta supera el límite de ${Math.ceil(maxBytes / 1024 / 1024)} MB`, "RESPONSE_TOO_LARGE", 413));
    return;
  }
  const contentEncoding = String(response.headers["content-encoding"] || "identity").toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    response.destroy();
    reject(safeHttpError("El sistema externo ignoró la solicitud de respuesta sin compresión", "UNSUPPORTED_CONTENT_ENCODING", 502));
    return;
  }

  const chunks = [];
  let total = 0;
  const timer = setTimeout(() => {
    response.destroy(safeHttpError("La integración excedió el tiempo máximo", "REQUEST_TIMEOUT", 504));
  }, Math.max(1, deadline - Date.now()));
  response.on("data", (chunk) => {
    total += chunk.length;
    if (total > maxBytes) {
      response.destroy(safeHttpError(`La respuesta supera el límite de ${Math.ceil(maxBytes / 1024 / 1024)} MB`, "RESPONSE_TOO_LARGE", 413));
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  response.once("end", () => {
    clearTimeout(timer);
    resolve(Buffer.concat(chunks, total));
  });
  response.once("error", (error) => {
    clearTimeout(timer);
    reject(error instanceof SafeHttpError
      ? error
      : safeHttpError("La respuesta del sistema externo se interrumpió", "RESPONSE_STREAM_ERROR", 502));
  });
});

const nextRedirectRequest = (statusCode, method, headers, body, currentUrl, targetUrl) => {
  let nextMethod = method;
  let nextBody = body;
  const nextHeaders = { ...headers };
  if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && method === "POST")) {
    nextMethod = method === "HEAD" ? "HEAD" : "GET";
    nextBody = undefined;
    delete nextHeaders["content-type"];
  }
  if (currentUrl.origin !== targetUrl.origin) {
    // Integration headers are fully user-defined, so any of them may contain a
    // secret even when it is not named Authorization or X-API-Key.
    for (const header of Object.keys(nextHeaders)) delete nextHeaders[header];
    if (nextBody !== undefined && nextBody !== null) {
      throw safeHttpError(
        "La integración intentó redirigir datos a otro origen",
        "CROSS_ORIGIN_BODY_REDIRECT",
        502,
      );
    }
  }
  return { method: nextMethod, headers: nextHeaders, body: nextBody };
};

export const safeFetchBuffer = async (input, options = {}) => {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const maxBytes = Math.max(1, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
  const maxRedirects = Math.max(0, Number.isFinite(Number(options.maxRedirects)) ? Number(options.maxRedirects) : DEFAULT_MAX_REDIRECTS);
  const deadline = Date.now() + timeoutMs;
  let url = parseSafeHttpUrl(input);
  let requestOptions = {
    method: String(options.method || "GET").toUpperCase(),
    headers: normalizeHeaders(options.headers),
    body: options.body,
    allowedHosts: options.allowedHosts,
    allowPrivate: options.allowPrivate,
    lookup: options.lookup,
  };

  for (let redirectCount = 0; ; redirectCount += 1) {
    const { response } = await requestOnce(url, requestOptions, deadline);
    const status = Number(response.statusCode || 0);
    const headers = responseHeaders(response.headers);
    if (REDIRECT_STATUSES.has(status) && headers.location) {
      response.destroy();
      if (redirectCount >= maxRedirects) {
        throw safeHttpError(`La integración superó el máximo de ${maxRedirects} redirecciones`, "TOO_MANY_REDIRECTS", 502);
      }
      let target;
      try { target = parseSafeHttpUrl(new URL(headers.location, url).href); }
      catch (error) {
        throw safeHttpError("La redirección del sistema externo no es válida", "INVALID_REDIRECT", 502);
      }
      requestOptions = {
        ...requestOptions,
        ...nextRedirectRequest(status, requestOptions.method, requestOptions.headers, requestOptions.body, url, target),
      };
      url = target;
      continue;
    }

    const buffer = await readLimitedBody(response, maxBytes, deadline);
    return {
      url: url.href,
      status,
      statusText: response.statusMessage || "",
      ok: status >= 200 && status < 300,
      headers,
      buffer,
      text: () => buffer.toString("utf8"),
    };
  }
};

export const safeFetchJson = async (input, options = {}) => {
  const response = await safeFetchBuffer(input, options);
  const text = response.text();
  if (!response.ok) {
    let details = "";
    try {
      const payload = JSON.parse(text);
      details = String(payload.error || payload.message || "").slice(0, 300);
    } catch {
      details = text.trim().slice(0, 300);
    }
    throw safeHttpError(
      `El sistema externo respondió HTTP ${response.status}${details ? `: ${details}` : ""}`,
      "UPSTREAM_HTTP_ERROR",
      502,
    );
  }
  try {
    return { response, payload: JSON.parse(text) };
  } catch {
    throw safeHttpError("El sistema externo no devolvió un JSON válido", "INVALID_JSON", 502);
  }
};
