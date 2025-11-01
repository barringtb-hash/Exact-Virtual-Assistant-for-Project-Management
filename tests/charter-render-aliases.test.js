import { test } from "node:test";
import assert from "node:assert/strict";

import { expandTemplateAliases } from "../api/charter/render.js";
import { validateCharterPayload } from "../api/charter/validate.js";

const BASE_CHARTER = {
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

function assertValid(result) {
  if (!result.isValid) {
    const messages = Array.isArray(result.errors)
      ? result.errors.map((error) => error.message || "invalid")
      : [];
    assert.fail(`expected payload to be valid but got errors: ${messages.join(", ")}`);
  }
}

test("expandTemplateAliases preserves canonical fields and copies known legacy keys", async () => {
  const legacyPayload = {
    ...BASE_CHARTER,
    project_name: "Launch Delta",
    project_lead: undefined,
    sponsor: undefined,
    success_metrics: undefined,
    core_team: undefined,
    projectManager: "Jordan Example",
    sponsor_name: "Morgan Example",
    successMetrics: [
      {
        benefit: "Activation",
        metric: "Daily actives",
        systemOfMeasurement: "percent",
      },
    ],
    coreTeam: [
      { name: "Taylor", role: "PM" },
      { role: "Engineering", responsibilities: "Ship MVP" },
    ],
  };

  delete legacyPayload.project_lead;
  delete legacyPayload.sponsor;
  delete legacyPayload.success_metrics;
  delete legacyPayload.core_team;

  const expanded = expandTemplateAliases(legacyPayload);

  assert.strictEqual(expanded.project_lead, "Jordan Example");
  assert.strictEqual(expanded.sponsor, "Morgan Example");
  assert.deepStrictEqual(expanded.success_metrics, legacyPayload.successMetrics);
  assert.deepStrictEqual(expanded.core_team, legacyPayload.coreTeam);

  const validation = await validateCharterPayload(expanded);
  assertValid(validation);

  assert.strictEqual(validation.normalized.project_lead, "Jordan Example");
  assert.strictEqual(validation.normalized.sponsor, "Morgan Example");
  assert.deepStrictEqual(validation.normalized.success_metrics, [
    {
      benefit: "Activation",
      metric: "Daily actives",
      system_of_measurement: "percent",
    },
  ]);
  assert.deepStrictEqual(validation.normalized.core_team, [
    { name: "Taylor", role: "PM" },
    { role: "Engineering", responsibilities: "Ship MVP" },
  ]);
});

test("expandTemplateAliases does not overwrite provided canonical values", async () => {
  const payload = {
    ...BASE_CHARTER,
    project_lead: "Avery Canonical",
    sponsor: "Jamie Canonical",
    scope_in: ["Discovery"],
    scope_out: ["Delivery"],
    projectManager: "Legacy Manager",
    sponsorName: "Legacy Sponsor",
    scopeOut: "Execution",
  };

  const expanded = expandTemplateAliases(payload);

  assert.strictEqual(expanded.project_lead, "Avery Canonical");
  assert.strictEqual(expanded.sponsor, "Jamie Canonical");
  assert.deepStrictEqual(expanded.scope_in, ["Discovery"]);
  assert.deepStrictEqual(expanded.scope_out, ["Delivery"]);

  const validation = await validateCharterPayload(expanded);
  assertValid(validation);
  assert.deepStrictEqual(validation.normalized.scope_in, ["Discovery"]);
  assert.deepStrictEqual(validation.normalized.scope_out, ["Delivery"]);
});
