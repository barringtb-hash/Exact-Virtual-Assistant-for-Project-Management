const FALSE_VALUES = new Set(["false", "0", "off", "no", "disabled"]);
const TRUE_VALUES = new Set(["true", "1", "on", "yes", "enabled"]);

function parseBooleanFlag(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (FALSE_VALUES.has(normalized)) {
      return false;
    }

    if (TRUE_VALUES.has(normalized)) {
      return true;
    }

    return true;
  }

  return Boolean(value);
}

function readImportMetaEnvFlag(key) {
  if (typeof import.meta !== "object" || import.meta === null) {
    return undefined;
  }

  const env = import.meta.env;
  if (!env || typeof env !== "object") {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(env, key)) {
    return env[key];
  }

  return undefined;
}

function readProcessEnvFlag(key) {
  if (typeof process !== "undefined" && process?.env && key in process.env) {
    return process.env[key];
  }
  return undefined;
}

export function isIntentOnlyExtractionEnabled() {
  const clientValue = readImportMetaEnvFlag("VITE_INTENT_ONLY_EXTRACTION");
  const serverValue = readProcessEnvFlag("INTENT_ONLY_EXTRACTION");

  const rawValue = clientValue !== undefined ? clientValue : serverValue;
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? true;
}

export function isCharterConversationPersistenceEnabled() {
  const clientValue = readImportMetaEnvFlag("VITE_CHARTER_CONVERSATION_PERSIST");
  const serverValue = readProcessEnvFlag("CHARTER_CONVERSATION_PERSIST");

  const rawValue = clientValue !== undefined ? clientValue : serverValue;
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? false;
}

export function isCharterWizardVisible() {
  const clientValue = readImportMetaEnvFlag("VITE_CHARTER_WIZARD_VISIBLE");
  const serverValue = readProcessEnvFlag("CHARTER_WIZARD_VISIBLE");

  const rawValue = clientValue !== undefined ? clientValue : serverValue;
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? false;
}

export function isAutoExtractionEnabled() {
  const clientValue = readImportMetaEnvFlag("VITE_AUTO_EXTRACT");
  const serverValue = readProcessEnvFlag("AUTO_EXTRACT");

  const rawValue = clientValue !== undefined ? clientValue : serverValue;
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? false;
}

/**
 * Check if LLM-based document analysis is enabled.
 * When enabled, uploaded documents are analyzed before extraction to determine
 * their type and suggest extraction targets with confidence scores.
 *
 * @returns {boolean} True if document analysis is enabled (default: true)
 */
export function isDocumentAnalysisEnabled() {
  const clientValue = readImportMetaEnvFlag("VITE_DOCUMENT_ANALYSIS_ENABLED");
  const serverValue = readProcessEnvFlag("DOCUMENT_ANALYSIS_ENABLED");

  const rawValue = clientValue !== undefined ? clientValue : serverValue;
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? true;
}

/**
 * Get the TTL for cached analysis results in seconds.
 * @returns {number} Cache TTL in seconds (default: 900 = 15 minutes)
 */
export function getAnalysisCacheTTL() {
  const serverValue = readProcessEnvFlag("ANALYSIS_CACHE_TTL_SECONDS");
  if (serverValue !== undefined) {
    const parsed = parseInt(serverValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 900; // 15 minutes default
}

/**
 * Get the minimum confidence threshold for auto-suggesting document types.
 * @returns {number} Confidence threshold (0-1, default: 0.5)
 */
export function getAnalysisConfidenceThreshold() {
  const serverValue = readProcessEnvFlag("ANALYSIS_CONFIDENCE_THRESHOLD");
  if (serverValue !== undefined) {
    const parsed = parseFloat(serverValue);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.5;
}

/**
 * Get the model to use for document analysis.
 * @returns {string} Model name (default: "gpt-4o")
 */
export function getAnalysisModel() {
  const serverValue = readProcessEnvFlag("ANALYSIS_MODEL");
  if (serverValue && typeof serverValue === "string" && serverValue.trim()) {
    return serverValue.trim();
  }
  return "gpt-4o";
}

/**
 * Get the current extraction mode based on feature flags.
 * @returns {"analysis-driven" | "intent-driven"} The active extraction mode
 */
export function getExtractionMode() {
  if (isDocumentAnalysisEnabled()) {
    return "analysis-driven";
  }
  return "intent-driven";
}

export default {
  isIntentOnlyExtractionEnabled,
  isCharterConversationPersistenceEnabled,
  isCharterWizardVisible,
  isAutoExtractionEnabled,
  isDocumentAnalysisEnabled,
  getAnalysisCacheTTL,
  getAnalysisConfidenceThreshold,
  getAnalysisModel,
  getExtractionMode,
};
