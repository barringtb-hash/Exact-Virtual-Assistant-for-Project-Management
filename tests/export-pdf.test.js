import { test } from "node:test";
import assert from "node:assert/strict";

import { renderPdfBuffer } from "../api/export/pdf.js";

const MINIMAL_CHARTER = {
  project_name: "Test Project",
  sponsor: "Sponsor Example",
  project_lead: "Lead Example",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  vision: "Deliver value quickly.",
  problem: "Teams lack coordination.",
  description: "A concise charter used for testing PDF rendering.",
  scope_in: ["Planning"],
  scope_out: ["Manufacturing"],
  risks: ["Schedule slips"],
  assumptions: ["Budget approved"],
  milestones: [
    { phase: "Kickoff", deliverable: "Project kickoff", date: "2024-01-05" },
  ],
  success_metrics: [
    {
      benefit: "Adoption",
      metric: "Team onboarding",
      system_of_measurement: "count",
    },
  ],
  core_team: [
    { name: "Jordan", role: "PM", responsibilities: "Coordinate execution" },
  ],
};

test("renderPdfBuffer returns a PDF payload", async () => {
  const buffer = await renderPdfBuffer(MINIMAL_CHARTER);

  assert.ok(Buffer.isBuffer(buffer), "Expected a Buffer response");
  assert.strictEqual(
    buffer.subarray(0, 5).toString("utf8"),
    "%PDF-",
    "PDF output should start with %PDF-"
  );
  assert.ok(
    buffer.length > 1024,
    `Expected PDF to be comfortably larger than 1KB, received ${buffer.length} bytes`
  );
});
