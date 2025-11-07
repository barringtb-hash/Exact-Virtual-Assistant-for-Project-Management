/**
---
scenario: Document Preview Sync Spec
feature: unknown
subsystem: unknown
envs: []
risk: unknown
owner: TBD
ci_suites: []
flaky: false
needs_review: true
preconditions:
  - TBD
data_setup: TBD
refs: []
---
*/

import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "..", "fixtures", "uploads");
const demoTppPath = path.join(fixturesDir, "demo-tpp.txt");

test.describe("charter preview background extraction", () => {
  test("does not auto extract when uploading attachments without intent", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const extractRequests = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/documents/extract") &&
        request.method() === "POST"
      ) {
        extractRequests.push(request);
      }
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(demoTppPath);

    await page.waitForTimeout(1200);
    expect(extractRequests.length).toBe(0);
  });

  test("triggers charter extraction after NL request and populates the preview", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const extractRequests = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/documents/extract") &&
        request.method() === "POST"
      ) {
        extractRequests.push(request);
      }
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(demoTppPath);

    const composer = page.getByPlaceholder("Type here… (paste scope or attach files)");
    await composer.fill("Please create a project charter from the attached document.");
    await composer.press("Enter");

    const extractResponse = await page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/extract") &&
        response.request().method() === "POST"
    );

    expect(extractResponse.ok()).toBeTruthy();
    expect(extractRequests.length).toBe(1);
    const payload = extractRequests[0].postDataJSON();
    expect(payload.intent).toBe("create_charter");

    const projectTitleField = page.getByLabel("Project Title");
    await expect(projectTitleField).toHaveValue("Launch Initiative");
    await expect(page.getByLabel("Project Lead")).toHaveValue("Alex Example");
    await expect(page.getByLabel("Sponsor")).toHaveValue("Casey Example");
    await expect(page.getByLabel("Start Date")).toHaveValue("2024-03-15");
  });
});
