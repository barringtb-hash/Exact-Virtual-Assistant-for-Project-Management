import { defineConfig } from "cypress";
import type { Browser } from "cypress";

const port = process.env.PORT ?? "5173";
const baseUrl =
  process.env.CYPRESS_BASE_URL ??
  process.env.VITE_TEST_HOST ??
  `http://localhost:${port}`;

const smokeSpecs = "cypress/e2e/00-smoke/**/*.cy.ts";
const cliSpecs = process.env.CYPRESS_SPEC_PATTERN ?? process.env.CYPRESS_E2E_SPECS;
const specPattern = cliSpecs && cliSpecs.length > 0 ? cliSpecs : smokeSpecs;

export default defineConfig({
  e2e: {
    baseUrl,
    specPattern,
    supportFile: "cypress/support/e2e.ts",
    testIsolation: true,
    setupNodeEvents(on, config) {
      on("before:browser:launch", (browser = {} as Browser, launchOptions) => {
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
  retries: {
    runMode: 1,
    openMode: 0,
  },
  env: {
    VOICE_E2E: process.env.VOICE_E2E ?? "false",
    VOICE_USE_MOCK_MEDIA: process.env.VOICE_USE_MOCK_MEDIA ?? "false",
    VOICE_USE_MOCK_STT: process.env.VOICE_USE_MOCK_STT ?? "false",
  },
});
