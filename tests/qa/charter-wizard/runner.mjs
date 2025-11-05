import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeCharterFormSchema } from "../../../src/lib/charter/formSchema.ts";
import { createFormValidator } from "../../../src/lib/forms/validation.ts";
import {
  conversationActions,
  configureConversationMachineOptions,
  getConversationStateSnapshot,
} from "../../../src/state/conversationStore.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcriptsDir = path.join(__dirname, "transcripts");
const repoRoot = path.resolve(__dirname, "..", "..", "..");

function cloneSchema(schema) {
  return JSON.parse(JSON.stringify(schema));
}

function applyFieldOverrides(schema, overrides = []) {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return schema;
  }
  const next = cloneSchema(schema);
  const fieldMap = new Map(next.fields.map((field) => [field.id, field]));
  for (const override of overrides) {
    if (!override || typeof override !== "object") continue;
    const id = override.id;
    if (typeof id !== "string" || !id) continue;
    const field = fieldMap.get(id);
    if (!field) continue;
    if (override.delete === true) {
      const index = next.fields.findIndex((candidate) => candidate.id === id);
      if (index >= 0) {
        next.fields.splice(index, 1);
      }
      continue;
    }
    const { id: _skip, delete: _delete, ...rest } = override;
    Object.assign(field, rest);
  }
  return next;
}

function serializeAction(action) {
  const base = { type: action.type };
  if (action.field) {
    base.fieldId = action.field.id;
    base.required = action.field.required;
  }
  if ("index" in action) base.index = action.index;
  if ("total" in action) base.total = action.total;
  if ("value" in action) base.value = action.value;
  if ("normalized" in action) base.normalized = action.normalized;
  if ("reason" in action) base.reason = action.reason ?? null;
  if ("attempt" in action) base.attempt = action.attempt;
  if ("maxAttempts" in action) base.maxAttempts = action.maxAttempts;
  if ("escalated" in action) base.escalated = action.escalated;
  if (Array.isArray(action.issues)) {
    base.issues = action.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      severity: issue.severity,
    }));
  }
  return base;
}

function sanitizeValidationAttempt(payload) {
  return {
    fieldId: payload.field.id,
    attempt: payload.attempt,
    maxAttempts: payload.maxAttempts,
    status: payload.result.status,
    issueCodes: Array.isArray(payload.result.issues)
      ? payload.result.issues.map((issue) => issue.code)
      : [],
  };
}

function collectDocument(state) {
  if (!state) return {};
  const doc = {};
  for (const fieldId of state.fieldOrder) {
    const fieldState = state.fields[fieldId];
    if (!fieldState) continue;
    if (fieldState.status === "skipped" && fieldState.skippedReason === "hidden") {
      continue;
    }
    if (fieldState.status === "confirmed") {
      doc[fieldId] = fieldState.normalizedValue ?? fieldState.value ?? null;
    }
  }
  return doc;
}

function withDeterministicDates(fn) {
  const RealDate = Date;
  let tick = 0;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(MockDate.now());
      } else {
        super(...args);
      }
    }
    static now() {
      tick += 1;
      return 1_700_000_000_000 + tick * 1000;
    }
  }
  MockDate.UTC = RealDate.UTC.bind(RealDate);
  MockDate.parse = RealDate.parse.bind(RealDate);
  Object.setPrototypeOf(MockDate.prototype, RealDate.prototype);
  Object.setPrototypeOf(MockDate, RealDate);

  return async function runWithDeterministicDates(callback) {
    globalThis.Date = MockDate;
    try {
      return await callback();
    } finally {
      globalThis.Date = RealDate;
    }
  }(fn);
}

export async function listScenarioTranscripts() {
  const files = await fs.readdir(transcriptsDir);
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      slug: file.replace(/\.json$/, ""),
      path: path.join(transcriptsDir, file),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function loadScenario(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const scenario = JSON.parse(raw);
  if (!scenario.slug) {
    const slug = path.basename(filePath, ".json");
    scenario.slug = slug;
  }
  return scenario;
}

export async function runScenario(scenario) {
  return withDeterministicDates(async () => {
    const schemaPath = scenario.schemaPath
      ? path.resolve(repoRoot, scenario.schemaPath)
      : path.resolve(repoRoot, "templates/charter/formSchema.json");
    const schemaRaw = await fs.readFile(schemaPath, "utf8");
    const normalized = normalizeCharterFormSchema(JSON.parse(schemaRaw));
    const schema = applyFieldOverrides(normalized, scenario.setup?.fieldOverrides);

    conversationActions.reset();

    const telemetryEvents = [];
    const validationAttempts = [];

    const validator = createFormValidator(schema);

    configureConversationMachineOptions({
      validator,
      maxValidationAttempts: scenario.setup?.maxValidationAttempts,
      telemetry: {
        onTransition: (event) => {
          telemetryEvents.push(event);
        },
        onValidationAttempt: (payload) => {
          validationAttempts.push(sanitizeValidationAttempt(payload));
        },
      },
    });

    conversationActions.ensureSession(schema);

    const steps = [];

    for (const step of scenario.steps ?? []) {
      const actions = [];
      const startEventIndex = telemetryEvents.length;
      const startAttemptIndex = validationAttempts.length;

      for (const operation of step.operations ?? []) {
        const opType = operation.type;
        let opActions = [];
        switch (opType) {
          case "init":
            opActions = conversationActions.dispatch({ type: "INIT" });
            break;
          case "ask":
            opActions = conversationActions.dispatch({
              type: "ASK",
              fieldId: operation.fieldId,
            });
            break;
          case "capture": {
            const value = operation.value ?? "";
            opActions = conversationActions.capture(value);
            break;
          }
          case "validate": {
            opActions = conversationActions.validate(operation.fieldId);
            break;
          }
          case "confirm": {
            opActions = conversationActions.confirm(operation.fieldId);
            break;
          }
          case "next":
            opActions = conversationActions.nextField();
            break;
          case "back":
            opActions = conversationActions.back();
            break;
          case "edit":
            assert(operation.fieldId, "edit operation requires fieldId");
            opActions = conversationActions.edit(operation.fieldId);
            break;
          case "skip":
            opActions = conversationActions.skip(operation.reason);
            break;
          case "preview":
            opActions = conversationActions.preview();
            break;
          case "endReview":
            opActions = conversationActions.endReview();
            break;
          case "finalize":
            opActions = conversationActions.finalize();
            break;
          default:
            throw new Error(`Unsupported operation type: ${opType}`);
        }
        actions.push(...opActions.map(serializeAction));
      }

      const state = getConversationStateSnapshot();
      const document = collectDocument(state);
      const newTelemetry = telemetryEvents.slice(startEventIndex);
      const newAttempts = validationAttempts.slice(startAttemptIndex);

      steps.push({
        title: step.title ?? null,
        operations: step.operations ?? [],
        actions,
        actionTypes: actions.map((action) => action.type),
        telemetryEvents: newTelemetry,
        telemetryActionTypes: newTelemetry.flatMap((event) =>
          event.actions.map((action) => action.type)
        ),
        validationAttempts: newAttempts,
        state,
        document,
      });
    }

    const finalState = getConversationStateSnapshot();
    const finalDocument = collectDocument(finalState);

    configureConversationMachineOptions(null);

    return {
      slug: scenario.slug,
      name: scenario.name ?? scenario.slug,
      description: scenario.description ?? "",
      schemaVersion: schema.version,
      steps,
      finalState,
      finalDocument,
      telemetryEvents,
      validationAttempts,
    };
  });
}

export { transcriptsDir };
