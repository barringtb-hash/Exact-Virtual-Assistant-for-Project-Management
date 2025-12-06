/**
 * In-memory cache for document analysis results.
 * Analysis results are stored temporarily to allow users to confirm
 * and proceed to extraction without re-analyzing.
 *
 * @module server/documents/analysis/AnalysisCache
 */

import { randomUUID } from "crypto";
import { getAnalysisCacheTTL } from "../../../config/featureFlags.js";

/**
 * @typedef {Object} AnalysisCacheEntry
 * @property {string} analysisId - Unique identifier for the analysis
 * @property {number} timestamp - Unix timestamp when analysis was created
 * @property {number} ttl - Time-to-live in seconds
 * @property {Array} attachments - Original attachment data
 * @property {Object} rawContent - Extracted raw content
 * @property {Object} analysis - Analysis results
 * @property {"pending" | "confirmed" | "expired"} status - Current status
 */

/** @type {Map<string, AnalysisCacheEntry>} */
const cache = new Map();

/** Cleanup interval reference */
let cleanupInterval = null;

/** How often to run cleanup (every 60 seconds) */
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Generate a unique analysis ID
 * @returns {string} Unique analysis identifier
 */
function generateAnalysisId() {
  return `analysis_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Get current TTL in milliseconds
 * @returns {number} TTL in milliseconds
 */
function getTTLMs() {
  return getAnalysisCacheTTL() * 1000;
}

/**
 * Check if an entry is expired
 * @param {AnalysisCacheEntry} entry
 * @returns {boolean}
 */
function isExpired(entry) {
  const now = Date.now();
  const expiresAt = entry.timestamp + entry.ttl * 1000;
  return now >= expiresAt;
}

/**
 * Run periodic cleanup of expired entries
 */
function cleanup() {
  const now = Date.now();
  for (const [id, entry] of cache.entries()) {
    if (isExpired(entry)) {
      cache.delete(id);
    }
  }
}

/**
 * Start the periodic cleanup interval
 */
function startCleanupInterval() {
  if (cleanupInterval !== null) {
    return;
  }
  cleanupInterval = setInterval(() => {
    try {
      cleanup();
    } catch (error) {
      console.error("[AnalysisCache] Cleanup error:", error);
    }
  }, CLEANUP_INTERVAL_MS);

  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }
}

/**
 * Stop the periodic cleanup interval
 */
export function stopCleanupInterval() {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Start cleanup on module load
startCleanupInterval();

/**
 * Store analysis results in the cache
 *
 * @param {Object} params - Analysis data to store
 * @param {Array} params.attachments - Original attachment data
 * @param {Object} params.rawContent - Extracted raw content
 * @param {Object} params.analysis - Analysis results
 * @returns {AnalysisCacheEntry} The stored cache entry
 */
export function storeAnalysis({ attachments, rawContent, analysis }) {
  // Note: Cleanup runs on periodic interval (every 60s), not on every write
  // This avoids O(n) iteration through cache on every insert

  const analysisId = generateAnalysisId();
  const ttl = getAnalysisCacheTTL();
  const timestamp = Date.now();

  const entry = {
    analysisId,
    timestamp,
    ttl,
    attachments: attachments || [],
    rawContent: rawContent || {},
    analysis: analysis || {},
    status: "pending",
  };

  cache.set(analysisId, entry);

  return entry;
}

/**
 * Retrieve analysis from cache by ID
 *
 * @param {string} analysisId - The analysis ID to retrieve
 * @returns {AnalysisCacheEntry | null} The analysis entry or null if not found/expired
 */
export function getAnalysis(analysisId) {
  if (!analysisId || typeof analysisId !== "string") {
    return null;
  }

  const entry = cache.get(analysisId);
  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    cache.delete(analysisId);
    return null;
  }

  return entry;
}

/**
 * Mark analysis as confirmed
 *
 * @param {string} analysisId - The analysis ID to confirm
 * @returns {boolean} True if successfully confirmed
 */
export function confirmAnalysis(analysisId) {
  const entry = getAnalysis(analysisId);
  if (!entry) {
    return false;
  }

  entry.status = "confirmed";
  return true;
}

/**
 * Delete analysis from cache
 *
 * @param {string} analysisId - The analysis ID to delete
 * @returns {boolean} True if successfully deleted
 */
export function deleteAnalysis(analysisId) {
  return cache.delete(analysisId);
}

/**
 * Get cache statistics for monitoring
 *
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  cleanup();
  return {
    size: cache.size,
    ttlSeconds: getAnalysisCacheTTL(),
  };
}

/**
 * Clear all cached analyses (useful for testing)
 */
export function clearCache() {
  cache.clear();
}

export default {
  storeAnalysis,
  getAnalysis,
  confirmAnalysis,
  deleteAnalysis,
  getCacheStats,
  clearCache,
  stopCleanupInterval,
};
