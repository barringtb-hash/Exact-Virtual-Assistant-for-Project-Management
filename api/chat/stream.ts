import OpenAI from "openai";

interface ControllerEntry {
  threadId: string;
  controller: AbortController;
}

const activeControllers = new Map<string, ControllerEntry>();
const encoder = new TextEncoder();

class ChatRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const runtimeEnv: Record<string, string | undefined> =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as any)?.process?.env !== "undefined"
    ? ((globalThis as any).process.env as Record<string, string | undefined>)
    : {};

const INVALID_CHAT_MODEL_PATTERN = /(realtime|preview|transcribe|stt)/i;
const USES_RESPONSES_PATTERN = /^(gpt-4\.1|gpt-4o)/i;

function resolveChatModel(): string {
  const env = runtimeEnv;
  const candidates = [
    env.chat_model,
    env.CHAT_MODEL,
    env.OPENAI_MODEL,
    env.OPENAI_CHAT_MODEL,
    env.OPENAI_STT_MODEL,
    env.OPENAI_REALTIME_MODEL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    if (!INVALID_CHAT_MODEL_PATTERN.test(trimmed)) {
      return trimmed;
    }

    const fallbackMatch = trimmed.match(
      /^(.*?)(?:[-_](?:realtime|preview|transcribe|stt))+$/i
    );
    const fallback = fallbackMatch?.[1]?.trim();
    if (fallback && !INVALID_CHAT_MODEL_PATTERN.test(fallback)) {
      return fallback;
    }
  }

  return "gpt-4o";
}

const CHAT_MODEL = resolveChatModel();

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.floor(value) : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

const CHAT_PROMPT_TOKEN_LIMIT = parsePositiveInt(
  runtimeEnv.CHAT_PROMPT_TOKEN_LIMIT,
  0
);
const ATTACHMENT_CHUNK_TOKENS = parsePositiveInt(
  runtimeEnv.ATTACHMENT_CHUNK_TOKENS,
  700
);
const ATTACHMENT_SUMMARY_TOKENS = parsePositiveInt(
  runtimeEnv.ATTACHMENT_SUMMARY_TOKENS,
  250
);
const ATTACHMENT_PARALLELISM = parsePositiveInt(
  runtimeEnv.ATTACHMENT_PARALLELISM,
  3
);
const SMALL_ATTACHMENTS_TOKEN_BUDGET = parsePositiveInt(
  runtimeEnv.SMALL_ATTACHMENTS_TOKEN_BUDGET,
  1200
);

const BASE_SYSTEM_PROMPT =
  "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff. Never recommend external blank-charter websites.";

const MAP_SYSTEM_PROMPT =
  "You summarize project attachments. Capture key decisions, owners, deadlines, blockers, and metrics in crisp language. Use bullets only when multiple points exist.";

const REDUCE_SYSTEM_PROMPT =
  "Combine multiple attachment summaries into one concise project-management briefing. Remove redundancy and highlight outcomes, owners, blockers, and next steps.";

const DEFAULT_TOKEN_DIVISOR = 4;

function estimateWordTokens(word: unknown): number {
  if (!word) return 0;
  const trimmed = String(word).trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / DEFAULT_TOKEN_DIVISOR));
}

function estimateTokens(text: unknown): number {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed
    .split(/\s+/)
    .reduce((total, word) => total + estimateWordTokens(word), 0);
}

interface ChunkOptions {
  overlap?: number;
}

function fallbackChunkByTokens(
  text: unknown,
  tokensPerChunk: unknown,
  options: ChunkOptions = {}
): { text: string; tokenCount: number }[] {
  const limit =
    Number.isFinite(tokensPerChunk as number) && (tokensPerChunk as number) > 0
      ? Math.floor(tokensPerChunk as number)
      : 1;
  const overlap =
    Number.isFinite(options.overlap) && (options.overlap ?? 0) > 0
      ? Math.floor(options.overlap ?? 0)
      : 0;

  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const chunks: { text: string; tokenCount: number }[] = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let tokenCount = 0;

    while (end < words.length) {
      const tokenEstimate = estimateWordTokens(words[end]);
      if (end > start && tokenCount + tokenEstimate > limit) {
        break;
      }
      tokenCount += tokenEstimate;
      end += 1;
      if (tokenCount >= limit) {
        break;
      }
    }

    if (end === start) {
      tokenCount = estimateWordTokens(words[end]);
      end += 1;
    }

    const chunkWords = words.slice(start, end);
    const chunkText = chunkWords.join(" ").trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        tokenCount:
          tokenCount || estimateTokens(chunkText) || chunkWords.length,
      });
    }

    if (end >= words.length) {
      break;
    }

    if (overlap > 0) {
      start = Math.max(0, end - overlap);
    } else {
      start = end;
    }
  }

  return chunks;
}

