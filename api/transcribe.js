// /api/transcribe.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
]);

const EXT_BY_MIME = {
  "audio/webm": "webm",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
};

export const config = {
  api: { bodyParser: { sizeLimit: "15mb" } },
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
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { audioBase64, mimeType } = req.body || {};

    if (typeof audioBase64 !== "string" || audioBase64.trim() === "") {
      return res.status(400).json({ error: "Invalid audio payload" });
    }

    const rawMime = typeof mimeType === "string" ? mimeType : "";
    const baseMime = rawMime.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(baseMime)) {
      return res.status(400).json({ error: "Unsupported audio format", mimeType: rawMime });
    }

    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audioBase64, "base64");
    } catch {
      return res.status(400).json({ error: "Unable to decode audio" });
    }
    if (!audioBuffer?.length) {
      return res.status(400).json({ error: "Empty audio data" });
    }

    const ext = EXT_BY_MIME[baseMime] || "mp4";
    const file = await toFile(audioBuffer, `audio.${ext}`, { type: baseMime });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const PRIMARY_MODEL = (process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe").trim();
    const FALLBACK_MODEL = "whisper-1";

    async function transcribeWith(model) {
      return client.audio.transcriptions.create({ file, model });
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
  }
}
