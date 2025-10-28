// /api/chat.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import { chunkByTokens, countTokens } from "../lib/tokenize.js";
import { ACTIONS } from "./_actions/registry.js";

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

const INVALID_CHAT_MODEL_PATTERN = /(realtime|preview|transcribe|stt)/i;
const USES_RESPONSES_PATTERN = /^(gpt-4\.1|gpt-4o)/i;

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

const CONTRACT_LINE =
  "Contract: propose_actions -> ACTIONS registry (charter.extract, charter.validate, charter.render).";

const tools = [
  {
    type: "function",
    function: {
      name: "propose_actions",
      description:
        "Suggest follow-up project charter actions that can optionally run immediately when execution is enabled.",
      parameters: {
        type: "object",
        properties: {
          operationId: {
            type: "string",
            description:
              "Correlates proposed actions with their originating reasoning for downstream tracking.",
          },
          actions: {
            type: "array",
            description: "Ordered list of registry actions to consider running.",
            items: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  description: "Registry action key, such as charter.extract or charter.render.",
                },
                label: {
                  type: "string",
                  description:
                    "Optional human-readable label describing the action for UI surfaces.",
                },
                payload: {
                  type: "object",
                  description:
                    "JSON payload forwarded to the registry action when executed.",
                  additionalProperties: true,
                },
                executeNow: {
                  type: "boolean",
                  description:
                    "Marks whether the action should execute immediately when execution is enabled.",
                },
              },
              required: ["action"],
              additionalProperties: true,
            },
            default: [],
          },
        },
        required: ["actions"],
        additionalProperties: false,
      },
    },
  },
];

function safeParse(json, fallback = null) {
  if (typeof json !== "string" || !json.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(json);
  } catch (err) {
    return fallback;
  }
}

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

