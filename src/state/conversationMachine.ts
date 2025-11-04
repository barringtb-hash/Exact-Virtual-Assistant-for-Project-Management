import {
  type CharterFormField,
  type CharterFormSchema,
  createCharterFieldLookup,
} from "../lib/charter/formSchema.ts";

export type ConversationStep =
  | "INIT"
  | "ASK"
  | "CAPTURE"
  | "VALIDATE"
  | "CONFIRM"
  | "NEXT_FIELD"
  | "PREVIEW"
  | "FINALIZE";

export type ConversationMode = "session" | "review" | "finalized";

export type ConversationFieldStatus =
  | "pending"
  | "captured"
  | "confirmed"
  | "skipped";

export interface ConversationFieldState {
  id: string;
  status: ConversationFieldStatus;
  value: string;
  confirmedValue: string | null;
  error: string | null;
  skippedReason: string | null;
  history: string[];
  lastUpdatedAt: string | null;
}

export interface ConversationState {
  version: 1;
  documentType: string;
  schemaVersion: string;
  step: ConversationStep;
  mode: ConversationMode;
  fieldOrder: string[];
  currentFieldId: string | null;
  currentIndex: number;
  fields: Record<string, ConversationFieldState>;
  finalizedAt: string | null;
  lastEvent: ConversationEventType | null;
}

export type ConversationEventType =
  | "INIT"
  | "ASK"
  | "CAPTURE"
  | "VALIDATE"
  | "CONFIRM"
  | "NEXT_FIELD"
  | "BACK"
  | "EDIT"
  | "SKIP"
  | "PREVIEW"
  | "END_REVIEW"
  | "FINALIZE";

export type ConversationEvent =
  | { type: "INIT" }
  | { type: "ASK"; fieldId?: string }
  | { type: "CAPTURE"; fieldId: string; value: string }
  | { type: "VALIDATE"; fieldId: string }
  | { type: "CONFIRM"; fieldId: string }
  | { type: "NEXT_FIELD" }
  | { type: "BACK" }
  | { type: "EDIT"; fieldId: string }
  | { type: "SKIP"; fieldId: string; reason?: string }
  | { type: "PREVIEW" }
  | { type: "END_REVIEW" }
  | { type: "FINALIZE" };

export type ConversationAction =
  | {
      type: "ASK_FIELD";
      field: CharterFormField;
      index: number;
      total: number;
      required: boolean;
    }
  | {
      type: "FIELD_CAPTURED";
      field: CharterFormField;
      value: string;
    }
  | {
      type: "VALIDATION_ERROR";
      field: CharterFormField;
      message: string;
    }
  | {
      type: "READY_TO_CONFIRM";
      field: CharterFormField;
      value: string;
    }
  | {
      type: "FIELD_CONFIRMED";
      field: CharterFormField;
      value: string;
    }
  | {
      type: "FIELD_SKIPPED";
      field: CharterFormField;
      reason: string | null;
    }
  | {
      type: "BACK_TO_FIELD";
      field: CharterFormField;
      index: number;
    }
  | { type: "ENTER_REVIEW" }
  | { type: "EXIT_REVIEW" }
  | { type: "SESSION_FINALIZED" };

export interface ConversationTransition {
  state: ConversationState;
  actions: ConversationAction[];
}

function buildInitialFieldState(field: CharterFormField): ConversationFieldState {
  return {
    id: field.id,
    status: "pending",
    value: "",
    confirmedValue: null,
    error: null,
    skippedReason: null,
    history: [],
    lastUpdatedAt: null,
  };
}

export function createConversationState(
  schema: CharterFormSchema
): ConversationState {
  const fieldOrder = schema.fields.map((field) => field.id);
  const fields: Record<string, ConversationFieldState> = {};
  for (const field of schema.fields) {
    fields[field.id] = buildInitialFieldState(field);
  }

  return {
    version: 1,
    documentType: schema.document_type,
    schemaVersion: schema.version,
    step: "INIT",
    mode: "session",
    fieldOrder,
    currentFieldId: fieldOrder[0] ?? null,
    currentIndex: fieldOrder.length > 0 ? 0 : -1,
    fields,
    finalizedAt: null,
    lastEvent: null,
  };
}

