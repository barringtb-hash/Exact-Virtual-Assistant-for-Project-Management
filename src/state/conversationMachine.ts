import {
  type CharterFormField,
  type CharterFormSchema,
  createCharterFieldLookup,
} from "../features/charter/utils/formSchema.ts";
import { sanitizeTelemetryToken } from "../../lib/telemetry/fieldMetrics.js";
import {
  createFormValidator,
  type FieldRuleMap,
  type FieldValidationIssue,
  type FieldValidationResult,
  type FormValidator,
} from "../lib/forms/validation.ts";

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
  normalizedValue: unknown;
  issues: FieldValidationIssue[];
  skippedReason: string | null;
  history: string[];
  reaskCount: number;
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
      issues: FieldValidationIssue[];
      attempt: number;
      maxAttempts: number;
      escalated: boolean;
      result: FieldValidationResult;
    }
  | {
      type: "READY_TO_CONFIRM";
      field: CharterFormField;
      value: string;
      normalized: unknown;
      issues: FieldValidationIssue[];
    }
  | {
      type: "FIELD_CONFIRMED";
      field: CharterFormField;
      value: string;
      normalized: unknown;
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

export interface ConversationTelemetryHooks {
  onValidationAttempt?: (payload: {
    field: CharterFormField;
    result: FieldValidationResult;
    attempt: number;
    maxAttempts: number;
    state: ConversationState;
  }) => void;
  onTransition?: (payload: ConversationTelemetryTransitionEvent) => void;
}

export type ConversationTelemetryAction =
  | {
      type: "ASK_FIELD";
      fieldId: string;
      index: number;
      total: number;
      required: boolean;
    }
  | {
      type: "FIELD_CAPTURED";
      fieldId: string;
    }
  | {
      type: "READY_TO_CONFIRM";
      fieldId: string;
      issueCodes: string[];
    }
  | {
      type: "VALIDATION_ERROR";
      fieldId: string;
      attempt: number;
      maxAttempts: number;
      escalated: boolean;
      issueCodes: string[];
    }
  | {
      type: "FIELD_CONFIRMED";
      fieldId: string;
    }
  | {
      type: "FIELD_SKIPPED";
      fieldId: string;
      reason: string | null;
    }
  | {
      type: "BACK_TO_FIELD";
      fieldId: string;
      index: number;
    }
  | { type: "ENTER_REVIEW" }
  | { type: "EXIT_REVIEW" }
  | { type: "SESSION_FINALIZED" };

export interface ConversationTelemetryTransitionEvent {
  timestamp: string;
  event: ConversationEventType;
  previousStep: ConversationStep;
  previousMode: ConversationMode;
  state: {
    version: number;
    documentType: string;
    schemaVersion: string;
    step: ConversationStep;
    mode: ConversationMode;
    currentFieldId: string | null;
    currentIndex: number;
    fieldOrder: string[];
    fields: Record<
      string,
      {
        status: ConversationFieldStatus;
        skippedReason: string | null;
        reaskCount: number;
        lastUpdatedAt: string | null;
      }
    >;
    finalizedAt: string | null;
    lastEvent: ConversationEventType | null;
  };
  actions: ConversationTelemetryAction[];
}

function sanitizeFieldId(fieldId: string | null | undefined): string | null {
  if (typeof fieldId !== "string") {
    return null;
  }
  return sanitizeTelemetryToken(fieldId, "field");
}

function sanitizeReason(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return sanitizeTelemetryToken(value, "other");
}

function sanitizeIssueCodes(issues: FieldValidationIssue[]): string[] {
  return issues.map((issue) => sanitizeTelemetryToken(issue.code, "unknown"));
}

function buildTelemetryFieldState(
  fieldState: ConversationFieldState | undefined
): {
  status: ConversationFieldStatus;
  skippedReason: string | null;
  reaskCount: number;
  lastUpdatedAt: string | null;
} {
  if (!fieldState) {
    return {
      status: "pending",
      skippedReason: null,
      reaskCount: 0,
      lastUpdatedAt: null,
    };
  }
  return {
    status: fieldState.status,
    skippedReason: sanitizeReason(fieldState.skippedReason),
    reaskCount: fieldState.reaskCount,
    lastUpdatedAt: fieldState.lastUpdatedAt ?? null,
  };
}

function buildTelemetryState(state: ConversationState) {
  const fieldOrder: string[] = [];
  const fields: ConversationTelemetryTransitionEvent["state"]["fields"] = {};
  for (const rawFieldId of state.fieldOrder) {
    if (!rawFieldId) continue;
    const sanitizedId = sanitizeFieldId(rawFieldId);
    if (!sanitizedId) continue;
    fieldOrder.push(sanitizedId);
    fields[sanitizedId] = buildTelemetryFieldState(state.fields[rawFieldId]);
  }

  const currentFieldId = sanitizeFieldId(state.currentFieldId);

  return {
    version: state.version,
    documentType: sanitizeTelemetryToken(state.documentType, "unknown"),
    schemaVersion: sanitizeTelemetryToken(state.schemaVersion, "unknown"),
    step: state.step,
    mode: state.mode,
    currentFieldId,
    currentIndex: state.currentIndex,
    fieldOrder,
    fields,
    finalizedAt: state.finalizedAt,
    lastEvent: state.lastEvent,
  } satisfies ConversationTelemetryTransitionEvent["state"];
}

function sanitizeTelemetryAction(
  action: ConversationAction
): ConversationTelemetryAction | null {
  switch (action.type) {
    case "ASK_FIELD": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "ASK_FIELD",
        fieldId,
        index: action.index,
        total: action.total,
        required: action.required,
      };
    }
    case "FIELD_CAPTURED": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "FIELD_CAPTURED",
        fieldId,
      };
    }
    case "READY_TO_CONFIRM": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "READY_TO_CONFIRM",
        fieldId,
        issueCodes: sanitizeIssueCodes(action.issues ?? []),
      };
    }
    case "VALIDATION_ERROR": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "VALIDATION_ERROR",
        fieldId,
        attempt: action.attempt,
        maxAttempts: action.maxAttempts,
        escalated: action.escalated,
        issueCodes: sanitizeIssueCodes(action.issues ?? []),
      };
    }
    case "FIELD_CONFIRMED": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "FIELD_CONFIRMED",
        fieldId,
      };
    }
    case "FIELD_SKIPPED": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "FIELD_SKIPPED",
        fieldId,
        reason: sanitizeReason(action.reason),
      };
    }
    case "BACK_TO_FIELD": {
      const fieldId = sanitizeFieldId(action.field?.id);
      if (!fieldId) return null;
      return {
        type: "BACK_TO_FIELD",
        fieldId,
        index: action.index,
      };
    }
    case "ENTER_REVIEW":
      return { type: "ENTER_REVIEW" };
    case "EXIT_REVIEW":
      return { type: "EXIT_REVIEW" };
    case "SESSION_FINALIZED":
      return { type: "SESSION_FINALIZED" };
    default:
      return null;
  }
}

