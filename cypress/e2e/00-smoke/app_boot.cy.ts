import { S } from "../../harness/selectors";

describe("Smoke: application boot", () => {
  it("confirms the readiness beacon and renders core surfaces", () => {
    cy.visit("/");
    cy.waitForAppReady();

    cy.window().its("__appReady").should("eq", true);
    cy.get("body").should("have.attr", "data-e2e-ready", "1");

    cy.get(S.appHeader)
      .should("be.visible")
      .and("contain.text", "Exact Sciences Virtual Assistant for Project Management");
    cy.get(S.chatPanel).should("be.visible");
    cy.get(S.previewPanel).should("be.visible");

    cy.get(S.composerRoot).within(() => {
      cy.get(`${S.composerInput}, ${S.composerTextareaLegacy}`)
        .filter(":visible")
        .should("have.length", 1)
        .and("be.enabled");
      cy.get(S.composerSend).should("be.visible").and("not.be.disabled");
    });
  });
});
