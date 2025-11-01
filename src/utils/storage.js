const STORAGE_KEY = "eva-doc-context";

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
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
}

export function mergeStoredSession(partial) {
  if (typeof window === "undefined") {
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
