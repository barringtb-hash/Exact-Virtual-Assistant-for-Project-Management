/// <reference types="cypress" />

const START_URL = "**/guided/charter/start*";
const MESSAGE_URL = "**/guided/charter/messages";

describe("guided charter typed happy path", () => {
  const submitComposer = (text: string) => {
    cy.typeIntoComposer(text);
    cy.submitComposer();
  };

  beforeEach(() => {
    cy.intercept({ url: START_URL }).as("charterStartAny");
    cy.intercept("POST", START_URL, (req) => {
      expect(req.body?.correlation_id).to.be.a("string").and.not.be.empty;
      req.reply({
        body: {
          conversationId: "smoke-convo-01",
          prompt: "Let’s build your charter step-by-step.",
          hasVoiceSupport: true,
          slots: [
            { slot_id: "project_name", label: "Project Title", required: true },
            { slot_id: "sponsor", label: "Sponsor", required: true },
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
              slots: [
                { slot_id: "project_name", status: "awaiting_input" },
                { slot_id: "sponsor", status: "pending" },
              ],
            },
          ],
          idempotent: false,
        },
      });
    }).as("charterStart");

    cy.intercept("POST", MESSAGE_URL, (req) => {
      const msg = req.body?.message;
      if (msg === "North Star Initiative") {
        req.reply({
          body: {
            handled: true,
            idempotent: false,
            events: [
              {
                event_id: "evt-title-confirmed",
                type: "assistant_prompt",
                message: "Saved Project Title.",
              },
              {
                event_id: "evt-sponsor-q",
                type: "assistant_prompt",
                message:
                  "Sponsor (required). Who is the sponsor for this project?",
              },
              {
                event_id: "evt-slot-update",
                type: "slot_update",
                status: "collecting",
                current_slot_id: "sponsor",
                slots: [
                  {
                    slot_id: "project_name",
                    status: "confirmed",
                    value: "North Star Initiative",
                    confirmed_value: "North Star Initiative",
                  },
                  { slot_id: "sponsor", status: "awaiting_input" },
                ],
              },
            ],
          },
        });
        return;
      }
      if (msg === "Jordan Example") {
        req.reply({
          body: {
            handled: true,
            idempotent: false,
            events: [
              {
                event_id: "evt-sponsor-confirmed",
                type: "assistant_prompt",
                message: "Saved Sponsor.",
              },
              {
                event_id: "evt-slot-update",
                type: "slot_update",
                status: "collecting",
                current_slot_id: null,
                slots: [
                  {
                    slot_id: "project_name",
                    status: "confirmed",
                    value: "North Star Initiative",
                    confirmed_value: "North Star Initiative",
                  },
                  {
                    slot_id: "sponsor",
                    status: "confirmed",
                    value: "Jordan Example",
                    confirmed_value: "Jordan Example",
                  },
                ],
              },
            ],
          },
        });
        return;
      }
      req.reply({ body: { handled: true, idempotent: false, events: [] } });
    }).as("charterMessage");

    cy.waitForAppReady();
    cy.getByTestId("btn-start-charter").should("be.visible");
  });

  it("completes the first two guided charter slots with typed input", () => {
    cy.getByTestId("btn-start-charter").click();
    cy.wait("@charterStart", { timeout: 20000 }).then(
      undefined,
      () => cy.wait("@charterStartAny", { timeout: 20000 }),
    );

    submitComposer("North Star Initiative");
    cy.wait("@charterMessage", { timeout: 20000 });

    cy
      .contains('[data-testid="assistant-message"]', "Saved Project Title.")
      .should("be.visible");
    cy
      .contains('[data-testid="assistant-message"]', "Sponsor (required). Who is the sponsor for this project?")
      .should("be.visible");
    cy
      .getByTestId("preview-field-title")
      .find("input, textarea")
      .should("have.value", "North Star Initiative");

    submitComposer("Jordan Example");
    cy.wait("@charterMessage", { timeout: 20000 });

    cy
      .contains('[data-testid="assistant-message"]', "Saved Sponsor.")
      .should("be.visible");
    cy
      .getByTestId("preview-field-sponsor")
      .find("input, textarea")
      .should("have.value", "Jordan Example");
  });
});
