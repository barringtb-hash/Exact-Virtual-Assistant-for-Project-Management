declare global {
  namespace Cypress {
    interface Chainable {
      ensureAppReady(): Chainable<void>;
      typeIntoComposer(text: string): Chainable<JQuery<HTMLTextAreaElement>>;
    }
  }
}

Cypress.Commands.add("ensureAppReady", () => {
  cy.get('[data-testid="app-ready"]', { timeout: 15000 }).should("exist");
  cy.get('[data-testid="app-header"]', { timeout: 15000 }).should("exist");
  cy.get('[data-testid="composer-root"]', { timeout: 15000 }).should("exist");
  cy.get('[data-testid="composer-textarea"]', { timeout: 15000 }).should("exist");
});

Cypress.Commands.add("typeIntoComposer", (text: string) => {
  cy.get('[data-testid="composer-root"]', { timeout: 10000 })
    .scrollIntoView({ block: "center" })
    .should("be.visible");

  return cy
    .get<HTMLTextAreaElement>('[data-testid="composer-textarea"]', { timeout: 10000 })
    .scrollIntoView({ block: "center" })
    .should("be.visible")
    .click({ scrollBehavior: "center" })
    .type(text, { delay: 0 })
    .should("have.value", text);
});

export {};
