/**
 * Document Review Engine
 *
 * Provides LLM-powered analysis and feedback for project documents.
 * Extensible to support multiple document types via registry configuration.
 */

import { executeOpenAIExtraction } from "../../server/documents/openai/client.js";
import { queryKnowledge, formatKnowledgeForPrompt } from "../../server/knowledge/query.js";
import fs from "fs/promises";
import path from "path";

const reviewPromptCache = new Map();
const reviewRulesCache = new Map();

/**
 * Review dimensions evaluated for each document
 */
export const REVIEW_DIMENSIONS = [
  "completeness",
  "specificity",
  "feasibility",
  "risk_coverage",
  "scope_clarity",
  "metric_measurability",
];

/**
 * Severity levels for feedback items
 */
export const SEVERITY_LEVELS = {
  CRITICAL: "critical",
  IMPORTANT: "important",
  SUGGESTION: "suggestion",
};

/**
 * Load review prompt template for a document type
 */
async function loadReviewPrompt(docType, config) {
  const cacheKey = `${docType}:${config?.review?.promptPath || "default"}`;

  if (reviewPromptCache.has(cacheKey)) {
    return reviewPromptCache.get(cacheKey);
  }

  const promptPath = config?.review?.promptPath;
  if (!promptPath) {
    throw new Error(`Review prompt not configured for document type: ${docType}`);
  }

  try {
    const content = await fs.readFile(promptPath, "utf8");
    reviewPromptCache.set(cacheKey, content);
    return content;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Review prompt file not found: ${promptPath}`);
    }
    throw error;
  }
}

/**
 * Load review rules for a document type
 */
async function loadReviewRules(docType, config) {
  const cacheKey = `${docType}:${config?.review?.rulesPath || "default"}`;

  if (reviewRulesCache.has(cacheKey)) {
    return reviewRulesCache.get(cacheKey);
  }

  const rulesPath = config?.review?.rulesPath;
  if (!rulesPath) {
    return null;
  }

  try {
    const content = await fs.readFile(rulesPath, "utf8");
    const rules = JSON.parse(content);
    reviewRulesCache.set(cacheKey, rules);
    return rules;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Build the system prompt for document review
 */
function buildReviewSystemPrompt(reviewPrompt, reviewRules, knowledgeContext, document, docType) {
  const sections = [];

  // Add review prompt template
  sections.push(reviewPrompt);

  // Add review rules if available
  if (reviewRules) {
    sections.push(`## Review Rules\n${JSON.stringify(reviewRules, null, 2)}`);
  }

  // Add knowledge context
  if (knowledgeContext) {
    sections.push(`## Best Practices & Guidelines\n${knowledgeContext}`);
  }

  // Add document content
  sections.push(`## Document to Review (${docType})\n\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\``);

  return sections.filter(Boolean).join("\n\n");
}

/**
 * Parse and validate the LLM review response
 */
function parseReviewResponse(response) {
  // Ensure required fields exist with defaults
  const result = {
    overall_score: typeof response.overall_score === "number" ? response.overall_score : 50,
    dimension_scores: {},
    strengths: [],
    feedback: [],
    summary: "",
  };

  // Parse dimension scores
  if (response.dimension_scores && typeof response.dimension_scores === "object") {
    for (const dimension of REVIEW_DIMENSIONS) {
      const score = response.dimension_scores[dimension];
      result.dimension_scores[dimension] = typeof score === "number" ? score : 50;
    }
  } else {
    // Default all dimensions to 50 if not provided
    for (const dimension of REVIEW_DIMENSIONS) {
      result.dimension_scores[dimension] = 50;
    }
  }

  // Parse strengths
  if (Array.isArray(response.strengths)) {
    result.strengths = response.strengths
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim());
  }

  // Parse feedback items
  if (Array.isArray(response.feedback)) {
    result.feedback = response.feedback
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: `fb_${String(index + 1).padStart(3, "0")}`,
        field: typeof item.field === "string" ? item.field : null,
        dimension: REVIEW_DIMENSIONS.includes(item.dimension) ? item.dimension : "completeness",
        severity: Object.values(SEVERITY_LEVELS).includes(item.severity)
          ? item.severity
          : SEVERITY_LEVELS.SUGGESTION,
        issue: typeof item.issue === "string" ? item.issue.trim() : "Issue not specified",
        recommendation: typeof item.recommendation === "string" ? item.recommendation.trim() : "",
        example: typeof item.example === "string" ? item.example.trim() : undefined,
        status: "pending",
      }));
  }

  // Parse summary
  if (typeof response.summary === "string") {
    result.summary = response.summary.trim();
  }

  return result;
}

