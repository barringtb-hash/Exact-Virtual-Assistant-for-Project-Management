/**
 * Interactive Review Session Messages Endpoint
 *
 * POST /api/assistant/review/messages
 *
 * Processes user messages in an interactive review session.
 * Handles navigation commands, feedback acceptance/dismissal, and elaboration requests.
 */

import {
  processReviewMessage,
  getReviewSession,
  getSessionSummary,
} from "../../../server/review/Orchestrator.js";
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
  const requestPath = req?.path || "/api/assistant/review/messages";

  if (req.method !== "POST") {
    const error = new MethodNotAllowedError(req.method, ["POST"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  try {
    const body = parseRequestBody(req.body);

    // Get session ID
    const sessionId = body?.sessionId || req.query?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      throw new InvalidRequestBodyError("Session ID is required");
    }

    // Get message
    const message = body?.message;
    if (!message || typeof message !== "string" || !message.trim()) {
      throw new InvalidRequestBodyError("Message is required");
    }

    // Check session exists
    const existingSession = getReviewSession(sessionId);
    if (!existingSession) {
      const error = new Error(`Review session not found: ${sessionId}`);
      error.statusCode = 404;
      error.code = "session_not_found";
      throw error;
    }

    // Check session is not already complete
    if (existingSession.status === "complete") {
      return res.status(200).json({
        sessionId,
        status: "complete",
        message: "This review session has already been completed.",
        summary: getSessionSummary(sessionId),
      });
    }

    // Process the message
    const { state, response } = await processReviewMessage(sessionId, message.trim());

    // Build response
    const pendingFeedback = state.feedback.filter((f) => f.status === "pending");
    const currentFeedback = pendingFeedback[state.currentFeedbackIndex] || null;

    const result = {
      sessionId: state.sessionId,
      status: state.status,
      message: response,
      currentFeedbackId: currentFeedback?.id || null,
      currentFeedbackIndex: state.currentFeedbackIndex,
      pendingCount: pendingFeedback.length,
      progress: {
        total: state.feedback.length,
        accepted: state.feedback.filter((f) => f.status === "accepted").length,
        dismissed: state.feedback.filter((f) => f.status === "dismissed").length,
        pending: pendingFeedback.length,
      },
    };

    // If session is complete, include summary
    if (state.status === "complete") {
      result.summary = getSessionSummary(sessionId);
      result.completedAt = state.completedAt;
    }

    return res.status(200).json(result);

  } catch (error) {
    const statusCode = error?.statusCode || 500;

    if (error instanceof InvalidRequestBodyError) {
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    if (error?.code === "session_not_found") {
      return res.status(404).json(formatErrorResponse(error, { path: requestPath }));
    }

    console.error("Interactive review message failed:", error);
    return res.status(statusCode).json(formatErrorResponse(error, { path: requestPath }));
  }
}
