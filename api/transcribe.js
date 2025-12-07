// /api/transcribe.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import formidable from "formidable";
import { createReadStream, promises as fsPromises } from "node:fs";
import { securityMiddleware } from "../server/middleware/security.js";

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
]);

export const config = {
  api: {
    bodyParser: false,
  },
};

function mapOpenAIError(err) {
  const status = err?.status || err?.response?.status || 502;
  const message =
    (err?.error?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "OpenAI request failed") + "";
  return { status, message };
}

export default async function handler(req, res) {
  // CRIT-01/02/HIGH-05: Apply security middleware (rate limiting, CSRF, headers)
  const securityCheck = securityMiddleware({ isOpenAI: true });
  await new Promise((resolve) => securityCheck(req, res, resolve));
  if (res.headersSent) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const form = formidable({
      multiples: false,
      maxFileSize: 15 * 1024 * 1024,
      keepExtensions: true,
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, parsedFields, parsedFiles) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ fields: parsedFields ?? {}, files: parsedFiles ?? {} });
      });
    });
    req.files = files;

    const firstFileEntry =
      files?.audio || files?.file || (files ? Object.values(files)[0] : undefined);
    const uploadedFile = Array.isArray(firstFileEntry)
      ? firstFileEntry[0]
      : firstFileEntry;

    if (!uploadedFile) {
      return res.status(400).json({ error: "Missing audio file" });
    }

    const filePath = uploadedFile.filepath || uploadedFile.path;
    const reportedMime =
      typeof uploadedFile.mimetype === "string"
        ? uploadedFile.mimetype
        : typeof fields?.mimeType === "string"
          ? fields.mimeType
          : "";
    const baseMime = reportedMime.split(";")[0].trim().toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(baseMime)) {
      if (filePath) {
        await fsPromises.unlink(filePath).catch(() => {});
      }
      return res.status(400).json({ error: "Unsupported audio format", mimeType: reportedMime });
    }

    if (!filePath) {
      return res.status(400).json({ error: "Invalid audio upload" });
    }

    const stats = await fsPromises.stat(filePath).catch(() => null);
    if (!stats || !stats.size) {
      await fsPromises.unlink(filePath).catch(() => {});
      return res.status(400).json({ error: "Empty audio data" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const PRIMARY_MODEL = (process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe").trim();
    const FALLBACK_MODEL = "whisper-1";

    async function transcribeWith(model) {
      return client.audio.transcriptions.create({
        file: createReadStream(filePath),
        model,
      });
    }

    let result;
    try {
      result = await transcribeWith(PRIMARY_MODEL);
    } catch (err) {
      const { status, message } = mapOpenAIError(err);
      // If primary model isn't enabled/recognized, or bad request → try Whisper
      if ((status === 400 || status === 404) && PRIMARY_MODEL !== FALLBACK_MODEL) {
        try {
          result = await transcribeWith(FALLBACK_MODEL);
        } catch (err2) {
          const mapped = mapOpenAIError(err2);
          console.error("Transcribe fallback failed:", mapped);
          return res.status(mapped.status).json({ error: mapped.message, model: FALLBACK_MODEL });
        }
      } else {
        console.error("Transcribe failed:", { status, message });
        return res.status(status).json({ error: message, model: PRIMARY_MODEL });
      }
    }

    const transcript = result?.text || "";
    return res.status(200).json({ text: transcript, transcript });
  } catch (error) {
    console.error("/api/transcribe error", error);
    return res.status(500).json({ error: "Failed to transcribe audio" });
  } finally {
    // Ensure uploaded temp files are removed to avoid leaking storage
    try {
      if (req?.files) {
        const entries = Object.values(req.files);
        const fileList = Array.isArray(entries)
          ? entries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
          : [];
        await Promise.all(
          fileList
            .map((file) => file?.filepath || file?.path)
            .filter((filePath) => typeof filePath === "string")
            .map((filePath) => fsPromises.unlink(filePath).catch(() => {})),
        );
      }
    } catch (cleanupError) {
      console.warn("Failed to cleanup uploaded audio", cleanupError);
    }
  }
}
