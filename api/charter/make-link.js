import crypto from "crypto";
import { formatDocRenderError } from "./render.js";
import {
  createCharterValidationError,
  validateCharterPayload,
} from "./validate.js";
import { supportedFormats } from "./download.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.FILES_LINK_SECRET;
  if (!secret) {
    console.error("FILES_LINK_SECRET is not configured");
    return res.status(500).json({ error: "Link configuration unavailable" });
  }

  const body = normalizeRequestBody(req.body);
  if (!body) {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  const { charter, baseName, formats } = body;

  const { isValid, errors } = await validateCharterPayload(charter);
  if (!isValid) {
    const payload = formatDocRenderError(createCharterValidationError(errors));
    return res.status(400).json(payload);
  }

  const host = req.headers?.host;
  if (!host) {
    console.error("request host header missing");
    return res.status(500).json({ error: "Link configuration unavailable" });
  }

  const baseUrl = buildBaseUrl(req, host);
  const { expiresAt, expiresInSeconds } = calculateExpiry();

  const filenameBase = buildFilenameBase(baseName);
  const tokenPayload = {
    charter,
    filenameBase,
    exp: expiresAt,
  };

  const token = encodeBase64Url(JSON.stringify(tokenPayload));
  const requestedFormats = normalizeFormats(formats);
  const linkMap = {};

  for (const format of requestedFormats) {
    const signature = createSignature(format, token, secret);
    linkMap[format] = `${baseUrl}/api/charter/download?format=${format}&token=${token}&sig=${signature}`;
  }

  const payload = {
    links: linkMap,
    expiresAt,
    expiresInSeconds,
  };

  if (linkMap.docx) {
    payload.docx = linkMap.docx;
  }

  if (linkMap.pdf) {
    payload.pdf = linkMap.pdf;
  }

  return res.status(200).json(payload);
}

function buildBaseUrl(req, host) {
  const forwardedProto = req.headers?.["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" && forwardedProto.trim()
      ? forwardedProto.split(",")[0].trim()
      : "https";

  return `${protocol}://${host}`;
}

function calculateExpiry() {
  const FIFTEEN_MINUTES = 15 * 60;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + FIFTEEN_MINUTES;

  return {
    expiresAt,
    expiresInSeconds: FIFTEEN_MINUTES,
  };
}

function normalizeRequestBody(body) {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch (error) {
      console.error("failed to parse make-link request body", error);
      return null;
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  return null;
}

function buildFilenameBase(baseName) {
  const DEFAULT_NAME = "Project_Charter";
  if (typeof baseName !== "string") {
    return DEFAULT_NAME;
  }

  const trimmed = baseName.trim();
  if (!trimmed) {
    return DEFAULT_NAME;
  }

  const sanitized = sanitizeFilename(trimmed);
  return sanitized || DEFAULT_NAME;
}

function sanitizeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignature(format, token, secret) {
  return crypto.createHmac("sha256", secret).update(`${format}.${token}`).digest("hex");
}

function normalizeFormats(formats) {
  if (!Array.isArray(formats)) {
    return DEFAULT_FORMATS;
  }

  const requested = [];
  for (const value of formats) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || requested.includes(normalized)) {
      continue;
    }
    if (!supportedFormats.includes(normalized)) {
      continue;
    }
    requested.push(normalized);
  }

  return requested.length > 0 ? requested : DEFAULT_FORMATS;
}

const DEFAULT_FORMATS = ["docx", "pdf"];
