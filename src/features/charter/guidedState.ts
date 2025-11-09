import { CHARTER_FIELDS, type CharterField, type CharterFieldId } from "./schema";

export type FieldValue =
  | string
  | string[]
  | Record<string, string | null>
  | Array<Record<string, string | null>>;

export type FieldStatus =
  | "pending"
  | "asking"
  | "captured"
  | "validating"
  | "confirmed"
  | "rejected"
  | "skipped";

export interface GuidedFieldState {
  id: CharterFieldId;
  definition: CharterField;
  status: FieldStatus;
  value: FieldValue | null;
  confirmedValue: FieldValue | null;
  issues: string[];
  skippedReason: string | null;
  lastAskedAt: string | null;
  lastUpdatedAt: string | null;
}

export type GuidedStatus =
  | "idle"
  | "asking"
  | "capturing"
  | "validating"
  | "confirming"
  | "complete";

export interface GuidedWaitingState {
  assistant: boolean;
  user: boolean;
  validation: boolean;
}

export interface GuidedState {
  status: GuidedStatus;
  startedAt: string | null;
  completedAt: string | null;
  currentFieldId: CharterFieldId | null;
  order: CharterFieldId[];
  fields: Record<CharterFieldId, GuidedFieldState>;
  waiting: GuidedWaitingState;
  pendingFieldId: CharterFieldId | null;
  pendingValue: FieldValue | null;
  pendingWarnings: string[];
  awaitingConfirmation: boolean;
}

export type GuidedEvent =
  | { type: "RESET" }
  | { type: "START" }
  | { type: "ASK"; fieldId?: CharterFieldId }
  | { type: "CAPTURE"; fieldId: CharterFieldId; value: FieldValue }
  | {
      type: "VALIDATE";
      fieldId: CharterFieldId;
      valid?: boolean;
      issues?: string[];
      value?: FieldValue | null;
      normalizedValue?: FieldValue | null;
    }
  | { type: "CONFIRM"; fieldId?: CharterFieldId }
  | { type: "REJECT"; fieldId: CharterFieldId; issues?: string[] }
  | { type: "SKIP"; fieldId?: CharterFieldId; reason?: string | null }
  | { type: "BACK" }
  | { type: "NEXT" }
  | { type: "COMPLETE" }
  | {
      type: "PROPOSE";
      fieldId: CharterFieldId;
      value: FieldValue;
      warnings?: string[];
      awaitingConfirmation?: boolean;
    }
  | { type: "CONFIRM_PENDING" }
  | { type: "REJECT_PENDING" };

export interface GuidedPendingPatch {
  fieldId: CharterFieldId;
  value: FieldValue | null;
  warnings: string[];
  awaitingConfirmation: boolean;
}

function createFieldState(field: CharterField): GuidedFieldState {
  return {
    id: field.id,
    definition: field,
    status: "pending",
    value: null,
    confirmedValue: null,
    issues: [],
    skippedReason: null,
    lastAskedAt: null,
    lastUpdatedAt: null,
  };
}

function buildInitialFields(): Record<CharterFieldId, GuidedFieldState> {
  const fields: Partial<Record<CharterFieldId, GuidedFieldState>> = {};
  for (const field of CHARTER_FIELDS) {
    fields[field.id] = createFieldState(field);
  }
  return fields as Record<CharterFieldId, GuidedFieldState>;
}

export function createInitialGuidedState(): GuidedState {
  const order = CHARTER_FIELDS.map((field) => field.id);
  return {
    status: "idle",
    startedAt: null,
    completedAt: null,
    currentFieldId: order.length > 0 ? order[0] : null,
    order,
    fields: buildInitialFields(),
    waiting: {
      assistant: false,
      user: false,
      validation: false,
    },
    pendingFieldId: null,
    pendingValue: null,
    pendingWarnings: [],
    awaitingConfirmation: false,
  };
}

