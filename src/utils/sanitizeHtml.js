let createDOMPurify;
try {
  const mod = await import("dompurify");
  createDOMPurify = mod?.default ?? mod;
} catch (error) {
  createDOMPurify = null;
}

let domPurifyInstance = null;
const defaultSanitize = (html) =>
  String(html ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

let sanitizeImpl = defaultSanitize;
let initialized = false;

function ensureInitialized() {
  if (initialized) {
    return;
  }
  initialized = true;
  if (!createDOMPurify) {
    return;
  }

  const win = typeof window !== "undefined" ? window : undefined;
  if (!win || !win.document) {
    return;
  }

  domPurifyInstance = createDOMPurify(win);
  if (domPurifyInstance && typeof domPurifyInstance.sanitize === "function") {
    sanitizeImpl = (html) =>
      domPurifyInstance.sanitize(String(html ?? ""), {
        USE_PROFILES: { html: true },
      });
  }
}

export function sanitizeHtml(html) {
  ensureInitialized();
  return sanitizeImpl(html);
}

export function setSanitizeImplementation(fn) {
  sanitizeImpl = typeof fn === "function" ? fn : defaultSanitize;
  initialized = true;
}

export function resetSanitizeImplementation() {
  sanitizeImpl = defaultSanitize;
  initialized = false;
}
