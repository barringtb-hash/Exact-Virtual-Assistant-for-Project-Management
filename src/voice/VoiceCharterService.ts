/**
 * VoiceCharterService - Manages voice-based charter conversation flow.
 *
 * This service coordinates between the OpenAI Realtime API and the charter
 * form, enabling a fully conversational voice-first charter creation experience.
 *
 * @module voice/VoiceCharterService
 */

import type { CharterFormField, CharterFormSchema } from "../features/charter/utils/formSchema";
import {
  createSessionUpdateEvent,
  createConversationItemEvent,
  createResponseEvent,
  sendRealtimeEvent,
  type SessionConfig,
} from "./realtimeEvents";
import {
  conversationActions,
  conversationStoreApi,
} from "../state/conversationStore";

/**
 * Voice charter session state.
 */
export type VoiceCharterStep =
  | "idle"
  | "initializing"
  | "asking"
  | "listening"
  | "confirming"
  | "navigating"
  | "completed";

/**
 * Captured field value from voice input.
 */
export interface CapturedFieldValue {
  fieldId: string;
  value: string;
  confirmedAt?: number;
}

/**
 * Voice charter session state.
 */
export interface VoiceCharterState {
  step: VoiceCharterStep;
  currentFieldIndex: number;
  currentFieldId: string | null;
  capturedValues: Map<string, CapturedFieldValue>;
  pendingValue: string | null;
  error: string | null;
}

/**
 * Event emitted by the service.
 */
export type VoiceCharterEvent =
  | { type: "state_changed"; state: VoiceCharterState }
  | { type: "field_captured"; fieldId: string; value: string }
  | { type: "field_confirmed"; fieldId: string; value: string }
  | { type: "navigation"; direction: "next" | "previous"; fieldId: string }
  | { type: "completed" }
  | { type: "error"; message: string };

type EventListener = (event: VoiceCharterEvent) => void;

/**
 * Generates the system prompt for the voice charter assistant.
 */
function generateSystemPrompt(schema: CharterFormSchema): string {
  const fieldDescriptions = schema.fields
    .map((field, index) => {
      const required = field.required ? "(required)" : "(optional)";
      const example = field.example ? `Example: "${field.example}"` : "";
      return `${index + 1}. ${field.label} ${required}: ${field.help_text || ""}. ${example}`;
    })
    .join("\n");

  return `You are a helpful project charter assistant guiding the user through creating a project charter via voice conversation.

## Your Role
- Ask ONE question at a time for each charter field
- Listen to the user's response and acknowledge it briefly
- Be conversational, natural, and concise
- Keep your responses SHORT - this is a voice conversation

## Charter Fields (in order)
${fieldDescriptions}

## Navigation Commands
The user can say these commands at any time:
- "Go back" or "Previous field" - Return to the previous field
- "Edit [field name]" - Jump to a specific field (e.g., "Edit project title")
- "Skip" or "Skip this field" - Skip the current field (only for optional fields)
- "Review" or "Show progress" - List all captured values
- "Done" or "Finish" - Complete the charter

## Conversation Flow
1. Ask for the current field value in a friendly, conversational way
2. When the user responds, briefly acknowledge (e.g., "Got it!" or "Perfect!")
3. IMMEDIATELY move to the next field - the user can see the captured value on screen for visual confirmation
4. If the user wants to change something, they will edit the field directly or say "go back"

## Important Rules
- Keep responses VERY short (1 sentence max) - NO verbal confirmation needed
- The user sees all captured values in real-time on the form - they can visually confirm
- Move quickly through fields - just acknowledge and ask the next question
- For dates, briefly clarify format only if needed
- For list fields (risks, assumptions, etc.), ask if they want to add more items
- Trust that the user will correct any mistakes using the visual form

## Current State
You will receive context about the current field and any previously captured values.
Start by greeting the user briefly, then ask about the first field.`;
}

/**
 * Generates a prompt to ask about a specific field.
 */
