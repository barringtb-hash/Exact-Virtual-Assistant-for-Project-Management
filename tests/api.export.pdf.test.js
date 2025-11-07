/**
---
scenario: Api Export Pdf Test
feature: unknown
subsystem: unknown
envs: []
risk: unknown
owner: TBD
ci_suites: []
flaky: false
needs_review: true
preconditions:
  - TBD
data_setup: TBD
refs: []
---
*/

import test from "node:test";
import assert from "node:assert/strict";

import { renderPdfBuffer } from "../api/export/pdf.js";

const minimalCharter = {
  project_name: "PDF Smoke Test Project",
  sponsor: "Jane Sponsor",
  project_lead: "John Lead",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  vision: "Deliver a minimal viable PDF output.",
  problem: "Need to confirm PDF generation runs without error.",
  description: "This charter is used to verify PDF rendering.",
};

test("renderPdfBuffer returns a PDF buffer", async () => {
  const buf = await renderPdfBuffer(minimalCharter);

  assert.ok(Buffer.isBuffer(buf), "expected a Node.js Buffer");
  assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
});
