import { S } from "../../harness/selectors";

describe("App boot", () => {
  it("renders readiness beacon and core UI", () => {
    cy.waitForAppReady();
    cy.getByTestId(S.appHeader).should("exist");
    cy.getByTestId(S.composerRoot).should("exist");
  });
});
