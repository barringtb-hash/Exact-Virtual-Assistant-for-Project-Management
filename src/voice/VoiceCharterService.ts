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
import { draftActions, draftStoreApi } from "../state/draftStore.ts";

/**
 * Voice charter session state.
 */
export type VoiceCharterStep =
  | "idle"
  | "initializing"
  | "awaiting_extraction_decision"
  | "extracting"
  | "asking"
  | "listening"
  | "confirming"
  | "navigating"
  | "completed";

/**
 * Source of a transcript - either AI speech or user speech.
 * When known, this eliminates the need for heuristic AI detection.
 */
export type TranscriptSource = "ai" | "user";

/**
 * Source of a pre-populated field value.
 */
export type FieldValueSource = "extraction" | "manual" | "voice";

/**
 * Pre-populated field information passed during initialization.
 */
export interface PopulatedFieldInfo {
  fieldId: string;
  value: unknown; // Can be string, array, or object
  displayValue: string; // Human-readable string for voice prompts
  source: FieldValueSource;
  needsConfirmation: boolean;
}

/**
 * Captured field value from voice input.
 */
export interface CapturedFieldValue {
  fieldId: string;
  value: string;
  confirmedAt?: number;
  source?: FieldValueSource;
  userConfirmed?: boolean; // True if user explicitly confirmed extracted value
}

/**
 * Attachment info passed to voice charter for extraction detection.
 */
export interface VoiceCharterAttachment {
  name: string;
  type?: string;
}

/**
 * Callback to trigger document extraction from voice charter.
 */
export type ExtractionCallback = () => Promise<Record<string, unknown> | null>;

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
  /** Fields that were pre-populated (from extraction or manual input) */
  populatedFields: Map<string, PopulatedFieldInfo>;
  /** Whether we're currently awaiting confirmation for a pre-populated field */
  awaitingFieldConfirmation: boolean;
  /** Whether there are unprocessed attachments that could be extracted */
  hasUnextractedAttachments: boolean;
}

/**
 * Event emitted by the service.
 */
export type VoiceCharterEvent =
  | { type: "state_changed"; state: VoiceCharterState }
  | { type: "field_captured"; fieldId: string; value: string }
  | { type: "field_confirmed"; fieldId: string; value: string }
  | { type: "field_confirmation_requested"; fieldId: string; value: string }
  | { type: "extraction_requested" }
  | { type: "extraction_completed"; fields: Record<string, unknown> }
  | { type: "navigation"; direction: "next" | "previous"; fieldId: string }
  | { type: "completed" }
  | { type: "error"; message: string };

type EventListener = (event: VoiceCharterEvent) => void;

/**
 * Generates the system prompt for the voice charter assistant.
 */
function generateSystemPrompt(
  schema: CharterFormSchema,
  populatedFields?: Map<string, PopulatedFieldInfo>
): string {
  const fieldDescriptions = schema.fields
    .map((field, index) => {
      const required = field.required ? "(required)" : "(optional)";
      const example = field.example ? `Example: "${field.example}"` : "";
      const populated = populatedFields?.get(field.id);
      const status = populated
        ? `[PRE-FILLED from document: "${populated.displayValue.substring(0, 50)}${populated.displayValue.length > 50 ? '...' : ''}"]`
        : "[EMPTY]";
      return `${index + 1}. ${field.label} ${required} ${status}: ${field.help_text || ""}. ${example}`;
    })
    .join("\n");

  // Build pre-populated fields summary
  let populatedSummary = "";
  if (populatedFields && populatedFields.size > 0) {
    const extractedFields = Array.from(populatedFields.values())
      .filter(f => f.source === "extraction");
    if (extractedFields.length > 0) {
      populatedSummary = `
## Pre-Populated Fields from Uploaded Document
The user has uploaded a document (TPP) and the following fields were extracted:
${extractedFields.map(f => `- ${f.fieldId}: "${f.displayValue.substring(0, 80)}${f.displayValue.length > 80 ? '...' : ''}"`).join("\n")}

For these pre-populated fields, you MUST:
1. Acknowledge the extracted value: "Based on your uploaded document, the [field] is '[value]'."
2. Ask for confirmation: "Would you like to keep this, or change it?"
3. If user says "keep it", "yes", "that's correct", "looks good" → briefly acknowledge and move to next field
4. If user says "change it", "no", "update" → ask them to provide the new value
5. If user provides a new value directly → capture it and move on

`;
    }
  }

  return `You are a helpful project charter assistant guiding the user through creating a project charter via voice conversation.

## Your Role
- Ask ONE question at a time for each charter field
- Listen to the user's response and acknowledge it briefly
- Be conversational, natural, and concise
- Keep your responses SHORT - this is a voice conversation
${populatedSummary}
## Charter Fields (in order)
${fieldDescriptions}

## Navigation Commands
The user can say these commands at any time:
- "Go back" or "Previous field" - Return to the previous field
- "Edit [field name]" - Jump to a specific field (e.g., "Edit project title")
- "Skip" or "Skip this field" - Skip the current field (only for optional fields)
- "Review" or "Show progress" - List all captured values
- "Review extracted" or "Show extracted" - List values from uploaded document
- "Confirm all" or "Keep all" - Accept all pre-populated values
- "Done" or "Finish" - Complete the charter

## Confirmation Commands (for pre-populated fields)
- "Keep it", "Yes", "That's correct", "Looks good" - Confirm the extracted value
- "Change it", "No", "Update this" - Provide a new value for the field

## Conversation Flow
1. For EMPTY fields: Ask for the value in a friendly, conversational way
2. For PRE-FILLED fields: State the extracted value and ask to confirm or change
3. When the user responds, briefly acknowledge (e.g., "Got it!" or "Perfect!")
4. IMMEDIATELY move to the next field - the user can see the captured value on screen for visual confirmation
5. If the user wants to change something, they will edit the field directly or say "go back"

## Long-Form Content (Vision, Problem, Description)
For these narrative fields, you MUST reformulate the user's input into professional language.
When responding, you MUST say: "CAPTURE: [your professional reformulation]" before moving to the next field.
- Take their rough notes or conversational input
- Transform it into polished, professional language suitable for a formal project charter
- Maintain their intent and key points
Example: User says "we want to test blood for cancer detection"
→ You respond: "CAPTURE: Develop and validate a liquid biopsy platform for the early detection and monitoring of cancer biomarkers through advanced blood analysis. Now, what problem does this project address?"

## List Fields (Scope In/Out, Risks, Assumptions, Milestones, Team)
For list-type fields:
- Ask the user to provide items one at a time OR as a comma-separated list
- Format each item clearly
- After capturing items, ask "Would you like to add more, or shall we move on?"
- Format the response as a bulleted list separated by newlines

## Important Rules
- Keep responses VERY short (1-2 sentences max) - NO verbose verbal confirmation needed
- The user sees all captured values in real-time on the form - they can visually confirm
- Move quickly through fields - just acknowledge and ask the next question
- For dates, briefly clarify format only if needed
- Trust that the user will correct any mistakes using the visual form

## Current State
You will receive context about the current field and any previously captured values.
Start by greeting the user briefly, then ask about the first field.`;
}

/**
 * Generates a prompt to ask about a specific field.
 * If the field is pre-populated, generates a confirmation prompt instead.
 */
