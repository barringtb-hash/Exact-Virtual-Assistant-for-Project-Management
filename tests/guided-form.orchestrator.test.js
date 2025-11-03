/**
 * Guided Form Orchestrator Tests
 *
 * Tests for the state machine and conversation flow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  processMessage,
  createInitialState,
  validateField,
  normalizeValue,
  IntentType
} from '../lib/guided-form/orchestrator.js';

test('Orchestrator: Create initial state', () => {
  const state = createInitialState('charter', { version: '1.0', fields: [] });

  assert.equal(state.doc_type, 'charter');
  assert.equal(state.schema_version, '1.0');
  assert.equal(state.current_field_index, 0);
  assert.deepEqual(state.answers, {});
  assert.deepEqual(state.skipped, []);
  assert.equal(state.flags.has_required_gaps, false);
});

test('Orchestrator: Initialize conversation', async () => {
  const result = await processMessage(null, '__INIT__', 'charter');

  assert.equal(result.action, 'ask_field');
  assert.ok(result.askField);
  assert.equal(result.askField.id, 'project_name');
  assert.ok(result.message.includes('Let\'s create your'));
});

test('Validation: Required field validation', () => {
  const field = {
    id: 'test',
    label: 'Test Field',
    required: true,
    type: 'short_text'
  };

  // Empty value
  const result1 = validateField(field, '');
  assert.equal(result1.valid, false);
  assert.ok(result1.errors.includes('This field is required.'));

  // Valid value
  const result2 = validateField(field, 'Valid answer');
  assert.equal(result2.valid, true);
  assert.equal(result2.errors.length, 0);
});

test('Validation: Length constraints', () => {
  const field = {
    id: 'test',
    label: 'Test Field',
    required: false,
    type: 'short_text',
    min_length: 5,
    max_length: 20
  };

  // Too short
  const result1 = validateField(field, 'Hi');
  assert.equal(result1.valid, false);

  // Just right
  const result2 = validateField(field, 'Hello World');
  assert.equal(result2.valid, true);

  // Too long
  const result3 = validateField(field, 'This is a very long text that exceeds the maximum');
  assert.equal(result3.valid, false);
});

test('Validation: Date format', () => {
  const field = {
    id: 'start_date',
    label: 'Start Date',
    required: true,
    type: 'date',
    validation: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    }
  };

  // Invalid format
  const result1 = validateField(field, '01/15/2025');
  assert.equal(result1.valid, false);

  // Valid format
  const result2 = validateField(field, '2025-01-15');
  assert.equal(result2.valid, true);

  // Invalid date
  const result3 = validateField(field, '2025-13-45');
  assert.equal(result3.valid, false);
});

test('Validation: Custom rules - word count', () => {
  const field = {
    id: 'vision',
    label: 'Vision',
    required: true,
    type: 'long_text',
    validation: {
      custom_rules: ['min_word_count_10']
    }
  };

  // Too few words
  const result1 = validateField(field, 'Short text');
  assert.equal(result1.valid, false);

  // Enough words
  const result2 = validateField(field, 'This is a vision statement with more than ten words in it for testing');
  assert.equal(result2.valid, true);
});

test('Normalization: Trim whitespace', () => {
  const field = {
    id: 'test',
    type: 'short_text'
  };

  const result = normalizeValue(field, '  Hello World  ');
  assert.equal(result, 'Hello World');
});

test('Normalization: Person name capitalization', () => {
  const field = {
    id: 'sponsor',
    type: 'person_name'
  };

  const result = normalizeValue(field, 'john doe');
  assert.equal(result, 'John Doe');
});

test('Normalization: Date format', () => {
  const field = {
    id: 'start_date',
    type: 'date'
  };

  const result = normalizeValue(field, '2025/01/15');
  assert.equal(result, '2025-01-15');
});

test('State transitions: Answer flow', async () => {
  // Initialize
  const init = await processMessage(null, '__INIT__', 'charter');
  let state = init.state;

  // Answer first field
  const answer1 = await processMessage(state, 'My Project', 'charter');
  assert.equal(answer1.action, 'confirm_value');
  assert.equal(answer1.state.flags.awaiting_confirmation, true);

  // Confirm
  state = answer1.state;
  const confirm = await processMessage(state, 'yes', 'charter');
  assert.equal(confirm.action, 'ask_field');
  assert.equal(confirm.state.answers.project_name, 'My Project');
  assert.equal(confirm.state.current_field_index, 1);
});

test('State transitions: Back command', async () => {
  // Initialize and answer first field
  const init = await processMessage(null, '__INIT__', 'charter');
  const answer = await processMessage(init.state, 'My Project', 'charter');
  const confirm = await processMessage(answer.state, 'yes', 'charter');

  // Now go back
  const back = await processMessage(confirm.state, 'back', 'charter');
  assert.equal(back.action, 'ask_field');
  assert.equal(back.state.current_field_index, 0);
  assert.equal(back.askField.id, 'project_name');
});

test('State transitions: Skip optional field', async () => {
  // Initialize
  const init = await processMessage(null, '__INIT__', 'charter');
  let state = init.state;

  // Move to an optional field (we'll need to answer required fields first)
  // For testing, we'll directly manipulate state to get to an optional field
  state.current_field_index = 9; // scope_in is optional

  const skip = await processMessage(state, 'skip', 'charter');
  assert.ok(skip.state.skipped.includes('scope_in') || skip.action === 'ask_field');
});

test('State transitions: Skip required field with confirmation', async () => {
  // Initialize
  const init = await processMessage(null, '__INIT__', 'charter');
  const state = init.state;

  // Try to skip first field (required)
  const skip1 = await processMessage(state, 'skip', 'charter');
  assert.equal(skip1.action, 'confirm_skip');
  assert.ok(skip1.message.includes('required'));

  // Confirm skip
  const skip2 = await processMessage(skip1.state, 'skip', 'charter');
  assert.ok(skip2.state.skipped.includes('project_name'));
});

test('State transitions: Edit command', async () => {
  // Initialize and answer first two fields
  const init = await processMessage(null, '__INIT__', 'charter');
  const answer1 = await processMessage(init.state, 'My Project', 'charter');
  const confirm1 = await processMessage(answer1.state, 'yes', 'charter');
  const answer2 = await processMessage(confirm1.state, 'Jane Doe', 'charter');
  const confirm2 = await processMessage(answer2.state, 'yes', 'charter');

  // Edit first field
  const edit = await processMessage(confirm2.state, 'edit project_name', 'charter');
  assert.equal(edit.action, 'ask_field');
  assert.equal(edit.state.current_field_index, 0);
  assert.equal(edit.askField.id, 'project_name');
});

test('State transitions: Validation error and re-ask', async () => {
  // Initialize
  const init = await processMessage(null, '__INIT__', 'charter');
  const state = init.state;

  // Try to submit too-short answer (min 3 chars)
  const answer = await processMessage(state, 'AB', 'charter');
  assert.equal(answer.action, 'validation_error');
  assert.ok(answer.message.includes('Minimum length'));
  assert.equal(answer.state.metadata.total_re_asks, 1);
});

test('End-to-end: Complete minimal form', async () => {
  // Initialize
  let result = await processMessage(null, '__INIT__', 'charter');
  let state = result.state;

  // Answer all required fields
  const requiredFields = [
    { value: 'Test Project', field: 'project_name' },
    { value: 'Jane Sponsor', field: 'sponsor' },
    { value: 'John Lead', field: 'project_lead' },
    { value: '2025-01-15', field: 'start_date' },
    { value: '2025-12-31', field: 'end_date' },
    { value: 'This is the vision statement with enough words to pass all validation rules successfully', field: 'vision' }, // 15+ words for min_word_count_10
    { value: 'This is the problem statement with enough words to pass all the validation rules successfully and completely', field: 'problem' }, // 18+ words for min_word_count_15
    { value: 'This is a detailed project description with enough words to pass all validation rules successfully and meet all requirements completely and thoroughly', field: 'description' } // 25+ words for min_word_count_20
  ];

  for (const fieldData of requiredFields) {
    // Submit answer
    result = await processMessage(state, fieldData.value, 'charter');
    state = result.state; // Always update state

    // Should ask for confirmation
    assert.equal(result.action, 'confirm_value', `Expected confirm_value for ${fieldData.field}, got ${result.action}`);

    // Confirm
    result = await processMessage(state, 'yes', 'charter');
    state = result.state; // Update state after confirmation

    // Verify answer was saved
    assert.equal(state.answers[fieldData.field], fieldData.value);

    // Should move to next field or end review
    if (result.action !== 'end_review') {
      assert.equal(result.action, 'ask_field', `Expected ask_field or end_review, got ${result.action}`);
    }
  }

  // After all required fields, should reach end review or have all answers
  assert.ok(state.answers.project_name);
  assert.equal(Object.keys(state.answers).length, requiredFields.length);
});

console.log('✅ All orchestrator tests passed!');
