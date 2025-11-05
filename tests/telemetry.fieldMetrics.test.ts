import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FIELD_METRIC_HEADER,
  createFieldMetricsRecorder,
} from "../lib/telemetry/fieldMetrics.js";
import type { ConversationTelemetryTransitionEvent } from "../src/state/conversationMachine.ts";

function buildState(
  overrides: Partial<ConversationTelemetryTransitionEvent["state"]>
): ConversationTelemetryTransitionEvent["state"] {
  const base: ConversationTelemetryTransitionEvent["state"] = {
    version: 1,
    documentType: "charter",
    schemaVersion: "test-1.0",
    step: "ASK",
    mode: "session",
    currentFieldId: "project_name",
    currentIndex: 0,
    fieldOrder: ["project_name", "executive_summary"],
    fields: {
      project_name: {
        status: "pending",
        skippedReason: null,
        reaskCount: 0,
        lastUpdatedAt: null,
      },
      executive_summary: {
        status: "pending",
        skippedReason: null,
        reaskCount: 0,
        lastUpdatedAt: null,
      },
    },
    finalizedAt: null,
    lastEvent: "INIT",
  };
  return { ...base, ...overrides };
}

function recordEvent(
  recorder: ReturnType<typeof createFieldMetricsRecorder>,
  payload: Omit<ConversationTelemetryTransitionEvent, "state"> & {
    state: Partial<ConversationTelemetryTransitionEvent["state"]>;
  }
) {
  const state = buildState(payload.state);
  recorder.recordTransition({ ...payload, state });
}

test("field metric header order", () => {
  assert.deepStrictEqual(FIELD_METRIC_HEADER, [
    "timestamp",
    "session_id",
    "document_type",
    "schema_version",
    "field_id",
    "field_position",
    "ask_count",
    "reask_count",
    "reask_codes",
    "skip_count",
    "skip_reasons",
    "preview_count",
    "completion_status",
    "completion_reason",
    "first_asked_at",
    "completed_at",
    "duration_ms",
    "session_finalized",
  ]);
});

test("field metrics recorder aggregates events", () => {
  const baseTimestamp = Date.parse("2024-01-01T00:00:00.000Z");
  const recorder = createFieldMetricsRecorder({
    sessionId: "session-test",
    documentType: "charter",
    schemaVersion: "test-1.0",
  });

  recordEvent(recorder, {
    timestamp: new Date(baseTimestamp).toISOString(),
    event: "ASK",
    previousStep: "INIT",
    previousMode: "session",
    state: {
      step: "ASK",
      mode: "session",
      currentFieldId: "project_name",
      currentIndex: 0,
      fields: {
        project_name: {
          status: "pending",
          skippedReason: null,
          reaskCount: 0,
          lastUpdatedAt: new Date(baseTimestamp).toISOString(),
        },
      },
      lastEvent: "ASK",
    },
    actions: [
      {
        type: "ASK_FIELD",
        fieldId: "project_name",
        index: 0,
        total: 2,
        required: true,
      },
    ],
  });

  recordEvent(recorder, {
    timestamp: new Date(baseTimestamp + 1000).toISOString(),
    event: "CONFIRM",
    previousStep: "ASK",
    previousMode: "session",
    state: {
      step: "NEXT_FIELD",
      mode: "session",
      currentFieldId: "executive_summary",
      currentIndex: 1,
      fields: {
        project_name: {
          status: "confirmed",
          skippedReason: null,
          reaskCount: 0,
          lastUpdatedAt: new Date(baseTimestamp + 1000).toISOString(),
        },
      },
      lastEvent: "CONFIRM",
    },
    actions: [
      { type: "FIELD_CONFIRMED", fieldId: "project_name" },
      {
        type: "ASK_FIELD",
        fieldId: "executive_summary",
        index: 1,
        total: 2,
        required: true,
      },
    ],
  });

  recordEvent(recorder, {
    timestamp: new Date(baseTimestamp + 2000).toISOString(),
    event: "SKIP",
    previousStep: "ASK",
    previousMode: "session",
    state: {
      step: "NEXT_FIELD",
      mode: "review",
      currentFieldId: null,
      currentIndex: -1,
      fields: {
        project_name: {
          status: "confirmed",
          skippedReason: null,
          reaskCount: 0,
          lastUpdatedAt: new Date(baseTimestamp + 1000).toISOString(),
        },
        executive_summary: {
          status: "skipped",
          skippedReason: "user-skipped",
          reaskCount: 0,
          lastUpdatedAt: new Date(baseTimestamp + 2000).toISOString(),
        },
      },
      lastEvent: "SKIP",
    },
    actions: [
      { type: "FIELD_SKIPPED", fieldId: "executive_summary", reason: "user-skipped" },
      { type: "ENTER_REVIEW" },
    ],
  });

  recordEvent(recorder, {
    timestamp: new Date(baseTimestamp + 3000).toISOString(),
    event: "FINALIZE",
    previousStep: "PREVIEW",
    previousMode: "review",
    state: {
      step: "FINALIZE",
      mode: "finalized",
      currentFieldId: null,
      currentIndex: -1,
      fields: {
        project_name: {
          status: "confirmed",
          skippedReason: null,
          reaskCount: 0,
          lastUpdatedAt: new Date(baseTimestamp + 1000).toISOString(),
        },
        executive_summary: {
          status: "skipped",
          skippedReason: "user-skipped",
          reaskCount: 0,
          lastUpdatedAt: new Date(baseTimestamp + 2000).toISOString(),
        },
      },
      finalizedAt: new Date(baseTimestamp + 3000).toISOString(),
      lastEvent: "FINALIZE",
    },
    actions: [{ type: "SESSION_FINALIZED" }],
  });

  const rows = recorder.getCsvRows(false);
  const fieldIdIndex = FIELD_METRIC_HEADER.indexOf("field_id");
  const askCountIndex = FIELD_METRIC_HEADER.indexOf("ask_count");
  const completionIndex = FIELD_METRIC_HEADER.indexOf("completion_status");
  const skipReasonsIndex = FIELD_METRIC_HEADER.indexOf("skip_reasons");
  const sessionFinalizedIndex = FIELD_METRIC_HEADER.indexOf("session_finalized");
  const durationIndex = FIELD_METRIC_HEADER.indexOf("duration_ms");
  const previewIndex = FIELD_METRIC_HEADER.indexOf("preview_count");

  const projectRow = rows.find((row) => row[fieldIdIndex] === "project_name");
  const summaryRow = rows.find((row) => row[fieldIdIndex] === "executive_summary");

  assert(projectRow, "project row should exist");
  assert(summaryRow, "summary row should exist");

  assert.strictEqual(projectRow[askCountIndex], 1);
  assert.strictEqual(projectRow[completionIndex], "confirmed");
  assert.strictEqual(projectRow[sessionFinalizedIndex], "true");
  assert.strictEqual(Number(projectRow[durationIndex]), 1000);
  assert.strictEqual(Number(projectRow[previewIndex]), 1);

  assert.strictEqual(summaryRow[askCountIndex], 1);
  assert.strictEqual(summaryRow[completionIndex], "skipped");
  assert.strictEqual(summaryRow[skipReasonsIndex], "user-skipped:1");
  assert.strictEqual(Number(summaryRow[durationIndex]), 1000);
  assert.strictEqual(Number(summaryRow[previewIndex]), 1);
});
