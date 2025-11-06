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

    cy.get('[data-testid="composer-input"]').as("composerInput").focus();

    cy.get("@micButton").should("have.attr", "aria-pressed", "false");

    cy.get("@composerInput").type(`${composerText}{enter}`);

    cy.wait("@chatRequest");
    cy.wait("@extractRequest");

    cy.get('[data-testid="preview-panel"]').should("contain.text", composerText);

    cy.get("@micButton").should("have.attr", "aria-pressed", "true");
  });
});
