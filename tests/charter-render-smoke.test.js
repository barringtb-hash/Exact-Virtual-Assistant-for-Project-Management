/**
---
scenario: Charter Render Smoke Test
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
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { renderDocxBuffer } from "../api/charter/render.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const samplePath = path.join(projectRoot, "samples", "charter.smoke.json");

test("renderDocxBuffer generates a DOCX for the smoke payload", async () => {
  const payloadRaw = await fs.readFile(samplePath, "utf8");
  const payload = JSON.parse(payloadRaw);

  const buffer = await renderDocxBuffer(payload);

  assert.ok(Buffer.isBuffer(buffer), "renderDocxBuffer should return a Buffer");
  assert.ok(buffer.length > 0, "Rendered DOCX should not be empty");
});
