// cypress/support/commands-core.ts
declare global {
  namespace Cypress {
    interface Chainable {
      getByTestId<E extends Node = HTMLElement>(
        testId: string,
        options?: Partial<Cypress.Loggable & Cypress.Timeoutable & Cypress.Withinable & Cypress.Shadow>
      ): Chainable<JQuery<E>>;
      waitForAppReady(): Chainable<void>;
      typeIntoComposer(text: string): Chainable<void>;
      submitComposer(text: string): Chainable<void>;
    }
  }
}

const T = (id: string) => `[data-testid="${id}"]`;

Cypress.Commands.add("getByTestId", (id, options) => cy.get(T(id), options));

Cypress.Commands.add("waitForAppReady", () => {
  cy.visit("/");
  cy.document().its("readyState").should("eq", "complete");

  // Beacon + core UI anchor points
  cy.getByTestId("app-ready", { timeout: 20000 }).should("exist");
  cy.getByTestId("app-header", { timeout: 20000 }).should("exist");
  cy.getByTestId("composer-root", { timeout: 20000 }).should("exist");
});

Cypress.Commands.add("typeIntoComposer", (text: string) => {
  // Composer input fallback chain
  const selectors = [
    T("composer-input"),
    T("composer-textarea"),
    T("charter-wizard-input"),
    T("guided-input"),
    T("charter-guided-input"),
  ].join(", ");

  cy.get(selectors, { timeout: 15000 })
    .then(($all) => {
      // Choose first available in priority order
      for (const s of selectors.split(", ")) {
        const found = $all.filter(s);
        if (found.length) return cy.wrap(found.first());
      }
      throw new Error("No composer input found");
    })
    .scrollIntoView({ block: "center" })
    .should("be.visible")
    .click({ scrollBehavior: "center" })
    .type(text, { delay: 0 })
    .should("have.value", text);
});

Cypress.Commands.add("submitComposer", (text: string) => {
  cy.typeIntoComposer(text);
  cy.getByTestId<HTMLButtonElement>("composer-send", { timeout: 10000 })
    .scrollIntoView({ block: "center" })
    .should("not.be.disabled")
    .click();
});

export {};
