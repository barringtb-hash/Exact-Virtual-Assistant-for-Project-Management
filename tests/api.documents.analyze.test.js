/**
 * Tests for /api/documents/analyze endpoint
 *
 * @module tests/api.documents.analyze.test
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

// Mock DocumentAnalyzer
let mockAnalyzeResult = null;
mock.module("../../server/documents/analysis/DocumentAnalyzer.js", {
  namedExports: {
    analyzeDocument: async () => {
      if (mockAnalyzeResult instanceof Error) {
        throw mockAnalyzeResult;
      }
      return mockAnalyzeResult;
    },
  },
});

// Mock AnalysisCache
let mockCacheEntry = null;
mock.module("../../server/documents/analysis/AnalysisCache.js", {
  namedExports: {
    storeAnalysis: () => mockCacheEntry || { analysisId: "test_analysis_123" },
    getAnalysis: () => null,
    confirmAnalysis: () => true,
    deleteAnalysis: () => true,
    getCacheStats: () => ({ size: 0, ttlSeconds: 900 }),
    clearCache: () => {},
    stopCleanupInterval: () => {},
  },
});

// Import handler after mocks
const handler = (await import("../../api/documents/analyze.js")).default;

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

describe("/api/documents/analyze", () => {
  beforeEach(() => {
    mockDocumentAnalysisEnabled = true;
    mockAnalyzeResult = {
      status: "analyzed",
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
            previewFields: { project_name: "Test Project" },
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
      rawContent: {
        extractedText: "Test content",
        tables: [],
        metadata: { attachmentCount: 1 },
      },
    };
    mockCacheEntry = {
      analysisId: "analysis_test123",
      timestamp: Date.now(),
      ttl: 900,
      status: "pending",
    };
  });

  afterEach(() => {
    mockDocumentAnalysisEnabled = false;
    mockAnalyzeResult = null;
    mockCacheEntry = null;
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
      attachments: [{ text: "Test content" }],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "FEATURE_DISABLED");
  });

  it("rejects requests without attachments", async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_ATTACHMENTS");
  });

  it("rejects empty attachments array", async () => {
    const req = createMockReq({
      attachments: [],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_ATTACHMENTS");
  });

  it("rejects attachments without text content", async () => {
    const req = createMockReq({
      attachments: [{ name: "test.pdf" }],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "INVALID_ATTACHMENTS");
  });

  it("successfully analyzes document with valid attachments", async () => {
    const req = createMockReq({
      attachments: [
        {
          id: "file_123",
          name: "project_scope.pdf",
          mimeType: "application/pdf",
          text: "Project Scope: Customer Portal Redesign\n\nThis document outlines the project scope...",
        },
      ],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "analyzed");
    assert.ok(res.body.analysisId);
    assert.ok(res.body.analysis);
    assert.ok(res.body.analysis.documentClassification);
    assert.ok(res.body.analysis.suggestedTargets);
  });

  it("includes conversation context when provided", async () => {
    const req = createMockReq({
      attachments: [{ text: "Project scope document content" }],
      conversationContext: ["User asked about project charter", "Assistant explained charter fields"],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "analyzed");
  });

  it("includes existing draft when provided", async () => {
    const req = createMockReq({
      attachments: [{ text: "Project scope document content" }],
      existingDraft: {
        project_name: "Existing Project Name",
        sponsor: "John Doe",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "analyzed");
  });

  it("returns needs_clarification status for low confidence", async () => {
    mockAnalyzeResult = {
      status: "needs_clarification",
      analysis: {
        documentClassification: {
          primaryType: "unknown",
          confidence: 0.3,
          signals: [],
        },
        suggestedTargets: [],
        alternativeTargets: [],
        clarificationQuestions: ["What is this document about?"],
      },
      rawContent: {
        extractedText: "Ambiguous content",
        tables: [],
        metadata: {},
      },
    };

    const req = createMockReq({
      attachments: [{ text: "Ambiguous content that is hard to classify" }],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "needs_clarification");
    assert.ok(res.body.analysis.clarificationQuestions.length > 0);
  });

  it("handles analyzer errors gracefully", async () => {
    const apiError = new Error("OpenAI API error");
    apiError.statusCode = 500;
    apiError.code = "openai_error";
    mockAnalyzeResult = apiError;

    const req = createMockReq({
      attachments: [{ text: "Test content" }],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.code, "openai_error");
  });

  it("returns raw content in response", async () => {
    const req = createMockReq({
      attachments: [{ text: "Test document content for extraction" }],
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.raw);
    assert.ok(res.body.raw.extractedText);
  });
});
