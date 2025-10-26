let createDOMPurify = null;
let domPurifyInstance = null;
let importAttempted = false;

const defaultSanitize = (html) =>
  String(html ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

let sanitizeImpl = defaultSanitize;

function tryInitializeDOMPurify() {
  if (domPurifyInstance || !createDOMPurify) {
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

function ensureDOMPurifyImported() {
  if (importAttempted || typeof window === "undefined") {
    return;
  }

  importAttempted = true;

  import("dompurify")
    .then((mod) => {
      createDOMPurify = mod?.default ?? mod;
      tryInitializeDOMPurify();
    })
    .catch(() => {
      createDOMPurify = null;
    });
}

function ensureSanitizerReady() {
  ensureDOMPurifyImported();
  tryInitializeDOMPurify();
}

export function sanitizeHtml(html) {
  ensureSanitizerReady();
  return sanitizeImpl(html);
}

export function setSanitizeImplementation(fn) {
  sanitizeImpl = typeof fn === "function" ? fn : defaultSanitize;
  domPurifyInstance = null;
}

export function resetSanitizeImplementation() {
  sanitizeImpl = defaultSanitize;
  domPurifyInstance = null;
  ensureSanitizerReady();
}
