// cypress/support/commands-voice.ts
declare global {
  namespace Cypress {
    interface Chainable {
      assertMicPressed(pressed?: boolean): Chainable<void>;
      simulateFinalTranscript(text: string): Chainable<void>;
      withStubbedUserMedia(stream?: MediaStream): Chainable<void>;
    }
  }
}

const T = (id: string) => `[data-testid="${id}"]`;

Cypress.Commands.add("assertMicPressed", (pressed = true) => {
  const expected = pressed ? "true" : "false";
  cy.get(T("mic-button"), { timeout: 15000 })
    .should("have.attr", "aria-pressed", expected);
});

Cypress.Commands.add("simulateFinalTranscript", (text: string) => {
  cy.window().then(async (win) => {
    const api = (win as unknown as { __simulateGuidedVoiceFinal?: (t: string, o?: { isFinal?: boolean }) => Promise<void> });
    expect(api.__simulateGuidedVoiceFinal, "voice helper").to.be.a("function");
    await api.__simulateGuidedVoiceFinal?.(text);
  });
});

Cypress.Commands.add("withStubbedUserMedia", (stream?: MediaStream) => {
  return cy.window({ log: false }).then((win) => {
    const nav = win.navigator as Navigator & { mediaDevices?: MediaDevices & { getUserMedia?: any } };
    if (!nav.mediaDevices) nav.mediaDevices = {} as any;
    if (nav.mediaDevices.getUserMedia?.restore) nav.mediaDevices.getUserMedia.restore();
    const fake = stream ?? (typeof win.MediaStream === "function" ? new win.MediaStream() : ({} as MediaStream));
    cy.wrap(Cypress.sinon.stub(nav.mediaDevices, "getUserMedia").callsFake(() => Promise.resolve(fake)), { log: false });
  });
});

export {};