function generateFieldPrompt(
  field: CharterFormField,
  isFirst: boolean,
  populatedInfo?: PopulatedFieldInfo
): string {
  const greeting = isFirst
    ? "Let's create your project charter. "
    : "";

  const required = field.required
    ? "This is a required field."
    : "This field is optional - you can skip it if you'd like.";

  // If field is pre-populated from extraction, generate confirmation prompt
  if (populatedInfo && populatedInfo.source === "extraction" && populatedInfo.needsConfirmation) {
    const truncatedValue = populatedInfo.displayValue.length > 100
      ? populatedInfo.displayValue.substring(0, 100) + "..."
      : populatedInfo.displayValue;

    return `${greeting}Based on your uploaded document, the ${field.label.toLowerCase()} is "${truncatedValue}". Would you like to keep this, or change it?`;
  }

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
  // "The [field] is" patterns - handle multi-word field names
  /^(?:the\s+)?(?:project\s+)?(?:title|name)\s+(?:is|will be|would be|should be)\s*/i,
  /^(?:the\s+)?(?:project\s+)?(?:sponsor)\s+(?:is|will be|would be|should be)\s*/i,
  /^(?:the\s+)?(?:project\s+)?(?:lead)\s+(?:is|will be|would be|should be)\s*/i,
  /^(?:the\s+)?(?:start|end)\s+(?:date)\s+(?:is|will be|would be|should be)\s*/i,
  /^(?:the\s+)?(?:vision|problem|description)\s+(?:is|will be|would be|should be)\s*/i,
  // Generic "the X is" for any remaining cases
  /^the\s+\w+\s+(?:is|will be|would be)\s*/i,
  // "I'd say/call it" patterns
  /^(?:i(?:'d| would)\s+(?:say|call it|name it|go with)\s*)/i,
  // "Let's/Let me" patterns
  /^(?:let(?:'s| me)\s+(?:call it|go with|say)\s*)/i,
  // "We're calling it" patterns
  /^(?:we(?:'re| are)\s+(?:calling it|going with)\s*)/i,
  // "For the X" patterns
  /^(?:for\s+(?:the\s+)?(?:project\s+)?(?:title|name|sponsor|lead|date|vision|problem|description)[,]?\s*)/i,
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
 * - "January 15" or "January 15th" (infers year as current or next year)
 * - "15th" or "the 15th" (infers month and year from context - uses current month)
 *
 * @param text - The spoken date text
 * @returns Parsed date in YYYY-MM-DD format (for date inputs) or original text if parsing fails
 */
function parseSpokenDate(text: string): string {
  const cleaned = text.toLowerCase().trim();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

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

  // Try "Month Day" format without year (e.g., "January 15" or "November 8th")
  // Infer year: use current year if date is in the future, otherwise next year
  const monthDayNoYear = cleaned.match(
    /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\.?$/
  );
  if (monthDayNoYear) {
    const month = MONTH_MAP[monthDayNoYear[1]];
    const day = parseInt(monthDayNoYear[2], 10);
    if (month && day >= 1 && day <= 31) {
      // Check if this date has passed in the current year
      const testDate = new Date(currentYear, month - 1, day);
      const year = testDate >= now ? currentYear : currentYear + 1;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try "Day Month" format without year (e.g., "15 January" or "8th November")
  const dayMonthNoYear = cleaned.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\.?$/
  );
  if (dayMonthNoYear) {
    const day = parseInt(dayMonthNoYear[1], 10);
    const month = MONTH_MAP[dayMonthNoYear[2]];
    if (month && day >= 1 && day <= 31) {
      const testDate = new Date(currentYear, month - 1, day);
      const year = testDate >= now ? currentYear : currentYear + 1;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try just day ordinal format (e.g., "15th" or "the 15th")
  // Uses current month and infers year
  const dayOnlyMatch = cleaned.match(
    /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\.?$/
  );
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const month = currentMonth;
      const testDate = new Date(currentYear, month - 1, day);
      const year = testDate >= now ? currentYear : currentYear + 1;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try partial format from speech (e.g., "10th, 2026" - day and year but no month)
  // This can happen when the user is correcting/adding to a previous date mention
  const dayYearMatch = cleaned.match(
    /^(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/
  );
  if (dayYearMatch) {
    const day = parseInt(dayYearMatch[1], 10);
    const year = parseInt(dayYearMatch[2], 10);
    if (day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      // Use current month as a reasonable default
      const month = currentMonth;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Return original if no pattern matched
  return text;
}

/**
 * Capitalizes a name properly (e.g., "john doe" -> "John Doe").
 * Handles common name patterns and edge cases.
 *
 * @param name - The name to capitalize
 * @returns The properly capitalized name
 */
function capitalizeName(name: string): string {
  if (!name) return name;

  // Split by spaces and capitalize each word
  return name
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      // Handle hyphenated names (e.g., "mary-jane" -> "Mary-Jane")
      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join("-");
      }
      // Handle apostrophes in names (e.g., "o'brien" -> "O'Brien")
      if (word.includes("'")) {
        const parts = word.split("'");
        return parts
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join("'");
      }
      // Standard capitalization
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Fields that contain names and should have proper capitalization.
 */
const NAME_FIELDS = ["sponsor", "project_lead"];

/**
 * Long-form fields that require AI reformulation into professional language.
 * For these fields, we wait for the AI to say "CAPTURE: [text]" instead of
 * capturing the raw user transcript directly.
 */
const LONG_FORM_FIELDS = ["vision", "problem", "description"];

/**
 * Patterns to detect AI reformulation capture.
 * The AI should include one of these phrases when providing the reformulated text.
 * We try multiple patterns to catch variations in how Whisper transcribes the AI speech.
 */
const AI_CAPTURE_PATTERNS = [
  /CAPTURE:\s*(.+?)(?:\.(?:\s|$)|$)/i,
  /(?:I'll|I will|Let me) (?:capture|record|save)(?: (?:that|this|it))?(?: as)?:\s*[""]?([^""]+)[""]?/i,
  // Require colon after Captured/Noted to avoid matching conversational "I captured the vision from your input"
  /(?:Captured|Recording|Saving|Noted):\s*[""]?([^""]+)[""]?/i,
];

/**
 * Patterns that indicate the AI has moved on to the next field without saying CAPTURE.
 * If we detect these while waiting for reformulation, we should capture the raw input as fallback.
 */
const AI_NEXT_FIELD_PATTERNS = [
  /(?:now|next)[,.]?\s+(?:what|tell me|let's|moving)/i,
  /(?:moving|let's move) (?:on|forward)/i,
  /what (?:problem|issue|challenge)/i,
  /what(?:'s| is) the (?:problem|description)/i,
  /(?:can you )?(?:describe|tell me about) the (?:problem|project)/i,
];

/**
 * String list fields that should be converted to arrays for the draft store.
 */
const STRING_LIST_FIELDS = ["scope_in", "scope_out", "risks", "assumptions"];

/**
 * Object list fields that have structured entries.
 */
const OBJECT_LIST_FIELDS = ["milestones", "success_metrics", "core_team"];

/**
 * Child field IDs for each object list field.
 */
const OBJECT_LIST_CHILD_FIELDS: Record<string, string[]> = {
  milestones: ["phase", "deliverable", "date"],
  success_metrics: ["benefit", "metric", "system_of_measurement"],
  core_team: ["name", "role", "responsibilities"],
};

/**
 * Converts a voice transcript value to the appropriate format for the draft store.
 * String list fields are split into arrays, object list fields are parsed.
 *
 * @param fieldId - The field being populated
 * @param value - The voice transcript value
 * @returns The value formatted for the draft store
 */
function formatValueForDraft(fieldId: string, value: string): unknown {
  // For string list fields, split by newlines or commas
  if (STRING_LIST_FIELDS.includes(fieldId)) {
    // Split by newlines, commas, or bullet points
    const items = value
      .split(/[\r\n]+|,|•|[-*]\s/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : [value.trim()].filter(Boolean);
  }

  // For object list fields, try to parse structured entries
  if (OBJECT_LIST_FIELDS.includes(fieldId)) {
    const childFields = OBJECT_LIST_CHILD_FIELDS[fieldId] || [];
    // Split by newlines for separate entries
    const lines = value.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);

    if (lines.length === 0) {
      return [];
    }

    // Try to parse each line as an object entry
    const entries = lines.map((line) => {
      // Try splitting by "/" or "|" or ":" for structured fields
      const parts = line.split(/\s*[/|]\s*|\s*:\s+/).map((p) => p.trim()).filter(Boolean);
      const entry: Record<string, string> = {};

      // Map parts to child fields
      childFields.forEach((field, index) => {
        if (parts[index]) {
          entry[field] = parts[index];
        }
      });

      // If we didn't get any structured mapping, use the first child field
      if (Object.keys(entry).length === 0 && childFields[0]) {
        entry[childFields[0]] = line;
      }

      return entry;
    });

    return entries.filter((e) => Object.keys(e).length > 0);
  }

  // For other fields, return as-is
  return value;
}

/**
 * Normalizes apostrophes in text to standard straight apostrophes.
 * Handles curly/smart apostrophes (U+2019) that come from speech-to-text.
 */
function normalizeApostrophes(text: string): string {
  return text.replace(/[\u2018\u2019\u2032\u0060]/g, "'");
}

/**
 * Patterns that indicate the transcript is from AI speech, not user input.
 * AI responses get transcribed by Whisper and fed back through processTranscript,
 * so we need to detect and skip them.
 * Note: Patterns use straight apostrophes; text is normalized before matching.
 */
const AI_RESPONSE_PATTERNS = [
  // AI acknowledgment patterns (start of AI responses)
  /^(?:got it|perfect|great|excellent|wonderful|okay|alright|sure|right)[.!,]?\s/i,
  /^(?:thanks|thank you)[.!,]?\s/i,
  /^(?:sounds good|that's great|that works)[.!,]?\s/i,
  /^(?:absolutely|certainly|of course|no problem|noted|understood)[.!,]?\s/i,
  // AI question patterns (AI asking about fields)
  /what(?:'s| is| would be) (?:the|your)/i,
  /when (?:does|is|will|would) (?:the|your|this)/i,
  /who (?:is|will be|would be) (?:the|your)/i,
  /can you (?:tell me|give me|describe)/i,
  /(?:tell me|describe) (?:the|your|about)/i,
  // AI asking about specific charter fields (common patterns)
  /what(?:'s| is) the (?:project\s+)?(?:name|title|vision|problem|description|scope|start date|end date)/i,
  /who(?:'s| is) the (?:project\s+)?(?:sponsor|lead)/i,
  /what(?:'s| is) the (?:high[- ]level\s+)?vision/i,
  /what problem (?:does|will|would)/i,
  /what(?:'s| is) (?:included in|in|out of) (?:the\s+)?scope/i,
  // AI field introduction patterns - only match "should/would/could/will" NOT "is"
  // "The project title is X" = user declaring value (ALLOW)
  // "A project lead should be..." = AI asking about field (BLOCK)
  /^(?:a|the)\s+(?:project\s+)?(?:name|title|sponsor|lead|date|vision|problem|description|scope|risk|assumption|milestone|metric|team)\s+(?:should|would|could|will)\s+be/i,
  /^(?:and\s+)?(?:the\s+)?(?:project\s+)?(?:lead|sponsor|title|name)\s+(?:should|would|could|will)\s+be/i,
  // AI transitional phrases
  /let(?:'s| us) (?:move on|continue|go to|start|create)/i,
  /(?:moving|going) (?:on|forward) to/i,
  /(?:now|next)[,.]?\s+(?:let's|what|tell)/i,
  // AI instructional phrases
  /this (?:is|field is) (?:a |an )?(?:required|optional)/i,
  /you can (?:say|skip|tell)/i,
  // Combined acknowledgment + question (most common AI pattern)
  /^(?:got it|perfect|great|okay)[.!,]?\s+(?:and\s+)?(?:what|when|who|how|tell|can)/i,
  // Navigation acknowledgment patterns (AI responding to "go back", etc.)
  // Note: "going back to" is AI (present continuous), but "go back to" alone is a user command
  /going back to/i,  // AI saying "going back to..." (present continuous = AI action)
  /returning to/i,   // AI saying "returning to..."
  /let(?:'s| me) (?:go back|return|take you back)/i,
  /back to (?:the\s+)?(?:previous|last)/i,
  // AI transitioning to another field with "now/next back to"
  /(?:now|next)\s+back\s+to/i,
  // AI with acknowledgment prefix + navigation (catches "Sure, go back to...", "Okay, back to...")
  /(?:sure|okay|alright|understood)[,.!]?\s+(?:go\s+)?back\s+to/i,
  // AI saying "back to the [field]" after acknowledgment (catches "Great! Now back to the start date")
  /(?:great|perfect|okay|sure)[.!,]?\s+(?:now\s+)?back\s+to/i,
  // AI saying "I'll go back to..." or "I will go back to..."
  /i(?:'ll| will)\s+(?:go\s+)?back\s+to/i,
  // Current value patterns (AI stating current field value)
  /(?:the\s+)?current(?:ly|\s+value)?\s+(?:is|set to|reads)/i,
  /it(?:'s| is) (?:currently|set to|now)/i,
  /(?:that|this) (?:field\s+)?(?:is\s+)?(?:currently|set to)/i,
  // Change/update question patterns (AI asking if user wants to change)
  /(?:would|do) you (?:like|want) to (?:change|update|modify|edit)/i,
  /(?:want|like) to (?:change|update|modify|edit)/i,
  /(?:shall|should) (?:i|we) (?:change|update)/i,
  /what would you like (?:to\s+)?(?:change|update)/i,
  /what(?:'s| is) the new/i,
  // AI offering help patterns
  /(?:i(?:'ll| will)|let me)\s+(?:help|assist|update|change)/i,
  /(?:happy|glad) to (?:help|assist|change)/i,
  // AI incomplete sentence patterns (trailing ellipsis or cut-off)
  /should be\.{2,}$/i,
  /would be\.{2,}$/i,
  /will be\.{2,}$/i,
];

/**
 * Short words/phrases that should be ignored as noise.
 * These are either user acknowledgments, farewells, or clipped AI speech.
 */
const NOISE_WORDS = [
  /^bye\.?$/i,
  /^goodbye\.?$/i,
  /^thanks\.?$/i,
  /^thank you\.?$/i,
  /^okay\.?$/i,
  /^ok\.?$/i,
  /^yes\.?$/i,
  /^no\.?$/i,
  /^yep\.?$/i,
  /^nope\.?$/i,
  /^sure\.?$/i,
  /^right\.?$/i,
  /^got it\.?$/i,
  /^uh huh\.?$/i,
  /^mm hmm\.?$/i,
  /^hmm\.?$/i,
  // Filler sounds and hesitations
  /^uh+\.{0,3}$/i,
  /^um+\.{0,3}$/i,
  /^er+\.{0,3}$/i,
  /^ah+\.{0,3}$/i,
  /^oh+\.{0,3}$/i,
  /^hm+\.{0,3}$/i,
  /^\.{1,3}$/,  // Just dots/ellipsis
  /^[.…]+$/,    // Ellipsis characters
];

/**
 * Detects if a transcript is just noise (short acknowledgments, farewells, etc.)
 * that should not be captured as field values.
 *
 * @param transcript - The transcript to check
 * @returns true if the transcript is noise
 */
function isNoiseTranscript(transcript: string): boolean {
  // Normalize apostrophes to handle curly/smart quotes
  const normalized = normalizeApostrophes(transcript.trim());

  for (const pattern of NOISE_WORDS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects if a transcript appears to be from AI speech rather than user input.
 * This prevents AI responses from being processed as field values.
 *
 * @param transcript - The transcript to check
 * @returns true if the transcript looks like AI speech
 */
function isAIResponse(transcript: string): boolean {
  // Normalize apostrophes to handle curly/smart quotes from speech-to-text
  const normalized = normalizeApostrophes(transcript.trim());

  // Very short responses are unlikely to be AI speech
  if (normalized.length < 10) {
    return false;
  }

  // Check if transcript matches AI response patterns
  for (const pattern of AI_RESPONSE_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  // AI responses often contain multiple sentences with questions
  const hasQuestion = /\?/.test(normalized);
  const hasAcknowledgment = /^(?:got it|perfect|great|okay|sure|right|thanks)/i.test(normalized);
  if (hasQuestion && hasAcknowledgment) {
    return true;
  }

  // AI asking about next field - detect phrases like "what's the [field]?"
  // This catches cases where AI skips ahead to a different field than expected
  if (/what(?:'s| is) (?:the\s+)?(?:end date|start date|vision|problem|description|scope)/i.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Extracts the relevant field value from a conversational response.
 * Strips common fillers like "That'll be", "It's", "Um", etc.
 * For date fields, attempts to parse spoken dates into proper format.
 * For name fields, applies proper capitalization.
 *
 * @param transcript - The raw voice transcript
 * @param fieldId - The field being populated (for context-aware parsing)
 * @returns The cleaned value suitable for the field
 */
function extractFieldValue(transcript: string, fieldId: string): string {
  // Normalize apostrophes first to handle curly/smart quotes from speech-to-text
  let value = normalizeApostrophes(transcript.trim());

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

  // Remove trailing question marks and exclamation points from simple fields
  // (these are often artifacts of voice transcription, e.g., "John Doe?" instead of "John Doe")
  if (NAME_FIELDS.includes(fieldId) || fieldId === "project_name") {
    value = value.replace(/[?!]+$/, "").trim();
  }

  // If we stripped too much (empty result), fall back to original
  if (!value) {
    return transcript.trim();
  }

  // For date fields, try to parse spoken dates
  if (fieldId === "start_date" || fieldId === "end_date") {
    value = parseSpokenDate(value);
  }

  // For name fields, apply proper capitalization
  if (NAME_FIELDS.includes(fieldId)) {
    value = capitalizeName(value);
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
  /**
   * Timestamp of when we last sent an AI prompt.
   * Used to be more aggressive in filtering transcripts that arrive
   * shortly after (which are likely the AI's response, not user input).
   */
  private lastAIPromptTime: number = 0;
  /**
   * Cooldown period (in ms) after sending an AI prompt.
   * Transcripts arriving within this window are assumed to be AI speech.
   */
  private static readonly AI_RESPONSE_COOLDOWN_MS = 3000;
  /**
   * For long-form fields (vision, problem, description), we don't capture
   * the raw user input. Instead, we wait for the AI to reformulate it.
   * This tracks the field ID that's waiting for AI reformulation.
   */
  private pendingReformulationFieldId: string | null = null;
  /**
   * The raw user input that's pending AI reformulation.
   * Used as fallback if the AI doesn't provide a reformulated version.
   */
  private pendingReformulationRawValue: string | null = null;
  /**
   * Buffer for incomplete AI CAPTURE responses.
   * AI transcripts may arrive in chunks, so we buffer incomplete CAPTURE text
   * and wait for a complete sentence (ends with period) before capturing.
   */
  private pendingCaptureText: string | null = null;
  private pendingCaptureFieldId: string | null = null;
  /**
   * Callback to trigger document extraction from App.jsx.
   * This allows voice charter to request extraction when user agrees.
   */
  private extractionCallback: ExtractionCallback | null = null;
  /**
   * Attachment names for display in extraction prompt.
   */
  private attachmentNames: string[] = [];

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
      populatedFields: new Map(),
      awaitingFieldConfirmation: false,
      hasUnextractedAttachments: false,
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
   * Send a prompt to the AI and trigger a response.
   * Records the timestamp for filtering purposes.
   */
  private sendAIPrompt(message: string): void {
    console.log("[VoiceCharterService] sendAIPrompt:", {
      message: message.substring(0, 80),
      askingFieldId: this.askingFieldId,
    });
    if (!this.dataChannel) return;
    sendRealtimeEvent(this.dataChannel, createConversationItemEvent("user", message));
    sendRealtimeEvent(this.dataChannel, createResponseEvent());
    this.lastAIPromptTime = Date.now();
  }

  /**
   * Check if we're within the cooldown period after sending an AI prompt.
   * Used to be more aggressive in filtering transcripts.
   */
  private isWithinAICooldown(): boolean {
    return Date.now() - this.lastAIPromptTime < VoiceCharterService.AI_RESPONSE_COOLDOWN_MS;
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
   * @param schema - The charter form schema
   * @param dataChannel - The WebRTC data channel for Realtime API
   * @param populatedFields - Array of pre-populated field info (from extraction or manual input)
   * @param options - Additional options for initialization
   * @param options.attachments - List of attached files (for extraction prompt detection)
   * @param options.extractionCallback - Callback to trigger extraction when user agrees
   */
  initialize(
    schema: CharterFormSchema,
    dataChannel: RTCDataChannel,
    populatedFields?: PopulatedFieldInfo[],
    options?: {
      attachments?: VoiceCharterAttachment[];
      extractionCallback?: ExtractionCallback;
    }
  ): boolean {
    this.schema = schema;
    this.dataChannel = dataChannel;
    this.extractionCallback = options?.extractionCallback ?? null;
    this.attachmentNames = options?.attachments?.map(a => a.name) ?? [];

    // Determine if there are unextracted attachments
    // (attachments present but no populated fields from extraction)
    const hasAttachments = this.attachmentNames.length > 0;
    const hasExtractedFields = populatedFields?.some(f => f.source === "extraction") ?? false;
    const hasUnextractedAttachments = hasAttachments && !hasExtractedFields;

    // Build populated fields map and captured values from provided fields
    const populatedFieldsMap = new Map<string, PopulatedFieldInfo>();
    const capturedValues = new Map<string, CapturedFieldValue>();

    if (populatedFields) {
      for (const fieldInfo of populatedFields) {
        if (fieldInfo.displayValue) {
          populatedFieldsMap.set(fieldInfo.fieldId, fieldInfo);

          // Pre-populate captured values, but mark them as needing confirmation if from extraction
          capturedValues.set(fieldInfo.fieldId, {
            fieldId: fieldInfo.fieldId,
            value: fieldInfo.displayValue,
            confirmedAt: fieldInfo.needsConfirmation ? undefined : Date.now(),
            source: fieldInfo.source,
            userConfirmed: !fieldInfo.needsConfirmation,
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
      populatedFields: populatedFieldsMap,
      awaitingFieldConfirmation: false,
      hasUnextractedAttachments,
    });

    // Ensure conversation store session exists and sync existing values
    conversationActions.ensureSession(schema);
    if (populatedFields) {
      for (const fieldInfo of populatedFields) {
        if (fieldInfo.displayValue) {
          this.isInternalUpdate = true;
          try {
            conversationActions.dispatch({
              type: "CAPTURE",
              fieldId: fieldInfo.fieldId,
              value: fieldInfo.displayValue,
            });
          } finally {
            this.isInternalUpdate = false;
          }
        }
      }
    }

    // Subscribe to conversation store for two-way sync
    this.subscribeToConversationStore();

    // Configure the Realtime session with voice charter instructions
    // Include populated fields info so the AI knows about extracted values
    const config: SessionConfig = {
      instructions: generateSystemPrompt(schema, populatedFieldsMap),
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
        populatedFields: new Map(),
        awaitingFieldConfirmation: false,
      });
      return false;
    }

    return true;
  }

  /**
   * Start the voice charter conversation.
   */
  start(): boolean {
    console.log("[VoiceCharterService] start called:", {
      hasDataChannel: !!this.dataChannel,
      hasSchema: !!this.schema,
      currentFieldIndex: this.state.currentFieldIndex,
      currentFieldId: this.state.currentFieldId,
      populatedFieldsCount: this.state.populatedFields?.size ?? 0,
      hasUnextractedAttachments: this.state.hasUnextractedAttachments,
      attachmentNames: this.attachmentNames,
    });

    if (!this.dataChannel || !this.schema) {
      console.log("[VoiceCharterService] start: Missing dataChannel or schema");
      return false;
    }

    // Check if there are unextracted attachments - prompt user first
    if (this.state.hasUnextractedAttachments && this.extractionCallback) {
      console.log("[VoiceCharterService] start: Detected unextracted attachments, prompting user");
      this.promptForExtraction();
      return true;
    }

    // Continue with normal field collection flow
    return this.startFieldCollection();
  }

  /**
   * Prompt user to decide if they want to extract from uploaded document.
   */
  private promptForExtraction(): void {
    const attachmentList = this.attachmentNames.length === 1
      ? `"${this.attachmentNames[0]}"`
      : this.attachmentNames.map(n => `"${n}"`).join(", ");

    const prompt = `[EXTRACTION DECISION NEEDED]
The user has uploaded a document (${attachmentList}) but hasn't extracted project information from it yet.

Your task: Ask the user if they would like you to extract project information from the uploaded document first.

Say something like: "I see you've uploaded ${attachmentList}. Would you like me to extract project information from it to help fill out the charter? Just say yes or no."

Wait for their response:
- If they say "yes", "sure", "please", "extract" → We'll extract the information
- If they say "no", "skip", "start fresh" → We'll proceed without extraction

Keep it brief and conversational.`;

    this.updateState({ step: "awaiting_extraction_decision" });
    this.sendAIPrompt(prompt);
  }

  /**
   * Handle user's response to the extraction decision prompt.
   */
  private handleExtractionDecision(transcript: string): void {
    console.log("[VoiceCharterService] handleExtractionDecision:", transcript);

    // Check for affirmative response (wants extraction)
    const yesPatterns = [
      /^(?:yes|yeah|yep|yup|sure|please|okay|ok|absolutely|definitely)(?:\s|$|[,.])/i,
      /extract/i,
      /pull\s+(?:out|from)/i,
      /get\s+(?:the\s+)?(?:info|information)/i,
      /sounds?\s+good/i,
      /let'?s?\s+do\s+(?:it|that)/i,
      /go\s+ahead/i,
      /that\s+would\s+(?:be\s+)?(?:great|helpful|good)/i,
    ];

    const wantsExtraction = yesPatterns.some(p => p.test(transcript));

    // Check for negative response (skip extraction)
    const noPatterns = [
      /^(?:no|nope|nah|skip|don'?t|start\s+fresh)(?:\s|$|[,.])/i,
      /without\s+(?:it|extraction)/i,
      /from\s+scratch/i,
      /manually/i,
      /i'?ll\s+(?:do\s+it|enter)/i,
    ];

    const skipExtraction = noPatterns.some(p => p.test(transcript));

    if (wantsExtraction) {
      console.log("[VoiceCharterService] User wants extraction, triggering callback");
      this.triggerExtraction();
    } else if (skipExtraction) {
      console.log("[VoiceCharterService] User skipped extraction, starting field collection");
      this.updateState({ hasUnextractedAttachments: false });

      // Send AI acknowledgment and start field collection
      this.sendAIPrompt(
        "[User declined extraction] Say 'Okay, no problem!' or similar, then ask about the first field: " +
        `${this.schema?.fields[0]?.label ?? "Project Name"}.\n` +
        generateFieldPrompt(this.schema?.fields[0]!, true)
      );
      this.updateState({ step: "asking" });
      this.askingFieldId = this.schema?.fields[0]?.id ?? null;
    } else {
      // Ambiguous response - ask again
      console.log("[VoiceCharterService] Ambiguous extraction decision response");
      this.sendAIPrompt(
        "[Unclear response] The user's response was unclear. " +
        "Ask them again simply: 'Would you like me to extract information from your document? Yes or no?'"
      );
    }
  }

  /**
   * Trigger document extraction and wait for results.
   */
  private async triggerExtraction(): Promise<void> {
    if (!this.extractionCallback) {
      console.error("[VoiceCharterService] No extraction callback available");
      this.updateState({ hasUnextractedAttachments: false });
      this.startFieldCollection();
      return;
    }

    // Update state and notify
    this.updateState({ step: "extracting" });
    this.emit({ type: "extraction_requested" });

    // Tell AI we're extracting
    this.sendAIPrompt(
      "[EXTRACTING] Say something like: 'Great, let me extract the project information from your document. This will just take a moment...'"
    );

    try {
      console.log("[VoiceCharterService] Calling extraction callback");
      const extractedFields = await this.extractionCallback();

      if (extractedFields) {
        console.log("[VoiceCharterService] Extraction completed:", Object.keys(extractedFields));

        // Update captured values with extracted data
        const newCapturedValues = new Map(this.state.capturedValues);
        const newPopulatedFields = new Map(this.state.populatedFields);

        for (const [fieldId, value] of Object.entries(extractedFields)) {
          if (value !== null && value !== undefined && value !== "") {
            const displayValue = typeof value === "string" ? value :
              Array.isArray(value) ? value.join(", ") : JSON.stringify(value);

            newPopulatedFields.set(fieldId, {
              fieldId,
              value,
              displayValue,
              source: "extraction",
              needsConfirmation: true,
            });

            newCapturedValues.set(fieldId, {
              fieldId,
              value: displayValue,
              source: "extraction",
              userConfirmed: false,
            });
          }
        }

        this.updateState({
          capturedValues: newCapturedValues,
          populatedFields: newPopulatedFields,
          hasUnextractedAttachments: false,
        });

        this.emit({ type: "extraction_completed", fields: extractedFields });

        // Notify AI and start field collection with confirmation flow
        const extractedCount = Object.keys(extractedFields).filter(k =>
          extractedFields[k] !== null && extractedFields[k] !== undefined && extractedFields[k] !== ""
        ).length;

        this.sendAIPrompt(
          `[EXTRACTION COMPLETE] I extracted ${extractedCount} field(s) from the document. ` +
          "Now start the confirmation flow. For the first extracted field, say something like: " +
          "'Great, I found some information! Let me confirm what I extracted. " +
          `Based on the document, the ${this.schema?.fields[0]?.label?.toLowerCase() ?? "project name"} is...' ` +
          "and ask if they want to keep it or change it."
        );

        // Start field collection (will now use confirmation flow)
        setTimeout(() => {
          this.startFieldCollection();
        }, 500);
      } else {
        console.log("[VoiceCharterService] Extraction returned no results");
        this.updateState({ hasUnextractedAttachments: false });

        this.sendAIPrompt(
          "[EXTRACTION FAILED] The extraction didn't find usable information. " +
          "Say something like: 'I wasn't able to extract much from that document. " +
          "Let's go through the fields together.' Then ask about the first field."
        );

        this.startFieldCollection();
      }
    } catch (error) {
      console.error("[VoiceCharterService] Extraction error:", error);
      this.updateState({ hasUnextractedAttachments: false });

      this.sendAIPrompt(
        "[EXTRACTION ERROR] Something went wrong with the extraction. " +
        "Say something like: 'Sorry, I had trouble reading that document. " +
        "Let's just go through the fields together.' Then ask about the first field."
      );

      this.startFieldCollection();
    }
  }

  /**
   * Start the normal field collection flow.
   * Called after extraction decision is made or if no extraction prompt needed.
   */
  private startFieldCollection(): boolean {
    if (!this.dataChannel || !this.schema) {
      return false;
    }

    const firstField = this.getCurrentField();
    if (!firstField) {
      console.log("[VoiceCharterService] startFieldCollection: No first field found");
      return false;
    }

    console.log("[VoiceCharterService] startFieldCollection: Setting askingFieldId to", firstField.id);

    // Track which field we're asking about
    this.askingFieldId = firstField.id;

    // Sync to conversation store for UI highlighting
    this.syncCurrentFieldToStore(firstField.id);

    // Check if first field is pre-populated from extraction
    const populatedInfo = this.state.populatedFields?.get(firstField.id);
    const hasExtractedFields = this.state.populatedFields &&
      Array.from(this.state.populatedFields.values()).some(f => f.source === "extraction");

    // Build context with any existing values
    let context = "Starting voice charter session.\n";

    // Inform AI about extracted fields if present
    if (hasExtractedFields) {
      const extractedCount = Array.from(this.state.populatedFields!.values())
        .filter(f => f.source === "extraction").length;
      context += `Note: The user uploaded a document and ${extractedCount} field(s) were extracted. `;
      context += "For each pre-populated field, confirm with the user before moving on.\n\n";
    }

    if (this.state.capturedValues.size > 0) {
      context += "Pre-populated values from uploaded document:\n";
      for (const [fieldId, captured] of this.state.capturedValues) {
        const field = this.schema.fields.find((f) => f.id === fieldId);
        const popInfo = this.state.populatedFields?.get(fieldId);
        if (field) {
          const source = popInfo?.source === "extraction" ? " [from document]" : "";
          const confirmed = captured.userConfirmed ? " [confirmed]" : " [needs confirmation]";
          context += `- ${field.label}${source}${confirmed}: ${captured.value}\n`;
        }
      }
      context += "\n";
    }

    context += `Current field to ask about: ${firstField.label}\n`;

    // Generate appropriate prompt based on whether field is pre-populated
    if (populatedInfo && populatedInfo.source === "extraction" && populatedInfo.needsConfirmation) {
      context += `This field was extracted from the user's uploaded document. Ask to confirm or change.\n`;
      this.updateState({ awaitingFieldConfirmation: true });
    }

    context += generateFieldPrompt(firstField, true, populatedInfo);

    // Send context and trigger AI to speak
    this.sendAIPrompt(context);

    this.updateState({ step: "asking" });
    return true;
  }

  /**
   * Process a transcript from voice input.
   *
   * @param transcript - The transcript text to process
   * @param source - The source of the transcript: "ai" for AI speech, "user" for user speech.
   *                 When source is known, we skip heuristic AI detection entirely.
   *                 AI transcripts are only checked for CAPTURE patterns.
   *                 User transcripts are processed for commands and values.
   */
  processTranscript(transcript: string, source?: TranscriptSource): void {
    console.log("[VoiceCharterService] processTranscript called:", {
      transcript: transcript.substring(0, 80),
      source: source || "unknown",
      askingFieldId: this.askingFieldId,
      currentFieldId: this.state.currentFieldId,
      currentFieldIndex: this.state.currentFieldIndex,
      step: this.state.step,
      pendingReformulationFieldId: this.pendingReformulationFieldId,
    });

    if (!this.schema || !this.dataChannel) {
      console.log("[VoiceCharterService] processTranscript: No schema or dataChannel, returning");
      return;
    }

    // If source is explicitly "ai", only process CAPTURE patterns - skip all user input handling
    if (source === "ai") {
      this.processAITranscript(transcript);
      return;
    }

    // If source is explicitly "user", skip AI detection entirely
    if (source === "user") {
      this.processUserTranscript(transcript);
      return;
    }

    // Fallback for unknown source: use legacy heuristic detection
    // (kept for backwards compatibility)
    console.log("[VoiceCharterService] processTranscript: Using legacy heuristic detection (source unknown)");

    // Normalize apostrophes to handle curly/smart quotes from speech-to-text
    const normalizedTranscript = normalizeApostrophes(transcript.toLowerCase().trim());

    // PRIORITY 0: Check for AI reformulation capture (CAPTURE: [text])
    // This MUST be checked BEFORE filtering AI responses, as the AI uses this to
    // submit reformulated text for long-form fields like vision, problem, description.
    // Check if we're waiting for reformulation OR if current field is a long-form field
    // (the AI might proactively provide CAPTURE based on context before user input)
    const currentFieldIsLongForm = this.askingFieldId && LONG_FORM_FIELDS.includes(this.askingFieldId);
    const shouldCheckForCapture = this.pendingReformulationFieldId || currentFieldIsLongForm;

    if (shouldCheckForCapture) {
      // First, check if we have a pending incomplete CAPTURE and this is a continuation
      if (this.pendingCaptureText && this.pendingCaptureFieldId) {
        // Check if this transcript contains a new CAPTURE (replacement) or continues the pending one
        const hasNewCapture = /CAPTURE:/i.test(transcript);

        if (hasNewCapture) {
          // New CAPTURE found - extract it and check if it's more complete
          for (const pattern of AI_CAPTURE_PATTERNS) {
            const match = transcript.match(pattern);
            if (match && match[1]) {
              const newValue = match[1].trim();
              // Use the new CAPTURE if it's longer (more complete) or ends with period
              if (newValue.length > this.pendingCaptureText.length || /\.\s*$/.test(newValue)) {
                this.pendingCaptureText = newValue;
                console.log("[VoiceCharterService] processTranscript: Updated pending CAPTURE with longer text", {
                  fieldId: this.pendingCaptureFieldId,
                  newText: newValue.substring(0, 80),
                });
              }
              break;
            }
          }
        }

        // Check if the transcript signals moving to next field (time to finalize capture)
        const isTransitionPhrase = AI_NEXT_FIELD_PATTERNS.some((p) => p.test(transcript)) ||
          /(?:now|next)[,.]?\s+what/i.test(transcript) ||
          /what(?:'s| is) the (?:problem|description|scope)/i.test(transcript);

        // Also check if pending text looks complete (ends with period)
        const pendingLooksComplete = /\.\s*$/.test(this.pendingCaptureText);

        if (isTransitionPhrase || pendingLooksComplete) {
          console.log("[VoiceCharterService] processTranscript: Finalizing buffered CAPTURE", {
            fieldId: this.pendingCaptureFieldId,
            value: this.pendingCaptureText.substring(0, 80),
            reason: pendingLooksComplete ? "complete sentence" : "transition phrase",
          });

          // Capture the buffered value
          this.captureValue(this.pendingCaptureFieldId, this.pendingCaptureText);

          // Clear states and advance
          const capturedFieldId = this.pendingCaptureFieldId;
          this.pendingCaptureText = null;
          this.pendingCaptureFieldId = null;
          this.pendingReformulationFieldId = null;
          this.pendingReformulationRawValue = null;
          this.advanceAskingField();

          this.updateState({
            step: "listening",
            pendingValue: this.pendingCaptureText || "",
          });
          return;
        }

        // Not ready to finalize yet - skip other processing for this transcript
        return;
      }

      // Try all capture patterns to find the reformulated text
      let reformulatedValue: string | null = null;
      for (const pattern of AI_CAPTURE_PATTERNS) {
        const match = transcript.match(pattern);
        if (match && match[1]) {
          reformulatedValue = match[1].trim();
          break;
        }
      }

      if (reformulatedValue) {
        // Determine which field to capture to: pending field takes priority, then current asking field
        const targetFieldId = this.pendingReformulationFieldId || this.askingFieldId;

        // Check if this CAPTURE looks complete (ends with period or has transition phrase)
        const looksComplete = /\.\s*$/.test(reformulatedValue) ||
          /(?:now|next)[,.]?\s+what/i.test(transcript);

        if (!looksComplete && targetFieldId && LONG_FORM_FIELDS.includes(targetFieldId)) {
          // Buffer incomplete CAPTURE for long-form fields
          console.log("[VoiceCharterService] processTranscript: Buffering incomplete CAPTURE", {
            fieldId: targetFieldId,
            value: reformulatedValue.substring(0, 80),
          });
          this.pendingCaptureText = reformulatedValue;
          this.pendingCaptureFieldId = targetFieldId;
          return;
        }

        console.log("[VoiceCharterService] processTranscript: AI reformulation captured", {
          fieldId: targetFieldId,
          reformulatedValue: reformulatedValue.substring(0, 80),
          hadPendingField: !!this.pendingReformulationFieldId,
        });

        if (targetFieldId) {
          // Capture the AI's reformulated value
          this.captureValue(targetFieldId, reformulatedValue);

          // Clear the pending state and advance
          this.pendingReformulationFieldId = null;
          this.pendingReformulationRawValue = null;
          this.pendingCaptureText = null;
          this.pendingCaptureFieldId = null;
          this.advanceAskingField();

          this.updateState({
            step: "listening",
            pendingValue: reformulatedValue,
          });
          return;
        }
      }

      // Check if AI has moved on to the next field without providing CAPTURE
      // If so, use the raw user input as fallback (only if we had pending reformulation)
      if (this.pendingReformulationFieldId) {
        const aiMovedOn = AI_NEXT_FIELD_PATTERNS.some((pattern) => pattern.test(transcript));
        if (aiMovedOn && this.pendingReformulationRawValue) {
          console.log("[VoiceCharterService] processTranscript: AI moved on without CAPTURE, using raw input as fallback", {
            fieldId: this.pendingReformulationFieldId,
            rawValue: this.pendingReformulationRawValue.substring(0, 80),
          });

          // Capture the raw user input as fallback
          this.captureValue(this.pendingReformulationFieldId, this.pendingReformulationRawValue);

          // Clear the pending state and advance
          this.pendingReformulationFieldId = null;
          this.pendingReformulationRawValue = null;
          this.advanceAskingField();

          this.updateState({
            step: "listening",
            pendingValue: transcript,
          });
          return;
        }
      }
    }

    // PRIORITY 1: Skip AI responses that got transcribed FIRST
    // (AI speech goes through Whisper and comes back as transcripts)
    // This MUST be checked BEFORE navigation commands because AI responses like
    // "Sure, let's go back..." would otherwise trigger navigation
    if (isAIResponse(transcript)) {
      console.log("[VoiceCharterService] [AI DETECTED] Skipping AI response:", transcript.substring(0, 50));
      return;
    }

    // PRIORITY 2: Skip noise (short acknowledgments, farewells, etc.)
    if (isNoiseTranscript(transcript)) {
      console.log("[VoiceCharterService] [NOISE] Skipping noise transcript:", transcript);
      return;
    }

    // If we reach here, this is a user transcript that will be processed
    console.log("[VoiceCharterService] [USER INPUT] Processing user transcript:", transcript.substring(0, 50));

    // PRIORITY 3: Check for navigation commands
    // Now safe to process since we've filtered out AI responses
    if (this.handleNavigationCommand(normalizedTranscript)) {
      // Clear pending reformulation if user navigates away
      if (this.pendingReformulationFieldId && this.pendingReformulationRawValue) {
        console.log("[VoiceCharterService] processTranscript: Navigation detected, capturing pending raw value as fallback", {
          fieldId: this.pendingReformulationFieldId,
        });
        // Capture the raw value before navigating
        this.captureValue(this.pendingReformulationFieldId, this.pendingReformulationRawValue);
        this.pendingReformulationFieldId = null;
        this.pendingReformulationRawValue = null;
      }
      return;
    }

    // PRIORITY 4: Extra safeguard for AI cooldown period
    if (this.isWithinAICooldown()) {
      // Only process if it's clearly a short user response (name, date, etc.)
      // Long transcripts during cooldown are likely AI speech that slipped through
      const isShortResponse = transcript.trim().length < 50;
      const looksLikeValue = /^[\w\s\-'.,]+$/.test(transcript.trim());

      if (!isShortResponse || !looksLikeValue) {
        console.log("[VoiceCharterService] [AI DETECTED] Skipping during AI cooldown (likely AI speech):", transcript.substring(0, 50));
        return;
      }
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

    // PRIORITY 5: Skip transcripts that are questions (likely AI asking about fields)
    // User responses should be statements, not questions
    const endsWithQuestion = transcript.trim().endsWith("?");
    if (endsWithQuestion) {
      // Check if this is asking about a field (AI behavior)
      const normalizedCheck = normalizeApostrophes(transcript.toLowerCase());
      const isFieldQuestion = /what(?:'s| is) (?:the\s+)?(?:project|name|title|sponsor|lead|date|vision|problem|description|scope|risk)/i.test(normalizedCheck) ||
        /who(?:'s| is) (?:the\s+)?(?:project|sponsor|lead)/i.test(normalizedCheck) ||
        /when (?:is|does|will)/i.test(normalizedCheck);
      if (isFieldQuestion) {
        console.log("[VoiceCharterService] [AI DETECTED] Skipping field question (likely AI):", transcript.substring(0, 50));
        return;
      }
    }

    // Use askingFieldId to ensure we capture to the correct field
    // (the one the AI was asking about, not the current field which may have changed)
    const targetFieldId = this.askingFieldId;
    console.log("[VoiceCharterService] processTranscript: targetFieldId =", targetFieldId);
    if (targetFieldId) {
      // For long-form fields, don't capture user's raw input directly.
      // Instead, wait for the AI to reformulate it and say "CAPTURE: [text]"
      if (LONG_FORM_FIELDS.includes(targetFieldId)) {
        // Extract the value from the user's response (strip conversational fillers)
        const rawValue = extractFieldValue(transcript, targetFieldId);

        // Accumulate transcript chunks if we're still waiting for the same field
        // (user may speak in multiple sentences/phrases)
        if (this.pendingReformulationFieldId === targetFieldId && this.pendingReformulationRawValue) {
          // Append new chunk to existing value with a space separator
          this.pendingReformulationRawValue = this.pendingReformulationRawValue + " " + rawValue;
          console.log("[VoiceCharterService] processTranscript: Long-form field, accumulating transcript", {
            targetFieldId,
            newChunk: rawValue.substring(0, 50),
            accumulatedValue: this.pendingReformulationRawValue.substring(0, 80),
          });
        } else {
          // First chunk for this field
          this.pendingReformulationFieldId = targetFieldId;
          this.pendingReformulationRawValue = rawValue;
          console.log("[VoiceCharterService] processTranscript: Long-form field, waiting for AI reformulation", {
            targetFieldId,
            rawTranscript: transcript.substring(0, 50),
            extractedRawValue: rawValue.substring(0, 50),
          });
        }

        // Don't advance yet - wait for AI to say "CAPTURE: [text]"
        this.updateState({
          step: "listening",
          pendingValue: transcript,
        });
        return;
      }

      // Extract the relevant value from the conversational response
      const extractedValue = extractFieldValue(transcript, targetFieldId);
      console.log("[VoiceCharterService] processTranscript: Capturing value", {
        targetFieldId,
        rawTranscript: transcript.substring(0, 50),
        extractedValue: extractedValue.substring(0, 50),
      });

      // Capture the cleaned value to the form
      this.captureValue(targetFieldId, extractedValue);

      // Advance to the next field so subsequent transcripts go to the right place
      // (The AI will ask about the next field in its spoken response)
      this.advanceAskingField();
    } else {
      console.log("[VoiceCharterService] processTranscript: No targetFieldId, skipping capture");
    }

    this.updateState({
      step: "listening",
      pendingValue: transcript,
    });
  }

  /**
   * Process a transcript that is known to be from AI speech.
   * Only handles CAPTURE patterns - all user input handling is skipped.
   */
  private processAITranscript(transcript: string): void {
    console.log("[VoiceCharterService] [AI] Processing AI transcript:", transcript.substring(0, 80));

    // Check if we're waiting for reformulation OR if current field is a long-form field
    const currentFieldIsLongForm = this.askingFieldId && LONG_FORM_FIELDS.includes(this.askingFieldId);
    const shouldCheckForCapture = this.pendingReformulationFieldId || currentFieldIsLongForm;

    if (!shouldCheckForCapture) {
      // No CAPTURE expected, just skip
      console.log("[VoiceCharterService] [AI] No CAPTURE expected, skipping");
      return;
    }

    // Handle pending incomplete CAPTURE
    if (this.pendingCaptureText && this.pendingCaptureFieldId) {
      const hasNewCapture = /CAPTURE:/i.test(transcript);

      if (hasNewCapture) {
        // New CAPTURE found - extract and check if more complete
        for (const pattern of AI_CAPTURE_PATTERNS) {
          const match = transcript.match(pattern);
          if (match && match[1]) {
            const newValue = this.sanitizeCapturedValue(match[1].trim());
            if (newValue.length > this.pendingCaptureText.length || /\.\s*$/.test(newValue)) {
              this.pendingCaptureText = newValue;
              console.log("[VoiceCharterService] [AI] Updated pending CAPTURE:", newValue.substring(0, 80));
            }
            break;
          }
        }
      }

      // Check if ready to finalize
      const isTransitionPhrase = AI_NEXT_FIELD_PATTERNS.some((p) => p.test(transcript)) ||
        /(?:now|next)[,.]?\s+what/i.test(transcript) ||
        /what(?:'s| is) the (?:problem|description|scope)/i.test(transcript);
      const pendingLooksComplete = /\.\s*$/.test(this.pendingCaptureText);

      if (isTransitionPhrase || pendingLooksComplete) {
        console.log("[VoiceCharterService] [AI] Finalizing buffered CAPTURE:", this.pendingCaptureText.substring(0, 80));
        this.captureValue(this.pendingCaptureFieldId, this.pendingCaptureText);
        this.pendingCaptureText = null;
        this.pendingCaptureFieldId = null;
        this.pendingReformulationFieldId = null;
        this.pendingReformulationRawValue = null;
        this.advanceAskingField();
        this.updateState({ step: "listening", pendingValue: "" });
      }
      return;
    }

    // Try to extract CAPTURE value
    let reformulatedValue: string | null = null;
    for (const pattern of AI_CAPTURE_PATTERNS) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        reformulatedValue = this.sanitizeCapturedValue(match[1].trim());
        break;
      }
    }

    if (reformulatedValue) {
      const targetFieldId = this.pendingReformulationFieldId || this.askingFieldId;
      const looksComplete = /\.\s*$/.test(reformulatedValue) ||
        /(?:now|next)[,.]?\s+what/i.test(transcript);

      if (!looksComplete && targetFieldId && LONG_FORM_FIELDS.includes(targetFieldId)) {
        // Buffer incomplete CAPTURE
        console.log("[VoiceCharterService] [AI] Buffering incomplete CAPTURE:", reformulatedValue.substring(0, 80));
        this.pendingCaptureText = reformulatedValue;
        this.pendingCaptureFieldId = targetFieldId;
        return;
      }

      if (targetFieldId) {
        console.log("[VoiceCharterService] [AI] Capturing reformulated value:", reformulatedValue.substring(0, 80));
        this.captureValue(targetFieldId, reformulatedValue);
        this.pendingReformulationFieldId = null;
        this.pendingReformulationRawValue = null;
        this.pendingCaptureText = null;
        this.pendingCaptureFieldId = null;
        this.advanceAskingField();
        this.updateState({ step: "listening", pendingValue: reformulatedValue });
        return;
      }
    }

    // Check if AI moved on without CAPTURE - use raw input as fallback
    if (this.pendingReformulationFieldId && this.pendingReformulationRawValue) {
      const aiMovedOn = AI_NEXT_FIELD_PATTERNS.some((p) => p.test(transcript));
      if (aiMovedOn) {
        console.log("[VoiceCharterService] [AI] Moved on without CAPTURE, using raw fallback");
        this.captureValue(this.pendingReformulationFieldId, this.pendingReformulationRawValue);
        this.pendingReformulationFieldId = null;
        this.pendingReformulationRawValue = null;
        this.advanceAskingField();
        this.updateState({ step: "listening", pendingValue: transcript });
      }
    }
  }

  /**
   * Process a transcript that is known to be from user speech.
   * Skips all AI detection heuristics - goes straight to user input handling.
   */
  private processUserTranscript(transcript: string): void {
    console.log("[VoiceCharterService] [USER] Processing user transcript:", transcript.substring(0, 80));

    // Skip noise (short acknowledgments, farewells, etc.)
    if (isNoiseTranscript(transcript)) {
      console.log("[VoiceCharterService] [USER] Skipping noise transcript:", transcript);
      return;
    }

    // Normalize for command detection
    const normalizedTranscript = normalizeApostrophes(transcript.toLowerCase().trim());

    // Handle extraction decision if we're waiting for it
    if (this.state.step === "awaiting_extraction_decision") {
      this.handleExtractionDecision(normalizedTranscript);
      return;
    }

    // Check for navigation commands
    if (this.handleNavigationCommand(normalizedTranscript)) {
      // Clear pending reformulation if user navigates away
      if (this.pendingReformulationFieldId && this.pendingReformulationRawValue) {
        console.log("[VoiceCharterService] [USER] Navigation detected, capturing pending raw value");
        this.captureValue(this.pendingReformulationFieldId, this.pendingReformulationRawValue);
        this.pendingReformulationFieldId = null;
        this.pendingReformulationRawValue = null;
      }
      return;
    }

    // Check for skip command
    if (normalizedTranscript.includes("skip") &&
        (normalizedTranscript.includes("this") || normalizedTranscript.includes("field") || normalizedTranscript === "skip")) {
      this.skipCurrentField();
      return;
    }

    // Check for completion command
    if (normalizedTranscript.includes("done") || normalizedTranscript.includes("finish") || normalizedTranscript.includes("complete")) {
      this.complete();
      return;
    }

    // Check for review command
    if (normalizedTranscript.includes("review") || normalizedTranscript.includes("show progress") || normalizedTranscript.includes("what do i have")) {
      this.reviewProgress();
      return;
    }

    // Check for "review extracted" command
    if (normalizedTranscript.includes("review extracted") || normalizedTranscript.includes("show extracted")) {
      this.reviewExtractedFields();
      return;
    }

    // Check for "confirm all" / "keep all" command
    if (normalizedTranscript.includes("confirm all") || normalizedTranscript.includes("keep all") ||
        normalizedTranscript.includes("accept all")) {
      this.confirmAllExtractedFields();
      return;
    }

    // Check for field confirmation commands (for pre-populated fields)
    if (this.state.awaitingFieldConfirmation) {
      const confirmResult = this.handleFieldConfirmation(normalizedTranscript);
      if (confirmResult !== null) {
        return;
      }
    }

    // Check for correction commands
    if (this.handleCorrectionCommand(normalizedTranscript)) {
      return;
    }

    // Capture user value
    const targetFieldId = this.askingFieldId || this.state.currentFieldId;

    if (targetFieldId) {
      // Check if this is a long-form field that needs AI reformulation
      if (LONG_FORM_FIELDS.includes(targetFieldId)) {
        const rawValue = extractFieldValue(transcript, targetFieldId);

        if (this.pendingReformulationFieldId === targetFieldId && this.pendingReformulationRawValue) {
          // Accumulate additional input
          this.pendingReformulationRawValue += " " + rawValue;
          console.log("[VoiceCharterService] [USER] Long-form field, accumulating:", rawValue.substring(0, 50));
        } else {
          // First input for this field
          this.pendingReformulationFieldId = targetFieldId;
          this.pendingReformulationRawValue = rawValue;
          console.log("[VoiceCharterService] [USER] Long-form field, waiting for AI reformulation:", rawValue.substring(0, 50));
        }

        this.updateState({ step: "listening", pendingValue: transcript });
        return;
      }

      // Extract and capture value for non-long-form fields
      const extractedValue = extractFieldValue(transcript, targetFieldId);
      console.log("[VoiceCharterService] [USER] Capturing value:", extractedValue.substring(0, 50));
      this.captureValue(targetFieldId, extractedValue);
      this.advanceAskingField();
    }

    this.updateState({ step: "listening", pendingValue: transcript });
  }

  /**
   * Sanitize a captured value by removing "CAPTURE:" prefix if present.
   * This handles edge cases where the CAPTURE pattern might not extract cleanly.
   */
  private sanitizeCapturedValue(value: string): string {
    // Remove "CAPTURE:" prefix if still present (shouldn't happen with correct regex, but safety check)
    let sanitized = value.replace(/^CAPTURE:\s*/i, "").trim();
    return sanitized;
  }

  /**
   * Advance askingFieldId to the next EMPTY field without sending AI messages.
   * This is called after capturing a value so the next transcript goes to the right field.
   * The AI handles asking about the next field in its spoken response.
   *
   * After going back to update a field, this will skip over fields that already have
   * values and advance to the next empty field.
   */
  private advanceAskingField(): void {
    if (!this.schema) {
      return;
    }

    const previousFieldId = this.askingFieldId;

    // Find the next empty field starting from currentFieldIndex + 1
    // This ensures we skip over fields that already have values
    let nextIndex = this.state.currentFieldIndex + 1;
    let nextField = null;

    while (nextIndex < this.schema.fields.length) {
      const candidateField = this.schema.fields[nextIndex];
      const hasValue = this.state.capturedValues.has(candidateField.id);

      if (!hasValue) {
        // Found an empty field
        nextField = candidateField;
        break;
      }

      console.log(`[VoiceCharterService] advanceAskingField: Skipping ${candidateField.id} (already has value)`);
      nextIndex++;
    }

    if (!nextField) {
      // All fields are complete
      this.askingFieldId = null;
      console.log("[VoiceCharterService] All fields complete, askingFieldId set to null");
      return;
    }

    this.askingFieldId = nextField.id;

    console.log(`[VoiceCharterService] advanceAskingField: ${previousFieldId} -> ${nextField.id} (index ${nextIndex})`);

    this.updateState({
      step: "asking",
      currentFieldIndex: nextIndex,
      currentFieldId: nextField.id,
      pendingValue: null,
    });

    // Sync the current field to the conversation store so the UI updates
    // This ensures "Working on: X" display matches the voice service's current field
    this.syncCurrentFieldToStore(nextField.id);
  }

  /**
   * Sync the current field to the conversation store.
   * This updates the UI's "Working on: X" indicator and field highlighting.
   */
  private syncCurrentFieldToStore(fieldId: string): void {
    console.log("[VoiceCharterService] syncCurrentFieldToStore:", {
      fieldId,
      askingFieldId: this.askingFieldId,
      currentFieldId: this.state.currentFieldId,
    });
    try {
      this.isInternalUpdate = true;
      // Dispatch ASK event to update the conversation store's current field
      conversationActions.dispatch({ type: "ASK", fieldId });
      console.log("[VoiceCharterService] syncCurrentFieldToStore: ASK dispatched for", fieldId);
    } catch (error) {
      console.error("[VoiceCharterService] Failed to sync current field to store:", error);
    } finally {
      this.isInternalUpdate = false;
    }
  }

  /**
   * Handle navigation commands.
   */
  private handleNavigationCommand(transcript: string): boolean {
    console.log("[VoiceCharterService] handleNavigationCommand:", transcript.substring(0, 50));

    // Check for "back to [field]" pattern - navigate to specific field
    // Handles: "go back to the title", "back to project title", "no, back to the title, please"
    // Also handles: "can you go back to...", "could you go back to..."
    // Made more flexible to match "back to" without requiring "go" prefix
    const backToMatch = transcript.match(/(?:can\s+you\s+|could\s+you\s+)?(?:go\s+)?back\s+to\s+(?:the\s+)?(.+?)(?:\s*[,.]?\s*please|\s*\?|$)/i);
    if (backToMatch) {
      const fieldName = backToMatch[1].toLowerCase().trim();
      console.log("[VoiceCharterService] handleNavigationCommand: Detected 'back to' field:", fieldName);
      const field = this.schema?.fields.find(
        (f) =>
          f.label.toLowerCase().includes(fieldName) ||
          f.id.toLowerCase().includes(fieldName.replace(/\s+/g, "_")) ||
          fieldName.includes(f.label.toLowerCase())
      );
      if (field) {
        this.goToField(field.id);
        return true;
      }
    }

    // Check for "return to [field]" pattern separately
    const returnToMatch = transcript.match(/return\s+to\s+(?:the\s+)?(.+?)(?:\s*[,.]?\s*please|\s*\?|$)/i);
    if (returnToMatch) {
      const fieldName = returnToMatch[1].toLowerCase().trim();
      console.log("[VoiceCharterService] handleNavigationCommand: Detected 'return to' field:", fieldName);
      const field = this.schema?.fields.find(
        (f) =>
          f.label.toLowerCase().includes(fieldName) ||
          f.id.toLowerCase().includes(fieldName.replace(/\s+/g, "_")) ||
          fieldName.includes(f.label.toLowerCase())
      );
      if (field) {
        this.goToField(field.id);
        return true;
      }
    }

    // Check for "go to [field]" pattern (without "back")
    // Handles: "go to the start date", "go to start date field", "go to project name"
    const goToMatch = transcript.match(/^(?:can\s+you\s+)?go\s+to\s+(?:the\s+)?(.+?)(?:\s+field)?(?:\s*[,.]?\s*please|\s*\?|$)/i);
    if (goToMatch) {
      const fieldName = goToMatch[1].toLowerCase().trim();
      // Skip if this looks like "go to back" which should be handled by back-to pattern
      if (!fieldName.includes("back")) {
        console.log("[VoiceCharterService] handleNavigationCommand: Detected 'go to' field:", fieldName);
        const field = this.schema?.fields.find(
          (f) =>
            f.label.toLowerCase().includes(fieldName) ||
            f.id.toLowerCase().includes(fieldName.replace(/\s+/g, "_")) ||
            fieldName.includes(f.label.toLowerCase())
        );
        if (field) {
          this.goToField(field.id);
          return true;
        }
      }
    }

    // Check for rejection prefix followed by navigation intent
    // E.g., "no, back to title" or "wait, go back" or "actually, let's go back"
    const rejectionNavigationMatch = transcript.match(/^(?:no|wait|actually|stop)[,.]?\s+(?:let'?s?\s+)?(?:go\s+)?back(?:\s+to\s+(?:the\s+)?(.+?))?(?:\s*[,.]?\s*please|\s*\?|$)/i);
    if (rejectionNavigationMatch) {
      const fieldName = rejectionNavigationMatch[1]?.toLowerCase().trim();
      if (fieldName) {
        console.log("[VoiceCharterService] handleNavigationCommand: Detected rejection + back to field:", fieldName);
        const field = this.schema?.fields.find(
          (f) =>
            f.label.toLowerCase().includes(fieldName) ||
            f.id.toLowerCase().includes(fieldName.replace(/\s+/g, "_")) ||
            fieldName.includes(f.label.toLowerCase())
        );
        if (field) {
          this.goToField(field.id);
          return true;
        }
      } else {
        // Just "no, go back" without specific field
        console.log("[VoiceCharterService] handleNavigationCommand: Detected rejection + go back");
        this.goToPreviousField();
        return true;
      }
    }

    // Go back / previous (without specific field)
    if (
      transcript.includes("go back") ||
      transcript.includes("previous") ||
      transcript.includes("back one")
    ) {
      console.log("[VoiceCharterService] handleNavigationCommand: Detected 'go back'");
      this.goToPreviousField();
      return true;
    }

    // Check for correction patterns like "No, project title should be X"
    // or "Actually, the sponsor is Y" or "The title should be X"
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
   * IMPORTANT: If the field being referenced is the SAME as the current asking field,
   * this is NOT a correction - it's a normal response.
   */
  private handleCorrectionCommand(transcript: string): boolean {
    console.log("[VoiceCharterService] handleCorrectionCommand:", transcript.substring(0, 50));

    if (!this.schema || !this.dataChannel) {
      return false;
    }

    // Patterns for corrections - explicit indicator OR field mention (when different from current)
    // The key is: if user mentions a different field, it's a correction even without "no" or "actually"
    const correctionPatterns = [
      // Explicit correction indicators: "No, the title should be X"
      /^(?:no|actually|wait|sorry|oops)[,.]?\s+(?:the\s+)?(.+?)\s+(?:should be|should have been|is|was|needs to be)\s+(.+)$/i,
      /^(?:change|update|set)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i,
      /^(?:make|put)\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(.+)$/i,
      // Field mention without indicator: "The title should be X" (only treated as correction if different field)
      /^(?:the\s+)?(.+?)\s+(?:should be|needs to be)\s+(.+)$/i,
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
          // If the target field is the SAME as the current asking field,
          // this is NOT a correction - it's a normal response. Skip it.
          if (targetField.id === this.askingFieldId) {
            console.log("[VoiceCharterService] handleCorrectionCommand: Field matches askingFieldId, treating as normal response");
            return false;
          }

          // Extract clean value (apply filler removal)
          const cleanValue = extractFieldValue(valuePart, targetField.id);
          console.log("[VoiceCharterService] handleCorrectionCommand: Correction detected", {
            targetFieldId: targetField.id,
            originalValue: valuePart,
            cleanValue: cleanValue,
            currentAskingFieldId: this.askingFieldId,
          });

          // Capture the corrected value to the target field
          this.captureValue(targetField.id, cleanValue);

          // Inform the AI about the correction
          this.sendAIPrompt(
            `[User corrected ${targetField.label} to: "${cleanValue}"] Acknowledge the correction briefly and continue asking about the current field.`
          );

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
    console.log("[VoiceCharterService] goToNextField called:", {
      currentFieldIndex: this.state.currentFieldIndex,
      currentFieldId: this.state.currentFieldId,
      askingFieldId: this.askingFieldId,
    });

    if (!this.schema || !this.dataChannel) {
      console.log("[VoiceCharterService] goToNextField: No schema or dataChannel");
      return;
    }

    const nextIndex = this.state.currentFieldIndex + 1;
    if (nextIndex >= this.schema.fields.length) {
      console.log("[VoiceCharterService] goToNextField: All fields complete");
      this.complete();
      return;
    }

    const nextField = this.schema.fields[nextIndex];
    console.log("[VoiceCharterService] goToNextField: Moving to", nextField.id, "at index", nextIndex);

    // Update askingFieldId BEFORE changing state so transcripts go to the right field
    this.askingFieldId = nextField.id;

    this.updateState({
      step: "asking",
      currentFieldIndex: nextIndex,
      currentFieldId: nextField.id,
      pendingValue: null,
    });

    // Sync to conversation store for UI highlighting
    this.syncCurrentFieldToStore(nextField.id);

    // Prompt AI to ask about next field
    const prompt = generateFieldPrompt(nextField, false);
    this.sendAIPrompt(`[Move to next field: ${nextField.label}] ${prompt}`);

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
    console.log("[VoiceCharterService] goToPreviousField called:", {
      currentFieldIndex: this.state.currentFieldIndex,
      currentFieldId: this.state.currentFieldId,
      askingFieldId: this.askingFieldId,
    });

    if (!this.schema || !this.dataChannel) {
      console.log("[VoiceCharterService] goToPreviousField: No schema or dataChannel");
      return;
    }

    const prevIndex = this.state.currentFieldIndex - 1;
    if (prevIndex < 0) {
      // Already at first field, tell the user
      console.log("[VoiceCharterService] goToPreviousField: Already at first field");
      this.sendAIPrompt("[User wants to go back but we're at the first field] Tell the user we're already at the first field.");
      return;
    }

    const prevField = this.schema.fields[prevIndex];
    const existingValue = this.state.capturedValues.get(prevField.id);
    console.log("[VoiceCharterService] goToPreviousField: Moving to", prevField.id, "at index", prevIndex);

    // Update askingFieldId BEFORE changing state so transcripts go to the right field
    this.askingFieldId = prevField.id;

    this.updateState({
      step: "asking",
      currentFieldIndex: prevIndex,
      currentFieldId: prevField.id,
      pendingValue: null,
    });

    // Sync to conversation store for UI highlighting
    this.syncCurrentFieldToStore(prevField.id);

    // Prompt AI to ask about previous field, mentioning existing value if any
    let prompt = `[Going back to previous field: ${prevField.label}]`;
    if (existingValue) {
      prompt += ` The current value is: "${existingValue.value}". Ask if they want to change it.`;
    } else {
      prompt += ` ${generateFieldPrompt(prevField, false)}`;
    }

    this.sendAIPrompt(prompt);

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
    console.log("[VoiceCharterService] goToField called:", {
      targetFieldId: fieldId,
      currentFieldIndex: this.state.currentFieldIndex,
      currentFieldId: this.state.currentFieldId,
      askingFieldId: this.askingFieldId,
    });

    if (!this.schema || !this.dataChannel) {
      console.log("[VoiceCharterService] goToField: No schema or dataChannel");
      return;
    }

    const fieldIndex = this.schema.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex < 0) {
      console.log("[VoiceCharterService] goToField: Field not found:", fieldId);
      return;
    }

    const field = this.schema.fields[fieldIndex];
    const existingValue = this.state.capturedValues.get(fieldId);
    console.log("[VoiceCharterService] goToField: Moving to", field.id, "at index", fieldIndex);

    // Update askingFieldId BEFORE changing state so transcripts go to the right field
    this.askingFieldId = fieldId;

    this.updateState({
      step: "asking",
      currentFieldIndex: fieldIndex,
      currentFieldId: fieldId,
      pendingValue: null,
    });

    // Sync to conversation store for UI highlighting
    this.syncCurrentFieldToStore(fieldId);

    let prompt = `[Jumping to field: ${field.label}]`;
    if (existingValue) {
      prompt += ` The current value is: "${existingValue.value}". Ask if they want to change it.`;
    } else {
      prompt += ` ${generateFieldPrompt(field, false)}`;
    }

    this.sendAIPrompt(prompt);
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
      this.sendAIPrompt(
        `[User tried to skip ${currentField.label} but it's required] Tell the user this field is required and ask for the value.`
      );
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
    // Sanitize the value to remove "CAPTURE:" prefix if present
    const sanitizedValue = this.sanitizeCapturedValue(value);

    console.log("[VoiceCharterService] captureValue:", {
      fieldId,
      value: sanitizedValue.substring(0, 50),
      currentAskingFieldId: this.askingFieldId,
      currentFieldId: this.state.currentFieldId,
      currentFieldIndex: this.state.currentFieldIndex,
    });

    const captured: CapturedFieldValue = {
      fieldId,
      value: sanitizedValue,
      confirmedAt: Date.now(),
    };

    const newCapturedValues = new Map(this.state.capturedValues);
    newCapturedValues.set(fieldId, captured);

    this.updateState({
      capturedValues: newCapturedValues,
      pendingValue: null,
    });

    // Sync to conversation store for real-time form field updates
    this.syncToConversationStore(fieldId, sanitizedValue);

    this.emit({ type: "field_captured", fieldId, value: sanitizedValue });
    console.log("[VoiceCharterService] captureValue complete:", fieldId);
  }

  /**
   * Sync a captured value to the conversation store and draft store.
   * This updates both the CharterFieldSession and PreviewEditable form fields in real-time.
   */
  private syncToConversationStore(fieldId: string, value: string): void {
    console.log("[VoiceCharterService] syncToConversationStore:", {
      fieldId,
      value: value.substring(0, 50),
    });
    try {
      // Mark as internal update to avoid feedback loops
      this.isInternalUpdate = true;

      // Ensure session exists with current schema
      if (this.schema) {
        conversationActions.ensureSession(this.schema);
      }

      // Dispatch capture event to update the form field
      conversationActions.dispatch({ type: "CAPTURE", fieldId, value });
      console.log("[VoiceCharterService] syncToConversationStore: CAPTURE dispatched for", fieldId);

      // Validate the field (for visual feedback)
      conversationActions.dispatch({ type: "VALIDATE", fieldId });

      // Also sync to draft store for PreviewEditable UI
      // Format the value appropriately for list fields
      const draftValue = formatValueForDraft(fieldId, value);

      // For list fields (scope_in, scope_out, risks, assumptions), APPEND to existing array
      // instead of replacing it. This allows users to add multiple items via voice.
      if (
        Array.isArray(draftValue) &&
        (STRING_LIST_FIELDS.includes(fieldId) || OBJECT_LIST_FIELDS.includes(fieldId))
      ) {
        // Get current draft state
        const currentDraft = draftStoreApi.getState().draft ?? {};
        const currentArray = Array.isArray(currentDraft[fieldId]) ? currentDraft[fieldId] as unknown[] : [];

        // Append new items to existing array (avoid duplicates)
        const newItems = draftValue.filter(
          (item) => !currentArray.some((existing) =>
            typeof existing === "string" && typeof item === "string"
              ? existing.toLowerCase() === item.toLowerCase()
              : JSON.stringify(existing) === JSON.stringify(item)
          )
        );
        const mergedArray = [...currentArray, ...newItems];

        draftActions.mergeDraft({ [fieldId]: mergedArray });
        console.log("[VoiceCharterService] syncToConversationStore: Draft merged for", fieldId, {
          isArray: true,
          existingCount: currentArray.length,
          newCount: newItems.length,
          totalCount: mergedArray.length,
        });
      } else {
        draftActions.mergeDraft({ [fieldId]: draftValue });
        console.log("[VoiceCharterService] syncToConversationStore: Draft merged for", fieldId, {
          isArray: Array.isArray(draftValue),
          valueType: typeof draftValue,
        });
      }
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
    console.log("[VoiceCharterService] handleExternalFieldChange:", {
      fieldId,
      value: value.substring(0, 50),
      currentAskingFieldId: this.askingFieldId,
      currentFieldId: this.state.currentFieldId,
    });

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
        this.sendAIPrompt(
          `[User manually updated ${field.label} to: "${value}"] Acknowledge this update briefly and continue with the current field.`
        );
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

    this.sendAIPrompt(summary);
  }

  /**
   * Review only the fields that were extracted from the uploaded document.
   */
  reviewExtractedFields(): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    const extractedFields = Array.from(this.state.populatedFields.values())
      .filter(f => f.source === "extraction");

    if (extractedFields.length === 0) {
      this.sendAIPrompt(
        "[User asked to review extracted values] No fields were extracted from uploaded documents. " +
        "Tell the user this briefly and continue with the current field."
      );
      return;
    }

    let summary = "[User requested review of extracted values]\n";
    summary += `The following ${extractedFields.length} field(s) were extracted from the uploaded document:\n`;

    for (const fieldInfo of extractedFields) {
      const field = this.schema.fields.find(f => f.id === fieldInfo.fieldId);
      const captured = this.state.capturedValues.get(fieldInfo.fieldId);
      const status = captured?.userConfirmed ? "✓ confirmed" : "⟳ needs confirmation";
      summary += `- ${field?.label ?? fieldInfo.fieldId} [${status}]: ${fieldInfo.displayValue}\n`;
    }

    const unconfirmedCount = extractedFields.filter(f => {
      const captured = this.state.capturedValues.get(f.fieldId);
      return !captured?.userConfirmed;
    }).length;

    if (unconfirmedCount > 0) {
      summary += `\n${unconfirmedCount} field(s) still need confirmation.`;
      summary += "\nRead this summary to the user, then ask if they want to confirm all, or review each one.";
    } else {
      summary += "\nAll extracted fields have been confirmed.";
      summary += "\nRead this summary briefly and continue with the current field.";
    }

    this.sendAIPrompt(summary);
  }

  /**
   * Confirm all pre-populated fields from extraction.
   */
  confirmAllExtractedFields(): void {
    if (!this.schema || !this.dataChannel) {
      return;
    }

    const extractedFields = Array.from(this.state.populatedFields.values())
      .filter(f => f.source === "extraction");

    if (extractedFields.length === 0) {
      this.sendAIPrompt(
        "[User asked to confirm all] No fields were extracted from uploaded documents. " +
        "Tell the user this briefly and continue with the current field."
      );
      return;
    }

    // Mark all extracted fields as confirmed
    const updatedCapturedValues = new Map(this.state.capturedValues);
    for (const fieldInfo of extractedFields) {
      const existing = updatedCapturedValues.get(fieldInfo.fieldId);
      if (existing) {
        updatedCapturedValues.set(fieldInfo.fieldId, {
          ...existing,
          confirmedAt: Date.now(),
          userConfirmed: true,
        });
      }
    }

    this.updateState({
      capturedValues: updatedCapturedValues,
      awaitingFieldConfirmation: false,
    });

    // Find next empty field to continue with
    const nextEmptyField = this.schema.fields.find(f => !updatedCapturedValues.has(f.id));

    let prompt = `[User confirmed all extracted values] All ${extractedFields.length} extracted field(s) have been confirmed.\n`;
    if (nextEmptyField) {
      prompt += `Briefly acknowledge this, then ask about the next empty field: ${nextEmptyField.label}.\n`;
      prompt += generateFieldPrompt(nextEmptyField, false);
      this.askingFieldId = nextEmptyField.id;
      const fieldIndex = this.schema.fields.findIndex(f => f.id === nextEmptyField.id);
      this.updateState({
        currentFieldIndex: fieldIndex,
        currentFieldId: nextEmptyField.id,
      });
    } else {
      prompt += "All fields are now complete! Ask the user if they want to review the charter or make any changes.";
    }

    this.sendAIPrompt(prompt);
  }

  /**
   * Handle field confirmation commands (keep it, change it, yes, no).
   * Returns true if a confirmation command was handled, false otherwise.
   */
  private handleFieldConfirmation(transcript: string): boolean | null {
    const currentFieldId = this.askingFieldId || this.state.currentFieldId;
    if (!currentFieldId || !this.schema) {
      return null;
    }

    const populatedInfo = this.state.populatedFields?.get(currentFieldId);
    if (!populatedInfo || populatedInfo.source !== "extraction") {
      // Not a pre-populated field, don't handle confirmation
      return null;
    }

    // Check for "keep it" / confirmation phrases
    const keepPatterns = [
      /^(?:yes|yeah|yep|yup|correct|right|exactly)(?:\s|$|[,.])/i,
      /keep\s*(?:it|this|that)/i,
      /that'?s?\s+(?:correct|right|good|fine|perfect)/i,
      /looks?\s+good/i,
      /sounds?\s+good/i,
      /(?:that'?s?\s+)?(?:great|perfect|fine)/i,
      /^ok(?:ay)?(?:\s|$|[,.])/i,
      /^sure(?:\s|$|[,.])/i,
    ];

    const shouldKeep = keepPatterns.some(p => p.test(transcript));

    if (shouldKeep) {
      console.log("[VoiceCharterService] User confirmed extracted value for:", currentFieldId);

      // Mark the field as confirmed
      const captured = this.state.capturedValues.get(currentFieldId);
      if (captured) {
        const updatedCapturedValues = new Map(this.state.capturedValues);
        updatedCapturedValues.set(currentFieldId, {
          ...captured,
          confirmedAt: Date.now(),
          userConfirmed: true,
        });
        this.updateState({
          capturedValues: updatedCapturedValues,
          awaitingFieldConfirmation: false,
        });
      }

      // Emit confirmation event
      this.emit({
        type: "field_confirmed",
        fieldId: currentFieldId,
        value: populatedInfo.displayValue,
      });

      // Advance to next field
      this.advanceToNextFieldWithContext();
      return true;
    }

    // Check for "change it" / rejection phrases
    const changePatterns = [
      /^(?:no|nope|nah)(?:\s|$|[,.])/i,
      /change\s*(?:it|this|that)/i,
      /update\s*(?:it|this|that)/i,
      /modify\s*(?:it|this|that)/i,
      /edit\s*(?:it|this|that)/i,
      /(?:i'?d?\s+)?(?:want|like)\s+to\s+change/i,
      /(?:let'?s?\s+)?change\s+(?:it|this|that)/i,
      /that'?s?\s+(?:not\s+)?(?:wrong|incorrect)/i,
      /not\s+(?:quite|exactly)/i,
    ];

    const shouldChange = changePatterns.some(p => p.test(transcript));

    if (shouldChange) {
      console.log("[VoiceCharterService] User wants to change extracted value for:", currentFieldId);

      // Clear the confirmation state and ask for new value
      this.updateState({ awaitingFieldConfirmation: false });

      const field = this.schema.fields.find(f => f.id === currentFieldId);
      if (field) {
        // Ask for the new value
        const prompt = `[User wants to change ${field.label}] Ask them to provide the new value for ${field.label}.`;
        this.sendAIPrompt(prompt);
      }

      return true;
    }

    // Not a confirmation command - let it be processed as a regular value
    // This handles the case where user just provides a new value directly
    return null;
  }

  /**
   * Advance to the next field and provide context for the AI.
   * Used after confirming a pre-populated field.
   */
  private advanceToNextFieldWithContext(): void {
    if (!this.schema) {
      return;
    }

    // Find the next field that either:
    // 1. Is empty (not in capturedValues)
    // 2. Is pre-populated but not yet confirmed
    const currentIndex = this.schema.fields.findIndex(f => f.id === this.askingFieldId);
    let nextField = null;
    let nextIndex = currentIndex + 1;

    while (nextIndex < this.schema.fields.length) {
      const candidateField = this.schema.fields[nextIndex];
      const captured = this.state.capturedValues.get(candidateField.id);
      const populated = this.state.populatedFields?.get(candidateField.id);

      // If field is not captured, or is captured but needs confirmation
      if (!captured || (populated?.source === "extraction" && !captured.userConfirmed)) {
        nextField = candidateField;
        break;
      }

      console.log(`[VoiceCharterService] advanceToNextFieldWithContext: Skipping ${candidateField.id} (already confirmed)`);
      nextIndex++;
    }

    if (!nextField) {
      // All fields are complete
      this.askingFieldId = null;
      const prompt = "Great, keeping that value. All fields are now complete! " +
        "Ask the user if they want to review the charter or make any changes.";
      this.sendAIPrompt(prompt);
      return;
    }

    this.askingFieldId = nextField.id;
    this.syncCurrentFieldToStore(nextField.id);

    this.updateState({
      step: "asking",
      currentFieldIndex: nextIndex,
      currentFieldId: nextField.id,
    });

    // Check if next field is also pre-populated
    const nextPopulatedInfo = this.state.populatedFields?.get(nextField.id);
    if (nextPopulatedInfo && nextPopulatedInfo.source === "extraction" && nextPopulatedInfo.needsConfirmation) {
      this.updateState({ awaitingFieldConfirmation: true });
    }

    // Generate prompt with acknowledgment of previous confirmation
    const previousField = this.schema.fields[currentIndex];
    let prompt = `[User confirmed ${previousField?.label ?? "previous field"}] `;
    prompt += `Great, keeping that value. `;
    prompt += `Now asking about: ${nextField.label}\n`;
    prompt += generateFieldPrompt(nextField, false, nextPopulatedInfo);

    this.sendAIPrompt(prompt);
  }

  /**
   * Complete the voice charter session.
   */
  complete(): void {
    this.updateState({ step: "completed" });

    this.sendAIPrompt(
      "[Charter complete] Thank the user and let them know their charter is ready for review. Keep it brief!"
    );

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
    this.lastAIPromptTime = 0;
    this.pendingReformulationFieldId = null;
    this.pendingReformulationRawValue = null;
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
