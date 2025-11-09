import {
  createInitialGuidedState,
  getCurrentField,
  getCurrentFieldState,
  getPendingPatch,
  guidedReducer,
  type FieldValue,
  type GuidedEvent,
  type GuidedState,
} from "./guidedState";
import { CHARTER_FIELDS, type CharterField, type CharterFieldId } from "./schema";
import { getTitleCandidate } from "./titlePreprocessor";
import { guidedStateToCharterDTO } from "./persist";
import { SYSTEM_PROMPT } from "./prompts";

type StateListener = (state: GuidedState) => void;

type ActiveListener = (active: boolean) => void;

type PendingListener = (pending: GuidedPendingMetadata | null) => void;

export interface CharterExtractionWarning {
  code?: string;
  message?: string;
  fieldId?: CharterFieldId;
  details?: unknown;
  level?: "warning" | "error";
}

export interface CharterExtractionError {
  code?:
    | "configuration"
    | "no_fields_requested"
    | "missing_tool_call"
    | "invalid_tool_payload"
    | "openai_error"
    | "missing_required"
    | "validation_failed";
  message?: string;
  details?: unknown;
  fields?: CharterFieldId[];
}

export interface CharterExtractionRequest {
  requestedFieldIds: CharterFieldId[];
  messages: Array<{
    role: "user" | "assistant" | "system" | "developer";
    content: string;
  }>;
  attachments?: Array<{ name?: string; text: string; mimeType?: string }>;
  voice?: Array<{ id?: string; text: string; timestamp?: number }>;
  seed?: Record<string, unknown> | null;
}

export interface CharterExtractionResult {
  ok: boolean;
  fields: Partial<Record<CharterFieldId, FieldValue | null>>;
  warnings: CharterExtractionWarning[];
  error?: CharterExtractionError | null;
  rawToolArguments?: unknown;
}

export interface CharterExtractionContext {
  attachments?: Array<{ name?: string; text: string; mimeType?: string }>;
  voice?: Array<{ id?: string; text: string; timestamp?: number }>;
}

export interface GuidedPendingMetadata {
  fieldId: CharterFieldId;
  value: FieldValue | null;
  warnings: string[];
  awaitingConfirmation: boolean;
  summary: string;
  toolWarnings: CharterExtractionWarning[];
  toolFields: Partial<Record<CharterFieldId, FieldValue | null>>;
}

export interface GuidedOrchestratorOptions {
  postAssistantMessage: (message: string) => void;
  onStateChange?: StateListener;
  onActiveChange?: ActiveListener;
  onPendingChange?: PendingListener;
  extractFieldsFromUtterance?: (request: CharterExtractionRequest) => Promise<CharterExtractionResult>;
  getExtractionContext?: () => CharterExtractionContext | null | undefined;
}

export interface GuidedOrchestrator {
  getState(): GuidedState;
  start(): void;
  reset(): void;
  handleUserMessage(message: string): boolean;
  isActive(): boolean;
  isAutoExtractionDisabled(): boolean;
  getPendingProposal(): GuidedPendingMetadata | null;
  approvePendingProposal(): boolean;
  rejectPendingProposal(): boolean;
  addPendingListener(listener: PendingListener): () => void;
}

type Command =
  | { type: "skip" }
  | { type: "back" }
  | { type: "review" }
  | { type: "edit"; target?: string };

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractCommand(raw: string): Command | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^\/+/, "");
  const lower = normalized.toLowerCase();

  if (lower === "skip" || lower === "skip field") {
    return { type: "skip" };
  }

  if (lower === "back" || lower === "go back") {
    return { type: "back" };
  }

  if (lower === "review" || lower === "review progress" || lower === "review summary") {
    return { type: "review" };
  }

  if (lower.startsWith("edit")) {
    const target = normalized.slice(4).trim();
    return { type: "edit", target: target || undefined };
  }

  return null;
}

