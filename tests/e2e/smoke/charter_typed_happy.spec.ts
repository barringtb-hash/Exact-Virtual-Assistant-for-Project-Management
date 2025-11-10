import { test, expect } from "@playwright/test";

test("[smoke] guided charter typed happy path updates preview", async ({ page }) => {
  await page.route("**/guided/charter/start*", async (route) => {
    const request = route.request();
    const body = await request.postDataJSON();
    expect(typeof body?.correlation_id).toBe("string");
    await route.fulfill({
      json: {
        conversationId: "smoke-convo-01",
        prompt: "Let’s build your charter step-by-step.",
        hasVoiceSupport: true,
        slots: [
          { slot_id: "project_name", label: "Project Title", required: true },
          { slot_id: "sponsor", label: "Sponsor", required: true },
        ],
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
            slots: [
              { slot_id: "project_name", status: "awaiting_input" },
              { slot_id: "sponsor", status: "pending" },
            ],
          },
        ],
        idempotent: false,
      },
    });
  });

  await page.route("**/guided/charter/messages", async (route) => {
    const requestBody = await route.request().postDataJSON();
    const respond = async (events: unknown[]) => {
      await route.fulfill({ json: { handled: true, idempotent: false, events } });
    };

    if (requestBody?.message === "North Star Initiative") {
      await respond([
        { type: "assistant_prompt", message: "Saved Project Title." },
        {
          type: "assistant_prompt",
          message: "Sponsor (required). Who is the sponsor for this project?",
        },
        {
          type: "slot_update",
          status: "collecting",
          current_slot_id: "sponsor",
          slots: [
            {
              slot_id: "project_name",
              status: "confirmed",
              value: "North Star Initiative",
              confirmed_value: "North Star Initiative",
            },
            { slot_id: "sponsor", status: "awaiting_input" },
          ],
        },
      ]);
      return;
    }

    if (requestBody?.message === "Jordan Example") {
      await respond([
        { type: "assistant_prompt", message: "Saved Sponsor." },
        {
          type: "slot_update",
          status: "collecting",
          current_slot_id: null,
          slots: [
            {
              slot_id: "project_name",
              status: "confirmed",
              value: "North Star Initiative",
              confirmed_value: "North Star Initiative",
            },
            {
              slot_id: "sponsor",
              status: "confirmed",
              value: "Jordan Example",
              confirmed_value: "Jordan Example",
            },
          ],
        },
      ]);
      return;
    }

    await respond([]);
  });

  await page.goto("/");
  await page.getByTestId("btn-start-charter").click();

  await page.getByTestId("composer-input").fill("North Star Initiative");
  await page.getByTestId("composer-submit").click();
  await expect(page.getByTestId("assistant-message")).toContainText("Saved Project Title.");
  await expect(page.getByTestId("assistant-message")).toContainText("Sponsor");

  const titleField = page.getByTestId("preview-field-title").locator("input, textarea");
  await expect(titleField).toHaveValue("North Star Initiative");

  await page.getByTestId("composer-input").fill("Jordan Example");
  await page.getByTestId("composer-submit").click();
  await expect(page.getByTestId("assistant-message")).toContainText("Saved Sponsor.");

  const sponsorField = page.getByTestId("preview-field-sponsor").locator("input, textarea");
  await expect(sponsorField).toHaveValue("Jordan Example");
});
