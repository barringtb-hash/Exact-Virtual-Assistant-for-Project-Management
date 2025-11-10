import { test, expect } from "@playwright/test";

test("[smoke] app boot shows readiness beacon and core UI", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-ready")).toBeVisible();
  await expect(page.getByTestId("btn-start-charter")).toBeVisible();
  await expect(page.getByTestId("composer-input")).toBeVisible();
});
