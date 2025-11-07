import {
  createInitialGuidedState,
  getCurrentField,
  getCurrentFieldState,
  guidedReducer,
  type FieldValue,
  type GuidedEvent,
  type GuidedState,
} from "../../src/features/charter/guidedState";
import { CHARTER_FIELDS, type CharterField, type CharterFieldId } from "../../src/features/charter/schema";
import { guidedStateToCharterDTO, type CharterDTO } from "../../src/features/charter/persist";
import { validateField } from "../../src/features/charter/validate";
import { SYSTEM_PROMPT } from "../../src/features/charter/prompts";
import { getTitleCandidate } from "../../src/features/charter/titlePreprocessor";

type StateEmitter = (state: GuidedState) => void;
type AssistantEmitter = (message: string) => void;

export type Command =
  | { type: "skip" }
  | { type: "back" }
  | { type: "review" }
  | { type: "edit"; target?: string };

interface SessionContext {
  state: GuidedState;
  completionNotified: boolean;
  pendingMessages: string[];
}

export interface InteractionOptions {
  conversationId: string;
  correlationId?: string | null;
  emitAssistantMessage?: AssistantEmitter;
  emitState?: StateEmitter;
}

export interface InteractionResult {
  handled: boolean;
  assistantMessages: string[];
  state: GuidedState;
  idempotent?: boolean;
}

const sessions = new Map<string, SessionContext>();

interface IdempotentEntry {
  expiresAt: number;
  result: InteractionResult;
}

const idempotencyMap = new Map<string, IdempotentEntry>();
const IDEMPOTENCY_TTL_MS = 60_000;

function cleanupIdempotency(now: number) {
  for (const [key, entry] of idempotencyMap.entries()) {
    if (entry.expiresAt <= now) {
      idempotencyMap.delete(key);
    }
  }
}

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

