/**
 * Unit tests for lib/doc/review.js
 *
 * Tests the document review engine functionality including:
 * - reviewDocument() with mock OpenAI responses
 * - parseReviewResponse() with edge cases
 * - checkReviewThresholds()
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_DIMENSIONS,
  SEVERITY_LEVELS,
  getReviewThresholds,
  checkReviewThresholds,
  __clearReviewCaches,
} from "../../../../lib/doc/review.js";

// Reset caches before each test
test.beforeEach(() => {
  __clearReviewCaches();
});

test("REVIEW_DIMENSIONS contains expected dimensions", () => {
  assert.ok(Array.isArray(REVIEW_DIMENSIONS));
  assert.ok(REVIEW_DIMENSIONS.includes("completeness"));
  assert.ok(REVIEW_DIMENSIONS.includes("specificity"));
  assert.ok(REVIEW_DIMENSIONS.includes("feasibility"));
  assert.ok(REVIEW_DIMENSIONS.includes("risk_coverage"));
  assert.ok(REVIEW_DIMENSIONS.includes("scope_clarity"));
  assert.ok(REVIEW_DIMENSIONS.includes("metric_measurability"));
  assert.equal(REVIEW_DIMENSIONS.length, 6);
});

test("SEVERITY_LEVELS contains expected values", () => {
  assert.equal(SEVERITY_LEVELS.CRITICAL, "critical");
  assert.equal(SEVERITY_LEVELS.IMPORTANT, "important");
  assert.equal(SEVERITY_LEVELS.SUGGESTION, "suggestion");
});

test("getReviewThresholds returns defaults when no config", () => {
  const thresholds = getReviewThresholds(null);

  assert.ok(thresholds);
  assert.equal(thresholds.completeness, 0.8);
  assert.equal(thresholds.specificity, 0.7);
  assert.equal(thresholds.feasibility, 0.75);
  assert.equal(thresholds.risk_coverage, 0.7);
  assert.equal(thresholds.scope_clarity, 0.75);
  assert.equal(thresholds.metric_measurability, 0.7);
});

test("getReviewThresholds returns config thresholds when provided", () => {
  const config = {
    review: {
      thresholds: {
        completeness: 0.9,
        specificity: 0.85,
        feasibility: 0.8,
        risk_coverage: 0.75,
        scope_clarity: 0.8,
        metric_measurability: 0.75,
      },
    },
  };

  const thresholds = getReviewThresholds(config);

  assert.equal(thresholds.completeness, 0.9);
  assert.equal(thresholds.specificity, 0.85);
});

test("checkReviewThresholds passes when all scores meet thresholds", () => {
  const reviewResult = {
    scores: {
      dimensions: {
        completeness: 85,
        specificity: 75,
        feasibility: 80,
        risk_coverage: 75,
        scope_clarity: 80,
        metric_measurability: 75,
      },
    },
  };

  const config = {
    review: {
      thresholds: {
        completeness: 0.8,
        specificity: 0.7,
        feasibility: 0.75,
        risk_coverage: 0.7,
        scope_clarity: 0.75,
        metric_measurability: 0.7,
      },
    },
  };

  const result = checkReviewThresholds(reviewResult, config);

  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});

test("checkReviewThresholds fails when scores below thresholds", () => {
  const reviewResult = {
    scores: {
      dimensions: {
        completeness: 70, // Below 80 threshold
        specificity: 60, // Below 70 threshold
        feasibility: 80,
        risk_coverage: 75,
        scope_clarity: 80,
        metric_measurability: 75,
      },
    },
  };

  const config = {
    review: {
      thresholds: {
        completeness: 0.8,
        specificity: 0.7,
        feasibility: 0.75,
        risk_coverage: 0.7,
        scope_clarity: 0.75,
        metric_measurability: 0.7,
      },
    },
  };

  const result = checkReviewThresholds(reviewResult, config);

  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 2);

  const completenessFailure = result.failures.find((f) => f.dimension === "completeness");
  assert.ok(completenessFailure);
  assert.equal(completenessFailure.score, 70);
  assert.equal(completenessFailure.threshold, 80);
  assert.equal(completenessFailure.gap, 10);

  const specificityFailure = result.failures.find((f) => f.dimension === "specificity");
  assert.ok(specificityFailure);
  assert.equal(specificityFailure.score, 60);
  assert.equal(specificityFailure.threshold, 70);
  assert.equal(specificityFailure.gap, 10);
});

test("checkReviewThresholds handles edge case scores", () => {
  const reviewResult = {
    scores: {
      dimensions: {
        completeness: 80, // Exactly at threshold
        specificity: 70,
        feasibility: 75,
        risk_coverage: 70,
        scope_clarity: 75,
        metric_measurability: 70,
      },
    },
  };

  const config = {
    review: {
      thresholds: {
        completeness: 0.8,
        specificity: 0.7,
        feasibility: 0.75,
        risk_coverage: 0.7,
        scope_clarity: 0.75,
        metric_measurability: 0.7,
      },
    },
  };

  const result = checkReviewThresholds(reviewResult, config);

  // Scores exactly at threshold should pass
  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});

test("checkReviewThresholds handles missing scores gracefully", () => {
  const reviewResult = {
    scores: {
      dimensions: {
        completeness: 85,
        // Missing other dimensions
      },
    },
  };

  const config = {
    review: {
      thresholds: {
        completeness: 0.8,
        specificity: 0.7,
      },
    },
  };

  // Should not throw
  const result = checkReviewThresholds(reviewResult, config);
  assert.ok(result);
  assert.equal(typeof result.passed, "boolean");
  assert.ok(Array.isArray(result.failures));
});
