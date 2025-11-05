# Guided Charter Mode - PM-Friendly Sequential Field Collection

## Overview

The Guided Charter Mode provides a structured, step-by-step approach to creating project charters. Instead of free-form chat, users are guided through a sequential wizard that collects one field at a time with real-time validation and helpful prompts.

## Key Features

### 1. Sequential Field Prompting
- Users are presented with one field at a time
- Each field shows:
  - Field label and description
  - Help text explaining what to enter
  - Example values for guidance
  - Placeholder text in the input area

### 2. Real-Time Validation
- Input is validated immediately upon submission
- Clear error messages guide users to fix issues
- Automatic retry with helpful feedback (up to 2 attempts)
- Invalid entries are never silently accepted

### 3. Progress Tracking
- Visual indicator shows completion status (e.g., "5/30 fields completed")
- Users always know where they are in the process
- Completed fields are marked and saved

### 4. Flexible Navigation
- **Save & Continue**: Confirm the current field and move to the next
- **Skip Field**: Leave optional fields blank for later
- **Review Mode**: See all completed fields before finalizing

### 5. Auto-Fill Support (Optional)
- When enabled, provides "Auto-fill from uploaded scope" button
- Extracts field values from uploaded documents
- Fields are pre-populated but still require user confirmation
- Users can edit auto-filled values before saving

## Configuration

### Enabling Guided Mode

Set these environment variables in your `.env` file:

```bash
# Enable the Charter Wizard UI
VITE_CHARTER_WIZARD_VISIBLE=true

# Optional: Enable auto-fill button
VITE_AUTO_EXTRACT=true

# Recommended: Intent-only extraction (prevents accidental triggers)
VITE_INTENT_ONLY_EXTRACTION=true
```

### Use Cases

#### Use Case 1: PM-Friendly Guided Creation (Recommended)
Best for: Project managers who want guided, structured charter creation

```bash
VITE_CHARTER_WIZARD_VISIBLE=true
VITE_AUTO_EXTRACT=true
VITE_INTENT_ONLY_EXTRACTION=true
```

**Features enabled:**
- Sequential field prompts
- Real-time validation
- Progress tracking
- Optional auto-fill from documents
- Skip/back navigation

#### Use Case 2: Manual Entry Only
Best for: Organizations that prefer manual data entry without AI assistance

```bash
VITE_CHARTER_WIZARD_VISIBLE=true
VITE_AUTO_EXTRACT=false
VITE_INTENT_ONLY_EXTRACTION=true
```

**Features enabled:**
- Sequential field prompts
- Real-time validation
- Progress tracking
- No auto-fill button

#### Use Case 3: Traditional Chat Mode
Best for: Users comfortable with conversational interfaces

```bash
VITE_CHARTER_WIZARD_VISIBLE=false
VITE_AUTO_EXTRACT=false
VITE_INTENT_ONLY_EXTRACTION=true
```

**Features enabled:**
- Free-form chat interaction
- Intent-based extraction (triggered by "create charter")
- Edit charter directly in preview panel

## User Workflow

### Step 1: Start a Charter Session

When the wizard is enabled, the interface automatically shows the first field prompt:

```
┌────────────────────────────────────────┐
│ Project Title                          │
│                                        │
│ User-provided title or first heading  │
│ from scope                             │
│                                        │
│ Example: Phoenix CRM Migration        │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ [Enter project title here...]      │ │
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ [Save response]  [Skip field]         │
│                                        │
│ Progress: 0/30                         │
└────────────────────────────────────────┘
```

### Step 2: Fill Out Fields Sequentially

1. Read the field label and help text
2. Enter your response in the text area
3. Click "Save response" to validate and continue
4. Or click "Skip field" to leave it blank (for optional fields only)

### Step 3: Handle Validation Errors

If your input doesn't meet the field requirements:

```
┌────────────────────────────────────────┐
│ Start Date                             │
│                                        │
│ ⚠️ Invalid date format. Please use    │
│    YYYY-MM-DD (e.g., 2024-01-15)      │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ invalid-date                       │ │ ← Your input
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ [Save response]  [Skip field]         │
└────────────────────────────────────────┘
```

Correct the input and submit again. The system allows up to 2 validation attempts before automatically skipping the field.

### Step 4: Use Auto-Fill (Optional)

If you have uploaded a project scope document:

