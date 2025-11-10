import "./commands-core";
import "./commands-voice";

declare global {
  interface Window {
    __FLAG_OVERRIDES__?: Record<string, unknown>;
  }
}

const FLAG_PREFIX = "VITE_";

Cypress.on("window:before:load", (win) => {
  if (typeof win.__FLAG_OVERRIDES__ !== "object" || win.__FLAG_OVERRIDES__ === null) {
    win.__FLAG_OVERRIDES__ = {};
  }

  const overridesFromEnv = Cypress.env("FLAG_OVERRIDES");
  if (overridesFromEnv && typeof overridesFromEnv === "object") {
    Object.assign(win.__FLAG_OVERRIDES__, overridesFromEnv as Record<string, unknown>);
  }

  const rawEnv = Cypress.env();
  if (rawEnv && typeof rawEnv === "object") {
    for (const [key, value] of Object.entries(rawEnv)) {
      if (typeof key === "string" && key.startsWith(FLAG_PREFIX)) {
        win.__FLAG_OVERRIDES__[key] = value;
      }
    }
  }

  const styleEl = win.document.createElement("style");
  styleEl.setAttribute("data-cy", "anti-occlusion");
  styleEl.innerHTML = `
    /* Keep header below composer in tests */
    [data-testid="app-header"] {
      z-index: 20 !important;
      pointer-events: none !important;
    }
    [data-testid="composer-root"] { z-index: 40 !important; }

    /* If you have any full-screen loading scrims, make them non-blocking in e2e */
    [data-testid="loading-overlay"] { pointer-events: none !important; }
  `;

  win.document.head.appendChild(styleEl);
});

Cypress.on("uncaught:exception", () => false);
