/**
 * Server-side charter orchestrator
 * Ported from client: src/features/charter/guidedOrchestrator.ts
 *
 * This orchestrator manages guided charter sessions on the server,
 * emitting events that the client can apply to update its UI and draft state.
 */

import {
  createInitialGuidedState,
  getCurrentField,
  getCurrentFieldState,
  guidedReducer,
  type FieldValue,
  type GuidedEvent,
  type GuidedState,
} from "../../src/features/charter/guidedState.js";
import { CHARTER_FIELDS, type CharterField, type CharterFieldId } from "../../src/features/charter/schema.js";
import { validateField } from "../../src/features/charter/validate.js";

type Command =
  | { type: "skip" }
  | { type: "back" }
  | { type: "review" }
  | { type: "edit"; target?: string };

export type AssistantEvent =
  | { type: "assistant_prompt"; text: string }
  | { type: "slot_update"; slot: CharterFieldId; value?: string; status: "captured" | "confirmed" | "skipped" };

export interface ServerOrchestratorState {
  guidedState: GuidedState;
  conversationId: string;
  correlationId: string;
  voiceEnabled: boolean;
  completionNotified: boolean;
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

export class ServerOrchestrator {
  private state: ServerOrchestratorState;

  constructor(conversationId: string, correlationId: string, voiceEnabled = true) {
    this.state = {
      guidedState: createInitialGuidedState(),
      conversationId,
      correlationId,
      voiceEnabled,
      completionNotified: false,
    };
  }

  private dispatch(event: GuidedEvent): void {
    const nextState = guidedReducer(this.state.guidedState, event);
    if (nextState !== this.state.guidedState) {
      this.state.guidedState = nextState;
    }
  }

  private promptCurrentField(): AssistantEvent[] {
    const currentField = getCurrentField(this.state.guidedState);
    if (!currentField) {
      if (this.state.guidedState.status === "complete" && !this.state.completionNotified) {
        this.state.completionNotified = true;
        return [
          {
            type: "assistant_prompt",
            text: "That covers every section. I've saved your charter responses—you can review or edit any field with \"edit <field name>\".",
          },
        ];
      }
      return [];
    }

    this.state.completionNotified = false;
    const fieldState = getCurrentFieldState(this.state.guidedState);
    const prompt = formatFieldPrompt(
      currentField,
      fieldState?.confirmedValue ?? fieldState?.value ?? null,
    );
    return [{ type: "assistant_prompt", text: prompt }];
  }

  private handleSkip(): AssistantEvent[] {
    const field = getCurrentField(this.state.guidedState);
    if (!field) {
      return [{ type: "assistant_prompt", text: "All charter fields are already complete." }];
    }
    const name = field.reviewLabel ?? field.label;
    this.dispatch({ type: "SKIP", fieldId: field.id, reason: "user-skipped" });
    return [
      { type: "assistant_prompt", text: `Skipping ${name}.` },
      { type: "slot_update", slot: field.id, status: "skipped" },
      ...this.promptCurrentField(),
    ];
  }

  private handleBack(): AssistantEvent[] {
    const before = getCurrentField(this.state.guidedState);
    this.dispatch({ type: "BACK" });
    const current = getCurrentField(this.state.guidedState);
    if (!current) {
      return [{ type: "assistant_prompt", text: "We're at the beginning of the charter questions." }];
    }
    const name = current.reviewLabel ?? current.label;
    if (before && before.id === current.id) {
      return [
        { type: "assistant_prompt", text: `You're already focused on ${name}.` },
        ...this.promptCurrentField(),
      ];
    } else {
      return [
        { type: "assistant_prompt", text: `Let's revisit ${name}.` },
        ...this.promptCurrentField(),
      ];
    }
  }

