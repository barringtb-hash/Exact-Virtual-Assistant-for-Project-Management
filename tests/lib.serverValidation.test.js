import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeCharterFormSchema } from "../lib/charter/serverFormSchema.js";
import { normalizeFormValues } from "../lib/forms/serverValidation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadJson(relativePath) {
  const absolutePath = path.resolve(__dirname, "..", relativePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw);
}

test("normalizeFormValues aligns with the charter schema", async (t) => {
  const rawSchema = await loadJson("templates/charter/formSchema.json");
  const schema = normalizeCharterFormSchema(rawSchema);
  const sampleCharter = await loadJson("samples/charter.smoke.json");

  await t.test("normalizes charter values and surfaces warnings", () => {
    const dirtyValues = {
      ...sampleCharter,
      project_name: "  Sample   Charter Smoke Test  ",
      vision: "Vision line one\r\nVision line two   ",
      start_date: "2025-01",
      scope_in: "  Discover requirements  \n\nImplement automation\n",
      risks: [" Limited availability  ", "Integration instability", "Integration instability"],
      success_metrics: [
        {
          benefit: "  Accelerate activation  ",
          metric: "Activation Rate  ",
          system_of_measurement: ">= 75%  ",
        },
        "Improve CSAT",
      ],
      core_team: [
        {
          name: "  Avery Chen  ",
          role: " Project Lead  ",
          responsibilities: "Coordinate delivery milestones  ",
        },
        "Jordan Rivera",
      ],
    };

    const { normalized, issues } = normalizeFormValues(schema, dirtyValues);

    assert.strictEqual(normalized.project_name, "Sample Charter Smoke Test");
    assert.strictEqual(normalized.vision, "Vision line one\nVision line two");
    assert.strictEqual(normalized.start_date, "2025-01-01");

    assert.deepStrictEqual(normalized.scope_in, [
      "Discover requirements",
      "Implement automation",
    ]);
    assert.deepStrictEqual(normalized.risks, [
      "Limited availability",
      "Integration instability",
    ]);

    assert.deepStrictEqual(normalized.success_metrics, [
      {
        benefit: "Accelerate activation",
        metric: "Activation Rate",
        system_of_measurement: ">= 75%",
      },
      { metric: "Improve CSAT" },
    ]);

    assert.deepStrictEqual(normalized.core_team, [
      {
        name: "Avery Chen",
        role: "Project Lead",
        responsibilities: "Coordinate delivery milestones",
      },
      { name: "Jordan Rivera" },
    ]);

    assert.deepStrictEqual(Object.keys(issues).sort(), ["start_date"]);
    assert.ok(Array.isArray(issues.start_date));
    assert.strictEqual(issues.start_date[0].code, "inferred-date");
    assert.strictEqual(issues.start_date[0].severity, "warning");
  });

  await t.test("applies visibility rules before validation", () => {
    const schemaWithVisibility = {
      ...schema,
      fields: schema.fields.map((field) =>
        field.id === "scope_out"
          ? {
              ...field,
              required: true,
              visibility: {
                when: { field: "project_name", equals: "Show hidden field" },
              },
            }
          : field
      ),
    };

    const hiddenResult = normalizeFormValues(schemaWithVisibility, {
      ...sampleCharter,
      project_name: "Sample Charter Smoke Test",
      scope_out: [],
    });
    assert.strictEqual(hiddenResult.issues.scope_out, undefined);

    const visibleResult = normalizeFormValues(schemaWithVisibility, {
      ...sampleCharter,
      project_name: "Show hidden field",
      scope_out: [],
    });
    assert.ok(Array.isArray(visibleResult.issues.scope_out));
    assert.strictEqual(visibleResult.issues.scope_out[0].code, "required");
    assert.strictEqual(visibleResult.issues.scope_out[0].severity, "error");
  });
});
