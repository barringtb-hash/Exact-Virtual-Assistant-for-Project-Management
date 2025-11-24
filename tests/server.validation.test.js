import test from "node:test";
import assert from "node:assert/strict";

import {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  withValidation,
  normalizeValidationErrors,
  DOC_TYPE_SCHEMA,
  MESSAGES_SCHEMA,
  SDP_BODY_SCHEMA,
  __clearValidatorCache,
} from "../server/middleware/validation.js";

import { createMockResponse } from "./helpers/http.js";

// Clear cache before tests
test.beforeEach(() => {
  __clearValidatorCache();
});

// ============================================================================
// validate() Tests
// ============================================================================

test("validate returns valid:true for matching data", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
    },
  };

  const result = validate({ name: "John" }, schema);

  assert.equal(result.valid, true);
  assert.deepEqual(result.data, { name: "John" });
  assert.equal(result.errors, undefined);
});

test("validate returns errors for invalid data", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
    },
  };

  const result = validate({}, schema);

  assert.equal(result.valid, false);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errorResponse);
});

test("validate coerces types when possible", () => {
  const schema = {
    type: "object",
    properties: {
      count: { type: "number" },
    },
  };

  const result = validate({ count: "42" }, schema);

  assert.equal(result.valid, true);
  assert.equal(result.data.count, 42);
});

test("validate uses defaults from schema", () => {
  const schema = {
    type: "object",
    properties: {
      active: { type: "boolean", default: true },
    },
  };

  const result = validate({}, schema);

  assert.equal(result.valid, true);
  assert.equal(result.data.active, true);
});

test("validate includes path in error response", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
    },
  };

  const result = validate({}, schema, { path: "/api/users" });

  assert.equal(result.errorResponse.path, "/api/users");
});

// ============================================================================
// normalizeValidationErrors() Tests
// ============================================================================

test("normalizeValidationErrors formats AJV errors", () => {
  const ajvErrors = [
    {
      instancePath: "/email",
      message: "must be a valid email",
      keyword: "format",
      params: { format: "email" },
    },
  ];

  const result = normalizeValidationErrors(ajvErrors);

  assert.equal(result.length, 1);
  assert.equal(result[0].field, "email");
  assert.equal(result[0].keyword, "format");
  assert.ok(result[0].message);
});

test("normalizeValidationErrors handles required errors", () => {
  const ajvErrors = [
    {
      instancePath: "",
      message: "must have required property 'name'",
      keyword: "required",
      params: { missingProperty: "name" },
    },
  ];

  const result = normalizeValidationErrors(ajvErrors);

  assert.equal(result.length, 1);
  assert.equal(result[0].message, "name is required");
});

test("normalizeValidationErrors handles empty array", () => {
  const result = normalizeValidationErrors([]);

  assert.deepEqual(result, []);
});

test("normalizeValidationErrors handles null/undefined", () => {
  assert.deepEqual(normalizeValidationErrors(null), []);
  assert.deepEqual(normalizeValidationErrors(undefined), []);
});

// ============================================================================
// validateBody() Tests
// ============================================================================

test("validateBody validates request body", () => {
  const schema = {
    type: "object",
    required: ["docType"],
    properties: {
      docType: { type: "string" },
    },
  };

  const req = {
    body: { docType: "charter" },
    path: "/api/documents/validate",
  };

  const result = validateBody(req, schema);

  assert.equal(result.valid, true);
  assert.equal(result.data.docType, "charter");
});

