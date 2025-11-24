import test from "node:test";
import assert from "node:assert/strict";

import {
  ApiError,
  MethodNotAllowedError,
  ValidationError,
  InvalidPayloadError,
  InsufficientContextError,
  NotFoundError,
  ForbiddenError,
  GoneError,
  formatErrorResponse,
  sendErrorResponse,
  createErrorHandler,
  withErrorHandling,
  assertMethod,
  ERROR_CODES,
} from "../server/utils/apiErrors.js";

import { createMockResponse } from "./helpers/http.js";

// ============================================================================
// ApiError Base Class Tests
// ============================================================================

test("ApiError creates error with code, message, and statusCode", () => {
  const error = new ApiError("TEST_ERROR", "Test message", 400);

  assert.equal(error.code, "TEST_ERROR");
  assert.equal(error.message, "Test message");
  assert.equal(error.statusCode, 400);
  assert.equal(error.name, "ApiError");
});

test("ApiError includes details when provided", () => {
  const details = { field: "email", reason: "invalid format" };
  const error = new ApiError("VALIDATION_ERROR", "Invalid input", 400, details);

  assert.deepEqual(error.details, details);
});

test("ApiError.toResponse generates standard format", () => {
  const error = new ApiError("TEST_ERROR", "Test message", 400, { extra: "data" });
  const response = error.toResponse("/api/test");

  assert.equal(response.error.code, "TEST_ERROR");
  assert.equal(response.error.message, "Test message");
  assert.deepEqual(response.error.details, { extra: "data" });
  assert.equal(response.path, "/api/test");
  assert.ok(response.timestamp);
});

// ============================================================================
// Specific Error Classes Tests
// ============================================================================

test("MethodNotAllowedError has correct defaults", () => {
  const error = new MethodNotAllowedError("GET", ["POST", "PUT"]);

  assert.equal(error.statusCode, 405);
  assert.equal(error.code, ERROR_CODES.METHOD_NOT_ALLOWED);
  assert.equal(error.message, "Method GET is not allowed");
  assert.deepEqual(error.details.allowedMethods, ["POST", "PUT"]);
});

test("MethodNotAllowedError works without method argument", () => {
  const error = new MethodNotAllowedError();

  assert.equal(error.message, "Method Not Allowed");
  assert.equal(error.statusCode, 405);
});

test("ValidationError includes validation errors in details", () => {
  const validationErrors = [
    { field: "email", message: "is required" },
    { field: "name", message: "must be at least 3 characters" },
  ];
  const error = new ValidationError("Validation failed", validationErrors);

  assert.equal(error.statusCode, 400);
  assert.equal(error.code, ERROR_CODES.VALIDATION_ERROR);
  assert.deepEqual(error.details.validationErrors, validationErrors);
  assert.deepEqual(error.validationErrors, validationErrors);
});

test("InvalidPayloadError includes docType when provided", () => {
  const error = new InvalidPayloadError("Invalid charter data", "charter");

  assert.equal(error.statusCode, 400);
  assert.equal(error.code, ERROR_CODES.INVALID_PAYLOAD);
  assert.deepEqual(error.details, { docType: "charter" });
});

test("InsufficientContextError has correct status code", () => {
  const error = new InsufficientContextError("Need more context");

  assert.equal(error.statusCode, 422);
  assert.equal(error.code, ERROR_CODES.INSUFFICIENT_CONTEXT);
});

test("NotFoundError generates resource-specific message", () => {
  const error = new NotFoundError("Document");

  assert.equal(error.message, "Document not found");
  assert.equal(error.statusCode, 404);
});

test("ForbiddenError has correct defaults", () => {
  const error = new ForbiddenError("Access denied to resource");

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, ERROR_CODES.FORBIDDEN);
});

test("GoneError has correct defaults", () => {
  const error = new GoneError("Link has expired");

  assert.equal(error.statusCode, 410);
  assert.equal(error.code, ERROR_CODES.GONE);
});

