/**
 * Claude Prompt Templates for Guided Form
 *
 * Generates system, developer, and user prompts that enforce one-field-at-a-time
 * behavior and guide users through document completion.
 */

/**
 * System prompt - sets the core behavior and constraints
 */
export const SYSTEM_PROMPT = `You are a structured form assistant helping project managers complete a Project Charter document.

CORE RULES (CRITICAL - NEVER VIOLATE):
1. Ask for EXACTLY ONE field at a time. NEVER ask for multiple fields in a single response.
2. Keep your asks SHORT and CONCRETE - one or two sentences maximum.
3. Always include the field label clearly.
4. Use the provided current_field metadata to know what to ask.
5. NEVER jump ahead to later fields or ask about fields not currently active.
6. Honor the current field index - do not deviate from the order.

YOUR WORKFLOW:
1. State the field label clearly
2. Include ONE sentence of help text if provided
3. Optionally show an example in parentheses
4. Wait for the user's response
5. When confirming, echo what you heard and ask "Confirm? (yes/no)"

COMMANDS TO HONOR:
- "back" - Return to previous field
- "edit <field_name>" - Jump to specific field for editing
- "skip" - Skip current field (warn if required)
- "preview" - Show all captured values so far
- "help" - Show available commands
- "cancel" - Cancel the entire form

TONE:
- Professional but friendly
- Concise - no unnecessary prose
- Encouraging without being excessive
- Clear and direct

FORMATTING:
- Use **bold** for field labels
- Use markdown formatting for clarity
- Keep confirmations simple and clear

CONFIRMATION PROTOCOL:
After receiving an answer:
1. Echo the value back clearly
2. Ask: "Confirm? (yes to continue, or provide a different answer)"
3. Wait for confirmation before moving on

VALIDATION ERRORS:
If you receive a validation error from the system:
1. Explain the issue clearly and briefly
2. Provide the specific requirement (e.g., "Minimum 10 words required")
3. Re-ask for the field
4. Optionally remind them of the example format

EXAMPLE INTERACTIONS:

Good ✓:
Assistant: **Project Title** — What's the name of your project? (e.g., "Customer Portal Redesign 2025")
User: EMEA Ordering Modernization
Assistant: Got it: "EMEA Ordering Modernization" — Confirm? (yes/no)

Bad ✗:
Assistant: Let's start! What's your project title, who's the sponsor, and when does it start?

Remember: ONE field at a time. Keep it simple. Stay on track.`;

/**
 * Builds the developer/context prompt with current state
 */
export function buildDeveloperPrompt(field, conversationState, action) {
  const context = {
    current_field: field ? {
      id: field.id,
      label: field.label,
      help_text: field.help_text,
      required: field.required,
      type: field.type,
      placeholder: field.placeholder,
      example: field.example,
      max_length: field.max_length,
      min_length: field.min_length
    } : null,
    conversation_state: {
      current_field_index: conversationState.current_field_index,
      total_fields: conversationState.schema?.fields?.length || 'unknown',
      awaiting_confirmation: conversationState.flags.awaiting_confirmation,
      has_required_gaps: conversationState.flags.has_required_gaps
    },
    action: action
  };

  let instruction = '';

  switch (action) {
    case 'ask_field':
      instruction = `Ask for the current field. Include the label, one sentence of help text, and optionally show the example. Keep it brief.`;
      break;

    case 'confirm_value':
      instruction = `The user just answered. Echo back their value and ask for confirmation: "Confirm? (yes/no)". Be concise.`;
      break;

    case 'validation_error':
      instruction = `The user's answer didn't pass validation. Explain the error clearly, remind them of the requirements, and ask again. Reference the example if helpful.`;
      break;

    case 'show_preview':
      instruction = `Show a clean summary of all completed fields so far. Use a simple format.`;
      break;

    case 'end_review':
      instruction = `All fields have been visited. Show a summary and ask if they want to finalize or make any edits.`;
      break;

    case 'confirm_skip':
      instruction = `The user wants to skip a required field. Warn them it will be flagged for review later and ask for confirmation.`;
      break;

    case 'show_help':
      instruction = `List the available commands clearly.`;
      break;

    case 'ask_again':
      instruction = `The user wants to change their answer. Re-ask for the current field.`;
      break;

    default:
      instruction = `Proceed with the guided form workflow.`;
  }

  return `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\nINSTRUCTION: ${instruction}`;
}

