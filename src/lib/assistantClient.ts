export interface CharterSessionStartResponse<TEvent = unknown> {
  conversationId: string;
  slots: Record<string, unknown>[];
  prompt: string;
  hasVoiceSupport: boolean;
  events: TEvent[];
  idempotent: boolean;
}

export interface CharterMessageResponse<TEvent = unknown> {
  events: TEvent[];
  handled: boolean;
  idempotent: boolean;
}

export type CharterStreamEvent = MessageEvent<string>;

export type CharterStreamSubscription = {
  close: () => void;
  eventSource: EventSource;
};

/**
 * Shared error type thrown by the remote charter assistant helpers. Consumers can reliably
 * catch this error to initiate a fallback to the local orchestrator when remote calls fail.
 */
export class CharterClientError extends Error {
  public readonly status?: number;

  public readonly data?: unknown;

  public readonly cause?: unknown;

  constructor(message: string, options: { status?: number; data?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = "CharterClientError";
    this.status = options.status;
    this.data = options.data;

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

async function parseJsonSafely<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new CharterClientError("Failed to parse response from charter assistant.", {
      status: response.status,
      cause: error,
    });
  }
}

async function ensureOk<T>(response: Response): Promise<T> {
  if (response.ok) {
    return parseJsonSafely<T>(response) as Promise<T>;
  }

  const data = await parseJsonSafely<unknown>(response).catch(() => undefined);
  throw new CharterClientError("Charter assistant request failed.", {
    status: response.status,
    data,
  });
}

/**
 * Starts a new charter assistant session by requesting an orchestration from the server.
 *
 * @throws {CharterClientError} When the server returns a non-success status code or the
 * request cannot be completed due to a network error. Callers should catch this error and
 * trigger the local orchestrator fallback.
 */
type RawStartResponse<TEvent> = {
  ok?: boolean;
  conversation_id?: string;
  conversationId?: string;
  initial_prompt?: string;
  prompt?: string;
  slots?: Record<string, unknown>[];
  voice_enabled?: boolean;
  voiceEnabled?: boolean;
  events?: TEvent[];
  idempotent?: boolean;
};

type RawMessageResponse<TEvent> = {
  ok?: boolean;
  handled?: boolean;
  idempotent?: boolean;
  events?: TEvent[];
};

export async function startCharterSession(
  correlationId: string,
): Promise<CharterSessionStartResponse> {
  try {
    const response = await fetch("/api/assistant/charter/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ correlation_id: correlationId }),
    });

    const payload = await ensureOk<RawStartResponse<unknown>>(response);

    const conversationId =
      typeof payload?.conversation_id === "string" && payload.conversation_id
        ? payload.conversation_id
        : typeof payload?.conversationId === "string"
        ? payload.conversationId
        : "";

    if (!conversationId) {
      throw new CharterClientError("Charter assistant did not return a conversation id.");
    }

    const prompt =
      typeof payload?.initial_prompt === "string" && payload.initial_prompt
        ? payload.initial_prompt
        : typeof payload?.prompt === "string"
        ? payload.prompt
        : "";

    const slots = Array.isArray(payload?.slots) ? payload.slots : [];
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const hasVoiceSupport = Boolean(payload?.voice_enabled ?? payload?.voiceEnabled);
    const idempotent = Boolean(payload?.idempotent);

    return {
      conversationId,
      slots,
      prompt,
      hasVoiceSupport,
      events,
      idempotent,
    };
  } catch (error) {
    if (error instanceof CharterClientError) {
      throw error;
    }

    throw new CharterClientError("Unable to reach charter assistant service.", { cause: error });
  }
}

/**
 * Sends a message to an active charter assistant conversation and returns streamed events.
 *
 * @throws {CharterClientError} When the server responds with an error status or if the
 * request fails (e.g., browser offline). Consumers should fallback to the local orchestrator
 * when this error is thrown.
 */
export async function postCharterMessage<TEvent = unknown>(
  conversationId: string,
  text: string,
  source: string,
  isFinal = true,
): Promise<CharterMessageResponse<TEvent>> {
  try {
    const response = await fetch("/api/assistant/charter/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message: text,
        source,
        is_final: isFinal,
      }),
    });

    const payload = await ensureOk<RawMessageResponse<TEvent>>(response);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    return {
      events,
      handled: payload?.handled ?? false,
      idempotent: Boolean(payload?.idempotent),
    };
  } catch (error) {
    if (error instanceof CharterClientError) {
      throw error;
    }

    throw new CharterClientError("Unable to reach charter assistant service.", { cause: error });
  }
}

/**
 * Subscribes to the charter assistant server-sent events stream for a conversation.
 *
 * The helper automatically attaches listeners and exposes a close helper to tidy up.
 * Consumers should still catch {@link CharterClientError}s from HTTP helpers to activate
 * offline fallbacks when the stream is not reachable.
 */
export function subscribeToCharterStream(
  conversationId: string,
  onEvent: (event: CharterStreamEvent) => void,
): CharterStreamSubscription {
  const eventSource = new EventSource(
    `/api/assistant/charter/stream?conversation_id=${encodeURIComponent(conversationId)}`,
  );

  const eventTypes = ["message", "assistant_prompt", "slot_update", "close"] as const;

  const handler = (event: MessageEvent<string>) => {
    onEvent(event);
  };

  for (const eventType of eventTypes) {
    eventSource.addEventListener(eventType, handler);
  }

  return {
    eventSource,
    close: () => {
      for (const eventType of eventTypes) {
        eventSource.removeEventListener(eventType, handler);
      }
      eventSource.close();
    },
  };
}
