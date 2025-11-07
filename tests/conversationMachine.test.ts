/**
---
scenario: ConversationMachine Test
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
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyConversationEvent,
  createConversationState,
  type ConversationState,
} from "../src/state/conversationMachine.ts";
import { normalizeCharterFormSchema } from "../src/lib/charter/formSchema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures", "conversation");

async function loadSchema() {
  const raw = await readFile(path.join(fixturesDir, "simple-schema.json"), "utf8");
  return normalizeCharterFormSchema(JSON.parse(raw));
}

test("conversation machine walks through capture and confirmation", async () => {
  const schema = await loadSchema();
  let state: ConversationState = createConversationState(schema);

  assert.equal(state.step, "INIT");

  let result = applyConversationEvent(schema, state, { type: "INIT" });
  state = result.state;
  assert.equal(state.step, "ASK");
  assert.equal(result.actions[0]?.type, "ASK_FIELD");

  result = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "project_name",
    value: " Apollo  Expansion ",
  });
  state = result.state;
  assert.equal(state.step, "CAPTURE");
  assert.equal(state.fields.project_name.value, "Apollo Expansion");

  result = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "project_name",
  });
  state = result.state;
  assert.equal(state.step, "CONFIRM");
  assert.equal(result.actions[0]?.type, "READY_TO_CONFIRM");

  result = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "project_name",
  });
  state = result.state;
  assert.equal(state.step, "NEXT_FIELD");
  assert.equal(state.fields.project_name.status, "confirmed");

  result = applyConversationEvent(schema, state, { type: "NEXT_FIELD" });
  state = result.state;
  assert.equal(state.step, "ASK");
  assert.equal(state.currentFieldId, "executive_summary");
});

test("required field validation triggers an error", async () => {
  const schema = await loadSchema();
  let state: ConversationState = createConversationState(schema);

  state = applyConversationEvent(schema, state, { type: "INIT" }).state;

  const validation = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "project_name",
  });
  state = validation.state;
  assert.equal(state.step, "ASK");
  assert.equal(state.fields.project_name.status, "pending");
  assert.equal(state.fields.project_name.issues[0]?.message, "Project name is required.");
  assert.equal(validation.actions[0]?.type, "VALIDATION_ERROR");
  assert.equal(validation.actions[0]?.issues[0]?.message, "Project name is required.");
});

test("skipping optional field marks it skipped", async () => {
  const schema = await loadSchema();
  let state: ConversationState = createConversationState(schema);
  state = applyConversationEvent(schema, state, { type: "INIT" }).state;

  // Move to optional field
  state = applyConversationEvent(schema, state, {
    type: "SKIP",
    fieldId: "project_name",
  }).state;
  state = applyConversationEvent(schema, state, { type: "NEXT_FIELD" }).state;

  state = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "executive_summary",
    value: "Key milestones and deliverables.",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "executive_summary",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "executive_summary",
  }).state;

  const skipResult = applyConversationEvent(schema, state, {
    type: "SKIP",
    fieldId: "risks",
    reason: "not-applicable",
  });
  state = skipResult.state;
  assert.equal(state.fields.risks.status, "skipped");
  assert.equal(skipResult.actions[0]?.type, "FIELD_SKIPPED");
});

test("completing all fields enters review mode", async () => {
  const schema = await loadSchema();
  let state: ConversationState = createConversationState(schema);

  state = applyConversationEvent(schema, state, { type: "INIT" }).state;
  state = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "project_name",
    value: "Apollo",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "project_name",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "project_name",
  }).state;
  state = applyConversationEvent(schema, state, { type: "NEXT_FIELD" }).state;

  state = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "executive_summary",
    value: "Deliver insights.",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "VALIDATE",
    fieldId: "executive_summary",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "executive_summary",
  }).state;
  state = applyConversationEvent(schema, state, { type: "NEXT_FIELD" }).state;

  state = applyConversationEvent(schema, state, {
    type: "CAPTURE",
    fieldId: "risks",
    value: "Vendor delays",
  }).state;
  state = applyConversationEvent(schema, state, {
    type: "CONFIRM",
    fieldId: "risks",
  }).state;

  const afterNext = applyConversationEvent(schema, state, { type: "NEXT_FIELD" });
  state = afterNext.state;
  assert.equal(state.mode, "review");
  assert.equal(state.step, "PREVIEW");
  assert.equal(afterNext.actions.at(-1)?.type, "ENTER_REVIEW");
});
