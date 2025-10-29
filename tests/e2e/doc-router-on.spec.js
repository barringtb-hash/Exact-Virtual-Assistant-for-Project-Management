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
});
