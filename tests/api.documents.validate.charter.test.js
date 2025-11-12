import test from "node:test";
import assert from "node:assert/strict";

import validateHandler from "../api/documents/validate.js";
import { createMockResponse } from "./helpers/http.js";

const VALID_CHARTER = {
  project_name: "Sample Charter",
  sponsor: "Jordan Rivera",
  project_lead: "Avery Chen",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  vision: "Deliver a guided onboarding experience.",
  problem: "Teams lack a centralized intake workflow.",
  description: "Project charter generated from automated tests.",
};

test("/api/documents/validate accepts valid charter payloads", async () => {
  const res = createMockResponse();

  await validateHandler(
    {
      method: "POST",
      query: { docType: "charter" },
      body: { document: VALID_CHARTER },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.docType, "charter");
  assert.equal(res.body?.normalized?.project_name, VALID_CHARTER.project_name);
});

test("/api/documents/validate surfaces structured charter errors", async () => {
  const res = createMockResponse();

  await validateHandler(
    {
      method: "POST",
      query: { docType: "charter" },
      body: { document: { project_name: "x" } },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert(Array.isArray(res.body?.errors));
  assert(res.body.errors.length > 0);
  const missingFields = new Set(
    res.body.errors
      .filter((error) => error?.instancePath?.startsWith("/"))
      .map((error) => error.instancePath.slice(1))
  );
  assert(missingFields.has("sponsor"));
  assert.equal(res.body?.normalized?.project_name, "x");
});

