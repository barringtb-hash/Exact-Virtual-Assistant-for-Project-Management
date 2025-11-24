/**
 * Standard API Error Handling Utilities
 *
 * This module provides a standardized approach to API error handling,
 * ensuring consistent error response formats across all API endpoints.
 *
 * ## Standard Error Response Format
 *
 * All API errors follow this structure:
 * ```json
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Human-readable error message",
 *     "details": { ... }  // Optional additional context
 *   },
 *   "timestamp": "2025-11-24T10:00:00.000Z",
 *   "path": "/api/documents/extract"
 * }
 * ```
 *
 * ## Error Codes Reference
 *
 * | Code | HTTP Status | Description |
 * |------|-------------|-------------|
 * | METHOD_NOT_ALLOWED | 405 | Request method not supported |
 * | VALIDATION_ERROR | 400 | Request payload validation failed |
 * | INVALID_PAYLOAD | 400 | Request body is malformed |
 * | UNSUPPORTED_DOC_TYPE | 400 | Document type not supported |
 * | INSUFFICIENT_CONTEXT | 422 | Not enough context for operation |
 * | MISSING_ASSET | 500 | Required server asset not found |
 * | INTERNAL_ERROR | 500 | Unexpected server error |
 * | NOT_FOUND | 404 | Resource not found |
 * | UNAUTHORIZED | 401 | Authentication required |
 * | FORBIDDEN | 403 | Access denied |
 *
 * @module server/utils/apiErrors
 */

/**
 * Standard error codes used across the API
 * @type {Object.<string, string>}
 */
export const ERROR_CODES = {
  // Client errors (4xx)
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNSUPPORTED_DOC_TYPE: 'UNSUPPORTED_DOC_TYPE',
  INSUFFICIENT_CONTEXT: 'INSUFFICIENT_CONTEXT',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  GONE: 'GONE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',

  // Server errors (5xx)
  MISSING_ASSET: 'MISSING_ASSET',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};

/**
 * HTTP status code to error code mapping
 * @type {Object.<number, string>}
 */
export const STATUS_TO_ERROR_CODE = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  405: ERROR_CODES.METHOD_NOT_ALLOWED,
  409: ERROR_CODES.CONFLICT,
  410: ERROR_CODES.GONE,
  415: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
  422: ERROR_CODES.INSUFFICIENT_CONTEXT,
  500: ERROR_CODES.INTERNAL_ERROR,
  503: ERROR_CODES.SERVICE_UNAVAILABLE,
};

/**
 * Base class for API errors with standardized response format
 *
 * @extends Error
 */
export class ApiError extends Error {
  /**
   * @param {string} code - Error code from ERROR_CODES
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {Object} [details] - Additional error details
   */
  constructor(code, message, statusCode = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    if (details) {
      this.details = details;
    }
  }

  /**
   * Convert error to standard response format
   * @param {string} [path] - Request path
   * @returns {Object} Standard error response object
   */
  toResponse(path = null) {
    const response = {
      error: {
        code: this.code,
        message: this.message,
      },
      timestamp: new Date().toISOString(),
    };

    if (this.details) {
      response.error.details = this.details;
    }

    if (path) {
      response.path = path;
    }

    return response;
  }
}

/**
 * Method not allowed error (405)
 */
