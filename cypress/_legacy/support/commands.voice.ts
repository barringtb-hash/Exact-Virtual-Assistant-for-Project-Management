const TEST_ID_SELECTOR = (testId: string) => `[data-testid="${testId}"]`;

declare global {
  namespace Cypress {
    interface Chainable {
      waitForAppReady(): Chainable<void>;
      getByTestId<E extends Node = HTMLElement>(
        testId: string,
        options?: Partial<
          Cypress.Loggable &
            Cypress.Timeoutable &
            Cypress.Withinable &
            Cypress.Shadow
        >
      ): Chainable<JQuery<E>>;
      toggleMic(): Chainable<JQuery<HTMLElement>>;
      submitComposer(message: string): Chainable<void>;
      assertPreviewIncludes(text: string): Chainable<void>;
      assertMicPressed(pressed?: boolean): Chainable<void>;
    }
  }
}

Cypress.Commands.add("waitForAppReady", () => {
  cy.visit("/");

  cy.document().its("readyState").should("eq", "complete");

  cy.get("body", { timeout: 20000 }).should(($body) => {
    if ($body.children().length === 0) {
      Cypress.log({
        name: "app DOM",
        message: $body.html() ?? "<empty body>",
      });

      throw new Error("App body is empty after load");
    }
  });

  cy.getByTestId("app-ready", { timeout: 20000 }).should(($beacon) => {
    if ($beacon.length === 0) {
      const body = Cypress.$("body");
      Cypress.log({
        name: "app DOM",
        message: body.html() ?? "<empty body>",
      });

      throw new Error("App readiness beacon not found");
    }
  });

  cy.getByTestId("app-header", { timeout: 20000 }).should("exist");
  cy.getByTestId("composer-root", { timeout: 20000 }).should("exist");
  cy.getComposerInput().should("exist");
});

Cypress.Commands.add(
  "getByTestId",
  <E extends Node = HTMLElement>(
    testId: string,
    options?: Partial<
      Cypress.Loggable &
        Cypress.Timeoutable &
        Cypress.Withinable &
        Cypress.Shadow
    >
  ) => {
    return cy.get<E>(TEST_ID_SELECTOR(testId), options);
  }
);

Cypress.Commands.add("toggleMic", () => {
  return cy
    .getByTestId<HTMLElement>("mic-button", { timeout: 15000 })
    .scrollIntoView({ block: "center" })
    .should("be.visible")
    .click();
});

Cypress.Commands.add("submitComposer", (message: string) => {
  cy.typeIntoComposer(message);

  cy.getByTestId<HTMLButtonElement>("composer-send", { timeout: 10000 })
    .scrollIntoView({ block: "center" })
    .should("not.be.disabled")
    .click();
});

Cypress.Commands.add("assertPreviewIncludes", (text: string) => {
  cy.getByTestId("preview-panel", { timeout: 20000 })
    .scrollIntoView({ block: "center" })
    .should("contain.text", text);
});

Cypress.Commands.add("assertMicPressed", (pressed = true) => {
  const expected = pressed ? "true" : "false";
  cy.getByTestId("mic-button", { timeout: 15000 })
    .should("have.attr", "aria-pressed", expected)
    .and(($button) => {
      const ariaPressed = $button.attr("aria-pressed");
      if (ariaPressed !== expected) {
        throw new Error(
          `Expected mic aria-pressed to be ${expected}, but received ${ariaPressed}`
        );
      }
    });
});

export {};
