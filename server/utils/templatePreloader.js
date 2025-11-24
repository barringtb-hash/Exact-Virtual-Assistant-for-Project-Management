import fs from "fs/promises";
import { getDocTypeConfig, getAllDocTypes } from "../../lib/doc/registry.js";
import { MissingDocAssetError } from "../../lib/doc/errors.js";

/**
 * LRU Cache implementation for template buffers
 * Automatically evicts least recently used items when capacity is exceeded
 */
class LRUCache {
  constructor(capacity = 50) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Add to end (most recently used)
    this.cache.set(key, value);
    // Evict oldest if over capacity
    if (this.cache.size > this.capacity) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// Global template cache with LRU eviction
const templateCache = new LRUCache(50);
let preloadPromise = null;
let isPreloaded = false;

/**
 * Load a single template buffer from disk
 * @param {string} docType - The document type
 * @param {string} templatePath - Path to the template file
 * @returns {Promise<Buffer>} The template buffer
 */
async function loadTemplateBuffer(docType, templatePath) {
  try {
    const base64Content = await fs.readFile(templatePath, "utf8");
    return Buffer.from(base64Content.trim(), "base64");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new MissingDocAssetError(docType, "docx template", [templatePath]);
    }
    const assetError = new Error(
      `Failed to load docx template for "${docType}" documents.`
    );
    assetError.name = "DocAssetLoadError";
    assetError.statusCode = 500;
    assetError.docType = docType;
    assetError.assetType = "docx template";
    assetError.cause = error;
    assetError.filePath = templatePath;
    throw assetError;
  }
}

/**
 * Get a template buffer from cache or load it
 * @param {string} docType - The document type
 * @param {object} config - The document type configuration
 * @returns {Promise<Buffer>} The template buffer
 */
export async function getTemplateBuffer(docType, config) {
  const templatePath = config?.render?.docxTemplatePath;
  if (!templatePath) {
    throw new MissingDocAssetError(docType, "docx template");
  }

  // Check cache first
  if (templateCache.has(templatePath)) {
    return await templateCache.get(templatePath);
  }

  // Load and cache
  const promise = loadTemplateBuffer(docType, templatePath);
  templateCache.set(templatePath, promise);
  return promise;
}

/**
 * Preload all available templates
 * @returns {Promise<Object>} Results with successful and failed loads
 */
export async function preloadAllTemplates() {
  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    const results = {
      successful: [],
      failed: [],
      total: 0,
    };

    try {
      const docTypes = getAllDocTypes();
      results.total = docTypes.length;

      const loadPromises = docTypes.map(async (docType) => {
        try {
          const config = getDocTypeConfig(docType);
          const templatePath = config?.render?.docxTemplatePath;

          if (!templatePath) {
            results.failed.push({
              docType,
              reason: "No template path configured",
            });
            return;
          }

          await getTemplateBuffer(docType, config);
          results.successful.push(docType);
        } catch (error) {
          results.failed.push({
            docType,
            error: error.message,
            path: error.filePath,
          });
        }
      });

      await Promise.allSettled(loadPromises);
      isPreloaded = true;

      console.log(
        `[TemplatePreloader] Preloaded ${results.successful.length}/${results.total} templates`
      );
      if (results.failed.length > 0) {
        console.warn(
          `[TemplatePreloader] Failed to load ${results.failed.length} templates:`,
          results.failed
        );
      }
    } catch (error) {
      console.error("[TemplatePreloader] Preload failed:", error);
    }

    return results;
  })();

  return preloadPromise;
}

/**
 * Clear the template cache
 * Useful for development or when templates are updated
 */
export function clearTemplateCache() {
  templateCache.clear();
  preloadPromise = null;
  isPreloaded = false;
  console.log("[TemplatePreloader] Cache cleared");
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
  return {
    size: templateCache.size,
    capacity: templateCache.capacity,
    isPreloaded,
  };
}

/**
 * Invalidate a specific template from the cache
 * @param {string} docType - The document type to invalidate
 */
export function invalidateTemplate(docType) {
  const config = getDocTypeConfig(docType);
  const templatePath = config?.render?.docxTemplatePath;

  if (templatePath && templateCache.has(templatePath)) {
    templateCache.cache.delete(templatePath);
    console.log(`[TemplatePreloader] Invalidated template for ${docType}`);
  }
}

// Export the cache for backward compatibility if needed
export { templateCache };
