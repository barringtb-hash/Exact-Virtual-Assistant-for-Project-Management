import { S } from "../../harness/selectors";
import { stubCharterMessages, stubCharterStart } from "../../harness/server";

Cypress.env("VITE_CHARTER_GUIDED_BACKEND", "true");

const SLOT_UPDATE_EVENT = {
  type: "slot_update",
  event_id: "evt-slot-confirm",
  status: "in_progress",
  current_slot_id: "scope_in",
  slots: [
    {
      slot_id: "project_name",
      status: "confirmed",
      value: "Atlas Expansion Program",
      confirmed_value: "Atlas Expansion Program",
    },
    {
      slot_id: "sponsor",
      status: "confirmed",
      value: "Jamie Rivera",
      confirmed_value: "Jamie Rivera",
    },
    {
      slot_id: "scope_in",
      status: "confirmed",
      value: ["North America rollout"],
      confirmed_value: ["North America rollout"],
    },
  ],
};

describe("Smoke: charter typed happy path", () => {
  beforeEach(() => {
    stubCharterStart({
      alias: "charterStart",
      body: {
        conversationId: "smoke-charter-typed",
        prompt: "Thanks for starting the charter session.",
        hasVoiceSupport: false,
      },
    });

    stubCharterMessages({
      alias: "charterMessage",
      body: {
        handled: true,
        events: [SLOT_UPDATE_EVENT],
      },
    });

    cy.intercept("POST", "/api/documents/extract", {
      statusCode: 200,
      body: { ok: true, draft: { fields: {} } },
    });

    cy.visit("/");
  });

  it("merges guided updates into the preview after a typed turn", () => {
    cy.waitForAppReady();

    cy.get(S.charterStartButton).should("be.enabled").click();
    cy.wait("@charterStart").its("response.statusCode").should("eq", 200);

    const userMessage = "Here is the latest charter context.";
    cy.typeIntoComposer(userMessage);
    cy.submitComposer();
    cy.wait("@charterMessage").its("response.statusCode").should("eq", 200);

    cy.get(S.previewPendingOverlay).should("not.exist");

    cy.getByTestId("preview-field-title")
      .find("input")
      .should("have.value", "Atlas Expansion Program");
    cy.getByTestId("preview-field-sponsor")
      .find("input")
      .should("have.value", "Jamie Rivera");
    cy.getByTestId("preview-field-scope")
      .find("textarea")
      .first()
      .should("have.value", "North America rollout");

    cy.get(`${S.composerInput}, ${S.composerTextareaLegacy}`)
      .filter(":visible")
      .should("have.value", "");
  });
});
