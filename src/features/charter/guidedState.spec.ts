import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  createInitialGuidedState,
  guidedReducer,
  type GuidedFieldState,
  type GuidedState,
} from "./guidedState";
import { CHARTER_FIELDS, type CharterFieldId } from "./schema";

const ORDER = CHARTER_FIELDS.map((field) => field.id);

function cloneFieldStates(): Record<CharterFieldId, GuidedFieldState> {
  const initial = createInitialGuidedState();
  const fields: Partial<Record<CharterFieldId, GuidedFieldState>> = {};
  for (const field of CHARTER_FIELDS) {
    fields[field.id] = { ...initial.fields[field.id] };
  }
  return fields as Record<CharterFieldId, GuidedFieldState>;
}

describe("guidedReducer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances to the next field after a successful confirmation", () => {
    const [firstField, secondField] = CHARTER_FIELDS;

    vi.setSystemTime(new Date("2024-01-01T08:00:00.000Z"));
    let state = createInitialGuidedState();
    state = guidedReducer(state, { type: "START" });

    vi.setSystemTime(new Date("2024-01-01T08:05:00.000Z"));
    state = guidedReducer(state, {
      type: "CAPTURE",
      fieldId: firstField.id,
      value: "Project X",
    });

    vi.setSystemTime(new Date("2024-01-01T08:10:00.000Z"));
    state = guidedReducer(state, {
      type: "VALIDATE",
      fieldId: firstField.id,
      valid: true,
    });

    vi.setSystemTime(new Date("2024-01-01T08:15:00.000Z"));
    state = guidedReducer(state, { type: "CONFIRM", fieldId: firstField.id });

    const expectedFields = cloneFieldStates();
    expectedFields[firstField.id] = {
      ...expectedFields[firstField.id],
      status: "confirmed",
      value: "Project X",
      confirmedValue: "Project X",
      issues: [],
      skippedReason: null,
      lastAskedAt: "2024-01-01T08:00:00.000Z",
      lastUpdatedAt: "2024-01-01T08:15:00.000Z",
    };
    expectedFields[secondField.id] = {
      ...expectedFields[secondField.id],
      status: "pending",
      issues: [],
      skippedReason: null,
    };

    const expectedState: GuidedState = {
      status: "asking",
      startedAt: "2024-01-01T08:00:00.000Z",
      completedAt: null,
      currentFieldId: secondField.id,
      order: ORDER,
      fields: expectedFields,
      waiting: { assistant: true, user: false, validation: false },
      pendingFieldId: null,
      pendingValue: null,
      pendingWarnings: [],
      awaitingConfirmation: false,
    };

    expect(state).toEqual(expectedState);
  });

  it("records validation errors and keeps the field active when validation fails", () => {
    const [firstField] = CHARTER_FIELDS;
    const startDateField = CHARTER_FIELDS.find((field) => field.id === "start_date");
    expect(startDateField).toBeDefined();

    vi.setSystemTime(new Date("2024-01-01T09:00:00.000Z"));
    let state = createInitialGuidedState();
    state = guidedReducer(state, { type: "START" });

    vi.setSystemTime(new Date("2024-01-01T09:05:00.000Z"));
    state = guidedReducer(state, { type: "ASK", fieldId: startDateField!.id });

    vi.setSystemTime(new Date("2024-01-01T09:10:00.000Z"));
    state = guidedReducer(state, {
      type: "CAPTURE",
      fieldId: startDateField!.id,
      value: "2024-02-30",
    });

    vi.setSystemTime(new Date("2024-01-01T09:15:00.000Z"));
    state = guidedReducer(state, {
      type: "VALIDATE",
      fieldId: startDateField!.id,
      valid: false,
      issues: ["Invalid date"],
    });

    const expectedFields = cloneFieldStates();
    expectedFields[firstField.id] = {
      ...expectedFields[firstField.id],
      status: "asking",
      issues: [],
      skippedReason: null,
      lastAskedAt: "2024-01-01T09:00:00.000Z",
    };
    expectedFields[startDateField!.id] = {
      ...expectedFields[startDateField!.id],
      status: "rejected",
      value: "2024-02-30",
      confirmedValue: null,
      issues: ["Invalid date"],
      skippedReason: null,
      lastAskedAt: "2024-01-01T09:05:00.000Z",
      lastUpdatedAt: "2024-01-01T09:15:00.000Z",
    };

    const expectedState: GuidedState = {
      status: "asking",
      startedAt: "2024-01-01T09:00:00.000Z",
      completedAt: null,
      currentFieldId: startDateField!.id,
      order: ORDER,
      fields: expectedFields,
      waiting: { assistant: false, user: true, validation: false },
      pendingFieldId: null,
      pendingValue: null,
      pendingWarnings: [],
      awaitingConfirmation: false,
    };

    expect(state).toEqual(expectedState);
  });

  it("marks a field as skipped and advances to the next one", () => {
    const [firstField, secondField] = CHARTER_FIELDS;

    vi.setSystemTime(new Date("2024-01-01T10:00:00.000Z"));
    let state = createInitialGuidedState();
    state = guidedReducer(state, { type: "START" });

    vi.setSystemTime(new Date("2024-01-01T10:05:00.000Z"));
    state = guidedReducer(state, {
      type: "SKIP",
      fieldId: firstField.id,
      reason: "Not applicable",
    });

    const expectedFields = cloneFieldStates();
    expectedFields[firstField.id] = {
      ...expectedFields[firstField.id],
      status: "skipped",
      value: null,
      confirmedValue: null,
      issues: [],
      skippedReason: "Not applicable",
      lastAskedAt: "2024-01-01T10:00:00.000Z",
      lastUpdatedAt: "2024-01-01T10:05:00.000Z",
    };
    expectedFields[secondField.id] = {
      ...expectedFields[secondField.id],
      status: "pending",
      issues: [],
      skippedReason: null,
    };

    const expectedState: GuidedState = {
      status: "asking",
      startedAt: "2024-01-01T10:00:00.000Z",
      completedAt: null,
      currentFieldId: secondField.id,
      order: ORDER,
      fields: expectedFields,
      waiting: { assistant: true, user: false, validation: false },
      pendingFieldId: null,
      pendingValue: null,
      pendingWarnings: [],
      awaitingConfirmation: false,
    };

    expect(state).toEqual(expectedState);
  });

  it("moves back to the previous field with preserved answers", () => {
    const [firstField, secondField] = CHARTER_FIELDS;

    vi.setSystemTime(new Date("2024-01-01T11:00:00.000Z"));
    let state = createInitialGuidedState();
    state = guidedReducer(state, { type: "START" });

    vi.setSystemTime(new Date("2024-01-01T11:05:00.000Z"));
    state = guidedReducer(state, {
      type: "CAPTURE",
      fieldId: firstField.id,
      value: "Project X",
    });

    vi.setSystemTime(new Date("2024-01-01T11:10:00.000Z"));
    state = guidedReducer(state, {
      type: "VALIDATE",
      fieldId: firstField.id,
      valid: true,
    });

    vi.setSystemTime(new Date("2024-01-01T11:15:00.000Z"));
    state = guidedReducer(state, { type: "CONFIRM", fieldId: firstField.id });

    vi.setSystemTime(new Date("2024-01-01T11:20:00.000Z"));
    state = guidedReducer(state, { type: "BACK" });

    const expectedFields = cloneFieldStates();
    expectedFields[firstField.id] = {
      ...expectedFields[firstField.id],
      status: "asking",
      value: "Project X",
      confirmedValue: "Project X",
      issues: [],
      skippedReason: null,
      lastAskedAt: "2024-01-01T11:20:00.000Z",
      lastUpdatedAt: "2024-01-01T11:15:00.000Z",
    };
    expectedFields[secondField.id] = {
      ...expectedFields[secondField.id],
      status: "pending",
      issues: [],
      skippedReason: null,
    };

    const expectedState: GuidedState = {
      status: "asking",
      startedAt: "2024-01-01T11:00:00.000Z",
      completedAt: null,
      currentFieldId: firstField.id,
      order: ORDER,
      fields: expectedFields,
      waiting: { assistant: true, user: false, validation: false },
      pendingFieldId: null,
      pendingValue: null,
      pendingWarnings: [],
      awaitingConfirmation: false,
    };

    expect(state).toEqual(expectedState);
  });

  it("allows editing by jumping directly to a confirmed field", () => {
    const [firstField, secondField] = CHARTER_FIELDS;

    vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"));
    let state = createInitialGuidedState();
    state = guidedReducer(state, { type: "START" });

    vi.setSystemTime(new Date("2024-01-01T12:05:00.000Z"));
    state = guidedReducer(state, {
      type: "CAPTURE",
      fieldId: firstField.id,
      value: "Project X",
    });

    vi.setSystemTime(new Date("2024-01-01T12:10:00.000Z"));
    state = guidedReducer(state, {
      type: "VALIDATE",
      fieldId: firstField.id,
      valid: true,
    });

    vi.setSystemTime(new Date("2024-01-01T12:15:00.000Z"));
    state = guidedReducer(state, { type: "CONFIRM", fieldId: firstField.id });

    vi.setSystemTime(new Date("2024-01-01T12:20:00.000Z"));
    state = guidedReducer(state, { type: "ASK", fieldId: firstField.id });

    const expectedFields = cloneFieldStates();
    expectedFields[firstField.id] = {
      ...expectedFields[firstField.id],
      status: "asking",
      value: "Project X",
      confirmedValue: "Project X",
      issues: [],
      skippedReason: null,
      lastAskedAt: "2024-01-01T12:20:00.000Z",
      lastUpdatedAt: "2024-01-01T12:15:00.000Z",
    };
    expectedFields[secondField.id] = {
      ...expectedFields[secondField.id],
      status: "pending",
      issues: [],
      skippedReason: null,
    };

    const expectedState: GuidedState = {
      status: "asking",
      startedAt: "2024-01-01T12:00:00.000Z",
      completedAt: null,
      currentFieldId: firstField.id,
      order: ORDER,
      fields: expectedFields,
      waiting: { assistant: false, user: true, validation: false },
      pendingFieldId: null,
      pendingValue: null,
      pendingWarnings: [],
      awaitingConfirmation: false,
    };

    expect(state).toEqual(expectedState);
  });
});
