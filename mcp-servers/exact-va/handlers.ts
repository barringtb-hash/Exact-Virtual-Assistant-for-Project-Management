/**
 * MCP Tool Handlers for Exact Virtual Assistant
 *
 * These handlers wrap existing API functionality and expose it through MCP.
 */

import type { ToolContext } from "./index.js";

// Import existing functionality
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import {
  ensureValidationAssets,
  validateDocument,
} from "../../lib/doc/validation.js";
import { renderDocxBufferForDocType } from "../../api/documents/render.js";

/**
 * Tool response type
 */
interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Create a successful tool response
 */
function success(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an error tool response
 */
function error(message: string, details?: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, details }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Handle document extraction
 */
export async function handleDocumentExtract(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResponse> {
  const { docType, context: textContext, attachmentIds, fieldIds } = args as {
    docType: string;
    context?: string;
    attachmentIds?: string[];
    fieldIds?: string[];
  };

  if (!docType) {
    return error("docType is required");
  }

  const config = getDocTypeConfig(docType);
  if (!config) {
    return error(`Unsupported document type: ${docType}`);
  }

  try {
    // Dynamic import to avoid circular dependencies
    const { extractFieldsFromUtterance } = await import(
      "../../server/charter/extractFieldsFromUtterance.js"
    );

    const messages = textContext
      ? [{ role: "user" as const, content: textContext }]
      : [];

    const result = await extractFieldsFromUtterance({
      messages,
      requestedFieldIds: fieldIds || [],
    });

    // Store extracted fields in draft
    if (result.ok && context.draftStore) {
      const currentDraft = (context.draftStore.get("current") as Record<string, unknown>) || {};
      context.draftStore.set("current", { ...currentDraft, ...result.fields });
    }

    return success({
      success: result.ok,
      fields: result.fields,
      warnings: result.warnings,
      fieldCount: Object.keys(result.fields || {}).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Extraction failed: ${message}`);
  }
}

/**
 * Handle document validation
 */
export async function handleDocumentValidate(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResponse> {
  const { docType, fields } = args as {
    docType: string;
    fields: Record<string, unknown>;
  };

  if (!docType || !fields) {
    return error("docType and fields are required");
  }

  const config = getDocTypeConfig(docType);
  if (!config) {
    return error(`Unsupported document type: ${docType}`);
  }

  try {
    await ensureValidationAssets(docType, config);

    const { isValid, errors, normalized } = await validateDocument(
      docType,
      config,
      fields
    );

    return success({
      valid: isValid,
      errors: errors || [],
      normalized,
      errorCount: errors?.length || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Validation failed: ${message}`);
  }
}

/**
 * Handle document review
 */
export async function handleDocumentReview(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResponse> {
  const { docType, fields, dimensions } = args as {
    docType: string;
    fields: Record<string, unknown>;
    dimensions?: string[];
  };

  if (!docType || !fields) {
    return error("docType and fields are required");
  }

  const config = getDocTypeConfig(docType);
  if (!config) {
    return error(`Unsupported document type: ${docType}`);
  }

  try {
    // Dynamic import to avoid loading review dependencies upfront
    const { reviewDocument, REVIEW_DIMENSIONS } = await import("../../lib/doc/review.js");

    const result = await reviewDocument(docType, fields, {
      dimensions: dimensions || REVIEW_DIMENSIONS,
    });

    // Cache the review result
    if (context.reviewCache) {
      context.reviewCache.set("latest", result);
    }

    return success({
      overallScore: result.overall_score,
      dimensionScores: result.dimension_scores,
      strengths: result.strengths,
      feedback: result.feedback,
      feedbackCount: result.feedback?.length || 0,
      summary: result.summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Review failed: ${message}`);
  }
}

/**
 * Handle document rendering
 */
export async function handleDocumentRender(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResponse> {
  const { docType, fields, format = "docx" } = args as {
    docType: string;
    fields: Record<string, unknown>;
    format?: string;
  };

  if (!docType || !fields) {
    return error("docType and fields are required");
  }

  try {
    if (format === "docx") {
      const buffer = await renderDocxBufferForDocType(docType, fields);

      // Return base64-encoded document
      const base64 = buffer.toString("base64");

      return success({
        format: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data: base64,
        size: buffer.length,
        filename: `${docType}-${Date.now()}.docx`,
      });
    } else if (format === "pdf") {
      // PDF rendering would go here
      return error("PDF rendering not yet implemented in MCP handler");
    } else {
      return error(`Unsupported format: ${format}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Render failed: ${message}`);
  }
}

/**
 * Handle document analysis
 */
export async function handleDocumentAnalyze(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResponse> {
  const { attachmentId, content } = args as {
    attachmentId?: string;
    content?: string;
  };

  if (!attachmentId && !content) {
    return error("Either attachmentId or content is required");
  }

  try {
    // Dynamic import
    const { DocumentAnalyzer } = await import(
      "../../server/documents/analysis/DocumentAnalyzer.js"
    );

    const analyzer = new DocumentAnalyzer();
    const result = await analyzer.analyze({
      content: content || "",
      attachmentId,
    });

    return success({
      documentType: result.documentType,
      confidence: result.confidence,
      suggestedTargets: result.suggestedTargets,
      fieldPreviews: result.fieldPreviews,
      summary: result.summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Analysis failed: ${message}`);
  }
}

/**
 * Handle field feedback request
 */
export async function handleFieldFeedback(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResponse> {
  const { docType, fieldId, currentValue, context: fieldContext } = args as {
    docType: string;
    fieldId: string;
    currentValue: string;
    context?: string;
  };

  if (!docType || !fieldId || currentValue === undefined) {
    return error("docType, fieldId, and currentValue are required");
  }

  const config = getDocTypeConfig(docType);
  if (!config) {
    return error(`Unsupported document type: ${docType}`);
  }

  try {
    // Get field schema to understand what's expected
    const { CHARTER_FIELDS } = await import("../../src/features/charter/schema.js");

    const field = CHARTER_FIELDS.find((f: { id: string }) => f.id === fieldId);
    if (!field) {
      return error(`Unknown field: ${fieldId}`);
    }

    // Validate the current value
    await ensureValidationAssets(docType, config);
    const { isValid, errors } = await validateDocument(docType, config, {
      [fieldId]: currentValue,
    });

    // Build feedback based on validation and field definition
    const feedback: {
      fieldId: string;
      fieldName: string;
      valid: boolean;
      issues: string[];
      suggestions: string[];
      examples?: string[];
    } = {
      fieldId,
      fieldName: field.label || fieldId,
      valid: isValid,
      issues: [],
      suggestions: [],
    };

    if (!isValid && errors) {
      feedback.issues = errors.map((e: { message?: string }) => e.message || "Invalid value");
    }

    // Add field-specific suggestions based on type
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(currentValue)) {
      feedback.suggestions.push("Use ISO date format: YYYY-MM-DD");
    }

    if (field.type === "string_list" && typeof currentValue === "string") {
      feedback.suggestions.push("This field expects a list of items");
    }

    if (field.hint) {
      feedback.suggestions.push(`Hint: ${field.hint}`);
    }

    if (field.examples) {
      feedback.examples = field.examples;
    }

    return success(feedback);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Feedback generation failed: ${message}`);
  }
}

/**
 * Handle draft update
 */
export async function handleDraftUpdate(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResponse> {
  const { fields, respectLocks = true } = args as {
    fields: Record<string, unknown>;
    respectLocks?: boolean;
  };

  if (!fields || typeof fields !== "object") {
    return error("fields object is required");
  }

  if (!context.draftStore) {
    return error("Draft store not available");
  }

  try {
    const currentDraft = (context.draftStore.get("current") as Record<string, unknown>) || {};
    const lockedFields = (context.draftStore.get("locks") as Set<string>) || new Set();

    const updates: Record<string, unknown> = {};
    const skipped: string[] = [];

    for (const [fieldId, value] of Object.entries(fields)) {
      if (respectLocks && lockedFields.has(fieldId)) {
        skipped.push(fieldId);
      } else {
        updates[fieldId] = value;
      }
    }

    const newDraft = { ...currentDraft, ...updates };
    context.draftStore.set("current", newDraft);

    return success({
      updated: Object.keys(updates),
      skipped,
      totalFields: Object.keys(newDraft).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Draft update failed: ${message}`);
  }
}

/**
 * Handle guided navigation
 */
export async function handleGuidedNavigate(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResponse> {
  const { action, targetFieldId, conversationId } = args as {
    action: string;
    targetFieldId?: string;
    conversationId?: string;
  };

  if (!action) {
    return error("action is required");
  }

  const validActions = ["next", "back", "skip", "review", "goto", "start"];
  if (!validActions.includes(action)) {
    return error(`Invalid action: ${action}. Must be one of: ${validActions.join(", ")}`);
  }

  if (action === "goto" && !targetFieldId) {
    return error("targetFieldId is required for 'goto' action");
  }

  // Use context conversationId or provided one
  const sessionId = conversationId || context.conversationId || `mcp-session-${Date.now()}`;

  try {
    // Dynamic import to avoid circular dependencies
    const {
      startSession,
      handleCommand,
      getState,
      hasSession,
      promptCurrentField,
    } = await import("../../server/charter/Orchestrator.js");

    const interactionOptions = {
      conversationId: sessionId,
    };

    let result;

    if (action === "start") {
      // Start a new session
      result = await startSession(interactionOptions);
      return success({
        action: "start",
        sessionId,
        sessionStarted: true,
        state: {
          currentField: result.state.currentFieldId,
          phase: result.state.phase,
          progress: calculateProgress(result.state),
        },
        messages: result.assistantMessages,
      });
    }

    if (!hasSession(sessionId)) {
      return error(`No active session found. Use action 'start' to begin a new guided session.`);
    }

    if (action === "next") {
      // Prompt for the current field (effectively moves to next if current is filled)
      result = await promptCurrentField(interactionOptions);
    } else if (action === "back" || action === "skip" || action === "review") {
      // Handle navigation commands
      result = await handleCommand(action, interactionOptions);
    } else if (action === "goto" && targetFieldId) {
      // Handle goto with edit command
      result = await handleCommand(`edit ${targetFieldId}`, interactionOptions);
    } else {
      return error(`Unsupported action: ${action}`);
    }

    const currentState = getState(sessionId);

    return success({
      action,
      targetFieldId,
      sessionId,
      handled: result.handled,
      state: {
        currentField: currentState.currentFieldId,
        phase: currentState.phase,
        progress: calculateProgress(currentState),
        completedFields: Object.keys(currentState.fields).filter(
          (k) => currentState.fields[k as keyof typeof currentState.fields] != null
        ),
      },
      messages: result.assistantMessages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Navigation failed: ${message}`);
  }
}

/**
 * Calculate progress percentage for a guided session
 */
function calculateProgress(state: { fields: Record<string, unknown> }): number {
  const totalFields = 12; // Charter has ~12 main fields
  const filledFields = Object.values(state.fields).filter((v) => v != null).length;
  return Math.round((filledFields / totalFields) * 100);
}

/**
 * Handle resource read requests
 */
export async function handleReadResource(
  uri: string,
  context: ToolContext
): Promise<unknown> {
  if (uri === "exact-va://draft/current") {
    const draft = context.draftStore?.get("current") || {};
    const locks = context.draftStore?.get("locks") || new Set();

    return {
      fields: draft,
      lockedFields: Array.from(locks as Set<string>),
      fieldCount: Object.keys(draft as Record<string, unknown>).length,
    };
  }

  if (uri === "exact-va://review/latest") {
    const review = context.reviewCache?.get("latest");
    if (!review) {
      return { message: "No review available", hasReview: false };
    }
    return { ...review as Record<string, unknown>, hasReview: true };
  }

  if (uri === "exact-va://session/state") {
    // Would integrate with guided charter session state
    return {
      active: false,
      message: "Session state not yet implemented",
    };
  }

  if (uri.startsWith("exact-va://schema/")) {
    const docType = uri.replace("exact-va://schema/", "");
    const config = getDocTypeConfig(docType);

    if (!config) {
      throw new Error(`Unknown document type: ${docType}`);
    }

    // Return schema information
    const { CHARTER_FIELDS } = await import("../../src/features/charter/schema.js");

    return {
      docType,
      fields: CHARTER_FIELDS.map((f: { id: string; label?: string; type: string; required?: boolean; hint?: string }) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required,
        hint: f.hint,
      })),
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}
