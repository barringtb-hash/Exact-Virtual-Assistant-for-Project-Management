import {
  FIELD_METRIC_HEADER,
  createFieldMetricsRecorder,
  stringifyCsvRow,
} from "../../../lib/telemetry/fieldMetrics.js";
import type { ConversationTelemetryTransitionEvent } from "../../state/conversationMachine.ts";

export interface ConversationTelemetryClientOptions {
  sessionId?: string;
  documentType?: string;
  schemaVersion?: string;
  sendBatch?: (payload: ConversationTelemetryBatchPayload) => Promise<void> | void;
}

export interface ConversationTelemetryBatchPayload {
  sessionId: string;
  documentType: string;
  schemaVersion: string;
  header: string[];
  rows: Array<string[]>;
  csv: {
    header: string[];
    lines: string[];
  };
}

function createDefaultSender() {
  return async function send(payload: ConversationTelemetryBatchPayload) {
    if (typeof fetch !== "function") {
      return;
    }
    try {
      const response = await fetch("/api/telemetry/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: payload.sessionId,
          documentType: payload.documentType,
          schemaVersion: payload.schemaVersion,
          header: payload.header,
          rows: payload.rows,
        }),
      });
      if (!response.ok) {
        console.warn("conversation telemetry send failed", response.status);
      }
    } catch (error) {
      console.warn("conversation telemetry send error", error);
    }
  };
}

function hasActionType(
  event: ConversationTelemetryTransitionEvent,
  type: ConversationTelemetryTransitionEvent["actions"][number]["type"]
): boolean {
  return event.actions.some((action) => action.type === type);
}

export function createConversationTelemetryClient(
  options: ConversationTelemetryClientOptions = {}
) {
  const recorder = createFieldMetricsRecorder({
    sessionId: options.sessionId,
    documentType: options.documentType,
    schemaVersion: options.schemaVersion,
  });
  const send = options.sendBatch ?? createDefaultSender();
  let previewBatchSent = false;
  let finalizeBatchSent = false;

  async function flush() {
    const rows = recorder.getCsvRows(false);
    if (!rows.length) {
      return;
    }
    const lines = rows.map((row) => stringifyCsvRow(row));
    const payload: ConversationTelemetryBatchPayload = {
      sessionId: recorder.getSessionId(),
      documentType: recorder.getDocumentType(),
      schemaVersion: recorder.getSchemaVersion(),
      header: [...FIELD_METRIC_HEADER],
      rows,
      csv: {
        header: [...FIELD_METRIC_HEADER],
        lines,
      },
    };
    await Promise.resolve(send(payload));
  }

  function handleTransition(event: ConversationTelemetryTransitionEvent) {
    recorder.recordTransition(event);
    if (hasActionType(event, "ENTER_REVIEW") && !previewBatchSent) {
      previewBatchSent = true;
      void flush();
    }
    if (hasActionType(event, "SESSION_FINALIZED") && !finalizeBatchSent) {
      finalizeBatchSent = true;
      void flush();
    }
  }

  function reset(meta?: ConversationTelemetryClientOptions) {
    previewBatchSent = false;
    finalizeBatchSent = false;
    recorder.reset({
      sessionId: meta?.sessionId,
      documentType: meta?.documentType,
      schemaVersion: meta?.schemaVersion,
    });
  }

  return {
    reset,
    flush,
    recordTransition: handleTransition,
    getHooks() {
      return {
        onTransition: handleTransition,
      };
    },
    getRecorder() {
      return recorder;
    },
  };
}
