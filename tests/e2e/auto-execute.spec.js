import { test, expect } from "@playwright/test";

test.describe("voice auto execute charter render", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const mediaStream = {
        getTracks() {
          return [
            {
              stop() {},
            },
          ];
        },
      };

      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }

      navigator.mediaDevices.getUserMedia = async () => mediaStream;

      class FakeMediaRecorder {
        constructor(stream, options = {}) {
          this.stream = stream;
          this.mimeType = options?.mimeType || "audio/webm";
          this.state = "inactive";
          this.ondataavailable = null;
          this.onstop = null;
        }

        static isTypeSupported() {
          return false;
        }

        start() {
          this.state = "recording";
        }

        stop() {
          this.state = "inactive";
          const blob = new Blob(["voice"], { type: this.mimeType || "audio/webm" });
          if (typeof this.ondataavailable === "function") {
            this.ondataavailable({ data: blob });
          }
          if (typeof this.onstop === "function") {
            setTimeout(() => this.onstop(), 0);
          }
        }
      }

      window.MediaRecorder = FakeMediaRecorder;
    });
  });

  test("simulates voice command auto execution", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Exact Sciences Virtual Assistant for Project Management")).toBeVisible();

    const micButton = page.getByTitle("Voice input (mock)");
    await micButton.click();
    await micButton.click();

    await expect(
      page.locator(".assistant-feedback-section", { hasText: "Auto-run complete. Voice Charter is ready for download." })
    ).toBeVisible();

    const downloadLink = page.getByTestId("auto-download-link").first();
    await expect(downloadLink).toHaveText("Voice Charter.docx");
    await expect(downloadLink).toHaveAttribute("download", "Voice Charter.docx");
    await expect(downloadLink).toHaveAttribute("href", /blob:/);

    await expect(page.getByTestId("preview-status")).toHaveText("Preview synced with voice command");
  });
});
