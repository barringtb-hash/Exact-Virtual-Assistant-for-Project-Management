import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  sanitizeFieldValue,
  normalizeExtractedFields,
} from "./extractFieldsFromUtterance.ts";
import {
  CHARTER_FIELDS,
  type CharterField,
  type CharterFieldId,
} from "../../src/features/charter/schema.ts";

describe("sanitizeFieldValue", () => {
  it("trims whitespace for simple string fields and returns normalized values", () => {
    const field = { ...CHARTER_FIELDS.find((item) => item.id === "project_name")! };

    const result = sanitizeFieldValue(field, "  Apollo  ");

    assert.equal(result.value, "Apollo");
    assert.deepEqual(result.issues, []);
  });

  it("rejects invalid dates with an error issue", () => {
    const field = {
      ...CHARTER_FIELDS.find((item) => item.id === "start_date")!,
    };

    const result = sanitizeFieldValue(field, "2024-02-30");

    assert.equal(result.value, undefined);
    assert.deepEqual(result.issues, [
      {
        code: "validation_failed",
        message: "Enter a valid date in YYYY-MM-DD format.",
        fieldId: field.id,
        details: { rawValue: "2024-02-30" },
        level: "error",
      },
    ]);
  });

  it("deduplicates normalized string lists and surfaces validation warnings", () => {
    const field: CharterField = {
      ...CHARTER_FIELDS.find((item) => item.id === "scope_in")!,
      maxLength: 5,
    };

    const rawValue = ["  Alpha  ", "Alpha", "Longer", ""];

    const result = sanitizeFieldValue(field, rawValue);

    assert.deepEqual(result.value, ["Alpha"]);
    assert.deepEqual(result.issues, [
      {
        code: "validation_failed",
        message: "Enter 5 characters or fewer.",
        fieldId: field.id,
        details: { entry: "Longer", rawValue },
        level: "warning",
      },
    ]);
  });

  it("enforces required list fields when no valid values remain", () => {
    const field: CharterField = {
      ...CHARTER_FIELDS.find((item) => item.id === "risks")!,
      required: true,
    };

    const rawValue: unknown[] = [];

    const result = sanitizeFieldValue(field, rawValue);

    assert.equal(result.value, undefined);
    assert.deepEqual(result.issues, [
      {
        code: "missing_required",
        message: "This field is required.",
        fieldId: field.id,
        details: { rawValue },
        level: "error",
      },
    ]);
  });

  it("coerces alias keys within object list entries", () => {
    const field = {
      ...CHARTER_FIELDS.find((item) => item.id === "success_metrics")!,
    };

    const rawValue = [
      {
        benefit: "  Increase revenue  ",
        metric: " Reduce churn ",
        systemOfMeasurement: " Hours ",
      },
    ];

    const result = sanitizeFieldValue(field, rawValue);

    assert.deepEqual(result.value, [
      {
        benefit: "Increase revenue",
        metric: "Reduce churn",
        system_of_measurement: "Hours",
      },
    ]);
    assert.deepEqual(result.issues, []);
  });

  it("flags invalid child values while preserving valid object entries", () => {
    const field = {
      ...CHARTER_FIELDS.find((item) => item.id === "milestones")!,
    };

    const rawValue = [
      {
        phase: "  Planning  ",
        deliverable: " Kickoff Deck ",
        date: "2024-03-01",
      },
      {
        phase: "Execution",
        deliverable: "Deployment",
        date: "2024-15-40",
      },
      {
        phase: "Closure",
        deliverable: "Summary",
        date: "2024-06-30",
      },
    ];

    const result = sanitizeFieldValue(field, rawValue);

    assert.deepEqual(result.value, [
      {
        phase: "Planning",
        deliverable: "Kickoff Deck",
        date: "2024-03-01",
      },
      {
        phase: "Execution",
        deliverable: "Deployment",
      },
      {
        phase: "Closure",
        deliverable: "Summary",
        date: "2024-06-30",
      },
    ]);
    assert.deepEqual(result.issues, [
      {
        code: "validation_failed",
        message: "Target Date: Enter a valid date in YYYY-MM-DD format.",
        fieldId: field.id,
        details: { child: "date", value: "2024-15-40" },
        level: "warning",
      },
    ]);
  });
});

describe("normalizeExtractedFields", () => {
  const scopeField = CHARTER_FIELDS.find((item) => item.id === "scope_in");
  const startField = CHARTER_FIELDS.find((item) => item.id === "start_date");

  afterEach(() => {
    if (scopeField) {
      scopeField.maxLength = null;
    }
    if (startField) {
      startField.required = true;
    }
  });

  it("returns normalized values while splitting warnings and errors", () => {
    if (!scopeField || !startField) {
      throw new Error("Expected charter fields to be defined");
    }

    const originalRequired = startField.required;
    const originalMaxLength = scopeField.maxLength;
    startField.required = true;
    scopeField.maxLength = 5;

    const parsedArguments: Record<string, unknown> = {
      project_name: "  Apollo Initiative  ",
      scope_in: ["Alpha", "Alpha", "Longer"],
      start_date: "2024-13-01",
    };
    const requestedFieldIds: CharterFieldId[] = [
      "project_name",
      "scope_in",
      "start_date",
      "end_date",
    ];

    const result = normalizeExtractedFields(parsedArguments, requestedFieldIds);

    assert.deepEqual(result.fields, {
      project_name: "Apollo Initiative",
      scope_in: ["Alpha"],
    });
    assert.deepEqual(result.warnings, [
      {
        code: "validation_failed",
        message: "Enter 5 characters or fewer.",
        fieldId: "scope_in",
        details: { entry: "Longer", rawValue: parsedArguments.scope_in },
        level: "warning",
      },
    ]);
    assert.deepEqual(result.errors, [
      {
        code: "validation_failed",
        message: "Enter a valid date in YYYY-MM-DD format.",
        fieldId: "start_date",
        details: { rawValue: "2024-13-01" },
        level: "error",
      },
      {
        code: "missing_required",
        message: "Required field was omitted from the tool output.",
        fieldId: "end_date",
        level: "error",
      },
    ]);

    startField.required = originalRequired;
    scopeField.maxLength = originalMaxLength;
  });
});
