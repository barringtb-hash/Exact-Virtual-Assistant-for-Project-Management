import type { SelectorKey } from "../harness/selectors";
import { S, resolveTestIdSelector } from "../harness/selectors";

type GetByTestIdOptions = Partial<
  Cypress.Loggable & Cypress.Timeoutable & Cypress.Withinable & Cypress.Shadow
>;

interface TypeIntoComposerOptions {
  clear?: boolean;
  delay?: number;
}

declare global {
  namespace Cypress {
    interface Chainable {
      getByTestId<K extends SelectorKey>(
        testId: K,
        options?: GetByTestIdOptions,
      ): Chainable<JQuery<HTMLElement>>;
      getByTestId(
        testId: string,
        options?: GetByTestIdOptions,
      ): Chainable<JQuery<HTMLElement>>;
      waitForAppReady(): Chainable<void>;
      typeIntoComposer(
        text: string,
        options?: TypeIntoComposerOptions,
      ): Chainable<JQuery<HTMLInputElement | HTMLTextAreaElement>>;
      submitComposer(): Chainable<JQuery<HTMLButtonElement>>;
    }
  }
}

declare global {
  interface Window {
    __appReady?: boolean;
  }
}

const APP_READY_TIMEOUT = 45_000;
const COMPOSER_READY_TIMEOUT = 15_000;

Cypress.Commands.add(
  "getByTestId",
  { prevSubject: false },
  (testId: SelectorKey | string, options?: GetByTestIdOptions) => {
    const selector = resolveTestIdSelector(testId);
    return cy.get(selector, options);
  },
);

Cypress.Commands.add("waitForAppReady", () => {
  cy.getByTestId("appReady", { timeout: APP_READY_TIMEOUT }).should("exist");

  return cy
    .window({ log: false, timeout: APP_READY_TIMEOUT })
    .should((win) => {
      const appReady = win.__appReady === true;
      const bodyReady = win.document?.body?.dataset?.e2eReady === "1";
      expect(appReady || bodyReady, "application ready state").to.be.true;
    })
    .then(() => undefined);
});

Cypress.Commands.add(
  "typeIntoComposer",
  (text: string, options: TypeIntoComposerOptions = {}) => {
    const { clear = true, delay = 0 } = options;
    const inputSelector = `${S.composerInput}, ${S.composerTextareaLegacy}`;

    cy.get(S.composerRoot, { timeout: COMPOSER_READY_TIMEOUT })
      .scrollIntoView()
      .should("be.visible");

    return cy
      .get<HTMLInputElement | HTMLTextAreaElement>(inputSelector, {
        timeout: COMPOSER_READY_TIMEOUT,
      })
      .filter(":visible")
      .first()
      .then(($input) => {
        const subject = $input as JQuery<HTMLInputElement | HTMLTextAreaElement>;
        let chain = cy.wrap(subject);
        chain = chain.scrollIntoView().should("be.enabled");
        if (clear) {
          chain = chain.clear({ force: true });
        }
        return chain
          .click({ force: true })
          .type(text, { delay, force: true })
          .should("have.value", text);
      });
  },
);

Cypress.Commands.add("submitComposer", () => {
  return cy
    .get<HTMLButtonElement>(S.composerSend, { timeout: COMPOSER_READY_TIMEOUT })
    .should("be.visible")
    .should("not.be.disabled")
    .click({ force: true });
});

export {};
