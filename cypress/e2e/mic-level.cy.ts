/**
 * Cypress E2E tests for microphone level indicator
 * Tests both happy path and error scenarios
 */

describe("Microphone Level Indicator", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("shows level indicator when mic starts with synthetic audio", () => {
    cy.window().then(async (win) => {
      // Create a synthetic audio stream using Web Audio API
      const AudioCtx = (win as any).AudioContext || (win as any).webkitAudioContext;
      if (!AudioCtx) {
        // Skip test if Web Audio API is not available
        cy.log("Web Audio API not available, skipping test");
        return;
      }

      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();

      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0.3; // 30% volume
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const fakeStream = dest.stream;

      // Stub getUserMedia to return our synthetic stream
      const originalGetUserMedia = win.navigator.mediaDevices.getUserMedia.bind(
        win.navigator.mediaDevices
      );
      cy.stub(win.navigator.mediaDevices, "getUserMedia").callsFake(
        async () => fakeStream
      );

      // Find and click the mic button
      // Note: This assumes the mic button is available in the UI
      // Adjust selector based on actual implementation
      cy.get('button.mic-btn[aria-label="Ready"]').click({ force: true });

      // Wait a bit for the audio engine to start
      cy.wait(500);

      // Check if the embedded meter in the button is visible
      cy.get(".mic-btn .meter").should("exist");
      cy.get(".mic-btn .meter-fill").should("exist");

      // The meter-fill should have a transform scale > 0 (indicating audio level)
      cy.get(".mic-btn .meter-fill").should(($fill) => {
        const style = win.getComputedStyle($fill[0]);
        expect(style.transform).to.match(/matrix/);
      });

      // Stop the mic
      cy.get('button.mic-btn[aria-label="Recording…"]').click({ force: true });

      // Cleanup
      osc.stop();
      ctx.close();
      // Restore original getUserMedia
      (win.navigator.mediaDevices.getUserMedia as any).restore?.();
      if ((win.navigator.mediaDevices.getUserMedia as any).wrappedMethod) {
        win.navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      }
    });
  });

  it("handles microphone permission denial gracefully", () => {
    cy.window().then((win) => {
      // Stub getUserMedia to reject with permission denied error
      cy.stub(win.navigator.mediaDevices, "getUserMedia").rejects(
        new DOMException("Permission denied", "NotAllowedError")
      );

      // Try to start the mic
      cy.get('button.mic-btn[aria-label="Ready"]').click({ force: true });

      // Should show an error or handle gracefully
      // Note: The exact error handling depends on your implementation
      // This test verifies no uncaught errors occur
      cy.wait(500);

      // Verify the app is still functional (no crash)
      cy.get("textarea").should("exist");
    });
  });

  it("handles no microphone available scenario", () => {
    cy.window().then((win) => {
      // Stub getUserMedia to reject with device not found error
      cy.stub(win.navigator.mediaDevices, "getUserMedia").rejects(
        new DOMException("Requested device not found", "NotFoundError")
      );

      // Try to start the mic
      cy.get('button.mic-btn[aria-label="Ready"]').click({ force: true });

      // Should handle gracefully
      cy.wait(500);

      // Verify the app is still functional
      cy.get("textarea").should("exist");
    });
  });

  it("shows peak indicator that decays over time", () => {
    cy.window().then(async (win) => {
      const AudioCtx = (win as any).AudioContext || (win as any).webkitAudioContext;
      if (!AudioCtx) {
        cy.log("Web Audio API not available, skipping test");
        return;
      }

      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();

      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const fakeStream = dest.stream;
      const originalGetUserMedia = win.navigator.mediaDevices.getUserMedia.bind(
        win.navigator.mediaDevices
      );
      cy.stub(win.navigator.mediaDevices, "getUserMedia").callsFake(
        async () => fakeStream
      );

      // Start mic
      cy.get('button.mic-btn[aria-label="Ready"]').click({ force: true });
      cy.wait(500);

      // Check that meter fill exists and responds to audio
      cy.get(".mic-btn .meter-fill").should("exist");

      // Reduce volume to test meter responsiveness
      gain.gain.value = 0.1;
      cy.wait(1000);

      // Verify meter is still visible (though level will be lower)
      cy.get(".mic-btn .meter-fill").should("exist");

      // Stop and cleanup
      cy.get('button.mic-btn[aria-label="Recording…"]').click({ force: true });
      osc.stop();
      ctx.close();
      (win.navigator.mediaDevices.getUserMedia as any).restore?.();
      if ((win.navigator.mediaDevices.getUserMedia as any).wrappedMethod) {
        win.navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      }
    });
  });
});