function cloneState(state: GuidedState): GuidedState {
  const fields: Partial<Record<CharterFieldId, GuidedFieldState>> = {};
  for (const [id, value] of Object.entries(state.fields)) {
    fields[id as CharterFieldId] = { ...value };
  }
  return {
    ...state,
    order: state.order.slice(),
    fields: fields as Record<CharterFieldId, GuidedFieldState>,
    waiting: { ...state.waiting },
    pendingFieldId: state.pendingFieldId,
    pendingValue: state.pendingValue,
    pendingWarnings: state.pendingWarnings.slice(),
    awaitingConfirmation: state.awaitingConfirmation,
  };
}

export function getCurrentField(state: GuidedState): CharterField | null {
  if (!state.currentFieldId) {
    return null;
  }
  const fieldState = state.fields[state.currentFieldId];
  return fieldState?.definition ?? null;
}

export function getCurrentFieldState(
  state: GuidedState,
): GuidedFieldState | null {
  if (!state.currentFieldId) {
    return null;
  }
  const fieldState = state.fields[state.currentFieldId] ?? null;
  if (!fieldState) {
    return null;
  }
  if (state.pendingFieldId === state.currentFieldId) {
    return {
      ...fieldState,
      value: state.pendingValue,
    };
  }
  return fieldState;
}

export function getPendingPatch(state: GuidedState): GuidedPendingPatch | null {
  if (!state.pendingFieldId) {
    return null;
  }
  return {
    fieldId: state.pendingFieldId,
    value: state.pendingValue,
    warnings: state.pendingWarnings.slice(),
    awaitingConfirmation: state.awaitingConfirmation,
  };
}

function clearPendingPatch(state: GuidedState) {
  state.pendingFieldId = null;
  state.pendingValue = null;
  state.pendingWarnings = [];
  state.awaitingConfirmation = false;
}

function getFieldIndex(state: GuidedState, fieldId: CharterFieldId | null): number {
  if (!fieldId) {
    return -1;
  }
  return state.order.indexOf(fieldId);
}

function getNextPendingFieldId(
  state: GuidedState,
  startIndex: number,
): CharterFieldId | null {
  const total = state.order.length;
  for (let index = startIndex + 1; index < total; index += 1) {
    const fieldId = state.order[index];
    if (!fieldId) continue;
    const fieldState = state.fields[fieldId];
    if (!fieldState) continue;
    if (fieldState.status !== "confirmed" && fieldState.status !== "skipped") {
      return fieldId;
    }
  }
  return null;
}

function getPreviousFieldId(state: GuidedState): CharterFieldId | null {
  const currentIndex = getFieldIndex(state, state.currentFieldId);
  if (currentIndex <= 0) {
    return null;
  }
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const fieldId = state.order[index];
    if (!fieldId) continue;
    const fieldState = state.fields[fieldId];
    if (!fieldState) continue;
    return fieldId;
  }
  return null;
}

function advanceToField(
  state: GuidedState,
  fieldId: CharterFieldId | null,
  timestamp: string,
) {
  if (!fieldId) {
    state.currentFieldId = null;
    state.status = "complete";
    state.waiting = { assistant: false, user: false, validation: false };
    state.completedAt = state.completedAt ?? timestamp;
    return;
  }

  state.currentFieldId = fieldId;
  state.status = "asking";
  state.waiting = { assistant: true, user: false, validation: false };
  const fieldState = state.fields[fieldId];
  if (fieldState) {
    state.fields[fieldId] = {
      ...fieldState,
      status: fieldState.status === "confirmed" || fieldState.status === "skipped"
        ? fieldState.status
        : "pending",
      issues: [],
      skippedReason: fieldState.skippedReason,
    };
  }
}

function advanceToNextField(state: GuidedState, fromFieldId: CharterFieldId) {
  const timestamp = new Date().toISOString();
  const startIndex = getFieldIndex(state, fromFieldId);
  const nextFieldId = getNextPendingFieldId(state, startIndex);
  if (nextFieldId) {
    advanceToField(state, nextFieldId, timestamp);
  } else {
    advanceToField(state, null, timestamp);
  }
}

