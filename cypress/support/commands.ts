declare global {
  namespace Cypress {
    interface Chainable {
      ensureAppReady(): Chainable<void>;
      typeIntoComposer(text: string): Chainable<JQuery<HTMLTextAreaElement>>;
    }
  }
}

Cypress.Commands.add("ensureAppReady", () => {
  cy.document().its("readyState", { timeout: 20000 }).should("eq", "complete");
  cy.get("body", { timeout: 20000 }).should("not.be.empty");
  cy.document({ timeout: 20000 }).should((doc) => {
    const marker = doc.querySelector('[data-testid="app-ready"]');
    if (!marker) {
      const html = doc.documentElement?.outerHTML ?? "";
      // eslint-disable-next-line no-console
      console.error("DOM on readiness failure:", html.slice(0, 2000));
      throw new Error("Expected to find readiness marker '[data-testid=\"app-ready\"]'");
    }
  });
  cy.get('[data-testid="app-header"]', { timeout: 20000 }).should("exist");
  cy.get('[data-testid="composer-root"]', { timeout: 20000 }).should("exist");
  cy.get('[data-testid="composer-textarea"]', { timeout: 20000 }).should("exist");
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
