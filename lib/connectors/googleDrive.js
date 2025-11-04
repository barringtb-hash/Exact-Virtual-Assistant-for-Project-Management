const baseUrlCandidates = [
  process.env.GOOGLE_DRIVE_CONNECTOR_BASE_URL,
  process.env.CONNECTORS_BASE_URL,
  process.env.API_TOOL_BASE_URL,
];

const authTokenCandidates = [
  process.env.GOOGLE_DRIVE_CONNECTOR_TOKEN,
  process.env.CONNECTORS_API_KEY,
  process.env.API_TOOL_API_KEY,
  process.env.API_TOOL_TOKEN,
  process.env.API_TOOL_SECRET,
];

const resolvedBaseUrl = baseUrlCandidates.find((value) =>
  typeof value === "string" && value.trim()
);

const resolvedAuthToken = authTokenCandidates.find((value) =>
  typeof value === "string" && value.trim()
);

const authHeaderName =
  process.env.GOOGLE_DRIVE_CONNECTOR_AUTH_HEADER || "Authorization";

const authScheme = process.env.GOOGLE_DRIVE_CONNECTOR_AUTH_SCHEME || "Bearer";

function requireBaseUrl() {
  if (!resolvedBaseUrl) {
    throw new Error(
      "Google Drive connector base URL is not configured. Set GOOGLE_DRIVE_CONNECTOR_BASE_URL or CONNECTORS_BASE_URL."
    );
  }
  return resolvedBaseUrl;
}

function buildHeaders(additional = {}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (resolvedAuthToken) {
    const headerValue =
      authScheme && authScheme.toLowerCase() !== "none"
        ? `${authScheme} ${resolvedAuthToken}`
        : resolvedAuthToken;
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
