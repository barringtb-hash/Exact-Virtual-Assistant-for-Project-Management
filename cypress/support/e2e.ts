import "./commands";
import "./commands.voice";
import "./mocks.voice";

declare global {
  interface Window {
    __FLAG_OVERRIDES__?: Record<string, unknown>;
  }
}

Cypress.on("window:before:load", (win) => {
  if (typeof win.__FLAG_OVERRIDES__ !== "object" || win.__FLAG_OVERRIDES__ === null) {
    win.__FLAG_OVERRIDES__ = {};
  }

  // Bridge Cypress.env() flags into the app's __FLAG_OVERRIDES__
  // This ensures the app sees the same flag values that Cypress was configured with
  win.__FLAG_OVERRIDES__.VITE_CHARTER_GUIDED_CHAT_ENABLED = Cypress.env("GUIDED_CHAT_ENABLED");
  win.__FLAG_OVERRIDES__.VITE_CHARTER_GUIDED_BACKEND = Cypress.env("GUIDED_BACKEND_ON");
  win.__FLAG_OVERRIDES__.VITE_CHARTER_WIZARD_VISIBLE = Cypress.env("WIZARD_VISIBLE");
  win.__FLAG_OVERRIDES__.VITE_AUTO_EXTRACTION_ENABLED = Cypress.env("AUTO_EXTRACTION_ENABLED");
  win.__FLAG_OVERRIDES__.VITE_CYPRESS_SAFE_MODE = Cypress.env("CYPRESS_SAFE_MODE");

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