function cloneState(state: ConversationState): ConversationState {
  const fields: Record<string, ConversationFieldState> = {};
  for (const [id, value] of Object.entries(state.fields)) {
    fields[id] = { ...value, history: value.history.slice() };
  }
  return {
    ...state,
    fields,
    fieldOrder: state.fieldOrder.slice(),
  };
}

function normalizeValue(value: string): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function findPreviousIndex(state: ConversationState): number {
  if (state.currentIndex <= 0) {
    return -1;
  }
  for (let index = state.currentIndex - 1; index >= 0; index -= 1) {
    const fieldId = state.fieldOrder[index];
    if (!fieldId) continue;
    const fieldState = state.fields[fieldId];
    if (!fieldState) continue;
    return index;
  }
  return -1;
}

function findNextIndex(state: ConversationState): number {
  const total = state.fieldOrder.length;
  const current = state.currentIndex;

  for (let index = Math.max(current, -1) + 1; index < total; index += 1) {
    const fieldId = state.fieldOrder[index];
    if (!fieldId) continue;
    const fieldState = state.fields[fieldId];
    if (!fieldState) continue;
    if (fieldState.status !== "confirmed" && fieldState.status !== "skipped") {
      return index;
    }
  }

  for (let index = 0; index <= current && index < total; index += 1) {
    const fieldId = state.fieldOrder[index];
    if (!fieldId) continue;
    const fieldState = state.fields[fieldId];
    if (!fieldState) continue;
    if (fieldState.status !== "confirmed" && fieldState.status !== "skipped") {
      return index;
    }
  }

  return -1;
}

function getCompletedCount(state: ConversationState): number {
  return state.fieldOrder.reduce((count, id) => {
    const fieldState = id ? state.fields[id] : null;
    if (!fieldState) return count;
    if (fieldState.status === "confirmed" || fieldState.status === "skipped") {
      return count + 1;
    }
    return count;
  }, 0);
}

function updateCurrentField(state: ConversationState, index: number) {
  if (index < 0 || index >= state.fieldOrder.length) {
    state.currentFieldId = null;
    state.currentIndex = -1;
    return;
  }
  const fieldId = state.fieldOrder[index] ?? null;
  state.currentFieldId = fieldId;
  state.currentIndex = index;
}

function resetError(state: ConversationState, fieldId: string | null) {
  if (!fieldId) return;
  const fieldState = state.fields[fieldId];
  if (!fieldState) return;
  fieldState.error = null;
}

function appendHistory(fieldState: ConversationFieldState, value: string) {
  if (value && (fieldState.history.length === 0 || fieldState.history[fieldState.history.length - 1] !== value)) {
    fieldState.history.push(value);
  }
  if (fieldState.history.length > 25) {
    fieldState.history.splice(0, fieldState.history.length - 25);
  }
}

