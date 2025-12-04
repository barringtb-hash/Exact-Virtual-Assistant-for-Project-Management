/**
 * Document Review API Endpoint
 *
 * POST /api/documents/review
 *
 * Analyzes a document and returns structured feedback with scores
 * across multiple review dimensions.
 */

import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { resolveDocType } from "../../lib/doc/utils.js";
import { reviewDocument, REVIEW_DIMENSIONS, SEVERITY_LEVELS } from "../../lib/doc/review.js";
import {
  formatErrorResponse,
  MethodNotAllowedError,
  InvalidRequestBodyError,
  ERROR_CODES,
} from "../../server/utils/apiErrors.js";

/**
 * Parse and validate request body
 */
function parseRequestBody(body) {
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new InvalidRequestBodyError(
        "Request body must be a JSON object, not an array or primitive value."
      );
    } catch (error) {
      if (error instanceof InvalidRequestBodyError) {
        throw error;
      }
      throw new InvalidRequestBodyError(
        "Request body contains invalid JSON.",
        error?.message
      );
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  throw new InvalidRequestBodyError(
    "Request body must be a JSON object."
  );
}

/**
 * Validate review options
 */
function validateOptions(options) {
  const validated = {};

  // Validate dimensions filter
  if (options?.dimensions) {
    if (!Array.isArray(options.dimensions)) {
      throw new InvalidRequestBodyError(
        "options.dimensions must be an array of dimension names"
      );
    }
    const invalidDimensions = options.dimensions.filter(
      (d) => !REVIEW_DIMENSIONS.includes(d)
    );
    if (invalidDimensions.length > 0) {
      throw new InvalidRequestBodyError(
        `Invalid dimensions: ${invalidDimensions.join(", ")}. Valid dimensions are: ${REVIEW_DIMENSIONS.join(", ")}`
      );
    }
    validated.dimensions = options.dimensions;
  }

  // Validate severity filter
  if (options?.severity) {
    const validSeverities = ["all", ...Object.values(SEVERITY_LEVELS)];
    if (!validSeverities.includes(options.severity)) {
      throw new InvalidRequestBodyError(
        `Invalid severity: ${options.severity}. Valid values are: ${validSeverities.join(", ")}`
      );
    }
    validated.severity = options.severity;
  }

  // Validate includeExamples
  if (options?.includeExamples !== undefined) {
    validated.includeExamples = Boolean(options.includeExamples);
  }

  // Validate model override
  if (options?.model) {
    if (typeof options.model !== "string") {
      throw new InvalidRequestBodyError("options.model must be a string");
    }
    validated.model = options.model;
  }

  return validated;
}

/**
 * Create error for missing review configuration
 */
function createReviewNotConfiguredError(docType) {
  const error = new Error(
    `Document review is not configured for "${docType}" documents. ` +
    `Please ensure the document type has a review configuration in the registry.`
  );
  error.name = "ReviewNotConfiguredError";
  error.statusCode = 400;
  error.code = "review_not_configured";
  error.docType = docType;
  return error;
}

/**
 * Create error for missing document
 */
function createMissingDocumentError() {
  const error = new Error(
    "Document is required for review. Please provide a document object in the request body."
  );
  error.name = "MissingDocumentError";
  error.statusCode = 400;
  error.code = "missing_document";
  return error;
}

export default async function handler(req, res) {
  const requestPath = req?.path || "/api/documents/review";

  // Only allow POST
  if (req.method !== "POST") {
    const error = new MethodNotAllowedError(req.method, ["POST"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  try {
    const body = parseRequestBody(req.body);

    // Resolve document type
    const docType = resolveDocType(req.query?.docType, body?.docType);
    if (!docType) {
      throw new InvalidRequestBodyError(
        "Document type is required. Provide docType in query string or request body."
      );
    }

    // Get document type configuration
    const config = getDocTypeConfig(docType);
    if (!config) {
      const error = new Error(`Unsupported document type: "${docType}"`);
      error.name = "UnsupportedDocTypeError";
      error.statusCode = 400;
      error.code = "unsupported_doc_type";
      throw error;
    }

    // Check if review is configured for this document type
    if (!config.review) {
      throw createReviewNotConfiguredError(docType);
    }

    // Validate document is provided
    const document = body?.document;
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw createMissingDocumentError();
    }

    // Validate and parse options
    const options = validateOptions(body?.options);

    // Execute review
    const reviewResult = await reviewDocument(docType, config, document, options);

    // Return successful response
    return res.status(200).json(reviewResult);

  } catch (error) {
    const statusCode = error?.statusCode || 500;

    // Handle known error types
    if (error instanceof InvalidRequestBodyError) {
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    // Log unexpected errors
    if (statusCode >= 500) {
      console.error("Document review failed:", {
        statusCode,
        code: error?.code || ERROR_CODES.INTERNAL_ERROR,
        message: error?.message,
        stack: error?.stack,
      });
    }

    return res.status(statusCode).json(formatErrorResponse(error, { path: requestPath }));
  }
}

/**
 * Export constants for client use
 */
export { REVIEW_DIMENSIONS, SEVERITY_LEVELS };
