const STORAGE_KEY = "eva-doc-context";

const TRUE_VALUES = new Set(["true", "1", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off", "disabled"]);

function parseBoolean(value) {
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
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return null;
}

function isSafeModeEnabled() {
  if (typeof globalThis !== "undefined" && globalThis && typeof globalThis === "object") {
    const overrides = globalThis.__FLAG_OVERRIDES__;
    if (overrides && typeof overrides === "object") {
      const override = overrides.VITE_CYPRESS_SAFE_MODE;
      const parsed = parseBoolean(override);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  const raw = import.meta?.env?.VITE_CYPRESS_SAFE_MODE;
  const parsed = parseBoolean(raw);
  return parsed ?? false;
}

function safeParse(raw) {
  if (typeof raw !== "string" || !raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.error("Failed to parse stored session", error);
  }

  return null;
}

export function readStoredSession() {
  if (isSafeModeEnabled() || typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
}

export function mergeStoredSession(partial) {
  if (isSafeModeEnabled() || typeof window === "undefined") {
    return null;
  }

  const current = readStoredSession();
  const base = current && typeof current === "object" ? current : {};
  const next = { ...base, ...partial };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Failed to persist session", error);
  }

  return next;
}

export { STORAGE_KEY as DOC_SESSION_STORAGE_KEY };
