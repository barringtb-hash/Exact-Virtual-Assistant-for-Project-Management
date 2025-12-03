/**
 * OpenAI client utilities for document extraction
 */

import OpenAI from "openai";
import { MissingDocAssetError } from "../../../lib/doc/errors.js";
import { readFirstAvailableFile } from "../utils/index.js";

/**
 * Load extraction prompt from configured paths
 */
export async function loadExtractPrompt(docType, config) {
  const candidates = Array.isArray(config?.extract?.promptCandidates)
    ? [...config.extract.promptCandidates]
    : [];
  const fallback = config?.extract?.fallbackPromptPath;
  if (fallback && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }

  const file = await readFirstAvailableFile(candidates);
  if (!file) {
    throw new MissingDocAssetError(docType, "extract prompt", candidates);
  }
  return file.content;
}

/**
 * Load extraction metadata from configured paths
 */
export async function loadExtractMetadata(config) {
  const candidates = Array.isArray(config?.extract?.metadataCandidates)
    ? config.extract.metadataCandidates
    : [];
  if (candidates.length === 0) {
    return null;
  }
  return readFirstAvailableFile(candidates);
}

/**
 * Build OpenAI messages array from system sections and user messages
 */
export function buildOpenAIMessages(systemSections, messages) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  return [
    { role: "system", content: systemSections.join("\n\n") },
    ...normalizedMessages.map((message) => ({
      role: message?.role || "user",
      content: message?.content || message?.text || "",
    })),
  ];
}

/**
 * Create and execute OpenAI completion for document extraction
 */
export async function executeOpenAIExtraction({
  systemSections,
  messages,
  seed,
  model = "gpt-4o-mini",
  temperature = 0.3,
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    const error = new Error("OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.");
    error.statusCode = 500;
    error.code = "missing_api_key";
    throw error;
  }

  const openaiMessages = buildOpenAIMessages(systemSections, messages);
  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature,
      messages: openaiMessages,
      response_format: { type: "json_object" },
      ...(typeof seed === "number" ? { seed } : {}),
    });

    const replyContent = completion.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(replyContent);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return { result: replyContent };
    } catch {
      return { result: replyContent };
    }
  } catch (apiError) {
    // Enhanced error handling for OpenAI API errors
    const status = apiError?.status || apiError?.response?.status || 500;
    const message = apiError?.error?.message || apiError?.message || "OpenAI request failed";

    if (status === 429) {
      const error = new Error("OpenAI rate limit exceeded. Please wait a moment and try again.");
      error.statusCode = 429;
      error.code = "rate_limit_exceeded";
      throw error;
    }

    if (status === 401) {
      const error = new Error("OpenAI API key is invalid. Please check your OPENAI_API_KEY configuration.");
      error.statusCode = 401;
      error.code = "invalid_api_key";
      throw error;
    }

    // Re-throw with enhanced context
    const error = new Error(message);
    error.statusCode = status;
    error.code = apiError?.code || "openai_error";
    throw error;
  }
}
