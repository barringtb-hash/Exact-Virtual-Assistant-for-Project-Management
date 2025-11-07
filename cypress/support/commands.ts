declare global {
  namespace Cypress {
    interface Chainable {
      typeIntoComposer(
        text: string
      ): Chainable<JQuery<HTMLInputElement | HTMLTextAreaElement>>;
      getComposerInput(): Chainable<
        JQuery<HTMLInputElement | HTMLTextAreaElement>
      >;
      restoreGUM(): Chainable<void>;
      stubGUMSuccess(stream?: MediaStream): Chainable<sinon.SinonStub>;
      stubGUMReject(
        errorName: "NotAllowedError" | "NotFoundError"
      ): Chainable<sinon.SinonStub>;
    }
  }
}

const COMPOSER_SELECTOR_PRIORITIES = [
  '[data-testid="composer-input"]',
  '[data-testid="composer-textarea"]',
  '[data-testid="charter-wizard-input"]',
  '[data-testid="guided-input"]',
  '[data-testid="charter-guided-input"]',
];

Cypress.Commands.add("getComposerInput", () => {
  const selector = COMPOSER_SELECTOR_PRIORITIES.join(", ");

  return cy
    .get<HTMLTextAreaElement | HTMLInputElement>(selector, { timeout: 15000 })
    .then(($elements) => {
      for (const candidate of COMPOSER_SELECTOR_PRIORITIES) {
        const match = $elements.filter(candidate);
        if (match.length) {
          const firstMatch = match.first() as JQuery<
            HTMLInputElement | HTMLTextAreaElement
          >;
          return cy.wrap(firstMatch);
        }
      }

      throw new Error(
        `Could not find a composer or guided input. Tried: ${COMPOSER_SELECTOR_PRIORITIES.join(", ")}`
      );
    });
});

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

const ensureMediaDevices = (win: Window) => {
  const navigatorWithDevices = win.navigator as Navigator & {
    mediaDevices?: MediaDevices;
  };

  if (!navigatorWithDevices.mediaDevices) {
    navigatorWithDevices.mediaDevices = {} as MediaDevices;
  }

  return navigatorWithDevices.mediaDevices;
};

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

Cypress.Commands.add("typeIntoComposer", (text: string) => {
  cy.get('[data-testid="composer-root"]', { timeout: 10000 })
    .scrollIntoView({ block: "center" })
    .should("be.visible");

  return cy
    .getComposerInput()
    .scrollIntoView({ block: "center" })
    .should("be.visible")
    .click({ scrollBehavior: "center" })
    .type(text, { delay: 0 })
    .should("have.value", text);
});

Cypress.Commands.add("waitForAppReady", () => {
  cy.ensureAppReady();
});

Cypress.Commands.add("toggleMic", () => {
  cy.get('button[title*="Voice"]', { timeout: 10000 })
    .should("be.visible")
    .click();
});

Cypress.Commands.add("submitComposer", () => {
  cy.get('[data-testid="composer-send"]', { timeout: 10000 })
    .should("be.visible")
    .should("not.be.disabled")
    .click();
});

export {};
