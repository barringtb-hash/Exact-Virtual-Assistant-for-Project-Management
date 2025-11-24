/*
 * Chat streaming utilities for SSE-based responses.
 */

export interface ChatStreamCallbacks {
  onOpen?: () => void;
  onToken?: (token: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onRetry?: (attempt: number, delayMs: number) => void;
}

interface BaseChatStreamOptions extends ChatStreamCallbacks {
  signal?: AbortSignal;
  /**
   * Maximum number of retry attempts for transient network failures.
   * Defaults to 2 (for a total of 3 attempts).
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds for exponential backoff retries.
   * Defaults to 500ms.
   */
  retryDelayMs?: number;
}

export interface OpenChatStreamOptions extends BaseChatStreamOptions {
  /**
   * When true the EventSource will be opened with credentials.
   */
  withCredentials?: boolean;
}

export interface OpenChatStreamFetchOptions extends BaseChatStreamOptions {
  /**
   * Request init options passed to fetch.
   */
  requestInit?: RequestInit;
  /**
   * Custom fetch implementation (useful for tests).
   */
  fetchImpl?: typeof fetch;
}

interface SSEPayload {
  eventType?: string;
  data: string;
}

const DONE_TOKEN = '[DONE]';

function extractTokens(rawData: string): { tokens: string[]; isDone: boolean } {
  const tokens: string[] = [];
  let isDone = false;

  const lines = rawData.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const payload = line.slice(5).trim();
    if (!payload) {
      continue;
    }

    if (payload === DONE_TOKEN) {
      isDone = true;
      continue;
    }

    let token: string | undefined;
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'string') {
        token = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (typeof parsed.token === 'string') {
          token = parsed.token;
        } else if (typeof parsed.content === 'string') {
          token = parsed.content;
        }
      }
    } catch (_) {
      // non-JSON payloads fall back to raw text
      token = payload;
    }

    if (!token) {
      token = payload;
    }

    tokens.push(token);
  }

  return { tokens, isDone };
}

function parseSSEChunk(chunk: string): SSEPayload[] {
  const events: SSEPayload[] = [];
  const rawEvents = chunk.split(/\n\n+/);
  for (const rawEvent of rawEvents) {
    const trimmed = rawEvent.trim();
    if (!trimmed) {
      continue;
    }

    let eventType: string | undefined;
    const dataLines: string[] = [];

    for (const line of trimmed.split(/\n/)) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line);
      }
    }

    if (dataLines.length === 0) {
      continue;
    }

    events.push({
      eventType,
      data: dataLines.join('\n'),
    });
  }

  return events;
}

function createRetryDelays(maxRetries: number, baseDelay: number) {
  return Array.from({ length: maxRetries }, (_, index) => baseDelay * 2 ** index);
}

function normaliseError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}

function handlePayload(
  payload: SSEPayload,
  {
    onToken,
    onComplete,
    onError,
    dispose,
  }: {
    onToken?: (token: string) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    dispose: () => void;
  },
) {
  const { tokens, isDone } = extractTokens(payload.data);

  if (payload.eventType === 'error' || payload.eventType === 'aborted') {
    const message = tokens.join(' ');
    onError?.(
      new Error(
        message ||
          (payload.eventType === 'aborted'
            ? 'The chat stream was aborted by the server.'
            : 'The chat stream encountered an error.'),
      ),
    );
    dispose();
    return true;
  }

  if (payload.eventType === 'done') {
    onComplete?.();
    dispose();
    return true;
  }

  for (const token of tokens) {
    onToken?.(token);
  }

  if (isDone) {
    onComplete?.();
    dispose();
    return true;
  }

  return false;
}

function attachAbortListener(
  signal: AbortSignal | undefined,
  onAbort: (reason?: unknown) => void,
): () => void {
  if (!signal) {
    return () => {};
  }

  if (signal.aborted) {
    onAbort(signal.reason);
  }

  const listener = () => {
    onAbort(signal.reason);
  };

  signal.addEventListener('abort', listener);

  return () => {
    signal.removeEventListener('abort', listener);
  };
}