function collectStrings(
  value: unknown,
  bucket: string[],
  seen: Set<unknown>
): void {
  if (value == null) return;
  if (typeof value === "string") {
    bucket.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    bucket.push(String(value));
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, bucket, seen);
    }
    return;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    try {
      collectStrings((value as Record<string, unknown>)[key], bucket, seen);
    } catch {
      // ignore getter errors
    }
  }
}

function countTokens(input: unknown): number {
  const strings: string[] = [];
  collectStrings(input, strings, new Set());
  if (!strings.length) {
    return 0;
  }
  return strings.reduce((sum, str) => sum + estimateTokens(str), 0);
}

function chunkByTokens(
  text: string,
  tokensPerChunk: number,
  options: ChunkOptions = {}
): { text: string; tokenCount: number }[] {
  return fallbackChunkByTokens(text, tokensPerChunk, options);
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Array.isArray(items) || !items.length) return [];
  const safeLimit = Math.max(
    1,
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1
  );
  const results = new Array<R>(items.length);
  let index = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, () =>
    (async () => {
      while (true) {
        const currentIndex = index;
        if (currentIndex >= items.length) break;
        index += 1;
        const value = await worker(items[currentIndex], currentIndex);
        results[currentIndex] = value;
      }
    })()
  );

  await Promise.all(runners);
  return results;
}

