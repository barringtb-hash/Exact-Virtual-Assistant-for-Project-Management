const SAFE_TOKEN_PATTERN = /^[a-z0-9._-]{1,64}$/i;

function sanitizeToken(value, fallback = "unknown") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (SAFE_TOKEN_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function toIsoOrEmpty(timestamp) {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return "";
  }
  try {
    return new Date(timestamp).toISOString();
  } catch (error) {
    return "";
  }
}

function formatCountMap(map) {
  const entries = [];
  for (const [key, count] of map.entries()) {
    const safeKey = sanitizeToken(key, "unknown");
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    entries.push(`${safeKey}:${safeCount}`);
  }
  entries.sort((a, b) => a.localeCompare(b));
  return entries.join(";");
}

export const FIELD_METRIC_HEADER = [
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
];

export function stringifyCsvRow(values) {
  return values
    .map((value) => {
      if (value == null) {
        return "";
      }
      const stringValue = String(value);
      if (stringValue.includes("\"")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      if (stringValue.includes(",") || stringValue.includes("\n")) {
        return `"${stringValue}"`;
      }
      return stringValue;
    })
    .join(",");
}

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFieldRecord(fieldId, position) {
  return {
    fieldId,
    fieldPosition: typeof position === "number" && position >= 0 ? position + 1 : null,
    askCount: 0,
    reaskCount: 0,
    reaskReasons: new Map(),
    skipCount: 0,
    skipReasons: new Map(),
    previewCount: 0,
    completionStatus: "pending",
    completionReason: "",
    firstAskedAt: null,
    completedAt: null,
    durationMs: 0,
    lastAskAt: null,
  };
}

export function createFieldMetricsRecorder(options = {}) {
  let sessionId = sanitizeToken(options.sessionId ?? defaultIdFactory(), "session");
  const fields = new Map();
  let documentType = options.documentType ? sanitizeToken(options.documentType, "unknown") : "unknown";
  let schemaVersion = options.schemaVersion ? sanitizeToken(options.schemaVersion, "unknown") : "unknown";
  let sessionFinalized = false;

  function reset(meta = {}) {
    sessionId = sanitizeToken(meta.sessionId ?? defaultIdFactory(), "session");
    documentType = meta.documentType ? sanitizeToken(meta.documentType, "unknown") : "unknown";
    schemaVersion = meta.schemaVersion ? sanitizeToken(meta.schemaVersion, "unknown") : "unknown";
    sessionFinalized = false;
    fields.clear();
  }

  function ensureField(fieldId, index = null) {
    const safeFieldId = sanitizeToken(fieldId, "field");
    if (!fields.has(safeFieldId)) {
      fields.set(safeFieldId, createFieldRecord(safeFieldId, index));
    }
    const record = fields.get(safeFieldId);
    if (record && typeof index === "number" && index >= 0) {
      const position = index + 1;
      if (!record.fieldPosition || position < record.fieldPosition) {
        record.fieldPosition = position;
      }
    }
    return record;
  }

  function recordAsk(fieldId, index, timestampMs) {
    const record = ensureField(fieldId, index);
    record.askCount += 1;
    if (record.firstAskedAt == null) {
      record.firstAskedAt = timestampMs;
    }
    record.lastAskAt = timestampMs;
  }

  function recordReask(fieldId, codes) {
    const record = ensureField(fieldId);
    record.reaskCount += 1;
    const source = Array.isArray(codes) && codes.length > 0 ? codes : ["unknown"];
    for (const rawCode of source) {
      const code = sanitizeToken(rawCode, "unknown");
      record.reaskReasons.set(code, (record.reaskReasons.get(code) ?? 0) + 1);
    }
  }

  function recordSkip(fieldId, reason, timestampMs) {
    const record = ensureField(fieldId);
    record.skipCount += 1;
    const safeReason = reason ? sanitizeToken(reason, "other") : "other";
    record.skipReasons.set(safeReason, (record.skipReasons.get(safeReason) ?? 0) + 1);
    if (!record.completedAt) {
      record.completedAt = timestampMs;
    }
    record.completionStatus = "skipped";
    record.completionReason = safeReason;
    record.durationMs = record.firstAskedAt ? Math.max(0, timestampMs - record.firstAskedAt) : 0;
  }

  function recordConfirm(fieldId, timestampMs) {
    const record = ensureField(fieldId);
    if (!record.completedAt) {
      record.completedAt = timestampMs;
    }
    record.completionStatus = "confirmed";
    record.completionReason = "confirmed";
    record.durationMs = record.firstAskedAt ? Math.max(0, timestampMs - record.firstAskedAt) : 0;
  }

  function recordPreview(fieldIds) {
    if (!Array.isArray(fieldIds)) {
      return;
    }
    for (let index = 0; index < fieldIds.length; index += 1) {
      const fieldId = fieldIds[index];
      if (!fieldId) continue;
      const record = ensureField(fieldId, index);
      record.previewCount += 1;
    }
  }

  function recordFinalize() {
    sessionFinalized = true;
  }

  function recordTransition(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const timestamp = Date.parse(payload.timestamp ?? "");
    const timestampMs = Number.isNaN(timestamp) ? Date.now() : timestamp;
    const state = payload.state ?? {};
    if (state.documentType) {
      documentType = sanitizeToken(state.documentType, "unknown");
    }
    if (state.schemaVersion) {
      schemaVersion = sanitizeToken(state.schemaVersion, "unknown");
    }
    if (Array.isArray(state.fieldOrder)) {
      state.fieldOrder.forEach((fieldId, index) => {
        if (!fieldId) return;
        ensureField(fieldId, index);
      });
    }

    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    for (const action of actions) {
      switch (action?.type) {
        case "ASK_FIELD":
          recordAsk(action.fieldId, action.index, timestampMs);
          break;
        case "VALIDATION_ERROR":
          if (!action.escalated) {
            recordReask(action.fieldId, action.issueCodes);
          }
          break;
        case "FIELD_CONFIRMED":
          recordConfirm(action.fieldId, timestampMs);
          break;
        case "FIELD_SKIPPED":
          recordSkip(action.fieldId, action.reason, timestampMs);
          break;
        case "ENTER_REVIEW":
          recordPreview(state.fieldOrder ?? []);
          break;
        case "SESSION_FINALIZED":
          recordFinalize();
          break;
        default:
          break;
      }
    }
  }

  function buildRows() {
    const nowIso = new Date().toISOString();
    const rows = [];
    for (const record of fields.values()) {
      rows.push({
        timestamp: nowIso,
        session_id: sessionId,
        document_type: documentType,
        schema_version: schemaVersion,
        field_id: record.fieldId,
        field_position: record.fieldPosition ?? "",
        ask_count: record.askCount,
        reask_count: record.reaskCount,
        reask_codes: formatCountMap(record.reaskReasons),
        skip_count: record.skipCount,
        skip_reasons: formatCountMap(record.skipReasons),
        preview_count: record.previewCount,
        completion_status: record.completionStatus,
        completion_reason: record.completionReason,
        first_asked_at: toIsoOrEmpty(record.firstAskedAt),
        completed_at: toIsoOrEmpty(record.completedAt),
        duration_ms: record.durationMs,
        session_finalized: sessionFinalized ? "true" : "false",
      });
    }
    return rows;
  }

  function getCsvRows(includeHeader = false) {
    const rows = buildRows().map((row) =>
      FIELD_METRIC_HEADER.map((column) => {
        const value = row[column];
        return value == null ? "" : value;
      })
    );
    if (includeHeader) {
      rows.unshift([...FIELD_METRIC_HEADER]);
    }
    return rows;
  }

  function toCsvLines(includeHeader = false) {
    return getCsvRows(includeHeader).map((row) => stringifyCsvRow(row));
  }

  return {
    recordTransition,
    buildRows,
    getCsvRows,
    toCsvLines,
    reset,
    getSessionId: () => sessionId,
    getDocumentType: () => documentType,
    getSchemaVersion: () => schemaVersion,
    isFinalized: () => sessionFinalized,
  };
}

export function sanitizeTelemetryToken(value, fallback = "unknown") {
  return sanitizeToken(value, fallback);
}
