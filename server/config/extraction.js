/**
 * Extraction configuration constants
 * Centralized configuration for document extraction behavior
 * @module server/config/extraction
 */

/**
 * Maximum character limit for attachment text content
 * Attachments exceeding this limit will be truncated
 */
export const ATTACHMENT_CHAR_LIMIT = 20_000;

/**
 * Minimum length of user text required before extraction can proceed
 * Prevents extraction on empty or minimal input
 */
export const MIN_TEXT_CONTEXT_LENGTH = 25;

/**
 * Valid roles that can be assigned to messages in tool calls
 * Messages with roles outside this list will be filtered
 */
export const VALID_TOOL_ROLES = ['user', 'assistant', 'system', 'developer'];

/**
 * Maximum number of messages to include in extraction context
 * Helps prevent token limit issues with large conversations
 */
export const MAX_CONTEXT_MESSAGES = 50;

/**
 * Maximum number of attachments to process per request
 */
export const MAX_ATTACHMENTS = 10;

/**
 * Maximum number of voice events to process per request
 */
export const MAX_VOICE_EVENTS = 20;

/**
 * Default seed value for reproducible extractions (if not provided)
 * Undefined means no seed will be used
 */
export const DEFAULT_EXTRACTION_SEED = undefined;

/**
 * Extraction status codes
 */
export const EXTRACTION_STATUS = {
  /** Extraction completed successfully */
  OK: 'ok',
  /** Extraction was skipped due to conditions */
  SKIPPED: 'skipped',
  /** Extraction encountered a recoverable error */
  ERROR: 'error',
  /** Confirmation was accepted */
  CONFIRMED: 'confirmed',
  /** Extraction is pending user confirmation */
  PENDING_CONFIRMATION: 'pending_confirmation',
};

/**
 * Reasons for skipping extraction
 */
export const SKIP_REASONS = {
  /** No intent was detected or provided */
  NO_INTENT: 'no_intent',
  /** Insufficient context (text, attachments, voice) */
  INSUFFICIENT_CONTEXT: 'insufficient_context',
  /** No fields were requested for extraction */
  NO_FIELDS_REQUESTED: 'no_fields_requested',
};

/**
 * Intent sources for audit logging
 */
export const INTENT_SOURCES = {
  /** Intent provided explicitly by client */
  CLIENT_PROVIDED: 'client_provided',
  /** Intent derived from the last user message */
  DERIVED_LAST_USER_MESSAGE: 'derived_last_user_message',
  /** Intent derived from conversation analysis */
  DERIVED_CONVERSATION: 'derived_conversation',
};

/**
 * Export all constants as a single configuration object
 */
export const EXTRACTION_CONFIG = {
  ATTACHMENT_CHAR_LIMIT,
  MIN_TEXT_CONTEXT_LENGTH,
  VALID_TOOL_ROLES,
  MAX_CONTEXT_MESSAGES,
  MAX_ATTACHMENTS,
  MAX_VOICE_EVENTS,
  DEFAULT_EXTRACTION_SEED,
  EXTRACTION_STATUS,
  SKIP_REASONS,
  INTENT_SOURCES,
};

export default EXTRACTION_CONFIG;
