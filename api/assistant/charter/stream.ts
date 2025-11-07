import {
  CharterSessionError,
  ConversationBadRequestError,
  registerStream,
} from "./sessionManager";

interface ApiRequest {
  method?: string;
  query?: Record<string, unknown> | undefined;
  on(event: string, listener: () => void): void;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  writeHead?(status: number, headers: Record<string, string>): void;
  write?(chunk: string): void;
  end(): void;
  flushHeaders?(): void;
}

type WritableResponse = ApiResponse & {
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: string): void;
};

function getQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value) && value.length > 0) {
    const candidate = value[0];
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return trimmed || null;
    }
  }
  return null;
}

function resolveConversationId(req: ApiRequest): string {
  const { query } = req;
  const conversationId =
    getQueryValue(query?.conversation_id as string | string[]) ??
    getQueryValue(query?.conversationId as string | string[]);
  if (!conversationId) {
    throw new ConversationBadRequestError("conversation_id query parameter is required");
  }
  return conversationId;
}

function sendError(res: ApiResponse, error: unknown) {
  if (error instanceof CharterSessionError) {
    res.status(error.status).json({ ok: false, error: error.code, message: error.message });
    return;
  }
  res.status(500).json({ ok: false, error: "internal_error" });
}

function writeEvent(res: WritableResponse, event: { type: string; event_id?: string; [key: string]: unknown }) {
  const payload = JSON.stringify(event);
  const lines: string[] = [];
  if (event.event_id) {
    lines.push(`id: ${event.event_id}`);
  }
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${payload}`);
  res.write(`${lines.join("\n")}\n\n`);
}

function writeComment(res: WritableResponse, comment: string) {
  res.write(`: ${comment}\n\n`);
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  let conversationId: string;
  try {
    conversationId = resolveConversationId(req);
  } catch (error) {
    sendError(res, error);
    return;
  }

  let snapshotRegistration;
  try {
    snapshotRegistration = registerStream(conversationId, () => {
      /* placeholder registration to validate session */
    });
  } catch (error) {
    sendError(res, error);
    return;
  }

  const snapshot = snapshotRegistration.snapshot;
  snapshotRegistration.detach();

  const writable = res as WritableResponse;
  writable.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  writable.flushHeaders?.();

  let closed = false;

  const registration = registerStream(conversationId, (event) => {
    if (closed) {
      return;
    }
    if (event === null) {
      writeEvent(writable, { type: "close" });
      writable.end();
      closed = true;
      return;
    }
    writeEvent(writable, event);
  });

  writeComment(writable, "connected");
  writeEvent(writable, snapshot);

  const heartbeat = setInterval(() => {
    if (!closed) {
      writeComment(writable, `heartbeat ${Date.now()}`);
    }
  }, 25_000);

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(heartbeat);
    registration.detach();
    writable.end();
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
}
