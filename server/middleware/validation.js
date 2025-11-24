/**
 * AJV-based Request Validation Middleware
 *
 * This module provides schema-based request validation using AJV (Another JSON Validator).
 * It supports validation of request body, query parameters, and path parameters.
 *
 * ## Usage
 *
 * ### Basic body validation
 * ```javascript
 * import { validateBody } from '../server/middleware/validation.js';
 *
 * const schema = {
 *   type: 'object',
 *   required: ['name'],
 *   properties: {
 *     name: { type: 'string', minLength: 1 },
 *     email: { type: 'string', format: 'email' }
 *   }
 * };
 *
 * export default async function handler(req, res) {
 *   const validation = validateBody(req, schema);
 *   if (!validation.valid) {
 *     return res.status(400).json(validation.errorResponse);
 *   }
 *   // Use validated data: validation.data
 * }
 * ```
 *
 * ### Using the handler wrapper
 * ```javascript
 * import { withValidation } from '../server/middleware/validation.js';
 *
 * export default withValidation(
 *   { body: bodySchema, query: querySchema },
 *   async (req, res) => {
 *     // req.validatedBody and req.validatedQuery are available
 *   }
 * );
 * ```
 *
 * @module server/middleware/validation
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError, formatErrorResponse } from '../utils/apiErrors.js';

/**
 * Shared AJV instance with formats
 * @type {Ajv}
 */
const ajv = new Ajv({
  allErrors: true,
  coerceTypes: true,
  useDefaults: true,
  removeAdditional: 'all',
  strict: false, // Allow additionalProperties by default
});

addFormats(ajv);

/**
 * Schema cache for compiled validators
 * @type {Map<string, Function>}
 */
const validatorCache = new Map();

/**
 * Get or create a compiled validator for a schema
 *
 * @param {Object} schema - JSON Schema
 * @param {string} [cacheKey] - Optional cache key
 * @returns {Function} Compiled validator function
 */
function getValidator(schema, cacheKey = null) {
  const key = cacheKey || JSON.stringify(schema);

  if (validatorCache.has(key)) {
    return validatorCache.get(key);
  }

  const validator = ajv.compile(schema);
  validatorCache.set(key, validator);
  return validator;
}

/**
 * Normalize AJV errors to a consistent format
 *
 * @param {Array} errors - AJV validation errors
 * @returns {Array} Normalized error objects
 */
export function normalizeValidationErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  return errors.map((error) => {
    const instancePath = error.instancePath || '';
    const field = instancePath ? instancePath.replace(/^\//, '').replace(/\//g, '.') : 'root';

    return {
      field,
      message: formatErrorMessage(error),
      keyword: error.keyword,
      params: error.params || {},
      path: instancePath,
    };
  });
}

/**
 * Format a single AJV error into a human-readable message
 *
 * @param {Object} error - AJV error object
 * @returns {string} Human-readable error message
 */