export interface ConversationMachineOptions {
  validator?: FormValidator;
  fieldRules?: FieldRuleMap;
  maxValidationAttempts?: number;
  telemetry?: ConversationTelemetryHooks;
}

function buildInitialFieldState(field: CharterFormField): ConversationFieldState {
  return {
    id: field.id,
    status: "pending",
    value: "",
    confirmedValue: null,
    normalizedValue: null,
    issues: [],
    skippedReason: null,
    history: [],
    reaskCount: 0,
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

function resetIssues(state: ConversationState, fieldId: string | null) {
  if (!fieldId) return;
  const fieldState = state.fields[fieldId];
  if (!fieldState) return;
  fieldState.issues = [];
}

function appendHistory(fieldState: ConversationFieldState, value: string) {
  if (value && (fieldState.history.length === 0 || fieldState.history[fieldState.history.length - 1] !== value)) {
    fieldState.history.push(value);
  }
  if (fieldState.history.length > 25) {
    fieldState.history.splice(0, fieldState.history.length - 25);
  }
}

function gatherNormalizedValues(state: ConversationState): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const fieldId of state.fieldOrder) {
    const fieldState = fieldId ? state.fields[fieldId] : undefined;
    if (!fieldState) continue;
    if (fieldState.status === "skipped" && fieldState.skippedReason === "hidden") {
      continue;
    }
    if (fieldState.normalizedValue !== undefined && fieldState.normalizedValue !== null) {
      values[fieldId] = fieldState.normalizedValue;
    } else if (fieldState.value) {
      values[fieldId] = fieldState.value;
    }
  }
  return values;
}

