import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import CharterFieldSession from "../src/chat/CharterFieldSession.tsx";
import { normalizeCharterFormSchema } from "../src/lib/charter/formSchema.ts";
import { conversationActions } from "../src/state/conversationStore.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "fixtures/conversation/simple-schema.json");

async function loadSchema() {
  const raw = await readFile(schemaPath, "utf8");
  return normalizeCharterFormSchema(JSON.parse(raw));
}

test("charter field session captures responses, flags required skips, and finalizes", async () => {
  const schema = await loadSchema();
  conversationActions.reset();
  conversationActions.ensureSession(schema);
  conversationActions.dispatch({ type: "INIT" });

  const finalizeCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (typeof url === "string" && url.endsWith("/api/charter/finalize")) {
      const body = options?.body ? JSON.parse(options.body) : {};
      finalizeCalls.push(body);
      const pdfPayload = Buffer.from("PDF").toString("base64");
      const responsePayload = {
        ok: true,
        charter: {
          project_name: "Project Atlas",
          executive_summary: "",
          risks: "",
        },
        checklist: [
          {
            id: "project_name",
            label: "Project name",
            required: true,
            status: "confirmed",
            skippedReason: null,
            missingRequired: false,
            normalizedValue: "Project Atlas",
            displayValue: "Project Atlas",
            issues: [],
          },
          {
            id: "executive_summary",
            label: "Executive summary",
            required: true,
            status: "skipped",
            skippedReason: "user-skipped",
            missingRequired: true,
            normalizedValue: "",
            displayValue: "",
            issues: [
              {
                code: "required",
                message: "Executive summary is required.",
                severity: "error",
                ruleText: null,
                details: null,
              },
            ],
          },
          {
            id: "risks",
            label: "Key risks",
            required: false,
            status: "skipped",
            skippedReason: "user-skipped",
            missingRequired: false,
            normalizedValue: "",
            displayValue: "",
            issues: [],
          },
        ],
        document: {
          id: "doc-123",
          name: "Project Atlas – Charter",
          url: "https://docs.google.com/document/d/doc-123",
        },
        pdf: {
          base64: pdfPayload,
          contentType: "application/pdf",
          filename: "Project Atlas – Charter.pdf",
        },
      };
      return {
        ok: true,
        status: 200,
        json: async () => responsePayload,
        text: async () => JSON.stringify(responsePayload),
      };
    }
    return originalFetch(url, options);
  };

  try {
    render(<CharterFieldSession />);

    const user = userEvent.setup();

  const nameTextarea = await screen.findByRole("textbox", { name: "Project name" });
  await user.type(nameTextarea, "Project Atlas");
  await user.click(screen.getByRole("button", { name: "Save response" }));

  await screen.findByText(/Confirm response for Project name/i);
  await user.click(screen.getByRole("button", { name: "Confirm value" }));

  await screen.findByText(/Saved Project name/i);
  await user.click(screen.getByRole("button", { name: "Next field" }));

  await screen.findByText(/Executive summary/i);
  await user.click(screen.getByRole("button", { name: "Skip field" }));

  await screen.findByText(/Key risks/i);
  await user.click(screen.getByRole("button", { name: "Skip field" }));

  await screen.findByText(/Review the captured responses/i);

  const reviewList = screen.getByRole("list");
  const items = within(reviewList).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent("Project name");
  expect(items[1]).toHaveTextContent("Executive summary");
  expect(items[2]).toHaveTextContent("Key risks");
  expect(items[1]).toHaveTextContent(/Required field missing/i);

    await user.click(screen.getByRole("button", { name: "Finalize charter" }));

    const docLink = await screen.findByRole("link", { name: /Open Google Doc/i });
    expect(docLink).toHaveAttribute(
      "href",
      "https://docs.google.com/document/d/doc-123"
    );
    const pdfLink = screen.getByRole("link", { name: /Download PDF/i });
    expect(pdfLink).toHaveAttribute("download", "Project Atlas – Charter.pdf");
    expect(screen.getAllByText(/Required field missing/i)).not.toHaveLength(0);

    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0]?.exportPdf).toBe(true);
    expect(
      finalizeCalls[0]?.conversation?.fields?.project_name?.value
    ).toBe("Project Atlas");
  } finally {
    global.fetch = originalFetch;
  }
});
