/**
---
scenario: Golden Conversations Test
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
  listScenarioTranscripts,
  loadScenario,
  runScenario,
} from "./runner.mjs";

function assertFields(state, expectedFields, context) {
  if (!expectedFields) return;
  for (const [fieldId, expectations] of Object.entries(expectedFields)) {
    const fieldState = state.fields[fieldId];
    assert.ok(fieldState, `${context}: expected field ${fieldId}`);
    if (expectations.status !== undefined) {
      assert.equal(fieldState.status, expectations.status, `${context}: ${fieldId} status`);
    }
    if (expectations.value !== undefined) {
      assert.equal(fieldState.value, expectations.value, `${context}: ${fieldId} value`);
    }
    if (expectations.confirmedValue !== undefined) {
      assert.equal(
        fieldState.confirmedValue,
        expectations.confirmedValue,
        `${context}: ${fieldId} confirmedValue`,
      );
    }
    if (expectations.skippedReason !== undefined) {
      assert.equal(
        fieldState.skippedReason,
        expectations.skippedReason,
        `${context}: ${fieldId} skippedReason`,
      );
    }
    if (expectations.reaskCount !== undefined) {
      assert.equal(
        fieldState.reaskCount,
        expectations.reaskCount,
        `${context}: ${fieldId} reaskCount`,
      );
    }
    if (expectations.history) {
      assert.deepEqual(
        fieldState.history,
        expectations.history,
        `${context}: ${fieldId} history`,
      );
    }
    if (expectations.issues) {
      assert.deepEqual(
        fieldState.issues?.map((issue) => issue.code),
        expectations.issues,
        `${context}: ${fieldId} issues`,
      );
    }
  }
}

function assertValidationAttempts(attempts, expected, context) {
  if (!expected) return;
  assert.deepEqual(
    attempts.map((attempt) => ({
      fieldId: attempt.fieldId,
      attempt: attempt.attempt,
      maxAttempts: attempt.maxAttempts,
      status: attempt.status,
      issueCodes: attempt.issueCodes,
    })),
    expected,
    `${context}: validation attempts`,
  );
}

function assertDocument(document, expected, context) {
  if (!expected) return;
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(document[key], value, `${context}: document.${key}`);
  }
}

function assertStep(stepResult, expectation, index) {
  if (!expectation) return;
  const context = `step ${index + 1}`;
  if (expectation.step !== undefined) {
    assert.equal(stepResult.state.step, expectation.step, `${context}: step`);
  }
  if (expectation.mode !== undefined) {
    assert.equal(stepResult.state.mode, expectation.mode, `${context}: mode`);
  }
  if (expectation.currentFieldId !== undefined) {
    assert.equal(
      stepResult.state.currentFieldId,
      expectation.currentFieldId,
      `${context}: currentFieldId`,
    );
  }
  if (expectation.actions) {
    assert.deepEqual(stepResult.actionTypes, expectation.actions, `${context}: actions`);
  }
  if (expectation.telemetryActions) {
    assert.deepEqual(
      stepResult.telemetryActionTypes,
      expectation.telemetryActions,
      `${context}: telemetry actions`,
    );
  }
  assertFields(stepResult.state, expectation.fields, context);
  assertValidationAttempts(stepResult.validationAttempts, expectation.validationAttempts, context);
  assertDocument(stepResult.document, expectation.document, context);
}

function assertFinalState(result, expectation) {
  if (!expectation) return;
  if (expectation.mode !== undefined) {
    assert.equal(result.finalState.mode, expectation.mode, "final mode");
  }
  if (expectation.step !== undefined) {
    assert.equal(result.finalState.step, expectation.step, "final step");
  }
  if (expectation.currentFieldId !== undefined) {
    assert.equal(
      result.finalState.currentFieldId,
      expectation.currentFieldId,
      "final currentFieldId",
    );
  }
  assertFields(result.finalState, expectation.fields, "final state");
  assertDocument(result.finalDocument, expectation.document, "final document");
  if (expectation.telemetryActions) {
    const actions = result.telemetryEvents.flatMap((event) => event.actions.map((a) => a.type));
    assert.deepEqual(actions, expectation.telemetryActions, "final telemetry actions");
  }
}

const transcriptFiles = await listScenarioTranscripts();

for (const transcript of transcriptFiles) {
  test(`charter wizard golden scenario: ${transcript.slug}`, async () => {
    const scenario = await loadScenario(transcript.path);
    const result = await runScenario(scenario);

    scenario.steps?.forEach((step, index) => {
      assertStep(result.steps[index], step.expect, index);
    });

    assertFinalState(result, scenario.finalExpect);
  });
}
