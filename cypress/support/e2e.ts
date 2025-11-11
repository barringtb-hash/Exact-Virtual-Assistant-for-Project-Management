// cypress/support/e2e.ts
import "./commands-core";
import "./commands-voice";

// Ensure global flag overrides exist early for app code that reads __FLAG_OVERRIDES__
Cypress.on("window:before:load", (win) => {
  if (typeof win.__FLAG_OVERRIDES__ !== "object" || win.__FLAG_OVERRIDES__ === null) {
    (win as any).__FLAG_OVERRIDES__ = {};
  }

  // Enable guided backend so the app makes API calls that our intercepts can capture
  // Note: We do NOT set VITE_CYPRESS_SAFE_MODE because it disables REMOTE_GUIDED_BACKEND_ENABLED
  // which would prevent the app from making API calls (defeating our intercept stubs).
  // Our intercepts handle all API calls deterministically, so we don't need SAFE_MODE's protection.
  (win as any).__FLAG_OVERRIDES__.VITE_CHARTER_GUIDED_BACKEND = "on";

  // Anti-occlusion style so headers/overlays cannot block taps/clicks
  const styleEl = win.document.createElement("style");
  styleEl.setAttribute("data-cy", "anti-occlusion");
  styleEl.textContent = `
    [data-testid="app-header"] { z-index: 20 !important; pointer-events: none !important; }
    [data-testid="composer-root"] { z-index: 40 !important; }
    [data-testid="loading-overlay"] { pointer-events: none !important; }
    [data-testid="sync-devtools"] { pointer-events: none !important; opacity: 0.3 !important; }
  `;
  win.document.head.appendChild(styleEl);
});

// Always swallow uncaught exceptions so tests assert UI state, not dev stack traces
Cypress.on("uncaught:exception", () => false);
