import assert from "node:assert/strict";
import test from "node:test";

import {
  CHARTER_FORM_SCHEMA_PATH,
  createCharterFieldLookup,
  getCharterFieldOrder,
  getRequiredCharterFieldIds,
  loadCharterFormSchema,
} from "../src/features/charter/utils/formSchema.ts";

const EXPECTED_FIELD_ORDER = [
  "project_name",
  "sponsor",
  "project_lead",
  "start_date",
  "end_date",
  "vision",
  "problem",
  "description",
  "scope_in",
  "scope_out",
  "risks",
  "assumptions",
  "milestones",
  "success_metrics",
  "core_team",
];

const EXPECTED_REQUIRED_FIELDS = [
  "project_name",
  "sponsor",
  "project_lead",
  "start_date",
  "end_date",
  "vision",
  "problem",
  "description",
];

test("charter form schema loads from templates", async () => {
  const schema = await loadCharterFormSchema();

  assert.equal(schema.document_type, "charter", "document type should be charter");
  assert.ok(schema.version, "schema should include a version");
  assert.equal(
    getCharterFieldOrder(schema).join(","),
    EXPECTED_FIELD_ORDER.join(","),
    "field order should match approved top-to-bottom sequence"
  );
  assert.deepEqual(
    getRequiredCharterFieldIds(schema),
    EXPECTED_REQUIRED_FIELDS,
    "required fields should align with schema definition"
  );
});

test("charter form schema exposes visibility metadata", async () => {
  const schema = await loadCharterFormSchema(CHARTER_FORM_SCHEMA_PATH);
  const lookup = createCharterFieldLookup(schema);

  for (const fieldId of EXPECTED_FIELD_ORDER) {
    const field = lookup.get(fieldId);
    assert.ok(field, `field ${fieldId} should exist in schema`);
    assert.equal(
      field.visibility,
      null,
      `field ${fieldId} should default to no visibility constraints`
    );
  }

  const milestones = lookup.get("milestones");
  assert.ok(milestones?.fields, "milestones should expose nested field definitions");
  assert.deepEqual(
    milestones.fields?.map((child) => child.id),
    ["phase", "deliverable", "date"],
    "milestones nested field order should be preserved"
  );
});
