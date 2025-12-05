# CLAUDE.md

## Project Overview

Exact Virtual Assistant is a full-stack React + Node.js web application for intent-driven document extraction and generation (Project Charters, Design & Development Plans). It uses serverless functions on Vercel.

**Tech Stack:** React 18 + TypeScript 5.9, Vite, Tailwind CSS, Node.js 22.x, OpenAI SDK

**Project Status:** The codebase completed a 6-phase refactoring (Nov 2025) addressing 37 architectural, performance, and code quality issues including unified state management, consolidated API routing, and TypeScript migration.

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
npm run e2e:wizard       # Cypress wizard tests (enables wizard flags)
npm run e2e:voice        # Cypress voice tests
npm run qa:charter-wizard # Golden conversation tests

# Quality
npm run dep:check        # Circular dependency checker
npm run analyze:cycles   # Alias for dep:check
npm run validate:charter-docx  # Validate DOCX template
npm run docx:lint        # Lint template tokens
npm run docx:smoke       # Smoke test template rendering
```

## Directory Structure

```
src/                    # Client-side React code
  App.jsx               # Main app component (very large - 200K+)
  main.jsx              # React entry point
  state/                # State management
    slices/             # tinyStore slices (new pattern)
    actions/            # State actions
    selectors/          # State selectors
    persistence/        # State persistence utilities
    core/               # Core store implementation
  features/
    charter/            # Charter-specific logic (guidedState, schema, prompts)
    previewFocus/       # Preview focus feature
  chat/                 # Chat UI components
  components/           # React components
  voice/                # Voice charter integration (VoiceCharterService.ts)
  hooks/                # React hooks (useCharterReview, useFieldFeedback)
  lib/                  # Shared utilities
  utils/                # Utility functions
  audio/                # Audio processing utilities
  agent/                # Agent-related code
  ui/                   # UI components
  config/               # Client config
  types/                # TypeScript type definitions
  devtools/             # Development tools
  sync/                 # Sync utilities
  preview/              # Preview components

api/                    # Serverless functions (Vercel)
  documents/            # Document endpoints
    extract.js          # Extraction endpoint
    validate.js         # Schema validation
    render.js           # DOCX/PDF rendering
    download.js         # Document download
    make-link.js        # Share link creation
    review.js           # Document review
    review-stream.js    # Streaming review endpoint
  chat.js               # Standard chat endpoint
  chat/                 # Chat-related endpoints
  assistant/
    charter/            # Guided charter backend
    review/             # Review assistant
  charter/              # Charter-specific endpoints
  charters/             # Charter management
  files/                # File handling
  voice/                # Voice endpoints
  transcribe.js         # Transcription endpoint
  telemetry/            # Telemetry endpoints
  export/               # Export endpoints
  debug/                # Debug endpoints

server/                 # Server-side utilities
  charter/              # Charter orchestration (Orchestrator.ts)
  documents/
    extraction/         # Extraction logic (charter.js, guided.js)
    openai/             # OpenAI integration
    sanitization/       # Input sanitization
    utils/              # Server document utilities
  review/               # Review orchestration (Orchestrator.ts/js)
  knowledge/            # Knowledge base for reviews
  config/               # Server configuration
  middleware/           # Request middleware
  utils/                # Server utilities

templates/              # Document templates and registry
  registry.js           # Document type registry (Charter, DDP, SOW)
  field_rules.json      # Validation rules per field
  charter/              # Charter templates
  ddp/                  # DDP templates
  doc-types/            # Doc type configurations
  knowledge/            # Knowledge base content
  pdf/                  # PDF templates
  tools/                # Template tooling

lib/                    # Shared library code
  doc/                  # Document router utilities
  forms/                # Form utilities
  http/                 # HTTP utilities
  storage/              # Storage utilities
  telemetry/            # Telemetry utilities
  tokenize.js           # Tokenization utilities

config/                 # Application configuration
  featureFlags.js       # Feature flag utilities

tests/                  # Unit, integration, and E2E tests
  _stubs/               # Browser API stubs for testing
  fixtures/             # Test fixtures
  helpers/              # Test helpers
  e2e/                  # E2E test utilities
  qa/                   # QA test utilities
  unit/                 # Unit tests

cypress/                # Cypress E2E tests
  e2e/                  # Test specs

