import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4010",
  },
  webServer: {
    command: "node tests/e2e/test-server.mjs",
    url: "http://127.0.0.1:4010/api/charter/health",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      FILES_LINK_SECRET: process.env.FILES_LINK_SECRET || "playwright-secret",
      PLAYWRIGHT_TEST_PORT: "4010",
    },
  },
  projects: [
    {
      name: "api", // API-only flow; no browser required
      use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4010",
      },
    },
  ],
});