function formatRecord(record: Record<string, string | null>): string {
  return Object.entries(record)
    .map(([key, value]) => {
      const normalizedValue = normalizeWhitespace(value ?? "");
      if (!normalizedValue) {
        return key;
      }
      return `${key}: ${normalizedValue}`;
    })
    .filter(Boolean)
    .join(", ");
}

function formatFieldValue(value: FieldValue | null): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }
    if (typeof value[0] === "string") {
      return value
        .map((entry) => normalizeWhitespace(typeof entry === "string" ? entry : String(entry)))
        .filter(Boolean)
        .join(", ");
    }
    return value
      .map((entry) => (entry ? formatRecord(entry) : ""))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof value === "object") {
    return formatRecord(value as Record<string, string | null>);
  }

  return normalizeWhitespace(String(value));
}

function formatFieldPrompt(field: CharterField, fieldState: FieldValue | null): string {
  const parts: string[] = [];
  const statusLabel = field.required ? "required" : "optional";
  parts.push(`${field.label} (${statusLabel}).`);
  if (field.question) {
    parts.push(field.question);
  }
  if (field.helpText) {
    parts.push(field.helpText);
  }
  if (field.example) {
    parts.push(`Example: ${field.example}.`);
  } else if (field.placeholder) {
    parts.push(`Example: ${field.placeholder}.`);
  }
  const existing = formatFieldValue(fieldState);
  if (existing) {
    parts.push(`Current answer: ${existing}.`);
  }
  parts.push('Share your response or type "skip" to move on.');
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function findFieldId(raw: string | undefined): CharterFieldId | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const collapsed = normalized.replace(/[^a-z0-9]/g, "");
  for (const field of CHARTER_FIELDS) {
    const idNormalized = field.id.toLowerCase();
    if (idNormalized === normalized || idNormalized === collapsed) {
      return field.id;
    }
    const labelNormalized = field.label.toLowerCase();
    const labelCollapsed = labelNormalized.replace(/[^a-z0-9]/g, "");
    if (labelNormalized === normalized || labelCollapsed === collapsed) {
      return field.id;
    }
  }
  return null;
}

function isStateActive(state: GuidedState): boolean {
  return state.status !== "idle" && state.status !== "complete";
}

const APPROVAL_RESPONSES = new Set([
  "yes",
  "y",
  "yeah",
  "yep",
  "sure",
  "correct",
  "that's correct",
  "thats correct",
  "sounds good",
  "looks good",
  "ok",
  "okay",
  "confirm",
  "save",
]);

const REJECTION_RESPONSES = new Set([
  "no",
  "n",
  "nope",
  "nah",
  "don't",
  "dont",
  "reject",
  "not correct",
  "that's wrong",
  "thats wrong",
  "change it",
]);

function interpretConfirmation(raw: string): "approve" | "reject" | null {
  const normalized = normalizeWhitespace(raw).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (APPROVAL_RESPONSES.has(normalized)) {
    return "approve";
  }
  if (REJECTION_RESPONSES.has(normalized)) {
    return "reject";
  }
  return null;
}

