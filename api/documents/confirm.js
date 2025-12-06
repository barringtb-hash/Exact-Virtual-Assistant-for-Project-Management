/**
 * Document Confirmation API Endpoint
 *
 * Confirms user selection and triggers extraction based on a prior analysis.
 * This is the second step in the analysis-driven extraction flow.
 *
 * POST /api/documents/confirm
 *
 * Request:
 * {
 *   analysisId: string,
 *   confirmed: {
 *     docType: string,
 *     action: "create" | "update",
 *     fieldOverrides?: object
 *   }
 * }
 *
 * Response:
 * {
 *   status: "extracted",
 *   extractionId: string,
 *   fields: object
 * }
 *
 * @module api/documents/confirm
 */

import { randomUUID } from "crypto";
import { isDocumentAnalysisEnabled } from "../../config/featureFlags.js";
import { getAnalysis, confirmAnalysis, deleteAnalysis, verifyAnalysisSignature } from "../../server/documents/analysis/AnalysisCache.js";
import REGISTRY from "../../lib/doc/registry.js";
import { executeOpenAIExtraction } from "../../server/documents/openai/client.js";

/**
 * Valid actions for confirmation
 */
const VALID_ACTIONS = new Set(["create", "update"]);

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
 * Generate extraction ID
 * @returns {string}
 */
