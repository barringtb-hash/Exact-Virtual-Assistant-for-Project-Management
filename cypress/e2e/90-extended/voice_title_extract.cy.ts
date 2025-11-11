import { S } from "../../harness/selectors";
import { stubCharterStart, stubCharterMessages, stubCharterStream, stubVoiceExtract } from "../../harness/server";

describe("Voice → title extraction", () => {
  beforeEach(() => {
    stubCharterStart();
    stubCharterMessages();
    stubCharterStream();
    stubVoiceExtract("Polaris Launch", { project_name: "Polaris Launch" });
    cy.waitForAppReady();
  });

  it("fills title without extra assistant chatter", () => {
    cy.getByTestId(S.startCharter).click();
    cy.wait("@charterStart");

    cy.get(`[data-testid="${S.assistantMessage}"]`).its("length").as("beforeCount");
    cy.simulateFinalTranscript("Polaris Launch");
    cy.wait("@voiceExtract");

    cy.get("@beforeCount").then((n) => {
      cy.get(`[data-testid="${S.assistantMessage}"]`).should("have.length", Number(n));
    });

    cy.getByTestId(S.previewTitle).should("have.value", "Polaris Launch");
  });
});
