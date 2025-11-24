/**
 * Sanitization utilities for document extraction
 *
 * This module provides sanitization functions that clean and normalize
 * various data structures before they're used in document extraction.
 *
 * ## Purpose
 *
 * All input data from API requests must be sanitized before being passed to
 * the extraction tools. This ensures:
 * - Type safety: Invalid types are filtered out
 * - Data integrity: Malformed entries don't break extraction
 * - Security: Unexpected data shapes don't cause issues
 * - Consistency: All data follows expected formats
 *
 * ## Sanitization Flow
 *
 * ```
 * Request Body
 *     │
 *     ├─► sanitizeUserMessages() ─► Filtered user messages
 *     ├─► sanitizeCharterMessagesForTool() ─► Messages for AI tool
 *     ├─► sanitizeCharterAttachmentsForTool() ─► Attachments for AI tool
 *     ├─► sanitizeCharterVoiceForTool() ─► Voice events for AI tool
 *     ├─► sanitizeRequestedFieldIds() ─► Unique field IDs
 *     └─► sanitizeGuidedConfirmation() ─► Validated confirmation
 * ```
 *
 * @module server/documents/sanitization/sanitizers
 */

import { extractMessageText } from "../utils/index.js";

/**
 * Set of valid roles that can be assigned to messages in tool calls.
 * Messages with roles outside this set are defaulted to "user".
 * @type {Set<string>}
 */
const VALID_TOOL_ROLES = new Set(["user", "assistant", "system", "developer"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Generic array sanitizer for tool data
 * @param {Array} data - The array to sanitize
 * @param {Object} config - Configuration object
 * @param {Function} config.mapFn - Function to map each item (returns null to filter out)
 * @param {boolean} config.requireText - If true, items without text are filtered out
 * @returns {Array} Sanitized array
 */
function sanitizeArrayForTool(data, config) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      return config.mapFn(item);
    })
    .filter(Boolean);
}

/**
 * Sanitize extraction issues/warnings array
 */
export function sanitizeExtractionIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return [];
  }

  return issues
    .map((issue) => {
      if (!isPlainObject(issue)) {
        return null;
      }
      const normalized = { ...issue };
      if (typeof normalized.level !== "string") {
        normalized.level = "warning";
      }
      return normalized;
    })
    .filter(Boolean);
}

/**
 * Sanitize guided confirmation payload
 */
export function sanitizeGuidedConfirmation(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const decisionRaw = typeof value.decision === "string" ? value.decision.trim().toLowerCase() : "";
  let decision = null;
  if (decisionRaw === "approve" || decisionRaw === "confirm" || decisionRaw === "accepted") {
    decision = "approve";
  } else if (decisionRaw === "reject" || decisionRaw === "deny" || decisionRaw === "rejected") {
    decision = "reject";
  }

  if (!decision) {
    return null;
  }

  const fields = isPlainObject(value.fields) ? value.fields : {};
  const warnings = sanitizeExtractionIssues(value.warnings);
  const argumentsValue =
    value.arguments !== undefined && value.arguments !== null ? value.arguments : null;
  const error = isPlainObject(value.error) ? { ...value.error } : null;

  return {
    decision,
    fields,
    warnings,
    arguments: argumentsValue,
    error,
  };
}

/**
 * Sanitize messages array for charter tool usage
 */
export function sanitizeCharterMessagesForTool(messages) {
  return sanitizeArrayForTool(messages, {
    mapFn: (entry) => {
      const text = extractMessageText(entry);
      if (!text) {
        return null;
      }

      const roleCandidate =
        typeof entry.role === "string" && entry.role.trim()
          ? entry.role.trim().toLowerCase()
          : "user";
      const role = VALID_TOOL_ROLES.has(roleCandidate) ? roleCandidate : "user";

      return { role, content: text };
    },
  });
}

/**
 * Sanitize attachments array for charter tool usage
 */
export function sanitizeCharterAttachmentsForTool(attachments) {
  return sanitizeArrayForTool(attachments, {
    mapFn: (attachment) => {
      const text = typeof attachment.text === "string" ? attachment.text.trim() : "";
      if (!text) {
        return null;
      }

      const entry = { text };

      if (typeof attachment.name === "string" && attachment.name.trim()) {
        entry.name = attachment.name.trim();
      }

      if (typeof attachment.mimeType === "string" && attachment.mimeType.trim()) {
        entry.mimeType = attachment.mimeType.trim();
      }

      return entry;
    },
  });
}

/**
 * Sanitize voice events array for charter tool usage
 */
export function sanitizeCharterVoiceForTool(voiceEvents) {
  return sanitizeArrayForTool(voiceEvents, {
    mapFn: (event) => {
      const text = typeof event.text === "string" ? event.text.trim() : "";
      if (!text) {
        return null;
      }

      const entry = { text };

      if (typeof event.id === "string" && event.id.trim()) {
        entry.id = event.id.trim();
      }

      const timestampCandidate = event.timestamp;
      if (typeof timestampCandidate === "number" && Number.isFinite(timestampCandidate)) {
        entry.timestamp = timestampCandidate;
      }

      return entry;
    },
  });
}

/**
 * Sanitize requested field IDs array (removes duplicates and invalid entries)
 */
export function sanitizeRequestedFieldIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Sanitize charter seed value
 */
export function sanitizeCharterSeed(seed) {
  if (seed === null) {
    return null;
  }

  if (!seed || typeof seed !== "object" || Array.isArray(seed)) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(seed));
  } catch {
    return undefined;
  }
}

/**
 * Sanitize user messages (filters to only user role messages)
 */
export function sanitizeUserMessages(messages) {
  return sanitizeArrayForTool(messages, {
    mapFn: (entry) => {
      const role = typeof entry?.role === "string" ? entry.role.trim() : "user";
      if (role !== "user") {
        return null;
      }
      const text = extractMessageText(entry);
      if (!text) {
        return null;
      }
      return { role: "user", content: text, text };
    },
  });
}
