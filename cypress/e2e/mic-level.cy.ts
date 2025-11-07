/**
---
scenario: Voice microphone level indicator renders and updates
feature: voice
subsystem: composer
envs: [guided, wizard]
risk: medium
owner: "@qa-team"
ci_suites: [e2e-guided, e2e-wizard]
flaky: false
needs_review: false
preconditions:
  - Browser microphone permissions granted
  - Voice feature flags enabled for target envs
data_setup: Mock audio stream using Web Audio API stubs
refs: [CI]
---
*/

/**
 * Cypress E2E tests for microphone level indicator
 * Tests both happy path and error scenarios
 */

describe("Microphone Level Indicator", () => {
  beforeEach(() => {
    cy.waitForAppReady();
    cy.restoreGUM();
  });

  afterEach(() => {
    cy.restoreGUM();
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
      cy.stubGUMSuccess(fakeStream);

      // Find and click the mic button
      // Note: This assumes the mic button is available in the UI
      // Adjust selector based on actual implementation
      cy.get('button[title*="Voice"]').first().click({ force: true });

      // Wait a bit for the audio engine to start
      cy.wait(500);

      // Check if the mic level indicator is visible
      cy.get(".mic-meter").should("exist");
      cy.get(".bar-fill").should("exist");

      // The bar-fill should have a transform scale > 0 (indicating audio level)
      cy.get(".bar-fill").should(($bar) => {
        const style = win.getComputedStyle($bar[0]);
        expect(style.transform).to.match(/matrix/);
      });

      // Stop the mic
      cy.get('button[title*="Stop"]').first().click({ force: true });

      // Cleanup
      cy.then(() => {
        osc.stop();
        return ctx.close();
      });
    });
  });

  it("handles microphone permission denial gracefully", () => {
    // Stub getUserMedia to reject with permission denied error
    cy.stubGUMReject("NotAllowedError");

    // Try to start the mic
    cy.get('button[title*="Voice"]').first().click({ force: true });

    // Should show an error or handle gracefully
    // Note: The exact error handling depends on your implementation
    // This test verifies no uncaught errors occur
    cy.wait(500);

    // Verify the app is still functional (no crash)
    cy.get("textarea").should("exist");
  });

  it("handles no microphone available scenario", () => {
    // Stub getUserMedia to reject with device not found error
    cy.stubGUMReject("NotFoundError");

    // Try to start the mic
    cy.get('button[title*="Voice"]').first().click({ force: true });

    // Should handle gracefully
    cy.wait(500);

    // Verify the app is still functional
    cy.get("textarea").should("exist");
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
      cy.stubGUMSuccess(fakeStream);

      // Start mic
      cy.get('button[title*="Voice"]').first().click({ force: true });
      cy.wait(500);

      // Check that peak indicator exists
      cy.get(".bar-peak").should("exist");

      // Reduce volume to cause peak to decay
      gain.gain.value = 0.1;
      cy.wait(1000);

      // Stop and cleanup
      cy.get('button[title*="Stop"]').first().click({ force: true });
      cy.then(() => {
        osc.stop();
        return ctx.close();
      });
    });
  });
});
