/**
 * Feature flags for the application
 * Enable/disable features for safe rollout and testing
 */

export const FEATURE_MIC_LEVEL = true;

const TRUE_VALUES = new Set(["true", "1", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off", "disabled"]);

type EnvValue = string | boolean | number | undefined | null;

declare global {
  // eslint-disable-next-line no-var
  var __FLAG_OVERRIDES__:
    | Record<string, EnvValue>
    | undefined;
}

function parseBoolean(value: EnvValue, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
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
      return fallback;
    }

    if (TRUE_VALUES.has(normalized)) {
      return true;
    }

    if (FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return fallback;
}

function readBooleanFlag(keys: string | readonly string[], fallback: boolean): boolean {
  const env = (import.meta?.env ?? {}) as Record<string, EnvValue>;
  const keyList = Array.isArray(keys) ? keys : [keys];

  if (typeof globalThis !== "undefined") {
    const overrides = globalThis.__FLAG_OVERRIDES__;
    if (overrides && typeof overrides === "object") {
      for (const key of keyList) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          return parseBoolean(overrides[key], fallback);
        }
      }
    }
  }

  for (const key of keyList) {
    const rawValue = Object.prototype.hasOwnProperty.call(env, key) ? env[key] : undefined;
    if (rawValue !== undefined) {
      return parseBoolean(rawValue, fallback);
    }
  }

  return fallback;
}

export const FLAGS = {
  CHARTER_GUIDED_CHAT_ENABLED: readBooleanFlag("VITE_CHARTER_GUIDED_CHAT_ENABLED", true),
  CHARTER_WIZARD_VISIBLE: readBooleanFlag("VITE_CHARTER_WIZARD_VISIBLE", false),
  AUTO_EXTRACTION_ENABLED: readBooleanFlag(
    ["VITE_AUTO_EXTRACTION_ENABLED", "VITE_AUTO_EXTRACT", "AUTO_EXTRACT"],
    false,
  ),
  CHARTER_GUIDED_BACKEND_ENABLED: readBooleanFlag(
    ["VITE_CHARTER_GUIDED_BACKEND", "CHARTER_GUIDED_BACKEND", "GUIDED_BACKEND"],
    false,
  ),
  CYPRESS_SAFE_MODE: readBooleanFlag("VITE_CYPRESS_SAFE_MODE", false),
  PREVIEW_CONDITIONAL_VISIBILITY: readBooleanFlag("VITE_PREVIEW_CONDITIONAL_VISIBILITY", true),
  READABILITY_V1: readBooleanFlag("VITE_READABILITY_V1", true),
  READABILITY_HIDE_FIELD_TIMESTAMPS: readBooleanFlag("VITE_READABILITY_HIDE_FIELD_TIMESTAMPS", false),
} as const;