/**
 * Calculate document hash for caching
 */
function calculateDocumentHash(document) {
  const content = JSON.stringify(document);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `doc_${Math.abs(hash).toString(16)}`;
}

/**
 * Main review function - analyzes a document and returns structured feedback
 *
 * @param {string} docType - Document type (e.g., "charter")
 * @param {object} config - Document type configuration from registry
 * @param {object} document - The document to review
 * @param {object} options - Review options
 * @returns {Promise<object>} Review result with scores and feedback
 */
export async function reviewDocument(docType, config, document, options = {}) {
  const startTime = Date.now();

  // Validate inputs
  if (!docType || typeof docType !== "string") {
    throw new Error("Document type is required");
  }

  if (!document || typeof document !== "object") {
    throw new Error("Document is required");
  }

  if (!config?.review) {
    throw new Error(`Review is not configured for document type: ${docType}`);
  }

  // Load review assets
  const [reviewPrompt, reviewRules] = await Promise.all([
    loadReviewPrompt(docType, config),
    loadReviewRules(docType, config),
  ]);

  // Query knowledge database for relevant entries
  const knowledgeCategories = config.review.knowledgeCategories || [docType];
  const knowledgeEntries = await queryKnowledge({
    categories: knowledgeCategories,
    document,
    docType,
  });
  const knowledgeContext = formatKnowledgeForPrompt(knowledgeEntries);

  // Build system prompt
  const systemPrompt = buildReviewSystemPrompt(
    reviewPrompt,
    reviewRules,
    knowledgeContext,
    document,
    docType
  );

  // Execute LLM review
  const model = options.model || process.env.REVIEW_MODEL || "gpt-4o-mini";
  const response = await executeOpenAIExtraction({
    systemSections: [systemPrompt],
    messages: [{ role: "user", content: "Please review this document and provide detailed feedback." }],
    model,
    temperature: 0.3,
  });

  // Parse and validate response
  const reviewResult = parseReviewResponse(response);

  // Filter by dimensions if specified
  if (options.dimensions && Array.isArray(options.dimensions)) {
    reviewResult.feedback = reviewResult.feedback.filter((item) =>
      options.dimensions.includes(item.dimension)
    );
  }

  // Filter by severity if specified
  if (options.severity && options.severity !== "all") {
    const severityOrder = { critical: 0, important: 1, suggestion: 2 };
    const maxSeverity = severityOrder[options.severity] ?? 2;
    reviewResult.feedback = reviewResult.feedback.filter(
      (item) => severityOrder[item.severity] <= maxSeverity
    );
  }

  // Sort feedback by severity (critical first)
  reviewResult.feedback.sort((a, b) => {
    const severityOrder = { critical: 0, important: 1, suggestion: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Build final result
  return {
    reviewId: `rev_${Date.now().toString(36)}`,
    docType,
    documentHash: calculateDocumentHash(document),
    timestamp: new Date().toISOString(),
    scores: {
      overall: reviewResult.overall_score,
      dimensions: reviewResult.dimension_scores,
    },
    strengths: reviewResult.strengths,
    feedback: reviewResult.feedback,
    summary: reviewResult.summary,
    metadata: {
      modelUsed: model,
      knowledgeEntriesUsed: knowledgeEntries.map((e) => e.id),
      processingTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Get review thresholds for a document type
 */
export function getReviewThresholds(config) {
  return config?.review?.thresholds || {
    completeness: 0.8,
    specificity: 0.7,
    feasibility: 0.75,
    risk_coverage: 0.7,
    scope_clarity: 0.75,
    metric_measurability: 0.7,
  };
}

/**
 * Check if a document passes review thresholds
 */
export function checkReviewThresholds(reviewResult, config) {
  const thresholds = getReviewThresholds(config);
  const failures = [];

  for (const [dimension, threshold] of Object.entries(thresholds)) {
    const score = reviewResult.scores.dimensions[dimension];
    if (typeof score === "number" && score < threshold * 100) {
      failures.push({
        dimension,
        score,
        threshold: threshold * 100,
        gap: threshold * 100 - score,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Clear review caches (for testing)
 */
export function __clearReviewCaches() {
  reviewPromptCache.clear();
  reviewRulesCache.clear();
}