docs/                   # Architecture and API documentation
```

## Key Architectural Patterns

### Intent-Driven Extraction (Current Working Mode)

The current implementation uses intent-driven extraction:
- Extraction only occurs when users explicitly request it via natural language
- No automatic extraction from file uploads alone
- `detectCharterIntent()` in `src/utils/detectCharterIntent.js` returns `{ docType, action, intentText }` or `null`
- `/api/documents/extract` returns HTTP 400 (missing intent) or 422 (missing context) on invalid requests

### Planned: LLM-Based Document Analysis

Strategy documents (`docs/LLM-DOCUMENT-EXTRACTION-STRATEGY.md`, `docs/ARCHITECTURE.md`) describe a planned LLM-analysis-driven flow where:
- Documents would be analyzed on upload to classify type and suggest extraction targets
- Users would confirm the suggested document type before extraction proceeds
- Confidence scoring would guide UI behavior

**Note:** The implementation is in `server/documents/analysis/DocumentAnalyzer.js`, `api/documents/analyze.js`, and `api/documents/confirm.js`. The feature is enabled by default but can be disabled by setting `DOCUMENT_ANALYSIS_ENABLED=false`.

### Document Router Pattern

- Router inspects user intent, dispatches to doc-type-specific pipelines
- Registry-driven: `templates/registry.js` registers supported document types
- Each type encapsulates prompts, schemas, templates, and validation rules
- Supported types: Charter (enabled), DDP (enabled), SOW (placeholder/disabled)

### State Management

- **New pattern:** tinyStore with slices (`src/state/slices/`)
- **Legacy pattern:** Direct store functions (coexist during migration)
- Key stores: `chatStore.ts`, `conversationStore.ts`, `draftStore.js`, `syncStore.ts`, `voiceStore.ts`
- State machine: `conversationMachine.ts` handles conversation flow
- Prefer new slices for new code

### Field Locks

- Manual edits lock fields to prevent overwrites during extraction
- `mergeIntoDraftWithLocks()` respects locks

### Document Review System

AI-powered document review evaluates documents across six quality dimensions:
- Completeness, Specificity, Feasibility, Risk Coverage, Scope Clarity, Metric Measurability
- Endpoints: `POST /api/documents/review`, `POST /api/documents/review-stream` (SSE)
- Orchestrator: `server/review/Orchestrator.ts`
- Optional gating: `VITE_REQUIRE_REVIEW_BEFORE_EXPORT=true` blocks export if review score is too low

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
3. Server-side orchestration: `server/charter/Orchestrator.ts`
4. Values merged into draft on completion

### Voice Charter Flow

- WebRTC data channel with OpenAI Realtime API
- `VoiceCharterService.ts` orchestrates conversation (large file - 126K)
- Navigation commands: "go back", "skip", "review", "done"
- ASR service: `ASRService.ts`

## Environment Variables

Required in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
FILES_LINK_SECRET=(32-byte hex)  # Required for charter share links

# Client-side flags (VITE_ prefix)
VITE_CHARTER_GUIDED_CHAT_ENABLED=true   # Enable guided chat flow
VITE_CHARTER_WIZARD_VISIBLE=false       # Show wizard UI alongside guided chat
VITE_AUTO_EXTRACTION_ENABLED=false      # Auto background extraction with wizard
VITE_CHARTER_GUIDED_BACKEND=on          # Use dedicated charter backend
VITE_PREVIEW_CONDITIONAL_VISIBILITY=true # Show preview only during sessions
VITE_REQUIRE_REVIEW_BEFORE_EXPORT=false # Gate exports on review completion

# Server-side flags
INTENT_ONLY_EXTRACTION=true             # Enforce explicit intent (default: true)
CHAT_STREAMING=false                    # Enable /api/chat/stream Edge handler
```

See `.env.example` for additional options.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main app component (very large - consider for refactoring) |
| `src/utils/detectCharterIntent.js` | Intent detection logic (returns docType, action, intentText) |
| `src/features/charter/guidedState.ts` | Guided charter state machine |
| `src/features/charter/schema.ts` | Charter field definitions |
| `src/voice/VoiceCharterService.ts` | Voice charter orchestration |
| `server/charter/Orchestrator.ts` | Server-side guided charter orchestration |
| `server/review/Orchestrator.ts` | Document review orchestration |
| `api/documents/extract.js` | Extraction endpoint |
| `api/documents/render.js` | Document rendering endpoint |
| `api/documents/review.js` | Document review endpoint |
| `templates/registry.js` | Document type registry |
| `templates/field_rules.json` | Validation rules per field |
| `config/featureFlags.js` | Feature flag utilities |

## Testing

- **Unit tests:** Use Node test module, mock browser APIs via `tests/_stubs/`
- **E2E tests:** Cypress and Playwright with multiple test projects
- **Golden conversations:** `npm run qa:charter-wizard`
- **Test naming:** `*.test.js`, `*.test.ts`, `*.test.jsx`

Key test files:
- `tests/api.documents.extract.test.js` - Extraction endpoint tests
- `tests/conversationMachine.test.ts` - State machine tests
- `tests/syncStore.test.ts` - Sync store tests

## Documentation

Key docs to reference:
- `README.md` - Quick start and behavioral contract
- `docs/ARCHITECTURE.md` - System design (includes planned LLM analysis)
- `docs/API.md` - API endpoint reference
- `docs/document-workflow.md` - Extraction/validation/rendering flow
- `docs/charter-guided-chat.md` - Guided charter feature details
- `docs/DOCUMENT_REVIEW_SYSTEM.md` - Document review feature
- `docs/LLM-DOCUMENT-EXTRACTION-STRATEGY.md` - Planned analysis feature design
- `docs/CODEMAP.md` - Detailed code structure
- `docs/REALTIME_SYNC.md` - Real-time synchronization

## Development Notes

### Large Files

Some files are unusually large and may benefit from refactoring:
- `src/App.jsx` (~205K) - Main application component
- `src/voice/VoiceCharterService.ts` (~126K) - Voice charter service

### Code Conventions

- ES Modules throughout (`"type": "module"` in package.json)
- Mix of JavaScript and TypeScript (migration ongoing)
- React functional components with hooks
- Immer for immutable state updates
- Ajv for JSON schema validation