function generateFieldPrompt(field: CharterFormField, isFirst: boolean): string {
  const greeting = isFirst
    ? "Let's create your project charter. "
    : "";

  const required = field.required
    ? "This is a required field."
    : "This field is optional - you can skip it if you'd like.";

  let question = "";
  switch (field.id) {
    case "project_name":
      question = "What's the name of your project?";
      break;
    case "sponsor":
      question = "Who is the project sponsor?";
      break;
    case "project_lead":
      question = "Who is the project lead?";
      break;
    case "start_date":
      question = "When does the project start? You can say something like January fifteenth, twenty twenty-five.";
      break;
    case "end_date":
      question = "And when is the target end date?";
      break;
    case "vision":
      question = "What's the vision for this project? What do you hope to achieve?";
      break;
    case "problem":
      question = "What problem or opportunity does this project address?";
      break;
    case "description":
      question = "Can you give me a brief description of the project?";
      break;
    case "scope_in":
      question = "What's included in the project scope? Tell me the key items.";
      break;
    case "scope_out":
      question = "Is there anything explicitly out of scope?";
      break;
    case "risks":
      question = "What are the main risks you see for this project?";
      break;
    case "assumptions":
      question = "What assumptions are you making for this project?";
      break;
    case "milestones":
      question = "What are the key milestones? Tell me the phase, deliverable, and target date for each.";
      break;
    case "success_metrics":
      question = "How will you measure success? What are the key metrics?";
      break;
    case "core_team":
      question = "Who's on the core team? Tell me their names and roles.";
      break;
    default:
      question = `What would you like to enter for ${field.label}?`;
  }

  return `${greeting}${question} ${required}`;
}

/**
 * Common conversational filler patterns to strip from voice input.
 * These patterns capture phrases users naturally say when responding.
 */
