import { randomUUID } from "crypto";

import {
  handleCommand as orchestratorHandleCommand,
  handleUserMessage as orchestratorHandleUserMessage,
  startSession as orchestratorStartSession,
  deleteSession as orchestratorDeleteSession,
  hasSession as orchestratorHasSession,
  SessionNotFoundError as OrchestratorSessionNotFoundError,
  type InteractionResult,
} from "../../../server/charter/Orchestrator";
import {
  createInitialGuidedState,
  type FieldStatus,
  type FieldValue,
  type GuidedFieldState,
  type GuidedState,
  type GuidedStatus,
  type GuidedWaitingState,
} from "../../../src/features/charter/guidedState";
import {
  CHARTER_FIELDS,
  type CharterField,
  type CharterFieldChild,
  type CharterFieldId,
} from "../../../src/features/charter/schema";

export class CharterSessionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ConversationNotFoundError extends CharterSessionError {
  constructor(message = "Conversation not found") {
    super(message, 404, "conversation_not_found");
  }
}

export class ConversationExpiredError extends CharterSessionError {
  constructor(message = "Conversation expired") {
    super(message, 410, "conversation_expired");
  }
}

export class ConversationBadRequestError extends CharterSessionError {
  constructor(message = "Invalid request") {
    super(message, 400, "bad_request");
  }
}

export interface AssistantPromptEvent {
  type: "assistant_prompt";
  event_id: string;
  conversation_id: string;
  message: string;
  created_at: string;
}

export interface SlotStateEvent {
  slot_id: CharterFieldId;
  status: FieldStatus;
  value: FieldValue | null;
  confirmed_value: FieldValue | null;
  issues: string[];
  skipped_reason: string | null;
  last_asked_at: string | null;
  last_updated_at: string | null;
}

export interface SlotUpdateEvent {
  type: "slot_update";
  event_id: string;
  conversation_id: string;
  status: GuidedStatus;
  current_slot_id: CharterFieldId | null;
  waiting: GuidedWaitingState;
  started_at: string | null;
  completed_at: string | null;
  slots: SlotStateEvent[];
}

export type CharterEvent = AssistantPromptEvent | SlotUpdateEvent;

export interface SlotDescriptorChild {
  id: string;
  label: string;
  type: CharterFieldChild["type"];
  placeholder: string | null;
}

export interface SlotDescriptor {
  slot_id: CharterFieldId;
  label: string;
  question: string;
  help_text: string;
  required: boolean;
  type: CharterField["type"];
  placeholder: string | null;
  example: string | null;
  max_length: number | null;
  review_label: string | null;
  children: SlotDescriptorChild[];
}

interface SessionRecord {
  conversationId: string;
  createdAt: number;
  lastActiveAt: number;
  state: GuidedState;
  watchers: Set<SessionListener>;
}

type SessionListener = (event: CharterEvent | null) => void;

interface CorrelationEntry {
  conversationId: string;
  expiresAt: number;
  response: StartConversationResult;
}

const sessions = new Map<string, SessionRecord>();
const expiredSessions = new Map<string, number>();
const correlationIndex = new Map<string, CorrelationEntry>();

const CORRELATION_TTL_MS = 60_000;
const SESSION_IDLE_TTL_MS = 5 * 60_000;
const EXPIRED_SESSION_TTL_MS = 10 * 60_000;

const SLOT_DESCRIPTORS: SlotDescriptor[] = CHARTER_FIELDS.map((field) => ({
  slot_id: field.id,
  label: field.label,
  question: field.question,
  help_text: field.helpText,
  required: field.required,
  type: field.type,
  placeholder: field.placeholder ?? null,
  example: field.example ?? null,
  max_length: field.maxLength ?? null,
  review_label: field.reviewLabel ?? null,
  children: (field.children ?? []).map((child) => ({
    id: child.id,
    label: child.label,
    type: child.type,
    placeholder: child.placeholder ?? null,
  })),
}));

