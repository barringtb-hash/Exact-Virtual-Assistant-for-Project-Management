const TEST_MESSAGE = "Mirror the kickoff plan into the preview";

describe("@golden @voice Voice and text sync", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/chat", (req) => {
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      expect(rawBody).to.contain(TEST_MESSAGE);

      req.reply({
        statusCode: 200,
        body: { reply: "Acknowledged." },
      });
    }).as("chatCompletion");

    cy.intercept("POST", /\/api\/(documents|doc)\/extract/, (req) => {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const lastMessage = messages[messages.length - 1];
      const content =
        typeof lastMessage?.content === "string"
          ? lastMessage.content
          : typeof lastMessage?.text === "string"
          ? lastMessage.text
          : "";

      expect(content).to.contain(TEST_MESSAGE);

      req.reply({
        statusCode: 200,
        body: {
          version: 1,
          updatedAt: Date.now(),
          fields: {
            project_name: TEST_MESSAGE,
            summary: TEST_MESSAGE,
          },
        },
      });
    }).as("previewExtraction");

    cy.intercept("POST", "/api/documents/router", {
      statusCode: 200,
      body: { type: "charter", confidence: 1 },
    }).as("docRouter");

    cy.waitForAppReady({ visit: { url: "/", qs: { e2e: "1" } } });
  });

  it("pauses voice capture while typing and resumes after submission with synced preview", () => {
    cy.toggleMic();
    cy.assertMicPressed(true);
    cy.assertVoicePaused(false);

    cy.getComposerInput().focus().should("be.focused");
    cy.assertMicPressed(false);
    cy.assertVoicePaused(true);

    cy.submitComposer(TEST_MESSAGE);

    cy.wait("@chatCompletion");
    cy.wait("@previewExtraction");

    cy.assertPreviewIncludes(TEST_MESSAGE);
    cy.assertVoicePaused(false);
    cy.assertMicPressed(true);
  });
});

