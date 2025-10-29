import { test, expect } from "@playwright/test";

test.describe("charter preview manual sync", () => {
  test("commits extractor results into the preview when requested", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const llmToggle = page.getByLabel("Use LLM (beta)");
    await llmToggle.uncheck();
    await expect(llmToggle).not.toBeChecked();

    const projectTitleField = page.getByLabel("Project Title");
    await expect(projectTitleField).toHaveValue("");

    const composer = page.getByPlaceholder("Type here… (paste scope or attach files)");
    await composer.fill("The sponsor will be Casey Example.");
    await composer.press("Enter");

    await expect(projectTitleField).toHaveValue("");

    await composer.fill("/sync");
    await composer.press("Enter");

    await expect(projectTitleField).toHaveValue("Launch Initiative");
    await expect(page.getByLabel("Project Lead")).toHaveValue("Alex Example");
    await expect(page.getByLabel("Sponsor")).toHaveValue("Casey Example");
    await expect(page.getByLabel("Start Date")).toHaveValue("2024-03-15");
  });
});
