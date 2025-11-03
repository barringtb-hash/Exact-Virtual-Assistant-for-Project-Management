/**
 * Guided Form Conversation Orchestrator
 *
 * State machine that manages field-by-field progression through a document form.
 * Handles state transitions, validation, user commands (back/edit/skip/preview),
 * and ensures one-field-at-a-time guidance.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * State machine states
 */
const States = {
  INIT: 'INIT',
  ASK: 'ASK',
  CAPTURE: 'CAPTURE',
  VALIDATE: 'VALIDATE',
  CONFIRM: 'CONFIRM',
  NEXT_FIELD: 'NEXT_FIELD',
  BACK: 'BACK',
  EDIT_PREVIOUS: 'EDIT_PREVIOUS',
  SKIP: 'SKIP',
  PREVIEW: 'PREVIEW',
  END_REVIEW: 'END_REVIEW',
  FINALIZE: 'FINALIZE',
  CANCELLED: 'CANCELLED'
};

/**
 * Intent types from user input
 */
const IntentType = {
  ANSWER: 'answer',
  BACK: 'back',
  EDIT: 'edit',
  SKIP: 'skip',
  PREVIEW: 'preview',
  CANCEL: 'cancel',
  HELP: 'help',
  CONFIRM_YES: 'confirm_yes',
  CONFIRM_NO: 'confirm_no'
};

/**
 * Creates a new conversation state
 */
function createInitialState(docType, schema) {
  return {
    doc_type: docType,
    schema_version: schema.version,
    current_field_index: 0,
    current_state: States.INIT,
    answers: {},
    skipped: [],
    edit_history: [],
    flags: {
      has_required_gaps: false,
      awaiting_confirmation: false,
      confirmation_field: null,
      confirmation_value: null
    },
    metadata: {
      started_at: new Date().toISOString(),
      field_metrics: {},
      total_re_asks: 0
    }
  };
}

/**
 * Loads the guided form schema
 */
