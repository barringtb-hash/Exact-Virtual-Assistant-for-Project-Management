/**
 * Guided mode extraction logic for charter documents
 *
 * This module handles guided (step-by-step) charter extraction,
 * including batch processing and confirmation flows.
 *
 * ## Guided Extraction Flow
 *
 * The guided extraction process works as follows:
 *
 * 1. **Single Field Extraction**: Client requests extraction for specific fields
 *    - Uses `processSingleGuidedExtraction()` for individual requests
 *    - Returns extracted fields or pending state with warnings
 *
 * 2. **Batch Extraction**: Client sends multiple extraction requests at once
 *    - Uses `processBatchGuidedExtraction()` for parallel processing
 *    - Each request can have its own context (messages, attachments, voice)
 *
 * 3. **Confirmation Flow**: User reviews and confirms/rejects extractions
 *    - Pending extractions with warnings require user confirmation
 *    - Uses `processGuidedConfirmation()` to finalize the decision
 *
 * ## Response Statuses
 *
 * - `ok`: Extraction successful, no issues
 * - `pending`: Extraction has warnings requiring user confirmation
 * - `error`: Extraction failed with specific error code
 * - `batch`: Response contains multiple extraction results
 * - `confirmed`: User confirmed a pending extraction
 *
 * @module server/documents/extraction/guided
 */

import {
  sanitizeExtractionIssues,
  sanitizeRequestedFieldIds,
  sanitizeCharterSeed,
  sanitizeCharterMessagesForTool,
  sanitizeCharterAttachmentsForTool,
  sanitizeCharterVoiceForTool,
} from "../sanitization/sanitizers.js";
import { mapExtractionErrorToStatus } from "../utils/index.js";

/**
 * @typedef {Object} GuidedConfirmation
 * @property {'approve' | 'reject'} decision - User's decision on the extraction
 * @property {Object} fields - Extracted field values
 * @property {Array} warnings - Extraction warnings
 * @property {*} [arguments] - Raw tool arguments for debugging
 * @property {Object} [error] - Error details if rejection
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {Object} payload - Response payload
 * @property {number} statusCode - HTTP status code
 * @property {string} auditStatus - Status for audit logging
 */

/**
 * Process guided confirmation (user approved or rejected extraction)
 *
 * This function handles the final step of the guided extraction flow where
 * the user either approves or rejects a pending extraction that had warnings.
 *
 * @param {GuidedConfirmation} guidedConfirmation - The confirmation payload
 * @returns {Promise<ExtractionResult>} The processed result
 *
 * @example
 * // User approves extraction
 * const result = await processGuidedConfirmation({
 *   decision: 'approve',
 *   fields: { project_name: 'My Project' },
 *   warnings: [{ level: 'warning', message: 'Date format normalized' }]
 * });
 *
 * @example
 * // User rejects extraction
 * const result = await processGuidedConfirmation({
 *   decision: 'reject',
 *   fields: {},
 *   warnings: [],
 *   error: { code: 'user_rejected', message: 'User rejected the extraction' }
 * });
 */
export async function processGuidedConfirmation(guidedConfirmation) {
  let payload;
  let statusCode = 200;
  let auditStatus = null;

  if (guidedConfirmation.decision === "approve") {
    payload = {
      status: "ok",
      fields: guidedConfirmation.fields,
      ...(guidedConfirmation.warnings.length > 0
        ? { warnings: guidedConfirmation.warnings }
        : {}),
    };
    statusCode = 200;
    auditStatus = "confirmed";
  } else {
    const confirmationError = guidedConfirmation.error || null;
    const errorStatus = confirmationError?.code
      ? mapExtractionErrorToStatus(confirmationError.code)
      : 409;
    statusCode = errorStatus >= 400 ? errorStatus : 409;
    payload = {
      status: "error",
      error:
        confirmationError || {
          code: "confirmation_rejected",
          message: "Pending extraction proposal was rejected.",
        },
      fields: {},
      ...(guidedConfirmation.warnings.length > 0
        ? { warnings: guidedConfirmation.warnings }
        : {}),
    };
    auditStatus = confirmationError?.code || "rejected";
  }

  return { payload, statusCode, auditStatus };
}

/**
 * @typedef {Object} BatchExtractionRequest
 * @property {Array} messages - Chat messages for context
 * @property {Array} attachments - Document attachments
 * @property {Array} voice - Voice transcriptions
 * @property {Array<string>} requestedFieldIds - Fields to extract
 * @property {Object} [seed] - Seed data for extraction
 */

/**
 * @typedef {Object} BatchExtractionParams
 * @property {Object} charterExtraction - The charter extraction module
 * @property {Array} guidedRequestsRaw - Raw batch request entries
 * @property {Array} toolMessages - Default messages if not in request
 * @property {Array} toolAttachments - Default attachments if not in request
 * @property {Array} toolVoice - Default voice events if not in request
 * @property {Object} [seedValue] - Default seed value
 */

/**
 * Process batch guided extraction requests
 *
 * Handles multiple extraction requests in parallel. Each request can specify
 * its own context (messages, attachments, voice) or fall back to shared defaults.
 *
 * The function:
 * 1. Validates and sanitizes each request entry
 * 2. Filters out invalid requests (no field IDs)
 * 3. Executes all valid extractions in parallel
 * 4. Aggregates results with appropriate status codes
 *
 * @param {BatchExtractionParams} params - Batch extraction parameters
 * @returns {Promise<ExtractionResult>} Aggregated batch results
 *
 * @example
 * const result = await processBatchGuidedExtraction({
 *   charterExtraction,
 *   guidedRequestsRaw: [
 *     { requestedFieldIds: ['project_name', 'sponsor'] },
 *     { requestedFieldIds: ['start_date', 'end_date'], messages: [...] }
 *   ],
 *   toolMessages: defaultMessages,
 *   toolAttachments: defaultAttachments,
 *   toolVoice: defaultVoice,
 * });
 */
