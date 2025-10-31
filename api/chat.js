// /api/chat.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import { chunkByTokens, countTokens } from "../lib/tokenize.js";

export class ChatRequestError extends Error {
  constructor(message, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

const envSizeLimit = process.env.CHAT_MAX_BODY;
if (typeof envSizeLimit === "string" && envSizeLimit.trim().length > 0) {
  config.api.bodyParser.sizeLimit = envSizeLimit;
}

const rawChatMaxDuration = process.env.CHAT_MAX_DURATION;
const durationSource =
  typeof rawChatMaxDuration === "string" && rawChatMaxDuration.trim().length > 0
    ? rawChatMaxDuration
    : "60";
const chatMaxDuration = Number.parseInt(durationSource, 10);
if (Number.isFinite(chatMaxDuration) && chatMaxDuration > 0) {
  config.api.maxDuration = chatMaxDuration;
}

export const INVALID_CHAT_MODEL_PATTERN = /(realtime|preview|transcribe|stt)/i;
export const USES_RESPONSES_PATTERN = /^(gpt-4\.1|gpt-4o)/i;

function resolveChatModel() {
  const env = process?.env ?? {};
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

export const CHAT_MODEL = resolveChatModel();
const CHAT_PROMPT_TOKEN_LIMIT = parsePositiveInt(
  process.env.CHAT_PROMPT_TOKEN_LIMIT,
  0
);
const ATTACHMENT_CHUNK_TOKENS = parsePositiveInt(process.env.ATTACHMENT_CHUNK_TOKENS, 700);
const ATTACHMENT_SUMMARY_TOKENS = parsePositiveInt(process.env.ATTACHMENT_SUMMARY_TOKENS, 250);
const ATTACHMENT_PARALLELISM = parsePositiveInt(process.env.ATTACHMENT_PARALLELISM, 3);
const SMALL_ATTACHMENTS_TOKEN_BUDGET = parsePositiveInt(
  process.env.SMALL_ATTACHMENTS_TOKEN_BUDGET,
  1200
);

const BASE_SYSTEM_PROMPT =
  "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff. Never recommend external blank-charter websites.";

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
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const body = req.body || {};

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
