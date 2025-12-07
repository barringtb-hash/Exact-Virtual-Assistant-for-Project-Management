/**
 * Server-side Sanitization Utilities
 *
 * Provides HTML sanitization, error message sanitization, and input validation
 * for server-side use. Addresses MED-01, MED-06, LOW-03.
 *
 * @module server/utils/sanitize
 */

// ============================================================================
// HTML Sanitization (MED-01)
// ============================================================================

/**
 * Allowed HTML tags for sanitized content
 */
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "code", "pre",
  "a", "span", "div",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr",
]);

/**
 * Allowed attributes per tag
 */
const ALLOWED_ATTRIBUTES = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
};

/**
 * Dangerous URL protocols
 */
const DANGEROUS_PROTOCOLS = [
  "javascript:",
  "vbscript:",
  "data:text/html",
  "data:application/javascript",
];

/**
 * Escape HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Check if a URL is safe
 * @param {string} url - URL to check
 * @returns {boolean} True if safe
 */
function isSafeUrl(url) {
  if (typeof url !== "string") {
    return false;
  }

  const normalized = url.trim().toLowerCase();

  // Check for dangerous protocols
  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (normalized.startsWith(protocol)) {
      return false;
    }
  }

  // Allow relative URLs, http, https, mailto
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("#")
  ) {
    return true;
  }

  // Disallow other protocols
  return !normalized.includes(":");
}

/**
 * Sanitize HTML content (server-side)
 *
 * This is a basic sanitizer. For production with untrusted HTML,
 * consider using a library like DOMPurify with jsdom.
 *
 * @param {string} html - HTML content to sanitize
 * @param {Object} [options] - Sanitization options
 * @param {boolean} [options.stripAllHtml] - Remove all HTML tags
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== "string") {
    return "";
  }

  const { stripAllHtml = false } = options;

  if (stripAllHtml) {
    // Remove all HTML tags
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  // Remove script tags and their content
  let sanitized = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  // Remove style tags and their content
  sanitized = sanitized.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");

  // Remove event handlers (on* attributes)
  sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, "");

  // Remove vbscript: URLs
  sanitized = sanitized.replace(/vbscript\s*:/gi, "");

  // Remove data: URLs with dangerous content
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, "");

  // Remove expression() in styles
  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, "");

  // Remove url() with dangerous content in styles
  sanitized = sanitized.replace(
    /url\s*\(\s*['"]?\s*(?:javascript|vbscript|data)/gi,
    "url(blocked"
  );

  return sanitized;
}

/**
 * Sanitize content for Teams messages (HIGH-07)
 * @param {string} message - Message content
 * @returns {string} Sanitized message
 */
export function sanitizeTeamsMessage(message) {
  if (typeof message !== "string") {
    return "";
  }

  // For Teams, we convert to plain text to prevent HTML injection
  // If HTML is needed, use a strict allowlist
  return escapeHtml(message.trim());
}

// ============================================================================
// Error Message Sanitization (LOW-03, MED-06)
// ============================================================================

/**
 * Sensitive patterns to redact from error messages
 */
const SENSITIVE_PATTERNS = [
  // API keys
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  // Paths (keep relative paths, hide absolute)
  /(?:\/home\/[^/\s]+|\/Users\/[^/\s]+|[A-Z]:\\Users\\[^/\s]+)/gi,
  // Stack traces in messages
  /at\s+\S+\s+\(\S+:\d+:\d+\)/g,
  // Connection strings
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /postgres(?:ql)?:\/\/[^\s]+/gi,
  /mysql:\/\/[^\s]+/gi,
  // Email addresses (partial redaction)
  /([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,
];

/**
 * Fields to exclude from external error responses
 */
const EXCLUDED_ERROR_FIELDS = new Set([
  "stack",
  "trace",
  "internalMessage",
  "debugInfo",
  "sqlState",
  "query",
  "params",
]);

/**
 * Sanitize an error message for external display
 * @param {string} message - Error message
 * @returns {string} Sanitized message
 */
export function sanitizeErrorMessage(message) {
  if (typeof message !== "string") {
    return "An error occurred";
  }

  let sanitized = message;

  // Apply sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Limit message length
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + "...";
  }

  return sanitized;
}

/**
 * Sanitize API error response for external clients
 * Removes sensitive details while keeping useful error info
 *
 * @param {Object} error - Error object
 * @param {Object} [options] - Options
 * @param {boolean} [options.isDevelopment] - Include more details in dev
 * @returns {Object} Sanitized error response
 */
export function sanitizeApiError(error, options = {}) {
  const { isDevelopment = process.env.NODE_ENV === "development" } = options;

  const response = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
    timestamp: new Date().toISOString(),
  };

  if (!error) {
    return response;
  }

  // Extract error code
  if (error.code && typeof error.code === "string") {
    response.error.code = error.code;
  } else if (error.name && typeof error.name === "string") {
    response.error.code = error.name.toUpperCase().replace(/ERROR$/i, "_ERROR");
  }

  // Sanitize and include message
  if (error.message) {
    response.error.message = sanitizeErrorMessage(error.message);
  }

  // Include safe details
  if (error.details && typeof error.details === "object") {
    const safeDetails = {};
    for (const [key, value] of Object.entries(error.details)) {
      if (!EXCLUDED_ERROR_FIELDS.has(key)) {
        // Sanitize string values
        if (typeof value === "string") {
          safeDetails[key] = sanitizeErrorMessage(value);
        } else if (typeof value === "number" || typeof value === "boolean") {
          safeDetails[key] = value;
        }
      }
    }
    if (Object.keys(safeDetails).length > 0) {
      response.error.details = safeDetails;
    }
  }

  // In development, include more info (but still sanitize)
  if (isDevelopment && error.stack) {
    response.error.debugStack = error.stack
      .split("\n")
      .slice(0, 5)
      .map((line) => sanitizeErrorMessage(line))
      .join("\n");
  }

  return response;
}