// ============================================================================
// formatErrorResponse Tests
// ============================================================================

test("formatErrorResponse handles ApiError instances", () => {
  const error = new ValidationError("Invalid input", []);
  const response = formatErrorResponse(error, { path: "/api/test" });

  assert.equal(response.error.code, ERROR_CODES.VALIDATION_ERROR);
  assert.equal(response.error.message, "Invalid input");
  assert.equal(response.path, "/api/test");
  assert.ok(response.timestamp);
});

test("formatErrorResponse handles plain Error objects", () => {
  const error = new Error("Something went wrong");
  error.statusCode = 500;
  const response = formatErrorResponse(error);

  assert.equal(response.error.message, "Something went wrong");
  assert.ok(response.timestamp);
});

test("formatErrorResponse handles errors with docType", () => {
  const error = new Error("Invalid charter");
  error.docType = "charter";
  error.statusCode = 400;
  const response = formatErrorResponse(error);

  assert.equal(response.error.details.docType, "charter");
});

test("formatErrorResponse normalizes error codes from error names", () => {
  const error = new Error("Missing asset");
  error.name = "MissingDocAssetError";
  const response = formatErrorResponse(error);

  assert.equal(response.error.code, ERROR_CODES.MISSING_ASSET);
});

// ============================================================================
// sendErrorResponse Tests
// ============================================================================

test("sendErrorResponse sends correct status and body", () => {
  const res = createMockResponse();
  const error = new ValidationError("Invalid input", []);

  sendErrorResponse(res, error, { path: "/api/test" });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, ERROR_CODES.VALIDATION_ERROR);
  assert.equal(res.body.path, "/api/test");
});

test("sendErrorResponse logs server errors", () => {
  const res = createMockResponse();
  const error = new Error("Internal failure");
  error.statusCode = 500;

  let loggedError = null;
  const mockLogger = {
    error: (msg, data) => {
      loggedError = { msg, data };
    },
  };

  sendErrorResponse(res, error, { logger: mockLogger });

  assert.ok(loggedError);
  assert.equal(loggedError.data.statusCode, 500);
});

// ============================================================================
// createErrorHandler Tests
// ============================================================================

test("createErrorHandler returns middleware function", () => {
  const handler = createErrorHandler();

  assert.equal(typeof handler, "function");
  assert.equal(handler.length, 4); // error, req, res, next
});

test("createErrorHandler middleware sends error response", () => {
  const handler = createErrorHandler();
  const error = new NotFoundError("Resource");
  const res = createMockResponse();
  const req = { path: "/api/resource" };

  handler(error, req, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.message, "Resource not found");
});

// ============================================================================
// withErrorHandling Tests
// ============================================================================

test("withErrorHandling catches and formats errors", async () => {
  const handler = withErrorHandling(async () => {
    throw new ValidationError("Bad request", []);
  });

  const res = createMockResponse();
  await handler({ path: "/api/test" }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, ERROR_CODES.VALIDATION_ERROR);
});

test("withErrorHandling allows normal responses", async () => {
  const handler = withErrorHandling(async (req, res) => {
    res.status(200).json({ success: true });
  });

  const res = createMockResponse();
  await handler({ path: "/api/test" }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});

// ============================================================================
// assertMethod Tests
// ============================================================================

test("assertMethod throws MethodNotAllowedError for wrong method", () => {
  const req = { method: "GET" };

  assert.throws(
    () => assertMethod(req, "POST"),
    (error) => {
      assert.ok(error instanceof MethodNotAllowedError);
      assert.equal(error.statusCode, 405);
      return true;
    }
  );
});

test("assertMethod accepts correct method", () => {
  const req = { method: "POST" };

  assert.doesNotThrow(() => assertMethod(req, "POST"));
});

test("assertMethod accepts array of methods", () => {
  const req = { method: "PUT" };

  assert.doesNotThrow(() => assertMethod(req, ["POST", "PUT", "PATCH"]));
});
