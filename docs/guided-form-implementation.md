# Guided Form Implementation Guide

## Overview

The Guided Form feature enables AI-assisted, field-by-field document creation for Project Charters. The system guides users through each field sequentially, validates inputs, confirms answers, and generates a final document.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  GuidedFormContainer                              │  │
│  │  ├── GuidedFormChat (Message Display)            │  │
│  │  ├── GuidedFormProgress (Progress Bar)           │  │
│  │  ├── GuidedFormControls (Input & Commands)       │  │
│  │  └── GuidedFormPreview (Summary View)            │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  guidedFormStore (State Management)              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕ HTTP
┌─────────────────────────────────────────────────────────┐
│                    API Layer (Vercel)                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/guided-form/conversation                    │  │
│  │  ├── Orchestrator (State Machine)                │  │
│  │  ├── Prompt Builder                              │  │
│  │  └── Claude API Integration                      │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/guided-form/finalize                        │  │
│  │  ├── Document Renderer                           │  │
│  │  ├── Validation                                  │  │
│  │  └── Audit Logging                               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│                 External Services                        │
│  ├── Anthropic Claude API                               │
│  └── Google Drive API (future)                          │
└─────────────────────────────────────────────────────────┘
```

### State Machine Flow

```
INIT → ASK → CAPTURE → VALIDATE → CONFIRM → NEXT_FIELD → ...
  ↓      ↓       ↓         ↓          ↓          ↓
  └──────┴───────┴─────────┴──────────┴──────────┘
                    ↕
        BACK | EDIT | SKIP | PREVIEW | HELP
                    ↓
              END_REVIEW → FINALIZE
```

## File Structure

```
/templates/charter/
  ├── guided-form-schema.json     # Field definitions & metadata
  ├── schema.json                 # Original JSON schema
  └── manifest.json               # Document type config

/lib/guided-form/
  ├── orchestrator.js             # State machine logic
  └── prompts.js                  # Claude prompt templates

/api/guided-form/
  ├── conversation.js             # Chat endpoint
  └── finalize.js                 # Document generation

/src/components/guided-form/
  ├── GuidedFormContainer.tsx     # Main container
  ├── GuidedFormChat.tsx          # Message display
  ├── GuidedFormProgress.tsx      # Progress indicator
  ├── GuidedFormControls.tsx      # Input controls
  ├── GuidedFormPreview.tsx       # Preview modal
  └── index.ts                    # Exports

/src/state/
  └── guidedFormStore.ts          # State management

/tests/
  ├── guided-form.orchestrator.test.js
  └── guided-form.api.test.js
```

## Key Concepts

### 1. Field Schema

Each field in the guided form schema contains:

```json
{
  "id": "project_name",
  "label": "Project Title",
  "help_text": "Provide a short, descriptive name",
  "required": true,
  "type": "short_text",
  "min_length": 3,
  "max_length": 120,
  "placeholder": "e.g., EMEA Ordering Modernization",
  "example": "Customer Portal Redesign 2025",
  "validation": {
    "pattern": null,
    "custom_rules": ["no_special_chars_start"]
  },
  "visibility": { "when": "always" },
  "order": 1
}
```

### 2. State Machine

The orchestrator manages conversation state:

```javascript
{
  doc_type: 'charter',
  schema_version: '1.0',
  current_field_index: 0,
  current_state: 'ASK',
  answers: {},
  skipped: [],
  flags: {
    has_required_gaps: false,
    awaiting_confirmation: false
  },
  metadata: {
    started_at: '2025-01-15T10:00:00Z',
    field_metrics: {},
    total_re_asks: 0
  }
}
```

### 3. Conversation Flow

1. **ASK**: System asks for current field
2. **CAPTURE**: User provides answer
3. **VALIDATE**: System validates against rules
4. **CONFIRM**: System confirms with user
5. **NEXT_FIELD**: Move to next field

### 4. User Commands

Users can interrupt the flow with commands:

- `back` - Go to previous field
- `edit <field_name>` - Jump to specific field
- `skip` - Skip current field (warns if required)
- `preview` - Show all captured data
- `help` - Show available commands
- `cancel` - Cancel the entire form

## Integration with Existing Codebase

### Using the Guided Form

```tsx
import { GuidedFormContainer } from './components/guided-form';

function App() {
  const handleComplete = (documentData) => {
    console.log('Document generated:', documentData);
    // Download or display the document
  };

  const handleCancel = () => {
    console.log('Form cancelled');
    // Navigate away or show confirmation
  };

  return (
    <GuidedFormContainer
      docType="charter"
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  );
}
```

### API Usage

#### Initialize Conversation

```javascript
POST /api/guided-form/conversation

{
  "message": "__INIT__",
  "doc_type": "charter",
  "use_claude": true
}

Response:
{
  "success": true,
  "message": "Let's create your Project Charter...",
  "conversation_state": {...},
  "action": "ask_field",
  "metadata": {
    "current_field": {...},
    "progress": {...}
  }
}
```

#### Submit Answer

```javascript
POST /api/guided-form/conversation

