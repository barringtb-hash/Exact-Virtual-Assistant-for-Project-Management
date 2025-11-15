import { defineConfig } from "cypress";

const port = process.env.PORT ?? "5173";
const baseUrl = process.env.CYPRESS_BASE_URL ?? `http://localhost:${port}`;

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
