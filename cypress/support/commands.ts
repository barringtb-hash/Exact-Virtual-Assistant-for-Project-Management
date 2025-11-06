declare global {
  namespace Cypress {
    interface Chainable {
      waitForAppReady(): Chainable<void>;
      typeIntoComposer(
        text: string
      ): Chainable<JQuery<HTMLInputElement | HTMLTextAreaElement>>;
      getComposerInput(): Chainable<
        JQuery<HTMLInputElement | HTMLTextAreaElement>
      >;
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

  cy.get('[data-testid="app-ready"]', { timeout: 20000 }).should(
    ($beacon) => {
      if ($beacon.length === 0) {
        const body = Cypress.$("body");
        Cypress.log({
          name: "app DOM",
          message: body.html() ?? "<empty body>",
        });

        throw new Error("App readiness beacon not found");
      }
    }
  );

  cy.get('[data-testid="app-header"]', { timeout: 20000 }).should("exist");
  cy.get('[data-testid="composer-root"]', { timeout: 20000 }).should("exist");
  cy.getComposerInput().should("exist");
});

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

export {};
