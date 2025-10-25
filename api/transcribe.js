// /api/transcribe.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import { toFile } from "openai/uploads";

// Accept common browser formats (Chrome/Firefox webm, Safari/iOS mp4/m4a, WAV)
const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",  // Safari / iOS
  "audio/m4a",  // iOS voice memos and some browsers
  "audio/wav"
]);

const EXT_BY_MIME = {
  "audio/webm": "webm",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/wav": "wav"
};

export const config = {
  api: {
    // big enough for short/medium voice clips
    bodyParser: { sizeLimit: "15mb" }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { audioBase64, mimeType } = req.body || {};

    if (typeof audioBase64 !== "string" || audioBase64.trim() === "") {
      res.status(400).json({ error: "Invalid audio payload" });
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ error: "Unsupported audio format", mimeType });
      return;
    }

    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audioBase64, "base64");
    } catch {
      res.status(400).json({ error: "Unable to decode audio" });
      return;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: "Empty audio data" });
      return;
    }

    const extension = EXT_BY_MIME[mimeType] || "mp4";
    const file = await toFile(audioBuffer, `audio.${extension}`, { type: mimeType });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Use new audio model by default; fall back if you prefer
    const STT_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

    const result = await client.audio.transcriptions.create({
      file,
      model: STT_MODEL
    });

    const transcript = result?.text || "";

    res.status(200).json({
      text: transcript,
      transcript
    });
  } catch (error) {
    console.error("/api/transcribe error", error);
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
}
