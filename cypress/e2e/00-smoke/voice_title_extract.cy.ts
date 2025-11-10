import { S } from "../../harness/selectors";
import { stubCharterStart, stubVoiceExtract } from "../../harness/server";
import { resolveVoiceHarnessOptions } from "../../harness/voice";

const voiceHarness = resolveVoiceHarnessOptions({
  useMockMedia: true,
  useMockSpeechToText: true,
});

Cypress.env("VOICE_E2E", "true");
Cypress.env("VOICE_USE_MOCK_MEDIA", voiceHarness.useMockMedia);
Cypress.env("VOICE_USE_MOCK_STT", voiceHarness.useMockSpeechToText);
Cypress.env("VITE_CHARTER_GUIDED_BACKEND", "true");

describe("Smoke: voice title extraction", () => {
  const derivedTitle = "Voice Captured Charter";

  beforeEach(() => {
    stubCharterStart({
      alias: "charterStart",
      body: {
        conversationId: "smoke-charter-voice",
        hasVoiceSupport: true,
      },
    });

    stubVoiceExtract({
      alias: "voiceExtract",
      body: {
        draft: {
          fields: {
            project_name: derivedTitle,
          },
        },
      },
    });

    cy.visit("/?e2e=1");
  });

  it("applies voice extraction without introducing extra assistant chatter", () => {
    cy.waitForAppReady();

    cy.get(S.charterStartButton).should("be.enabled").click();
    cy.wait("@charterStart").its("response.statusCode").should("eq", 200);

    cy.get('[data-testid="assistant-message"]').its("length").then((initialCount) => {
      cy.simulateFinalTranscript(`The project title is ${derivedTitle}.`, { isFinal: true });

      cy.wait("@voiceExtract").its("response.statusCode").should("eq", 200);

      cy.getByTestId("preview-field-title")
        .find("input")
        .should("have.value", derivedTitle);

      cy.get('[data-testid="assistant-message"]').should("have.length", initialCount);
    });
  });
});
