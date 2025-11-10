import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "..", "fixtures", "uploads");
const demoTppPath = path.join(fixturesDir, "demo-tpp.txt");
const EXTRACT_RE = /\/api\/(charter|documents|doc)\/extract(?:\?|$)/;

test.describe("charter preview background extraction", () => {
  test("does not auto extract when uploading attachments without intent", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: /chat assistant/i }).waitFor();
    await expect(page.getByTestId("chat-title")).toBeVisible();

    const extractRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (EXTRACT_RE.test(url) && request.method() === "POST") {
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
    await page.getByRole("heading", { name: /chat assistant/i }).waitFor();
    await expect(page.getByTestId("chat-title")).toBeVisible();

    // Intercept the document-extraction call and return a deterministic response.
    // Without this stub, the API calls the OpenAI client and throws
    // "No OpenAI mock response configured" during tests.
    await page.route(EXTRACT_RE, async (route) => {
      const responseBody = {
        status: "ok",
        fields: {
          project_name: "Launch Initiative",
          project_lead: "Alex Example",
          sponsor: "Casey Example",
          start_date: "2024-03-15",
        },
        warnings: [],
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseBody),
      });
    });

    const extractRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (EXTRACT_RE.test(url) && request.method() === "POST") {
        extractRequests.push(request);
      }
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(demoTppPath);

    const composer = page.getByPlaceholder("Type here… (paste scope or attach files)");
    await composer.fill("Please create a project charter from the attached document.");
    await composer.press("Enter");

    const extractResponse = await page.waitForResponse((response) => {
      const url = response.url();
      return EXTRACT_RE.test(url) && response.request().method() === "POST";
    });

    expect(extractResponse.ok()).toBeTruthy();
    expect(extractRequests.length).toBe(1);
    const payload = extractRequests[0].postDataJSON();
    expect(payload.intent).toBe("create_charter");

    const projectTitleField = page.getByLabel("Project Title");
    await expect(projectTitleField).toHaveValue("Launch Initiative");
    await expect(page.getByLabel("Project Lead")).toHaveValue("Alex Example");
    await expect(page.getByLabel("Sponsor")).toHaveValue("Casey Example");
    await expect(page.getByLabel("Start Date")).toHaveValue("2024-03-15");

    await page.unroute(EXTRACT_RE);
  });
});
