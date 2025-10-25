import OpenAI from "openai";
import { toFile } from "openai/uploads";

const ALLOWED_MIME_TYPES = new Set(["audio/webm", "audio/mp3", "audio/mpeg"]);
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb"
    }
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
      res.status(400).json({ error: "Unsupported audio format" });
      return;
    }

    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audioBase64, "base64");
    } catch (decodeError) {
      res.status(400).json({ error: "Unable to decode audio" });
      return;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: "Empty audio data" });
      return;
    }

    if (audioBuffer.length > MAX_BYTES) {
      res.status(413).json({ error: "Audio file too large" });
      return;
    }

    const extension = mimeType === "audio/webm" ? "webm" : mimeType === "audio/mp3" ? "mp3" : "mpeg";
    const file = await toFile(audioBuffer, `audio.${extension}`, { type: mimeType });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1"
    });

    res.status(200).json({ text: result?.text || "" });
  } catch (error) {
    console.error("/api/transcribe error", error);
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
}