export function openChatStream(
  url: string,
  options: OpenChatStreamOptions = {},
): () => void {
  const {
    onOpen,
    onToken,
    onComplete,
    onError,
    onRetry,
    signal,
    maxRetries = 2,
    retryDelayMs = 500,
    withCredentials,
  } = options;

  if (typeof EventSource === 'undefined') {
    throw new Error('EventSource is not available in this environment');
  }

  let disposed = false;
  let source: EventSource | null = null;
  let retries = 0;
  const retryDelays = createRetryDelays(maxRetries, retryDelayMs);

  let removeAbortListener = () => {};

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    removeAbortListener();
    source?.close();
  };

  removeAbortListener = attachAbortListener(signal, () => {
    dispose();
  });

  const connect = () => {
    if (disposed) {
      return;
    }

    source = new EventSource(url, { withCredentials });

    source.addEventListener('open', () => {
      retries = 0;
      onOpen?.();
    });

    source.addEventListener('message', (event: MessageEvent) => {
      if (disposed) {
        return;
      }

      const dataLines = String(event.data ?? '')
        .split('\n')
        .map((line) => `data: ${line}`)
        .join('\n');
      const payloads = parseSSEChunk(dataLines);
      for (const payload of payloads) {
        const finished = handlePayload(payload, {
          onToken,
          onComplete,
          onError,
          dispose,
        });
        if (finished) {
          return;
        }
      }
    });

    const handleError = (event: Event) => {
      if (disposed) {
        return;
      }

      if (retries < retryDelays.length) {
        const delay = retryDelays[retries++];
        onRetry?.(retries, delay);
        source?.close();
        setTimeout(connect, delay);
        return;
      }

      source?.close();
      onError?.(
        new Error(
          event.type === 'error'
            ? 'The chat stream could not be established. Please check your connection and try again.'
            : 'The chat stream was aborted by the server.',
        ),
      );
      dispose();
    };

    source.addEventListener('error', handleError);
    source.addEventListener('aborted', handleError as EventListener);
  };

  connect();

  return dispose;
}

export function openChatStreamFetch(
  url: string,
  options: OpenChatStreamFetchOptions = {},
): () => void {
  const {
    onOpen,
    onToken,
    onComplete,
    onError,
    onRetry,
    signal,
    maxRetries = 2,
    retryDelayMs = 500,
    requestInit,
    fetchImpl = fetch,
  } = options;

  const controller = new AbortController();
  let closed = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const retryDelays = createRetryDelays(maxRetries, retryDelayMs);

  let removeAbortListener = () => {};

  const dispose = () => {
    if (closed) {
      return;
    }
    closed = true;
    removeAbortListener();
    if (!controller.signal.aborted) {
      controller.abort();
    }
    reader?.cancel().catch(() => {});
  };

  removeAbortListener = attachAbortListener(signal, (reason) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
    dispose();
  });

  const start = async () => {
    let attempt = 0;
    while (!closed) {
      try {
        const response = await fetchImpl(url, {
          ...requestInit,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const err = new Error(`Unexpected response (${response.status}) from chat stream.`);
          (err as any).status = response.status;
          // Don't retry on rate limits (429) - they need longer waits
          if (response.status === 429) {
            (err as any).noRetry = true;
          }
          throw err;
        }

        onOpen?.();

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = '';
        let done = false;

        while (!closed && !done) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) {
            buffered += decoder.decode();
            done = true;
            break;
          }

          if (value) {
            buffered += decoder.decode(value, { stream: true });
            const segments = buffered.split(/\n\n/);
            buffered = segments.pop() ?? '';
            for (const segment of segments) {
              const payloads = parseSSEChunk(segment);
              for (const payload of payloads) {
                const finished = handlePayload(payload, {
                  onToken,
                  onComplete,
                  onError,
                  dispose,
                });
                if (finished) {
                  return;
                }
              }
            }
          }
        }

        if (buffered) {
          const payloads = parseSSEChunk(buffered);
          for (const payload of payloads) {
            const finished = handlePayload(payload, {
              onToken,
              onComplete,
              onError,
              dispose,
            });
            if (finished) {
              return;
            }
          }
        }

        if (!closed) {
          onComplete?.();
        }
        dispose();
        return;
      } catch (error) {
        if (closed || controller.signal.aborted) {
          return;
        }

        // Don't retry if explicitly marked as non-retryable (e.g., 429 rate limits)
        const shouldNotRetry = (error as any)?.noRetry === true;
        const retryIndex = attempt++;
        if (!shouldNotRetry && retryIndex < retryDelays.length) {
          const delay = retryDelays[retryIndex];
          onRetry?.(retryIndex + 1, delay);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const normalisedError = normaliseError(
          error,
          'Unable to connect to the chat stream. Please check your network and try again.',
        );
        onError?.(normalisedError);
        dispose();
        return;
      }
    }
  };

  start();

  return dispose;
}
