import { defineConfig } from "cypress";

// Normalize typical truthy strings into a boolean
const asOn = (value?: string) =>
  !!value && /^(1|true|on|yes)$/i.test(String(value).trim());

const baseUrl = process.env.CYPRESS_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  e2e: {
    // keeps clicks aimed at the center of targets
    scrollBehavior: "center",
    baseUrl,
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    testIsolation: true,
    video: false,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    retries: {
      runMode: 1,
      openMode: 0,
    },
    env: {
      VOICE_E2E: process.env.VOICE_E2E ?? "false",
      VOICE_USE_MOCK_MEDIA: process.env.VOICE_USE_MOCK_MEDIA ?? "false",
      VOICE_USE_MOCK_STT: process.env.VOICE_USE_MOCK_STT ?? "false",
      // Bridge Vite flags into Cypress.env so specs can assert on them.
      GUIDED_CHAT_ENABLED: asOn(
        process.env.VITE_CHARTER_GUIDED_CHAT_ENABLED
      ),
      GUIDED_BACKEND_ON: asOn(process.env.VITE_CHARTER_GUIDED_BACKEND),
      WIZARD_VISIBLE: asOn(process.env.VITE_CHARTER_WIZARD_VISIBLE),
      AUTO_EXTRACTION_ENABLED: asOn(
        process.env.VITE_AUTO_EXTRACTION_ENABLED
      ),
      CYPRESS_SAFE_MODE: asOn(process.env.VITE_CYPRESS_SAFE_MODE),
    },
    setupNodeEvents(on, config) {
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.name === "chrome") {
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
  viewportWidth: 1280,
  viewportHeight: 900,
  screenshotOnRunFailure: true,
});
