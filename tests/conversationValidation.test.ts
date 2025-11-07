/**
---
scenario: ConversationValidation Test
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyConversationEvent,
  createConversationState,
  type ConversationState,
} from "../src/state/conversationMachine.ts";
import {
  createFormValidator,
  normalizeFormValues,
  type CharterFormField,
  type CharterFormSchema,
} from "../src/lib/forms/validation.ts";

const TEST_SCHEMA: CharterFormSchema = {
  document_type: "charter",
  version: "test-1",
  fields: [
    {
      id: "title",
      label: "Project title",
      help_text: null,
      required: true,
      type: "string",
      options: [],
      max_length: 120,
      pattern: null,
      placeholder: null,
      example: null,
      visibility: null,
    },
    {
      id: "code",
      label: "Tracking code",
      help_text: null,
      required: false,
      type: "string",
      options: [],
      max_length: 12,
      pattern: "^[A-Z]{3}-\\d{3}$",
      placeholder: null,
      example: null,
      visibility: null,
    },
    {
      id: "toggle",
      label: "Include details",
      help_text: null,
      required: false,
      type: "string",
      options: ["yes", "no"],
      max_length: null,
      pattern: null,
      placeholder: null,
      example: null,
      visibility: null,
    },
    {
      id: "detail",
      label: "Hidden detail",
      help_text: null,
      required: true,
      type: "string",
      options: [],
      max_length: 200,
      pattern: null,
      placeholder: null,
      example: null,
      visibility: {
        when: [{ field: "toggle", equals: "yes" }],
      },
    },
    {
      id: "start",
      label: "Start date",
      help_text: null,
      required: true,
      type: "date",
      options: [],
      max_length: null,
      pattern: null,
      placeholder: null,
      example: null,
      visibility: null,
    },
    {
      id: "items",
      label: "Checklist",
      help_text: null,
      required: false,
      type: "string_list",
      options: [],
      max_length: null,
      pattern: null,
      placeholder: null,
      example: null,
      visibility: null,
    },
  ],
};

function getField(schema: CharterFormSchema, id: string): CharterFormField {
  const found = schema.fields.find((field) => field.id === id);
  if (!found) {
    throw new Error(`Field ${id} not found`);
  }
  return found;
}

test("form validator accepts and normalizes valid values", () => {
  const validator = createFormValidator(TEST_SCHEMA);
  const titleField = getField(TEST_SCHEMA, "title");
  const titleResult = validator.validateField(titleField, "   Apollo   ");
  assert.equal(titleResult.status, "valid");
  assert.equal(titleResult.normalized.text, "Apollo");
  assert.equal(titleResult.issues.length, 0);

  const dateField = getField(TEST_SCHEMA, "start");
  const dateResult = validator.validateField(dateField, "2024/01/15");
  assert.equal(dateResult.status, "valid");
  assert.equal(dateResult.normalized.structured, "2024-01-15");

  const listField = getField(TEST_SCHEMA, "items");
  const listResult = validator.validateField(listField, "Alpha\nBeta  \nBeta");
  assert.equal(listResult.status, "valid");
  assert.deepEqual(listResult.normalized.structured, ["Alpha", "Beta"]);
});

test("regex validation produces a structured error", () => {
  const validator = createFormValidator(TEST_SCHEMA);
  const field = getField(TEST_SCHEMA, "code");
  const result = validator.validateField(field, "abc-123");
  assert.equal(result.status, "invalid");
  assert.equal(result.issues[0]?.code, "pattern");
});

test("normalizeFormValues yields consistent data", () => {
  const { normalized, issues } = normalizeFormValues(TEST_SCHEMA, {
    title: "  Lunar Mission  ",
    code: "ABC-123",
    toggle: "yes",
    detail: "Detailed plan",
    start: "2024-02",
    items: "One\nTwo",
  });
  assert.equal(normalized.title, "Lunar Mission");
  assert.equal(normalized.code, "ABC-123");
  assert.equal(normalized.detail, "Detailed plan");
  assert.equal(normalized.start, "2024-02-01");
  assert.deepEqual(normalized.items, ["One", "Two"]);
  assert.equal(Object.keys(issues).length, 1);
  assert.equal(issues.start[0]?.code, "inferred-date");
});

test("conversation validation escalates after repeated failures", () => {
  const schema = TEST_SCHEMA;
  let state: ConversationState = createConversationState(schema);
  state = applyConversationEvent(schema, state, { type: "INIT" }).state;

  let result = applyConversationEvent(
    schema,
    state,
    { type: "VALIDATE", fieldId: "title" },
    { maxValidationAttempts: 2 },
  );
  state = result.state;
  assert.equal(state.fields.title.issues[0]?.code, "required");
  assert.equal(result.actions[0]?.type, "VALIDATION_ERROR");
  assert.equal(result.actions[0]?.escalated, false);

  result = applyConversationEvent(
    schema,
    state,
    { type: "VALIDATE", fieldId: "title" },
    { maxValidationAttempts: 2 },
  );
  state = result.state;
  assert.equal(state.fields.title.reaskCount, 2);
  assert.equal(state.fields.title.status, "skipped");
  assert.equal(state.fields.title.skippedReason, "validation-max-attempts");
  assert.equal(state.fields.title.value, "");
  const validationAction = result.actions[0];
  assert.equal(validationAction?.type, "VALIDATION_ERROR");
  assert.equal(validationAction?.escalated, true);
  const skippedAction = result.actions.find((action) => action?.type === "FIELD_SKIPPED");
  assert.equal(skippedAction?.type, "FIELD_SKIPPED");
  assert.equal(skippedAction?.field.id, "title");
  assert.equal(skippedAction?.reason, "validation-max-attempts");
  const askAction = result.actions.find((action) => action?.type === "ASK_FIELD");
  assert.equal(askAction?.field.id, "code");
});

test("conditional visibility skips hidden fields", () => {
  const schema = TEST_SCHEMA;
  let state: ConversationState = createConversationState(schema);

  state = applyConversationEvent(schema, state, { type: "INIT" }).state;
  state = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "title",
    value: "Orion",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "title",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "title",
  }).state;

  state = applyConversationEvent(schema, state, { type: "NEXT_FIELD" }).state;
  state = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "toggle",
    value: "no",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "toggle",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "toggle",
  }).state;

  const next = applyConversationEvent(schema, state, { type: "NEXT_FIELD" });
  state = next.state;
  const skipAction = next.actions.find((action) => action?.type === "FIELD_SKIPPED");
  assert.equal(skipAction?.field.id, "detail");
  assert.equal(state.fields.detail.status, "skipped");
  assert.equal(state.fields.detail.skippedReason, "hidden");
});