export function getSlotDescriptors(): SlotDescriptor[] {
  return cloneValue(SLOT_DESCRIPTORS);
}

function cloneValue<T>(value: T): T {
  const globalWithClone = globalThis as typeof globalThis & {
    structuredClone?: <U>(input: U) => U;
  };
  if (typeof globalWithClone.structuredClone === "function") {
    return globalWithClone.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function sanitizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCommand(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() ? value : null;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    return joined || null;
  }
  return null;
}

function cloneState(state: GuidedState): GuidedState {
  return cloneValue(state);
}

function cloneEvents(events: CharterEvent[]): CharterEvent[] {
  return cloneValue(events);
}

function safeCall(listener: SessionListener, payload: CharterEvent | null) {
  try {
    listener(payload);
  } catch {
    // Ignore listener errors to keep other subscribers responsive.
  }
}

function cleanupCorrelation(now: number) {
  for (const [correlationId, entry] of correlationIndex.entries()) {
    if (entry.expiresAt <= now || !sessions.has(entry.conversationId)) {
      correlationIndex.delete(correlationId);
    }
  }
}

function cleanupExpiredSessions(now: number) {
  for (const [conversationId, record] of sessions.entries()) {
    if (now - record.lastActiveAt > SESSION_IDLE_TTL_MS) {
      sessions.delete(conversationId);
      expiredSessions.set(conversationId, now);
      if (orchestratorHasSession(conversationId)) {
        orchestratorDeleteSession(conversationId);
      }
      for (const listener of record.watchers) {
        safeCall(listener, null);
      }
      record.watchers.clear();
    }
  }
}

function cleanupExpiredMarkers(now: number) {
  for (const [conversationId, expiredAt] of expiredSessions.entries()) {
    if (now - expiredAt > EXPIRED_SESSION_TTL_MS) {
      expiredSessions.delete(conversationId);
    }
  }
}

function cleanup() {
  const now = Date.now();
  cleanupCorrelation(now);
  cleanupExpiredSessions(now);
  cleanupExpiredMarkers(now);
}

function getSessionRecord(conversationId: string): SessionRecord {
  const key = sanitizeString(conversationId);
  if (!key) {
    throw new ConversationBadRequestError("conversation_id is required");
  }
  const existing = sessions.get(key);
  if (existing) {
    return existing;
  }
  if (expiredSessions.has(key)) {
    throw new ConversationExpiredError();
  }
  throw new ConversationNotFoundError();
}

function buildAssistantPromptEvent(
  conversationId: string,
  message: string,
): AssistantPromptEvent {
  return {
    type: "assistant_prompt",
    event_id: randomUUID(),
    conversation_id: conversationId,
    message,
    created_at: new Date().toISOString(),
  };
}

function cloneFieldValue(value: FieldValue | null): FieldValue | null {
  if (value == null) {
    return null;
  }
  return cloneValue(value);
}

function mapFieldState(fieldState: GuidedFieldState): SlotStateEvent {
  return {
    slot_id: fieldState.id,
    status: fieldState.status,
    value: cloneFieldValue(fieldState.value ?? null),
    confirmed_value: cloneFieldValue(fieldState.confirmedValue ?? null),
    issues: fieldState.issues ? [...fieldState.issues] : [],
    skipped_reason: fieldState.skippedReason ?? null,
    last_asked_at: fieldState.lastAskedAt ?? null,
    last_updated_at: fieldState.lastUpdatedAt ?? null,
  };
}

function buildSlotUpdateEvent(
  conversationId: string,
  state: GuidedState,
): SlotUpdateEvent {
  const slots: SlotStateEvent[] = [];
  for (const field of CHARTER_FIELDS) {
    const fieldState = state.fields[field.id];
    if (fieldState) {
      slots.push(mapFieldState(fieldState));
    }
  }
  return {
    type: "slot_update",
    event_id: randomUUID(),
    conversation_id: conversationId,
    status: state.status,
    current_slot_id: state.currentFieldId,
    waiting: cloneValue(state.waiting),
    started_at: state.startedAt,
    completed_at: state.completedAt,
    slots,
  };
}

interface EventCollector {
  emitAssistant(message: string, notify?: boolean): void;
  emitState(state: GuidedState, notify?: boolean): void;
  finalize(result: InteractionResult, notifyIdempotent: boolean): CharterEvent[];
}

function createEventCollector(record: SessionRecord): EventCollector {
  const events: CharterEvent[] = [];
  const seenAssistant = new Set<string>();

  const push = (event: CharterEvent, notify: boolean) => {
    events.push(event);
    if (notify) {
      for (const listener of record.watchers) {
        safeCall(listener, event);
      }
    }
  };

  const emitAssistant = (message: string, notify = true) => {
    const normalized = message.trim();
    if (!normalized) {
      return;
    }
    seenAssistant.add(normalized);
    const event = buildAssistantPromptEvent(record.conversationId, normalized);
    push(event, notify);
  };

  const emitState = (state: GuidedState, notify = true) => {
    record.state = cloneState(state);
    const event = buildSlotUpdateEvent(record.conversationId, record.state);
    push(event, notify);
  };

  const finalize = (result: InteractionResult, notifyIdempotent: boolean) => {
    record.state = cloneState(result.state);
    if (result.idempotent || events.length === 0) {
      for (const message of result.assistantMessages) {
        if (typeof message !== "string") continue;
        const normalized = message.trim();
        if (!normalized) continue;
        if (!seenAssistant.has(normalized)) {
          emitAssistant(normalized, notifyIdempotent);
        } else if (notifyIdempotent) {
          const duplicate = buildAssistantPromptEvent(
            record.conversationId,
            normalized,
          );
          events.push(duplicate);
          for (const listener of record.watchers) {
            safeCall(listener, duplicate);
          }
        }
      }
      const finalEvent = buildSlotUpdateEvent(
        record.conversationId,
        record.state,
      );
      push(finalEvent, notifyIdempotent);
    }
    return cloneEvents(events);
  };

  return {
    emitAssistant,
    emitState,
    finalize,
  };
}

function registerSession(conversationId: string): SessionRecord {
  const record: SessionRecord = {
    conversationId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    state: createInitialGuidedState(),
    watchers: new Set(),
  };
  sessions.set(conversationId, record);
  return record;
}

function updateActivity(record: SessionRecord) {
  record.lastActiveAt = Date.now();
}

function cacheStartResponse(
  correlationId: string,
  response: StartConversationResult,
) {
  correlationIndex.set(correlationId, {
    conversationId: response.conversationId,
    expiresAt: Date.now() + CORRELATION_TTL_MS,
    response: {
      conversationId: response.conversationId,
      events: cloneEvents(response.events),
      initialPrompt: response.initialPrompt,
      idempotent: response.idempotent,
    },
  });
}

function getCachedStart(
  correlationId: string,
): StartConversationResult | null {
  const entry = correlationIndex.get(correlationId);
  if (!entry) {
    return null;
  }
  if (!sessions.has(entry.conversationId)) {
    correlationIndex.delete(correlationId);
    return null;
  }
  return {
    conversationId: entry.conversationId,
    events: cloneEvents(entry.response.events),
    initialPrompt: entry.response.initialPrompt,
    idempotent: true,
  };
}

export interface StartConversationOptions {
  correlationId?: string | null;
}

export interface StartConversationResult {
  conversationId: string;
  events: CharterEvent[];
  initialPrompt: string;
  idempotent: boolean;
}

export async function startConversation(
  options: StartConversationOptions = {},
): Promise<StartConversationResult> {
  cleanup();
  const correlationId = sanitizeString(options.correlationId ?? null);

  if (correlationId) {
    const cached = getCachedStart(correlationId);
    if (cached) {
      const record = getSessionRecord(cached.conversationId);
      updateActivity(record);
      return cached;
    }
  }

  const conversationId = randomUUID();
  const record = registerSession(conversationId);
  const collector = createEventCollector(record);

  const result = await orchestratorStartSession({
    conversationId,
    correlationId: correlationId ?? undefined,
    emitAssistantMessage: (message) => collector.emitAssistant(message, true),
    emitState: (state) => collector.emitState(state, true),
  });

  const events = collector.finalize(result, false);
  updateActivity(record);
  record.state = cloneState(result.state);

  const initialPrompt = events.find(
    (event): event is AssistantPromptEvent => event.type === "assistant_prompt",
  )?.message ?? "";

  const response: StartConversationResult = {
    conversationId,
    events,
    initialPrompt,
    idempotent: Boolean(result.idempotent),
  };

  if (correlationId) {
    cacheStartResponse(correlationId, response);
  }

  return response;
}

export interface InteractionOptions {
  conversationId: string;
  correlationId?: string | null;
  message?: string | null;
  command?: string | string[] | null;
}

export interface InteractionResultPayload {
  handled: boolean;
  idempotent: boolean;
  events: CharterEvent[];
  pending_tool_fields: InteractionResult["pendingToolFields"];
  pending_tool_arguments: InteractionResult["pendingToolArguments"];
  pending_tool_warnings: InteractionResult["pendingToolWarnings"];
}

export async function sendInteraction(
  options: InteractionOptions,
): Promise<InteractionResultPayload> {
  cleanup();
  const record = getSessionRecord(options.conversationId);
  const correlationId = sanitizeString(options.correlationId ?? null);
  const message =
    typeof options.message === "string" ? options.message : null;
  const command = normalizeCommand(options.command);

  if (!message && !command) {
    throw new ConversationBadRequestError(
      "Provide either message or command input.",
    );
  }

  const collector = createEventCollector(record);

  let result: InteractionResult;
  try {
    if (command) {
      result = await orchestratorHandleCommand(
        {
          conversationId: record.conversationId,
          correlationId: correlationId ?? undefined,
          emitAssistantMessage: (payload) => collector.emitAssistant(payload, true),
          emitState: (state) => collector.emitState(state, true),
        },
        command,
      );
    } else {
      result = await orchestratorHandleUserMessage(
        {
          conversationId: record.conversationId,
          correlationId: correlationId ?? undefined,
          emitAssistantMessage: (payload) => collector.emitAssistant(payload, true),
          emitState: (state) => collector.emitState(state, true),
        },
        message ?? "",
      );
    }
  } catch (error) {
    if (error instanceof OrchestratorSessionNotFoundError) {
      sessions.delete(record.conversationId);
      throw new ConversationExpiredError();
    }
    throw error;
  }

  const events = collector.finalize(result, false);
  updateActivity(record);

  return {
    handled: result.handled,
    idempotent: Boolean(result.idempotent),
    events,
    pending_tool_fields: result.pendingToolFields,
    pending_tool_arguments: result.pendingToolArguments,
    pending_tool_warnings: result.pendingToolWarnings,
  };
}

export interface StreamRegistration {
  detach(): void;
  snapshot: SlotUpdateEvent;
}

export function registerStream(
  conversationId: string,
  listener: SessionListener,
): StreamRegistration {
  cleanup();
  const record = getSessionRecord(conversationId);
  record.watchers.add(listener);
  return {
    detach() {
      record.watchers.delete(listener);
    },
    snapshot: buildSlotUpdateEvent(record.conversationId, record.state),
  };
}

export function closeConversation(conversationId: string) {
  const record = sessions.get(conversationId);
  if (record) {
    sessions.delete(conversationId);
    if (orchestratorHasSession(conversationId)) {
      orchestratorDeleteSession(conversationId);
    }
    for (const listener of record.watchers) {
      safeCall(listener, null);
    }
    record.watchers.clear();
  }
  expiredSessions.set(conversationId, Date.now());
}
