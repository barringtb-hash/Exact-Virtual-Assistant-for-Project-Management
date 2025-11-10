import {
  COMPOSER_SELECTOR_PRIORITIES,
  getHarnessSelector,
} from "../harness/selectors";

declare global {
  namespace Cypress {
    interface Chainable {
      typeIntoComposer(
        text: string
      ): Chainable<JQuery<HTMLInputElement | HTMLTextAreaElement>>;
      getComposerInput(): Chainable<
        JQuery<HTMLInputElement | HTMLTextAreaElement>
      >;
    }
  }
}

Cypress.Commands.add("getComposerInput", () => {
  const selector = getHarnessSelector("composerInputOrTextarea");

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
        `Could not find a composer or guided input. Tried: ${COMPOSER_SELECTOR_PRIORITIES.join(
          ", "
        )}`
      );
    });
});

Cypress.Commands.add("typeIntoComposer", (text: string) => {
  cy.get(getHarnessSelector("composerRoot"), { timeout: 10000 })
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