/**
 * Sanitize Smartsheet API error (MED-06)
 * @param {number} status - HTTP status code
 * @param {string} errorBody - Raw error body
 * @returns {string} Sanitized error message
 */
export function sanitizeSmartsheetError(status, errorBody) {
  // Map status codes to generic messages
  const statusMessages = {
    400: "Invalid request to Smartsheet API",
    401: "Smartsheet authentication failed",
    403: "Access denied to Smartsheet resource",
    404: "Smartsheet resource not found",
    429: "Smartsheet rate limit exceeded",
    500: "Smartsheet service error",
    503: "Smartsheet service unavailable",
  };

  const genericMessage = statusMessages[status] || `Smartsheet API error (${status})`;

  // Don't include raw error body in production
  if (process.env.NODE_ENV === "development") {
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message) {
        return `${genericMessage}: ${sanitizeErrorMessage(parsed.message)}`;
      }
    } catch {
      // Not JSON, use generic message
    }
  }

  return genericMessage;
}

/**
 * Sanitize Graph API error for Office 365 (HIGH-07)
 * @param {number} status - HTTP status code
 * @param {string} errorBody - Raw error body
 * @returns {string} Sanitized error message
 */
export function sanitizeGraphApiError(status, errorBody) {
  const statusMessages = {
    400: "Invalid request to Microsoft Graph API",
    401: "Microsoft Graph authentication failed",
    403: "Access denied to Microsoft resource",
    404: "Microsoft resource not found",
    429: "Microsoft Graph rate limit exceeded",
    500: "Microsoft Graph service error",
    503: "Microsoft Graph service unavailable",
  };

  const genericMessage = statusMessages[status] || `Microsoft Graph API error (${status})`;

  if (process.env.NODE_ENV === "development") {
    try {
      const parsed = JSON.parse(errorBody);
      const message = parsed.error?.message || parsed.message;
      if (message) {
        return `${genericMessage}: ${sanitizeErrorMessage(message)}`;
      }
    } catch {
      // Not JSON, use generic message
    }
  }

  return genericMessage;
}

// ============================================================================
// Input Validation (LOW-06)
// ============================================================================

/**
 * Validate and constrain string length
 * @param {unknown} value - Value to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.maxLength=10000] - Maximum length
 * @param {number} [options.minLength=0] - Minimum length
 * @param {string} [options.defaultValue=""] - Default if invalid
 * @returns {string} Validated string
 */
export function validateString(value, options = {}) {
  const {
    maxLength = 10000,
    minLength = 0,
    defaultValue = "",
  } = options;

  if (typeof value !== "string") {
    return defaultValue;
  }

  if (value.length < minLength) {
    return defaultValue;
  }

  if (value.length > maxLength) {
    return value.slice(0, maxLength);
  }

  return value;
}

/**
 * Validate Excel range address format (HIGH-08)
 * @param {string} range - Range address (e.g., "A1:B2")
 * @returns {string|null} Validated range or null if invalid
 */
export function validateExcelRange(range) {
  if (typeof range !== "string") {
    return null;
  }

  // Excel range pattern: optional sheet name, column letters, row numbers
  // Examples: A1, A1:B2, Sheet1!A1:B2, 'Sheet Name'!A1:B2
  const rangePattern = /^(?:'[^']*'!|[A-Za-z0-9_]+!)?[A-Za-z]{1,3}[0-9]{1,7}(?::[A-Za-z]{1,3}[0-9]{1,7})?$/;

  const trimmed = range.trim();
  if (!rangePattern.test(trimmed)) {
    return null;
  }

  // Additional length check
  if (trimmed.length > 100) {
    return null;
  }

  return trimmed;
}

/**
 * Validate worksheet name (HIGH-08)
 * @param {string} name - Worksheet name
 * @returns {string|null} Validated name or null if invalid
 */
export function validateWorksheetName(name) {
  if (typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim();

  // Worksheet names can't exceed 31 characters
  if (trimmed.length === 0 || trimmed.length > 31) {
    return null;
  }

  // Disallow certain characters
  const invalidChars = /[:\\/?*\[\]]/;
  if (invalidChars.test(trimmed)) {
    return null;
  }

  return trimmed;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  escapeHtml,
  sanitizeHtml,
  sanitizeTeamsMessage,
  sanitizeErrorMessage,
  sanitizeApiError,
  sanitizeSmartsheetError,
  sanitizeGraphApiError,
  validateString,
  validateExcelRange,
  validateWorksheetName,
};