function generateExtractionId() {
  return `ext_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Build extraction prompt from analysis context
 *
 * @param {Object} params
 * @param {string} params.docType - Target document type
 * @param {Object} params.analysis - Cached analysis result
 * @param {Object} params.rawContent - Raw document content
 * @param {string} params.action - Extraction action (create/update)
 * @returns {string}
 */
function buildExtractionPrompt({ docType, analysis, rawContent, action }) {
  const docConfig = REGISTRY.get(docType);
  const docLabel = docConfig?.label || docType;

  const classification = analysis.documentClassification || {};
  const suggestedTarget = analysis.suggestedTargets?.find((t) => t.docType === docType);

  const sections = [
    `# Field Extraction Instructions`,
    ``,
    `The user has confirmed they want to ${action} a ${docLabel} from the uploaded document.`,
    ``,
    `## Analysis Context`,
    `- Document Classification: ${classification.primaryType || "unknown"}`,
    `- Classification Confidence: ${((classification.confidence || 0) * 100).toFixed(0)}%`,
    `- Classification Signals: ${(classification.signals || []).join(", ") || "None"}`,
    ``,
    suggestedTarget ? `## Extraction Guidance` : "",
    suggestedTarget ? `- Rationale: ${suggestedTarget.rationale}` : "",
    suggestedTarget ? `- Expected Fields: ${(suggestedTarget.coverage?.available || []).join(", ")}` : "",
    suggestedTarget ? `- Fields to Infer: ${(suggestedTarget.coverage?.inferrable || []).join(", ")}` : "",
    suggestedTarget ? `- Missing Fields (will need user input): ${(suggestedTarget.coverage?.missing || []).join(", ")}` : "",
    ``,
    `## Document Content`,
    ``,
    rawContent?.extractedText || "No content available",
    ``,
    `## Instructions`,
    ``,
    `1. Extract all values that are explicitly stated in the document`,
    `2. Infer values from context where reasonable (dates, team roles, etc.)`,
    `3. For required fields without values, set to null`,
    `4. Preserve original wording where appropriate`,
    `5. Normalize dates to ISO format (YYYY-MM-DD) where possible`,
    `6. Return arrays for list-type fields`,
    ``,
    `Return the extracted fields as a JSON object matching the ${docLabel} schema.`,
  ];

  return sections.filter(Boolean).join("\n");
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

    // Validate analysisId
    const analysisId = body.analysisId;
    if (!analysisId || typeof analysisId !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_ANALYSIS_ID",
          message: "analysisId is required",
        },
      });
    }

    // Retrieve cached analysis (may fail in serverless environments)
    let cachedAnalysis = getAnalysis(analysisId);

    // In serverless environments, in-memory cache may not persist between invocations.
    // Fall back to inline data sent by the client if properly signed.
    if (!cachedAnalysis) {
      const inlineAnalysis = body.analysisData;
      const inlineRawContent = body.rawContent;
      const inlineSignature = body.analysisSignature;

      if (inlineAnalysis && inlineRawContent && inlineSignature) {
        // Verify signature to ensure inline data was originally generated by our server
        const isValidSignature = verifyAnalysisSignature(
          inlineSignature,
          analysisId,
          inlineAnalysis,
          inlineRawContent
        );

        if (!isValidSignature) {
          console.warn("[/api/documents/confirm] Invalid signature for inline analysis data");
          return res.status(403).json({
            error: {
              code: "INVALID_SIGNATURE",
              message: "Analysis data signature verification failed. Please re-analyze the document.",
            },
          });
        }

        console.log("[/api/documents/confirm] Using verified inline analysis data (cache miss in serverless)");
        cachedAnalysis = {
          analysisId,
          analysis: inlineAnalysis,
          rawContent: inlineRawContent,
          status: "pending",
        };
      } else if (inlineAnalysis && inlineRawContent) {
        // Inline data provided but no signature - reject for security
        console.warn("[/api/documents/confirm] Inline analysis data provided without signature - rejected");
        return res.status(403).json({
          error: {
            code: "MISSING_SIGNATURE",
            message: "Analysis data requires a valid signature. Please re-analyze the document.",
          },
        });
      } else {
        return res.status(404).json({
          error: {
            code: "ANALYSIS_NOT_FOUND",
            message: "Analysis not found or expired. Please re-analyze the document.",
          },
        });
      }
    }

    // Validate confirmed object
    const confirmed = body.confirmed;
    if (!confirmed || typeof confirmed !== "object") {
      return res.status(400).json({
        error: {
          code: "INVALID_CONFIRMATION",
          message: "confirmed object is required",
        },
      });
    }

    // Validate docType
    const docType = confirmed.docType;
    if (!docType || typeof docType !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_DOC_TYPE",
          message: "confirmed.docType is required",
        },
      });
    }

    // Check if docType is supported
    const docConfig = REGISTRY.get(docType);
    if (!docConfig) {
      return res.status(400).json({
        error: {
          code: "UNSUPPORTED_DOC_TYPE",
          message: `Document type "${docType}" is not supported`,
        },
      });
    }

    // Validate action
    const action = confirmed.action || "create";
    if (!VALID_ACTIONS.has(action)) {
      return res.status(400).json({
        error: {
          code: "INVALID_ACTION",
          message: `Invalid action "${action}". Must be "create" or "update".`,
        },
      });
    }

    // Get optional field overrides
    const fieldOverrides = confirmed.fieldOverrides && typeof confirmed.fieldOverrides === "object"
      ? confirmed.fieldOverrides
      : {};

    // Mark analysis as confirmed
    confirmAnalysis(analysisId);

    // Build extraction prompt using analysis context
    const extractionPrompt = buildExtractionPrompt({
      docType,
      analysis: cachedAnalysis.analysis,
      rawContent: cachedAnalysis.rawContent,
      action,
    });

    // Execute extraction
    const extractedFields = await executeOpenAIExtraction({
      systemSections: [extractionPrompt],
      messages: [],
      model: "gpt-4o-mini",
      temperature: 0.3,
    });

    // Merge extracted fields with overrides (overrides take precedence)
    const mergedFields = {
      ...extractedFields,
      ...fieldOverrides,
    };

    // Clean up cache entry (optional - could keep for audit)
    deleteAnalysis(analysisId);

    // Generate extraction ID for tracking
    const extractionId = generateExtractionId();

    return res.status(200).json({
      status: "extracted",
      extractionId,
      fields: mergedFields,
    });
  } catch (error) {
    console.error("[/api/documents/confirm] Error:", error);

    const statusCode = error.statusCode || 500;
    const code = error.code || "EXTRACTION_ERROR";
    const message = error.message || "An error occurred during extraction";

    return res.status(statusCode).json({
      error: {
        code,
        message,
      },
    });
  }
}
