# Code Map

## Repository layout
- `src/` – React single-page client rendered by Vite + Tailwind.
- `api/` – Serverless functions (Vercel format) for chat, transcription, and router-backed document extraction/validation/rendering.
- `lib/` – Shared utilities (token counting/chunking and charter normalization) consumed by both the frontend and serverless handlers.
- `lib/doc/` – Document router helpers: registry lookups, validation wrappers, and render utilities shared by every `/api/documents/*` handler.
- `templates/` – Prompt/schema/template store managed by [`templates/registry.js`](../templates/registry.js). Each manifest exposes prompts, metadata, validation assets, and render helpers for the document router.
  - `templates/doc-types/ddp/` – DDP prompts, schema, metadata, and encoded templates used by the router.
  - `templates/doc-types/charter/` – Charter assets kept for parity with the Phase 1 acceptance path.
- `docs/demo/` – Canonical acceptance-test artifacts (OncoLiquid ctDNA Assay TPP demo + walkthrough).
- `docs/ddp/` – DDP acceptance walkthrough and supporting assets.
- `public/` – Static assets served verbatim by Vite.

## Frontend (`src/`)
- `src/App.jsx`
  - Owns application state for chat messages, voice transcripts, attachment metadata, and the editable charter preview.
  - Detects charter intent via [`detectCharterIntent`](../src/utils/detectCharterIntent.js) and, when matched, calls [`useBackgroundExtraction.trigger()`](../src/hooks/useBackgroundExtraction.js).
  - Renders chat composer, transcript, attachment chips, the editable charter preview, realtime voice controls, and the appearance selector in the footer.
- `src/components/PreviewEditable.jsx`
  - Editable charter form that drives the preview panel. Field edits immediately update the draft and mark the associated path as locked to prevent overwriting during extraction.
- `src/hooks/useBackgroundExtraction.js`
  - Exposes a `trigger()` method that runs charter extraction **only** when called. All automatic/debounced watchers have been removed.
  - Handles the network request to `/api/documents/extract`, merges unlocked fields into the draft, and surfaces errors in the UI.
- `src/utils/detectCharterIntent.js`
  - Parses user text (typed or transcribed) and returns `{ docType: 'charter', action: 'create' | 'update', intentText }` when natural-language intent is detected.
- `src/main.jsx`
  - Boots the React app, wraps it with Tailwind styles, and mounts onto `#root`.
- `src/index.css`
  - Tailwind base layers plus app-specific utility overrides (scroll containers, font smoothing, etc.).

## Serverless API (`api/`)
- `api/documents/extract.js`
  - Guards against missing intent or context and returns HTTP 400/422 respectively. Only proceeds to call OpenAI when intent metadata is present.
  - Loads prompts and metadata via [`lib/doc/registry.js`](../lib/doc/registry.js) and injects them into the structured extraction request.
- `api/documents/validate.js`
  - Compiles the schema + field rules for the requested doc type and returns `{ ok: true }` or detailed Ajv errors.
- `api/documents/render.js`
  - Streams DOCX exports using the doc-type configuration (charter uses `templates/project_charter_tokens.docx.b64`).
- `api/chat.js`, `api/chat/stream.js`, `api/transcribe.js`, `api/voice/sdp.js`, `api/files/text.js`
  - Remain unchanged but feed transcript/context into the client-side intent detection flow. `api/chat/stream.js` is gated by `CHAT_STREAMING` for SSE delivery.

## Templates (`templates/`)
- `extract_prompt.txt` – Charter extraction prompt that returns `{ "result": "no_op" }` when invoked without intent metadata.
- `field_rules.json` – Field-by-field constraints that guide downstream validation/UX messaging.
- `charter/schema.json` – JSON schema consumed by Ajv in validation.
- `project_charter_tokens.docx.b64` – Base64-encoded Docxtemplater template whose tokens match charter field keys.
- `pdf/charter.pdfdef.mjs` – pdfmake document definition rendered to PDF by the serverless export handler.
- `renderers.js` – Shared buffer generators for JSON/XLSX downloads (XLSX currently throws a `FormatNotImplementedError`).

## Data flow
### Natural-language intent to charter extraction
1. User attaches the demo TPP or another charter source document.
2. User submits a natural-language request such as “Please create a project charter from the attached document.”
3. `detectCharterIntent` returns `{ docType: 'charter', action: 'create', intentText }`.
4. `src/App.jsx` calls `useBackgroundExtraction.trigger({ intent, attachments, draft })`.
5. `useBackgroundExtraction.trigger()` posts to `/api/documents/extract` with intent metadata and the active attachments.
6. `api/documents/extract.js` verifies intent and context, loads [`templates/extract_prompt.txt`](../templates/extract_prompt.txt), and calls OpenAI.
7. The prompt short-circuits with `{ "result": "no_op" }` if intent is missing; otherwise it returns structured charter data.
8. The hook merges unlocked fields into the preview. Manual edits remain untouched.
9. `api/documents/validate.js` can be called to compile the schema + field rules and return Ajv validation results.
10. `api/documents/render.js` streams a finished charter document using the encoded template.

### Natural-language intent to DDP extraction
1. User attaches a representative DDP source document.
2. User submits a request such as “Create a design & development plan from the attached document.”
3. The router resolves `docType: 'ddp'` from the intent detector.
4. `/api/documents/extract?docType=ddp` runs the DDP manifest defined in [`templates/doc-types/ddp/`](../templates/doc-types/ddp/).
5. `/api/documents/validate?docType=ddp` and `/api/documents/render?docType=ddp` follow the same schema + template path as the charter flow, producing structured DDP output on demand.

### Non-intent flows (no-op)
- Uploading files without intent leaves the preview unchanged and never calls `/api/documents/extract`.
- Speaking without a charter request produces transcripts but `detectCharterIntent` returns `null`, so extraction is skipped.
- Idle prompt invocations (e.g., automated cron jobs) must expect `{ "result": "no_op" }` when intent or context is missing.

## Companion references
- [README](../README.md) – Quick start, behavioral contract, testing guidance, and migration notes.
- [docs/demo/README.md](./demo/README.md) – Acceptance path using the OncoLiquid ctDNA Assay (Demo) TPP.
- [docs/document-workflow.md](./document-workflow.md) – Detailed guidance on customizing prompts, templates, and validation assets for each supported document type.
