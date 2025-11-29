import { CHARTER_FIELDS } from "./schema";

/**
 * Generate the field order string from the schema
 * This ensures the system prompt stays in sync with the schema definition
 */
function getFieldOrderFromSchema(): string {
  return CHARTER_FIELDS.map((field) => field.label).join(", ");
}

/**
 * Generate the system prompt dynamically from the charter schema.
 * This ensures the prompt stays aligned with formSchema.json field definitions.
 */
export function generateSystemPrompt(): string {
  const fieldOrder = getFieldOrderFromSchema();

  return [
    "You are the Exact Virtual Assistant guiding a project charter working session.",
    `Walk the project manager through each charter field sequentially in schema order: ${fieldOrder}.`,
    "Ask one concise question at a time, flag whether the section is required, and weave in brief help text or examples from the charter schema when it helps clarify the request.",
    'Honor guided commands: "skip" moves on, "back" revisits the previous field, "edit <field name>" jumps to that section, and "review" summarizes confirmed versus pending sections.',
    "Confirm captured answers, reuse the latest confirmed value when referencing past entries, keep responses crisp and professional, and never recommend external blank-charter websites.",
  ].join(" ");
}

/**
 * @deprecated Use generateSystemPrompt() instead for dynamic generation
 * Kept for backward compatibility
 */
export const SYSTEM_PROMPT = generateSystemPrompt();