const CONVERSATIONAL_FILLERS = [
  // Starting fillers and hedges
  /^(?:i think|i guess|i suppose|i believe|i'd say)\s+/i,
  /^(?:now,?|so,?|well,?|okay,?|oh,?|and,?|but,?)\s+/i,
  /^(?:um+|uh+|hmm+|ah+|er+)[,.]?\s*/i,
  /^(?:yeah|yes|sure|right|okay)[,.]?\s*/i,
  // "It is/It's" patterns
  /^(?:it\s*(?:is|'s|'ll|will|would)\s*(?:be\s*)?)/i,
  // "That is/That's" patterns
  /^(?:that\s*(?:is|'s|'ll|will|would)\s*(?:be\s*)?)/i,
  // "The X is" patterns
  /^(?:the\s+(?:name|title|project|sponsor|lead|date|answer)\s+(?:is|will be|would be)\s*)/i,
  // "I'd say/call it" patterns
  /^(?:i(?:'d| would)\s+(?:say|call it|name it|go with)\s*)/i,
  // "Let's/Let me" patterns
  /^(?:let(?:'s| me)\s+(?:call it|go with|say)\s*)/i,
  // "We're calling it" patterns
  /^(?:we(?:'re| are)\s+(?:calling it|going with)\s*)/i,
  // Trailing fillers
  /[,.]?\s*(?:i think|i guess|i suppose|probably|maybe)\.?$/i,
  /[,.]?\s*(?:that's it|that's all|nothing else|i believe)\.?$/i,
];

/**
 * Month name to number mapping for date parsing.
 */
const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Attempts to parse a spoken date into MM/DD/YYYY format.
 * Handles formats like:
 * - "January 15, 2025" or "January 15th 2025"
 * - "15 January 2025"
 * - "1/15/2025" or "01-15-2025"
 *
 * @param text - The spoken date text
 * @returns Parsed date in YYYY-MM-DD format (for date inputs) or original text if parsing fails
 */
function parseSpokenDate(text: string): string {
  const cleaned = text.toLowerCase().trim();

  // Try "Month Day, Year" format (e.g., "January 15, 2025" or "January 15th 2025")
  const monthDayYear = cleaned.match(
    /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/
  );
  if (monthDayYear) {
    const month = MONTH_MAP[monthDayYear[1]];
    const day = parseInt(monthDayYear[2], 10);
    const year = parseInt(monthDayYear[3], 10);
    if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try "Day Month Year" format (e.g., "15 January 2025")
  const dayMonthYear = cleaned.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+),?\s*(\d{4})$/
  );
  if (dayMonthYear) {
    const day = parseInt(dayMonthYear[1], 10);
    const month = MONTH_MAP[dayMonthYear[2]];
    const year = parseInt(dayMonthYear[3], 10);
    if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try numeric formats like "1/15/2025" or "01-15-2025"
  const numericDate = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (numericDate) {
    const month = parseInt(numericDate[1], 10);
    const day = parseInt(numericDate[2], 10);
    const year = parseInt(numericDate[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Return original if no pattern matched
  return text;
}

/**
 * Extracts the relevant field value from a conversational response.
 * Strips common fillers like "That'll be", "It's", "Um", etc.
 * For date fields, attempts to parse spoken dates into proper format.
 *
 * @param transcript - The raw voice transcript
 * @param fieldId - The field being populated (for context-aware parsing)
 * @returns The cleaned value suitable for the field
 */
function extractFieldValue(transcript: string, fieldId: string): string {
  let value = transcript.trim();

  // Apply filler patterns repeatedly until no more matches
  let previousValue = "";
  while (previousValue !== value) {
    previousValue = value;
    for (const pattern of CONVERSATIONAL_FILLERS) {
      value = value.replace(pattern, "").trim();
    }
  }

  // Remove trailing period if it looks like conversational ending
  if (value.endsWith(".") && !value.includes(". ")) {
    value = value.slice(0, -1).trim();
  }

  // If we stripped too much (empty result), fall back to original
  if (!value) {
    return transcript.trim();
  }

  // For date fields, try to parse spoken dates
  if (fieldId === "start_date" || fieldId === "end_date") {
    value = parseSpokenDate(value);
  }

  return value;
}

/**
 * Service class managing voice charter sessions.
 */
export class VoiceCharterService {
  private schema: CharterFormSchema | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private state: VoiceCharterState;
  private listeners: Set<EventListener> = new Set();
  private conversationStoreUnsubscribe: (() => void) | null = null;
  private isInternalUpdate: boolean = false;
  /**
   * Tracks which field we're currently waiting for a response on.
   * This is separate from currentFieldId because the AI may move to the next
   * field before the transcript is fully processed.
   */
  private askingFieldId: string | null = null;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): VoiceCharterState {
    return {
      step: "idle",
      currentFieldIndex: 0,
      currentFieldId: null,
      capturedValues: new Map(),
      pendingValue: null,
      error: null,
    };
  }

  /**
   * Subscribe to service events.
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: VoiceCharterEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("[VoiceCharterService] Listener error:", error);
      }
    });
  }

  private updateState(updates: Partial<VoiceCharterState>): void {
    this.state = { ...this.state, ...updates };
    this.emit({ type: "state_changed", state: this.getState() });
  }

  /**
   * Get current state (immutable copy).
   */
  getState(): VoiceCharterState {
    return {
      ...this.state,
      capturedValues: new Map(this.state.capturedValues),
    };
  }

  /**
   * Get the current field being asked about.
   */
  getCurrentField(): CharterFormField | null {
    if (!this.schema || this.state.currentFieldIndex < 0) {
      return null;
    }
    return this.schema.fields[this.state.currentFieldIndex] ?? null;
  }

  /**
   * Get all fields from the schema.
   */
  getFields(): CharterFormField[] {
    return this.schema?.fields ?? [];
  }

  /**
   * Get progress info.
   */
  getProgress(): { current: number; total: number; percent: number } {
    const total = this.schema?.fields.length ?? 0;
    const current = this.state.currentFieldIndex + 1;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    return { current, total, percent };
  }

  /**
   * Initialize a voice charter session.
   */
  initialize(
    schema: CharterFormSchema,
    dataChannel: RTCDataChannel,
    existingValues?: Record<string, string>
  ): boolean {
    this.schema = schema;
    this.dataChannel = dataChannel;

    // Initialize captured values from existing values
    const capturedValues = new Map<string, CapturedFieldValue>();
    if (existingValues) {
      for (const [fieldId, value] of Object.entries(existingValues)) {
        if (value) {
          capturedValues.set(fieldId, {
            fieldId,
            value,
            confirmedAt: Date.now(),
          });
        }
      }
    }

    const firstField = schema.fields[0];

    // Set the initial asking field
    this.askingFieldId = firstField?.id ?? null;

    this.updateState({
      step: "initializing",
      currentFieldIndex: 0,
      currentFieldId: firstField?.id ?? null,
      capturedValues,
      pendingValue: null,
      error: null,
    });

    // Ensure conversation store session exists and sync existing values
    conversationActions.ensureSession(schema);
    if (existingValues) {
      for (const [fieldId, value] of Object.entries(existingValues)) {
        if (value) {
          this.isInternalUpdate = true;
          try {
            conversationActions.dispatch({ type: "CAPTURE", fieldId, value });
          } finally {
            this.isInternalUpdate = false;
          }
        }
      }
    }

    // Subscribe to conversation store for two-way sync
    this.subscribeToConversationStore();

    // Configure the Realtime session with voice charter instructions
    const config: SessionConfig = {
      instructions: generateSystemPrompt(schema),
      voice: "alloy",
      inputAudioTranscription: {
        model: "whisper-1",
      },
      turnDetection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 800, // Slightly longer pause detection for thinking
      },
    };

    const configSent = sendRealtimeEvent(dataChannel, createSessionUpdateEvent(config));
    if (!configSent) {
      this.updateState({
        step: "idle",
        error: "Failed to configure voice session",
      });
      return false;
    }

    return true;
  }

  /**
   * Start the voice charter conversation.
   */
  start(): boolean {
    if (!this.dataChannel || !this.schema) {
      return false;
    }

    const firstField = this.getCurrentField();
    if (!firstField) {
      return false;
    }

    // Track which field we're asking about
    this.askingFieldId = firstField.id;

    // Build context with any existing values
    let context = "Starting voice charter session.\n";
    if (this.state.capturedValues.size > 0) {
      context += "Previously captured values:\n";
      for (const [fieldId, captured] of this.state.capturedValues) {
        const field = this.schema.fields.find((f) => f.id === fieldId);
        if (field) {
          context += `- ${field.label}: ${captured.value}\n`;
        }
      }
      context += "\n";
    }
    context += `Current field to ask about: ${firstField.label}\n`;
    context += generateFieldPrompt(firstField, true);

    // Send context and trigger AI to speak
    sendRealtimeEvent(this.dataChannel, createConversationItemEvent("user", context));
    sendRealtimeEvent(this.dataChannel, createResponseEvent());

    this.updateState({ step: "asking" });
    return true;
  }

  /**
   * Process a transcript from the user's voice input.
   */
  processTranscript(transcript: string): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    const normalizedTranscript = transcript.toLowerCase().trim();

    // Check for navigation commands
    if (this.handleNavigationCommand(normalizedTranscript)) {
      return;
    }

    // Check for skip command
    if (
      normalizedTranscript.includes("skip") &&
      (normalizedTranscript.includes("this") ||
        normalizedTranscript.includes("field") ||
        normalizedTranscript === "skip")
    ) {
      this.skipCurrentField();
      return;
    }

    // Check for completion command
    if (
      normalizedTranscript.includes("done") ||
      normalizedTranscript.includes("finish") ||
      normalizedTranscript.includes("complete")
    ) {
      this.complete();
      return;
    }

    // Check for review command
    if (
      normalizedTranscript.includes("review") ||
      normalizedTranscript.includes("show progress") ||
      normalizedTranscript.includes("what do i have")
    ) {
      this.reviewProgress();
      return;
    }

    // Use askingFieldId to ensure we capture to the correct field
    // (the one the AI was asking about, not the current field which may have changed)
    const targetFieldId = this.askingFieldId;
    if (targetFieldId) {
      // Extract the relevant value from the conversational response
      const extractedValue = extractFieldValue(transcript, targetFieldId);

      // Capture the cleaned value to the form
      this.captureValue(targetFieldId, extractedValue);

      // Advance to the next field so subsequent transcripts go to the right place
      // (The AI will ask about the next field in its spoken response)
      this.advanceAskingField();
    }

    this.updateState({
      step: "listening",
      pendingValue: transcript,
    });
  }

  /**
   * Advance askingFieldId to the next field without sending AI messages.
   * This is called after capturing a value so the next transcript goes to the right field.
   * The AI handles asking about the next field in its spoken response.
   */
  private advanceAskingField(): void {
    if (!this.schema) {
      return;
    }

    const nextIndex = this.state.currentFieldIndex + 1;
    if (nextIndex >= this.schema.fields.length) {
      // All fields done
      this.askingFieldId = null;
      return;
    }

    const nextField = this.schema.fields[nextIndex];
    this.askingFieldId = nextField.id;

    this.updateState({
      step: "asking",
      currentFieldIndex: nextIndex,
      currentFieldId: nextField.id,
      pendingValue: null,
    });
  }

  /**
   * Handle navigation commands.
   */
  private handleNavigationCommand(transcript: string): boolean {
    // Go back / previous
    if (
      transcript.includes("go back") ||
      transcript.includes("previous") ||
      transcript.includes("back one")
    ) {
      this.goToPreviousField();
      return true;
    }

    // Check for correction patterns like "No, project title should be X"
    // or "Actually, the sponsor is Y"
    const correctionHandled = this.handleCorrectionCommand(transcript);
    if (correctionHandled) {
      return true;
    }

    // Edit specific field (without value)
    const editMatch = transcript.match(/edit\s+(.+)/i);
    if (editMatch) {
      const fieldName = editMatch[1].toLowerCase();
      const field = this.schema?.fields.find(
        (f) =>
          f.label.toLowerCase().includes(fieldName) ||
          f.id.toLowerCase().includes(fieldName.replace(/\s+/g, "_"))
      );
      if (field) {
        this.goToField(field.id);
        return true;
      }
    }

    return false;
  }

  /**
   * Handle correction commands like "No, project title should be X"
   * or "Actually, the sponsor is Y".
   *
   * These patterns indicate the user wants to correct a previously captured field.
   */
  private handleCorrectionCommand(transcript: string): boolean {
    if (!this.schema || !this.dataChannel) {
      return false;
    }

    // Patterns for corrections:
    // "No, [field] should be [value]"
    // "Actually, [field] is [value]"
    // "Wait, [field] should be [value]"
    // "Sorry, [field] is [value]"
    // "[field] should be [value]"
    // "The [field] is [value]"
    // "Change [field] to [value]"
    const correctionPatterns = [
      /^(?:no|actually|wait|sorry|oops)[,.]?\s+(?:the\s+)?(.+?)\s+(?:should be|should have been|is|was|needs to be)\s+(.+)$/i,
      /^(?:the\s+)?(.+?)\s+(?:should be|should have been|is actually|was actually)\s+(.+)$/i,
      /^(?:change|update|set)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i,
      /^(?:make|put)\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(.+)$/i,
    ];

    for (const pattern of correctionPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        const fieldNamePart = match[1].toLowerCase().trim();
        const valuePart = match[2].trim();

        // Find the field being referenced
        const targetField = this.schema.fields.find(
          (f) =>
            f.label.toLowerCase().includes(fieldNamePart) ||
            f.id.toLowerCase().includes(fieldNamePart.replace(/\s+/g, "_")) ||
            fieldNamePart.includes(f.label.toLowerCase()) ||
            fieldNamePart.includes(f.id.toLowerCase().replace(/_/g, " "))
        );

        if (targetField) {
          // Extract clean value (apply filler removal)
          const cleanValue = extractFieldValue(valuePart, targetField.id);

          // Capture the corrected value to the target field
          this.captureValue(targetField.id, cleanValue);

          // Inform the AI about the correction
          sendRealtimeEvent(
            this.dataChannel,
            createConversationItemEvent(
              "user",
              `[User corrected ${targetField.label} to: "${cleanValue}"] Acknowledge the correction briefly and continue asking about the current field.`
            )
          );
          sendRealtimeEvent(this.dataChannel, createResponseEvent());

          // Don't advance - stay on current field
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Move to the next field.
   */
  goToNextField(): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    const nextIndex = this.state.currentFieldIndex + 1;
    if (nextIndex >= this.schema.fields.length) {
      this.complete();
      return;
    }

    const nextField = this.schema.fields[nextIndex];

    // Update askingFieldId BEFORE changing state so transcripts go to the right field
    this.askingFieldId = nextField.id;

    this.updateState({
      step: "asking",
      currentFieldIndex: nextIndex,
      currentFieldId: nextField.id,
      pendingValue: null,
    });

    // Prompt AI to ask about next field
    const prompt = generateFieldPrompt(nextField, false);
    sendRealtimeEvent(
      this.dataChannel,
      createConversationItemEvent("user", `[Move to next field: ${nextField.label}] ${prompt}`)
    );
    sendRealtimeEvent(this.dataChannel, createResponseEvent());

    this.emit({
      type: "navigation",
      direction: "next",
      fieldId: nextField.id,
    });
  }

  /**
   * Move to the previous field.
   */
  goToPreviousField(): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    const prevIndex = this.state.currentFieldIndex - 1;
    if (prevIndex < 0) {
      // Already at first field, tell the user
      sendRealtimeEvent(
        this.dataChannel,
        createConversationItemEvent(
          "user",
          "[User wants to go back but we're at the first field] Tell the user we're already at the first field."
        )
      );
      sendRealtimeEvent(this.dataChannel, createResponseEvent());
      return;
    }

    const prevField = this.schema.fields[prevIndex];
    const existingValue = this.state.capturedValues.get(prevField.id);

    // Update askingFieldId BEFORE changing state so transcripts go to the right field
    this.askingFieldId = prevField.id;

    this.updateState({
      step: "asking",
      currentFieldIndex: prevIndex,
      currentFieldId: prevField.id,
      pendingValue: null,
    });

    // Prompt AI to ask about previous field, mentioning existing value if any
    let prompt = `[Going back to previous field: ${prevField.label}]`;
    if (existingValue) {
      prompt += ` The current value is: "${existingValue.value}". Ask if they want to change it.`;
    } else {
      prompt += ` ${generateFieldPrompt(prevField, false)}`;
    }

    sendRealtimeEvent(this.dataChannel, createConversationItemEvent("user", prompt));
    sendRealtimeEvent(this.dataChannel, createResponseEvent());

    this.emit({
      type: "navigation",
      direction: "previous",
      fieldId: prevField.id,
    });
  }

  /**
   * Jump to a specific field.
   */
  goToField(fieldId: string): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    const fieldIndex = this.schema.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex < 0) {
      return;
    }

    const field = this.schema.fields[fieldIndex];
    const existingValue = this.state.capturedValues.get(fieldId);

    // Update askingFieldId BEFORE changing state so transcripts go to the right field
    this.askingFieldId = fieldId;

    this.updateState({
      step: "asking",
      currentFieldIndex: fieldIndex,
      currentFieldId: fieldId,
      pendingValue: null,
    });

    let prompt = `[Jumping to field: ${field.label}]`;
    if (existingValue) {
      prompt += ` The current value is: "${existingValue.value}". Ask if they want to change it.`;
    } else {
      prompt += ` ${generateFieldPrompt(field, false)}`;
    }

    sendRealtimeEvent(this.dataChannel, createConversationItemEvent("user", prompt));
    sendRealtimeEvent(this.dataChannel, createResponseEvent());
  }

  /**
   * Skip the current field.
   */
  skipCurrentField(): void {
    const currentField = this.getCurrentField();
    if (!currentField) {
      return;
    }

    if (currentField.required) {
      // Can't skip required fields
      if (this.dataChannel) {
        sendRealtimeEvent(
          this.dataChannel,
          createConversationItemEvent(
            "user",
            `[User tried to skip ${currentField.label} but it's required] Tell the user this field is required and ask for the value.`
          )
        );
        sendRealtimeEvent(this.dataChannel, createResponseEvent());
      }
      return;
    }

    // Skip to next field
    this.goToNextField();
  }

  /**
   * Capture and confirm a field value.
   * Also syncs the value to the conversation store for real-time form updates.
   */
  captureValue(fieldId: string, value: string): void {
    const captured: CapturedFieldValue = {
      fieldId,
      value,
      confirmedAt: Date.now(),
    };

    const newCapturedValues = new Map(this.state.capturedValues);
    newCapturedValues.set(fieldId, captured);

    this.updateState({
      capturedValues: newCapturedValues,
      pendingValue: null,
    });

    // Sync to conversation store for real-time form field updates
    this.syncToConversationStore(fieldId, value);

    this.emit({ type: "field_captured", fieldId, value });
  }

  /**
   * Sync a captured value to the conversation store.
   * This updates the CharterFieldSession form fields in real-time.
   */
  private syncToConversationStore(fieldId: string, value: string): void {
    try {
      // Mark as internal update to avoid feedback loops
      this.isInternalUpdate = true;

      // Ensure session exists with current schema
      if (this.schema) {
        conversationActions.ensureSession(this.schema);
      }

      // Dispatch capture event to update the form field
      conversationActions.dispatch({ type: "CAPTURE", fieldId, value });

      // Validate the field (for visual feedback)
      conversationActions.dispatch({ type: "VALIDATE", fieldId });
    } catch (error) {
      console.error("[VoiceCharterService] Failed to sync to conversation store:", error);
    } finally {
      this.isInternalUpdate = false;
    }
  }

  /**
   * Subscribe to conversation store changes for two-way sync.
   * When the user manually edits a field in CharterFieldSession,
   * the voice charter service is informed.
   */
  private subscribeToConversationStore(): void {
    // Unsubscribe from any existing subscription
    this.unsubscribeFromConversationStore();

    let previousState = conversationStoreApi.getState().state;

    this.conversationStoreUnsubscribe = conversationStoreApi.subscribe(() => {
      // Skip if this is an internal update from voice capture
      if (this.isInternalUpdate) {
        previousState = conversationStoreApi.getState().state;
        return;
      }

      const currentState = conversationStoreApi.getState().state;
      if (!currentState || !previousState || !this.schema) {
        previousState = currentState;
        return;
      }

      // Check for field value changes
      for (const fieldId of currentState.fieldOrder) {
        const prevField = previousState.fields[fieldId];
        const currField = currentState.fields[fieldId];

        if (!prevField || !currField) continue;

        // Detect if the value changed externally (user manual edit)
        if (currField.value !== prevField.value && currField.value) {
          this.handleExternalFieldChange(fieldId, currField.value);
        }
      }

      previousState = currentState;
    });
  }

  /**
   * Unsubscribe from conversation store.
   */
  private unsubscribeFromConversationStore(): void {
    if (this.conversationStoreUnsubscribe) {
      this.conversationStoreUnsubscribe();
      this.conversationStoreUnsubscribe = null;
    }
  }

  /**
   * Handle external field changes (from user editing the form directly).
   * Updates the internal state and optionally informs the AI.
   */
  private handleExternalFieldChange(fieldId: string, value: string): void {
    // Update internal captured values
    const captured: CapturedFieldValue = {
      fieldId,
      value,
      confirmedAt: Date.now(),
    };

    const newCapturedValues = new Map(this.state.capturedValues);
    newCapturedValues.set(fieldId, captured);

    this.updateState({
      capturedValues: newCapturedValues,
    });

    // Emit event for external change
    this.emit({ type: "field_captured", fieldId, value });

    // Inform the AI about the manual edit if we're in an active session
    if (this.dataChannel && this.state.step !== "idle" && this.state.step !== "completed") {
      const field = this.schema?.fields.find((f) => f.id === fieldId);
      if (field) {
        sendRealtimeEvent(
          this.dataChannel,
          createConversationItemEvent(
            "user",
            `[User manually updated ${field.label} to: "${value}"] Acknowledge this update briefly and continue with the current field.`
          )
        );
        sendRealtimeEvent(this.dataChannel, createResponseEvent());
      }
    }
  }

  /**
   * Confirm the current field value and move to next.
   */
  confirmAndNext(fieldId: string, value: string): void {
    this.captureValue(fieldId, value);
    this.emit({ type: "field_confirmed", fieldId, value });
    this.goToNextField();
  }

  /**
   * Review progress - list all captured values.
   */
  reviewProgress(): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    let summary = "[User requested progress review]\nHere's what we have so far:\n";
    for (const field of this.schema.fields) {
      const captured = this.state.capturedValues.get(field.id);
      if (captured) {
        summary += `- ${field.label}: ${captured.value}\n`;
      } else {
        summary += `- ${field.label}: (not yet captured)\n`;
      }
    }
    summary += `\nWe're currently on: ${this.getCurrentField()?.label ?? "unknown"}`;
    summary += "\nRead this summary to the user, then ask if they want to continue or edit any field.";

    sendRealtimeEvent(this.dataChannel, createConversationItemEvent("user", summary));
    sendRealtimeEvent(this.dataChannel, createResponseEvent());
  }

  /**
   * Complete the voice charter session.
   */
  complete(): void {
    this.updateState({ step: "completed" });

    if (this.dataChannel) {
      sendRealtimeEvent(
        this.dataChannel,
        createConversationItemEvent(
          "user",
          "[Charter complete] Thank the user and let them know their charter is ready for review. Keep it brief!"
        )
      );
      sendRealtimeEvent(this.dataChannel, createResponseEvent());
    }

    this.emit({ type: "completed" });
  }

  /**
   * Get all captured values as a plain object.
   */
  getCapturedValuesObject(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [fieldId, captured] of this.state.capturedValues) {
      result[fieldId] = captured.value;
    }
    return result;
  }

  /**
   * Reset the service state.
   */
  reset(): void {
    this.unsubscribeFromConversationStore();
    this.state = this.createInitialState();
    this.schema = null;
    this.dataChannel = null;
    this.isInternalUpdate = false;
    this.askingFieldId = null;
    this.emit({ type: "state_changed", state: this.getState() });
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.unsubscribeFromConversationStore();
    this.reset();
    this.listeners.clear();
  }
}

// Singleton instance
export const voiceCharterService = new VoiceCharterService();
