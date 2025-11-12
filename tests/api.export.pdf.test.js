import test from "node:test";
import assert from "node:assert/strict";

import handler, { renderPdfBuffer } from "../api/export/pdf.js";
import { createMockResponse } from "./helpers/http.js";

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

test("/api/export/pdf returns a PDF attachment for valid charters", async () => {
  const res = createMockResponse();

  await handler(
    {
      method: "POST",
      body: minimalCharter,
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert(Buffer.isBuffer(res.body));
  assert.equal(res.body.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.equal(res.headers["content-type"], "application/pdf");
  assert.match(res.headers["content-disposition"] || "", /project_charter\.pdf/);
});

test("/api/export/pdf responds with 400 for malformed payloads", async () => {
  const res = createMockResponse();

  await handler(
    {
      method: "POST",
      body: "{ not valid json",
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["content-type"], "application/json");
  assert.match(String(res.body?.error || ""), /charter schema/i);
});
