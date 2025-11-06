import "./commands";

declare global {
  interface Window {
    __FLAG_OVERRIDES__?: Record<string, unknown>;
  }
}

Cypress.on("window:before:load", (win) => {
  const existingOverrides =
    typeof win.__FLAG_OVERRIDES__ === "object" && win.__FLAG_OVERRIDES__ !== null
      ? win.__FLAG_OVERRIDES__
      : {};
  win.__FLAG_OVERRIDES__ = {
    ...existingOverrides,
    VITE_CYPRESS_SAFE_MODE: true,
  };

  if (!win.navigator.mediaDevices) {
    (win.navigator as unknown as { mediaDevices: MediaDevices }).mediaDevices =
      {} as MediaDevices;
  }

  const mediaDevices = win.navigator.mediaDevices;
  if (mediaDevices) {
    const createStream = () =>
      typeof win.MediaStream === "function"
        ? new win.MediaStream()
        : ({} as MediaStream);

    if (typeof mediaDevices.getUserMedia === "function") {
      cy.stub(mediaDevices, "getUserMedia").callsFake(() =>
        Promise.resolve(createStream())
      );
    } else {
      const getUserMediaStub = cy
        .stub()
        .callsFake(() => Promise.resolve(createStream()));
      mediaDevices.getUserMedia = getUserMediaStub as unknown as MediaDevices["getUserMedia"];
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
