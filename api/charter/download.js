import crypto from "crypto";
import {
  renderDocxBuffer,
  formatDocRenderError,
  isDocRenderValidationError,
} from "./render.js";
import { renderPdfBuffer } from "../export/pdf.js";

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

  try {
    let buffer;
    let contentType;

    if (format === "docx") {
      try {
        buffer = await renderDocxBuffer(charter);
      } catch (renderError) {
        if (isDocRenderValidationError(renderError)) {
          const payload = formatDocRenderError(renderError);
          console.error(
            "charter download docx render validation failed",
            renderError
          );
          return res.status(400).json(payload);
        }

        throw renderError;
      }
      contentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (format === "pdf") {
      buffer = await renderPdfBuffer(charter);
      contentType = "application/pdf";
    } else {
      return res.status(400).json({ error: "Unsupported format" });
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.status(200);
    res.end(buffer);
  } catch (error) {
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
