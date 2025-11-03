# Guided Form Feature - Complete Guide

## Overview

The Guided Form feature provides an AI-powered, conversational interface for creating Project Charters. Instead of filling out a traditional form, users have a natural conversation where the AI assistant guides them through each field, validates inputs, and generates a professional document.

## Features

✅ **One-Field-at-a-Time Guidance** - Never overwhelmed
✅ **Smart Validation** - Catch errors early
✅ **Flexible Navigation** - Go back, skip, edit anytime
✅ **Progress Tracking** - See how far you've come
✅ **Preview Mode** - Review answers mid-way
✅ **Claude-Powered** - Natural, helpful responses
✅ **Professional Output** - DOCX/PDF documents

## Quick Start

### For Users (Project Managers)

1. **Start the Form**
   - Click "Create Guided Charter"
   - AI greets you and explains the process

2. **Answer Questions**
   - One field at a time
   - Examples provided for each field
   - Validation helps catch mistakes

3. **Use Commands**
   - `back` - Previous field
   - `skip` - Skip current field
   - `preview` - See all answers
   - `help` - Show all commands

4. **Finalize**
   - Review summary
   - Generate document
   - Download DOCX or PDF

### For Developers

```bash
# Install dependencies
npm install @anthropic-ai/sdk marked

# Set environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Run tests
node tests/guided-form.orchestrator.test.js
node tests/guided-form.api.test.js

# Start dev server
npm run dev
```

## Architecture

### Frontend (React + TypeScript)

```
src/components/guided-form/
├── GuidedFormContainer.tsx    # Main container
├── GuidedFormChat.tsx          # Message display
├── GuidedFormProgress.tsx      # Progress bar
├── GuidedFormControls.tsx      # Input & buttons
└── GuidedFormPreview.tsx       # Summary view

src/state/
└── guidedFormStore.ts          # State management
```

### Backend (Node.js Serverless)

```
api/guided-form/
├── conversation.js             # Chat endpoint
└── finalize.js                 # Document generation

lib/guided-form/
├── orchestrator.js             # State machine
└── prompts.js                  # Claude templates

templates/charter/
└── guided-form-schema.json     # Field definitions
```

## API Endpoints

### POST /api/guided-form/conversation

Start or continue the conversation.

**Request:**
```json
{
  "message": "My Project Name",
  "conversation_state": {...},
  "doc_type": "charter",
  "use_claude": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Got it: 'My Project Name' — Confirm? (yes/no)",
  "conversation_state": {...},
  "action": "confirm_value",
  "metadata": {
    "current_field": {...},
    "progress": {
      "current": 1,
      "total": 15,
      "completed": 0
    }
  }
}
```

### POST /api/guided-form/finalize

Generate the final document.

**Request:**
```json
{
  "conversation_state": {...},
  "doc_type": "charter",
  "output_format": "docx"
}
```

**Response:**
```json
{
  "success": true,
  "document": {
    "url": "/api/documents/download?token=...",
    "format": "docx"
  }
}
```

## Field Schema

