import test from "node:test";
import assert from "node:assert/strict";

import {
  getTemplateBuffer,
  preloadAllTemplates,
  clearTemplateCache,
  getCacheStats,
  getCacheMetrics,
  invalidateTemplate,
  initializeTemplateCache,
  getHealthStatus,
  resetTemplateCache,
} from "../server/utils/templatePreloader.js";

// Reset cache before each test
test.beforeEach(() => {
  resetTemplateCache();
});

// ============================================================================
// Cache Stats Tests
// ============================================================================

test("getCacheStats returns initial state", () => {
  const stats = getCacheStats();

  assert.equal(stats.size, 0);
  assert.equal(stats.capacity, 50);
  assert.equal(stats.isPreloaded, false);
  assert.equal(stats.preloadTimestamp, null);
});

test("getCacheMetrics returns hit/miss information", () => {
  const metrics = getCacheMetrics();

  assert.equal(metrics.hits, 0);
  assert.equal(metrics.misses, 0);
  assert.equal(metrics.hitRate, 0);
  assert.ok(metrics.hitRatePercent);
});

// ============================================================================
// Health Status Tests
// ============================================================================

test("getHealthStatus returns healthy status", () => {
  const status = getHealthStatus();

  assert.equal(status.healthy, true);
  assert.equal(status.isPreloaded, false);
  assert.equal(status.cacheSize, 0);
  assert.equal(status.cacheCapacity, 50);
});

// ============================================================================
// Initialize Cache Tests
// ============================================================================

test("initializeTemplateCache in lazy mode does not preload", async () => {
  const result = await initializeTemplateCache({ warmCache: false, silent: true });

  assert.equal(result.mode, "lazy");
  assert.deepEqual(result.successful, []);
  assert.equal(result.duration, 0);
});

test("initializeTemplateCache returns consistent results when called twice", async () => {
  const result1 = await initializeTemplateCache({ warmCache: false, silent: true });
  const result2 = await initializeTemplateCache({ warmCache: false, silent: true });

  // Both calls should return the same mode and structure
  assert.equal(result1.mode, result2.mode);
  assert.equal(result1.mode, "lazy");
});

// ============================================================================
// Clear Cache Tests
// ============================================================================

test("clearTemplateCache resets cache state", async () => {
  // Simulate some cache activity
  const initialStats = getCacheStats();

  clearTemplateCache();

  const stats = getCacheStats();
  assert.equal(stats.size, 0);
  assert.equal(stats.isPreloaded, false);
});

test("resetTemplateCache fully resets all state", () => {
  resetTemplateCache();

  const stats = getCacheStats();
  const metrics = getCacheMetrics();

  assert.equal(stats.size, 0);
  assert.equal(stats.isPreloaded, false);
  assert.equal(metrics.hits, 0);
  assert.equal(metrics.misses, 0);
});

// ============================================================================
// Template Buffer Tests
// ============================================================================

test("getTemplateBuffer throws when template path is missing", async () => {
  const config = { render: {} };

  await assert.rejects(
    async () => getTemplateBuffer("test", config),
    {
      name: "MissingDocAssetError",
    }
  );
});

test("getTemplateBuffer throws when template file not found", async () => {
  const config = {
    render: {
      docxTemplatePath: "/nonexistent/path/template.docx.b64",
    },
  };

  await assert.rejects(
    async () => getTemplateBuffer("test", config),
    (error) => {
      return error.name === "MissingDocAssetError" || error.code === "ENOENT";
    }
  );
});

// ============================================================================
// Preload Tests
// ============================================================================

test("preloadAllTemplates returns results object", async () => {
  const results = await preloadAllTemplates();

  assert.ok(Array.isArray(results.successful));
  assert.ok(Array.isArray(results.failed));
  assert.equal(typeof results.total, "number");
});

test("preloadAllTemplates is idempotent", async () => {
  const results1 = await preloadAllTemplates();
  const results2 = await preloadAllTemplates();

  // Should return same promise/result
  assert.deepEqual(results1, results2);
});

// ============================================================================
// Invalidate Template Tests
// ============================================================================

test("invalidateTemplate does not throw for unknown docType", () => {
  // Should not throw
  assert.doesNotThrow(() => {
    invalidateTemplate("nonexistent-doc-type");
  });
});
