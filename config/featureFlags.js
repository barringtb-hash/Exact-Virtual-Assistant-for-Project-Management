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

// Read from localStorage for test-time overrides (highest priority)
function readLocalStorageFlag(key) {
  if (typeof localStorage === "undefined") {
    return undefined;
  }
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isIntentOnlyExtractionEnabled() {
  const testValue = readLocalStorageFlag("VITE_INTENT_ONLY_EXTRACTION");
  const clientValue = readImportMetaEnvFlag("VITE_INTENT_ONLY_EXTRACTION");
  const serverValue = readProcessEnvFlag("INTENT_ONLY_EXTRACTION");

  const rawValue = testValue !== undefined ? testValue : (clientValue !== undefined ? clientValue : serverValue);
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? true;
}

export function isCharterConversationPersistenceEnabled() {
  const testValue = readLocalStorageFlag("VITE_CHARTER_CONVERSATION_PERSIST");
  const clientValue = readImportMetaEnvFlag("VITE_CHARTER_CONVERSATION_PERSIST");
  const serverValue = readProcessEnvFlag("CHARTER_CONVERSATION_PERSIST");

  const rawValue = testValue !== undefined ? testValue : (clientValue !== undefined ? clientValue : serverValue);
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? false;
}

export function isCharterWizardVisible() {
  const testValue = readLocalStorageFlag("VITE_CHARTER_WIZARD_VISIBLE");
  const clientValue = readImportMetaEnvFlag("VITE_CHARTER_WIZARD_VISIBLE");
  const serverValue = readProcessEnvFlag("CHARTER_WIZARD_VISIBLE");

  const rawValue = testValue !== undefined ? testValue : (clientValue !== undefined ? clientValue : serverValue);
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? false;
}

export function isAutoExtractionEnabled() {
  const testValue = readLocalStorageFlag("VITE_AUTO_EXTRACT");
  const clientValue = readImportMetaEnvFlag("VITE_AUTO_EXTRACT");
  const serverValue = readProcessEnvFlag("AUTO_EXTRACT");

  const rawValue = testValue !== undefined ? testValue : (clientValue !== undefined ? clientValue : serverValue);
  const parsed = parseBooleanFlag(rawValue);

  return parsed ?? false;
}

export default {
  isIntentOnlyExtractionEnabled,
  isCharterConversationPersistenceEnabled,
  isCharterWizardVisible,
  isAutoExtractionEnabled,
};
