import "./commands";

Cypress.on("window:before:load", (win) => {
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
