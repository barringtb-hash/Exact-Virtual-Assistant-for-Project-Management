/// <reference types="cypress" />

const START_URL = "**/guided/charter/start*";
const MESSAGE_URL = "**/guided/charter/messages";

describe("guided charter voice title extraction", () => {
  beforeEach(() => {
    cy.intercept({ url: START_URL }).as("charterStartAny");
    cy.intercept("POST", START_URL, (req) => {
      expect(req.body?.correlation_id).to.be.a("string").and.not.be.empty;
      req.reply({
        body: {
          conversationId: "smoke-convo-voice-01",
          prompt: "Let’s build your charter step-by-step.",
          hasVoiceSupport: true,
          slots: [
            { slot_id: "project_name", label: "Project Title", required: true },
          ],
          events: [
            {
              event_id: "evt-greeting",
              type: "assistant_prompt",
              message: "Let’s build your charter step-by-step.",
            },
            {
              event_id: "evt-first-q",
              type: "assistant_prompt",
              message:
                "Project Title (required). What’s the official name of this project?",
            },
            {
              event_id: "evt-slot-init",
              type: "slot_update",
              status: "collecting",
              current_slot_id: "project_name",
              slots: [{ slot_id: "project_name", status: "awaiting_input" }],
            },
          ],
          idempotent: false,
        },
      });
    }).as("charterStart");

    cy.intercept("POST", MESSAGE_URL, (req) => {
      req.reply({ body: { handled: true, idempotent: false, events: [] } });
    }).as("charterMessage");

    cy.waitForAppReady();
    cy.getByTestId("btn-start-charter").should("be.visible");
  });

  it("extracts the project title from a final voice transcript", () => {
    cy.intercept("POST", "**/api/**/extract", (req) => {
      const voiceEvents = req.body?.voice;
      if (Array.isArray(voiceEvents) && voiceEvents.length > 0) {
        req.alias = "voiceExtract";
        const finalEvent = voiceEvents[voiceEvents.length - 1]?.text;
        expect(finalEvent).to.eq("Polaris Launch");
        req.reply({
          body: { ok: true, draft: { project_name: "Polaris Launch" } },
        });
        return;
      }
      req.continue();
    });

    cy.getByTestId("btn-start-charter").click();
    cy.wait("@charterStart", { timeout: 20000 }).then(
      undefined,
      () => cy.wait("@charterStartAny", { timeout: 20000 }),
    );

    cy.get('[data-testid="assistant-message"]').its("length").as("assistantCountBefore");

    cy.window().then((win) => {
      win.__simulateGuidedVoiceFinal?.("Polaris Launch");
    });

    cy.wait("@voiceExtract", { timeout: 20000 });

    cy.get("@assistantCountBefore").then((countBefore) => {
      const before = Number(countBefore);
      cy
        .get('[data-testid="assistant-message"]')
        .should("have.length", before);
    });

    cy
      .getByTestId("preview-field-title")
      .find("input, textarea")
      .should("have.value", "Polaris Launch");
    cy.getByTestId("preview-field-title").within(() => {
      cy.contains("Voice").should("be.visible");
      cy.contains("Pending confirmation").should("be.visible");
    });

    cy.assertMicPressed(false);
  });
});
