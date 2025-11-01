import { test } from "node:test";
import assert from "node:assert/strict";

import handler from "../api/charter/render.js";
import Docxtemplater from "docxtemplater";

const VALID_CHARTER = {
  project_name: "AI Launch",
  sponsor: "Alice Example",
  project_lead: "Bob Example",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  vision: "Deliver an AI assistant to every PM team.",
  problem: "Teams lack a centralized intake workflow.",
  description: "Initial charter generated from unit tests.",
  scope_in: ["Research", "Pilot", "Rollout"],
  scope_out: ["Hardware procurement"],
  risks: ["Integration delays"],
  assumptions: ["Executive sponsorship confirmed"],
  milestones: [
    {
      phase: "Discovery",
      deliverable: "Pilot findings",
      date: "2024-04-15",
    },
  ],
  success_metrics: [
    {
      benefit: "Adoption",
      metric: "Department adoption rate",
      system_of_measurement: "percent",
    },
  ],
  core_team: [
    { name: "Sam", role: "Sponsor" },
    { name: "Taylor", role: "PM" },
  ],
};

function createResponseCollector() {
  return {
    statusCode: 200,
    sentAs: undefined,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.sentAs = "json";
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    send(payload) {
      this.sentAs = "buffer";
      this.body = payload;
      return this;
    },
  };
}

test("render handler reports unresolved template tags", async (t) => {
  const previousFactory = Docxtemplater.__documentXmlFactory;
  Docxtemplater.__setDocumentXmlFactory(() =>
    "<w:document><w:p>{{missing_tag}}</w:p></w:document>"
  );
  t.after(() => {
    Docxtemplater.__setDocumentXmlFactory(previousFactory);
  });

  const req = { method: "POST", body: VALID_CHARTER };
  const res = createResponseCollector();

  await handler(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.sentAs, "json");
  assert.ok(res.body?.error);
  assert.strictEqual(res.body.error.code, "invalid_charter_payload");
  assert.match(String(res.body.error.details), /missing_tag/);

  assert.ok(Array.isArray(res.body.errors));
  assert.strictEqual(res.body.errors.length, 1);
  const [error] = res.body.errors;
  assert.strictEqual(error.keyword, "unresolved_template_tag");
  assert.strictEqual(error.params?.tag, "missing_tag");
  assert.match(error.message, /missing_tag/);
});

test("render handler lists all unresolved template tags", async (t) => {
  const previousFactory = Docxtemplater.__documentXmlFactory;
  Docxtemplater.__setDocumentXmlFactory(() =>
    "<w:document>{{first_tag}}<w:p>{{second_tag}}</w:p>{{first_tag}}</w:document>"
  );
  t.after(() => {
    Docxtemplater.__setDocumentXmlFactory(previousFactory);
  });

  const req = { method: "POST", body: VALID_CHARTER };
  const res = createResponseCollector();

  await handler(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.sentAs, "json");
  assert.ok(Array.isArray(res.body.errors));
  assert.strictEqual(res.body.errors.length, 2);

  const tags = new Set(res.body.errors.map((item) => item.params?.tag));
  assert.deepStrictEqual(tags, new Set(["first_tag", "second_tag"]));

  const details = res.body.error?.details;
  if (Array.isArray(details)) {
    const detailTags = new Set(
      details
        .filter((item) => typeof item === "string")
        .flatMap((item) => {
          const matches = item.match(/{{\s*([^{}]+?)\s*}}/g) || [];
          return matches.map((fragment) =>
            fragment.replace(/^{{\s*|\s*}}$/g, "")
          );
        })
    );
    assert.deepStrictEqual(detailTags, new Set(["first_tag", "second_tag"]));
  } else {
    assert.fail("expected multiple detail messages for unresolved tags");
  }
});
