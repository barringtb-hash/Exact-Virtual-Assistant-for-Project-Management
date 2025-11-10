import { defineConfig } from "@playwright/test";

const createWebServerProject = ({
  name,
  port,
  docRouterEnabled,
  testMatch,
  testIgnore,
  use = {},
}) => ({
  name,
  testMatch,
  testIgnore,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...use,
  },
  webServer: {
    command: "node tests/e2e/run-test-server.mjs",
    url: `http://127.0.0.1:${port}/api/charter/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      FILES_LINK_SECRET: process.env.FILES_LINK_SECRET || "playwright-secret",
      PLAYWRIGHT_TEST_PORT: String(port),
      VITE_ENABLE_DOC_ROUTER: docRouterEnabled ? "1" : "0",
      VITE_CHARTER_GUIDED_CHAT_ENABLED: "true",
      VITE_CHARTER_GUIDED_BACKEND: "on",
      VITE_CHARTER_WIZARD_VISIBLE: "false",
      VITE_AUTO_EXTRACTION_ENABLED: "false",
      VITE_CYPRESS_SAFE_MODE: "true",
    },
  },
});

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  projects: [
    createWebServerProject({
      name: "api",
      port: 4010,
      docRouterEnabled: false,
      testMatch: /.*\.api\.spec\.js/,
    }),
    createWebServerProject({
      name: "chromium-doc-router-off",
      port: 4011,
      docRouterEnabled: false,
      testIgnore: [/.*\.api\.spec\.js/, /doc-router-on\.spec\.js/],
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 720 },
      },
    }),
    createWebServerProject({
      name: "chromium-doc-router-on",
      port: 4012,
      docRouterEnabled: true,
      testMatch: /doc-router-on\.spec\.js/,
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 720 },
      },
    }),
  ],
});