export function applyConversationEvent(
  schema: CharterFormSchema,
  state: ConversationState,
  event: ConversationEvent
): ConversationTransition {
  const next = cloneState(state);
  const actions: ConversationAction[] = [];
  next.lastEvent = event.type;

  const lookup = createCharterFieldLookup(schema);
  const getFieldById = (fieldId: string | null): CharterFormField | null =>
    fieldId ? lookup.get(fieldId) ?? null : null;
  const getCurrentField = (): CharterFormField | null =>
    getFieldById(next.currentFieldId);

  switch (event.type) {
    case "INIT": {
      next.step = "ASK";
      if (next.currentIndex < 0 && next.fieldOrder.length > 0) {
        updateCurrentField(next, 0);
      }
      const field = getCurrentField();
      if (field) {
        resetError(next, field.id);
        actions.push({
          type: "ASK_FIELD",
          field,
          index: next.currentIndex,
          total: next.fieldOrder.length,
          required: field.required,
        });
      }
      break;
    }
    case "ASK": {
      const targetId = event.fieldId ?? next.currentFieldId;
      if (targetId) {
        const index = next.fieldOrder.indexOf(targetId);
        if (index >= 0) {
          updateCurrentField(next, index);
        }
      }
      const field = getCurrentField();
      if (field) {
        resetError(next, field.id);
        next.step = "ASK";
        actions.push({
          type: "ASK_FIELD",
          field,
          index: next.currentIndex,
          total: next.fieldOrder.length,
          required: field.required,
        });
      }
      break;
    }
    case "CAPTURE": {
      const field = getFieldById(event.fieldId ?? null);
      if (!field) {
        break;
      }
      const index = next.fieldOrder.indexOf(field.id);
      if (index >= 0) {
        updateCurrentField(next, index);
      }
      const fieldState = next.fields[field.id];
      if (!fieldState) {
        break;
      }
      const normalized = normalizeValue(event.value);
      fieldState.value = normalized;
      fieldState.status = "captured";
      fieldState.error = null;
      fieldState.lastUpdatedAt = new Date().toISOString();
      appendHistory(fieldState, normalized);
      next.step = "CAPTURE";
      actions.push({ type: "FIELD_CAPTURED", field, value: normalized });
      break;
    }
    case "VALIDATE": {
      const field = getFieldById(event.fieldId ?? null);
      if (!field) {
        break;
      }
      const index = next.fieldOrder.indexOf(field.id);
      if (index >= 0) {
        updateCurrentField(next, index);
      }
      const fieldState = next.fields[field.id];
      if (!fieldState) {
        break;
      }
      const value = normalizeValue(fieldState.value);
      if (field.required && !value) {
        const message = `${field.label} is required.`;
        fieldState.error = message;
        fieldState.status = "pending";
        next.step = "ASK";
        actions.push({ type: "VALIDATION_ERROR", field, message });
        break;
      }
      fieldState.error = null;
      fieldState.status = "captured";
      next.step = "CONFIRM";
      actions.push({ type: "READY_TO_CONFIRM", field, value });
      break;
    }
    case "CONFIRM": {
      const field = getFieldById(event.fieldId ?? null);
      if (!field) {
        break;
      }
      const index = next.fieldOrder.indexOf(field.id);
      if (index >= 0) {
        updateCurrentField(next, index);
      }
      const fieldState = next.fields[field.id];
      if (!fieldState) {
        break;
      }
      const value = normalizeValue(fieldState.value);
      fieldState.confirmedValue = value;
      fieldState.status = "confirmed";
      fieldState.error = null;
      next.step = "NEXT_FIELD";
      actions.push({ type: "FIELD_CONFIRMED", field, value });
      break;
    }
    case "NEXT_FIELD": {
      const nextIndex = findNextIndex(next);
      if (nextIndex >= 0) {
        updateCurrentField(next, nextIndex);
        next.step = "ASK";
        const field = getCurrentField();
        if (field) {
          const fieldState = next.fields[field.id];
          fieldState.error = null;
          actions.push({
            type: "ASK_FIELD",
            field,
            index: next.currentIndex,
            total: next.fieldOrder.length,
            required: field.required,
          });
        }
      } else {
        updateCurrentField(next, -1);
        next.step = "NEXT_FIELD";
      }
      break;
    }
    case "BACK": {
      const previousIndex = findPreviousIndex(next);
      if (previousIndex >= 0) {
        updateCurrentField(next, previousIndex);
        next.step = "ASK";
        const field = getCurrentField();
        if (field) {
          const fieldState = next.fields[field.id];
          fieldState.error = null;
          actions.push({
            type: "BACK_TO_FIELD",
            field,
            index: next.currentIndex,
          });
          actions.push({
            type: "ASK_FIELD",
            field,
            index: next.currentIndex,
            total: next.fieldOrder.length,
            required: field.required,
          });
        }
      }
      break;
    }
    case "EDIT": {
      const targetId = event.fieldId ?? null;
      if (!targetId) {
        break;
      }
      const index = next.fieldOrder.indexOf(targetId);
      if (index < 0) {
        break;
      }
      updateCurrentField(next, index);
      next.step = "ASK";
      const field = getCurrentField();
      if (field) {
        const fieldState = next.fields[field.id];
        fieldState.error = null;
        actions.push({
          type: "BACK_TO_FIELD",
          field,
          index,
        });
        actions.push({
          type: "ASK_FIELD",
          field,
          index,
          total: next.fieldOrder.length,
          required: field.required,
        });
      }
      break;
    }
    case "SKIP": {
      const field = getFieldById(event.fieldId ?? null);
      if (!field) {
        break;
      }
      const index = next.fieldOrder.indexOf(field.id);
      if (index >= 0) {
        updateCurrentField(next, index);
      }
      const fieldState = next.fields[field.id];
      if (!fieldState) {
        break;
      }
      fieldState.status = "skipped";
      fieldState.value = "";
      fieldState.confirmedValue = null;
      fieldState.error = null;
      fieldState.skippedReason = event.reason ?? null;
      fieldState.lastUpdatedAt = new Date().toISOString();
      next.step = "NEXT_FIELD";
      actions.push({
        type: "FIELD_SKIPPED",
        field,
        reason: fieldState.skippedReason,
      });
      break;
    }
    case "PREVIEW": {
      next.mode = "review";
      next.step = "PREVIEW";
      actions.push({ type: "ENTER_REVIEW" });
      break;
    }
    case "END_REVIEW": {
      next.mode = "session";
      const pendingIndex = findNextIndex(next);
      if (pendingIndex >= 0) {
        updateCurrentField(next, pendingIndex);
        next.step = "ASK";
        const field = getCurrentField();
        if (field) {
          actions.push({
            type: "ASK_FIELD",
            field,
            index: next.currentIndex,
            total: next.fieldOrder.length,
            required: field.required,
          });
        }
      } else {
        next.step = next.currentFieldId ? "ASK" : "NEXT_FIELD";
      }
      actions.push({ type: "EXIT_REVIEW" });
      break;
    }
    case "FINALIZE": {
      next.mode = "finalized";
      next.step = "FINALIZE";
      next.finalizedAt = new Date().toISOString();
      actions.push({ type: "SESSION_FINALIZED" });
      break;
    }
    default:
      break;
  }

  if (next.step !== "VALIDATE" && next.step !== "CAPTURE") {
    if (next.currentFieldId) {
      const fieldState = next.fields[next.currentFieldId];
      if (fieldState && next.step !== "ASK" && next.step !== "PREVIEW") {
        fieldState.error = null;
      }
    }
  }

  const completedCount = getCompletedCount(next);
  if (completedCount >= next.fieldOrder.length && next.mode === "session" && next.step === "NEXT_FIELD") {
    next.mode = "review";
    next.step = "PREVIEW";
    actions.push({ type: "ENTER_REVIEW" });
  }

  return { state: next, actions };
}

export function getConversationSnapshot(
  state: ConversationState
): ConversationState {
  return cloneState(state);
}

export function mergeConversationSnapshot(
  schema: CharterFormSchema,
  snapshot: ConversationState
): ConversationState {
  const base = createConversationState(schema);
  const merged = cloneState(base);
  merged.step = snapshot.step;
  merged.mode = snapshot.mode;
  merged.currentFieldId = snapshot.currentFieldId;
  merged.currentIndex = snapshot.currentIndex;
  merged.finalizedAt = snapshot.finalizedAt;
  merged.lastEvent = snapshot.lastEvent;

  for (const fieldId of merged.fieldOrder) {
    const source = snapshot.fields[fieldId];
    if (!source) continue;
    merged.fields[fieldId] = {
      ...merged.fields[fieldId],
      ...source,
      history: Array.isArray(source.history) ? source.history.slice() : [],
    };
  }

  return merged;
}