  private handleReview(): AssistantEvent[] {
    if (this.state.guidedState.status === "idle") {
      return [{ type: "assistant_prompt", text: "Start the charter session to see progress." }];
    }

    const confirmedLabels: string[] = [];
    const skippedLabels: string[] = [];
    const pendingLabels: string[] = [];

    for (const fieldId of this.state.guidedState.order) {
      if (!fieldId) continue;
      const fieldState = this.state.guidedState.fields[fieldId];
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

    if (pendingLabels.length > 0 && this.state.guidedState.status !== "complete") {
      segments.push(`Still in progress: ${formatList(pendingLabels)}.`);
    }

    if (this.state.guidedState.status === "complete") {
      segments.unshift("All charter sections are complete.");
    } else {
      const currentField = getCurrentField(this.state.guidedState);
      if (currentField) {
        const name = currentField.reviewLabel ?? currentField.label;
        segments.push(`Currently focused on ${name}.`);
      }
    }

    if (segments.length === 0) {
      segments.push("We haven't captured any charter responses yet.");
    }

    return [{ type: "assistant_prompt", text: `Review summary — ${segments.join(" ")}` }];
  }

  private handleEdit(target?: string): AssistantEvent[] {
    if (!target && !getCurrentField(this.state.guidedState)) {
      return [{ type: "assistant_prompt", text: "Let me know which field you'd like to edit—try \"edit risks\"." }];
    }

    const targetId = target ? findFieldId(target) : this.state.guidedState.currentFieldId;
    if (!targetId) {
      return [
        {
          type: "assistant_prompt",
          text: "I couldn't find that section. Try something like \"edit project description\".",
        },
      ];
    }

    this.dispatch({ type: "ASK", fieldId: targetId });
    const current = getCurrentField(this.state.guidedState);
    if (current) {
      const name = current.reviewLabel ?? current.label;
      return [
        { type: "assistant_prompt", text: `Okay, updating ${name}.` },
        ...this.promptCurrentField(),
      ];
    }
    return [];
  }

  private handleCommand(command: Command): AssistantEvent[] {
    switch (command.type) {
      case "skip":
        return this.handleSkip();
      case "back":
        return this.handleBack();
      case "review":
        return this.handleReview();
      case "edit":
        return this.handleEdit(command.target);
      default:
        return [];
    }
  }

  private handleAnswer(raw: string): AssistantEvent[] {
    const field = getCurrentField(this.state.guidedState);
    if (!field) {
      return [];
    }

    const trimmed = normalizeWhitespace(raw);
    if (!trimmed) {
      return [
        {
          type: "assistant_prompt",
          text: `I didn't catch a response for ${field.label}. Share an update or type "skip".`,
        },
      ];
    }

    this.dispatch({ type: "CAPTURE", fieldId: field.id, value: trimmed });

    const validation = validateField(field, trimmed);
    if (!validation.valid) {
      this.dispatch({
        type: "VALIDATE",
        fieldId: field.id,
        valid: false,
        issues: validation.message ? [validation.message] : [],
        value: trimmed,
      });
      const errorMessage = validation.message
        ? `${validation.message} Try again or type "skip" to move on.`
        : `That doesn't look right for ${field.label}. Please try again or type "skip".`;
      return [{ type: "assistant_prompt", text: errorMessage }];
    }

    this.dispatch({
      type: "VALIDATE",
      fieldId: field.id,
      valid: true,
      value: trimmed,
      normalizedValue: trimmed,
    });
    const name = field.reviewLabel ?? field.label;
    this.dispatch({ type: "CONFIRM", fieldId: field.id });

    return [
      { type: "assistant_prompt", text: `Saved ${name}.` },
      { type: "slot_update", slot: field.id, value: trimmed, status: "captured" },
      { type: "slot_update", slot: field.id, status: "confirmed" },
      ...this.promptCurrentField(),
    ];
  }

  public startSession(): AssistantEvent[] {
    if (this.state.guidedState.status === "complete") {
      this.state.completionNotified = false;
      this.state.guidedState = createInitialGuidedState();
    }

    if (this.state.guidedState.status !== "idle") {
      return [];
    }

    const events: AssistantEvent[] = [
      {
        type: "assistant_prompt",
        text: "Let's build your charter step-by-step. I'll ask about each section—type \"skip\" to move on, \"back\" to revisit the previous question, or \"edit <field name>\" to jump to a specific section.",
      },
    ];

    this.dispatch({ type: "START" });
    events.push(...this.promptCurrentField());

    return events;
  }

  public handleUserMessage(message: string, source: "voice" | "chat" = "chat"): AssistantEvent[] {
    if (this.state.guidedState.status === "idle") {
      return [];
    }

    const command = extractCommand(message);
    if (command) {
      return this.handleCommand(command);
    }

    if (!isStateActive(this.state.guidedState)) {
      return [];
    }

    return this.handleAnswer(message);
  }

  public getState(): ServerOrchestratorState {
    return this.state;
  }

  public isActive(): boolean {
    return isStateActive(this.state.guidedState);
  }
}

export default ServerOrchestrator;