test("validateBody returns errors for invalid body", () => {
  const schema = {
    type: "object",
    required: ["docType"],
    properties: {
      docType: { type: "string" },
    },
  };

  const req = {
    body: {},
    path: "/api/documents/validate",
  };

  const result = validateBody(req, schema);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

// ============================================================================
// validateQuery() Tests
// ============================================================================

test("validateQuery validates query parameters", () => {
  const schema = {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
    },
  };

  const req = {
    query: { id: "123" },
    path: "/api/documents",
  };

  const result = validateQuery(req, schema);

  assert.equal(result.valid, true);
  assert.equal(result.data.id, "123");
});

// ============================================================================
// validateParams() Tests
// ============================================================================

test("validateParams validates path parameters", () => {
  const schema = {
    type: "object",
    required: ["charterId"],
    properties: {
      charterId: { type: "string", pattern: "^[a-z0-9-]+$" },
    },
  };

  const req = {
    params: { charterId: "abc-123" },
    path: "/api/charters/abc-123",
  };

  const result = validateParams(req, schema);

  assert.equal(result.valid, true);
});

test("validateParams rejects invalid pattern", () => {
  const schema = {
    type: "object",
    properties: {
      charterId: { type: "string", pattern: "^[a-z0-9-]+$" },
    },
  };

  const req = {
    params: { charterId: "ABC_123" },
    path: "/api/charters/ABC_123",
  };

  const result = validateParams(req, schema);

  assert.equal(result.valid, false);
});

// ============================================================================
// withValidation() Tests
// ============================================================================

test("withValidation validates body and calls handler on success", async () => {
  const bodySchema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
    },
  };

  let handlerCalled = false;
  const handler = withValidation({ body: bodySchema }, async (req, res) => {
    handlerCalled = true;
    assert.equal(req.validatedBody.name, "Test");
    res.status(200).json({ ok: true });
  });

  const req = { body: { name: "Test" }, path: "/api/test" };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(handlerCalled, true);
  assert.equal(res.statusCode, 200);
});

test("withValidation returns 400 for invalid body", async () => {
  const bodySchema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
    },
  };

  let handlerCalled = false;
  const handler = withValidation({ body: bodySchema }, async () => {
    handlerCalled = true;
  });

  const req = { body: {}, path: "/api/test" };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(handlerCalled, false);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
});

test("withValidation validates both body and query", async () => {
  const bodySchema = {
    type: "object",
    required: ["data"],
    properties: {
      data: { type: "string" },
    },
  };

  const querySchema = {
    type: "object",
    properties: {
      format: { type: "string", default: "json" },
    },
  };

  let handlerCalled = false;
  const handler = withValidation(
    { body: bodySchema, query: querySchema },
    async (req, res) => {
      handlerCalled = true;
      assert.equal(req.validatedBody.data, "test");
      assert.equal(req.validatedQuery.format, "json");
      res.status(200).json({ ok: true });
    }
  );

  const req = {
    body: { data: "test" },
    query: {},
    path: "/api/test",
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(handlerCalled, true);
});

// ============================================================================
// Common Schema Tests
// ============================================================================

test("DOC_TYPE_SCHEMA validates correct doc types", () => {
  const validTypes = ["charter", "ddp", "sow", "test-doc", "doc_v2"];

  for (const docType of validTypes) {
    const result = validate(docType, DOC_TYPE_SCHEMA);
    assert.equal(result.valid, true, `Should accept: ${docType}`);
  }
});

test("DOC_TYPE_SCHEMA rejects invalid doc types", () => {
  const invalidTypes = ["", "123", "doc type", "a".repeat(101)];

  for (const docType of invalidTypes) {
    const result = validate(docType, DOC_TYPE_SCHEMA);
    assert.equal(result.valid, false, `Should reject: ${docType}`);
  }
});

test("MESSAGES_SCHEMA validates message arrays", () => {
  const messages = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there" },
  ];

  const result = validate(messages, MESSAGES_SCHEMA);

  assert.equal(result.valid, true);
});

test("SDP_BODY_SCHEMA requires sdp field", () => {
  const result = validate({}, SDP_BODY_SCHEMA);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "sdp" || e.message.includes("sdp")));
});

test("SDP_BODY_SCHEMA accepts valid SDP", () => {
  const result = validate(
    { sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\nt=0 0" },
    SDP_BODY_SCHEMA
  );

  assert.equal(result.valid, true);
});
