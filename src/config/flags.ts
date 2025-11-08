/**
 * Feature flags for the application
 * Enable/disable features for safe rollout and testing
 */

export const FEATURE_MIC_LEVEL = true;

const TRUTHY_VALUES = new Set(["true", "1", "yes", "on", "enabled"]);
const FALSY_VALUES = new Set(["false", "0", "no", "off", "disabled"]);

export type FlagEnvValue = string | boolean | number | undefined | null;

export function parseBooleanFlag(
  value: FlagEnvValue,
  fallback = false,
): boolean {
  if (value === true || value === false) {
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

    if (TRUTHY_VALUES.has(normalized)) {
      return true;
    }

    if (FALSY_VALUES.has(normalized)) {
      return false;
    }
  }

  return fallback;
}

const ENV_SOURCE = (import.meta?.env ?? {}) as Record<string, FlagEnvValue>;

function readBooleanFlag(
  keys: string | readonly string[],
  fallback: boolean,
): boolean {
  const keyList = Array.isArray(keys) ? keys : [keys];

  if (typeof globalThis !== "undefined") {
    const overrides = globalThis.__FLAG_OVERRIDES__;
    if (overrides && typeof overrides === "object") {
      for (const key of keyList) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          return parseBooleanFlag(overrides[key], fallback);
        }
      }
    }
  }

  for (const key of keyList) {
    if (Object.prototype.hasOwnProperty.call(ENV_SOURCE, key)) {
      return parseBooleanFlag(ENV_SOURCE[key], fallback);
    }
  }

  return fallback;
}

export interface FlagState {
  CHARTER_GUIDED_CHAT_ENABLED: boolean;
  CHARTER_WIZARD_VISIBLE: boolean;
  AUTO_EXTRACTION_ENABLED: boolean;
  CHARTER_GUIDED_BACKEND_ENABLED: boolean;
  GUIDED_BACKEND_ON: boolean;
  CYPRESS_SAFE_MODE: boolean;
}

const initialGuidedBackend = readBooleanFlag(
  ["VITE_CHARTER_GUIDED_BACKEND", "CHARTER_GUIDED_BACKEND", "GUIDED_BACKEND"],
  false,
);

export const FLAGS: FlagState = {
  CHARTER_GUIDED_CHAT_ENABLED: readBooleanFlag(
    "VITE_CHARTER_GUIDED_CHAT_ENABLED",
    true,
  ),
  CHARTER_WIZARD_VISIBLE: readBooleanFlag(
    "VITE_CHARTER_WIZARD_VISIBLE",
    false,
  ),
  AUTO_EXTRACTION_ENABLED: readBooleanFlag(
    ["VITE_AUTO_EXTRACTION_ENABLED", "VITE_AUTO_EXTRACT", "AUTO_EXTRACT"],
    false,
  ),
  CHARTER_GUIDED_BACKEND_ENABLED: initialGuidedBackend,
  GUIDED_BACKEND_ON: initialGuidedBackend,
  CYPRESS_SAFE_MODE: readBooleanFlag(
    ["VITE_CYPRESS_SAFE_MODE", "VITE_SAFE_MODE"],
    false,
  ),
};

const FLAG_SYNC_KEYS: Array<keyof FlagState> = [
  "CHARTER_GUIDED_CHAT_ENABLED",
  "CHARTER_WIZARD_VISIBLE",
  "AUTO_EXTRACTION_ENABLED",
  "CHARTER_GUIDED_BACKEND_ENABLED",
  "GUIDED_BACKEND_ON",
  "CYPRESS_SAFE_MODE",
];

function updateFlag<K extends keyof FlagState>(
  key: K,
  value: FlagEnvValue,
) {
  const next = parseBooleanFlag(value, FLAGS[key]);
  FLAGS[key] = next;

  if (key === "GUIDED_BACKEND_ON" || key === "CHARTER_GUIDED_BACKEND_ENABLED") {
    FLAGS.GUIDED_BACKEND_ON = next;
    FLAGS.CHARTER_GUIDED_BACKEND_ENABLED = next;
  }
}

function applyRuntimeOverrides(win: Window) {
  try {
    const injected = (win as Window & {
      __E2E_FLAGS__?: Partial<FlagState>;
    }).__E2E_FLAGS__;

    if (injected && typeof injected === "object") {
      for (const key of FLAG_SYNC_KEYS) {
        if (key in injected && injected[key] !== undefined) {
          updateFlag(key, injected[key]);
        }
      }
    }
  } catch {
    // ignore unsafe window access
  }

  try {
    const params = new URLSearchParams(win.location.search);
    const guided = params.get("guidedBackend");
    if (guided != null) {
      updateFlag("GUIDED_BACKEND_ON", guided);
    }
  } catch {
    // ignore URL parsing failures
  }

  try {
    const stored = win.localStorage.getItem("guidedBackend");
    if (stored != null) {
      updateFlag("GUIDED_BACKEND_ON", stored);
    }
  } catch {
    // ignore storage access errors
  }
}

export function initFlagsForRuntimeExposure() {
  if (typeof window === "undefined") {
    return;
  }

  applyRuntimeOverrides(window);

  (window as Window & {
    __APP_FLAGS__?: FlagState;
  }).__APP_FLAGS__ = FLAGS;

  try {
    // eslint-disable-next-line no-console
    console.info("[FLAGS]", JSON.stringify(FLAGS));
  } catch {
    // Best-effort logging only
  }
}

export type { FlagState as FeatureFlagState };