export function guidedReducer(
  state: GuidedState,
  event: GuidedEvent,
): GuidedState {
  switch (event.type) {
    case "RESET": {
      return createInitialGuidedState();
    }
    case "START": {
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      const firstId = next.order[0] ?? null;
      next.startedAt = next.startedAt ?? timestamp;
      if (!firstId) {
        advanceToField(next, null, timestamp);
        return next;
      }
      next.currentFieldId = firstId;
      next.status = "asking";
      next.waiting = { assistant: true, user: false, validation: false };
      const fieldState = next.fields[firstId];
      if (fieldState) {
        next.fields[firstId] = {
          ...fieldState,
          status: "asking",
          issues: [],
          skippedReason: null,
          lastAskedAt: timestamp,
        };
      }
      return next;
    }
    case "ASK": {
      const targetId =
        event.fieldId ?? state.currentFieldId ?? state.order[0] ?? null;
      if (!targetId) {
        return state.status === "complete"
          ? state
          : {
              ...state,
              status: "complete",
              currentFieldId: null,
              waiting: { assistant: false, user: false, validation: false },
              completedAt: state.completedAt ?? new Date().toISOString(),
            };
      }
      const fieldState = state.fields[targetId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      next.currentFieldId = targetId;
      next.status = "asking";
      next.waiting = { assistant: false, user: true, validation: false };
      next.fields[targetId] = {
        ...fieldState,
        status: "asking",
        issues: [],
        skippedReason: null,
        lastAskedAt: timestamp,
      };
      return next;
    }
    case "CAPTURE": {
      const fieldState = state.fields[event.fieldId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      next.currentFieldId = event.fieldId;
      next.status = "capturing";
      next.waiting = { assistant: false, user: false, validation: true };
      next.fields[event.fieldId] = {
        ...fieldState,
        status: "captured",
        value: event.value,
        issues: [],
        skippedReason: null,
        lastUpdatedAt: timestamp,
      };
      return next;
    }
    case "VALIDATE": {
      const fieldState = state.fields[event.fieldId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      const isValid =
        event.valid ?? ((event.issues?.length ?? 0) === 0);
      const normalized =
        event.normalizedValue !== undefined
          ? event.normalizedValue
          : event.value ?? next.fields[event.fieldId].value;
      if (isValid) {
        next.status = "confirming";
        next.waiting = { assistant: true, user: false, validation: false };
        next.fields[event.fieldId] = {
          ...fieldState,
          status: "confirmed",
          value: normalized ?? null,
          confirmedValue: normalized ?? null,
          issues: [],
          skippedReason: null,
          lastUpdatedAt: timestamp,
        };
      } else {
        next.status = "asking";
        next.waiting = { assistant: false, user: true, validation: false };
        next.fields[event.fieldId] = {
          ...fieldState,
          status: "rejected",
          issues: event.issues ?? [],
          lastUpdatedAt: timestamp,
        };
      }
      return next;
    }
    case "REJECT": {
      const fieldState = state.fields[event.fieldId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      next.currentFieldId = event.fieldId;
      next.status = "asking";
      next.waiting = { assistant: false, user: true, validation: false };
      next.fields[event.fieldId] = {
        ...fieldState,
        status: "rejected",
        issues: event.issues ?? [],
        lastUpdatedAt: timestamp,
      };
      return next;
    }
    case "CONFIRM": {
      const targetId = event.fieldId ?? state.currentFieldId;
      if (!targetId) {
        return state;
      }
      const fieldState = state.fields[targetId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      const confirmedValue =
        fieldState.value !== undefined
          ? fieldState.value
          : fieldState.confirmedValue;
      next.fields[targetId] = {
        ...fieldState,
        status: "confirmed",
        confirmedValue: confirmedValue ?? null,
        issues: [],
        skippedReason: null,
        lastUpdatedAt: timestamp,
      };
      next.waiting = { assistant: true, user: false, validation: false };
      advanceToNextField(next, targetId);
      return next;
    }
    case "SKIP": {
      const targetId = event.fieldId ?? state.currentFieldId;
      if (!targetId) {
        return state;
      }
      const fieldState = state.fields[targetId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      next.fields[targetId] = {
        ...fieldState,
        status: "skipped",
        value: null,
        confirmedValue: null,
        issues: [],
        skippedReason: event.reason ?? null,
        lastUpdatedAt: timestamp,
      };
      advanceToNextField(next, targetId);
      return next;
    }
    case "BACK": {
      const targetId = getPreviousFieldId(state);
      if (!targetId) {
        return state;
      }
      const fieldState = state.fields[targetId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      const timestamp = new Date().toISOString();
      next.currentFieldId = targetId;
      next.status = "asking";
      next.waiting = { assistant: true, user: false, validation: false };
      next.fields[targetId] = {
        ...fieldState,
        status: "asking",
        issues: [],
        skippedReason: null,
        lastAskedAt: timestamp,
      };
      return next;
    }
    case "NEXT": {
      const targetId = state.currentFieldId;
      if (!targetId) {
        return state;
      }
      const next = cloneState(state);
      clearPendingPatch(next);
      advanceToNextField(next, targetId);
      return next;
    }
    case "COMPLETE": {
      if (state.status === "complete") {
        return state;
      }
      const timestamp = new Date().toISOString();
      return {
        ...state,
        status: "complete",
        currentFieldId: null,
        waiting: { assistant: false, user: false, validation: false },
        completedAt: state.completedAt ?? timestamp,
        pendingFieldId: null,
        pendingValue: null,
        pendingWarnings: [],
        awaitingConfirmation: false,
      };
    }
    case "PROPOSE": {
      const fieldState = state.fields[event.fieldId];
      if (!fieldState) {
        return state;
      }
      const next = cloneState(state);
      const timestamp = new Date().toISOString();
      next.currentFieldId = event.fieldId;
      next.pendingFieldId = event.fieldId;
      next.pendingValue = event.value ?? null;
      next.pendingWarnings = event.warnings ? [...event.warnings] : [];
      next.awaitingConfirmation = event.awaitingConfirmation ?? true;
      const nextStatus = next.awaitingConfirmation ? "captured" : "confirmed";
      next.fields[event.fieldId] = {
        ...fieldState,
        status: nextStatus,
        value: event.value,
        confirmedValue: next.awaitingConfirmation
          ? fieldState.confirmedValue
          : event.value,
        issues: [],
        skippedReason: null,
        lastUpdatedAt: timestamp,
      };
      if (next.awaitingConfirmation) {
        next.status = "confirming";
        next.waiting = { assistant: false, user: true, validation: false };
      } else {
        next.waiting = { assistant: true, user: false, validation: false };
      }
      return next;
    }
    case "CONFIRM_PENDING": {
      const fieldId = state.pendingFieldId;
      if (!fieldId) {
        return state;
      }
      const fieldState = state.fields[fieldId];
      if (!fieldState) {
        const next = cloneState(state);
        clearPendingPatch(next);
        return next;
      }
      const next = cloneState(state);
      const timestamp = new Date().toISOString();
      const pendingValue = next.pendingValue;
      clearPendingPatch(next);
      next.fields[fieldId] = {
        ...fieldState,
        status: "confirmed",
        value: pendingValue,
        confirmedValue: pendingValue,
        issues: [],
        skippedReason: null,
        lastUpdatedAt: timestamp,
      };
      next.waiting = { assistant: true, user: false, validation: false };
      advanceToNextField(next, fieldId);
      return next;
    }
    case "REJECT_PENDING": {
      if (!state.pendingFieldId) {
        if (!state.awaitingConfirmation) {
          return state;
        }
        const next = cloneState(state);
        clearPendingPatch(next);
        return next;
      }
      const fieldId = state.pendingFieldId;
      const fieldState = state.fields[fieldId];
      const next = cloneState(state);
      const timestamp = new Date().toISOString();
      clearPendingPatch(next);
      if (!fieldState) {
        next.awaitingConfirmation = false;
        return next;
      }
      next.currentFieldId = fieldId;
      next.status = "asking";
      next.waiting = { assistant: false, user: true, validation: false };
      next.fields[fieldId] = {
        ...fieldState,
        status: "asking",
        issues: [],
        skippedReason: null,
        lastAskedAt: timestamp,
      };
      return next;
    }
    default:
      return state;
  }
}
