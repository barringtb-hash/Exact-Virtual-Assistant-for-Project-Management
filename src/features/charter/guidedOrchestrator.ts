import {
  createInitialGuidedState,
  getCurrentField,
  getCurrentFieldState,
  guidedReducer,
  type FieldValue,
  type GuidedEvent,
  type GuidedState,
} from "./guidedState";
import { CHARTER_FIELDS, type CharterField, type CharterFieldId } from "./schema";
import { validateField } from "./validate";

type StateListener = (state: GuidedState) => void;

type ActiveListener = (active: boolean) => void;

export interface GuidedOrchestratorOptions {
  postAssistantMessage: (message: string) => void;
  onStateChange?: StateListener;
  onActiveChange?: ActiveListener;
}

export interface GuidedOrchestrator {
  getState(): GuidedState;
  start(): void;
  reset(): void;
  handleUserMessage(message: string): boolean;
  isActive(): boolean;
  isAutoExtractionDisabled(): boolean;
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

export function createGuidedOrchestrator({
  postAssistantMessage,
  onStateChange,
  onActiveChange,
}: GuidedOrchestratorOptions): GuidedOrchestrator {
  let state = createInitialGuidedState();
  let active = isStateActive(state);
  let completionNotified = false;

  const listeners: Set<StateListener> = new Set();
  const activeListeners: Set<ActiveListener> = new Set();

  if (onStateChange) {
    listeners.add(onStateChange);
  }

  if (onActiveChange) {
    activeListeners.add(onActiveChange);
  }

  function emitState(next: GuidedState) {
    listeners.forEach((listener) => listener(next));
  }

  function emitActive(next: boolean) {
    activeListeners.forEach((listener) => listener(next));
  }

  function setState(next: GuidedState) {
    state = next;
    const nextActive = isStateActive(next);
    if (nextActive !== active) {
      active = nextActive;
      emitActive(active);
    }
    emitState(next);
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
    sendAssistantMessage(`Skipping ${field.label}.`);
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
    if (before && before.id === current.id) {
      sendAssistantMessage(`You’re already focused on ${current.label}.`);
    } else {
      sendAssistantMessage(`Let’s revisit ${current.label}.`);
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
      const label = fieldState.definition?.label;
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
        segments.push(`Currently focused on ${currentField.label}.`);
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
      sendAssistantMessage(`Okay, updating ${current.label}.`);
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

    const trimmed = normalizeWhitespace(raw);
    if (!trimmed) {
      sendAssistantMessage(
        `I didn’t catch a response for ${field.label}. Share an update or type "skip".`
      );
      return true;
    }

    dispatch({ type: "CAPTURE", fieldId: field.id, value: trimmed });

    const validation = validateField(field, trimmed);
    if (!validation.valid) {
      dispatch({
        type: "VALIDATE",
        fieldId: field.id,
        valid: false,
        issues: validation.message ? [validation.message] : [],
        value: trimmed,
      });
      const errorMessage = validation.message
        ? `${validation.message} Try again or type "skip" to move on.`
        : `That doesn’t look right for ${field.label}. Please try again or type "skip".`;
      sendAssistantMessage(errorMessage);
      return true;
    }

    dispatch({
      type: "VALIDATE",
      fieldId: field.id,
      valid: true,
      value: trimmed,
      normalizedValue: trimmed,
    });
    sendAssistantMessage(`Saved ${field.label}.`);
    dispatch({ type: "CONFIRM", fieldId: field.id });
    promptCurrentField();
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
  };

  // Emit initial state to listeners
  emitState(state);
  emitActive(active);

  return orchestrator;
}

export default createGuidedOrchestrator;
