import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";

import renderHandler from "../api/documents/render.js";
import { createMockResponse } from "./helpers/http.js";

const projectRoot = process.cwd();
const sampleCharterPath = path.join(projectRoot, "samples", "charter.smoke.json");
const sampleCharter = JSON.parse(await fs.readFile(sampleCharterPath, "utf8"));

test("/api/documents/render returns a DOCX buffer for charter payloads", async () => {
  const res = createMockResponse();

  await renderHandler(
    {
      method: "POST",
      query: { docType: "charter" },
      body: { document: sampleCharter },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert(Buffer.isBuffer(res.body));
  assert(res.body.length > 0);
  assert.equal(
    res.headers["content-type"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.match(res.headers["content-disposition"] || "", /project_charter\.docx/);

  const marker = Buffer.from("word/document.xml", "utf8");
  assert(res.body.includes(marker));
});