{
  "message": "My Project Name",
  "conversation_state": {...},
  "doc_type": "charter",
  "conversation_history": [...],
  "use_claude": true
}

Response:
{
  "success": true,
  "message": "Got it: 'My Project Name' — Confirm? (yes/no)",
  "conversation_state": {...},
  "action": "confirm_value"
}
```

#### Finalize Document

```javascript
POST /api/guided-form/finalize

{
  "conversation_state": {...},
  "doc_type": "charter",
  "output_format": "docx"
}

Response:
{
  "success": true,
  "document": {
    "url": "/api/documents/download?token=...",
    "format": "docx"
  }
}
```

## Environment Variables

Required environment variables:

```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-3-5-sonnet-20241022  # Optional, defaults to this

# Optional
CLAUDE_API_KEY=sk-ant-...  # Alternative to ANTHROPIC_API_KEY
```

## Validation Rules

### Built-in Validators

- `required` - Field cannot be empty
- `min_length` / `max_length` - Text length constraints
- `pattern` - Regex pattern matching
- `format: "date"` - Valid date format

### Custom Validators

Custom rules defined in field schema:

```javascript
{
  "validation": {
    "custom_rules": [
      "no_special_chars_start",  // No special chars at start
      "min_word_count_10",        // At least 10 words
      "min_word_count_15",        // At least 15 words
      "min_word_count_20"         // At least 20 words
    ]
  }
}
```

Add new custom rules in `lib/guided-form/orchestrator.js`:

```javascript
function applyCustomRule(rule, value, field) {
  switch (rule) {
    case 'my_custom_rule':
      if (/* validation logic */) {
        return 'Error message';
      }
      break;
  }
  return null;
}
```

## Prompt Engineering

### System Prompt

Located in `lib/guided-form/prompts.js`, the system prompt:

- Enforces one-field-at-a-time behavior
- Sets tone and style
- Defines confirmation protocol
- Establishes command handling

### Temperature & Tokens

- **Temperature**: 0.3 (deterministic, consistent)
- **Max Tokens**: 300 (concise responses)
- **Stop Sequences**: Prevent multi-field asks

## Testing

### Run Unit Tests

```bash
node tests/guided-form.orchestrator.test.js
```

### Run API Tests

```bash
node tests/guided-form.api.test.js
```

### Test Scenarios

1. ✅ Happy path - all required fields
2. ✅ Validation errors and re-asks
3. ✅ Back navigation
4. ✅ Edit previous field
5. ✅ Skip optional field
6. ✅ Skip required field with confirmation
7. ✅ Preview mid-way
8. ✅ Cancel flow
9. ✅ End review with gaps
10. ✅ Finalize document

## Extending to Other Document Types

To add a new document type (e.g., "Design & Development Plan"):

1. **Create field schema**:
   ```
   /templates/ddp/guided-form-schema.json
   ```

2. **Define validation rules** in schema

3. **Use existing orchestrator**:
   ```javascript
   await processMessage(state, message, 'ddp');
   ```

4. **Create custom validators** if needed in orchestrator

5. **Add to registry** in `templates/registry.js`

## Telemetry & Analytics

The system tracks:

- **Per-field metrics**: ask count, time to complete
- **Session metrics**: total re-asks, completion time
- **Abandon points**: where users quit
- **Field difficulty**: re-ask frequency

Access in conversation state:

```javascript
conversationState.metadata.field_metrics = {
  "project_name": {
    "ask_count": 1,
    "started_at": "...",
    "completed_at": "..."
  }
}
```

## Troubleshooting

### Issue: Claude asks multiple fields

**Solution**: Check stop sequences in `prompts.js` and ensure max_tokens is low (300)

### Issue: Validation not working

**Solution**: Verify field schema has correct validation rules and types

### Issue: State lost on refresh

**Solution**: Implement persistence using localStorage or database

### Issue: Claude API errors

**Solution**: Verify ANTHROPIC_API_KEY is set and valid

## Performance Optimization

1. **Prompt Caching**: Use cache_control for system/developer prompts
2. **Token Management**: Keep max_tokens low to reduce latency
3. **State Persistence**: Store conversation state to avoid re-processing
4. **Lazy Loading**: Load schema only when needed

## Security Considerations

1. **Input Sanitization**: All user inputs are validated and normalized
2. **XSS Prevention**: Markdown rendering uses DOMPurify
3. **API Key Protection**: Never expose ANTHROPIC_API_KEY to frontend
4. **CORS**: Configured for authorized origins only

## Future Enhancements

### Phase 2: Google Drive Integration

```javascript
POST /api/guided-form/finalize

{
  "conversation_state": {...},
  "doc_type": "charter",
  "google_drive": {
    "enabled": true,
    "template_id": "...",
    "folder_id": "...",
    "share_with": ["user@example.com"]
  }
}
```

### Phase 3: Multi-document Workflows

Chain multiple document types in sequence.

### Phase 4: Collaboration

Multiple users can contribute to same form.

## Support

For issues or questions:
- Check `/docs/guided-form-user-guide.md` for user documentation
- Review test files for usage examples
- Open an issue in the project repository
