import { S } from "../../harness/selectors";
import { stubCharterStart, stubCharterMessages } from "../../harness/server";

describe("Charter – typed happy path", () => {
  beforeEach(() => {
    stubCharterStart();
    stubCharterMessages();
    cy.intercept("POST", "**/api/chat", { body: { reply: "stubbed llm response" } }).as("llmRequest");
    cy.waitForAppReady();
  });

  it("flows title → sponsor with preview updates", () => {
    cy.getByTestId(S.startCharter).should("be.visible").click();
    cy.wait("@charterStart");
    cy.contains(`[data-testid="${S.assistantMessage}"]`, "Project Title (required)").should("be.visible");

    // Wait for preview panel to render with charter template
    cy.getByTestId("preview-panel", { timeout: 5000 }).should("be.visible");

    cy.submitComposer("North Star Initiative");
    cy.wait("@charterMessage");
    cy.contains(`[data-testid="${S.assistantMessage}"]`, "Saved Project Title.").should("be.visible");
    // Wait for preview field to exist and be populated from guided state
    cy.getByTestId(S.previewTitle, { timeout: 10000 })
      .should("exist")
      .should("have.value", "North Star Initiative");

    cy.submitComposer("Jordan Example");
    cy.wait("@charterMessage");
    cy.contains(`[data-testid="${S.assistantMessage}"]`, "Saved Sponsor.").should("be.visible");
    cy.getByTestId(S.previewSponsor).should("have.value", "Jordan Example");
  });
});
