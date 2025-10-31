import OpenAI from "openai";
import {
  buildChatMessages,
  CHAT_MODEL,
  ChatRequestError,
  USES_RESPONSES_PATTERN,
  formatMessagesForResponses,
  mapChatOpenAIError,
} from "../chat.js";

interface ControllerEntry {
  threadId: string;
  controller: AbortController;
}

const activeControllers = new Map<string, ControllerEntry>();
const encoder = new TextEncoder();

export const config = { runtime: "edge" };

class OpenAIStreamError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "openai_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isStreamingEnabled(url: URL): boolean {
  const envValue = ((globalThis as any)?.process?.env?.CHAT_STREAMING ?? "")
    .toString()
    .trim()
    .toLowerCase();
  if (envValue === "1" || envValue === "true" || envValue === "on") {
    return true;
  }
  const queryValue = (url.searchParams.get("stream") || "")
    .toString()
    .trim()
    .toLowerCase();
  return queryValue === "1" || queryValue === "true";
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function parseSSEEvent(rawEvent: string): { event?: string; data?: string } {
  const lines = rawEvent.split(/\r?\n/);
  let eventName: string | undefined;
  let data: string | undefined;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith(":")) {
      continue;
    }
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      data = data ? `${data}\n${value}` : value;
    }
  }
  return { event: eventName, data };
}

function extractDeltaFromChoice(choice: any): string | null {
  const delta = choice?.delta;
  if (!delta) return null;
  if (typeof delta?.content === "string") {
    return delta.content;
  }
  if (Array.isArray(delta?.content)) {
    const texts = delta.content
      .filter((part: any) => part && typeof part === "object" && part.type === "text")
      .map((part: any) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean);
    if (texts.length) {
      return texts.join("");
    }
  }
  if (typeof delta?.content?.[0]?.text === "string") {
    return delta.content[0].text;
  }
  if (typeof delta?.content?.text === "string") {
    return delta.content.text;
  }
  if (typeof delta?.content?.[0]?.type === "string" && delta.content[0].type === "text") {
    const value = delta.content[0]?.text;
    return typeof value === "string" ? value : null;
  }
  if (typeof delta?.content?.delta === "string") {
    return delta.content.delta;
  }
  if (typeof delta?.content?.[0]?.delta === "string") {
    return delta.content[0].delta;
  }
  if (typeof delta?.content?.parts === "string") {
    return delta.content.parts;
  }
  if (Array.isArray(delta?.content?.parts)) {
    const joined = delta.content.parts
      .map((part: any) => (typeof part === "string" ? part : part?.text || ""))
      .filter(Boolean)
      .join("");
    return joined || null;
  }
  if (typeof delta?.content?.[0]?.parts === "string") {
    return delta.content[0].parts;
  }
  return typeof delta?.content === "string" ? delta.content : null;
}

async function streamFromOpenAI(params: {
  apiKey: string;
  messages: any[];
  signal: AbortSignal;
  send: (event: string, data?: unknown) => void;
}): Promise<void> {
  const { apiKey, messages, signal, send } = params;
  const useResponses = USES_RESPONSES_PATTERN.test(CHAT_MODEL);
  const endpoint = useResponses
    ? "https://api.openai.com/v1/responses"
    : "https://api.openai.com/v1/chat/completions";
  const payload = useResponses
    ? {
        model: CHAT_MODEL,
        temperature: 0.3,
        input: formatMessagesForResponses(messages),
        stream: true,
      }
    : {
        model: CHAT_MODEL,
        temperature: 0.3,
        messages,
        stream: true,
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let message = `OpenAI request failed (${response.status})`;
    let code = "openai_error";
    try {
      const raw = await response.json();
      const errorMessage = raw?.error?.message;
      const errorCode = raw?.error?.code;
      if (typeof errorMessage === "string" && errorMessage.trim()) {
        message = errorMessage.trim();
      }
      if (typeof errorCode === "string" && errorCode.trim()) {
        code = errorCode.trim();
      }
    } catch {
      // ignore JSON parsing failures
    }
    throw new OpenAIStreamError(message, response.status, code);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new OpenAIStreamError("OpenAI response missing body", response.status, "empty_response");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let outcome: "done" | void;
      try {
        outcome = handleOpenAIEvent(rawEvent, useResponses, send, response.status);
      } catch (error) {
        try {
          await reader.cancel(error as Error);
        } catch {
          // ignore reader cancellation failures
        }
        throw error;
      }
      if (outcome === "done") {
        try {
          await reader.cancel();
        } catch {
          // ignore reader cancellation failures
        }
        return;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    let outcome: "done" | void;
    try {
      outcome = handleOpenAIEvent(buffer, useResponses, send, response.status);
    } catch (error) {
      try {
        await reader.cancel(error as Error);
      } catch {
        // ignore reader cancellation failures
      }
      throw error;
    }
    if (outcome === "done") {
      try {
        await reader.cancel();
      } catch {
        // ignore reader cancellation failures
      }
      return;
    }
  }
}

function handleOpenAIEvent(
  rawEvent: string,
  useResponses: boolean,
  send: (event: string, data?: unknown) => void,
  status: number
): "done" | void {
  if (!rawEvent) return;
  const { data } = parseSSEEvent(rawEvent);
  if (!data) return;
  if (data === "[DONE]") {
    return "done";
  }

  let parsed: any;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }

  if (useResponses) {
    const type = parsed?.type;
    if (type === "response.output_text.delta") {
      const delta = typeof parsed?.delta === "string" ? parsed.delta : parsed?.delta?.text;
      if (typeof delta === "string" && delta) {
        send("token", { delta });
      }
      return;
    } else if (type === "response.error") {
      const message = parsed?.error?.message || "OpenAI streaming error";
      const code = parsed?.error?.code || "openai_error";
      throw new OpenAIStreamError(message, status, code);
    } else if (type === "response.completed") {
      return "done";
    }
    return;
  }

  const choices = parsed?.choices;
  if (!Array.isArray(choices)) {
    return;
  }

  for (const choice of choices) {
    const text = extractDeltaFromChoice(choice);
    if (typeof text === "string" && text) {
      send("token", { delta: text });
    }
    if (choice?.finish_reason === "stop") {
      return "done";
    }
  }
}

