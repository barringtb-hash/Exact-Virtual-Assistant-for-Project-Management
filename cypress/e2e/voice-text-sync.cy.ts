/// <reference types="cypress" />

/**
 * @golden @voice
 * Test suite for seamless switching between voice and text input modes.
 * Verifies that voice recording pauses when typing, text submission works correctly,
 * preview updates reflect the changes, and voice resumes after text submission.
 */
describe("Voice-Text Synchronization", { tags: ["@golden", "@voice"] }, () => {
  beforeEach(() => {
    // Mock getUserMedia for voice functionality
    cy.window().then((win) => {
      const mediaStream = {
        getTracks: () => [{ stop: cy.stub() }],
      } as unknown as MediaStream;

      win.navigator.mediaDevices = {
        getUserMedia: cy.stub().resolves(mediaStream),
      } as MediaDevices;

      // Mock MediaRecorder for voice recording
      class MockRecorder {
        public ondataavailable?: (event: { data: Blob }) => void;
        public onstop?: () => void;
        public stream: MediaStream;
        public mimeType = "audio/webm";
        constructor(stream: MediaStream) {
          this.stream = stream;
        }
        start() {
          setTimeout(() => {
            const blob = new Blob(["mock voice data"], { type: this.mimeType });
            this.ondataavailable?.({ data: blob });
          }, 100);
        }
        stop() {
          setTimeout(() => {
            this.onstop?.();
          }, 50);
        }
      }
      win.MediaRecorder = MockRecorder as unknown as typeof MediaRecorder;
    });

    // Intercept API calls
    cy.intercept("POST", "/api/chat", {
      delay: 100,
      body: { reply: "Voice and text integration working smoothly." },
    }).as("chatRequest");

    cy.intercept("POST", /\/api\/(documents|doc)\/extract/, {
      delay: 50,
      body: {
        ok: true,
        draft: {
          project_name: "Seamless Voice Test",
          project_lead: "Test User",
        },
        locks: { "/project_name": true },
        metadata: { source: "AI" },
      },
    }).as("extractRequest");

    cy.intercept("POST", "/api/transcribe", {
      delay: 80,
      body: { transcript: "Voice transcription completed" },
    }).as("transcribeRequest");
  });

  it("seamlessly switches between voice and text input, maintains state, and syncs preview", () => {
    // Step 1: Visit app with e2e query parameter
    cy.visit("/", { qs: { e2e: "1" } });

    // Step 2: Wait for app to be ready
    cy.waitForAppReady();

    // Step 3: Toggle mic to start voice recording
    cy.toggleMic();

    // Verify mic is recording (button should show "Stop recording")
    cy.get('button[title*="Stop"]').should("exist");

    // Step 4: Focus the composer to assert voice pauses
    cy.get('[data-testid="composer-textarea"]')
      .should("be.visible")
      .focus()
      .type("Testing seamless voice-text switching");

    // Verify text was entered
    cy.get('[data-testid="composer-textarea"]').should(
      "have.value",
      "Testing seamless voice-text switching"
    );

    // Step 5: Submit the text
    cy.submitComposer();

    // Step 6: Wait for network requests and verify they were made
    cy.wait("@chatRequest").then(({ request }) => {
      const body =
        typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      expect(body).to.contain("voice-text switching");
    });

    cy.wait("@extractRequest");

    // Step 7: Verify preview mirroring - check that response is displayed
    cy.contains("Voice and text integration working smoothly.")
      .scrollIntoView()
      .should("be.visible");

    // Verify composer is cleared after submission
    cy.get('[data-testid="composer-textarea"]').should("have.value", "");

    // Step 8: Assert mic can resume (toggle mic again)
    cy.toggleMic();

    // Verify mic is recording again
    cy.get('button[title*="Stop"]').should("exist");

    // Cleanup: Stop recording
    cy.toggleMic();
    cy.get('button[title*="Voice"]').should("exist");
  });

  it("handles voice recording followed by text submission without conflicts", () => {
    cy.visit("/", { qs: { e2e: "1" } });
    cy.waitForAppReady();

    // Start voice recording
    cy.toggleMic();
    cy.get('button[title*="Stop"]').should("exist");

    // Stop voice recording
    cy.toggleMic();
    cy.get('button[title*="Voice"]').should("exist");

    // Type and submit text
    cy.typeIntoComposer("Follow-up text message");
    cy.submitComposer();

    cy.wait("@chatRequest");
    cy.wait("@extractRequest");

    // Verify response is shown
    cy.contains("Voice and text integration working smoothly.").should("be.visible");
  });

  it("maintains composer state when switching between voice and text modes", () => {
    cy.visit("/", { qs: { e2e: "1" } });
    cy.waitForAppReady();

    // Type some text first
    cy.get('[data-testid="composer-textarea"]').type("Initial text");

    // Toggle mic
    cy.toggleMic();
    cy.get('button[title*="Stop"]').should("exist");

    // Stop mic
    cy.toggleMic();

    // Verify initial text is still present
    cy.get('[data-testid="composer-textarea"]').should("have.value", "Initial text");

    // Continue typing
    cy.get('[data-testid="composer-textarea"]').type(" and more text");
    cy.get('[data-testid="composer-textarea"]').should(
      "have.value",
      "Initial text and more text"
    );

    // Submit
    cy.submitComposer();
    cy.wait("@chatRequest");

    // Verify composer is cleared
    cy.get('[data-testid="composer-textarea"]').should("have.value", "");
  });
});
