import crypto from "crypto";

import {
  MissingDocAssetError,
  UnsupportedDocTypeError,
} from "../../lib/doc/errors.js";
import { formatDocRenderError, isDocRenderValidationError } from "../../lib/doc/render.js";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { sanitizeDocType } from "../../lib/doc/utils.js";
import { renderDocxBufferForDocType } from "./render.js";
import { renderPdfBuffer } from "../export/pdf.js";
import {
  renderJsonBuffer,
  renderXlsxBuffer,
  FormatNotImplementedError,
} from "../../templates/renderers.js";
import {
  recordDocumentAudit,
  normalizeDocumentDetection,
} from "../../lib/doc/audit.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
  memory: 1024,
};

const SUPPORTED_FORMATS = ["docx", "pdf", "xlsx", "json"];
const formatHandlersByDocType = new Map();

export function getFormatHandlersForDocType(docType) {
  if (!formatHandlersByDocType.has(docType)) {
    formatHandlersByDocType.set(docType, createFormatHandlersForDocType(docType));
  }
  return formatHandlersByDocType.get(docType);
}

export function listSupportedFormats() {
  return [...SUPPORTED_FORMATS];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const format = getFirstQueryValue(req.query?.format)?.toLowerCase();
  const token = getFirstQueryValue(req.query?.token);
  const signature = getFirstQueryValue(req.query?.sig);

  if (!format || !token || !signature) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const secret = process.env.FILES_LINK_SECRET;
  if (!secret) {
    console.error("FILES_LINK_SECRET is not configured");
    return res.status(500).json({ error: "Link configuration unavailable" });
  }

  if (!isValidSignature(format, token, signature, secret)) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  let payload;
  try {
    payload = decodeBase64UrlPayload(token);
  } catch (error) {
    console.error("failed to decode document payload", error);
    return res.status(400).json({ error: "Invalid download token" });
  }

  const { exp } = payload || {};
  if (!isValidExpiry(exp)) {
    return res.status(410).json({ error: "Download link expired" });
  }

  const { docType, document, detection } = resolveDocumentFromPayload(payload);
  if (!docType) {
    return res.status(400).json({ error: "Invalid document type" });
  }

  const config = getDocTypeConfig(docType);
  if (!config) {
    return res.status(400).json({ error: `Unsupported document type: ${docType}` });
  }

  const safeBase = sanitizeFilename(
    typeof payload?.filenameBase === "string"
      ? payload.filenameBase
      : extractBaseNameFromConfig(config?.render?.outputFilename) || config.type
  );
  const filename = `${safeBase || config.type || "document"}.${format}`;

  const formatHandlers = getFormatHandlersForDocType(docType);
  const formatHandler = formatHandlers[format];
  if (!formatHandler) {
    return res.status(400).json({ error: "Unsupported format" });
  }

  try {
    const buffer = await formatHandler.render(document);

    res.setHeader("Content-Type", formatHandler.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200);
    res.end(buffer);

    recordDocumentAudit("documents.download", {
      hashSource: buffer,
      detection,
      finalType: config.type,
      templateVersion: config.templateVersion,
    });
  } catch (error) {
    if (error instanceof FormatResponseError) {
      if (error.statusCode >= 500) {
        console.error("document download format handler failed", error.cause);
      }
      return res.status(error.statusCode).json(error.payload);
    }

    if (error instanceof FormatNotImplementedError) {
      console.error("document download format not implemented", error);
      return res.status(error.statusCode || 501).json({
        error: error.message,
        format: error.format,
      });
    }

    if (error instanceof MissingDocAssetError || error?.name === "DocAssetLoadError") {
      console.error("document download asset error", error);
      return res.status(error.statusCode || 500).json({
        error: error.message,
        docType: error.docType,
        assetType: error.assetType,
      });
    }

    if (
      error?.name === "InvalidCharterPayloadError" &&
      error?.statusCode === 400
    ) {
      console.error("invalid charter payload during download", error);
      return res.status(400).json({
        error: error.message,
        details: error.details || undefined,
      });
    }

    if (isDocRenderValidationError(error)) {
      const responsePayload = formatDocRenderError(error);
      console.error("document download validation failed", error);
      return res.status(error.statusCode || 400).json(responsePayload);
    }

    console.error("failed to process document download", error);
    res.status(500).json({ error: "Failed to generate document file" });
  }
}

function resolveDocumentFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { docType: null, document: {}, detection: null };
  }

  const rawDocType =
    typeof payload.docType === "string" && payload.docType.trim()
      ? payload.docType
      : payload.charter
      ? "charter"
      : undefined;
  const docType = rawDocType ? sanitizeDocType(rawDocType) : null;

  let document = {};
  if (payload.document && typeof payload.document === "object" && !Array.isArray(payload.document)) {
    document = payload.document;
  } else if (
    docType &&
    payload[docType] &&
    typeof payload[docType] === "object" &&
    !Array.isArray(payload[docType])
  ) {
    document = payload[docType];
  } else if (
    payload.charter &&
    typeof payload.charter === "object" &&
    !Array.isArray(payload.charter)
  ) {
    document = payload.charter;
  }

  const detection = normalizeDocumentDetection(
    payload.docTypeDetection ?? payload.detection ?? null
  );

  return { docType, document, detection };
}

function createFormatHandlersForDocType(docType) {
  const handlers = {
    docx: {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      render: async (document) => {
        try {
          return await renderDocxBufferForDocType(docType, document);
        } catch (error) {
          if (isDocRenderValidationError(error)) {
            const payload = formatDocRenderError(error);
            console.error(`${docType} download docx render validation failed`, error);
            throw new FormatResponseError(400, payload, error);
          }
          throw error;
        }
      },
    },
    json: {
      contentType: "application/json",
      render: async (document) => {
        try {
          return await renderJsonBuffer(docType, document);
        } catch (error) {
          throw new FormatResponseError(
            500,
            {
              error: {
                code: "json_render_failed",
                message: "Failed to generate the JSON export.",
              },
            },
            error
          );
        }
      },
    },
  };

  if (docType === "charter") {
    handlers.pdf = {
      contentType: "application/pdf",
      render: async (document) => {
        try {
          return await renderPdfBuffer(document);
        } catch (error) {
          if (
            error?.name === "CharterValidationError" &&
            error?.statusCode === 400
          ) {
            const payload = formatDocRenderError(error);
            console.error("charter download pdf render validation failed", error);
            throw new FormatResponseError(400, payload, error);
          }
          throw error;
        }
      },
    };

    handlers.xlsx = {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      render: async (document) => {
        try {
          return await renderXlsxBuffer(docType, document);
        } catch (error) {
          if (error instanceof FormatNotImplementedError) {
            throw error;
          }
          throw new FormatResponseError(
            500,
            {
              error: {
                code: "xlsx_render_failed",
                message: "Failed to generate the XLSX export.",
              },
            },
            error
          );
        }
      },
    };
  } else {
    handlers.xlsx = {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      render: async (document) => {
        try {
          return await renderXlsxBuffer(docType, document);
        } catch (error) {
          if (error instanceof FormatNotImplementedError) {
            throw error;
          }
          throw new FormatResponseError(
            500,
            {
              error: {
                code: "xlsx_render_failed",
                message: "Failed to generate the XLSX export.",
              },
            },
            error
          );
        }
      },
    };
  }

  return handlers;
}

class FormatResponseError extends Error {
  constructor(statusCode, payload, cause) {
    super("Failed to render requested format");
    this.name = "FormatResponseError";
    this.statusCode = statusCode;
    this.payload = payload;
    this.cause = cause;
  }
}

function getFirstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isValidSignature(format, token, signature, secret) {
  if (typeof signature !== "string") {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${format}.${token}`)
    .digest("hex");

  let expectedBuffer;
  let providedBuffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
    providedBuffer = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

function decodeBase64UrlPayload(token) {
  const padded = token.padEnd(token.length + ((4 - (token.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json);
}

function isValidExpiry(expiry) {
  if (!Number.isInteger(expiry)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return expiry > now;
}

function sanitizeFilename(value) {
  if (typeof value !== "string") {
    return "document";
  }

  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "document";
}

function extractBaseNameFromConfig(filename) {
  if (typeof filename !== "string" || !filename.trim()) {
    return null;
  }

  const withoutExtension = filename.replace(/\.[^.]+$/u, "");
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || null;
}
