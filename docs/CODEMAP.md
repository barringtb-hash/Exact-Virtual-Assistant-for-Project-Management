# Code Map

## Repository layout
- `src/` – React single-page client rendered by Vite + Tailwind.
  - `src/state/` – Unified state management using tinyStore pattern (slices, selectors, persistence).
  - `src/features/charter/` – Charter-specific orchestration, guided chat, and state.
  - `src/chat/` – Chat UI components and API integration.
  - `src/types/` – TypeScript type definitions for API, audio, chat, and sync.
- `api/` – Serverless functions (Vercel format) for chat, transcription, and router-backed document extraction/validation/rendering.
- `server/` – Server-side utilities for extraction, validation, and document handling.
- `lib/` – Shared utilities (token counting/chunking and charter normalization) consumed by both the frontend and serverless handlers.
- `lib/doc/` – Document router helpers: registry lookups, validation wrappers, and render utilities shared by every `/api/documents/*` handler.
- `templates/` – Prompt/schema/template store managed by [`templates/registry.js`](../templates/registry.js). Each manifest exposes prompts, metadata, validation assets, and render helpers for the document router.
  - `templates/doc-types/ddp/` – DDP prompts, schema, metadata, and encoded templates used by the router.
  - `templates/ddp/` – DDP editor assets (schema, validation CLI, Word template).
  - `templates/charter/` – Charter manifest, schema, and form configuration.
- `docs/demo/` – Canonical acceptance-test artifacts (OncoLiquid ctDNA Assay TPP demo + walkthrough).
- `docs/ddp/` – DDP acceptance walkthrough and supporting assets.
- `docs/archive/` – Historical documentation from completed refactoring efforts.
- `public/` – Static assets served verbatim by Vite.

## State Management (`src/state/`)
The application uses a unified tinyStore-based state management pattern with the following structure:

### Slices (`src/state/slices/`)
- `chat.ts` – Chat messages, streaming state, and message history
- `draft.ts` – Draft document content and merge status
- `voice.ts` – Voice recording status and transcripts
- `voiceCharter.ts` – Voice charter mode, AI speaking state, and captured values
- `docType.ts` – Document type selection

### Voice (`src/voice/`)
- `realtimeEvents.ts` – OpenAI Realtime API event helpers for sending session updates, conversation items, and response triggers via WebRTC data channel
- `VoiceCharterService.ts` – Service managing voice-guided charter creation flow, including system prompt generation, field navigation, transcript processing, and value capture

### Core Infrastructure
- `src/lib/tinyStore.ts` – Lightweight store implementation with React integration
- `src/state/core/createSlice.ts` – Slice factory for consistent store creation
- `src/state/selectors/` – Cross-slice selectors for efficient subscriptions
- `src/state/actions/` – Coordinated actions spanning multiple slices
- `src/state/persistence/` – Storage middleware with migrations and rehydration

### Legacy Stores (coexisting during migration)
- `conversationMachine.ts` – Charter conversation finite state machine
- `conversationStore.ts` – Charter-specific guided chat state
- `syncStore.ts` – Input synchronization and buffering

## Frontend (`src/`)
- `src/App.jsx`
  - Main application entry that coordinates state, chat, and document preview.
  - When `DOCUMENT_ANALYSIS_ENABLED=true`: Triggers document analysis on file upload via `/api/documents/analyze`.
  - When `DOCUMENT_ANALYSIS_ENABLED=false` (fallback): Detects charter intent via [`detectCharterIntent`](../src/utils/detectCharterIntent.js) and calls extraction.
  - Renders chat composer, transcript, attachment chips, the editable charter preview, realtime voice controls, and the appearance selector in the footer.
- `src/components/PreviewEditable.jsx`
  - Editable charter form that drives the preview panel. Field edits immediately update the draft and mark the associated path as locked to prevent overwriting during extraction.
  - **Readability v1**: Enhanced with larger labels (text-sm), inputs (text-base, 16px), better contrast borders (gray-300), and visual section grouping with borders/padding.
