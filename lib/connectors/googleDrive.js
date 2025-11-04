function resolveBaseUrl() {
  const candidates = [
    process.env.GOOGLE_DRIVE_CONNECTOR_BASE_URL,
    process.env.CONNECTORS_BASE_URL,
    process.env.API_TOOL_BASE_URL,
  ];
  const match = candidates.find((value) => typeof value === "string" && value.trim());
  if (!match) {
    throw new Error(
      "Google Drive connector base URL is not configured. Set GOOGLE_DRIVE_CONNECTOR_BASE_URL or CONNECTORS_BASE_URL."
    );
  }
  return match.trim();
}

function resolveAuthToken() {
  const candidates = [
    process.env.GOOGLE_DRIVE_CONNECTOR_TOKEN,
    process.env.CONNECTORS_API_KEY,
    process.env.API_TOOL_API_KEY,
    process.env.API_TOOL_TOKEN,
    process.env.API_TOOL_SECRET,
  ];
  const match = candidates.find((value) => typeof value === "string" && value.trim());
  return match ? match.trim() : null;
}

function resolveAuthHeaderName() {
  const header = process.env.GOOGLE_DRIVE_CONNECTOR_AUTH_HEADER;
  return typeof header === "string" && header.trim() ? header.trim() : "Authorization";
}

function resolveAuthScheme() {
  const scheme = process.env.GOOGLE_DRIVE_CONNECTOR_AUTH_SCHEME;
  return typeof scheme === "string" && scheme.trim() ? scheme.trim() : "Bearer";
}

function requireBaseUrl() {
  return resolveBaseUrl();
}

function buildHeaders(additional = {}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const authToken = resolveAuthToken();
  if (authToken) {
    const authScheme = resolveAuthScheme();
    const authHeaderName = resolveAuthHeaderName();
    const headerValue =
      authScheme && authScheme.toLowerCase() !== "none"
        ? `${authScheme} ${authToken}`
        : authToken;
    headers.set(authHeaderName, headerValue);
  }
  for (const [key, value] of Object.entries(additional)) {
    if (value != null) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

async function request(path, { method = "POST", body, headers } = {}) {
  const baseUrl = requireBaseUrl();
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const target = new URL(path, normalizedBase);
  const response = await fetch(target, {
    method,
    headers: buildHeaders(headers),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `Google Drive connector request failed with ${response.status}: ${text || response.statusText}`
    );
    error.status = response.status;
    error.body = text;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

export function copyDocument(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("copyDocument options must be an object");
  }
  return request("/Google Drive/Documents/copy_document", {
    method: "POST",
    body: options,
  });
}

export function fetchDocument(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("fetchDocument options must be an object");
  }
  return request("/Google Drive/Documents/fetch", {
    method: "POST",
    body: options,
  });
}

export function shareDocument(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("shareDocument options must be an object");
  }
  return request("/Google Drive/Documents/share_document", {
    method: "POST",
    body: options,
  });
}

export default {
  copyDocument,
  fetchDocument,
  shareDocument,
};
