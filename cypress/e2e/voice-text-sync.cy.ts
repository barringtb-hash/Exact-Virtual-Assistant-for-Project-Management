describe("Voice and text synchronization", () => {
  const MESSAGE = "Sync preview after text submit";

  beforeEach(() => {
    cy.waitForAppReady();
    cy.restoreGUM();
  });

  afterEach(() => {
    cy.restoreGUM();
  });

  it("resumes the mic after submitting text and updates the preview", () => {
    cy.getByTestId("sync-devtools", { timeout: 20000 })
      .should("exist")
      .and("be.visible")
      .invoke("attr", "data-state")
      .should("match", /ready|paused|recording/);

    cy.assertMicPressed(false);

    cy.stubGUMSuccess();

    cy.toggleMic();

    cy.assertMicPressed(true);

    cy.getByTestId("sync-devtools", { timeout: 20000 })
      .invoke("attr", "data-state")
      .should("eq", "recording");

    cy.getByTestId("composer-input", { timeout: 15000 })
      .scrollIntoView({ block: "center" })
      .should("be.visible")
      .focus();

    cy.assertMicPressed(false);

    cy.getByTestId("sync-devtools", { timeout: 20000 })
      .invoke("attr", "data-state")
      .should("eq", "paused");

    cy.submitComposer(MESSAGE);

    cy.getByTestId("sync-devtools", { timeout: 20000 })
      .invoke("attr", "data-state")
      .should("eq", "submitting");

    cy.assertPreviewIncludes(MESSAGE);

    cy.getByTestId("sync-devtools", { timeout: 20000 })
      .invoke("attr", "data-state")
      .should("match", /synced|recording/);

    cy.assertMicPressed(true);

    cy.getByTestId("sync-devtools", { timeout: 20000 })
      .invoke("attr", "data-state")
      .should("eq", "recording");
  });
});
