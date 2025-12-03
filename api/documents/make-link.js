import crypto from "crypto";

import { MissingDocAssetError, UnsupportedDocTypeError } from "../../lib/doc/errors.js";
import { formatDocRenderError } from "../../lib/doc/render.js";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { resolveDocType } from "../../lib/doc/utils.js";
import {
  createDocValidationError,
  ensureValidationAssets,
  validateDocument,
} from "../../lib/doc/validation.js";
import { getFormatHandlersForDocType } from "./download.js";
import { normalizeDocumentDetection } from "../../lib/doc/audit.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
  memory: 1024,
};

export async function handleDocMakeLink(req, res, options = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.FILES_LINK_SECRET;
  if (!secret) {
    console.error("FILES_LINK_SECRET is not configured");
    return res.status(500).json({ error: "Link configuration unavailable" });
  }

  try {
    const body = normalizeRequestBody(req.body);
    if (!body) {
      return res
        .status(400)
        .json({ error: "Request body must be a JSON object" });
    }

    const docType = resolveDocType(req.query?.docType, body?.docType);
    const config = getDocTypeConfig(docType);
    if (!config) {
      throw new UnsupportedDocTypeError(docType);
    }

    await ensureValidationAssets(docType, config);

    const payload = extractDocumentPayload(body);
    const normalizedDetection = normalizeDocumentDetection(
      body?.docTypeDetection ?? body?.detectedDocType ?? null
    );
    const { isValid, errors, normalized } = await validateDocument(
      docType,
      config,
      payload
    );

    if (!isValid) {
      const validationError = createDocValidationError(
        docType,
        config,
        errors,
        normalized
      );
      const responsePayload = formatDocRenderError(validationError);
      return res.status(400).json(responsePayload);
    }

    const host = req.headers?.host || req.headers?.["x-forwarded-host"];
    if (!host) {
      console.error("request host header missing", {
        headers: req.headers ? Object.keys(req.headers) : "no headers",
      });
      return res.status(500).json({ error: "Link configuration unavailable" });
    }

    const baseUrl = buildBaseUrl(req, host);
    const downloadPath = resolveDownloadPath(req.url, options?.downloadPath);
    const { expiresAt, expiresInSeconds } = calculateExpiry();

    const filenameBase = buildFilenameBase(body?.baseName, config);
    const tokenPayload = {
      docType: config.type,
      document: normalized,
      exp: expiresAt,
      filenameBase,
    };

    if (typeof config.type === "string" && config.type) {
      tokenPayload[config.type] = normalized;
    }

    if (normalizedDetection) {
      tokenPayload.docTypeDetection = normalizedDetection;
    }

    const token = encodeBase64Url(JSON.stringify(tokenPayload));

    const formatHandlers = getFormatHandlersForDocType(config.type);
    const availableFormats = Object.keys(formatHandlers);
    const requestedFormats = normalizeFormats(body?.formats, availableFormats);

    const linkMap = {};
    for (const format of requestedFormats) {
      const signature = createSignature(format, token, secret);
      linkMap[format] = `${baseUrl}${downloadPath}?format=${format}&token=${token}&sig=${signature}`;
    }

    const response = {
      links: linkMap,
      expiresAt,
      expiresInSeconds,
      docType: config.type,
    };

    if (linkMap.docx) {
      response.docx = linkMap.docx;
    }

    if (linkMap.pdf) {
      response.pdf = linkMap.pdf;
    }

    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof UnsupportedDocTypeError) {
      return res.status(400).json({
        error: `Links are not available for "${error.docType}" documents.`,
      });
    }

    if (error instanceof MissingDocAssetError || error?.name === "DocAssetLoadError") {
      console.error("doc make-link asset error", error);
      return res.status(error.statusCode || 500).json({
        error: error.message,
        docType: error.docType,
        assetType: error.assetType,
      });
    }

    console.error("doc make-link failed", error);
    return res.status(500).json({ error: "Failed to prepare download links" });
  }
}

export default async function handler(req, res) {
  return handleDocMakeLink(req, res);
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

function extractDocumentPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const documentCandidate = body.document;
  if (
    documentCandidate &&
    typeof documentCandidate === "object" &&
    !Array.isArray(documentCandidate)
  ) {
    return documentCandidate;
  }

  const charterCandidate = body.charter;
  if (
    charterCandidate &&
    typeof charterCandidate === "object" &&
    !Array.isArray(charterCandidate)
  ) {
    return charterCandidate;
  }

  return body;
}

function buildBaseUrl(req, host) {
  const forwardedProto = req.headers?.["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" && forwardedProto.trim()
      ? forwardedProto.split(",")[0].trim()
      : "https";

  return `${protocol}://${host}`;
}

function resolveDownloadPath(url, overridePath) {
  if (typeof overridePath === "string" && overridePath.trim()) {
    return sanitizePath(overridePath.trim());
  }

  if (typeof url === "string" && url.trim()) {
    const [pathname] = url.split("?");
    if (pathname.endsWith("/make-link")) {
      const guessed = pathname.replace(/\/make-link$/u, "/download");
      return sanitizePath(guessed);
    }
  }

  return "/api/documents/download";
}

function sanitizePath(pathname) {
  if (!pathname.startsWith("/")) {
    return `/${pathname}`;
  }
  return pathname;
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

function buildFilenameBase(baseName, config) {
  if (typeof baseName === "string") {
    const trimmed = baseName.trim();
    if (trimmed) {
      const sanitized = sanitizeFilename(trimmed);
      if (sanitized) {
        return sanitized;
      }
    }
  }

  const defaultFromConfig = extractBaseNameFromConfig(config?.render?.outputFilename);
  if (defaultFromConfig) {
    return defaultFromConfig;
  }

  const label = typeof config?.label === "string" ? config.label : config?.type;
  if (label) {
    const sanitized = sanitizeFilename(label.replace(/\s+/g, "_"));
    if (sanitized) {
      return sanitized;
    }
  }

  return "document";
}

function extractBaseNameFromConfig(filename) {
  if (typeof filename !== "string" || !filename.trim()) {
    return null;
  }

  const withoutExtension = filename.replace(/\.[^.]+$/u, "");
  const sanitized = sanitizeFilename(withoutExtension);
  return sanitized || null;
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
  return crypto
    .createHmac("sha256", secret)
    .update(`${format}.${token}`)
    .digest("hex");
}

function normalizeFormats(requestedFormats, availableFormats) {
  const normalizedAvailable = Array.isArray(availableFormats)
    ? availableFormats
    : [];

  const defaults = getDefaultFormats(normalizedAvailable);

  if (!Array.isArray(requestedFormats)) {
    return defaults;
  }

  const requested = [];
  for (const value of requestedFormats) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || requested.includes(normalized)) {
      continue;
    }
    if (!normalizedAvailable.includes(normalized)) {
      continue;
    }
    requested.push(normalized);
  }

  return requested.length > 0 ? requested : defaults;
}

function getDefaultFormats(availableFormats) {
  if (!Array.isArray(availableFormats) || availableFormats.length === 0) {
    return [];
  }

  if (availableFormats.includes("docx") && availableFormats.includes("pdf")) {
    return ["docx", "pdf"];
  }

  if (availableFormats.includes("docx") && availableFormats.includes("json")) {
    return ["docx", "json"];
  }

  if (availableFormats.includes("docx")) {
    return ["docx"];
  }

  return availableFormats.slice(0, 2);
}
