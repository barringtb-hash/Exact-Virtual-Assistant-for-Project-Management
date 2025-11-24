/**
 * Shared utility functions for document extraction
 */

import fs from "fs/promises";
import { InvalidDocPayloadError } from "../../../lib/doc/errors.js";
import {
  ATTACHMENT_CHAR_LIMIT,
  MIN_TEXT_CONTEXT_LENGTH,
  VALID_TOOL_ROLES,
} from "../../config/extraction.js";

// Re-export constants for backwards compatibility
export { ATTACHMENT_CHAR_LIMIT, MIN_TEXT_CONTEXT_LENGTH, VALID_TOOL_ROLES };

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extract text content from a message entry
 */
export function extractMessageText(entry) {
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
 * Get the text from the last user message
 */
export function getLastUserMessageText(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    const role = typeof entry?.role === "string" && entry.role.trim() ? entry.role.trim() : "user";
    if (role !== "user") {
      continue;
    }

    const text = extractMessageText(entry);
    if (text) {
      return text;
    }
  }

  return "";
}

/**
 * Normalize intent value
 */
export function normalizeIntent(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "object") {
    return value;
  }

  return null;
}

/**
 * Read the first available file from a list of paths
 */
export async function readFirstAvailableFile(paths = []) {
  for (const filePath of paths) {
    if (!filePath) {
      continue;
    }
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { content, path: filePath };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return null;
}

/**
 * Format document type metadata for system prompt
 */
export function formatDocTypeMetadata(metadata) {
  if (!metadata) {
    return "";
  }

  if (metadata.path.endsWith(".json")) {
    try {
      const parsed = JSON.parse(metadata.content);
      return `Doc Type Metadata:\n${JSON.stringify(parsed, null, 2)}`;
    } catch {
      // fall back to raw content
    }
  }

  const trimmed = metadata.content.trim();
  if (!trimmed) {
    return "";
  }

  return `Doc Type Metadata:\n${trimmed}`;
}

/**
 * Format attachments for system prompt
 */
export function formatAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "";
  }

  const formatted = attachments
    .map((attachment, index) => {
      const rawText = typeof attachment?.text === "string" ? attachment.text : "";
      const text = rawText.slice(0, ATTACHMENT_CHAR_LIMIT).trim();
      if (!text) {
        return null;
      }

      const name =
        typeof attachment?.name === "string" && attachment.name.trim()
          ? attachment.name.trim()
          : `Attachment ${index + 1}`;
      const mimeType =
        typeof attachment?.mimeType === "string" && attachment.mimeType.trim()
          ? attachment.mimeType.trim()
          : "";

      const headerParts = [`### Attachment: ${name}`];
      if (mimeType) {
        headerParts.push(`Type: ${mimeType}`);
      }

      return [...headerParts, text].join("\n");
    })
    .filter(Boolean);

  if (formatted.length === 0) {
    return "";
  }

  return `Attachment Context:\n${formatted.join("\n\n")}`;
}

/**
 * Format voice events for system prompt
 */
export function formatVoice(voiceEvents) {
  if (!Array.isArray(voiceEvents) || voiceEvents.length === 0) {
    return "";
  }

  const entries = voiceEvents
    .map((event) => {
      const text = typeof event?.text === "string" ? event.text.trim() : "";
      if (!text) {
        return null;
      }
      const timestamp =
        typeof event?.timestamp === "number"
          ? new Date(event.timestamp).toISOString()
          : undefined;
      const prefix = timestamp ? `[${timestamp}] ` : "";
      return `${prefix}${text}`;
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  return `Voice Context:\n${entries.join("\n")}`;
}

/**
 * Normalize request body (handles string or object)
 */
export function normalizeRequestBody(body) {
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
      return {};
    } catch {
      return {};
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  return {};
}

/**
 * Extract document payload from request body
 * Looks for .document or .charter properties, falls back to body itself
 */
export function extractDocumentPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const documentCandidate = body.document;
  if (documentCandidate && typeof documentCandidate === "object" && !Array.isArray(documentCandidate)) {
    return documentCandidate;
  }

  const charterCandidate = body.charter;
  if (charterCandidate && typeof charterCandidate === "object" && !Array.isArray(charterCandidate)) {
    return charterCandidate;
  }

  return body;
}

/**
 * Parse and extract document from request body with validation
 */
export function parseDocumentBody(body, { docType, docLabel }) {
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
        return extractDocumentPayload(parsed);
      }
      throw new InvalidDocPayloadError(
        docType,
        `Request body must be a JSON object containing the ${docLabel.toLowerCase()} payload.`
      );
    } catch (error) {
      if (error instanceof InvalidDocPayloadError) {
        throw error;
      }
      throw new InvalidDocPayloadError(
        docType,
        `Request body must be valid JSON matching the ${docLabel.toLowerCase()} schema.`,
        error?.message
      );
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return extractDocumentPayload(body);
  }

  throw new InvalidDocPayloadError(
    docType,
    `Request body must be a JSON object containing the ${docLabel.toLowerCase()} payload.`
  );
}

/**
 * Check if guided mode is enabled
 */
export function isGuidedEnabled(value) {
  if (value === true) {
    return true;
  }
  if (value === 1) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed === "true" || trimmed === "1" || trimmed === "yes";
  }
  return false;
}

/**
 * Compute total text length from user messages
 */
export function computeUserTextLength(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.reduce((total, entry) => {
    const role = typeof entry?.role === "string" && entry.role.trim() ? entry.role.trim() : "user";
    if (role !== "user") {
      return total;
    }

    const text = extractMessageText(entry);
    return text ? total + text.length : total;
  }, 0);
}

/**
 * Check if voice events contain text
 */
export function hasVoiceText(voiceEvents) {
  if (!Array.isArray(voiceEvents)) {
    return false;
  }

  return voiceEvents.some((event) => {
    if (!event || typeof event !== "object") {
      return false;
    }
    const text = typeof event.text === "string" ? event.text.trim() : "";
    return Boolean(text);
  });
}

/**
 * Check if attachments contain context
 */
export function hasAttachmentContext(attachments) {
  if (!Array.isArray(attachments)) {
    return false;
  }

  return attachments.some((attachment) => attachment != null);
}

/**
 * Map extraction error code to HTTP status code
 */
export function mapExtractionErrorToStatus(code) {
  switch (code) {
    case "no_fields_requested":
      return 400;
    case "missing_required":
    case "validation_failed":
      return 409;
    case "configuration":
      return 500;
    case "openai_error":
    case "invalid_tool_payload":
    case "missing_tool_call":
      return 502;
    default:
      return 500;
  }
}
