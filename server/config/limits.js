/**
 * Application limits and thresholds
 * Centralized configuration for various system limits
 * @module server/config/limits
 */

/**
 * API request limits
 */
export const API_LIMITS = {
  /** Maximum request body size in bytes (10MB) */
  MAX_BODY_SIZE: 10 * 1024 * 1024,
  /** Maximum file upload size in bytes (50MB) */
  MAX_UPLOAD_SIZE: 50 * 1024 * 1024,
  /** Request timeout in milliseconds (30 seconds) */
  REQUEST_TIMEOUT_MS: 30_000,
  /** Maximum number of concurrent extractions per user */
  MAX_CONCURRENT_EXTRACTIONS: 5,
};

/**
 * Document limits
 */
export const DOCUMENT_LIMITS = {
  /** Maximum number of characters in a single field */
  MAX_FIELD_LENGTH: 10_000,
  /** Maximum number of list items in a string_list field */
  MAX_LIST_ITEMS: 100,
  /** Maximum number of entries in an object_list field */
  MAX_OBJECT_LIST_ENTRIES: 50,
  /** Maximum depth for nested objects */
  MAX_OBJECT_DEPTH: 5,
};

/**
 * Chat limits
 */
export const CHAT_LIMITS = {
  /** Maximum length of a single message */
  MAX_MESSAGE_LENGTH: 50_000,
  /** Maximum number of messages in context */
  MAX_CONTEXT_MESSAGES: 100,
  /** Maximum number of tokens to generate */
  MAX_GENERATION_TOKENS: 4096,
  /** Maximum number of attachments per message */
  MAX_ATTACHMENTS_PER_MESSAGE: 5,
};

/**
 * Rate limits (requests per minute)
 */
export const RATE_LIMITS = {
  /** Extraction endpoint */
  EXTRACTION: 60,
  /** Validation endpoint */
  VALIDATION: 120,
  /** Chat endpoint */
  CHAT: 30,
  /** Transcription endpoint */
  TRANSCRIPTION: 20,
  /** General API */
  API_DEFAULT: 100,
};

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  MAX_RETRIES: 3,
  /** Initial retry delay in milliseconds */
  INITIAL_DELAY_MS: 1000,
  /** Maximum retry delay in milliseconds */
  MAX_DELAY_MS: 10_000,
  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
};

/**
 * Cache limits
 */
export const CACHE_LIMITS = {
  /** Template cache capacity */
  TEMPLATE_CACHE_SIZE: 50,
  /** Prompt cache capacity */
  PROMPT_CACHE_SIZE: 20,
  /** Cache TTL in milliseconds (1 hour) */
  DEFAULT_TTL_MS: 60 * 60 * 1000,
};

/**
 * Validation thresholds
 */
export const VALIDATION_THRESHOLDS = {
  /** Minimum confidence score for auto-approval */
  MIN_CONFIDENCE_SCORE: 0.8,
  /** Maximum number of validation errors before rejection */
  MAX_VALIDATION_ERRORS: 10,
  /** Maximum number of warnings before flag */
  MAX_WARNINGS_BEFORE_FLAG: 5,
};

/**
 * Export all limits as a single configuration object
 */
export const LIMITS_CONFIG = {
  API_LIMITS,
  DOCUMENT_LIMITS,
  CHAT_LIMITS,
  RATE_LIMITS,
  RETRY_CONFIG,
  CACHE_LIMITS,
  VALIDATION_THRESHOLDS,
};

export default LIMITS_CONFIG;