1. Look for the "Auto-fill from uploaded scope" button above the wizard
2. Click the button to extract values from your document
3. The system will populate fields automatically
4. Review each auto-filled value as you progress through fields
5. Edit any values that need adjustment

**Note:** Auto-fill does not bypass the wizard - you still confirm each field individually.

### Step 5: Review and Finalize

After completing all required fields:

1. The wizard enters **Review Mode**
2. See all your completed fields at once
3. Edit any field by clicking on it
4. Click "Finalize" to complete the charter

## Architecture

### Conversation State Machine

The wizard is powered by a sophisticated state machine (`src/state/conversationMachine.ts`):

**States:**
- `INIT` - Session initialized
- `ASK` - Prompting user for field
- `CAPTURE` - User has entered value
- `VALIDATE` - Checking value against rules
- `CONFIRM` - Value accepted, moving to next field
- `PREVIEW` - Review mode (all fields completed)
- `FINALIZE` - Session completed

**Events:**
- `INIT` - Initialize session
- `CAPTURE` - User submits value
- `VALIDATE` - Trigger validation
- `CONFIRM` - Accept value
- `SKIP` - Skip current field
- `BACK` - Return to previous field
- `PREVIEW` - Enter review mode
- `FINALIZE` - Complete session

### Field Validation

Validation happens client-side for immediate feedback:

1. **Type Checking**: Ensure value matches field type (string, date, number, etc.)
2. **Rule Validation**: Check against field-specific rules (min/max length, pattern matching, etc.)
3. **Schema Validation**: Validate against JSON Schema for the charter
4. **Error Reporting**: Provide clear, actionable error messages

### Conversation Persistence

Session state is preserved:

- **In-Memory**: Always enabled (lasts for current browser session)
- **Disk Persistence** (Optional): Enable with `VITE_CHARTER_CONVERSATION_PERSIST=true`
  - Saves snapshots to `/tmp/conversations/{conversationId}.json`
  - Allows resuming sessions after page reload or server restart

## Telemetry

The wizard automatically tracks:

- **Field Metrics**: Ask count, reask count, skip count, completion status
- **Timing Data**: Time to complete each field, total session duration
- **Validation Attempts**: Number of retries, error codes encountered
- **Session Events**: Started, fields answered, fields skipped, completed

Telemetry data is saved to:
```
/tmp/charter-wizard/metrics.csv
```

### Telemetry Fields

| Field | Description |
|-------|-------------|
| `timestamp` | When the metric was recorded |
| `session_id` | Unique session identifier |
| `document_type` | Always "charter" |
| `schema_version` | Charter schema version (e.g., "2024.10") |
| `field_id` | Field identifier (e.g., "project_name") |
| `field_position` | Position in field sequence (1-based) |
| `ask_count` | Number of times field was presented |
| `reask_count` | Number of validation retries |
| `reask_codes` | Validation error codes encountered |
| `skip_count` | Number of times field was skipped |
| `skip_reasons` | Reasons for skipping (e.g., "user_request", "validation-max-attempts") |
| `preview_count` | Number of times field appeared in review |
| `completion_status` | Final status ("confirmed", "skipped", "pending") |
| `completion_reason` | Why field reached this status |
| `first_asked_at` | ISO timestamp when field was first shown |
| `completed_at` | ISO timestamp when field was confirmed/skipped |
| `duration_ms` | Milliseconds from first ask to completion |
| `session_finalized` | Whether session was completed (true/false) |

## Troubleshooting

### Wizard Not Appearing

**Problem:** The wizard doesn't show up when I load the page.

**Solution:**
1. Check your `.env` file has `VITE_CHARTER_WIZARD_VISIBLE=true`
2. Restart your dev server after changing environment variables
3. Clear browser cache and reload
4. Verify the document type is set to "charter"

### Validation Keeps Failing

**Problem:** I keep getting validation errors for a field.

**Solution:**
1. Read the error message carefully - it explains what's wrong
2. Check the example value provided in the field help text
3. Ensure your input matches the required format (e.g., YYYY-MM-DD for dates)
4. If you're stuck, click "Skip field" and come back to it later

### Auto-Fill Button Missing

**Problem:** I don't see the "Auto-fill from uploaded scope" button.

