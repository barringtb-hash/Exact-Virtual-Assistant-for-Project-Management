import { resolveVoiceHarnessOptions } from "../harness/voice";

declare global {
  namespace Cypress {
    interface Chainable {
      restoreGUM(): Chainable<void>;
      stubGUMSuccess(stream?: MediaStream): Chainable<sinon.SinonStub>;
      stubGUMReject(
        errorName: "NotAllowedError" | "NotFoundError"
      ): Chainable<sinon.SinonStub>;
    }
  }
}

const ensureMediaDevices = (win: Window) => {
  const navigatorWithDevices = win.navigator as Navigator & {
    mediaDevices?: MediaDevices;
  };

  if (!navigatorWithDevices.mediaDevices) {
    navigatorWithDevices.mediaDevices = {} as MediaDevices;
  }

  return navigatorWithDevices.mediaDevices;
};

Cypress.Commands.add("restoreGUM", () => {
  cy.window({ log: false }).then((win) => {
    const gum = win.navigator?.mediaDevices?.getUserMedia as
      | undefined
      | (((...args: unknown[]) => Promise<MediaStream>) & {
          restore?: () => void;
        });

    if (gum && typeof gum.restore === "function") {
      gum.restore();
    }
  });
});

Cypress.Commands.add("stubGUMSuccess", (stream?: MediaStream) => {
  return cy.window({ log: false }).then((win) => {
    const mediaDevices = ensureMediaDevices(win);
    const existing = mediaDevices.getUserMedia as unknown as {
      restore?: () => void;
    } | undefined;

    if (existing?.restore) {
      existing.restore();
    }

    const resolvedStream = stream
      ? stream
      : typeof win.MediaStream === "function"
      ? new win.MediaStream()
      : ({} as MediaStream);

    const stub = Cypress.sinon
      .stub(mediaDevices, "getUserMedia")
      .callsFake(() => Promise.resolve(resolvedStream));

    return cy.wrap(stub, { log: false });
  });
});

Cypress.Commands.add(
  "stubGUMReject",
  (errorName: "NotAllowedError" | "NotFoundError") => {
    return cy.window({ log: false }).then((win) => {
      const mediaDevices = ensureMediaDevices(win);
      const existing = mediaDevices.getUserMedia as unknown as {
        restore?: () => void;
      } | undefined;

      if (existing?.restore) {
        existing.restore();
      }

      const rejection =
        typeof win.DOMException === "function"
          ? new win.DOMException(errorName, errorName)
          : Object.assign(new Error(errorName), { name: errorName });

      const stub = Cypress.sinon
        .stub(mediaDevices, "getUserMedia")
        .callsFake(() => Promise.reject(rejection));

      return cy.wrap(stub, { log: false });
    });
  }
);

/**
 * Convenience helper that ensures the current Cypress environment is configured
 * with sensible defaults for voice-oriented tests.
 */
export const configureVoiceTestEnvironment = () => {
  const { useMockMedia, useMockSpeechToText } = resolveVoiceHarnessOptions();

  Cypress.env("VOICE_USE_MOCK_MEDIA", `${useMockMedia}`);
  Cypress.env("VOICE_USE_MOCK_STT", `${useMockSpeechToText}`);
};

export {};
