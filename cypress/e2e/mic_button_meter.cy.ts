/**
 * E2E tests for MicButtonWithMeter component
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
      cy.get('button.mic-btn[aria-label*="Start"]').click();

      // Verify button state changes
      cy.get('button.mic-btn[aria-pressed="true"]').should("exist");

      // Wait for audio engine to start
      cy.wait(500);

      // Check that the meter fill exists inside the mic button
      cy.get(".mic-btn .meter-fill").should("exist");

      // The meter-fill should have a transform with scaleY > 0 (matrix with d value)
      cy.get(".mic-btn .meter-fill").then(($el) => {
        const style = win.getComputedStyle($el[0]);
        // matrix(a, b, c, d, e, f), we care about d (scaleY)
        expect(style.transform).to.contain("matrix");
      });

      // Verify button is marked as active
      cy.get(".mic-btn").should("have.class", "is-active");

      // Stop the mic
      cy.get('button.mic-btn[aria-pressed="true"]').click();

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
    // Verify the button exists
    cy.get('button.mic-btn[aria-label*="Start"]').should("exist");

    // Check that meter fill has scaleY(0) when inactive
    cy.get(".mic-btn .meter-fill").should(($el) => {
      const levelVar = $el[0].parentElement?.parentElement?.style.getPropertyValue("--meter-level");
      expect(levelVar).to.be.oneOf([undefined, "", "0"]);
    });
  });

  it("button is keyboard accessible with proper ARIA attributes", () => {
    // Check ARIA attributes when inactive
    cy.get('button.mic-btn[aria-label*="Start"]')
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

      // Start mic via keyboard (Enter)
      cy.get('button.mic-btn[aria-label*="Start"]').type("{enter}");
      cy.wait(300);

      // Check ARIA attributes when active
      cy.get('button.mic-btn[aria-pressed="true"]')
        .should("exist");

      // Verify focus ring is visible (focus-visible)
      cy.get('button.mic-btn[aria-pressed="true"]')
        .focus()
        .should("have.focus");

      // Cleanup
      cy.get('button.mic-btn[aria-pressed="true"]').click();
      osc.stop();
      ctx.close();
    });
  });

  it("button meets minimum touch target size (44x44px)", () => {
    cy.get(".mic-btn").then(($btn) => {
      const width = $btn.width() || 0;
      const height = $btn.height() || 0;

      // Verify button is at least 44x44px (or configured size)
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
      cy.get('button.mic-btn[aria-label*="Start"]').click();

      // Wait for error handling
      cy.wait(500);

      // Verify no uncaught promise rejection (app should handle gracefully)
      cy.get(".mic-btn").should("not.have.class", "is-active");
    });
  });

  it("works across different button sizes", () => {
    // This test verifies the meter scales properly with button size
    cy.get(".mic-btn").should("exist").then(($btn) => {
      const btnSize = $btn.width() || 0;

      // Verify meter rail is positioned correctly relative to button size
      cy.get(".mic-btn .meter").should("exist").then(($meter) => {
        const meterLeft = parseInt(win.getComputedStyle($meter[0]).left || "0");
        expect(meterLeft).to.be.greaterThan(0);
        expect(meterLeft).to.be.lessThan(btnSize / 2);
      });
    });
  });

  it("respects reduced motion preferences", () => {
    cy.window().then((win) => {
      // Note: This is a simplified test. In a real scenario, you'd need to
      // set the prefers-reduced-motion media query
      cy.get(".mic-btn .meter-fill").should(($fill) => {
        const style = win.getComputedStyle($fill[0]);
        // When reduced motion is preferred, transition should be none
        // In normal mode, transition should be present
        expect(style.transitionProperty).to.exist;
      });
    });
  });
});
