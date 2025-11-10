type WithStubbedUserMediaCallback = (
  stub: sinon.SinonStub<[MediaStreamConstraints?], Promise<MediaStream>>,
) => unknown;

interface WithStubbedUserMediaOptions {
  stream?: MediaStream;
}

interface SimulateFinalTranscriptOptions {
  isFinal?: boolean;
}

declare global {
  namespace Cypress {
    interface Chainable {
      assertMicPressed(expected?: boolean): Chainable<JQuery<HTMLElement>>;
      simulateFinalTranscript(
        text: string,
        options?: SimulateFinalTranscriptOptions,
      ): Chainable<unknown>;
      withStubbedUserMedia(
        callback: WithStubbedUserMediaCallback,
        options?: WithStubbedUserMediaOptions,
      ): Chainable<unknown>;
    }
  }
}

const ensureMediaDevices = (win: Window): MediaDevices => {
  const navigatorWithDevices = win.navigator as Navigator & {
    mediaDevices?: MediaDevices;
  };

  if (!navigatorWithDevices.mediaDevices) {
    navigatorWithDevices.mediaDevices = {} as MediaDevices;
  }

  return navigatorWithDevices.mediaDevices;
};

Cypress.Commands.add("assertMicPressed", (expected = true) => {
  const pressedValue = expected ? "true" : "false";
  return cy
    .get('[data-testid="mic-button"]')
    .should("have.attr", "aria-pressed", pressedValue);
});

Cypress.Commands.add(
  "simulateFinalTranscript",
  (text: string, options: SimulateFinalTranscriptOptions = {}) => {
    return cy.window({ log: false }).then((win) => {
      type VoiceTestHarnessWindow = Window & {
        __simulateGuidedVoiceFinal?: (
          transcript: string,
          opts?: SimulateFinalTranscriptOptions,
        ) => unknown;
      };
      const harness = win as VoiceTestHarnessWindow;
      const simulator = harness.__simulateGuidedVoiceFinal;
      if (typeof simulator !== "function") {
        throw new Error(
          "Voice harness is unavailable. Ensure voice E2E mode is enabled before calling simulateFinalTranscript().",
        );
      }
      return simulator(text, options);
    });
  },
);

Cypress.Commands.add(
  "withStubbedUserMedia",
  (
    callback: WithStubbedUserMediaCallback,
    options: WithStubbedUserMediaOptions = {},
  ) => {
    return cy.window({ log: false }).then((win) => {
      const mediaDevices = ensureMediaDevices(win);
      const existing = mediaDevices.getUserMedia as sinon.SinonStub | undefined;
      if (existing && typeof existing.restore === "function") {
        existing.restore();
      }

      const resolvedStream =
        options.stream ??
        (typeof win.MediaStream === "function"
          ? new win.MediaStream()
          : ({} as MediaStream));

      const stub = Cypress.sinon
        .stub(mediaDevices, "getUserMedia")
        .callsFake(() => Promise.resolve(resolvedStream));

      const cypressWithOff = Cypress as unknown as {
        off?: (action: string, fn: (error: Cypress.CypressError, runnable: Mocha.Runnable) => void) => void;
      };

      const handleFailure = (error: Cypress.CypressError, runnable: Mocha.Runnable) => {
        cypressWithOff.off?.("fail", handleFailure);
        stub.restore();
        throw error;
      };

      Cypress.on("fail", handleFailure);

      return cy
        .wrap(null, { log: false })
        .then(() => callback(stub))
        .then((value) => {
          cypressWithOff.off?.("fail", handleFailure);
          stub.restore();
          return value;
        });
    });
  },
);

export {};
