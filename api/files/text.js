// /api/files/text.js - Extract text content from uploaded documents
import pdfParseModule from "pdf-parse";
import mammothModule from "mammoth";

import { createStorageClientFromEnv } from "../../lib/storage/index.js";
import {
  timingSafeEqual,
  securityMiddleware,
} from "../../server/middleware/security.js";

const MAX_TEXT_LENGTH = 20_000;

const pdfParse = pdfParseModule?.default ?? pdfParseModule;
const mammoth = mammothModule?.default ?? mammothModule;

const MIME_ALIASES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc", // unsupported but listed for clarity
  "text/plain": "text",
  "application/json": "json",
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

if (process?.env?.FILE_TEXT_SIZE_LIMIT) {
  config.api.bodyParser.sizeLimit = process.env.FILE_TEXT_SIZE_LIMIT;
}

function normalizeMimeType(value) {
  if (typeof value !== "string") return "";
  return value.split(";")[0].trim().toLowerCase();
}

function trimOutput(text) {
  if (typeof text !== "string") return "";
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH);
}

function getFirstQueryValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function readApiKeyFromRequest(req) {
  const headerKey = req.headers?.["x-api-key"] ?? req.headers?.["x-files-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  if (Array.isArray(headerKey) && headerKey.length > 0) {
    return headerKey[0];
  }
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string") {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7).trim();
    }
    return trimmed;
  }
  return undefined;
}

// HIGH-01: Use timing-safe comparison to prevent timing attacks
function ensureApiKey(req, res) {
  const expected = process?.env?.FILES_API_KEY;
  if (!expected) {
    return true;
  }
  const provided = readApiKeyFromRequest(req);
  if (!provided || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

async function extractTextFromBuffer(buffer, kind) {
  switch (kind) {
    case "pdf": {
      const result = await pdfParse(buffer);
      return result?.text ?? "";
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result?.value ?? "";
    }
    case "text": {
      return buffer.toString("utf8");
    }
    case "json": {
      try {
        const parsed = JSON.parse(buffer.toString("utf8"));
        return JSON.stringify(parsed, null, 2);
      } catch (err) {
        throw new Error("Invalid JSON payload");
      }
    }
    default:
      throw new Error("Unsupported file type");
  }
}

async function handlePost(req, res) {
  try {
    const { name, mimeType, base64 } = req.body || {};

    const safeName = typeof name === "string" && name.trim() ? name.trim() : "untitled";
    const normalizedMime = normalizeMimeType(mimeType);
    const fileKind = MIME_ALIASES[normalizedMime];

    if (!fileKind || fileKind === "doc") {
      return res
        .status(415)
        .json({ ok: false, error: "Unsupported file type", name: safeName, mimeType: normalizedMime });
    }

    if (typeof base64 !== "string" || base64.trim() === "") {
      return res.status(400).json({ ok: false, error: "Missing file contents", name: safeName });
    }

    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch (err) {
      return res.status(400).json({ ok: false, error: "Unable to decode file", name: safeName });
    }

    if (!buffer?.length) {
      return res.status(400).json({ ok: false, error: "Empty file data", name: safeName });
    }

    const fullText = await extractTextFromBuffer(buffer, fileKind);
    const text = trimOutput(fullText);

    return res.status(200).json({
      ok: true,
      name: safeName,
      mimeType: normalizedMime,
      charCount: fullText.length,
      text,
      truncated: text.length !== fullText.length,
    });
  } catch (error) {
    const message = error?.message || "Failed to extract text";
    console.error("/api/files/text error", error);
    res.status(500).json({ ok: false, error: message });
  }
}

async function handleGet(req, res) {
  if (!ensureApiKey(req, res)) {
    return;
  }

  const query = req.query || {};
  const fileId = getFirstQueryValue(query.fileId ?? query.id);
  const filePath = getFirstQueryValue(query.path ?? query.filePath);
  const driveId = getFirstQueryValue(query.driveId);
  const siteId = getFirstQueryValue(query.siteId);
  const overrideMime = normalizeMimeType(getFirstQueryValue(query.mimeType));

  if (!fileId && !filePath) {
    res.status(400).json({ ok: false, error: "Missing fileId or path" });
    return;
  }

  const storageClient = createStorageClientFromEnv();
  const canDownloadById =
    storageClient && typeof storageClient.downloadFileById === "function";
  const canDownloadByPath =
    storageClient && typeof storageClient.downloadFileByPath === "function";

  if (!canDownloadById && !canDownloadByPath) {
    res.status(503).json({ ok: false, error: "File provider is not configured" });
    return;
  }

  let fileRecord = null;
  try {
    if (fileId && canDownloadById) {
      fileRecord = await storageClient.downloadFileById({
        id: fileId,
        driveId,
        siteId,
      });
    } else if (filePath && canDownloadByPath) {
      fileRecord = await storageClient.downloadFileByPath({
        path: filePath,
        driveId,
        siteId,
      });
    }
  } catch (error) {
    if (error?.status === 404) {
      res.status(404).json({ ok: false, error: "File not found" });
      return;
    }
    console.error("/api/files/text remote fetch error", error);
    res.status(500).json({ ok: false, error: "Failed to load file" });
    return;
  }

  if (!fileRecord || !fileRecord.buffer) {
    res.status(404).json({ ok: false, error: "File not found" });
    return;
  }

  const safeName =
    typeof fileRecord.name === "string" && fileRecord.name.trim()
      ? fileRecord.name.trim()
      : "untitled";
  const normalizedMime = overrideMime || normalizeMimeType(fileRecord.mimeType);
  const fileKind = MIME_ALIASES[normalizedMime];

  if (!fileKind || fileKind === "doc") {
    res.status(415).json({
      ok: false,
      error: "Unsupported file type",
      name: safeName,
      mimeType: normalizedMime,
    });
    return;
  }

  const buffer = fileRecord.buffer;
  if (!Buffer.isBuffer(buffer)) {
    res.status(500).json({ ok: false, error: "Invalid file buffer" });
    return;
  }

  try {
    const fullText = await extractTextFromBuffer(buffer, fileKind);
    const text = trimOutput(fullText);
    res.status(200).json({
      ok: true,
      name: safeName,
      mimeType: normalizedMime,
      charCount: fullText.length,
      text,
      truncated: text.length !== fullText.length,
    });
  } catch (error) {
    if (error?.message === "Unsupported file type") {
      res.status(415).json({
        ok: false,
        error: error.message,
        name: safeName,
        mimeType: normalizedMime,
      });
      return;
    }
    console.error("/api/files/text extraction error", error);
    const message = error?.message || "Failed to extract text";
    res.status(500).json({ ok: false, error: message });
  }
}

export default async function handler(req, res) {
  // HIGH-03/HIGH-05: Apply security middleware (rate limiting, CSRF, headers)
  const securityCheck = securityMiddleware({});
  await new Promise((resolve) => securityCheck(req, res, resolve));
  if (res.headersSent) return;

  if (req.method === "GET") {
    await handleGet(req, res);
    return;
  }

  if (req.method === "POST") {
    await handlePost(req, res);
    return;
  }

  res.status(405).json({ ok: false, error: "Method Not Allowed" });
}