- `src/hooks/useBackgroundExtraction.js`
  - Exposes a `trigger()` method that runs charter extraction **only** when called. All automatic/debounced watchers have been removed.
  - Handles the network request to `/api/documents/extract`, merges unlocked fields into the draft, and surfaces errors in the UI.
- `src/utils/detectCharterIntent.js`
  - **Fallback mode only** (when `DOCUMENT_ANALYSIS_ENABLED=false`).
  - Parses user text (typed or transcribed) and returns `{ docType: 'charter', action: 'create' | 'update', intentText }` when natural-language intent is detected.
- `src/main.jsx`
  - Boots the React app, wraps it with Tailwind styles, and mounts onto `#root`.
- `src/index.css`
  - Tailwind base layers plus app-specific utility overrides (scroll containers, font smoothing, etc.).
  - **Readability v1**: CSS custom properties for consistent theming (--eva-text-*, --eva-surface-*, etc.) and chat bubble styles with 16px base font size.
  - Chat messages constrained to max-width ~70ch for optimal readability (see `src/chat/ChatMessageBubble.tsx`).

## Serverless API (`api/`)
- `api/documents/analyze.js`
  - Analyzes uploaded documents using LLM-based classification.
  - Returns document type classification, confidence scores, and field preview.
  - Caches results for confirmation flow (`ANALYSIS_CACHE_TTL_SECONDS`).
- `api/documents/confirm.js`
  - Processes user confirmation of document type selection.
  - Triggers full extraction using cached analysis context.
- `api/documents/extract.js`
  - Accepts `analysisId` for analysis-driven flow (uses cached context).
  - In fallback mode: Guards against missing intent or context and returns HTTP 400/422 respectively.
  - Loads prompts and metadata via [`lib/doc/registry.js`](../lib/doc/registry.js) and injects them into the structured extraction request.
- `api/documents/validate.js`
  - Compiles the schema + field rules for the requested doc type and returns `{ ok: true }` or detailed Ajv errors.
- `api/documents/render.js`
  - Streams DOCX exports using the doc-type configuration (charter uses `templates/project_charter_tokens.docx.b64`).
- `api/chat.js`, `api/chat/stream.js`, `api/transcribe.js`, `api/voice/sdp.js`, `api/files/text.js`
  - Remain unchanged but feed transcript/context into the client-side flow. `api/chat/stream.js` is gated by `CHAT_STREAMING` for SSE delivery.

## Templates (`templates/`)
- `extract_prompt.txt` – Charter extraction prompt that returns `{ "result": "no_op" }` when invoked without intent metadata.
- `field_rules.json` – Field-by-field constraints that guide downstream validation/UX messaging.
- `charter/schema.json` – JSON schema consumed by Ajv in validation.
- `project_charter_tokens.docx.b64` – Base64-encoded Docxtemplater template whose tokens match charter field keys.
- `pdf/charter.pdfdef.mjs` – pdfmake document definition rendered to PDF by the serverless export handler.
- `renderers.js` – Shared buffer generators for JSON/XLSX downloads (XLSX currently throws a `FormatNotImplementedError`).

## Data flow

### Primary: Analysis-driven extraction (DOCUMENT_ANALYSIS_ENABLED=true)
1. User uploads a document (project scope, meeting notes, requirements, etc.).
2. `src/App.jsx` calls `/api/documents/analyze` with the document text.
3. `api/documents/analyze.js` performs LLM-based classification and returns:
   - Document type classification with confidence score
   - Suggested extraction targets (Charter, DDP, etc.)
   - Field preview with extractable values
4. User sees analysis results and confirms document type.
5. `src/App.jsx` calls `/api/documents/confirm` with the `analysisId` and confirmed type.
6. `api/documents/confirm.js` retrieves cached analysis and triggers full extraction.
7. `api/documents/extract.js` uses analysis context to extract all fields.
8. The hook merges unlocked fields into the preview. Manual edits remain untouched.
9. `api/documents/validate.js` validates the extracted data against the schema.
10. `api/documents/render.js` streams a finished document using the encoded template.