function mapStreamError(err: unknown): { message: string; code: string } {
  if (err instanceof ChatRequestError) {
    return { message: err.message, code: err.code };
  }
  if (err instanceof OpenAIStreamError) {
    const mapped = mapChatOpenAIError(err.status, err.message);
    if (mapped) {
      return { message: mapped.message, code: mapped.code };
    }
    return { message: err.message || "OpenAI request failed", code: err.code };
  }
  if (err instanceof Error) {
    return { message: err.message || "Unexpected error", code: "internal_error" };
  }
  return { message: "Unexpected error", code: "internal_error" };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const url = new URL(req.url);
  if (!isStreamingEnabled(url)) {
    return jsonResponse(404, { error: "Streaming disabled" });
  }

  const apiKey = ((globalThis as any)?.process?.env?.OPENAI_API_KEY ?? "")
    .toString()
    .trim();
  if (!apiKey) {
    return jsonResponse(500, { error: "Missing OpenAI API key" });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  const threadId = (url.searchParams.get("threadId") || body?.threadId || "")
    .toString()
    .trim();
  const clientStreamId = (url.searchParams.get("clientStreamId") || body?.clientStreamId || "")
    .toString()
    .trim();

  if (!threadId) {
    return jsonResponse(400, { error: "threadId is required" });
  }
  if (!clientStreamId) {
    return jsonResponse(400, { error: "clientStreamId is required" });
  }

  const openai = new OpenAI({ apiKey });
  const abortController = new AbortController();

  for (const [existingId, entry] of activeControllers.entries()) {
    if (entry.threadId === threadId && existingId !== clientStreamId) {
      try {
        entry.controller.abort("replaced");
      } catch {
        // ignore abort failures
      }
      activeControllers.delete(existingId);
    }
  }

  activeControllers.set(clientStreamId, { threadId, controller: abortController });

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let cleaned = false;
      const send = (event: string, data?: unknown) => {
        let payload = `event: ${event}\n`;
        if (typeof data !== "undefined") {
          const serialized =
            typeof data === "string" ? data : JSON.stringify(data);
          payload += `data: ${serialized}\n`;
        }
        payload += "\n";
        streamController.enqueue(encoder.encode(payload));
      };

      const keepAlive = setInterval(() => {
        streamController.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15000);

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(keepAlive);
        abortController.signal.removeEventListener("abort", onAbort);
        const existing = activeControllers.get(clientStreamId);
        if (existing && existing.controller === abortController) {
          activeControllers.delete(clientStreamId);
        }
      };

      const onAbort = () => {
        if (abortController.signal.reason === "replaced") {
          send("aborted");
        }
        cleanup();
        try {
          streamController.close();
        } catch {
          // ignore close errors
        }
      };

      abortController.signal.addEventListener("abort", onAbort);

      let messages: any[];
      try {
        ({ messages } = await buildChatMessages(openai, body));
      } catch (err) {
        const mapped = mapStreamError(err);
        send("error", mapped);
        cleanup();
        streamController.close();
        return;
      }

      try {
        await streamFromOpenAI({
          apiKey,
          messages,
          signal: abortController.signal,
          send,
        });
        if (!abortController.signal.aborted) {
          send("done");
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          const mapped = mapStreamError(err);
          send("error", mapped);
        }
      } finally {
        cleanup();
        if (!abortController.signal.aborted) {
          try {
            streamController.close();
          } catch {
            // ignore close errors
          }
        }
      }
    },
    cancel(reason) {
      if (!abortController.signal.aborted) {
        abortController.abort(reason ?? "client_cancelled");
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
