/**
 * Charter Schema Alignment Tests
 *
 * These tests verify that the charter field definitions stay in sync across:
 * 1. The DOCX template (project_charter_tokens.docx)
 * 2. The form schema (formSchema.json)
 * 3. The TypeScript schema (schema.ts via extraction)
 *
 * This prevents drift between these sources and ensures template-driven extraction.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  extractTokensFromFile,
  compareTokensToSchema,
} from "../server/charter/utils/templateTokenParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(PROJECT_ROOT, "templates");

async function loadFormSchema() {
  const schemaPath = path.join(TEMPLATES_DIR, "charter", "formSchema.json");
  const content = await fs.readFile(schemaPath, "utf8");
  return JSON.parse(content);
}

test("formSchema.json has all required fields with questions", async () => {
  const schema = await loadFormSchema();

  assert.ok(schema.fields, "Schema should have a fields array");
  assert.ok(Array.isArray(schema.fields), "fields should be an array");
  assert.ok(schema.fields.length > 0, "Schema should have at least one field");

  const requiredProperties = ["id", "label", "type", "required"];

  for (const field of schema.fields) {
    for (const prop of requiredProperties) {
      assert.ok(
        field[prop] !== undefined,
        `Field ${field.id || "unknown"} should have ${prop}`
      );
    }

    // Verify question field exists (needed for extraction)
    assert.ok(
      typeof field.question === "string" && field.question.length > 0,
      `Field ${field.id} should have a question for extraction`
    );
  }
});

test("formSchema.json field IDs match expected charter fields", async () => {
  const schema = await loadFormSchema();
  const fieldIds = schema.fields.map((f) => f.id);

  const expectedFields = [
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

  assert.deepStrictEqual(
    fieldIds,
    expectedFields,
    "Form schema field IDs should match expected charter fields in order"
  );
});

test("object_list fields have child field definitions", async () => {
  const schema = await loadFormSchema();
  const objectListFields = schema.fields.filter((f) => f.type === "object_list");

  for (const field of objectListFields) {
    assert.ok(
      Array.isArray(field.fields) && field.fields.length > 0,
      `Object list field ${field.id} should have child field definitions`
    );

    for (const child of field.fields) {
      assert.ok(child.id, `Child field in ${field.id} should have an id`);
      assert.ok(child.label, `Child field in ${field.id} should have a label`);
      assert.ok(child.type, `Child field in ${field.id} should have a type`);
    }
  }
});

test("DOCX template tokens align with formSchema.json", async () => {
  const templatePath = path.join(TEMPLATES_DIR, "project_charter_tokens.docx.b64");
  const schema = await loadFormSchema();

  const tokens = await extractTokensFromFile(templatePath);
  const comparison = compareTokensToSchema(tokens, schema);

  // All schema fields should be in the template
  assert.deepStrictEqual(
    comparison.missingInTemplate,
    [],
    `Schema fields missing in template: ${comparison.missingInTemplate.join(", ")}`
  );

  // All template tokens should be in the schema (except loop control tokens)
  assert.deepStrictEqual(
    comparison.missingInSchema,
    [],
    `Template tokens not in schema: ${comparison.missingInSchema.join(", ")}`
  );

  // No loop structure mismatches
  if (comparison.loopMismatches.length > 0) {
    const mismatchDetails = comparison.loopMismatches
      .map((m) => `${m.field}: missing=[${m.missingChildren}], extra=[${m.extraChildren}]`)
      .join("; ");
    assert.fail(`Loop child mismatches: ${mismatchDetails}`);
  }
});

test("milestones field has correct child structure", async () => {
  const schema = await loadFormSchema();
  const milestones = schema.fields.find((f) => f.id === "milestones");

  assert.ok(milestones, "Schema should have milestones field");
  assert.strictEqual(milestones.type, "object_list");

  const childIds = milestones.fields.map((f) => f.id);
  assert.deepStrictEqual(
    childIds,
    ["phase", "deliverable", "date"],
    "Milestones should have phase, deliverable, and date children"
  );
});

test("success_metrics field has correct child structure", async () => {
  const schema = await loadFormSchema();
  const metrics = schema.fields.find((f) => f.id === "success_metrics");

  assert.ok(metrics, "Schema should have success_metrics field");
  assert.strictEqual(metrics.type, "object_list");

  const childIds = metrics.fields.map((f) => f.id);
  assert.deepStrictEqual(
    childIds,
    ["benefit", "metric", "system_of_measurement"],
    "Success metrics should have benefit, metric, and system_of_measurement children"
  );
});

test("core_team field has correct child structure", async () => {
  const schema = await loadFormSchema();
  const team = schema.fields.find((f) => f.id === "core_team");

  assert.ok(team, "Schema should have core_team field");
  assert.strictEqual(team.type, "object_list");

  const childIds = team.fields.map((f) => f.id);
  assert.deepStrictEqual(
    childIds,
    ["name", "role", "responsibilities"],
    "Core team should have name, role, and responsibilities children"
  );
});

test("required fields are marked correctly", async () => {
  const schema = await loadFormSchema();

  const expectedRequired = [
    "project_name",
    "sponsor",
    "project_lead",
    "start_date",
    "end_date",
    "vision",
    "problem",
    "description",
  ];

  const actualRequired = schema.fields.filter((f) => f.required).map((f) => f.id);

  assert.deepStrictEqual(
    actualRequired,
    expectedRequired,
    "Required fields should match expected list"
  );
});

test("schema version is updated", async () => {
  const schema = await loadFormSchema();

  assert.ok(schema.version, "Schema should have a version");
  assert.strictEqual(
    schema.version,
    "2024.11",
    "Schema version should be 2024.11 after adding question fields"
  );
});
