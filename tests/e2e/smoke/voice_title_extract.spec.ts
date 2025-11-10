import { test, expect } from "@playwright/test";

test("[smoke] voice title extraction populates title without extra assistant chatter", async ({ page }) => {
  await page.route("**/guided/charter/start*", async (route) => {
    await route.fulfill({
      json: {
        conversationId: "smoke-convo-voice-01",
        prompt: "Let’s build your charter step-by-step.",
        hasVoiceSupport: true,
        slots: [{ slot_id: "project_name", label: "Project Title", required: true }],
        events: [
          { type: "assistant_prompt", message: "Let’s build your charter step-by-step." },
          {
            type: "assistant_prompt",
            message: "Project Title (required). What’s the official name of this project?",
          },
          {
            type: "slot_update",
            status: "collecting",
            current_slot_id: "project_name",
            slots: [{ slot_id: "project_name", status: "awaiting_input" }],
          },
        ],
        idempotent: false,
      },
    });
  });

  await page.route("**/guided/charter/messages", async (route) => {
    await route.fulfill({ json: { handled: true, idempotent: false, events: [] } });
  });

  const extractHit = new Promise<void>((resolve) => {
    page.route("**/api/**/extract", async (route) => {
      const body = await route.request().postDataJSON();
      const voice = Array.isArray(body?.voice) ? body.voice : [];
      const lastUtterance = voice.at(-1)?.text;
      expect(lastUtterance).toBe("Polaris Launch");
      await route.fulfill({ json: { ok: true, draft: { project_name: "Polaris Launch" } } });
      resolve();
    });
  });

  await page.goto("/");
  await page.getByTestId("btn-start-charter").click();

  const beforeCount = await page.getByTestId("assistant-message").count();

  await page.evaluate(() => {
    (window as typeof window & { __simulateGuidedVoiceFinal?: (text: string) => void })
      .__simulateGuidedVoiceFinal?.("Polaris Launch");
  });

  await extractHit;

  const afterCount = await page.getByTestId("assistant-message").count();
  expect(afterCount).toBe(beforeCount);

  const titleField = page.getByTestId("preview-field-title").locator("input, textarea");
  await expect(titleField).toHaveValue("Polaris Launch");

  const titleContainer = page.getByTestId("preview-field-title");
  await expect(titleContainer).toContainText("Voice");
  await expect(titleContainer).toContainText("Pending confirmation");
});
