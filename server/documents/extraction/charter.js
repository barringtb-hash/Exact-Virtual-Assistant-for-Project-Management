import fs from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import esbuild from "esbuild";

const __filename =
  typeof document === "undefined" ? fileURLToPath(import.meta.url) : "";
const __dirname = typeof document === "undefined" ? path.dirname(__filename) : "";

// Cache the compiled module to avoid repeated transforms
let charterExtractionModule = null;

/**
 * Dynamically compiles and loads the TS module that provides:
 *   - extractFieldsFromUtterance
 *   - extractFieldsFromUtterances
 */
export async function loadCharterExtraction() {
  if (charterExtractionModule) return charterExtractionModule;

  const tsPath = path.resolve(
    __dirname,
    "../../charter/extractFieldsFromUtterance.ts",
  );
  let tsSource;
  try {
    tsSource = await fs.readFile(tsPath, "utf8");
  } catch (err) {
    // Surface a clear message rather than a generic 500
    throw new Error(`Charter extraction source not found at ${tsPath}`);
  }

  // Transform TypeScript -> ESM JavaScript
  const { code } = await esbuild.transform(tsSource, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });

  // Load the generated ESM via data URI
  const dataUri =
    "data:text/javascript;base64;" + Buffer.from(code).toString("base64");
  const module = await import(dataUri);

  // Basic shape assertion (optional but helpful)
  if (typeof module.extractFieldsFromUtterance !== "function") {
    throw new Error("extractFieldsFromUtterance export missing after transform");
  }
  if (typeof module.extractFieldsFromUtterances !== "function") {
    throw new Error("extractFieldsFromUtterances export missing after transform");
  }

  charterExtractionModule = module;
  return module;
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
