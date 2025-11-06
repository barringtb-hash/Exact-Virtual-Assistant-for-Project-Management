/// <reference types="cypress" />

describe("Sync developer panel", () => {
  beforeEach(() => {
    const now = Date.now();
    const chunkIntro = JSON.stringify({ turnId: "agent-turn-e2e" });
    const chunkSecond = JSON.stringify({
      turnId: "agent-turn-e2e",
      seq: 1,
      patch: {
        id: "patch-seq-1",
        version: 2,
        fields: { project_lead: "Cycle Runner" },
        appliedAt: now + 5,
      },
    });
    const chunkFirst = JSON.stringify({
      turnId: "agent-turn-e2e",
      seq: 0,
      patch: {
        id: "patch-seq-0",
        version: 1,
        fields: { project_name: "Synced Charter" },
        appliedAt: now,
      },
    });
    const chunkDone = JSON.stringify({ done: true });

    cy.intercept("POST", "/api/agent/conversation", (req) => {
      const body = [chunkIntro, chunkSecond, chunkFirst, chunkDone].join("\n") + "\n";
      req.reply({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body,
      });
    }).as("agentConversation");

    cy.visit("/");
  });

  it("streams patches, reorders out-of-sequence updates, and exposes metrics", () => {
    cy.get("body").trigger("keydown", { key: "s", ctrlKey: true, altKey: true });
    cy.get('[data-testid="sync-devtools"]').should("be.visible");

    cy.get('[data-testid="sync-devtools-policy-toggle"]').select("mixed");

    cy.get('[data-testid="sync-devtools-run-sync"]').click();
    cy.wait("@agentConversation").its("request.body").should("include", "docVersion");

    cy.get('[data-testid="sync-devtools-pending-turn"]').should("contain", "None");

    cy.get('[data-testid="sync-devtools-recent-patches"]').should((element) => {
      const text = element.text();
      expect(text).to.include("patch-seq-0");
      expect(text).to.include("patch-seq-1");
    });

    cy.get('[data-testid="sync-devtools-draft"]').should((element) => {
      const text = element.text();
      expect(text).to.include("Synced Charter");
      expect(text).to.include("Cycle Runner");
    });

    cy.get('[data-testid="sync-devtools-metrics"]').should((element) => {
      const text = element.text();
      expect(text).to.include("sync.patch_applied");
      expect(text).to.include("sync.turn_completed");
      expect(text).to.include("sync.preview_apply_ms");
    });
  });
});
