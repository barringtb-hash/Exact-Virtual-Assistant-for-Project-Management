import { Buffer } from "node:buffer";

function extractForwardedValue(value) {
  if (Array.isArray(value)) {
    return extractForwardedValue(value[0]);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

export function getBaseUrl(req) {
  if (!req || typeof req !== "object") {
    throw new Error("A request object is required to resolve the base URL.");
  }

  const headers = req.headers || {};
  const forwardedProto = extractForwardedValue(headers["x-forwarded-proto"]);
  const forwardedHost = extractForwardedValue(headers["x-forwarded-host"]);

  const host = forwardedHost || extractForwardedValue(headers.host);
  if (!host) {
    throw new Error("Unable to determine the request host from headers.");
  }

  const protocolCandidate =
    forwardedProto ||
    (typeof req.protocol === "string" && req.protocol) ||
    extractForwardedValue(headers["x-forwarded-proto"]);

  const protocol = protocolCandidate || "https";
  return `${protocol}://${host}`;
}

function normalizeJsonBody(body) {
  if (body == null) {
    return {};
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  throw new TypeError("Request payload must be a JSON object.");
}

async function readErrorPayload(response) {
  try {
    return await response.text();
  } catch (err) {
    return "";
  }
}

function createResponseError(method, url, response, bodyText) {
  const status = response.status;
  const statusText = response.statusText || "";
  const suffix = bodyText ? `: ${bodyText}` : "";
  const message = `${method.toUpperCase()} ${url} failed with status ${status}${
    statusText ? ` ${statusText}` : ""
  }${suffix}`;
  const error = new Error(message);
  error.status = status;
  error.statusText = statusText;
  error.body = bodyText;
  return error;
}

export async function postJson(url, body, fetchImpl = fetch) {
  const payload = normalizeJsonBody(body);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await readErrorPayload(response);
    throw createResponseError("POST", url, response, text);
  }

  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Expected JSON response from ${url} but received: ${text || "<empty>"}`
    );
  }
}

function resolveRequestBody(args) {
  if (args == null || typeof args !== "object") {
    return {};
  }
  if ("body" in args && args.body !== undefined) {
    return args.body;
  }
  if ("payload" in args && args.payload !== undefined) {
    return args.payload;
  }
  if ("charter" in args && args.charter !== undefined) {
    return { charter: args.charter };
  }
  return {};
}

async function executeCharterExtract(args) {
  const { req, fetch: fetchImpl = fetch } = args;
  const baseUrl = getBaseUrl(req);
  const url = new URL("/api/charter/extract", baseUrl).toString();
  const body = resolveRequestBody(args);
  return postJson(url, body, fetchImpl);
}

async function executeCharterValidate(args) {
  const { req, fetch: fetchImpl = fetch } = args;
  const baseUrl = getBaseUrl(req);
  const url = new URL("/api/charter/validate", baseUrl).toString();
  const body = resolveRequestBody(args);
  return postJson(url, body, fetchImpl);
}

async function executeCharterRender(args) {
  const { req, fetch: fetchImpl = fetch } = args;
  const baseUrl = getBaseUrl(req);
  const url = new URL("/api/charter/render", baseUrl).toString();
  const body = normalizeJsonBody(resolveRequestBody(args));
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await readErrorPayload(response);
    throw createResponseError("POST", url, response, text);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mime =
    response.headers?.get?.("content-type") ||
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const disposition = response.headers?.get?.("content-disposition") || "";
  let filename = "project_charter.docx";
  const filenameMatch =
    disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (filenameMatch) {
    const encoded = filenameMatch[1] || filenameMatch[2];
    try {
      filename = decodeURIComponent(encoded);
    } catch (err) {
      filename = encoded;
    }
  }

  return { buffer, filename, mime };
}

export const ACTIONS = new Map([
  ["charter.extract", executeCharterExtract],
  ["charter.validate", executeCharterValidate],
  ["charter.render", executeCharterRender],
]);

export default ACTIONS;
