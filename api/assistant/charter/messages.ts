import {
  CharterSessionError,
  ConversationBadRequestError,
  sendInteraction,
} from "./sessionManager";

interface MessageRequestBody {
  conversation_id?: unknown;
  correlation_id?: unknown;
  message?: unknown;
  command?: unknown;
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

function parseBody(req: ApiRequest): MessageRequestBody {
  if (req.body && typeof req.body === "object") {
    return req.body as MessageRequestBody;
  }
  return {};
}

function sanitizeConversationId(value: unknown): string {
  if (typeof value !== "string") {
    throw new ConversationBadRequestError("conversation_id is required");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConversationBadRequestError("conversation_id is required");
  }
  return trimmed;
}

function sendError(res: ApiResponse, error: unknown) {
  if (error instanceof CharterSessionError) {
    res.status(error.status).json({ ok: false, error: error.code, message: error.message });
    return;
  }
  res.status(500).json({ ok: false, error: "internal_error" });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const conversationId = sanitizeConversationId(body?.conversation_id);

    const result = await sendInteraction({
      conversationId,
      correlationId: typeof body?.correlation_id === "string" ? body.correlation_id : null,
      message: typeof body?.message === "string" ? body.message : null,
      command: body?.command ?? null,
    });

    res.status(200).json({
      ok: true,
      handled: result.handled,
      idempotent: result.idempotent,
      events: result.events,
      pending_tool_fields: result.pending_tool_fields,
      pending_tool_arguments: result.pending_tool_arguments,
      pending_tool_warnings: result.pending_tool_warnings,
    });
  } catch (error) {
    sendError(res, error);
  }
}
