// Vercel Serverless Function: exchange browser SDP with OpenAI Realtime
import {
  formatErrorResponse,
  MethodNotAllowedError,
  ValidationError,
  ERROR_CODES,
} from "../../server/utils/apiErrors.js";
import { validateBody, SDP_BODY_SCHEMA } from "../../server/middleware/validation.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  const requestPath = req?.path || "/api/voice/sdp";

  if (req.method !== "POST") {
    const error = new MethodNotAllowedError(req.method, ["POST"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  try {
    // Validate request body
    const validation = validateBody(req, SDP_BODY_SCHEMA, { path: requestPath });
    if (!validation.valid) {
      return res.status(400).json(validation.errorResponse);
    }

    const { sdp } = validation.data;
    if (!sdp || !sdp.trim()) {
      const error = new ValidationError("Missing SDP offer", [
        { field: "sdp", message: "sdp is required and cannot be empty" },
      ]);
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    // Prefer env; if missing, fall back to GA model & shimmer voice
    const model = (process.env.OPENAI_REALTIME_MODEL || "gpt-realtime").trim();
    const defaultVoice = (process.env.OPENAI_REALTIME_VOICE || "shimmer").trim().toLowerCase();
    // Always use env voice to avoid client confusion
    const voice = defaultVoice;

    console.log("[SDP] Creating realtime session:", { model, voice, envVoice: process.env.OPENAI_REALTIME_VOICE || "(not set)" });

    const betaHeader = /preview/i.test(model) ? { "OpenAI-Beta": "realtime=v1" } : {};

    const resp = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/sdp",
          ...betaHeader,
        },
        body: sdp,
      }
    );

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return res.status(resp.status).json(formatErrorResponse(
        { code: "REALTIME_EXCHANGE_FAILED", message: "Realtime exchange failed", statusCode: resp.status, details: { detail: errTxt } },
        { path: requestPath }
      ));
    }

    const answerSdp = await resp.text();
    return res.status(200).send(answerSdp);
  } catch (err) {
    console.error("voice/sdp error:", err);
    return res.status(500).json(formatErrorResponse(
      { code: ERROR_CODES.INTERNAL_ERROR, message: "Failed to create realtime session", statusCode: 500 },
      { path: requestPath }
    ));
  }
}
