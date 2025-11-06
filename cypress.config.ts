import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    // keeps clicks aimed at the center of targets
    scrollBehavior: "center",
    defaultCommandTimeout: 10000,
    baseUrl: "http://localhost:5173",
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    supportFile: "cypress/support/e2e.ts",
    testIsolation: false,
    video: false,
  },
  viewportWidth: 1280,
  viewportHeight: 900,
  screenshotOnRunFailure: true,
});
