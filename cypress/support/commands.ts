declare global {
  namespace Cypress {
    interface Chainable {
      ensureAppReady(): Chainable<void>;
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
  '[data-testid="composer-textarea"]',
  '[data-testid="composer-input"]',
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

Cypress.Commands.add("ensureAppReady", () => {
  cy.get('[data-testid="app-ready"]', { timeout: 15000 }).should("exist");
  cy.get('[data-testid="app-header"]', { timeout: 15000 }).should("exist");
  cy.get('[data-testid="composer-root"]', { timeout: 15000 }).should("exist");
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
