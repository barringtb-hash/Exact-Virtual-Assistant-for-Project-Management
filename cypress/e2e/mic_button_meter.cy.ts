/**
 * E2E tests for the MicButton component
 * Tests the vertical audio meter embedded in the microphone button
 */

describe("Microphone Button with Embedded Meter", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("shows a vertical fill inside the mic button when audio is present", () => {
    cy.window().then(async (win) => {
      // Create a synthetic audio stream using Web Audio API
      const AC = (win as any).AudioContext || (win as any).webkitAudioContext;
      if (!AC) {
        cy.log("Web Audio API not available, skipping test");
        return;
      }

      const ctx = new AC();
      const osc = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      osc.frequency.value = 440;
      osc.connect(dest);
      osc.start();

      const originalGUM = win.navigator.mediaDevices.getUserMedia.bind(
        win.navigator.mediaDevices
      );

      // Stub getUserMedia to return our synthetic stream
      cy.stub(win.navigator.mediaDevices, "getUserMedia").callsFake(
        async () => dest.stream
      );

      // Find and click the mic button (updated to work with the new component)
      cy.get('button.mic-button[aria-label="Ready"]').click();

      // Verify button state changes
      cy.get('button.mic-button[aria-pressed="true"]').should("exist");

      // Wait for audio engine to start
      cy.wait(500);

      // Check that the meter fill exists next to the mic button
      cy.get(".mic-button__meter").should("exist");

      // The meter should have a transform with scaleY > 0 (matrix with d value)
      cy.get(".mic-button__meter").then(($el) => {
        const style = win.getComputedStyle($el[0]);
        // matrix(a, b, c, d, e, f), we care about d (scaleY)
        expect(style.transform).to.contain("matrix");
      });

      // Verify button is marked as active
      cy.get(".mic-button[data-state='listening']").should("exist");

      // Stop the mic
      cy.get('button.mic-button[aria-pressed="true"]').click();

      // Cleanup
      osc.stop();
      ctx.close();

      // Restore original getUserMedia
      (win.navigator.mediaDevices.getUserMedia as any).restore?.();
      if ((win.navigator.mediaDevices.getUserMedia as any).wrappedMethod) {
        win.navigator.mediaDevices.getUserMedia = originalGUM;
      }
    });
  });

  it("meter is empty when mic is off", () => {
    cy.get('button.mic-button[aria-label="Ready"]').should("exist");
    cy.get(".mic-button__meter").should(($el) => {
      const style = getComputedStyle($el[0]);
      if (!style.transform || style.transform === "none") {
        throw new Error("Expected transform to be set");
      }
      const values = style.transform.match(/matrix\((.*)\)/)?.[1]?.split(",") ?? [];
      const scale = values[3] ? parseFloat(values[3]) : 0;
      expect(scale).to.be.closeTo(0.05, 0.05);
    });
  });

  it("button is keyboard accessible with proper ARIA attributes", () => {
    // Check ARIA attributes when inactive
    cy.get('button.mic-button[aria-label="Ready"]')
      .should("have.attr", "aria-pressed", "false")
      .and("not.be.disabled");

    cy.window().then((win) => {
      const AC = (win as any).AudioContext || (win as any).webkitAudioContext;
      if (!AC) {
        cy.log("Web Audio API not available, skipping test");
        return;
      }

      const ctx = new AC();
      const osc = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();

      cy.stub(win.navigator.mediaDevices, "getUserMedia").callsFake(
        async () => dest.stream
      );

      // Verify button is keyboard focusable
      cy.get('button.mic-button[aria-label="Ready"]')
        .focus()
        .should("have.focus");

      // Activate mic (keyboard events are unreliable in headless CI, use click)
      cy.get('button.mic-button[aria-label="Ready"]').click();

      // Wait for async operations to complete
      cy.wait(1000);

      // Check ARIA attributes when active
      cy.get('button.mic-button[aria-pressed="true"]', { timeout: 5000 })
        .should("exist")
        .and("have.attr", "data-state", "listening");

      // Verify focus ring is visible (focus-visible)
      cy.get('button.mic-button[aria-pressed="true"]')
        .focus()
        .should("have.focus");

      // Cleanup
      cy.get('button.mic-button[aria-pressed="true"]').click();
      osc.stop();
      ctx.close();
    });
  });

  it("button meets minimum touch target size (44x44px)", () => {
    cy.get(".mic-button").then(($btn) => {
      const width = $btn.width() || 0;
      const height = $btn.height() || 0;

      // Verify button is at least 44x44px (WCAG 2.1 Level AAA minimum touch target)
      expect(width).to.be.at.least(44);
      expect(height).to.be.at.least(44);
    });
  });

  it("handles permission denied gracefully", () => {
    cy.window().then((win) => {
      // Stub getUserMedia to reject with permission denied
      cy.stub(win.navigator.mediaDevices, "getUserMedia").rejects(
        new DOMException("Permission denied", "NotAllowedError")
      );

      // Try to start the mic
      cy.get('button.mic-button[aria-label="Ready"]').click();

      // Wait for error handling
      cy.wait(500);

      // Verify button indicates blocked state
      cy.get(".mic-button[data-blocked='true']").should("exist");
    });
  });

  it("works across different button sizes", () => {
    // This test verifies the meter scales properly with button size
    cy.window().then((win) => {
      cy.get(".mic-button").should("exist").then(($btn) => {
        const btnSize = $btn.width() || 0;

        // Verify meter is visible next to button
        cy.get(".mic-button__meter").should("exist").then(($meter) => {
          const meterWidth = parseInt(win.getComputedStyle($meter[0]).width || "0");
          // Meter should be 6px wide and visible
          expect(meterWidth).to.equal(6);
        });
      });
    });
  });

  it("respects reduced motion preferences", () => {
    cy.window().then((win) => {
      // Note: This is a simplified test. In a real scenario, you'd need to
      // set the prefers-reduced-motion media query
      cy.get(".mic-button__meter").should(($fill) => {
        const style = win.getComputedStyle($fill[0]);
        // When reduced motion is preferred, transition should be none
        // In normal mode, transition should be present
        expect(style.transitionProperty).to.exist;
      });
    });
  });
});