export async function processBatchGuidedExtraction({
  charterExtraction,
  guidedRequestsRaw,
  toolMessages,
  toolAttachments,
  toolVoice,
  seedValue,
}) {
  const requests = guidedRequestsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const requestFieldIds = sanitizeRequestedFieldIds(entry.requestedFieldIds);
      if (requestFieldIds.length === 0) {
        return null;
      }
      const requestSeed =
        entry.seed !== undefined ? sanitizeCharterSeed(entry.seed) : seedValue;
      const requestMessages = Array.isArray(entry.messages)
        ? sanitizeCharterMessagesForTool(entry.messages)
        : toolMessages;
      const requestAttachments = Array.isArray(entry.attachments)
        ? sanitizeCharterAttachmentsForTool(entry.attachments)
        : toolAttachments;
      const requestVoice = Array.isArray(entry.voice)
        ? sanitizeCharterVoiceForTool(entry.voice)
        : toolVoice;

      return {
        messages: requestMessages,
        attachments: requestAttachments,
        voice: requestVoice,
        requestedFieldIds: requestFieldIds,
        ...(requestSeed !== undefined ? { seed: requestSeed } : {}),
      };
    })
    .filter(Boolean);

  if (requests.length === 0) {
    return {
      payload: {
        status: "error",
        error: {
          code: "no_fields_requested",
          message: "No valid charter field ids were requested for extraction.",
        },
        fields: {},
      },
      statusCode: 400,
      auditStatus: "error",
    };
  }

  const results = await charterExtraction.extractFieldsFromUtterances(requests);
  let highestStatus = 200;
  const mappedResults = results.map((result) => {
    if (result.ok) {
      const resultWarnings = sanitizeExtractionIssues(result.warnings);
      if (resultWarnings.length > 0) {
        highestStatus = Math.max(highestStatus, 202);
        return {
          status: "pending",
          pending: {
            fields: result.fields || {},
            warnings: resultWarnings,
            ...(result.rawToolArguments !== undefined
              ? { arguments: result.rawToolArguments }
              : {}),
          },
        };
      }
      return {
        status: "ok",
        fields: result.fields || {},
        warnings: resultWarnings,
      };
    }

    const errorStatus = mapExtractionErrorToStatus(result.error?.code);
    if (errorStatus > highestStatus) {
      highestStatus = errorStatus;
    }
    return {
      status: "error",
      error: result.error,
      fields: result.fields || {},
      ...(sanitizeExtractionIssues(result.warnings).length > 0
        ? { warnings: sanitizeExtractionIssues(result.warnings) }
        : {}),
    };
  });

  return {
    payload: { status: "batch", results: mappedResults },
    statusCode: highestStatus,
    auditStatus: "batch",
  };
}

/**
 * @typedef {Object} SingleExtractionParams
 * @property {Object} charterExtraction - The charter extraction module
 * @property {BatchExtractionRequest} baseRequest - The extraction request
 */

/**
 * Process single guided extraction request
 *
 * Executes a single field extraction request and returns the result.
 * If the extraction has warnings, returns a "pending" status that requires
 * user confirmation before being finalized.
 *
 * Response scenarios:
 * - **Success (200)**: Fields extracted without warnings
 * - **Pending (202)**: Fields extracted but have warnings requiring confirmation
 * - **Error (4xx/5xx)**: Extraction failed with specific error
 *
 * @param {SingleExtractionParams} params - Single extraction parameters
 * @returns {Promise<ExtractionResult>} The extraction result
 *
 * @example
 * const result = await processSingleGuidedExtraction({
 *   charterExtraction,
 *   baseRequest: {
 *     messages: [...],
 *     attachments: [...],
 *     voice: [...],
 *     requestedFieldIds: ['project_name', 'description'],
 *   }
 * });
 *
 * if (result.payload.status === 'pending') {
 *   // Show warnings to user and get confirmation
 *   const confirmed = await askUserConfirmation(result.payload.pending);
 *   // Then call processGuidedConfirmation
 * }
 */
export async function processSingleGuidedExtraction({
  charterExtraction,
  baseRequest,
}) {
  const result = await charterExtraction.extractFieldsFromUtterance(baseRequest);

  if (result.ok) {
    const resultWarnings = sanitizeExtractionIssues(result.warnings);
    if (resultWarnings.length > 0) {
      return {
        payload: {
          status: "pending",
          pending: {
            fields: result.fields || {},
            warnings: resultWarnings,
            ...(result.rawToolArguments !== undefined
              ? { arguments: result.rawToolArguments }
              : {}),
          },
        },
        statusCode: 202,
        auditStatus: "pending",
      };
    }
    return {
      payload: {
        status: "ok",
        fields: result.fields || {},
        warnings: resultWarnings,
      },
      statusCode: 200,
      auditStatus: "ok",
    };
  }

  const statusCode = mapExtractionErrorToStatus(result.error?.code);
  return {
    payload: {
      status: "error",
      error: result.error,
      fields: result.fields || {},
      ...(sanitizeExtractionIssues(result.warnings).length > 0
        ? { warnings: sanitizeExtractionIssues(result.warnings) }
        : {}),
    },
    statusCode,
    auditStatus: result.error?.code || "error",
  };
}
