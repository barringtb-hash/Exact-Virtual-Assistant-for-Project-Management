# CLAUDE.md

## Project Overview

Exact Virtual Assistant is a full-stack React + Node.js web application for intent-driven document extraction and generation (Project Charters, Design & Development Plans). It uses serverless functions on Vercel.

**Tech Stack:** React 18 + TypeScript 5.9, Vite, Tailwind CSS, Node.js 22.x, OpenAI SDK

## Essential Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173)

# Build
npm run build            # Full build (server + client)
npm run build:server     # Server only (dist/server)
npm run build:client     # Client only (dist/client)

# Testing
npm test                 # Unit/integration tests (Node test module)
npm run test:e2e         # Playwright E2E tests
npm run e2e:guided       # Cypress guided chat tests
npm run e2e:voice        # Cypress voice tests

# Quality
npm run dep:check        # Circular dependency checker
npm run validate:charter-docx  # Validate DOCX template
```

## Directory Structure

```
src/                    # Client-side React code
  App.jsx               # Main app component
  main.jsx              # React entry point
  state/                # State management (tinyStore slices)
  features/charter/     # Charter-specific logic
  chat/                 # Chat UI components
  components/           # React components
  voice/                # Voice charter integration
  hooks/                # React hooks
  lib/                  # Shared utilities
  utils/                # Utility functions (detectCharterIntent.js is key)

api/                    # Serverless functions (Vercel)
  documents/            # extract.js, validate.js, render.js
  chat.js               # Standard chat endpoint
  assistant/charter/    # Guided charter backend

server/                 # Server-side utilities
  charter/              # Charter orchestration
  documents/            # Extraction logic

templates/              # Document templates and registry
  registry.js           # Document type registry (Charter, DDP, SOW)
  field_rules.json      # Validation rules per field

tests/                  # Unit, integration, and E2E tests
docs/                   # Architecture and API documentation
```

## Key Architectural Patterns

### Intent-Only Extraction
- **Core Rule:** Extraction only occurs when users explicitly request it via natural language
- No automatic extraction from file uploads alone
- `detectCharterIntent()` in `src/utils/detectCharterIntent.js` returns `{ docType, action, intentText }` or `null`
- `/api/documents/extract` returns HTTP 400 (missing intent) or 422 (missing context) on invalid requests

### Document Router Pattern
- Router inspects user intent, dispatches to doc-type-specific pipelines
- Registry-driven: `templates/registry.js` registers supported document types
- Each type encapsulates prompts, schemas, templates, and validation rules

### State Management
- **New pattern:** tinyStore with slices (`src/state/slices/`)
- **Legacy pattern:** Direct store functions (coexist during migration)
- Prefer new slices for new code

### Field Locks
- Manual edits lock fields to prevent overwrites during extraction
- `mergeIntoDraftWithLocks()` respects locks

## Main Flows

### Document Extraction Flow
1. User uploads file + sends intent message
2. `detectCharterIntent()` validates intent
3. `POST /api/documents/extract` with intent + context
4. `POST /api/documents/validate` for schema validation
5. `POST /api/documents/render` streams DOCX/PDF

### Guided Charter Chat Flow
1. User clicks "Start Charter" or sends intent
2. Field-by-field collection via `/api/assistant/charter/*`
3. Values merged into draft on completion

### Voice Charter Flow
- WebRTC data channel with OpenAI Realtime API
- `VoiceCharterService.ts` orchestrates conversation
- Navigation commands: "go back", "skip", "review", "done"

## Environment Variables

Required in `.env.local`:
```bash
OPENAI_API_KEY=sk-...
FILES_LINK_SECRET=(32-byte hex)
INTENT_ONLY_EXTRACTION=true
VITE_CHARTER_GUIDED_CHAT_ENABLED=true
```

See `.env.example` for full list.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main app component |
| `src/utils/detectCharterIntent.js` | Intent detection logic |
| `templates/registry.js` | Document type registry |
| `api/documents/extract.js` | Intent-gated extraction endpoint |
| `server/charter/Orchestrator.ts` | Charter extraction orchestration |
| `docs/ARCHITECTURE.md` | System design reference |
| `docs/CODEMAP.md` | Detailed code structure |

## Testing

- Unit tests: Use Node test module, mock browser APIs via `tests/_stubs/`
- E2E tests: Cypress and Playwright with multiple test projects
- Golden conversations: `npm run qa:charter-wizard`

## Documentation

Key docs to reference:
- `README.md` - Quick start and behavioral contract
- `docs/ARCHITECTURE.md` - System design
- `docs/API.md` - API endpoint reference
- `docs/document-workflow.md` - Extraction/validation/rendering flow
- `docs/charter-guided-chat.md` - Guided charter feature details
