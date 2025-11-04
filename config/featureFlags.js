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

export default {
  isIntentOnlyExtractionEnabled,
  isCharterConversationPersistenceEnabled,
};
