// /api/chat.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";
import { chunkByTokens, countTokens } from "../lib/tokenize.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

if (process?.env?.CHAT_MAX_BODY) {
  config.api.bodyParser.sizeLimit = process.env.CHAT_MAX_BODY;
}

if (process?.env?.CHAT_MAX_DURATION) {
  const duration = Number.parseInt(process.env.CHAT_MAX_DURATION, 10);
  if (Number.isFinite(duration) && duration > 0) {
    config.api.maxDuration = duration;
  }
}

const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
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
  "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff.";

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
      const mapCompletion = await client.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.2,
        max_tokens: ATTACHMENT_SUMMARY_TOKENS,
        messages: [
          { role: "system", content: MAP_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Attachment: ${name}\nChunk ${index + 1} of ${chunks.length}\n\n${chunk.text}`,
          },
        ],
      });
      return mapCompletion.choices?.[0]?.message?.content?.trim() || "";
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

  const reduceCompletion = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    max_tokens: ATTACHMENT_SUMMARY_TOKENS,
    messages: [
      { role: "system", content: REDUCE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Attachment: ${name}\n\nChunk summaries:\n${reducePrompt}\n\nDeliver a single consolidated summary.`,
      },
    ],
  });

  return reduceCompletion.choices?.[0]?.message?.content?.trim() || mapSummaries.join("\n\n");
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
      ? `${attachmentsBlock}\n\n${BASE_SYSTEM_PROMPT}`
      : BASE_SYSTEM_PROMPT;

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

    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      messages,
    });
    const reply = completion.choices?.[0]?.message?.content ?? "";
    res.status(200).json({ reply });
  } catch (err) {
    console.error("API /api/chat error:", err);
    const message = err?.message || "Unknown error";
    const status = message.startsWith("Attachment") ? 400 : 500;
    res.status(status).json({ error: message });
  }
}
