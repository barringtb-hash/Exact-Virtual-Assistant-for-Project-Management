// cypress.config.ts
import { defineConfig } from "cypress";

const baseUrl = process.env.CYPRESS_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  viewportWidth: 1280,
  viewportHeight: 900,
  video: false,
  screenshotOnRunFailure: true,
  numTestsKeptInMemory: 0,

  e2e: {
    baseUrl,
    specPattern: [
      "cypress/e2e/00-smoke/**/*.cy.ts",
      // Full set (for main/nightly) adds 90-extended via CLI --spec
    ],
    supportFile: "cypress/support/e2e.ts",
    testIsolation: true,
    defaultCommandTimeout: 6000,
    requestTimeout: 8000,
    responseTimeout: 8000,
    retries: {
      runMode: 1,
      openMode: 0,
    },
    env: {
      // Toggle voice harness deterministically in tests
      VOICE_E2E: "true",
      VOICE_USE_MOCK_MEDIA: "true",
      VOICE_USE_MOCK_STT: "true",
    },
    setupNodeEvents(on, config) {
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.name === "chrome" || browser.family === "chromium") {
          // Deterministic media behavior in CI
          launchOptions.args.push(
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"
          );
        }
        return launchOptions;
      });
      return config;
    },
  },
});
