/// <reference types="cypress" />

describe("Voice and text preview synchronization", () => {
  afterEach(() => {
    cy.restoreGUM();
  });

  it("resumes the microphone after composer submission and syncs the preview", () => {
    const composerText = "Coordinate voice preview sync";

    cy.intercept("POST", "/api/chat", (req) => {
      req.reply({
        body: {
          reply: "Assistant acknowledged manual sync.",
        },
      });
    }).as("chatRequest");

    cy.intercept("POST", /\/api\/(documents|doc)\/extract/, (req) => {
      req.reply({
        body: {
          ok: true,
          draft: {
            project_name: composerText,
          },
          locks: {},
          metadata: {},
          payload: req.body,
        },
      });
    }).as("extractRequest");

    cy.waitForAppReady();
    cy.stubGUMSuccess();

    cy.get('[data-testid="sync-devtools"]').should("be.visible");

    cy.get('[data-testid="mic-button"]').as("micButton");
    cy.get("@micButton").should("have.attr", "aria-pressed", "false");

    cy.get("@micButton").click();
    cy.get("@micButton").should("have.attr", "aria-pressed", "true");

    cy.get("@micButton").click();
    cy.get("@micButton").should("have.attr", "aria-pressed", "false");

    cy.get('[data-testid="composer-input"]').as("composerInput").focus();

    cy.get("@composerInput").type(`${composerText}{enter}`);

    cy.wait("@chatRequest");
    cy.wait("@extractRequest");

    cy.window().then((win) => {
      type VoiceTestBridge = {
        isActive: boolean;
        onStateChange?: (callback: (active: boolean) => void) => () => void;
      };

      const typedWin = win as Window & {
        __voiceTest?: VoiceTestBridge;
        __micActive?: boolean;
      };

      if (typedWin.__voiceTest && typeof typedWin.__voiceTest.onStateChange === "function") {
        return new Cypress.Promise<void>((resolve) => {
          const unsubscribe = typedWin.__voiceTest?.onStateChange?.((active: boolean) => {
            if (active) {
              if (typeof unsubscribe === "function") {
                unsubscribe();
              }
              resolve();
            }
          });
        });
      }

      if (typedWin.__micActive === true) {
        return;
      }

      return new Cypress.Promise<void>((resolve) => {
        const handler: EventListener = (event) => {
          const custom = event as CustomEvent<{ isMicActive?: boolean; source?: string }>;
          if (custom.detail?.isMicActive && custom.detail?.source === "composer_submit") {
            win.removeEventListener("voice:state-change", handler);
            resolve();
          }
        };

        win.addEventListener("voice:state-change", handler);
      });
    });

    cy.get('[data-testid="preview-panel"]').should("contain.text", composerText);

    cy.get("@micButton", { timeout: 20000 }).should("have.attr", "aria-pressed", "true");
  });
});