function cloneState<T>(value: T): T {
  const globalWithClone = globalThis as typeof globalThis & {
    structuredClone?: <U>(input: U) => U;
  };
  if (typeof globalWithClone.structuredClone === "function") {
    return globalWithClone.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function requireConversationId(conversationId: string): string {
  const key = conversationId?.trim();
  if (!key) {
    throw new Error("conversationId is required");
  }
  return key;
}

function getSession(conversationId: string): SessionContext {
  const key = requireConversationId(conversationId);
  let session = sessions.get(key);
  if (!session) {
    session = {
      state: createInitialGuidedState(),
      completionNotified: false,
      pendingMessages: [],
    };
    sessions.set(key, session);
  }
  return session;
}

function sendAssistantMessage(
  session: SessionContext,
  options: InteractionOptions | undefined,
  message: string,
) {
  const normalized = normalizeWhitespace(message);
  if (!normalized) {
    return;
  }
  session.pendingMessages.push(normalized);
  try {
    options?.emitAssistantMessage?.(normalized);
  } catch {
    // ignore emitter errors to avoid breaking the flow
  }
}

function setState(
  session: SessionContext,
  nextState: GuidedState,
  options: InteractionOptions | undefined,
) {
  const changed = nextState !== session.state;
  session.state = nextState;
  if (changed) {
    try {
      options?.emitState?.(nextState);
    } catch {
      // ignore emitter errors
    }
  }
  return changed;
}

function dispatch(
  session: SessionContext,
  event: GuidedEvent,
  options: InteractionOptions | undefined,
): boolean {
  const nextState = guidedReducer(session.state, event);
  return setState(session, nextState, options);
}

function promptCurrentFieldInternal(
  session: SessionContext,
  options: InteractionOptions | undefined,
) {
  const { state } = session;
  const currentField = getCurrentField(state);
  if (!currentField) {
    if (state.status === "complete" && !session.completionNotified) {
      session.completionNotified = true;
      sendAssistantMessage(
        session,
        options,
        "That covers every section. I’ve saved your charter responses—you can review or edit any field with \"edit <field name>\".",
      );
    }
    return;
  }

  session.completionNotified = false;
  const fieldState = getCurrentFieldState(state);
  const prompt = formatFieldPrompt(
    currentField,
    fieldState?.confirmedValue ?? fieldState?.value ?? null,
  );
  sendAssistantMessage(session, options, prompt);
}

function handleSkip(
  session: SessionContext,
  options: InteractionOptions | undefined,
): boolean {
  const { state } = session;
  const field = getCurrentField(state);
  if (!field) {
    sendAssistantMessage(session, options, "All charter fields are already complete.");
    return true;
  }
  const name = field.reviewLabel ?? field.label;
  sendAssistantMessage(session, options, `Skipping ${name}.`);
  dispatch(session, { type: "SKIP", fieldId: field.id, reason: "user-skipped" }, options);
  promptCurrentFieldInternal(session, options);
  return true;
}

function handleBack(
  session: SessionContext,
  options: InteractionOptions | undefined,
): boolean {
  const before = getCurrentField(session.state);
  dispatch(session, { type: "BACK" }, options);
  const current = getCurrentField(session.state);
  if (!current) {
    sendAssistantMessage(session, options, "We’re at the beginning of the charter questions.");
    return true;
  }
  const name = current.reviewLabel ?? current.label;
  if (before && before.id === current.id) {
    sendAssistantMessage(session, options, `You’re already focused on ${name}.`);
  } else {
    sendAssistantMessage(session, options, `Let’s revisit ${name}.`);
  }
  promptCurrentFieldInternal(session, options);
  return true;
}

function handleReview(
  session: SessionContext,
  options: InteractionOptions | undefined,
): boolean {
  const { state } = session;
  if (state.status === "idle") {
    sendAssistantMessage(session, options, "Start the charter session to see progress.");
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

  sendAssistantMessage(session, options, `Review summary — ${segments.join(" ")}`);
  return true;
}

function handleEdit(
  session: SessionContext,
  options: InteractionOptions | undefined,
  target?: string,
): boolean {
  if (!target && !getCurrentField(session.state)) {
    sendAssistantMessage(
      session,
      options,
      "Let me know which field you’d like to edit—try \"edit risks\".",
    );
    return true;
  }

  const targetId = target ? findFieldId(target) : session.state.currentFieldId;
  if (!targetId) {
    sendAssistantMessage(
      session,
      options,
      "I couldn’t find that section. Try something like \"edit project description\".",
    );
    return true;
  }

  dispatch(session, { type: "ASK", fieldId: targetId }, options);
  const current = getCurrentField(session.state);
  if (current) {
    const name = current.reviewLabel ?? current.label;
    sendAssistantMessage(session, options, `Okay, updating ${name}.`);
    promptCurrentFieldInternal(session, options);
  }
  return true;
}

function handleCommandInternal(
  session: SessionContext,
  command: Command,
  options: InteractionOptions | undefined,
): boolean {
  switch (command.type) {
    case "skip":
      return handleSkip(session, options);
    case "back":
      return handleBack(session, options);
    case "review":
      return handleReview(session, options);
    case "edit":
      return handleEdit(session, options, command.target);
    default:
      return false;
  }
}

function handleAnswer(
  session: SessionContext,
  options: InteractionOptions | undefined,
  raw: string,
): boolean {
  const field = getCurrentField(session.state);
  if (!field) {
    return false;
  }

  const normalizedInput = normalizeWhitespace(raw);
  if (!normalizedInput) {
    sendAssistantMessage(
      session,
      options,
      `I didn’t catch a response for ${field.label}. Share an update or type "skip".`,
    );
    return true;
  }

  const candidate = field.id === "project_name" ? getTitleCandidate(raw) : "";
  const capturedValue = candidate || normalizedInput;

  dispatch(session, { type: "CAPTURE", fieldId: field.id, value: capturedValue }, options);

  const validation = validateField(field, capturedValue);
  if (!validation.valid) {
    dispatch(session, {
      type: "VALIDATE",
      fieldId: field.id,
      valid: false,
      issues: validation.message ? [validation.message] : [],
      value: capturedValue,
    }, options);
    const errorMessage = validation.message
      ? `${validation.message} Try again or type "skip" to move on.`
      : `That doesn’t look right for ${field.label}. Please try again or type "skip".`;
    sendAssistantMessage(session, options, errorMessage);
    return true;
  }

  dispatch(session, {
    type: "VALIDATE",
    fieldId: field.id,
    valid: true,
    value: capturedValue,
    normalizedValue: capturedValue,
  }, options);
  const name = field.reviewLabel ?? field.label;
  sendAssistantMessage(session, options, `Saved ${name}.`);
  dispatch(session, { type: "CONFIRM", fieldId: field.id }, options);
  promptCurrentFieldInternal(session, options);
  return true;
}

function finalizeInteraction(
  session: SessionContext,
  handled: boolean,
  idempotent?: boolean,
): InteractionResult {
  const messages = session.pendingMessages.slice();
  session.pendingMessages.length = 0;
  const stateSnapshot = cloneState(session.state);
  return {
    handled,
    assistantMessages: messages,
    state: stateSnapshot,
    idempotent,
  };
}

function cloneInteractionResult(result: InteractionResult): InteractionResult {
  return {
    handled: result.handled,
    assistantMessages: result.assistantMessages.slice(),
    state: cloneState(result.state),
    idempotent: result.idempotent,
  };
}

function withIdempotency(
  options: InteractionOptions,
  compute: (session: SessionContext) => InteractionResult,
): InteractionResult {
  const correlationId = options.correlationId?.trim();
  if (correlationId) {
    const now = Date.now();
    cleanupIdempotency(now);
    const cached = idempotencyMap.get(correlationId);
    if (cached && cached.expiresAt > now) {
      const snapshot = cloneInteractionResult(cached.result);
      return { ...snapshot, idempotent: true };
    }
    const session = getSession(options.conversationId);
    const result = compute(session);
    idempotencyMap.set(correlationId, {
      expiresAt: now + IDEMPOTENCY_TTL_MS,
      result: cloneInteractionResult(result),
    });
    return result;
  }
  const session = getSession(options.conversationId);
  return compute(session);
}

export function startSession(options: InteractionOptions): InteractionResult {
  return withIdempotency(options, (session) => {
    if (session.state.status === "complete") {
      session.completionNotified = false;
      setState(session, createInitialGuidedState(), options);
    }

    if (session.state.status !== "idle") {
      return finalizeInteraction(session, false);
    }

    sendAssistantMessage(
      session,
      options,
      "Let’s build your charter step-by-step. I’ll ask about each section—type \"skip\" to move on, \"back\" to revisit the previous question, or \"edit <field name>\" to jump to a specific section.",
    );
    dispatch(session, { type: "START" }, options);
    promptCurrentFieldInternal(session, options);
    return finalizeInteraction(session, true);
  });
}

export function handleCommand(
  options: InteractionOptions,
  command: string | Command,
): InteractionResult {
  return withIdempotency(options, (session) => {
    const resolvedCommand = typeof command === "string" ? extractCommand(command) : command;
    if (!resolvedCommand) {
      return finalizeInteraction(session, false);
    }
    const handled = handleCommandInternal(session, resolvedCommand, options);
    return finalizeInteraction(session, handled);
  });
}

export function handleUserMessage(
  options: InteractionOptions,
  message: string,
): InteractionResult {
  return withIdempotency(options, (session) => {
    if (session.state.status === "idle") {
      return finalizeInteraction(session, false);
    }

    const command = extractCommand(message);
    if (command) {
      const handledCommand = handleCommandInternal(session, command, options);
      return finalizeInteraction(session, handledCommand);
    }

    if (!isStateActive(session.state)) {
      return finalizeInteraction(session, false);
    }

    const handled = handleAnswer(session, options, message);
    return finalizeInteraction(session, handled);
  });
}

export function promptCurrentField(options: InteractionOptions): InteractionResult {
  return withIdempotency(options, (session) => {
    promptCurrentFieldInternal(session, options);
    return finalizeInteraction(session, true);
  });
}

export function getState(conversationId: string): GuidedState {
  return getSession(conversationId).state;
}

export function resetSession(conversationId: string) {
  const session = getSession(conversationId);
  session.completionNotified = false;
  setState(session, createInitialGuidedState(), undefined);
  session.pendingMessages.length = 0;
}

export function toCharterDTO(state: GuidedState | null | undefined): CharterDTO {
  return guidedStateToCharterDTO(state);
}

export { SYSTEM_PROMPT };

