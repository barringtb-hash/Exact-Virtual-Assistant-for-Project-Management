/**
 * Streaming Document Review Endpoint
 *
 * POST /api/documents/review-stream
 *
 * Streams review results as Server-Sent Events for real-time feedback display.
 * Each dimension score and feedback item is streamed as it's processed.
 */

import OpenAI from "openai";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { resolveDocType } from "../../lib/doc/utils.js";
import { REVIEW_DIMENSIONS } from "../../lib/doc/review.js";
import { queryKnowledge, formatKnowledgeForPrompt } from "../../server/knowledge/query.js";
import fs from "fs/promises";
import {
  formatErrorResponse,
  MethodNotAllowedError,
  InvalidRequestBodyError,
} from "../../server/utils/apiErrors.js";

/**
 * Parse request body
 */
function parseRequestBody(body) {
  if (body == null) return {};
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new InvalidRequestBodyError("Request body must be a JSON object");
    } catch (error) {
      if (error instanceof InvalidRequestBodyError) throw error;
      throw new InvalidRequestBodyError("Invalid JSON", error?.message);
    }
  }
  if (typeof body === "object" && !Array.isArray(body)) return body;
  throw new InvalidRequestBodyError("Request body must be a JSON object");
}

/**
 * Load review prompt
 */
async function loadReviewPrompt(config) {
  const promptPath = config?.review?.promptPath;
  if (!promptPath) {
    throw new Error("Review prompt not configured");
  }
  return fs.readFile(promptPath, "utf8");
}

/**
 * Build streaming review prompt
 */
function buildStreamingPrompt(reviewPrompt, knowledgeContext, document, docType) {
  const sections = [reviewPrompt];

  if (knowledgeContext) {
    sections.push(`## Best Practices & Guidelines\n${knowledgeContext}`);
  }

  sections.push(`## Document to Review (${docType})\n\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\``);

  // Add streaming-specific instructions
  sections.push(`
## Streaming Output Instructions

You will output your analysis progressively. Start with the overall assessment, then output each dimension score followed by feedback items.

Output the following JSON objects, each on its own line:

1. First, output the overall score:
{"type": "overall", "score": <0-100>, "summary": "<brief summary>"}

2. Then for each dimension, output:
{"type": "dimension", "name": "<dimension_name>", "score": <0-100>}

3. Output each strength:
{"type": "strength", "text": "<strength description>"}

4. Then output each feedback item:
{"type": "feedback", "field": "<field_id or null>", "dimension": "<dimension>", "severity": "<critical|important|suggestion>", "issue": "<issue>", "recommendation": "<recommendation>", "example": "<optional example>"}

5. Finally, output completion:
{"type": "complete"}

Output each JSON object on its own line. Do not include any other text.
`);

  return sections.join("\n\n");
}

/**
 * Send SSE event
 */
function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Parse streaming JSON line
 */
function parseStreamLine(line) {
  try {
    return JSON.parse(line.trim());
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const requestPath = req?.path || "/api/documents/review-stream";

  if (req.method !== "POST") {
    const error = new MethodNotAllowedError(req.method, ["POST"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  try {
    const body = parseRequestBody(req.body);

    // Validate inputs
    const docType = resolveDocType(req.query?.docType, body?.docType);
    if (!docType) {
      throw new InvalidRequestBodyError("Document type is required");
    }

    const config = getDocTypeConfig(docType);
    if (!config) {
      throw new InvalidRequestBodyError(`Unsupported document type: ${docType}`);
    }

    if (!config.review) {
      throw new InvalidRequestBodyError(`Review not configured for: ${docType}`);
    }

    const document = body?.document;
    if (!document || typeof document !== "object") {
      throw new InvalidRequestBodyError("Document is required");
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial event
    const reviewId = `rev_${Date.now().toString(36)}`;
    sendEvent(res, "start", {
      reviewId,
      docType,
      timestamp: new Date().toISOString(),
    });

    // Load review assets
    const reviewPrompt = await loadReviewPrompt(config);
    const knowledgeCategories = config.review.knowledgeCategories || [docType];
    const knowledgeEntries = await queryKnowledge({
      categories: knowledgeCategories,
      document,
      docType,
    });
    const knowledgeContext = formatKnowledgeForPrompt(knowledgeEntries);

    // Build prompt
    const systemPrompt = buildStreamingPrompt(reviewPrompt, knowledgeContext, document, docType);

    // Create OpenAI client
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      sendEvent(res, "error", { message: "OpenAI API key not configured" });
      res.end();
      return;
    }

    const client = new OpenAI({ apiKey });
    const model = body?.options?.model || process.env.REVIEW_MODEL || "gpt-4o-mini";

    // Start streaming request
    const stream = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Please review this document and stream your analysis." },
      ],
      stream: true,
    });

    // Process stream
    let buffer = "";
    let feedbackCount = 0;
    const result = {
      reviewId,
      docType,
      scores: { overall: 0, dimensions: {} },
      strengths: [],
      feedback: [],
      summary: "",
    };

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (!content) continue;

      buffer += content;

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const parsed = parseStreamLine(line);
        if (!parsed || !parsed.type) continue;

        switch (parsed.type) {
          case "overall":
            result.scores.overall = parsed.score;
            result.summary = parsed.summary || "";
            sendEvent(res, "overall", {
              score: parsed.score,
              summary: parsed.summary,
            });
            break;

          case "dimension":
            result.scores.dimensions[parsed.name] = parsed.score;
            sendEvent(res, "dimension", {
              name: parsed.name,
              score: parsed.score,
            });
            break;

          case "strength":
            result.strengths.push(parsed.text);
            sendEvent(res, "strength", { text: parsed.text });
            break;

          case "feedback":
            feedbackCount++;
            const feedbackItem = {
              id: `fb_${String(feedbackCount).padStart(3, "0")}`,
              field: parsed.field || null,
              dimension: parsed.dimension,
              severity: parsed.severity,
              issue: parsed.issue,
              recommendation: parsed.recommendation,
              example: parsed.example,
              status: "pending",
            };
            result.feedback.push(feedbackItem);
            sendEvent(res, "feedback", feedbackItem);
            break;

          case "complete":
            sendEvent(res, "complete", {
              reviewId,
              feedbackCount: result.feedback.length,
              overallScore: result.scores.overall,
            });
            break;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const parsed = parseStreamLine(buffer);
      if (parsed && parsed.type === "complete") {
        sendEvent(res, "complete", {
          reviewId,
          feedbackCount: result.feedback.length,
          overallScore: result.scores.overall,
        });
      }
    }

    // Send final result
    sendEvent(res, "result", result);
    res.end();

  } catch (error) {
    // If headers already sent, send error as SSE event
    if (res.headersSent) {
      sendEvent(res, "error", {
        message: error?.message || "Review failed",
        code: error?.code || "review_error",
      });
      res.end();
      return;
    }

    // Otherwise send regular error response
    const statusCode = error?.statusCode || 500;

    if (error instanceof InvalidRequestBodyError) {
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    console.error("Streaming review failed:", error);
    return res.status(statusCode).json(formatErrorResponse(error, { path: requestPath }));
  }
}

// Handle request abort
export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};
