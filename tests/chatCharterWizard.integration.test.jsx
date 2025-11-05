import test from "node:test";
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import CharterFieldSession from "../src/chat/CharterFieldSession.tsx";
import { normalizeCharterFormSchema } from "../src/lib/charter/formSchema.ts";
import { conversationActions } from "../src/state/conversationStore.ts";
import { FIELD_METRIC_HEADER } from "../lib/telemetry/fieldMetrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "fixtures/conversation/simple-schema.json");

async function loadSchema() {
  const raw = await readFile(schemaPath, "utf8");
  return normalizeCharterFormSchema(JSON.parse(raw));
}

test("charter field session captures and reviews responses", async () => {
  const schema = await loadSchema();
  const originalFetch = global.fetch;
  const telemetryRequests = [];
  global.fetch = async (input, init = {}) => {
    telemetryRequests.push({ input, init });
    return {
      ok: true,
      status: 204,
      text: async () => "",
      json: async () => ({ ok: true }),
    };
  };

  try {
    conversationActions.reset();
    conversationActions.ensureSession(schema);

    render(<CharterFieldSession visible />);

    const user = userEvent.setup();

    const nameTextarea = await screen.findByRole("textbox", { name: "Project name" });
    await user.type(nameTextarea, "Project Atlas");
    await user.click(screen.getByRole("button", { name: "Save response" }));

    await screen.findByText(/Confirm response for Project name/i);
    await user.click(screen.getByRole("button", { name: "Confirm value" }));

    await screen.findByText(/Saved Project name/i);
    await user.click(screen.getByRole("button", { name: "Next field" }));

    const summaryTextarea = await screen.findByRole("textbox", { name: "Executive summary" });
    await user.type(summaryTextarea, "Outline the key milestones and benefits.");
    await user.click(screen.getByRole("button", { name: "Save response" }));

    await screen.findByText(/Confirm response for Executive summary/i);
    await user.click(screen.getByRole("button", { name: "Confirm value" }));

    await screen.findByText(/Saved Executive summary/i);
    await user.click(screen.getByRole("button", { name: "Next field" }));

    await screen.findByText(/Key risks/i);
    await user.click(screen.getByRole("button", { name: "Skip field" }));

    await screen.findByText(/Review the captured responses/i);

    const reviewList = screen.getByRole("list");
    const items = within(reviewList).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Project name");
    expect(items[1]).toHaveTextContent("Executive summary");
    expect(items[2]).toHaveTextContent("Key risks");

    await user.click(screen.getByRole("button", { name: "Finalize charter" }));

    await screen.findByText(/Charter conversation finalized/i);

    await waitFor(() => {
      expect(telemetryRequests.length).toBeGreaterThan(0);
    });

    const lastRequest = telemetryRequests[telemetryRequests.length - 1];
    expect(lastRequest.input).toBe("/api/telemetry/conversation");
    const payload = JSON.parse(lastRequest.init?.body ?? "{}");
    expect(payload.header).toEqual(FIELD_METRIC_HEADER);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(payload.rows).toHaveLength(3);
    const fieldIdIndex = FIELD_METRIC_HEADER.indexOf("field_id");
    const completionIndex = FIELD_METRIC_HEADER.indexOf("completion_status");
    const skipReasonsIndex = FIELD_METRIC_HEADER.indexOf("skip_reasons");
    const rowsByField = Object.fromEntries(
      payload.rows.map((row) => [row[fieldIdIndex], row])
    );
    expect(Object.keys(rowsByField)).toEqual([
      "project_name",
      "executive_summary",
      "risks",
    ]);
    expect(rowsByField.project_name[completionIndex]).toBe("confirmed");
    expect(rowsByField.executive_summary[completionIndex]).toBe("confirmed");
    expect(rowsByField.risks[completionIndex]).toBe("skipped");
    expect(rowsByField.risks[skipReasonsIndex]).toBe("user-skipped:1");
    const serializedRows = JSON.stringify(payload.rows);
    expect(serializedRows).not.toContain("Project Atlas");
    expect(serializedRows).not.toContain("Outline the key milestones");
  } finally {
    global.fetch = originalFetch;
  }
});
