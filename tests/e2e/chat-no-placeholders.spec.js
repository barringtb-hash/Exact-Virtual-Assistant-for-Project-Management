import { test, expect } from "@playwright/test";

const PLACEHOLDER_TEXTS = [
  "Summary",
  "No summary is available yet.",
  "Recommended Actions",
  "Open Questions",
  "No recommended actions yet.",
  "No recommended actions have been captured.",
  "No open questions yet.",
  "No open questions at this time.",
];

test.describe("assistant chat", () => {
  test("hides placeholder text while showing real assistant replies", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("heading", { name: "Assistant Chat" }).waitFor();

    const micButton = page.getByRole("button", { name: "Ready" });
    await expect(micButton).toHaveAttribute("aria-label", "Ready");

    for (const text of PLACEHOLDER_TEXTS) {
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }

    const composer = page.getByPlaceholder("Type here… (paste scope or attach files)");
    await composer.fill("The sponsor will be Alice Example.");
    await composer.press("Enter");

    await expect(
      page.getByText("Great — I’ll set the Sponsor field and add them as an approver.")
    ).toBeVisible();

    for (const text of PLACEHOLDER_TEXTS) {
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }
  });
});
