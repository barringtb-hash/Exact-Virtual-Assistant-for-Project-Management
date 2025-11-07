export interface CharterSessionStartResponse {
  conversationId: string;
  slots: Record<string, unknown>;
  prompt: string;
  hasVoiceSupport: boolean;
}

export interface CharterMessageResponse<TEvent = unknown> {
  events: TEvent[];
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
export async function startCharterSession(
  correlationId: string,
): Promise<CharterSessionStartResponse> {
  try {
    const response = await fetch("/assistant/charter/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ correlationId }),
    });

    return ensureOk<CharterSessionStartResponse>(response);
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
    const response = await fetch("/assistant/charter/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId, text, source, isFinal }),
    });

    return ensureOk<CharterMessageResponse<TEvent>>(response);
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
    `/assistant/charter/stream?conversationId=${encodeURIComponent(conversationId)}`,
  );

  const handler = (event: MessageEvent<string>) => {
    onEvent(event);
  };

  eventSource.addEventListener("message", handler);

  return {
    eventSource,
    close: () => {
      eventSource.removeEventListener("message", handler);
      eventSource.close();
    },
  };
}
