// /api/files/text.js - Extract text content from uploaded documents
import pdfParseModule from "pdf-parse";
import mammothModule from "mammoth";

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
      sizeLimit: process.env.FILE_TEXT_SIZE_LIMIT || "10mb",
    },
  },
};

function normalizeMimeType(value) {
  if (typeof value !== "string") return "";
  return value.split(";")[0].trim().toLowerCase();
}

function trimOutput(text) {
  if (typeof text !== "string") return "";
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH);
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

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