async function loadSchema(docType) {
  const schemaPath = path.join(
    process.cwd(),
    'templates',
    docType,
    'guided-form-schema.json'
  );

  try {
    const content = await fs.readFile(schemaPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load schema for ${docType}: ${error.message}`);
  }
}

/**
 * Gets the current field based on state
 */
function getCurrentField(state, schema) {
  if (state.current_field_index >= schema.fields.length) {
    return null;
  }
  return schema.fields[state.current_field_index];
}

/**
 * Parses user intent from their message
 */
function parseIntent(userMessage, state) {
  const msg = userMessage.trim().toLowerCase();

  // Handle confirmation responses when awaiting confirmation
  if (state.flags.awaiting_confirmation) {
    if (msg === 'yes' || msg === 'y' || msg === 'confirm' || msg === 'correct') {
      return { type: IntentType.CONFIRM_YES };
    }
    if (msg === 'no' || msg === 'n' || msg === 'change' || msg === 'edit') {
      return { type: IntentType.CONFIRM_NO };
    }
  }

  // Command detection
  if (msg === 'back' || msg === 'previous') {
    return { type: IntentType.BACK };
  }

  if (msg.startsWith('edit ')) {
    const fieldName = msg.substring(5).trim();
    return { type: IntentType.EDIT, fieldId: fieldName };
  }

  if (msg === 'skip') {
    return { type: IntentType.SKIP };
  }

  if (msg === 'preview' || msg === 'show progress' || msg === 'review') {
    return { type: IntentType.PREVIEW };
  }

  if (msg === 'cancel' || msg === 'quit' || msg === 'exit') {
    return { type: IntentType.CANCEL };
  }

  if (msg === 'help' || msg === '?') {
    return { type: IntentType.HELP };
  }

  // Default to answer
  return { type: IntentType.ANSWER, value: userMessage.trim() };
}

/**
 * Validates field value according to schema rules
 */
function validateField(field, value) {
  const errors = [];

  // Required check
  if (field.required && (!value || value.trim() === '')) {
    return { valid: false, errors: ['This field is required.'] };
  }

  // Skip further validation if empty and not required
  if (!value || value.trim() === '') {
    return { valid: true, errors: [] };
  }

  const trimmedValue = value.trim();

  // Type-specific validation
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      if (field.min_length && trimmedValue.length < field.min_length) {
        errors.push(`Minimum length is ${field.min_length} characters.`);
      }
      if (field.max_length && trimmedValue.length > field.max_length) {
        errors.push(`Maximum length is ${field.max_length} characters.`);
      }
      break;

    case 'date':
      if (field.validation?.pattern) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(trimmedValue)) {
          errors.push(`Date must be in YYYY-MM-DD format.`);
        } else {
          // Validate it's a real date
          const date = new Date(trimmedValue);
          if (isNaN(date.getTime())) {
            errors.push(`Invalid date.`);
          }
        }
      }
      break;

    case 'person_name':
      if (trimmedValue.length > (field.max_length || 100)) {
        errors.push(`Name is too long (max ${field.max_length || 100} characters).`);
      }
      break;
  }

  // Custom validation rules
  if (field.validation?.custom_rules) {
    for (const rule of field.validation.custom_rules) {
      const ruleError = applyCustomRule(rule, trimmedValue, field);
      if (ruleError) {
        errors.push(ruleError);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Apply custom validation rules
 */
function applyCustomRule(rule, value, field) {
  switch (rule) {
    case 'no_special_chars_start':
      if (/^[^a-zA-Z0-9]/.test(value)) {
        return 'Should not start with special characters.';
      }
      break;

    case 'min_word_count_10':
      if (value.split(/\s+/).filter(w => w.length > 0).length < 10) {
        return 'Please provide at least 10 words.';
      }
      break;

    case 'min_word_count_15':
      if (value.split(/\s+/).filter(w => w.length > 0).length < 15) {
        return 'Please provide at least 15 words.';
      }
      break;

    case 'min_word_count_20':
      if (value.split(/\s+/).filter(w => w.length > 0).length < 20) {
        return 'Please provide at least 20 words.';
      }
      break;
  }

  return null;
}

/**
 * Normalizes field value
 */
function normalizeValue(field, value) {
  if (!value) return value;

  let normalized = value.trim();

  switch (field.type) {
    case 'date':
      // Ensure YYYY-MM-DD format
      normalized = normalized.replace(/\//g, '-');
      break;

    case 'person_name':
      // Capitalize first letter of each word
      normalized = normalized
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      break;
  }

  return normalized;
}

/**
 * Process state transition based on intent
 */
async function processTransition(state, schema, intent) {
  const field = getCurrentField(state, schema);
  const result = {
    state: { ...state },
    action: null,
    message: null,
    askField: null
  };

  switch (intent.type) {
    case IntentType.BACK:
      return handleBack(state, schema);

    case IntentType.EDIT:
      return handleEdit(state, schema, intent.fieldId);

    case IntentType.SKIP:
      return handleSkip(state, schema, field);

    case IntentType.PREVIEW:
      return handlePreview(state, schema);

    case IntentType.CANCEL:
      return handleCancel(state);

    case IntentType.HELP:
      return handleHelp(state, schema);

    case IntentType.CONFIRM_YES:
      return handleConfirmYes(state, schema);

    case IntentType.CONFIRM_NO:
      return handleConfirmNo(state);

    case IntentType.ANSWER:
      return handleAnswer(state, schema, field, intent.value);
  }

  return result;
}

/**
 * Handle back command
 */
function handleBack(state, schema) {
  const newState = { ...state };

  if (newState.current_field_index > 0) {
    newState.current_field_index--;
    newState.flags.awaiting_confirmation = false;
    newState.current_state = States.BACK;

    const prevField = getCurrentField(newState, schema);

    return {
      state: newState,
      action: 'ask_field',
      message: `Going back to: ${prevField.label}`,
      askField: prevField
    };
  } else {
    return {
      state,
      action: 'error',
      message: 'Already at the first field.',
      askField: null
    };
  }
}

/**
 * Handle edit command
 */
function handleEdit(state, schema, fieldId) {
  const fieldIndex = schema.fields.findIndex(f => f.id === fieldId);

  if (fieldIndex === -1) {
    return {
      state,
      action: 'error',
      message: `Field "${fieldId}" not found. Available fields: ${schema.fields.map(f => f.id).join(', ')}`,
      askField: null
    };
  }

  const newState = { ...state };
  newState.current_field_index = fieldIndex;
  newState.flags.awaiting_confirmation = false;
  newState.current_state = States.EDIT_PREVIOUS;

  const field = getCurrentField(newState, schema);

  return {
    state: newState,
    action: 'ask_field',
    message: `Editing: ${field.label}`,
    askField: field
  };
}

/**
 * Handle skip command
 */
function handleSkip(state, schema, field) {
  if (!field) {
    return {
      state,
      action: 'complete',
      message: 'No more fields to skip.',
      askField: null
    };
  }

  const newState = { ...state };

  // If required, ask for confirmation
  if (field.required && !state.flags.awaiting_skip_confirmation) {
    newState.flags.awaiting_skip_confirmation = true;

    return {
      state: newState,
      action: 'confirm_skip',
      message: `"${field.label}" is required. Are you sure you want to skip it? (It will be flagged for review later.) Type 'skip' again to confirm, or provide an answer.`,
      askField: null
    };
  }

  // Skip confirmed or optional field
  if (!newState.skipped.includes(field.id)) {
    newState.skipped.push(field.id);
  }

  newState.current_field_index++;
  newState.flags.awaiting_skip_confirmation = false;
  newState.current_state = States.SKIP;

  // Check if we're done
  if (newState.current_field_index >= schema.fields.length) {
    return handleEndReview(newState, schema);
  }

  const nextField = getCurrentField(newState, schema);

  return {
    state: newState,
    action: 'ask_field',
    message: `Skipped. Moving to next field.`,
    askField: nextField
  };
}

/**
 * Handle preview command
 */
function handlePreview(state, schema) {
  const preview = {
    completed: {},
    skipped: state.skipped,
    remaining: []
  };

  // Completed fields
  for (const [fieldId, value] of Object.entries(state.answers)) {
    const field = schema.fields.find(f => f.id === fieldId);
    if (field) {
      preview.completed[field.label] = value;
    }
  }

  // Remaining fields
  for (let i = state.current_field_index; i < schema.fields.length; i++) {
    const field = schema.fields[i];
    if (!state.answers[field.id]) {
      preview.remaining.push(field.label);
    }
  }

  return {
    state,
    action: 'show_preview',
    message: null,
    preview
  };
}

/**
 * Handle cancel command
 */
function handleCancel(state) {
  const newState = { ...state };
  newState.current_state = States.CANCELLED;

  return {
    state: newState,
    action: 'cancel',
    message: 'Form cancelled. Progress has not been saved.',
    askField: null
  };
}

/**
 * Handle help command
 */
function handleHelp(state, schema) {
  const commands = schema.commands;
  const helpText = Object.entries(commands)
    .filter(([_, config]) => config.enabled)
    .map(([cmd, config]) => `• ${cmd}: ${config.description}`)
    .join('\n');

  return {
    state,
    action: 'show_help',
    message: `Available commands:\n${helpText}`,
    askField: null
  };
}

/**
 * Handle confirmation yes
 */
function handleConfirmYes(state, schema) {
  if (!state.flags.awaiting_confirmation) {
    return {
      state,
      action: 'error',
      message: 'Nothing to confirm right now.',
      askField: null
    };
  }

  const newState = { ...state };
  const fieldId = newState.flags.confirmation_field;
  const value = newState.flags.confirmation_value;

  // Save the answer
  newState.answers[fieldId] = value;

  // Track edit history
  newState.edit_history.push({
    field_id: fieldId,
    timestamp: new Date().toISOString(),
    action: 'confirmed'
  });

  // Clear confirmation flags
  newState.flags.awaiting_confirmation = false;
  newState.flags.confirmation_field = null;
  newState.flags.confirmation_value = null;

  // Move to next field
  newState.current_field_index++;
  newState.current_state = States.NEXT_FIELD;

  // Check if we're done
  if (newState.current_field_index >= schema.fields.length) {
    return handleEndReview(newState, schema);
  }

  const nextField = getCurrentField(newState, schema);

  return {
    state: newState,
    action: 'ask_field',
    message: 'Confirmed!',
    askField: nextField
  };
}

/**
 * Handle confirmation no
 */
function handleConfirmNo(state) {
  const newState = { ...state };
  newState.flags.awaiting_confirmation = false;
  newState.flags.confirmation_field = null;
  newState.flags.confirmation_value = null;

  return {
    state: newState,
    action: 'ask_again',
    message: "No problem, let's try again.",
    askField: null
  };
}

/**
 * Handle answer submission
 */
function handleAnswer(state, schema, field, value) {
  if (!field) {
    return {
      state,
      action: 'error',
      message: 'No current field to answer.',
      askField: null
    };
  }

  // Track metrics
  const newState = { ...state };
  if (!newState.metadata.field_metrics[field.id]) {
    newState.metadata.field_metrics[field.id] = {
      ask_count: 0,
      started_at: new Date().toISOString()
    };
  }
  newState.metadata.field_metrics[field.id].ask_count++;

  // Normalize value
  const normalized = normalizeValue(field, value);

  // Validate
  const validation = validateField(field, normalized);

  if (!validation.valid) {
    newState.metadata.total_re_asks++;

    return {
      state: newState,
      action: 'validation_error',
      message: validation.errors.join(' '),
      askField: field
    };
  }

  // Mark field completion time
  newState.metadata.field_metrics[field.id].completed_at = new Date().toISOString();

  // Set confirmation state
  newState.flags.awaiting_confirmation = true;
  newState.flags.confirmation_field = field.id;
  newState.flags.confirmation_value = normalized;
  newState.current_state = States.CONFIRM;

  return {
    state: newState,
    action: 'confirm_value',
    message: null,
    confirming: {
      field: field.label,
      value: normalized
    }
  };
}

/**
 * Handle end review
 */
function handleEndReview(state, schema) {
  const newState = { ...state };
  newState.current_state = States.END_REVIEW;

  // Check for required gaps
  const requiredGaps = [];
  for (const field of schema.fields) {
    if (field.required && !newState.answers[field.id]) {
      requiredGaps.push(field.label);
    }
  }

  newState.flags.has_required_gaps = requiredGaps.length > 0;

  return {
    state: newState,
    action: 'end_review',
    message: null,
    review: {
      completed_fields: Object.keys(newState.answers).length,
      total_fields: schema.fields.length,
      required_gaps: requiredGaps,
      skipped_fields: newState.skipped
    }
  };
}

/**
 * Main orchestrator function
 */
async function processMessage(conversationState, userMessage, docType = 'charter') {
  try {
    // Load schema
    const schema = await loadSchema(docType);

    // Initialize state if needed
    let state = conversationState;
    if (!state || state.current_state === States.INIT) {
      state = createInitialState(docType, schema);

      // Return initial ask
      const firstField = getCurrentField(state, schema);
      state.current_state = States.ASK;

      return {
        state,
        action: 'ask_field',
        message: `Let's create your ${schema.metadata.title}. This should take about ${schema.metadata.estimated_time_minutes} minutes.`,
        askField: firstField
      };
    }

    // Parse user intent
    const intent = parseIntent(userMessage, state);

    // Process state transition
    const result = await processTransition(state, schema, intent);

    return result;

  } catch (error) {
    return {
      state: conversationState,
      action: 'error',
      message: `System error: ${error.message}`,
      askField: null
    };
  }
}

module.exports = {
  States,
  IntentType,
  processMessage,
  createInitialState,
  loadSchema,
  getCurrentField,
  validateField,
  normalizeValue
};
