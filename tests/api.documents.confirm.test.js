/**
 * Tests for /api/documents/confirm endpoint
 *
 * @module tests/api.documents.confirm.test
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// Mock featureFlags before importing handler
let mockDocumentAnalysisEnabled = false;
mock.module("../../config/featureFlags.js", {
  namedExports: {
    isDocumentAnalysisEnabled: () => mockDocumentAnalysisEnabled,
    getAnalysisCacheTTL: () => 900,
    getAnalysisConfidenceThreshold: () => 0.5,
    getAnalysisModel: () => "gpt-4o",
    isIntentOnlyExtractionEnabled: () => true,
    getExtractionMode: () => mockDocumentAnalysisEnabled ? "analysis-driven" : "intent-driven",
  },
});

// Mock AnalysisCache
let mockCachedAnalysis = null;
mock.module("../../server/documents/analysis/AnalysisCache.js", {
  namedExports: {
    storeAnalysis: () => ({ analysisId: "test_analysis_123" }),
    getAnalysis: () => mockCachedAnalysis,
    confirmAnalysis: () => true,
    deleteAnalysis: () => true,
    getCacheStats: () => ({ size: 0, ttlSeconds: 900 }),
    clearCache: () => {},
    stopCleanupInterval: () => {},
  },
});

// Mock OpenAI extraction
let mockExtractionResult = null;
mock.module("../../server/documents/openai/client.js", {
  namedExports: {
    executeOpenAIExtraction: async () => {
      if (mockExtractionResult instanceof Error) {
        throw mockExtractionResult;
      }
      return mockExtractionResult;
    },
    loadExtractPrompt: async () => "System prompt",
    loadExtractMetadata: async () => null,
    buildOpenAIMessages: () => [],
  },
});

// Mock REGISTRY
mock.module("../../lib/doc/registry.js", {
  defaultExport: new Map([
    ["charter", { type: "charter", label: "Project Charter" }],
    ["ddp", { type: "ddp", label: "Design & Development Plan" }],
    ["sow", { type: "sow", label: "Statement of Work" }],
  ]),
});

// Import handler after mocks
const handler = (await import("../../api/documents/confirm.js")).default;

function createMockReq(body = {}, method = "POST") {
  return {
    method,
    body,
    query: {},
    headers: {},
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

describe("/api/documents/confirm", () => {
  beforeEach(() => {
    mockDocumentAnalysisEnabled = true;
    mockCachedAnalysis = {
      analysisId: "analysis_test123",
      timestamp: Date.now(),
      ttl: 900,
      status: "pending",
      attachments: [{ text: "Test document content" }],
      rawContent: {
        extractedText: "Test document content",
        tables: [],
        metadata: {},
      },
      analysis: {
        documentClassification: {
          primaryType: "project_scope",
          confidence: 0.87,
          signals: ["Contains project overview"],
        },
        suggestedTargets: [
          {
            docType: "charter",
            confidence: 0.87,
            rationale: "Document contains project scope information",
            coverage: {
              available: ["project_name", "vision"],
              missing: ["sponsor"],
              inferrable: ["start_date"],
            },
          },
        ],
        alternativeTargets: [],
        clarificationQuestions: [],
      },
    };
    mockExtractionResult = {
      project_name: "Customer Portal Redesign",
      vision: "Modernize the customer portal",
      scope_in: ["Feature A", "Feature B"],
    };
  });

  afterEach(() => {
    mockDocumentAnalysisEnabled = false;
    mockCachedAnalysis = null;
    mockExtractionResult = null;
  });

  it("rejects non-POST requests", async () => {
    const req = createMockReq({}, "GET");
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error.code, "METHOD_NOT_ALLOWED");
  });

  it("returns error when feature is disabled", async () => {
    mockDocumentAnalysisEnabled = false;

    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: { docType: "charter", action: "create" },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "FEATURE_DISABLED");
  });

  it("rejects requests without analysisId", async () => {
    const req = createMockReq({
      confirmed: { docType: "charter", action: "create" },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_ANALYSIS_ID");
  });

  it("returns 404 for expired/invalid analysisId", async () => {
    mockCachedAnalysis = null;

    const req = createMockReq({
      analysisId: "analysis_expired123",
      confirmed: { docType: "charter", action: "create" },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, "ANALYSIS_NOT_FOUND");
  });

  it("rejects requests without confirmed object", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_CONFIRMATION");
  });

  it("rejects requests without docType", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: { action: "create" },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_DOC_TYPE");
  });

  it("rejects unsupported docType", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: { docType: "unknown_type", action: "create" },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "UNSUPPORTED_DOC_TYPE");
  });

  it("rejects invalid action", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: { docType: "charter", action: "invalid" },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_ACTION");
  });

  it("successfully confirms and extracts with valid request", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: {
        docType: "charter",
        action: "create",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "extracted");
    assert.ok(res.body.extractionId);
    assert.ok(res.body.fields);
    assert.equal(res.body.fields.project_name, "Customer Portal Redesign");
  });

  it("applies fieldOverrides to extracted fields", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: {
        docType: "charter",
        action: "create",
        fieldOverrides: {
          sponsor: "User Provided Sponsor",
          project_name: "Overridden Project Name",
        },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.fields.sponsor, "User Provided Sponsor");
    assert.equal(res.body.fields.project_name, "Overridden Project Name");
    // Original extracted field should still be present
    assert.ok(res.body.fields.vision);
  });

  it("defaults action to create when not specified", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: {
        docType: "charter",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "extracted");
  });

  it("handles extraction errors gracefully", async () => {
    const apiError = new Error("OpenAI extraction failed");
    apiError.statusCode = 500;
    apiError.code = "extraction_error";
    mockExtractionResult = apiError;

    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: {
        docType: "charter",
        action: "create",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.code, "extraction_error");
  });

  it("works with update action", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: {
        docType: "charter",
        action: "update",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "extracted");
  });

  it("returns extractionId for tracking", async () => {
    const req = createMockReq({
      analysisId: "analysis_test123",
      confirmed: {
        docType: "charter",
        action: "create",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.extractionId);
    assert.ok(res.body.extractionId.startsWith("ext_"));
  });
});