function formatErrorMessage(error) {
  const { keyword, params, message, instancePath } = error;
  const field = instancePath ? instancePath.replace(/^\//, '') : 'value';

  switch (keyword) {
    case 'required':
      return `${params.missingProperty} is required`;
    case 'type':
      return `${field} must be of type ${params.type}`;
    case 'minLength':
      return `${field} must be at least ${params.limit} characters`;
    case 'maxLength':
      return `${field} must be at most ${params.limit} characters`;
    case 'minimum':
      return `${field} must be >= ${params.limit}`;
    case 'maximum':
      return `${field} must be <= ${params.limit}`;
    case 'pattern':
      return `${field} has an invalid format`;
    case 'format':
      return `${field} must be a valid ${params.format}`;
    case 'enum':
      return `${field} must be one of: ${params.allowedValues?.join(', ')}`;
    case 'additionalProperties':
      return `Unknown property: ${params.additionalProperty}`;
    case 'minItems':
      return `${field} must have at least ${params.limit} items`;
    case 'maxItems':
      return `${field} must have at most ${params.limit} items`;
    default:
      return message || `${field} is invalid`;
  }
}

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {Object} [data] - Validated/coerced data (if valid)
 * @property {Array} [errors] - Validation errors (if invalid)
 * @property {Object} [errorResponse] - Pre-formatted error response for API
 */

/**
 * Validate data against a JSON Schema
 *
 * @param {*} data - Data to validate
 * @param {Object} schema - JSON Schema
 * @param {Object} [options] - Validation options
 * @param {string} [options.cacheKey] - Schema cache key
 * @param {string} [options.path] - Request path for error response
 * @returns {ValidationResult} Validation result
 */
export function validate(data, schema, options = {}) {
  const { cacheKey = null, path = null } = options;

  // Clone data to allow coercion without modifying original
  const dataCopy = data === null || data === undefined
    ? data
    : JSON.parse(JSON.stringify(data));

  const validator = getValidator(schema, cacheKey);
  const valid = validator(dataCopy);

  if (valid) {
    return { valid: true, data: dataCopy };
  }

  const errors = normalizeValidationErrors(validator.errors);
  const validationError = new ValidationError(
    'Request validation failed',
    errors
  );

  return {
    valid: false,
    errors,
    errorResponse: formatErrorResponse(validationError, { path }),
  };
}

/**
 * Validate request body against a schema
 *
 * @param {Object} req - Express request object
 * @param {Object} schema - JSON Schema for body
 * @param {Object} [options] - Validation options
 * @returns {ValidationResult} Validation result
 */
export function validateBody(req, schema, options = {}) {
  return validate(req.body, schema, {
    ...options,
    path: options.path || req?.path || req?.url,
  });
}

/**
 * Validate request query parameters against a schema
 *
 * @param {Object} req - Express request object
 * @param {Object} schema - JSON Schema for query
 * @param {Object} [options] - Validation options
 * @returns {ValidationResult} Validation result
 */
export function validateQuery(req, schema, options = {}) {
  return validate(req.query, schema, {
    ...options,
    path: options.path || req?.path || req?.url,
  });
}

/**
 * Validate request path parameters against a schema
 *
 * @param {Object} req - Express request object
 * @param {Object} schema - JSON Schema for params
 * @param {Object} [options] - Validation options
 * @returns {ValidationResult} Validation result
 */
export function validateParams(req, schema, options = {}) {
  return validate(req.params, schema, {
    ...options,
    path: options.path || req?.path || req?.url,
  });
}

/**
 * Create a handler wrapper with built-in validation
 *
 * @param {Object} schemas - Schemas for different parts of the request
 * @param {Object} [schemas.body] - Body schema
 * @param {Object} [schemas.query] - Query schema
 * @param {Object} [schemas.params] - Params schema
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler with validation
 *
 * @example
 * export default withValidation(
 *   {
 *     body: {
 *       type: 'object',
 *       required: ['docType'],
 *       properties: {
 *         docType: { type: 'string' },
 *         data: { type: 'object' }
 *       }
 *     }
 *   },
 *   async (req, res) => {
 *     // req.validatedBody contains the validated body
 *   }
 * );
 */
export function withValidation(schemas, handler) {
  return async (req, res) => {
    const path = req?.path || req?.url;

    // Validate body if schema provided
    if (schemas.body) {
      const bodyResult = validateBody(req, schemas.body, { path });
      if (!bodyResult.valid) {
        return res.status(400).json(bodyResult.errorResponse);
      }
      req.validatedBody = bodyResult.data;
    }

    // Validate query if schema provided
    if (schemas.query) {
      const queryResult = validateQuery(req, schemas.query, { path });
      if (!queryResult.valid) {
        return res.status(400).json(queryResult.errorResponse);
      }
      req.validatedQuery = queryResult.data;
    }

    // Validate params if schema provided
    if (schemas.params) {
      const paramsResult = validateParams(req, schemas.params, { path });
      if (!paramsResult.valid) {
        return res.status(400).json(paramsResult.errorResponse);
      }
      req.validatedParams = paramsResult.data;
    }

    // Call the original handler
    return handler(req, res);
  };
}

// ============================================================================
// Common Schema Definitions
// ============================================================================

/**
 * Common schema for document type
 */
export const DOC_TYPE_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$',
};

/**
 * Common schema for messages array
 */
export const MESSAGES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['user', 'assistant', 'system'] },
      content: { type: 'string' },
    },
  },
};

/**
 * Common schema for attachments array
 */
export const ATTACHMENTS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      type: { type: 'string' },
      name: { type: 'string' },
      content: { type: 'string' },
    },
  },
};

/**
 * Schema for extraction request body
 */
export const EXTRACTION_BODY_SCHEMA = {
  type: 'object',
  properties: {
    docType: DOC_TYPE_SCHEMA,
    messages: MESSAGES_SCHEMA,
    attachments: ATTACHMENTS_SCHEMA,
    voice: { type: 'array' },
    seed: { type: 'number' },
    intent: { type: 'string' },
    intentSource: { type: 'string' },
    intentReason: { type: 'string' },
    detect: { type: 'boolean' },
    guided: { type: 'boolean' },
    guidedRequests: { type: 'array' },
    guidedConfirmation: { type: 'object' },
    requestedFieldIds: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: true,
};

/**
 * Schema for SDP request body
 */
export const SDP_BODY_SCHEMA = {
  type: 'object',
  required: ['sdp'],
  properties: {
    sdp: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['offer', 'answer'] },
  },
};

/**
 * Schema for file text request query
 */
export const FILE_TEXT_QUERY_SCHEMA = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string', minLength: 1 },
    encoding: { type: 'string', default: 'utf-8' },
  },
};

/**
 * Clear the validator cache (for testing)
 */
export function __clearValidatorCache() {
  validatorCache.clear();
}