### Fallback: Intent-driven extraction (DOCUMENT_ANALYSIS_ENABLED=false)
1. User attaches a charter source document.
2. User submits a natural-language request such as "Please create a project charter from the attached document."
3. `detectCharterIntent` returns `{ docType: 'charter', action: 'create', intentText }`.
4. `src/App.jsx` calls `useBackgroundExtraction.trigger({ intent, attachments, draft })`.
5. `useBackgroundExtraction.trigger()` posts to `/api/documents/extract` with intent metadata and the active attachments.
6. `api/documents/extract.js` verifies intent and context, loads [`templates/extract_prompt.txt`](../templates/extract_prompt.txt), and calls OpenAI.
7. The prompt short-circuits with `{ "result": "no_op" }` if intent is missing; otherwise it returns structured charter data.
8. The hook merges unlocked fields into the preview. Manual edits remain untouched.
9. `api/documents/validate.js` can be called to compile the schema + field rules and return Ajv validation results.
10. `api/documents/render.js` streams a finished charter document using the encoded template.

### DDP extraction
Both analysis-driven and intent-driven flows support DDP documents:
- Analysis-driven: System may suggest DDP when document contains requirements or technical specifications.
- Intent-driven: User requests "Create a design & development plan from the attached document."
- `/api/documents/extract?docType=ddp` runs the DDP manifest defined in [`templates/doc-types/ddp/`](../templates/doc-types/ddp/).
- `/api/documents/validate?docType=ddp` and `/api/documents/render?docType=ddp` follow the same schema + template path.

### Non-extraction flows
- **Analysis mode**: User can dismiss suggestions or choose not to confirm, leaving the preview unchanged.
- **Fallback mode**: Uploading files without intent leaves the preview unchanged and never calls `/api/documents/extract`.
- Speaking without a charter request produces transcripts but `detectCharterIntent` returns `null` in fallback mode.
- Idle prompt invocations must expect `{ "result": "no_op" }` when intent or context is missing.

## Server-Side (`server/`)
- `server/documents/analysis/` – LLM-based document analysis service
  - `DocumentAnalyzer.js` – Main analysis orchestrator (includes classification, field mapping, confidence scoring)
  - `AnalysisCache.js` – Caching layer with TTL
- `server/charter/` – Charter-specific extraction and orchestration
  - `Orchestrator.ts` – Server-side orchestration logic
  - `extractFieldsFromUtterance.ts` – Field extraction from voice/text input
  - `utils/` – Document assembly, storage, finalization, and normalization
- `server/documents/` – Document processing utilities
  - `extraction/` – Charter and guided extraction handlers
  - `openai/` – OpenAI client configuration
  - `sanitization/` – Input sanitization utilities
- `server/config/` – Extraction limits and configuration
- `server/middleware/` – Request validation middleware
- `server/utils/` – Template preloading, error handling, and logging

## Testing
The project uses multiple test frameworks organized by scope:

### Unit Tests (`tests/`)
- Run with `npm test` using Node.js native test module
- Covers API handlers, state stores, utilities, and validation logic
- Test stubs in `tests/_stubs/` mock browser dependencies

### E2E Tests (`cypress/`)
- Run with `npm run e2e:guided` (guided chat mode) or `npm run e2e:wizard` (wizard mode)
- Covers charter flows, chat interactions, voice sync, and preview visibility
- Support files in `cypress/support/` provide custom commands and mocks

### QA Tests (`tests/qa/`)
- Golden conversation tests for charter wizard flows
- Run with `npm run qa:charter-wizard`
- Transcript fixtures validate expected conversation paths

## Companion references
- [README](../README.md) – Quick start, behavioral contract, testing guidance, and migration notes.
- [docs/demo/README.md](./demo/README.md) – Acceptance path using the OncoLiquid ctDNA Assay (Demo) TPP.
- [docs/document-workflow.md](./document-workflow.md) – Detailed guidance on customizing prompts, templates, and validation assets for each supported document type.
- [docs/archive/](./archive/) – Historical documentation from completed refactoring efforts.
