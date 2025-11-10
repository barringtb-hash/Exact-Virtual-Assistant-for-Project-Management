/// <reference types="cypress" />

describe("app boot smoke", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("loads the application shell and critical UI", () => {
    cy.waitForAppReady();

    cy.getByTestId("app-ready").should("exist");
    cy.getByTestId("app-header").should("contain.text", "Chat Assistant");
    cy.getByTestId("composer-root").should("be.visible");
    cy.getByTestId("btn-start-charter").should("be.visible");
    cy.getByTestId("preview-panel").should("not.exist");
  });
});