function cloneValue<T>(value: T): T {
  const globalWithClone = globalThis as typeof globalThis & {
    structuredClone?: <U>(input: U) => U;
  };
  if (typeof globalWithClone.structuredClone === "function") {
    return globalWithClone.structuredClone(value);
  }
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function createGuidedOrchestrator({
  postAssistantMessage,
  onStateChange,
  onActiveChange,
  onPendingChange,
  extractFieldsFromUtterance,
  getExtractionContext,
}: GuidedOrchestratorOptions): GuidedOrchestrator {
  let state = createInitialGuidedState();
  let active = isStateActive(state);
  let completionNotified = false;

  const listeners: Set<StateListener> = new Set();
  const activeListeners: Set<ActiveListener> = new Set();
  const pendingListeners: Set<PendingListener> = new Set();

  let pendingToolFields: Partial<Record<CharterFieldId, FieldValue | null>> = {};
  let pendingToolWarnings: CharterExtractionWarning[] = [];

  if (onStateChange) {
    listeners.add(onStateChange);
  }

  if (onActiveChange) {
    activeListeners.add(onActiveChange);
  }

  if (onPendingChange) {
    pendingListeners.add(onPendingChange);
  }

  function emitState(next: GuidedState) {
    listeners.forEach((listener) => listener(next));
  }

  function emitActive(next: boolean) {
    activeListeners.forEach((listener) => listener(next));
  }

  function getPendingMetadata(): GuidedPendingMetadata | null {
    const patch = getPendingPatch(state);
    if (!patch) {
      return null;
    }
    const summary = formatFieldValue(patch.value ?? null);
    return {
      fieldId: patch.fieldId,
      value: patch.value ?? null,
      warnings: patch.warnings.slice(),
      awaitingConfirmation: patch.awaitingConfirmation,
      summary,
      toolWarnings: pendingToolWarnings.map((issue) => ({ ...issue })),
      toolFields: cloneValue(pendingToolFields),
    };
  }

  function emitPendingMetadata() {
    const pending = getPendingMetadata();
    pendingListeners.forEach((listener) => listener(pending));
  }

  function clearPendingToolData() {
    pendingToolFields = {};
    pendingToolWarnings = [];
    emitPendingMetadata();
  }

  function setState(next: GuidedState) {
    state = next;
    const nextActive = isStateActive(next);
    if (nextActive !== active) {
      active = nextActive;
      emitActive(active);
    }
    emitState(next);
    emitPendingMetadata();
  }

  function dispatch(event: GuidedEvent) {
    const nextState = guidedReducer(state, event);
    if (nextState !== state) {
      setState(nextState);
    }
    return state;
  }

  function sendAssistantMessage(message: string) {
    const normalized = normalizeWhitespace(message);
    if (!normalized) {
      return;
    }
    try {
      postAssistantMessage(normalized);
    } catch {
      // Silently ignore message errors to avoid breaking the flow
    }
  }

  function promptCurrentField() {
    const currentField = getCurrentField(state);
    if (!currentField) {
      if (state.status === "complete" && !completionNotified) {
        completionNotified = true;
        sendAssistantMessage(
          "That covers every section. I’ve saved your charter responses—you can review or edit any field with \"edit <field name>\"."
        );
      }
      return;
    }

    completionNotified = false;
    const fieldState = getCurrentFieldState(state);
    const prompt = formatFieldPrompt(
      currentField,
      fieldState?.confirmedValue ?? fieldState?.value ?? null,
    );
    sendAssistantMessage(prompt);
  }

function handleSkip(): boolean {
  const field = getCurrentField(state);
  if (!field) {
    sendAssistantMessage("All charter fields are already complete.");
    return true;
  }
    const name = field.reviewLabel ?? field.label;
    sendAssistantMessage(`Skipping ${name}.`);
    dispatch({ type: "SKIP", fieldId: field.id, reason: "user-skipped" });
    promptCurrentField();
    return true;
  }

function handleBack(): boolean {
    const before = getCurrentField(state);
    dispatch({ type: "BACK" });
    const current = getCurrentField(state);
    if (!current) {
      sendAssistantMessage("We’re at the beginning of the charter questions.");
      return true;
    }
    const name = current.reviewLabel ?? current.label;
    if (before && before.id === current.id) {
      sendAssistantMessage(`You’re already focused on ${name}.`);
    } else {
      sendAssistantMessage(`Let’s revisit ${name}.`);
    }
    promptCurrentField();
    return true;
  }

  function handleReview(): boolean {
    if (state.status === "idle") {
      sendAssistantMessage("Start the charter session to see progress.");
      return true;
    }

    const confirmedLabels: string[] = [];
    const skippedLabels: string[] = [];
    const pendingLabels: string[] = [];

    for (const fieldId of state.order) {
      if (!fieldId) continue;
      const fieldState = state.fields[fieldId];
      if (!fieldState) continue;
      const label = fieldState.definition?.reviewLabel ?? fieldState.definition?.label;
      if (!label) continue;

      switch (fieldState.status) {
        case "confirmed":
          confirmedLabels.push(label);
          break;
        case "skipped":
          skippedLabels.push(label);
          break;
        default:
          pendingLabels.push(label);
          break;
      }
    }

    const formatList = (values: string[]): string => {
      if (values.length === 0) {
        return "";
      }
      if (values.length === 1) {
        return values[0];
      }
      if (values.length === 2) {
        return `${values[0]} and ${values[1]}`;
      }
      return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
    };

    const segments: string[] = [];

    if (confirmedLabels.length > 0) {
      segments.push(`Confirmed: ${formatList(confirmedLabels)}.`);
    }

    if (skippedLabels.length > 0) {
      segments.push(`Skipped: ${formatList(skippedLabels)}.`);
    }

    if (pendingLabels.length > 0 && state.status !== "complete") {
      segments.push(`Still in progress: ${formatList(pendingLabels)}.`);
    }

    if (state.status === "complete") {
      segments.unshift("All charter sections are complete.");
    } else {
      const currentField = getCurrentField(state);
      if (currentField) {
        const name = currentField.reviewLabel ?? currentField.label;
        segments.push(`Currently focused on ${name}.`);
      }
    }

    if (segments.length === 0) {
      segments.push("We haven’t captured any charter responses yet.");
    }

    sendAssistantMessage(`Review summary — ${segments.join(" ")}`);
    return true;
  }

  function handleEdit(target?: string): boolean {
    if (!target && !getCurrentField(state)) {
      sendAssistantMessage("Let me know which field you’d like to edit—try \"edit risks\".");
      return true;
    }

    const targetId = target ? findFieldId(target) : state.currentFieldId;
    if (!targetId) {
      sendAssistantMessage(
        "I couldn’t find that section. Try something like \"edit project description\"."
      );
      return true;
    }

    dispatch({ type: "ASK", fieldId: targetId });
    const current = getCurrentField(state);
    if (current) {
      const name = current.reviewLabel ?? current.label;
      sendAssistantMessage(`Okay, updating ${name}.`);
      promptCurrentField();
    }
    return true;
  }

  function handleCommand(command: Command): boolean {
    switch (command.type) {
      case "skip":
        return handleSkip();
      case "back":
        return handleBack();
      case "review":
        return handleReview();
      case "edit":
        return handleEdit(command.target);
      default:
        return false;
    }
  }

  function handleAnswer(raw: string): boolean {
    const field = getCurrentField(state);
    if (!field) {
      return false;
    }

    const normalizedInput = normalizeWhitespace(raw);
    if (!normalizedInput) {
      sendAssistantMessage(
        `I didn’t catch a response for ${field.label}. Share an update or type "skip".`
      );
      return true;
    }

    if (state.awaitingConfirmation) {
      const decision = interpretConfirmation(normalizedInput);
      const pendingFieldId = state.pendingFieldId;
      const pendingDefinition =
        pendingFieldId ? state.fields[pendingFieldId]?.definition ?? null : null;

      if (decision === "approve" && pendingFieldId) {
        const name = pendingDefinition?.reviewLabel ?? pendingDefinition?.label ?? field.label;
        dispatch({ type: "CONFIRM_PENDING" });
        clearPendingToolData();
        sendAssistantMessage(`Saved ${name}.`);
        promptCurrentField();
        return true;
      }

      if (decision === "reject" && pendingFieldId) {
        const name = pendingDefinition?.reviewLabel ?? pendingDefinition?.label ?? field.label;
        dispatch({ type: "REJECT_PENDING" });
        clearPendingToolData();
        sendAssistantMessage(
          `No problem—let’s adjust ${name}. Share the right details or type "skip" to move on.`
        );
        promptCurrentField();
        return true;
      }

      if (pendingFieldId) {
        dispatch({ type: "REJECT_PENDING" });
        clearPendingToolData();
      } else {
        clearPendingToolData();
      }
    }

    const candidate = field.id === "project_name" ? getTitleCandidate(raw) : "";
    const capturedValue = candidate || normalizedInput;

    const shouldIgnoreExtraction = () => {
      const latestState = state;
      if (latestState.status !== "capturing") {
        return true;
      }
      if (latestState.currentFieldId !== field.id) {
        return true;
      }
      const latestFieldState = latestState.fields[field.id];
      if (!latestFieldState) {
        return true;
      }
      return latestFieldState.value !== capturedValue;
    };

    dispatch({ type: "CAPTURE", fieldId: field.id, value: capturedValue });

    const fieldState = getCurrentFieldState(state);
    const prompt = formatFieldPrompt(
      field,
      fieldState?.confirmedValue ?? fieldState?.value ?? null,
    );

    const request: CharterExtractionRequest = {
      requestedFieldIds: [field.id],
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "assistant", content: prompt },
        { role: "user", content: raw },
      ],
      seed: guidedStateToCharterDTO(state),
    };

    if (typeof getExtractionContext === "function") {
      try {
        const context = getExtractionContext();
        if (context?.attachments && context.attachments.length > 0) {
          request.attachments = context.attachments;
        }
        if (context?.voice && context.voice.length > 0) {
          request.voice = context.voice;
        }
      } catch (error) {
        // ignore context resolution errors to avoid breaking the flow
        console.error("Failed to resolve guided extraction context", error);
      }
    }

    const runExtraction = extractFieldsFromUtterance;
    if (typeof runExtraction !== "function") {
      const name = field.reviewLabel ?? field.label;
      dispatch({ type: "REJECT", fieldId: field.id, issues: [] });
      sendAssistantMessage(
        `I couldn’t validate ${name} because the extractor isn’t available. Try again or type "skip".`,
      );
      clearPendingToolData();
      return true;
    }

    (async () => {
      let result: CharterExtractionResult;
      try {
        result = await runExtraction(request);
      } catch (error) {
        if (shouldIgnoreExtraction()) {
          return;
        }
        const name = field.reviewLabel ?? field.label;
        dispatch({ type: "REJECT", fieldId: field.id, issues: [] });
        const fallback = error instanceof Error && error.message ? ` ${error.message}` : "";
        sendAssistantMessage(
          `I couldn’t validate ${name} because the extractor was unavailable.${fallback} Try again or type "skip".`,
        );
        clearPendingToolData();
        return;
      }

      if (shouldIgnoreExtraction()) {
        return;
      }

      if (!result.ok) {
        const errorMessage =
          result.error?.message ?? `I couldn’t validate ${field.label}.`;
        const name = field.reviewLabel ?? field.label;
        const issues = [errorMessage];
        dispatch({ type: "REJECT", fieldId: field.id, issues });
        clearPendingToolData();
        const suffix =
          result.error?.code === "validation_failed" ||
          result.error?.code === "missing_required"
            ? "Try again or type \"skip\" to move on."
            : "Let’s try again or you can type \"skip\".";
        sendAssistantMessage(`${errorMessage} ${suffix}`);
        return;
      }

      const fieldValue = result.fields[field.id];
      if (shouldIgnoreExtraction()) {
        return;
      }
      if (fieldValue == null) {
        const name = field.reviewLabel ?? field.label;
        dispatch({ type: "REJECT", fieldId: field.id, issues: [] });
        clearPendingToolData();
        sendAssistantMessage(
          `I couldn’t find details for ${name}. Share an update or type "skip" to move on.`,
        );
        return;
      }

      const normalizedValue = cloneValue(fieldValue) as FieldValue;
      const summary = formatFieldValue(normalizedValue);
      if (shouldIgnoreExtraction()) {
        return;
      }
      if (!summary) {
        const name = field.reviewLabel ?? field.label;
        dispatch({ type: "REJECT", fieldId: field.id, issues: [] });
        clearPendingToolData();
        sendAssistantMessage(
          `I wasn’t able to capture ${name}. Try again or type "skip" to move on.`,
        );
        return;
      }

      clearPendingToolData();
      pendingToolFields = cloneValue(result.fields);
      pendingToolWarnings = result.warnings.map((issue) => ({ ...issue }));

      const warningMessages = result.warnings.map((issue) => issue.message).filter(Boolean);

      dispatch({
        type: "PROPOSE",
        fieldId: field.id,
        value: normalizedValue,
        warnings: warningMessages,
        awaitingConfirmation: true,
      });

      const name = field.reviewLabel ?? field.label;
      sendAssistantMessage(
        `Here’s what I captured for ${name}: ${summary}. Reply "yes" to save it, or share an update.`,
      );

      if (warningMessages.length > 0) {
        sendAssistantMessage(`Heads up: ${warningMessages.join(" ")}`);
      }
    })();

    return true;
  }

  function startSession() {
    if (state.status === "complete") {
      completionNotified = false;
      setState(createInitialGuidedState());
    }

    if (state.status !== "idle") {
      return;
    }

    sendAssistantMessage(
      "Let’s build your charter step-by-step. I’ll ask about each section—type \"skip\" to move on, \"back\" to revisit the previous question, or \"edit <field name>\" to jump to a specific section."
    );
    dispatch({ type: "START" });
    promptCurrentField();
  }

  const orchestrator: GuidedOrchestrator = {
    getState() {
      return state;
    },
    start() {
      startSession();
    },
    reset() {
      completionNotified = false;
      const initial = createInitialGuidedState();
      setState(initial);
      clearPendingToolData();
    },
    handleUserMessage(message: string) {
      if (state.status === "idle") {
        return false;
      }

      const command = extractCommand(message);
      if (command) {
        return handleCommand(command);
      }

      if (!isStateActive(state)) {
        return false;
      }

      return handleAnswer(message);
    },
    isActive() {
      return isStateActive(state);
    },
    isAutoExtractionDisabled() {
      return isStateActive(state);
    },
    getPendingProposal() {
      return getPendingMetadata();
    },
    approvePendingProposal() {
      const pendingFieldId = state.pendingFieldId;
      if (!pendingFieldId) {
        return false;
      }
      const pendingDefinition = state.fields[pendingFieldId]?.definition ?? null;
      dispatch({ type: "CONFIRM_PENDING" });
      clearPendingToolData();
      const name =
        pendingDefinition?.reviewLabel ?? pendingDefinition?.label ?? "that section";
      sendAssistantMessage(`Saved ${name}.`);
      promptCurrentField();
      return true;
    },
    rejectPendingProposal() {
      const pendingFieldId = state.pendingFieldId;
      if (!pendingFieldId) {
        clearPendingToolData();
        return false;
      }
      const pendingDefinition = state.fields[pendingFieldId]?.definition ?? null;
      dispatch({ type: "REJECT_PENDING" });
      clearPendingToolData();
      const name =
        pendingDefinition?.reviewLabel ?? pendingDefinition?.label ?? "that section";
      sendAssistantMessage(
        `No problem—let’s adjust ${name}. Share the right details or type "skip" to move on.`,
      );
      promptCurrentField();
      return true;
    },
    addPendingListener(listener: PendingListener) {
      pendingListeners.add(listener);
      listener(getPendingMetadata());
      return () => {
        pendingListeners.delete(listener);
      };
    },
  };

  // Emit initial state to listeners
  emitState(state);
  emitActive(active);
  emitPendingMetadata();

  return orchestrator;
}

export default createGuidedOrchestrator;
