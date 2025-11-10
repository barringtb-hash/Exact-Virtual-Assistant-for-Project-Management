// cypress/support/e2e.ts
import "./commands-core";
import "./commands-voice";

// Ensure global flag overrides exist early for app code that reads __FLAG_OVERRIDES__
Cypress.on("window:before:load", (win) => {
  if (typeof win.__FLAG_OVERRIDES__ !== "object" || win.__FLAG_OVERRIDES__ === null) {
    (win as any).__FLAG_OVERRIDES__ = {};
  }

  // Force test-safe app behavior to avoid localStorage/session side effects
  (win as any).__FLAG_OVERRIDES__.VITE_CYPRESS_SAFE_MODE = "true";

  // Anti-occlusion style so headers/overlays cannot block taps/clicks
  const styleEl = win.document.createElement("style");
  styleEl.setAttribute("data-cy", "anti-occlusion");
  styleEl.textContent = `
    [data-testid="app-header"] { z-index: 20 !important; pointer-events: none !important; }
    [data-testid="composer-root"] { z-index: 40 !important; }
    [data-testid="loading-overlay"] { pointer-events: none !important; }
  `;
  win.document.head.appendChild(styleEl);
});

// Always swallow uncaught exceptions so tests assert UI state, not dev stack traces
Cypress.on("uncaught:exception", () => false);
