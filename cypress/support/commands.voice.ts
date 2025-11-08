const TEST_ID_SELECTOR = (testId: string) => `[data-testid="${testId}"]`;

const TRUTHY_PATTERN = /^(1|true|on|yes)$/i;
const FALSY_PATTERN = /^(0|false|off|no)$/i;

interface VisitFlags {
  GUIDED_BACKEND_ON: boolean;
  CHARTER_GUIDED_BACKEND_ENABLED: boolean;
  GUIDED_CHAT_ENABLED: boolean;
  WIZARD_VISIBLE: boolean;
  AUTO_EXTRACTION_ENABLED: boolean;
  CYPRESS_SAFE_MODE: boolean;
}

type VisitFlagOverrides = Partial<
  Record<keyof VisitFlags, boolean | string | number | undefined | null>
>;

const VISIT_FALLBACKS: VisitFlags = {
  GUIDED_BACKEND_ON: true,
  CHARTER_GUIDED_BACKEND_ENABLED: true,
  GUIDED_CHAT_ENABLED: true,
  WIZARD_VISIBLE: true,
  AUTO_EXTRACTION_ENABLED: true,
  CYPRESS_SAFE_MODE: false,
};

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (TRUTHY_PATTERN.test(normalized)) {
      return true;
    }

    if (FALSY_PATTERN.test(normalized)) {
      return false;
    }
  }

  return undefined;
};

const resolveVisitFlags = (overrides: VisitFlagOverrides = {}): VisitFlags => {
  const envGuided = coerceBoolean(Cypress.env("GUIDED_BACKEND_ON"));
  const overrideGuided = coerceBoolean(overrides.GUIDED_BACKEND_ON);
  const guided = overrideGuided ?? envGuided ?? VISIT_FALLBACKS.GUIDED_BACKEND_ON;

  const charterGuidedOverride = coerceBoolean(
    overrides.CHARTER_GUIDED_BACKEND_ENABLED,
  );

  const envChat = coerceBoolean(Cypress.env("GUIDED_CHAT_ENABLED"));
  const chatOverride = coerceBoolean(overrides.GUIDED_CHAT_ENABLED);

  const envWizard = coerceBoolean(Cypress.env("WIZARD_VISIBLE"));
  const wizardOverride = coerceBoolean(overrides.WIZARD_VISIBLE);

  const envAuto = coerceBoolean(Cypress.env("AUTO_EXTRACTION_ENABLED"));
  const autoOverride = coerceBoolean(overrides.AUTO_EXTRACTION_ENABLED);

  const envSafe = coerceBoolean(Cypress.env("CYPRESS_SAFE_MODE"));
  const safeOverride = coerceBoolean(overrides.CYPRESS_SAFE_MODE);

  return {
    GUIDED_BACKEND_ON: guided,
    CHARTER_GUIDED_BACKEND_ENABLED:
      charterGuidedOverride ?? guided ?? VISIT_FALLBACKS.GUIDED_BACKEND_ON,
    GUIDED_CHAT_ENABLED:
      chatOverride ?? envChat ?? VISIT_FALLBACKS.GUIDED_CHAT_ENABLED,
    WIZARD_VISIBLE:
      wizardOverride ?? envWizard ?? VISIT_FALLBACKS.WIZARD_VISIBLE,
    AUTO_EXTRACTION_ENABLED:
      autoOverride ?? envAuto ?? VISIT_FALLBACKS.AUTO_EXTRACTION_ENABLED,
    CYPRESS_SAFE_MODE:
      safeOverride ?? envSafe ?? VISIT_FALLBACKS.CYPRESS_SAFE_MODE,
  };
};

const setOverride = (
  overrides: Record<string, string>,
  key: string,
  value: boolean,
) => {
  overrides[key] = value ? "true" : "false";
};

declare global {
  namespace Cypress {
    interface Chainable {
      visitWithFlags(
        path?: string,
        flags?: VisitFlagOverrides,
      ): Chainable<Cypress.AUTWindow>;
      waitForAppReady(flags?: VisitFlagOverrides): Chainable<void>;
      getByTestId<E extends Node = HTMLElement>(
        testId: string,
        options?: Partial<
          Cypress.Loggable &
            Cypress.Timeoutable &
            Cypress.Withinable &
            Cypress.Shadow
        >,
      ): Chainable<JQuery<E>>;
      toggleMic(): Chainable<JQuery<HTMLElement>>;
      submitComposer(message: string): Chainable<void>;
      assertPreviewIncludes(text: string): Chainable<void>;
      assertMicPressed(pressed?: boolean): Chainable<void>;
    }
  }
}


Cypress.Commands.add(
  "visitWithFlags",
  (path: string = "/", overrides?: VisitFlagOverrides) => {
    const flags = resolveVisitFlags(overrides);

    return cy.visit(path, {
      onBeforeLoad(win) {
        const normalized: VisitFlags & { SAFE_MODE: boolean } = {
          ...flags,
          SAFE_MODE: flags.CYPRESS_SAFE_MODE,
        };

        (win as Window & {
          __E2E_FLAGS__?: Partial<VisitFlags> & { SAFE_MODE?: boolean };
        }).__E2E_FLAGS__ = normalized;

        const bag = (() => {
          if (
            typeof win.__FLAG_OVERRIDES__ !== "object" ||
            win.__FLAG_OVERRIDES__ === null
          ) {
            win.__FLAG_OVERRIDES__ = {};
          }

          return win.__FLAG_OVERRIDES__ as Record<string, string>;
        })();

        setOverride(bag, "VITE_CHARTER_GUIDED_BACKEND", flags.GUIDED_BACKEND_ON);
        setOverride(bag, "CHARTER_GUIDED_BACKEND", flags.GUIDED_BACKEND_ON);
        setOverride(bag, "GUIDED_BACKEND", flags.GUIDED_BACKEND_ON);

        const guidedString = flags.GUIDED_BACKEND_ON ? "true" : "false";
        try {
          win.localStorage.setItem("guidedBackend", guidedString);
        } catch {
          // ignore storage write failures
        }

        setOverride(
          bag,
          "CHARTER_GUIDED_BACKEND_ENABLED",
          flags.CHARTER_GUIDED_BACKEND_ENABLED,
        );
        setOverride(
          bag,
          "VITE_CHARTER_GUIDED_CHAT_ENABLED",
          flags.GUIDED_CHAT_ENABLED,
        );
        setOverride(
          bag,
          "VITE_CHARTER_WIZARD_VISIBLE",
          flags.WIZARD_VISIBLE,
        );
        setOverride(
          bag,
          "VITE_AUTO_EXTRACTION_ENABLED",
          flags.AUTO_EXTRACTION_ENABLED,
        );
        setOverride(bag, "VITE_AUTO_EXTRACT", flags.AUTO_EXTRACTION_ENABLED);
        setOverride(bag, "AUTO_EXTRACT", flags.AUTO_EXTRACTION_ENABLED);
        setOverride(
          bag,
          "VITE_CYPRESS_SAFE_MODE",
          flags.CYPRESS_SAFE_MODE,
        );
        setOverride(bag, "VITE_SAFE_MODE", flags.CYPRESS_SAFE_MODE);
      },
    });
  },
);

Cypress.Commands.add("waitForAppReady", (flags?: VisitFlagOverrides) => {
  cy.visitWithFlags("/", flags);

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