export class MethodNotAllowedError extends ApiError {
  /**
   * @param {string} [method] - The disallowed method
   * @param {string[]} [allowed] - List of allowed methods
   */
  constructor(method = null, allowed = ['POST']) {
    super(
      ERROR_CODES.METHOD_NOT_ALLOWED,
      method
        ? `Method ${method} is not allowed`
        : 'Method Not Allowed',
      405,
      allowed.length > 0 ? { allowedMethods: allowed } : null
    );
    this.name = 'MethodNotAllowedError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ApiError {
  /**
   * @param {string} message - Error message
   * @param {Array} [validationErrors] - Array of validation error details
   */
  constructor(message, validationErrors = []) {
    super(
      ERROR_CODES.VALIDATION_ERROR,
      message,
      400,
      validationErrors.length > 0 ? { validationErrors } : null
    );
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Invalid payload error (400)
 */
export class InvalidPayloadError extends ApiError {
  /**
   * @param {string} [message] - Error message
   * @param {string} [docType] - Document type if applicable
   */
  constructor(message = 'Request body is invalid', docType = null) {
    super(
      ERROR_CODES.INVALID_PAYLOAD,
      message,
      400,
      docType ? { docType } : null
    );
    this.name = 'InvalidPayloadError';
  }
}

/**
 * Insufficient context error (422)
 */
export class InsufficientContextError extends ApiError {
  /**
   * @param {string} [message] - Error message
   */
  constructor(message = 'Insufficient context provided for this operation') {
    super(ERROR_CODES.INSUFFICIENT_CONTEXT, message, 422);
    this.name = 'InsufficientContextError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  /**
   * @param {string} [resource] - Name of the resource not found
   */
  constructor(resource = 'Resource') {
    super(
      ERROR_CODES.NOT_FOUND,
      `${resource} not found`,
      404
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApiError {
  /**
   * @param {string} [message] - Error message
   */
  constructor(message = 'Access denied') {
    super(ERROR_CODES.FORBIDDEN, message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Gone error (410)
 */
export class GoneError extends ApiError {
  /**
   * @param {string} [message] - Error message
   */
  constructor(message = 'Resource is no longer available') {
    super(ERROR_CODES.GONE, message, 410);
    this.name = 'GoneError';
  }
}

/**
 * Format any error into a standard API error response
 *
 * @param {Error} error - The error to format
 * @param {Object} [options] - Formatting options
 * @param {string} [options.path] - Request path
 * @param {boolean} [options.includeStack] - Include stack trace (for development)
 * @returns {Object} Standard error response
 */
export function formatErrorResponse(error, options = {}) {
  const { path = null, includeStack = false } = options;

  // If it's already an ApiError, use its built-in formatting
  if (error instanceof ApiError) {
    return error.toResponse(path);
  }

  // Handle known error types from the codebase
  const errorCode = error?.code || error?.name || ERROR_CODES.INTERNAL_ERROR;
  const statusCode = error?.statusCode || 500;
  const message = error?.message || 'An unexpected error occurred';

  const response = {
    error: {
      code: normalizeErrorCode(errorCode),
      message,
    },
    timestamp: new Date().toISOString(),
  };

  // Add details from error properties
  const details = {};

  if (error?.docType) {
    details.docType = error.docType;
  }
  if (error?.assetType) {
    details.assetType = error.assetType;
  }
  if (error?.validationErrors && Array.isArray(error.validationErrors)) {
    details.validationErrors = error.validationErrors;
  }
  if (error?.details) {
    Object.assign(details, error.details);
  }

  if (Object.keys(details).length > 0) {
    response.error.details = details;
  }

  if (path) {
    response.path = path;
  }

  if (includeStack && error?.stack) {
    response.error.stack = error.stack;
  }

  return response;
}

/**
 * Normalize error code to standard format
 *
 * @param {string} code - Raw error code
 * @returns {string} Normalized error code
 */
function normalizeErrorCode(code) {
  if (!code || typeof code !== 'string') {
    return ERROR_CODES.INTERNAL_ERROR;
  }

  // Convert known error names to codes
  const errorNameMap = {
    UnsupportedDocTypeError: ERROR_CODES.UNSUPPORTED_DOC_TYPE,
    MissingDocAssetError: ERROR_CODES.MISSING_ASSET,
    InvalidDocPayloadError: ERROR_CODES.INVALID_PAYLOAD,
    DocumentValidationError: ERROR_CODES.VALIDATION_ERROR,
    DocAssetLoadError: ERROR_CODES.MISSING_ASSET,
  };

  if (errorNameMap[code]) {
    return errorNameMap[code];
  }

  // Convert camelCase/kebab-case to SCREAMING_SNAKE_CASE
  return code
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase();
}

/**
 * Send a standardized error response
 *
 * @param {Object} res - Express response object
 * @param {Error} error - The error to send
 * @param {Object} [options] - Response options
 * @param {string} [options.path] - Request path
 * @param {Object} [options.logger] - Logger instance
 */
export function sendErrorResponse(res, error, options = {}) {
  const { path = null, logger = console } = options;

  const statusCode = error?.statusCode || 500;
  const response = formatErrorResponse(error, { path });

  // Log server errors
  if (statusCode >= 500) {
    logger.error('API Error:', {
      statusCode,
      code: response.error.code,
      message: response.error.message,
      stack: error?.stack,
    });
  }

  res.status(statusCode).json(response);
}

/**
 * Create error handler middleware for API routes
 *
 * @param {Object} [options] - Handler options
 * @param {Object} [options.logger] - Logger instance
 * @returns {Function} Express error handler middleware
 */
export function createErrorHandler(options = {}) {
  const { logger = console } = options;

  return (error, req, res, _next) => {
    sendErrorResponse(res, error, {
      path: req?.path || req?.url,
      logger,
    });
  };
}

/**
 * Wrap an async handler with error handling
 *
 * @param {Function} handler - Async route handler
 * @returns {Function} Wrapped handler with error handling
 *
 * @example
 * export default withErrorHandling(async (req, res) => {
 *   if (req.method !== 'POST') {
 *     throw new MethodNotAllowedError(req.method);
 *   }
 *   // ... handle request
 * });
 */
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendErrorResponse(res, error, { path: req?.path || req?.url });
    }
  };
}

/**
 * Assert that the request method matches expected
 *
 * @param {Object} req - Express request object
 * @param {string|string[]} allowed - Allowed method(s)
 * @throws {MethodNotAllowedError} If method is not allowed
 */
export function assertMethod(req, allowed) {
  const methods = Array.isArray(allowed) ? allowed : [allowed];
  if (!methods.includes(req.method)) {
    throw new MethodNotAllowedError(req.method, methods);
  }
}
