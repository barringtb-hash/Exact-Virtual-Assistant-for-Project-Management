/**
 * Sanitization utilities for document extraction
 *
 * This module provides sanitization functions that clean and normalize
 * various data structures before they're used in document extraction.
 */

const VALID_TOOL_ROLES = new Set(["user", "assistant", "system", "developer"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extract text content from a message entry
 */
function extractMessageText(entry) {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const candidates = [entry.text, entry.content, entry.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return "";
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
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

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
    })
    .filter(Boolean);
}

/**
 * Sanitize attachments array for charter tool usage
 */
export function sanitizeCharterAttachmentsForTool(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") {
        return null;
      }

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
    })
    .filter(Boolean);
}

/**
 * Sanitize voice events array for charter tool usage
 */
export function sanitizeCharterVoiceForTool(voiceEvents) {
  if (!Array.isArray(voiceEvents)) {
    return [];
  }

  return voiceEvents
    .map((event) => {
      if (!event || typeof event !== "object") {
        return null;
      }

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
    })
    .filter(Boolean);
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
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((entry) => {
      const role = typeof entry?.role === "string" ? entry.role.trim() : "user";
      if (role !== "user") {
        return null;
      }
      const text = extractMessageText(entry);
      if (!text) {
        return null;
      }
      return { role: "user", content: text, text };
    })
    .filter(Boolean);
}
