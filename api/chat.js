// /api/chat.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import { registerStreamController } from "./chat/streamingState.js";
import { chunkByTokens, countTokens } from "../lib/tokenize.js";

export class ChatRequestError extends Error {
  constructor(message, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let OpenAIClient = OpenAI;

export function __setOpenAIClient(override) {
  OpenAIClient = override || OpenAI;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

const runtimeEnv =
  typeof process !== "undefined"
    ? process.env ?? {}
    : typeof globalThis !== "undefined" && globalThis.process?.env
      ? globalThis.process.env
      : {};

const envSizeLimit = runtimeEnv.CHAT_MAX_BODY;
if (typeof envSizeLimit === "string" && envSizeLimit.trim().length > 0) {
  config.api.bodyParser.sizeLimit = envSizeLimit;
}

const rawChatMaxDuration = runtimeEnv.CHAT_MAX_DURATION;
const durationSource =
  typeof rawChatMaxDuration === "string" && rawChatMaxDuration.trim().length > 0
    ? rawChatMaxDuration
    : "60";
const chatMaxDuration = Number.parseInt(durationSource, 10);
if (Number.isFinite(chatMaxDuration) && chatMaxDuration > 0) {
  config.api.maxDuration = chatMaxDuration;
}

export const INVALID_CHAT_MODEL_PATTERN = /(realtime|preview|transcribe|stt)/i;
export const USES_RESPONSES_PATTERN = /^(gpt-4\.1|gpt-4o|gpt-5)/i;

function resolveChatModel() {
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

  return "gpt-5-mini";
}

export const CHAT_MODEL = resolveChatModel();
const CHAT_PROMPT_TOKEN_LIMIT = parsePositiveInt(
  runtimeEnv.CHAT_PROMPT_TOKEN_LIMIT,
  0
);
const ATTACHMENT_CHUNK_TOKENS = parsePositiveInt(runtimeEnv.ATTACHMENT_CHUNK_TOKENS, 700);
const ATTACHMENT_SUMMARY_TOKENS = parsePositiveInt(runtimeEnv.ATTACHMENT_SUMMARY_TOKENS, 250);
const ATTACHMENT_PARALLELISM = parsePositiveInt(runtimeEnv.ATTACHMENT_PARALLELISM, 3);
const SMALL_ATTACHMENTS_TOKEN_BUDGET = parsePositiveInt(
  runtimeEnv.SMALL_ATTACHMENTS_TOKEN_BUDGET,
  1200
);

const BASE_SYSTEM_PROMPT = `You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff. Never recommend external blank-charter websites.

IMPORTANT - Voice Charter Detection:
When a user mentions wanting to create, start, draft, or work on a project charter (or similar document), you should:
1. Acknowledge their intent
2. Ask if they would like voice-guided assistance to walk through the charter fields
3. Include the marker [[VOICE_CHARTER_INTENT]] at the END of your response (this triggers the voice charter UI)

Examples of charter intent:
- "I want to create a project charter"
- "Help me document this project"
- "I need to start a new charter"
- "Let's formalize this project"
- "Can you help me with a charter?"

When you detect charter intent, respond naturally and include the marker. For example:
"It sounds like you'd like to create a project charter. I can guide you through each section using voice - would you like to start the voice-guided charter process? [[VOICE_CHARTER_INTENT]]"

Do NOT include the marker for general questions about charters or when the user is just asking for information.`;

const MAP_SYSTEM_PROMPT =
  "You summarize project attachments. Capture key decisions, owners, deadlines, blockers, and metrics in crisp language. Use bullets only when multiple points exist.";

const REDUCE_SYSTEM_PROMPT =
  "Combine multiple attachment summaries into one concise project-management briefing. Remove redundancy and highlight outcomes, owners, blockers, and next steps.";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function summarizeText(client, attachment) {
  const name = attachment?.name || "Attachment";
  const text = typeof attachment?.text === "string" ? attachment.text.trim() : "";
  if (!text) return "";

  const chunks = chunkByTokens(text, ATTACHMENT_CHUNK_TOKENS, {
    model: CHAT_MODEL,
  });
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

export function formatMessagesForResponses(messages) {
  return (messages || [])
    .map((message) => {
      const role = (message?.role || "user").toUpperCase();
      const content =
        typeof message?.content === "string"
          ? message.content
          : JSON.stringify(message?.content ?? "");
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

async function requestChatText(client, { messages, temperature, maxTokens }) {
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
    });
    return response.output_text ?? "";
  }

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature,
    messages,
    ...(Number.isFinite(maxTokens) && maxTokens > 0 ? { max_tokens: maxTokens } : {}),
  });
  return completion.choices?.[0]?.message?.content ?? "";
}

export function mapChatOpenAIError(status, rawMessage) {
  const normalizedStatus = Number.isFinite(status) ? status : Number.parseInt(status, 10) || 0;
  const message = (rawMessage || "") + "";

  if (normalizedStatus === 400 || /model .*does not exist|unsupported|invalid/i.test(message)) {
    return {
      status: 400,
      message: `Model "${CHAT_MODEL}" isn't available for this endpoint/key. Check your OpenAI account has access to this model.`,
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

class OpenAIStreamError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseSSEEvent(rawEvent) {
  const lines = String(rawEvent ?? "").split(/\r?\n/);
  const event = { event: "message", data: "" };
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith(":")) continue;
    const [field, ...rest] = line.split(":");
    if (!field) continue;
    const value = rest.join(":").trimStart();
    if (field === "event") {
      event.event = value || "message";
    } else if (field === "data") {
      event.data = value ? event.data + value : event.data;
    }
  }
  return event;
}

function extractDeltaFromChoice(choice) {
  const delta = choice?.delta || choice?.message?.delta || choice?.message;
  if (typeof delta === "string") {
    return delta;
  }
  if (typeof delta?.content === "string") {
    return delta.content;
  }
  if (Array.isArray(delta?.content)) {
    const texts = delta.content
      .filter(
        (part) => part && typeof part === "object" && part.type === "text"
      )
      .map((part) => (typeof part.text === "string" ? part.text : ""))
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
  if (
    typeof delta?.content?.[0]?.type === "string" &&
    delta.content[0].type === "text"
  ) {
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
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .filter(Boolean)
      .join("");
    return joined || null;
  }
  if (typeof delta?.content?.[0]?.parts === "string") {
    return delta.content[0].parts;
  }
  return typeof delta?.content === "string" ? delta.content : null;
}

function handleOpenAIEvent(rawEvent, useResponses, send, status) {
  if (!rawEvent) return;
  const { data } = parseSSEEvent(rawEvent);
  if (!data) return;
  if (data === "[DONE]") {
    return "done";
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }

  if (useResponses) {
    const type = parsed?.type;
    if (type === "response.output_text.delta") {
      const delta =
        typeof parsed?.delta === "string"
          ? parsed.delta
          : parsed?.delta?.text;
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

async function streamFromOpenAI({ client, messages, signal, send }) {
  const useResponses = USES_RESPONSES_PATTERN.test(CHAT_MODEL);

  const firstNonEmpty = (...candidates) => {
    for (const value of candidates) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return "";
  };

  try {
    if (useResponses) {
      const stream = await client.responses.create(
        {
          model: CHAT_MODEL,
          temperature: 0.3,
          input: formatMessagesForResponses(messages),
          stream: true,
        },
        { signal }
      );

      for await (const event of stream) {
        if (!event) continue;

        if (event.type === "response.output_text.delta") {
          const delta = firstNonEmpty(event.delta);
          if (delta) {
            send("token", { delta });
          }
          continue;
        }

        if (event.type === "response.completed") {
          return;
        }

        if (event.type === "error") {
          const message = firstNonEmpty(
            event.message,
            "OpenAI streaming error"
          );
          const code = firstNonEmpty(event.code, "openai_error");
          throw new OpenAIStreamError(message, 500, code || "openai_error");
        }

        if (event.type === "response.failed") {
          const errorInfo = event.response?.error;
          const message = firstNonEmpty(
            errorInfo?.message,
            "OpenAI streaming error"
          );
          const code = firstNonEmpty(errorInfo?.code, "openai_error");
          throw new OpenAIStreamError(message, 500, code || "openai_error");
        }

        if (event.type === "response.incomplete") {
          const reason = firstNonEmpty(event.response?.incomplete_details?.reason);
          const message =
            reason === "max_output_tokens"
              ? "OpenAI stopped early because max_output_tokens was reached."
              : reason === "content_filter"
                ? "OpenAI stopped the response due to content filtering."
                : "OpenAI response ended prematurely.";
          const code = reason || "openai_incomplete";
          throw new OpenAIStreamError(message, 500, code);
        }
      }

      return;
    }

    const stream = await client.chat.completions.create(
      {
        model: CHAT_MODEL,
        temperature: 0.3,
        messages,
        stream: true,
      },
      { signal }
    );

    for await (const chunk of stream) {
      const choices = chunk?.choices;
      if (!Array.isArray(choices)) continue;

      for (const choice of choices) {
        const text = extractDeltaFromChoice(choice);
        if (typeof text === "string" && text) {
          send("token", { delta: text });
        }
        if (choice?.finish_reason === "stop") {
          return;
        }
      }
    }
  } catch (error) {
    if (signal?.aborted && error?.name === "AbortError") {
      throw error;
    }

    if (error instanceof OpenAIStreamError) {
      throw error;
    }

    const status = (() => {
      if (Number.isFinite(error?.status) && error.status > 0) {
        return error.status;
      }
      if (Number.isFinite(error?.statusCode) && error.statusCode > 0) {
        return error.statusCode;
      }
      if (Number.isFinite(error?.response?.status) && error.response.status > 0) {
        return error.response.status;
      }
      return 500;
    })();

    const message =
      firstNonEmpty(
        error?.error?.message,
        error?.response?.error?.message,
        error?.message,
        "OpenAI request failed"
      ) || "OpenAI request failed";

    const code =
      firstNonEmpty(
        error?.error?.code,
        error?.response?.error?.code,
        error?.code,
        "openai_error"
      ) || "openai_error";

    throw new OpenAIStreamError(message, status, code);
  }
}

function mapStreamError(err) {
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

async function runWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || !items.length) return [];
  const safeLimit = Math.max(1, Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1);
  const results = new Array(items.length);
  let index = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (true) {
      const currentIndex = index;
      if (currentIndex >= items.length) break;
      index += 1;
      const value = await worker(items[currentIndex], currentIndex);
      results[currentIndex] = value;
    }
  });

  await Promise.all(runners);
  return results;
}

export async function buildChatMessages(client, body) {
  const payload = body && typeof body === "object" ? body : {};
  const incoming = Array.isArray(payload.messages) ? payload.messages : [];
  const rawAttachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  const attachments = rawAttachments.map((item, index) => {
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
    const promptTokens = countTokens(messages, { model: CHAT_MODEL });
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  try {
    const apiKey = (runtimeEnv.OPENAI_API_KEY || "").toString().trim();
    if (!apiKey) {
      res.status(500).json({ error: "Missing OpenAI API key" });
      return;
    }

    const client = new OpenAIClient({ apiKey });
    const body = req.body || {};

    const wantsStream = (() => {
      const value = body?.stream;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "true" || normalized === "1";
      }
      return Boolean(value);
    })();

    if (wantsStream) {
      const clientStreamId =
        typeof body?.clientStreamId === "string"
          ? body.clientStreamId.trim()
          : "";
      const threadId =
        typeof body?.threadId === "string" ? body.threadId.trim() : "";

      if (!clientStreamId) {
        res
          .status(400)
          .json({ error: "clientStreamId is required", code: "invalid_request" });
        return;
      }

      if (!threadId) {
        res
          .status(400)
          .json({ error: "threadId is required", code: "invalid_request" });
        return;
      }

      const abortController = new AbortController();
      let unregister;

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.status(200);
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      const send = (event, data) => {
        let payload = `event: ${event}\n`;
        if (typeof data !== "undefined") {
          const serialized =
            typeof data === "string" ? data : JSON.stringify(data);
          payload += `data: ${serialized}\n`;
        }
        payload += "\n";
        try {
          res.write(payload);
        } catch {
          // ignore write errors triggered by closed sockets
        }
      };

      const keepAlive = setInterval(() => {
        try {
          res.write(": keep-alive\n\n");
        } catch {
          // ignore keep-alive write errors
        }
      }, 15000);

      let cleaned = false;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(keepAlive);
        abortController.signal.removeEventListener("abort", onAbort);
        removeCloseListeners();
        unregister?.();
      };

      function onAbort() {
        if (abortController.signal.reason === "replaced") {
          send("aborted");
        }
        cleanup();
        try {
          res.end();
        } catch {
          // ignore end errors
        }
      }

      const onClose = () => {
        cleanup();
        if (!abortController.signal.aborted) {
          abortController.abort("client_closed");
        }
      };

      function removeCloseListeners() {
        if (typeof req?.off === "function") {
          req.off("close", onClose);
        } else if (typeof req?.removeListener === "function") {
          req.removeListener("close", onClose);
        }
        if (typeof res?.off === "function") {
          res.off("close", onClose);
        } else if (typeof res?.removeListener === "function") {
          res.removeListener("close", onClose);
        }
      }

      abortController.signal.addEventListener("abort", onAbort);
      if (typeof req?.on === "function") {
        req.on("close", onClose);
      }
      if (typeof res?.on === "function") {
        res.on("close", onClose);
      }

      try {
        unregister = registerStreamController(
          clientStreamId,
          threadId,
          abortController
        );
      } catch (registrationError) {
        cleanup();
        res.status(400).json({
          error: registrationError?.message || "Invalid clientStreamId",
          code: "invalid_request",
        });
        return;
      }

      if (abortController.signal.aborted) {
        onAbort();
        return;
      }

      let messages;
      try {
        ({ messages } = await buildChatMessages(client, body));
      } catch (prepErr) {
        const mapped = mapStreamError(prepErr);
        send("error", mapped);
        cleanup();
        try {
          res.end();
        } catch {
          // ignore end errors
        }
        return;
      }

      try {
        await streamFromOpenAI({
          client,
          messages,
          signal: abortController.signal,
          send,
        });
        if (!abortController.signal.aborted) {
          send("done");
        }
      } catch (streamErr) {
        if (!abortController.signal.aborted) {
          const mapped = mapStreamError(streamErr);
          send("error", mapped);
        }
      } finally {
        cleanup();
        if (!abortController.signal.aborted) {
          try {
            res.end();
          } catch {
            // ignore end errors
          }
        }
      }

      return;
    }

    let messages;
    try {
      ({ messages } = await buildChatMessages(client, body));
    } catch (prepErr) {
      if (prepErr instanceof ChatRequestError) {
        res
          .status(prepErr.status)
          .json({ error: prepErr.message, code: prepErr.code });
        return;
      }
      throw prepErr;
    }

    let reply = "";
    try {
      reply = await requestChatText(client, {
        messages,
        temperature: 0.3,
      });
    } catch (apiErr) {
      const status = apiErr?.status || apiErr?.response?.status;
      const message =
        apiErr?.error?.message ||
        apiErr?.response?.data?.error?.message ||
        apiErr?.message ||
        "OpenAI request failed";

      const mapped = mapChatOpenAIError(status, message);
      if (mapped) {
        res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
        return;
      }

      throw apiErr;
    }

    if (!reply.trim()) {
      reply = "I couldn’t produce a reply for this prompt.";
    }

    res.status(200).json({ reply });
  } catch (err) {
    try {
      console.error("API /api/chat error", {
        chatModel: CHAT_MODEL,
        message: err?.message,
        causeMessage: err?.cause?.message,
        error: err,
      });
    } catch (loggingError) {
      // Intentionally ignore logging failures in restricted runtimes.
    }
    const message = err?.message || "Unknown error";
    const status = message.startsWith("Attachment")
      ? 400
      : /rate limit/i.test(message)
      ? 429
      : /unavailable|timeout/i.test(message)
      ? 503
      : 500;
    res.status(status).json({ error: message });
  }
}