Each field is defined with rich metadata:

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
  "order": 1
}
```

**Field Types:**
- `short_text` - Single-line text (< 200 chars)
- `long_text` - Multi-line text
- `date` - Date in YYYY-MM-DD format
- `person_name` - Person's name
- `array_of_strings` - List of text items
- `array_of_objects` - List of structured items

## User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `back` | Go to previous field | `back` |
| `edit <field>` | Jump to specific field | `edit project_name` |
| `skip` | Skip current field | `skip` |
| `preview` | Show all answers | `preview` |
| `help` | Show commands | `help` |
| `cancel` | Cancel form | `cancel` |

## Validation Rules

### Built-in

- **Required**: Field cannot be empty
- **Length**: Min/max character limits
- **Pattern**: Regex matching
- **Date Format**: YYYY-MM-DD
- **Word Count**: Minimum words required

### Custom Rules

Define in field schema:

```json
{
  "validation": {
    "custom_rules": [
      "no_special_chars_start",
      "min_word_count_10",
      "min_word_count_15",
      "min_word_count_20",
      "single_name_only",
      "valid_date",
      "after_start_date"
    ]
  }
}
```

## State Machine

```
States:
- INIT: Starting state
- ASK: Asking for field
- CAPTURE: Capturing answer
- VALIDATE: Validating input
- CONFIRM: Confirming with user
- NEXT_FIELD: Moving to next field
- BACK: Going backwards
- EDIT_PREVIOUS: Editing old field
- SKIP: Skipping field
- PREVIEW: Showing summary
- END_REVIEW: Final review
- FINALIZE: Generating document
- CANCELLED: Form cancelled
```

## Testing

### Unit Tests

```bash
# Orchestrator tests
node tests/guided-form.orchestrator.test.js
```

Tests cover:
- ✅ State initialization
- ✅ Field validation (required, length, format)
- ✅ Custom validation rules
- ✅ Normalization (trim, capitalize, dates)
- ✅ State transitions (answer, back, skip, edit)
- ✅ Confirmation flow
- ✅ End-to-end completion

### API Tests

```bash
# API integration tests
node tests/guided-form.api.test.js
```

Tests cover:
- ✅ Endpoint initialization
- ✅ Answer submission
- ✅ CORS headers
- ✅ Method validation
- ✅ Finalization validation

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_API_KEY=sk-ant-...  # Alternative to ANTHROPIC_API_KEY
```

### Prompt Tuning

Edit `lib/guided-form/prompts.js`:

```javascript
const SYSTEM_PROMPT = `You are a structured form assistant...`;

// Adjust temperature (0-1)
temperature: 0.3  // Lower = more deterministic

// Adjust max tokens
max_tokens: 300  // Lower = more concise
```

## Extending to Other Documents

To add guided form for a new document type:

1. **Create Schema**: `/templates/ddp/guided-form-schema.json`

2. **Define Fields**: Follow same structure as charter

3. **Use Orchestrator**:
   ```javascript
   processMessage(state, message, 'ddp');
   ```

4. **Add Validation**: Custom rules if needed

5. **Test**: Create test suite

## Telemetry

Tracked metrics:

```javascript
metadata: {
  started_at: "2025-01-15T10:00:00Z",
  field_metrics: {
    "project_name": {
      "ask_count": 1,
      "started_at": "2025-01-15T10:00:05Z",
      "completed_at": "2025-01-15T10:00:32Z"
    }
  },
  total_re_asks: 3
}
```

Access in finalize endpoint for analytics.

## Troubleshooting

### Claude asks multiple fields at once

**Fix**: Lower `max_tokens` to 300, add more stop sequences

### Validation not triggering

**Fix**: Check field `type` matches validation rules

### State lost on refresh

**Fix**: Implement localStorage persistence:

```javascript
// Save state
localStorage.setItem('guided-form-state', JSON.stringify(state));

// Restore state
const state = JSON.parse(localStorage.getItem('guided-form-state'));
```

### API errors

**Fix**: Verify `ANTHROPIC_API_KEY` is set and valid

## Performance

- **Average completion time**: 15-20 minutes
- **API calls**: ~30-50 (one per field + confirmations)
- **Token usage**: ~10K-15K total
- **Response time**: < 2 seconds per interaction

## Security

- ✅ Input sanitization via validation
- ✅ XSS prevention with DOMPurify
- ✅ API key never exposed to frontend
- ✅ CORS restricted to authorized origins
- ✅ No sensitive data logged

## Future Roadmap

### Phase 2: Google Drive Integration
- Auto-create Google Docs
- Template replacement
- Sharing and permissions

### Phase 3: Collaboration
- Multi-user form filling
- Real-time updates
- Comment threads

### Phase 4: Templates
- Pre-filled templates
- Department-specific defaults
- Historical data suggestions

## Support & Contribution

- **Documentation**: `/docs/guided-form-*.md`
- **Tests**: `/tests/guided-form.*.test.js`
- **Examples**: See test files for usage patterns

## License

Same as parent project.

---

**Built with:**
- React 18.3 + TypeScript
- Claude 3.5 Sonnet (Anthropic)
- Vercel Serverless Functions
- TinyStore (lightweight state)