function formatMessagesForResponses(messages: any[]): string {
  return (messages || [])
    .map((message: any) => {
      const role = (message?.role || "user").toUpperCase();
      const content =
        typeof message?.content === "string"
          ? message.content
          : JSON.stringify(message?.content ?? "");
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

async function requestChatText(
  client: OpenAI,
  params: { messages: any[]; temperature: number; maxTokens: number }
): Promise<string> {
  const { messages, temperature, maxTokens } = params;
  const useResponses = USES_RESPONSES_PATTERN.test(CHAT_MODEL);
  if (useResponses) {
    const prompt = formatMessagesForResponses(messages);
    const response = await client.responses.create({
      model: CHAT_MODEL,
      temperature,
      input: prompt,
      ...(Number.isFinite(maxTokens) && maxTokens > 0
        ? { max_output_tokens: maxTokens }
        : {}),
    } as any);
    return (response as any).output_text ?? "";
  }

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature,
    messages,
    ...(Number.isFinite(maxTokens) && maxTokens > 0
      ? { max_tokens: maxTokens }
      : {}),
  });
  return completion.choices?.[0]?.message?.content ?? "";
}

async function summarizeText(
  client: OpenAI,
  attachment: { name: string; text: string }
): Promise<string> {
  const name = attachment?.name || "Attachment";
  const text = typeof attachment?.text === "string" ? attachment.text.trim() : "";
  if (!text) return "";

  const chunks = chunkByTokens(text, ATTACHMENT_CHUNK_TOKENS);
  const totalTokens = chunks.reduce((sum, chunk) => sum + (chunk.tokenCount || 0), 0);

  if (!chunks.length) {
    return "";
  }

  if (totalTokens <= SMALL_ATTACHMENTS_TOKEN_BUDGET) {
    return text;
  }

  const limitedChunks = await runWithConcurrency(
    chunks,
    ATTACHMENT_PARALLELISM,
    async (chunk, index) => {
      try {
        const summary = await requestChatText(client, {
          messages: [
            { role: "system", content: MAP_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Attachment: ${name}\nChunk ${index + 1} of ${chunks.length}\n\n${chunk.text}`,
            },
          ],
          temperature: 0.2,
          maxTokens: ATTACHMENT_SUMMARY_TOKENS,
        });
        return summary.trim();
      } catch (error) {
        console.error("map step failed", { name, chunkIndex: index, error });
        return "";
      }
    }
  );

  const mapSummaries = limitedChunks.filter(Boolean);
  if (!mapSummaries.length) {
    return "";
  }

  if (mapSummaries.length === 1) {
    return mapSummaries[0];
  }

  const reducePrompt = mapSummaries
    .map((summary, index) => `(${index + 1}) ${summary}`)
    .join("\n\n");

  try {
    const reduction = await requestChatText(client, {
      messages: [
        { role: "system", content: REDUCE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Attachment: ${name}\n\nChunk summaries:\n${reducePrompt}\n\nDeliver a single consolidated summary.`,
        },
      ],
      temperature: 0.2,
      maxTokens: ATTACHMENT_SUMMARY_TOKENS,
    });

    return reduction.trim() || mapSummaries.join("\n\n");
  } catch (error) {
    console.error("reduce step failed", { name, error });
    return mapSummaries.join("\n\n");
  }
}

interface BuildChatMessagesResult {
  messages: any[];
}

async function buildChatMessages(
  client: OpenAI,
  body: unknown
): Promise<BuildChatMessagesResult> {
  const payload = body && typeof body === "object" ? (body as any) : {};
  const incoming = Array.isArray(payload.messages) ? payload.messages : [];
  const rawAttachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  const attachments = rawAttachments.map((item: any, index: number) => {
    if (!item || typeof item !== "object") {
      throw new ChatRequestError(
        `Attachment at index ${index} must be an object.`,
        400,
        "invalid_attachment"
      );
    }
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : `Attachment ${index + 1}`;
    if (typeof item.text !== "string") {
      throw new ChatRequestError(
        `Attachment "${name}" is missing required text.`,
        400,
        "invalid_attachment"
      );
    }
    const text = item.text.trim();
    if (!text) {
      throw new ChatRequestError(
        `Attachment "${name}" must include non-empty text.`,
        400,
        "invalid_attachment"
      );
    }
    return { name, text };
  });

  if (INVALID_CHAT_MODEL_PATTERN.test(CHAT_MODEL)) {
    throw new ChatRequestError(
      `Model "${CHAT_MODEL}" is incompatible with the chat endpoint. Use a non-realtime model.`,
      400,
      "invalid_model"
    );
  }

  const attachmentSummaries = await Promise.all(
    attachments.map((attachment) => summarizeText(client, attachment))
  );

  const attachmentsBlock = attachments
    .map((att, index) => {
      const summary = attachmentSummaries[index];
      if (!summary) return "";
      return `### ${att.name}\n${summary}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const systemContent = attachmentsBlock
    ? `${attachmentsBlock}\n\n${BASE_SYSTEM_PROMPT}`
    : BASE_SYSTEM_PROMPT;

  const system = {
    role: "system",
    content: systemContent,
  };

  const historyLimit = 17;
  const trimmedIncoming = incoming.slice(-historyLimit);
  const messages = [system, ...trimmedIncoming];

  if (CHAT_PROMPT_TOKEN_LIMIT > 0) {
    const promptTokens = countTokens(messages);
    if (promptTokens > CHAT_PROMPT_TOKEN_LIMIT) {
      throw new ChatRequestError(
        `Message payload exceeds ${CHAT_PROMPT_TOKEN_LIMIT} token limit (approx ${promptTokens}).`,
        400,
        "prompt_too_large"
      );
    }
  }

  return { messages };
}

function mapChatOpenAIError(
  status: number,
  rawMessage: string
): { status: number; message: string; code: string } | null {
  const normalizedStatus = Number.isFinite(status)
    ? status
    : Number.parseInt(String(status), 10) || 0;
  const message = (rawMessage || "") + "";

  if (
    normalizedStatus === 400 ||
    /model .*does not exist|unsupported|invalid/i.test(message)
  ) {
    return {
      status: 400,
      message: `Model "${CHAT_MODEL}" isn’t available for this endpoint/key. Try "gpt-4.1-mini" or update access.`,
      code: "invalid_model",
    };
  }

  if (normalizedStatus === 404) {
    return {
      status: 400,
      message: `Model "${CHAT_MODEL}" not found for this key.`,
      code: "invalid_model",
    };
  }

  if (normalizedStatus === 429) {
    return {
      status: 429,
      message: "Rate limit reached. Please retry shortly.",
      code: "rate_limited",
    };
  }

  if (normalizedStatus === 503) {
    return {
      status: 503,
      message: "OpenAI service unavailable. Please retry shortly.",
      code: "service_unavailable",
    };
  }

  return null;
}

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