function formatMessagesForResponses(messages) {
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  try {
    const body = req.body || {};
    // Expect: { messages: [{role, content}, ...], attachments?: [{ name, text }] }
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];

    const attachments = rawAttachments.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Attachment at index ${index} must be an object.`);
      }
      const name = typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : `Attachment ${index + 1}`;
      if (typeof item.text !== "string") {
        throw new Error(`Attachment "${name}" is missing required text.`);
      }
      const text = item.text.trim();
      if (!text) {
        throw new Error(`Attachment "${name}" must include non-empty text.`);
      }
      return { name, text };
    });

    if (INVALID_CHAT_MODEL_PATTERN.test(CHAT_MODEL)) {
      res.status(400).json({
        error: `Model "${CHAT_MODEL}" is incompatible with the chat endpoint. Use a non-realtime model.`,
      });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      ? `${attachmentsBlock}\n\n${BASE_SYSTEM_PROMPT}\n\n${CONTRACT_LINE}`
      : `${BASE_SYSTEM_PROMPT}\n\n${CONTRACT_LINE}`;

    const system = {
      role: "system",
      content: systemContent,
    };

    const historyLimit = 17; // keep total messages (including system) at roughly 18
    const trimmedIncoming = incoming.slice(-historyLimit);
    const messages = [system, ...trimmedIncoming];

    if (CHAT_PROMPT_TOKEN_LIMIT > 0) {
      const promptTokens = countTokens(messages, { model: CHAT_MODEL });
      if (promptTokens > CHAT_PROMPT_TOKEN_LIMIT) {
        res.status(400).json({
          error: `Message payload exceeds ${CHAT_PROMPT_TOKEN_LIMIT} token limit (approx ${promptTokens}).`,
        });
        return;
      }
    }

    let reply = "";
    let actions = [];
    let operationId = null;
    try {
      const result = await requestChatCompletionWithActions(client, {
        messages,
        temperature: 0.3,
      });
      reply = typeof result.reply === "string" ? result.reply : "";
      actions = Array.isArray(result.actions) ? result.actions : [];
      operationId = result.operationId;
    } catch (apiErr) {
      const status = apiErr?.status || apiErr?.response?.status;
      const message =
        apiErr?.error?.message ||
        apiErr?.response?.data?.error?.message ||
        apiErr?.message ||
        "OpenAI request failed";

      if (status === 400 || /model .*does not exist|unsupported|invalid/i.test(message)) {
        res.status(400).json({
          error: `Model "${CHAT_MODEL}" isn’t available for this endpoint/key. Try "gpt-4.1-mini" or update access.`,
        });
        return;
      }
      if (status === 404) {
        res.status(400).json({ error: `Model "${CHAT_MODEL}" not found for this key.` });
        return;
      }
      if (status === 429) {
        res.status(429).json({ error: "Rate limit reached. Please retry shortly." });
        return;
      }
      if (status === 503) {
        res.status(503).json({ error: "OpenAI service unavailable. Please retry shortly." });
        return;
      }

      throw apiErr;
    }

    if (!reply.trim()) {
      reply = "I couldn’t produce a reply for this prompt.";
    }

    const shouldExecuteFlag = isTruthy(body?.execute) || isTruthy(req?.query?.execute);
    const executed = [];
    const normalizedActions = Array.isArray(actions) ? actions : [];

    let lastCharterPayload;
    const filteredActions = [];
    for (const action of normalizedActions) {
      const name = typeof action?.action === "string" ? action.action.trim() : "";
      if (!name) {
        continue;
      }

      const label =
        typeof action?.label === "string" && action.label.trim()
          ? action.label.trim()
          : undefined;
      const requestedExecute = action?.executeNow === true;
      let payload = action?.payload;
      if (payload === null || payload === undefined) {
        payload = undefined;
      }

      if (
        (payload === undefined || payload === null) &&
        lastCharterPayload &&
        /^charter\./.test(name)
      ) {
        payload = { charter: lastCharterPayload };
      }

      if (
        payload &&
        typeof payload === "object" &&
        payload.charter &&
        typeof payload.charter === "object"
      ) {
        lastCharterPayload = payload.charter;
      }

      const willExecute = requestedExecute && shouldExecuteFlag;
      const normalized = {
        action: name,
        executeNow: willExecute,
      };
      if (label) {
        normalized.label = label;
      }
      if (payload !== undefined) {
        normalized.payload = payload;
      }

      if (willExecute) {
        const executor = ACTIONS.get(name);
        if (!executor) {
          executed.push({
            action: name,
            ok: false,
            error: `No executor registered for action "${name}"`,
          });
        } else {
          const execArgs = buildExecutorArgs(req, payload);
          try {
            const outcome = await executor(execArgs);
            if (
              outcome &&
              typeof outcome === "object" &&
              outcome.charter &&
              typeof outcome.charter === "object"
            ) {
              lastCharterPayload = outcome.charter;
            }
            executed.push({ action: name, ok: true });
          } catch (error) {
            executed.push({
              action: name,
              ok: false,
              error: error?.message || "Action execution failed",
            });
          }
        }
      }

      filteredActions.push(normalized);
    }

    res.status(200).json({
      reply,
      actions: filteredActions,
      executed,
      operationId: operationId ?? null,
    });
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

function isTruthy(value) {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
}

function buildExecutorArgs(req, payload) {
  const args = { req };
  if (payload === undefined) {
    return args;
  }

  if (payload && typeof payload === "object") {
    if ("body" in payload) {
      args.body = payload.body;
    }
    if ("payload" in payload) {
      args.payload = payload.payload;
    }
    if ("charter" in payload) {
      args.charter = payload.charter;
    }
    if (!("body" in payload) && !("payload" in payload) && !("charter" in payload)) {
      args.payload = payload;
    }
  } else {
    args.payload = payload;
  }

  return args;
}

function normalizeMessageForResponses(message) {
  const role = typeof message?.role === "string" ? message.role : "user";
  const content = message?.content;

  if (Array.isArray(content)) {
    const normalized = content
      .map((part) => {
        if (part && typeof part === "object") {
          if (typeof part.type === "string" && part.type !== "text") {
            return part;
          }

          if (typeof part.text === "string") {
            return { type: "text", text: part.text };
          }
        }

        if (typeof part === "string") {
          return { type: "text", text: part };
        }

        if (part == null) {
          return null;
        }

        return { type: "text", text: JSON.stringify(part) };
      })
      .filter(Boolean);

    if (normalized.length > 0) {
      return { role, content: normalized };
    }
  }

  if (typeof content === "string" && content.length > 0) {
    return { role, content: [{ type: "text", text: content }] };
  }

  if (content && typeof content === "object") {
    return {
      role,
      content: [{ type: "text", text: JSON.stringify(content) }],
    };
  }

  return { role, content: [] };
}

function normalizeResponsesToolCall(part) {
  if (!part || typeof part !== "object") return null;
  if (part.type !== "tool_call") return null;

  const name = typeof part.name === "string" ? part.name : null;
  if (!name) return null;

  let args = "";
  if (typeof part.arguments === "string") {
    args = part.arguments;
  } else if (part.arguments != null) {
    try {
      args = JSON.stringify(part.arguments);
    } catch (err) {
      args = "";
    }
  }

  const call = {
    type: "function",
    function: {
      name,
      arguments: args,
    },
  };

  if (typeof part.id === "string" && part.id.trim()) {
    call.id = part.id.trim();
  } else if (
    typeof part.tool_call_id === "string" &&
    part.tool_call_id.trim()
  ) {
    call.id = part.tool_call_id.trim();
  }

  return call;
}

function mapResponsesToChoice(response) {
  const message = Array.isArray(response?.output)
    ? response.output.find(
        (item) => item?.type === "message" && item?.role === "assistant"
      )
    : null;

  const contentParts = [];
  const toolCalls = [];

  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        contentParts.push({ text: part.text });
        continue;
      }

      const toolCall = normalizeResponsesToolCall(part);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
    }
  }

  if (contentParts.length === 0 && typeof response?.output_text === "string") {
    contentParts.push({ text: response.output_text });
  }

  const content = contentParts.length > 0 ? contentParts : undefined;

  return {
    message: {
      content,
    },
    tool_calls: toolCalls,
  };
}

async function requestChatCompletionWithActions(client, { messages, temperature }) {
  const useResponses = USES_RESPONSES_PATTERN.test(CHAT_MODEL);
  let choice;
  let completion;

  if (useResponses) {
    const input = Array.isArray(messages)
      ? messages
          .map((message) => normalizeMessageForResponses(message))
          .filter((item) => Array.isArray(item?.content) && item.content.length > 0)
      : [];

    completion = await client.responses.create({
      model: CHAT_MODEL,
      temperature,
      input,
      tools,
    });

    choice = mapResponsesToChoice(completion);
  } else {
    completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature,
      messages,
      tools,
    });

    choice = completion?.choices?.[0] ?? {};
  }

  const message = choice?.message || {};
  const reply = extractMessageText(message.content);
  const toolCalls = Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];

  let operationId = null;
  const actions = [];

  for (const call of toolCalls) {
    if (!call || call.type !== "function") continue;
    if (call.function?.name !== "propose_actions") continue;

    const parsed = safeParse(call.function?.arguments, null);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.operationId === "string" && parsed.operationId.trim()) {
        operationId = parsed.operationId.trim();
      }

      if (Array.isArray(parsed.actions)) {
        for (const entry of parsed.actions) {
          const name = typeof entry?.action === "string" ? entry.action.trim() : "";
          if (!name) continue;

          const normalized = {
            action: name,
          };

          if (entry?.executeNow === true) {
            normalized.executeNow = true;
          } else {
            normalized.executeNow = false;
          }

          if (typeof entry?.label === "string" && entry.label.trim()) {
            normalized.label = entry.label.trim();
          }

          if (entry?.payload !== undefined) {
            normalized.payload = entry.payload;
          }

          actions.push(normalized);
        }
      }
    }
  }

  if (operationId == null && typeof completion?.id === "string") {
    operationId = completion.id;
  }

  return {
    reply,
    actions,
    operationId,
  };
}

function extractMessageText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part?.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
}
