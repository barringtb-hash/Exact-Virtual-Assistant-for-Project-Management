import {
  CharterSessionError,
  ConversationBadRequestError,
  getSlotDescriptors,
  startConversation,
} from "./sessionManager";

interface StartRequestBody {
  correlation_id?: unknown;
}

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
}

function parseBody(req: ApiRequest): StartRequestBody {
  if (req.body && typeof req.body === "object") {
    return req.body as StartRequestBody;
  }
  return {};
}

function isVoiceEnabled(): boolean {
  const env = process.env || {};
  const candidates = [
    env.OPENAI_REALTIME_MODEL,
    env.OPENAI_REALTIME_VOICE,
    env.VOICE_REALTIME_MODEL,
  ];
  return candidates.some((value) => typeof value === "string" && value.trim() !== "");
}

function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function sendError(res: ApiResponse, error: unknown) {
  if (error instanceof CharterSessionError) {
    res.status(error.status).json({ ok: false, error: error.code, message: error.message });
    return;
  }
  res.status(500).json({ ok: false, error: "internal_error" });
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const correlationId = sanitizeCorrelationId(body?.correlation_id);

    const result = startConversation({ correlationId });
    const slots = getSlotDescriptors();

    res.status(200).json({
      ok: true,
      conversation_id: result.conversationId,
      initial_prompt: result.initialPrompt,
      slots,
      voice_enabled: isVoiceEnabled(),
      events: result.events,
      idempotent: result.idempotent,
    });
  } catch (error) {
    if (error instanceof ConversationBadRequestError) {
      res.status(error.status).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    sendError(res, error);
  }
}
