/**
 * Guided mode extraction logic for charter documents
 *
 * This module handles guided (step-by-step) charter extraction,
 * including batch processing and confirmation flows.
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
 * Process guided confirmation (user approved or rejected extraction)
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
 * Process batch guided extraction requests
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
 * Process single guided extraction request
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
