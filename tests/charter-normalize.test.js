import { test } from "node:test";
import assert from "node:assert/strict";

import normalizeCharterServer from "../api/charter/normalize.js";
import { normalizeAjvErrors } from "../api/charter/validate.js";

test("normalizeCharterServer trims fields and normalizes collections", () => {
  const normalized = normalizeCharterServer({
    project_name: "  Launch Initiative  ",
    sponsor: "  Alice Example  ",
    project_lead: "  Bob Example  ",
    start_date: new Date("2024-01-05T12:00:00Z"),
    scope_in: ["  Discovery  ", "Discovery", "Execution"],
    scope_out: "  Rollout  ",
    assumptions: "Funding secured\nTeams assigned\n\nTeams assigned",
    milestones: [
      { phase: "  Phase 1  ", deliverable: "  Kickoff Deck  ", date: "2024-02-01" },
      { phase: "   ", deliverable: "   ", date: "   " },
      "Executive sign-off",
      null,
      42,
    ],
    success_metrics: [
      {
        benefit: "  Adoption  ",
        metric: "  Team usage  ",
        system_of_measurement: "  percent  ",
      },
      { benefit: "  ", metric: null, system_of_measurement: "" },
    ],
    core_team: [
      { name: "  Alex  ", role: "  PM  ", responsibilities: "  Lead rollout  " },
      { name: " ", role: " ", responsibilities: " " },
      "Taylor",
    ],
  });

  assert.strictEqual(normalized.project_name, "Launch Initiative");
  assert.strictEqual(normalized.sponsor, "Alice Example");
  assert.strictEqual(normalized.project_lead, "Bob Example");
  assert.strictEqual(normalized.start_date, "2024-01-05");
  assert.deepStrictEqual(normalized.scope_in, ["Discovery", "Execution"]);
  assert.deepStrictEqual(normalized.scope_out, ["Rollout"]);
  assert.deepStrictEqual(normalized.assumptions, ["Funding secured", "Teams assigned"]);
  assert.deepStrictEqual(normalized.milestones, [
    { phase: "Phase 1", deliverable: "Kickoff Deck", date: "2024-02-01" },
    { deliverable: "Executive sign-off" },
  ]);
  assert.deepStrictEqual(normalized.success_metrics, [
    { benefit: "Adoption", metric: "Team usage", system_of_measurement: "percent" },
  ]);
  assert.deepStrictEqual(normalized.core_team, [
    { name: "Alex", role: "PM", responsibilities: ["Lead rollout"] },
    { name: "Taylor" },
  ]);
});

test("normalizeCharterServer normalizes alias keys from extractor payloads", () => {
  const normalized = normalizeCharterServer({
    projectTitle: "Launch Beta",
    projectManager: "Jordan Example",
    sponsorName: "Casey Example",
    startDate: "2024-06-01",
    endDate: " 2024-12-31 ",
    scopeIn: "Discovery\nExecution\nExecution",
    scopeOut: ["Operations", " "],
    successMetrics: [
      {
        benefit: " Engagement ",
        metric: " Active users ",
        system_of_measurement: " percent ",
      },
    ],
  });

  assert.strictEqual(normalized.project_name, "Launch Beta");
  assert.strictEqual(normalized.project_lead, "Jordan Example");
  assert.strictEqual(normalized.sponsor, "Casey Example");
  assert.strictEqual(normalized.start_date, "2024-06-01");
  assert.strictEqual(normalized.end_date, "2024-12-31");
  assert.deepStrictEqual(normalized.scope_in, ["Discovery", "Execution"]);
  assert.deepStrictEqual(normalized.scope_out, ["Operations"]);
  assert.deepStrictEqual(normalized.success_metrics, [
    { benefit: "Engagement", metric: "Active users", system_of_measurement: "percent" },
  ]);
});

test("normalizeCharterServer supports snake_case aliases without overwriting canonical values", () => {
  const canonicalPreferred = normalizeCharterServer({
    project_name: "Launch Gamma",
    project_title: "Alias Title",
    project_lead: "Nina Example",
    project_manager: "Jordan Alias",
    success_metrics: [
      {
        benefit: "Activation",
        metric: "Daily actives",
        system_of_measurement: " Units ",
        systemOfMeasurement: " Percent ",
      },
    ],
  });

  assert.strictEqual(canonicalPreferred.project_name, "Launch Gamma");
  assert.strictEqual(canonicalPreferred.project_lead, "Nina Example");
  assert.deepStrictEqual(canonicalPreferred.success_metrics, [
    { benefit: "Activation", metric: "Daily actives", system_of_measurement: "Units" },
  ]);

  const aliasOnly = normalizeCharterServer({
    project_title: "Alias Title Only",
    project_manager: "Taylor Example",
    sponsor_name: "Morgan Example",
    project_sponsor: "Morgan Example",
    vision_statement: "  Broaden reach  ",
    success_metrics: [
      { benefit: "Engagement", metric: "Usage", systemOfMeasurement: " hours " },
    ],
  });

  assert.strictEqual(aliasOnly.project_name, "Alias Title Only");
  assert.strictEqual(aliasOnly.project_lead, "Taylor Example");
  assert.strictEqual(aliasOnly.sponsor, "Morgan Example");
  assert.strictEqual(aliasOnly.vision, "Broaden reach");
  assert.deepStrictEqual(aliasOnly.success_metrics, [
    { benefit: "Engagement", metric: "Usage", system_of_measurement: "hours" },
  ]);
});

test("normalizeAjvErrors trims messages and removes duplicates", () => {
  const errors = [
    { instancePath: "/scope_in/0", message: " must be string ", keyword: "type" },
    { dataPath: "/scope_in/0", message: " must be string ", keyword: "type" },
    {
      instancePath: "/project_name",
      message: " ",
      keyword: "minLength",
      params: { limit: 3 },
      schemaPath: "#/properties/project_name/minLength",
    },
  ];

  const normalized = normalizeAjvErrors(errors);

  assert.deepStrictEqual(normalized, [
    {
      instancePath: "/scope_in/0",
      message: "must be string",
      keyword: "type",
      params: undefined,
      schemaPath: undefined,
    },
    {
      instancePath: "/project_name",
      message: "is invalid",
      keyword: "minLength",
      params: { limit: 3 },
      schemaPath: "#/properties/project_name/minLength",
    },
  ]);
});
