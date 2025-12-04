/**
 * Interactive Review Session Start Endpoint
 *
 * POST /api/assistant/review/start
 *
 * Initiates an interactive review session for walking through feedback items.
 * Requires an existing review result or will run a new review.
 */

import { getDocTypeConfig } from "../../../lib/doc/registry.js";
import { resolveDocType } from "../../../lib/doc/utils.js";
import { reviewDocument } from "../../../lib/doc/review.js";
import { createReviewSession } from "../../../server/review/Orchestrator.js";
import {
  formatErrorResponse,
  MethodNotAllowedError,
  InvalidRequestBodyError,
} from "../../../server/utils/apiErrors.js";

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

export default async function handler(req, res) {
  const requestPath = req?.path || "/api/assistant/review/start";

  if (req.method !== "POST") {
    const error = new MethodNotAllowedError(req.method, ["POST"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  try {
    const body = parseRequestBody(req.body);

    // Get document type
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

    // Get document
    const document = body?.document;
    if (!document || typeof document !== "object") {
      throw new InvalidRequestBodyError("Document is required");
    }

    // Check if an existing review was provided or run a new one
    let reviewResult = body?.review;

    if (!reviewResult) {
      // Run a new review
      reviewResult = await reviewDocument(docType, config, document, {});
    }

    // Create interactive session
    const session = createReviewSession(docType, {
      reviewId: reviewResult.reviewId,
      scores: reviewResult.scores,
      strengths: reviewResult.strengths,
      feedback: reviewResult.feedback,
      summary: reviewResult.summary,
    });

    // Return session info with initial message
    return res.status(200).json({
      sessionId: session.sessionId,
      status: session.status,
      overallScore: session.overallScore,
      feedbackCount: session.feedback.length,
      pendingCount: session.feedback.filter((f) => f.status === "pending").length,
      message: session.messages[0]?.content || "",
      strengths: session.strengths,
    });

  } catch (error) {
    const statusCode = error?.statusCode || 500;

    if (error instanceof InvalidRequestBodyError) {
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    console.error("Interactive review start failed:", error);
    return res.status(statusCode).json(formatErrorResponse(error, { path: requestPath }));
  }
}
