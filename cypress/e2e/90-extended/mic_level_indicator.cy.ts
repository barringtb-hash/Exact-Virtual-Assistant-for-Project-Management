import { S } from "../../harness/selectors";

describe("Mic level indicator (extended)", () => {
  beforeEach(() => {
    cy.waitForAppReady();
    cy.clock(); // control timing deterministically
  });

  it("shows level indicator with synthetic audio (no real waits)", () => {
    cy.window().then((win) => {
      const AC = (win as any).AudioContext || (win as any).webkitAudioContext;
      if (!AC) cy.wrap(null, { log: false }).then(() => { throw new Error("No AudioContext available in test env"); });

      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      osc.type = "sine"; osc.frequency.value = 440; gain.gain.value = 0.3;
      osc.connect(gain); gain.connect(dest); osc.start();

      const stream = dest.stream;
      cy.withStubbedUserMedia(stream);

      cy.get('[data-testid="mic-button"]').click({ force: true });

      // Advance "engine start" without sleeping
      cy.tick(500);

      cy.get(".mic-meter").should("exist");
      cy.get(".bar-fill").should(($bar) => {
        const style = win.getComputedStyle($bar[0]);
        expect(style.transform).to.match(/matrix/);
      });

      // Stop, cleanup
      cy.get('[data-testid="mic-button"]').click({ force: true });
      cy.then(() => { osc.stop(); return ctx.close(); });
    });
  });
});
