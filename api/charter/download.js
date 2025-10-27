import crypto from "crypto";
import {
  renderDocxBuffer,
  formatDocRenderError,
  isDocRenderValidationError,
} from "./render.js";
import { renderPdfBuffer } from "../export/pdf.js";
import {
  renderJsonBuffer,
  renderXlsxBuffer,
  FormatNotImplementedError,
} from "../../templates/renderers.js";

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
    console.error("failed to decode charter payload", error);
    return res.status(400).json({ error: "Invalid download token" });
  }

  const { charter, filenameBase, exp } = payload || {};
  if (!charter || typeof charter !== "object" || Array.isArray(charter)) {
    return res.status(400).json({ error: "Invalid charter payload" });
  }

  if (!isValidExpiry(exp)) {
    return res.status(410).json({ error: "Download link expired" });
  }

  const safeBase = sanitizeFilename(
    typeof filenameBase === "string" ? filenameBase : "project_charter"
  );
  const filename = `${safeBase || "project_charter"}.${format}`;

  const handler = formatHandlers[format];
  if (!handler) {
    return res.status(400).json({ error: "Unsupported format" });
  }

  try {
    const buffer = await handler.render(charter);

    res.setHeader("Content-Type", handler.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.status(200);
    res.end(buffer);
  } catch (error) {
    if (error instanceof FormatResponseError) {
      if (error.statusCode >= 500) {
        console.error("charter download format handler failed", error.cause);
      }
      return res.status(error.statusCode).json(error.payload);
    }

    if (error instanceof FormatNotImplementedError) {
      console.error("charter download format not implemented", error);
      return res.status(error.statusCode || 501).json({
        error: error.message,
        format: error.format,
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

    console.error("failed to process charter download", error);
    res.status(500).json({ error: "Failed to generate charter file" });
  }
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

export const formatHandlers = {
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    render: async (charter) => {
      try {
        return await renderDocxBuffer(charter);
      } catch (error) {
        if (isDocRenderValidationError(error)) {
          const payload = formatDocRenderError(error);
          console.error(
            "charter download docx render validation failed",
            error
          );
          throw new FormatResponseError(400, payload, error);
        }
        throw error;
      }
    },
  },
  pdf: {
    contentType: "application/pdf",
    render: async (charter) => {
      try {
        return await renderPdfBuffer(charter);
      } catch (error) {
        if (error?.name === "CharterValidationError") {
          const payload = formatDocRenderError(error);
          console.error(
            "charter download pdf render validation failed",
            error
          );
          throw new FormatResponseError(400, payload, error);
        }
        throw error;
      }
    },
  },
  xlsx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    render: async (charter) => {
      try {
        return await renderXlsxBuffer(charter);
      } catch (error) {
        if (error instanceof FormatNotImplementedError) {
          throw error;
        }
        throw new FormatResponseError(500, {
          error: {
            code: "xlsx_render_failed",
            message: "Failed to generate the XLSX export.",
          },
        }, error);
      }
    },
  },
  json: {
    contentType: "application/json",
    render: async (charter) => {
      try {
        return await renderJsonBuffer(charter);
      } catch (error) {
        throw new FormatResponseError(500, {
          error: {
            code: "json_render_failed",
            message: "Failed to generate the JSON export.",
          },
        }, error);
      }
    },
  },
};

export const supportedFormats = Object.keys(formatHandlers);

function getFirstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === "string" ? value : undefined;
}

function isValidSignature(format, token, providedSignature, secret) {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${format}.${token}`)
    .digest("hex");

  try {
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const providedBuffer = Buffer.from(providedSignature, "hex");

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error("failed to compare signatures", error);
    return false;
  }
}

function decodeBase64UrlPayload(token) {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? 0 : 4 - (base64.length % 4);
  const padded = base64 + "=".repeat(padding);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}

function sanitizeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function isValidExpiry(expiry) {
  if (typeof expiry !== "number" || !Number.isFinite(expiry)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return expiry >= now;
}
