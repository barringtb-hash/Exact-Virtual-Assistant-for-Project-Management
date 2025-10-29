import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.resolve(__dirname, "..", "fixtures", "uploads");
const ddpFixturePath = path.join(fixturesDir, "ddp-outline.txt");
const charterFixturePath = path.join(fixturesDir, "charter-outline.txt");

test.describe("document router enabled flows", () => {
  test("ddp flow triggers extraction, validation, and render", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(ddpFixturePath);

    await page.getByRole("heading", { name: "What document are you creating?" }).waitFor();
    await page.getByRole("button", { name: "Design & Development Plan" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    const extractResponse = await page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/extract") &&
        response.request().method() === "POST"
    );
    expect(extractResponse.ok()).toBeTruthy();

    const exportButton = page.getByRole("button", { name: "Export DOCX" });
    await expect(exportButton).toBeEnabled();

    const validatePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/validate") &&
        response.request().method() === "POST"
    );
    const renderPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/render") &&
        response.request().method() === "POST"
    );

    await exportButton.click();

    const validateResponse = await validatePromise;
    expect(validateResponse.status()).toBe(200);
    const renderResponse = await renderPromise;
    expect(renderResponse.status()).toBe(200);
    expect(renderResponse.headers()["content-disposition"] || "").toContain(".docx");
  });

  test("charter flow works when router is enabled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(charterFixturePath);

    await page.getByRole("heading", { name: "What document are you creating?" }).waitFor();
    await page.getByRole("button", { name: "Project Charter" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    const extractResponse = await page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/extract") &&
        response.request().method() === "POST"
    );
    expect(extractResponse.ok()).toBeTruthy();

    const projectTitleField = page.getByLabel("Project Title");
    await expect(projectTitleField).not.toHaveValue("");

    const exportButton = page.getByRole("button", { name: "Export DOCX" });
    await expect(exportButton).toBeEnabled();

    const validatePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/validate") &&
        response.request().method() === "POST"
    );
    const renderPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/render") &&
        response.request().method() === "POST"
    );

    await exportButton.click();

    const validateResponse = await validatePromise;
    expect(validateResponse.status()).toBe(200);
    const renderResponse = await renderPromise;
    expect(renderResponse.status()).toBe(200);
  });

  test("manual sync prompts for a document type and honors /type overrides", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const composer = page.getByPlaceholder("Type here… (paste scope or attach files)");
    await composer.fill("We need a roadmap covering milestones and timelines.");
    await composer.press("Enter");

    await composer.fill("/sync");
    await composer.press("Enter");

    await page.getByRole("heading", { name: "What document are you creating?" }).waitFor();
    await expect(
      page.getByText("Pick a document template before syncing", { exact: false })
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await composer.fill("/type ddp");
    await composer.press("Enter");

    await expect(page.getByText("Document type set to DDP.", { exact: true })).toBeVisible();

    const manualExtract = page.waitForResponse(
      (response) =>
        response.url().includes("/api/doc/extract") &&
        response.request().method() === "POST"
    );

    await composer.fill("/sync");
    await composer.press("Enter");

    const extractResponse = await manualExtract;
    expect(extractResponse.ok()).toBeTruthy();
  });
});
