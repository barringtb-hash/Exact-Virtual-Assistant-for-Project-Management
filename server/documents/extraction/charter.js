import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs/promises";

const __filename =
  typeof document === "undefined" ? fileURLToPath(import.meta.url) : "";
const __dirname = typeof document === "undefined" ? path.dirname(__filename) : "";

// Cache the loaded module to avoid repeated imports
let charterExtractionModule = null;

/**
 * Loads the pre-compiled charter extraction module that provides:
 *   - extractFieldsFromUtterance
 *   - extractFieldsFromUtterances
 *
 * This module is pre-compiled during the build process (see build:server script)
 * to eliminate runtime TypeScript compilation overhead.
 */
export async function loadCharterExtraction() {
  if (charterExtractionModule) return charterExtractionModule;

  // Try to load pre-compiled module first (production)
  const compiledPath = path.resolve(
    __dirname,
    "../../../dist/server/server/charter/extractFieldsFromUtterance.js"
  );

  try {
    // Check if compiled module exists
    await fs.access(compiledPath);
    const module = await import(compiledPath);

    // Basic shape assertion
    if (typeof module.extractFieldsFromUtterance !== "function") {
      throw new Error("extractFieldsFromUtterance export missing from compiled module");
    }
    if (typeof module.extractFieldsFromUtterances !== "function") {
      throw new Error("extractFieldsFromUtterances export missing from compiled module");
    }

    charterExtractionModule = module;
    return module;
  } catch (err) {
    // Fallback: try to import TypeScript directly (development mode with tsx/ts-node)
    const tsPath = path.resolve(
      __dirname,
      "../../charter/extractFieldsFromUtterance.ts"
    );

    try {
      // This will only work if running with tsx, ts-node, or similar
      const module = await import(tsPath);

      if (typeof module.extractFieldsFromUtterance !== "function") {
        throw new Error("extractFieldsFromUtterance export missing from TS module");
      }
      if (typeof module.extractFieldsFromUtterances !== "function") {
        throw new Error("extractFieldsFromUtterances export missing from TS module");
      }

      charterExtractionModule = module;
      return module;
    } catch (tsErr) {
      throw new Error(
        `Failed to load charter extraction module. ` +
        `Compiled module not found at ${compiledPath} and TypeScript source at ${tsPath} could not be loaded. ` +
        `Run "npm run build:server" to compile server TypeScript files.`
      );
    }
  }
}

/** Honors test overrides, then dynamic load */
export async function resolveCharterExtraction() {
  const overrides = globalThis?.__charterExtractionOverrides__;
  if (overrides && typeof overrides === "object") {
    const fallbackSingle = async (...args) => {
      const module = await loadCharterExtraction();
      return module.extractFieldsFromUtterance(...args);
    };
    const fallbackBatch = async (...args) => {
      const module = await loadCharterExtraction();
      return module.extractFieldsFromUtterances(...args);
    };
    return {
      extractFieldsFromUtterance:
        typeof overrides.extractFieldsFromUtterance === "function"
          ? overrides.extractFieldsFromUtterance
          : fallbackSingle,
      extractFieldsFromUtterances:
        typeof overrides.extractFieldsFromUtterances === "function"
          ? overrides.extractFieldsFromUtterances
          : fallbackBatch,
    };
  }
  return await loadCharterExtraction();
}
