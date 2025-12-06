/**
 * Document Analysis API Endpoint
 *
 * Analyzes uploaded documents to determine their type and suggest extraction targets.
 * This is the first step in the analysis-driven extraction flow when DOCUMENT_ANALYSIS_ENABLED=true.
 *
 * POST /api/documents/analyze
 *
 * Request:
 * {
 *   attachments: [{ id?, name?, mimeType?, text: string }],
 *   conversationContext?: string[],
 *   existingDraft?: object
 * }
 *
 * Response:
 * {
 *   status: "analyzed" | "needs_clarification",
 *   analysisId: string,
 *   analysis: {
 *     documentClassification: { primaryType, confidence, signals },
 *     suggestedTargets: [{ docType, confidence, rationale, previewFields, coverage }],
 *     alternativeTargets: [{ docType, confidence, rationale }],
 *     clarificationQuestions: string[]
 *   },
 *   raw: { extractedText, tables, metadata }
 * }
 *
 * @module api/documents/analyze
 */

import { isDocumentAnalysisEnabled } from "../../config/featureFlags.js";
import { analyzeDocument } from "../../server/documents/analysis/DocumentAnalyzer.js";
import { storeAnalysis } from "../../server/documents/analysis/AnalysisCache.js";

/**
 * Parse and validate request body
 * @param {any} body
 * @returns {Object}
 */
function parseRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body;
}

/**
 * Validate attachments array
 * @param {any} attachments
 * @returns {{ valid: boolean, error?: string, attachments: Array }}
 */
function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return {
      valid: false,
      error: "attachments must be an array",
      attachments: [],
    };
  }

  if (attachments.length === 0) {
    return {
      valid: false,
      error: "At least one attachment is required for analysis",
      attachments: [],
    };
  }

  const validAttachments = attachments.filter((a) => {
    if (!a || typeof a !== "object") return false;
    if (typeof a.text !== "string" || !a.text.trim()) return false;
    return true;
  });

  if (validAttachments.length === 0) {
    return {
      valid: false,
      error: "Attachments must contain at least one item with text content",
      attachments: [],
    };
  }

  return {
    valid: true,
    attachments: validAttachments.map((a) => ({
      id: a.id || undefined,
      name: a.name || "Uploaded Document",
      mimeType: a.mimeType || "application/octet-stream",
      text: a.text,
    })),
  };
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Only POST requests are allowed",
      },
    });
  }

  // Check if document analysis is enabled
  if (!isDocumentAnalysisEnabled()) {
    return res.status(400).json({
      error: {
        code: "FEATURE_DISABLED",
        message: "Document analysis is not enabled. Set DOCUMENT_ANALYSIS_ENABLED=true to use this endpoint.",
      },
    });
  }

  try {
    const body = parseRequestBody(req.body);

    // Debug logging
    console.log("[/api/documents/analyze] Received request:", {
      hasBody: Boolean(req.body),
      bodyType: typeof req.body,
      hasAttachments: Boolean(body.attachments),
      attachmentsType: typeof body.attachments,
      attachmentsIsArray: Array.isArray(body.attachments),
      attachmentsLength: Array.isArray(body.attachments) ? body.attachments.length : "N/A",
      firstAttachmentKeys: Array.isArray(body.attachments) && body.attachments[0]
        ? Object.keys(body.attachments[0])
        : "N/A",
      firstAttachmentHasText: Array.isArray(body.attachments) && body.attachments[0]
        ? Boolean(body.attachments[0].text)
        : "N/A",
    });

    // Validate attachments
    const attachmentResult = validateAttachments(body.attachments);
    if (!attachmentResult.valid) {
      return res.status(400).json({
        error: {
          code: "INVALID_ATTACHMENTS",
          message: attachmentResult.error,
        },
      });
    }

    // Extract optional parameters
    const conversationContext = Array.isArray(body.conversationContext)
      ? body.conversationContext.filter((c) => typeof c === "string")
      : [];

    const existingDraft = body.existingDraft && typeof body.existingDraft === "object"
      ? body.existingDraft
      : null;

    // Run document analysis
    const result = await analyzeDocument({
      attachments: attachmentResult.attachments,
      conversationContext,
      existingDraft,
    });

    // Store analysis in cache for later confirmation
    const cacheEntry = storeAnalysis({
      attachments: attachmentResult.attachments,
      rawContent: result.rawContent,
      analysis: result.analysis,
    });

    // Return analysis result with signature for serverless fallback
    return res.status(200).json({
      status: result.status,
      analysisId: cacheEntry.analysisId,
      analysisSignature: cacheEntry.signature, // Client must return this with confirm request
      analysis: result.analysis,
      raw: result.rawContent,
    });
  } catch (error) {
    console.error("[/api/documents/analyze] Error:", error);

    const statusCode = error.statusCode || 500;
    const code = error.code || "ANALYSIS_ERROR";
    const message = error.message || "An error occurred during document analysis";

    return res.status(statusCode).json({
      error: {
        code,
        message,
      },
    });
  }
}