export function applyConversationEvent(
  schema: CharterFormSchema,
  state: ConversationState,
  event: ConversationEvent,
  options: ConversationMachineOptions = {}
): ConversationTransition {
  const next = cloneState(state);
  const actions: ConversationAction[] = [];
  next.lastEvent = event.type;

  const validator =
    options.validator ??
    createFormValidator(
      schema,
      options.fieldRules ? { fieldRules: options.fieldRules } : undefined
    );
  const maxAttempts = Math.max(1, options.maxValidationAttempts ?? 2);
  const telemetry = options.telemetry;
  const telemetryTimestamp = new Date().toISOString();

  const lookup = createCharterFieldLookup(schema);
  const getFieldById = (fieldId: string | null): CharterFormField | null =>
    fieldId ? lookup.get(fieldId) ?? null : null;
  const getCurrentField = (): CharterFormField | null =>
    getFieldById(next.currentFieldId);

  const ensureVisibleField = (): CharterFormField | null => {
    let guard = 0;
    while (guard < next.fieldOrder.length) {
      const current = getCurrentField();
      if (!current) {
        return null;
      }
      const values = gatherNormalizedValues(next);
      if (validator.isFieldVisible(current, values)) {
        return current;
      }
      const fieldState = next.fields[current.id];
      if (fieldState) {
        fieldState.status = "skipped";
        fieldState.value = "";
        fieldState.confirmedValue = null;
        fieldState.normalizedValue = null;
        fieldState.issues = [];
        fieldState.reaskCount = 0;
        fieldState.skippedReason = "hidden";
        fieldState.lastUpdatedAt = new Date().toISOString();
        actions.push({ type: "FIELD_SKIPPED", field: current, reason: "hidden" });
      }
      const nextIndex = findNextIndex(next);
      if (nextIndex < 0 || nextIndex === next.currentIndex) {
        updateCurrentField(next, -1);
        return null;
      }
      updateCurrentField(next, nextIndex);
      guard += 1;
    }
    return getCurrentField();
  };

  const askCurrentField = () => {
    const field = ensureVisibleField();
    if (!field) {
      return;
    }
    resetIssues(next, field.id);
    actions.push({
      type: "ASK_FIELD",
      field,
      index: next.currentIndex,
      total: next.fieldOrder.length,
      required: field.required,
    });
  };

  switch (event.type) {
    case "INIT": {
      next.step = "ASK";
      if (next.currentIndex < 0 && next.fieldOrder.length > 0) {
        updateCurrentField(next, 0);
      }
      askCurrentField();
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
      next.step = "ASK";
      askCurrentField();
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
      const normalizedInput = validator.normalizeFieldValue(field, event.value);
      const value =
        typeof normalizedInput.text === "string"
          ? normalizedInput.text
          : String(normalizedInput.text ?? "");
      fieldState.value = value;
      fieldState.normalizedValue = normalizedInput.structured;
      fieldState.status = "captured";
      fieldState.issues = [];
      fieldState.reaskCount = 0;
      fieldState.skippedReason = null;
      fieldState.lastUpdatedAt = new Date().toISOString();
      appendHistory(fieldState, value);
      next.step = "CAPTURE";
      actions.push({ type: "FIELD_CAPTURED", field, value });
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
      const contextValues = gatherNormalizedValues(next);
      if (fieldState.normalizedValue !== undefined && fieldState.normalizedValue !== null) {
        contextValues[field.id] = fieldState.normalizedValue;
      } else if (fieldState.value) {
        contextValues[field.id] = fieldState.value;
      }
      const result = validator.validateField(field, fieldState.value, {
        values: contextValues,
      });

      const attempt = fieldState.reaskCount + 1;
      telemetry?.onValidationAttempt?.({
        field,
        result,
        attempt,
        maxAttempts,
        state: next,
      });

      if (result.status === "hidden") {
        fieldState.status = "skipped";
        fieldState.value = "";
        fieldState.confirmedValue = null;
        fieldState.normalizedValue = null;
        fieldState.issues = [];
        fieldState.reaskCount = 0;
        fieldState.skippedReason = "hidden";
        fieldState.lastUpdatedAt = new Date().toISOString();
        next.step = "NEXT_FIELD";
        actions.push({ type: "FIELD_SKIPPED", field, reason: "hidden" });
        break;
      }

      const normalizedValue =
        typeof result.normalized.text === "string"
          ? result.normalized.text
          : String(result.normalized.text ?? "");

      if (result.status === "invalid") {
        const escalated = attempt >= maxAttempts;
        fieldState.issues = result.issues;
        fieldState.reaskCount = attempt;
        fieldState.lastUpdatedAt = new Date().toISOString();

        if (escalated) {
          const skipReason = "validation-max-attempts";
          fieldState.status = "skipped";
          fieldState.value = "";
          fieldState.confirmedValue = null;
          fieldState.normalizedValue = null;
          fieldState.skippedReason = skipReason;
          next.step = "NEXT_FIELD";

          actions.push({
            type: "VALIDATION_ERROR",
            field,
            issues: result.issues,
            attempt,
            maxAttempts,
            escalated,
            result,
          });
          actions.push({ type: "FIELD_SKIPPED", field, reason: skipReason });

          const nextIndex = findNextIndex(next);
          if (nextIndex >= 0) {
            updateCurrentField(next, nextIndex);
            next.step = "ASK";
            askCurrentField();
          } else {
            updateCurrentField(next, -1);
          }
        } else {
          fieldState.status = "pending";
          fieldState.skippedReason = null;
          next.step = "ASK";

          actions.push({
            type: "VALIDATION_ERROR",
            field,
            issues: result.issues,
            attempt,
            maxAttempts,
            escalated,
            result,
          });
        }
        break;
      }

      fieldState.value = normalizedValue;
      fieldState.normalizedValue = result.normalized.structured;
      fieldState.status = "captured";
      fieldState.issues = result.issues;
      fieldState.reaskCount = 0;
      fieldState.skippedReason = null;
      fieldState.lastUpdatedAt = new Date().toISOString();
      next.step = "CONFIRM";
      actions.push({
        type: "READY_TO_CONFIRM",
        field,
        value: normalizedValue,
        normalized: result.normalized.structured,
        issues: result.issues,
      });
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
      fieldState.confirmedValue = fieldState.value;
      fieldState.status = "confirmed";
      fieldState.issues = [];
      fieldState.reaskCount = 0;
      fieldState.skippedReason = null;
      fieldState.lastUpdatedAt = new Date().toISOString();
      next.step = "NEXT_FIELD";
      actions.push({
        type: "FIELD_CONFIRMED",
        field,
        value: fieldState.value,
        normalized: fieldState.normalizedValue ?? fieldState.value,
      });
      break;
    }
    case "NEXT_FIELD": {
      const nextIndex = findNextIndex(next);
      if (nextIndex >= 0) {
        updateCurrentField(next, nextIndex);
        next.step = "ASK";
        askCurrentField();
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
        const field = ensureVisibleField();
        if (field) {
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
      const field = ensureVisibleField();
      if (field) {
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
      fieldState.normalizedValue = null;
      fieldState.issues = [];
      fieldState.reaskCount = 0;
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
        askCurrentField();
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

  const completedCount = getCompletedCount(next);
  if (completedCount >= next.fieldOrder.length && next.mode === "session" && next.step === "NEXT_FIELD") {
    next.mode = "review";
    next.step = "PREVIEW";
    actions.push({ type: "ENTER_REVIEW" });
  }

  if (telemetry?.onTransition) {
    const sanitizedActions = actions
      .map((action) => sanitizeTelemetryAction(action))
      .filter((action): action is ConversationTelemetryAction => action !== null);
    telemetry.onTransition({
      timestamp: telemetryTimestamp,
      event: event.type,
      previousStep: state.step,
      previousMode: state.mode,
      state: buildTelemetryState(next),
      actions: sanitizedActions,
    });
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