**Solution:**
1. Verify `VITE_AUTO_EXTRACT=true` in your `.env`
2. Ensure `VITE_CHARTER_WIZARD_VISIBLE=true` is also set
3. Upload a file first - the button only appears when content is available
4. Check browser console for errors

### Progress Not Saving

**Problem:** My progress is lost when I reload the page.

**Solution:**
1. Enable persistence: `VITE_CHARTER_CONVERSATION_PERSIST=true`
2. Check server has write permissions to `/tmp/conversations/`
3. Verify the conversation API endpoint is working: `GET /api/charter/conversation`

## Testing

### Manual Testing

1. Enable wizard mode in `.env`
2. Start the application: `npm run dev`
3. Open http://localhost:3000
4. Follow the wizard prompts to create a charter
5. Test validation by entering invalid data
6. Test skip functionality on optional fields
7. Upload a document and test auto-fill (if enabled)

### Automated E2E Tests

Run the Cypress test suite:

```bash
npm run cypress:open
```

Select the `guided-charter.cy.ts` test to run:
- Sequential field collection
- Validation error handling
- Skip functionality
- Progress tracking
- Auto-fill behavior
- Session persistence

### Integration Tests

The conversation machine has comprehensive unit tests:

```bash
npm test -- conversationMachine
```

## Best Practices

### For End Users

1. **Read Help Text**: Each field has guidance - use it!
2. **Don't Guess**: If you're unsure about a field, skip it and come back later
3. **Use Examples**: The example values show the expected format
4. **Upload Documents First**: If using auto-fill, upload your scope document before starting
5. **Review Before Finalizing**: Always check your completed charter in review mode

### For Administrators

1. **Start with Manual Mode**: Test the wizard without auto-fill first
2. **Train Users**: Show users how to navigate the wizard before rolling out
3. **Monitor Telemetry**: Check `/tmp/charter-wizard/metrics.csv` for user patterns
4. **Customize Field Rules**: Edit `/templates/charter/formSchema.json` to adjust validation
5. **Backup Conversations**: If using persistence, back up `/tmp/conversations/` regularly

## API Reference

### Conversation API

#### Get Conversation Snapshot
```http
GET /api/charter/conversation?id={conversationId}
```

**Response:**
```json
{
  "state": {
    "version": 1,
    "documentType": "charter",
    "schemaVersion": "2024.10",
    "step": "ASK",
    "mode": "session",
    "currentFieldId": "project_name",
    "currentIndex": 0,
    "fields": {
      "project_name": {
        "status": "pending",
        "value": "",
        "confirmedValue": null,
        "normalizedValue": null,
        "issues": [],
        "skippedReason": null,
        "history": [],
        "reaskCount": 0
      }
    }
  }
}
```

#### Save Conversation Snapshot
```http
POST /api/charter/conversation
Content-Type: application/json

{
  "id": "conv-123",
  "state": { ... }
}
```

**Response:**
```json
{
  "ok": true
}
```

#### Delete Conversation
```http
DELETE /api/charter/conversation?id={conversationId}
```

**Response:** `204 No Content`

### Telemetry API

#### Submit Metrics
```http
POST /api/telemetry/conversation
Content-Type: application/json

{
  "sessionId": "session-abc123",
  "documentType": "charter",
  "schemaVersion": "2024.10",
  "header": ["timestamp", "session_id", ...],
  "rows": [
    ["2024-01-15T10:30:00Z", "session-abc123", ...]
  ]
}
```

**Response:** `204 No Content`

## Contributing

When making changes to the guided charter feature:

1. Update conversation machine tests if modifying state transitions
2. Update E2E tests for new UI features
3. Update this documentation for user-facing changes
4. Test with feature flags both enabled and disabled
5. Verify telemetry is still being tracked correctly

## Related Files

- **State Machine**: `src/state/conversationMachine.ts`
- **Conversation Store**: `src/state/conversationStore.ts`
- **Wizard UI**: `src/chat/CharterFieldSession.tsx`
- **Form Schema**: `templates/charter/formSchema.json`
- **Validation**: `src/lib/forms/validation.ts`
- **Telemetry**: `lib/telemetry/fieldMetrics.js`, `src/lib/telemetry/conversationClient.ts`
- **API Routes**: `api/charter/conversation.js`, `api/telemetry/conversation.js`
- **E2E Tests**: `cypress/e2e/guided-charter.cy.ts`
- **Feature Flags**: `config/featureFlags.js`
