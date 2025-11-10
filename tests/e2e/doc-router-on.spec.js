import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

import { mockRouterSequence } from "./support/network.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.resolve(__dirname, "..", "fixtures", "uploads");
const ddpFixturePath = path.join(fixturesDir, "ddp-outline.txt");
const charterFixturePath = path.join(fixturesDir, "charter-outline.txt");

test.describe("document router enabled flows", () => {
  test("honors explicit /type commands over router suggestions", async ({ page }) => {
    await mockRouterSequence(page, [{ type: "ddp", confidence: 0.92 }]);

    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const composer = page.getByPlaceholder("Type here… (paste scope or attach files)");
    await composer.fill("/type charter");
    await composer.press("Enter");

    await expect(
      page.getByText("I’ll use the Charter template for syncing.", { exact: true })
    ).toBeVisible();

    const preview = page.locator("[data-doc-type]");
    await expect(preview).toHaveAttribute("data-doc-type", "charter");

    const fileInput = page.locator('input[type="file"]');
    const extractPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/extract") &&
        response.request().method() === "POST"
    );
    await fileInput.setInputFiles(ddpFixturePath);

    const extractResponse = await extractPromise;
    expect(extractResponse.ok()).toBeTruthy();
    expect(extractResponse.request().postDataJSON().docType).toBe("charter");

    await expect(preview).toHaveAttribute("data-doc-type", "charter");
    await expect(
      page.getByRole("heading", { name: "What document are you creating?" })
    ).toHaveCount(0);
  });

  test("auto applies router suggestion at high confidence", async ({ page }) => {
    await mockRouterSequence(page, [{ type: "ddp", confidence: 0.82 }]);

    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const fileInput = page.locator('input[type="file"]');
    const routerRequest = page.waitForRequest((request) =>
      request.url().includes("/api/documents/router")
    );
    const extractPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/extract") &&
        response.request().method() === "POST"
    );
    await fileInput.setInputFiles(ddpFixturePath);

    await routerRequest;
    const extractResponse = await extractPromise;
    expect(extractResponse.ok()).toBeTruthy();
    expect(extractResponse.request().postDataJSON().docType).toBe("ddp");

    const preview = page.locator("[data-doc-type]");
    await expect(preview).toHaveAttribute("data-doc-type", "ddp");
    await expect(page.getByText("82% confidence")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What document are you creating?" })
    ).toHaveCount(0);

    const exportButton = page.getByRole("button", { name: "Export DOCX" });
    await expect(exportButton).toBeEnabled();

    const validatePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/validate") &&
        response.request().method() === "POST"
    );
    const renderPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/render") &&
        response.request().method() === "POST"
    );

    await exportButton.click();

    const validateResponse = await validatePromise;
    expect(validateResponse.status()).toBe(200);
    const renderResponse = await renderPromise;
    expect(renderResponse.status()).toBe(200);
    expect(renderResponse.headers()["content-disposition"] || "").toContain(".docx");
  });

  test("requests confirmation when router confidence is low", async ({ page }) => {
    await mockRouterSequence(page, [{ type: "ddp", confidence: 0.55 }]);

    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(ddpFixturePath);

    await page.getByRole("heading", { name: "What document are you creating?" }).waitFor();
    await expect(
      page.getByText("Choose a template so I can tailor extraction and previews.")
    ).toBeVisible();
    await expect(
      page.getByText("Recommended (55% confidence)")
    ).toBeVisible();

    const extractPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/extract") &&
        response.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Design & Development Plan" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    const extractResponse = await extractPromise;
    expect(extractResponse.ok()).toBeTruthy();
    expect(extractResponse.request().postDataJSON().docType).toBe("ddp");

    const preview = page.locator("[data-doc-type]");
    await expect(preview).toHaveAttribute("data-doc-type", "ddp");
  });

  test("allows mid-draft doc type overrides", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const preview = page.locator("[data-doc-type]");
    await expect(preview).toHaveAttribute("data-doc-type", "charter");

    const projectTitleField = page.getByLabel("Project Title");
    await projectTitleField.fill("New Initiative");
    await expect(projectTitleField).toHaveValue("New Initiative");

    await page.getByRole("button", { name: "Change" }).click();
    await page.getByRole("heading", { name: "What document are you creating?" }).waitFor();
    await page.getByRole("button", { name: "Design & Development Plan" }).click();

    const extractPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents/extract") &&
        response.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Continue" }).click();

    const extractResponse = await extractPromise;
    expect(extractResponse.ok()).toBeTruthy();
    expect(extractResponse.request().postDataJSON().docType).toBe("ddp");

    await expect(preview).toHaveAttribute("data-doc-type", "ddp");
    await expect(preview).toHaveAttribute("data-doc-schema", "ddp");
    await expect(
      page.getByText("Required field guidance isn’t available", { exact: false })
    ).toBeVisible();
  });
});