/**
 * Builds the user message for Claude
 */
export function buildUserMessage(userInput, previousAssistantMessage = null) {
  if (previousAssistantMessage) {
    return `Previous context: ${previousAssistantMessage}\n\nUser: ${userInput}`;
  }
  return userInput;
}

/**
 * Formats the ask for a field
 */
export function formatFieldAsk(field) {
  let ask = `**${field.label}**`;

  if (field.help_text) {
    ask += ` — ${field.help_text}`;
  }

  if (field.example) {
    ask += ` (e.g., "${field.example}")`;
  }

  if (field.required) {
    ask += ` *[Required]*`;
  }

  return ask;
}

/**
 * Formats a confirmation message
 */
export function formatConfirmation(field, value) {
  const displayValue = typeof value === 'string' && value.length > 100
    ? value.substring(0, 100) + '...'
    : value;

  return `Got it: "${displayValue}"\n\nConfirm? (yes/no)`;
}

/**
 * Formats a validation error message
 */
export function formatValidationError(field, errors) {
  const errorText = Array.isArray(errors) ? errors.join(' ') : errors;

  let message = `**Validation Issue:** ${errorText}\n\n`;
  message += `Let's try again for **${field.label}**.`;

  if (field.example) {
    message += ` (e.g., "${field.example}")`;
  }

  return message;
}

/**
 * Formats a preview of captured answers
 */
export function formatPreview(preview, schema) {
  let message = '## Progress Summary\n\n';

  // Completed fields
  if (Object.keys(preview.completed).length > 0) {
    message += '### ✓ Completed:\n';
    for (const [label, value] of Object.entries(preview.completed)) {
      const displayValue = typeof value === 'string' && value.length > 50
        ? value.substring(0, 50) + '...'
        : value;
      message += `- **${label}**: ${displayValue}\n`;
    }
    message += '\n';
  }

  // Skipped fields
  if (preview.skipped && preview.skipped.length > 0) {
    message += '### ⊘ Skipped:\n';
    for (const fieldId of preview.skipped) {
      const field = schema.fields.find(f => f.id === fieldId);
      if (field) {
        message += `- ${field.label}\n`;
      }
    }
    message += '\n';
  }

  // Remaining fields
  if (preview.remaining && preview.remaining.length > 0) {
    message += `### ⋯ Remaining: ${preview.remaining.length} fields\n`;
  }

  message += '\nType anything to continue, or use a command (back, edit, skip, help).';

  return message;
}

/**
 * Formats the end review summary
 */
export function formatEndReview(review, schema) {
  let message = '## 🎉 Form Complete!\n\n';

  message += `You've completed **${review.completed_fields} of ${review.total_fields}** fields.\n\n`;

  if (review.required_gaps && review.required_gaps.length > 0) {
    message += '### ⚠️ Required Fields Missing:\n';
    for (const label of review.required_gaps) {
      message += `- ${label}\n`;
    }
    message += '\nWould you like to fill these in now? (Type "edit <field_name>" to jump to a field)\n\n';
  }

  if (review.skipped_fields && review.skipped_fields.length > 0) {
    message += '### Optional Fields Skipped:\n';
    for (const fieldId of review.skipped_fields) {
      const field = schema.fields.find(f => f.id === fieldId);
      if (field && !field.required) {
        message += `- ${field.label}\n`;
      }
    }
    message += '\n';
  }

  if (!review.required_gaps || review.required_gaps.length === 0) {
    message += '**Ready to finalize?** Type "finalize" to generate your document, or "edit <field_name>" to make changes.';
  }

  return message;
}

/**
 * Generates the full prompt set for Claude API
 */
export function buildClaudePrompts(field, conversationState, action, userInput, previousAssistantMessage = null) {
  return {
    system: SYSTEM_PROMPT,
    developer: buildDeveloperPrompt(field, conversationState, action),
    user: buildUserMessage(userInput, previousAssistantMessage),
    temperature: 0.3, // Low temperature for consistency
    max_tokens: 300    // Keep responses concise
  };
}

/**
 * Stop sequences to prevent multi-field asks
 */
export const STOP_SEQUENCES = [
  '\n\nNext field:',
  '\n\nMultiple fields:',
  '\n\nNow let\'s move to',
  'Field 1:',
  'Field 2:'
];

