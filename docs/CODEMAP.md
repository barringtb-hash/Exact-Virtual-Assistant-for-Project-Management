# Code Map

## Repository layout
- `src/` – React single-page client rendered by Vite + Tailwind.
- `api/` – Vercel-style serverless functions that power chat, speech, realtime voice, charter automation, PDF rendering, and attachment text extraction.
- `lib/` – Shared utilities (token counting/chunking and charter normalization) consumed by both the frontend and serverless handlers.
- `lib/doc/` – Document router helpers: registry lookups, validation wrappers, and render utilities shared by every `/api/documents/*` handler.
- `templates/` – Prompts, schema, charter templates, and renderer helpers used by the charter export pipeline.
- `public/` – Static assets served verbatim by Vite (currently minimal placeholder content).

## Frontend (`src/`)
- `src/App.jsx`
  - Owns application state for messages, draft input, attachment metadata, realtime voice, the editable charter preview, and theme preference.
  - Provides helpers `callLLM`, voice/transcription orchestration, and the Summarize/"Sync now" accelerator that reuses background extraction. `THEME_STORAGE_KEY` persists the light/dark/auto selection while `messagesContainerRef` keeps the transcript pinned to the newest exchange. The chat command router (`handleCommandFromText` plus `exportDocxViaChat`, `exportPdfViaChat`, `shareLinksViaChat`, and `generateBlankCharter`) validates charters and posts signed download links without hitting the LLM when possible.
  - Renders chat composer, transcript, attachment chips, the editable charter preview, realtime voice controls, and the appearance selector in the footer. Assistant replies flow through `AssistantFeedbackTemplate` to normalize headings and Markdown links.
- `src/components/PreviewEditable.jsx`
  - Editable charter form that drives the preview panel. Field edits immediately update the draft and mark the associated path as locked so background extraction cannot overwrite manual values. Includes list editors for scope, risks, assumptions, milestones, success metrics, and core team members.
- `src/hooks/useBackgroundExtraction.js`
  - Debounced watcher that monitors messages, voice transcripts, and attachment metadata. Calls `/api/charter/extract`, normalizes the response, and merges it into the draft while skipping locked fields. Exposes the same merge behavior for the Summarize/"Sync now" action.
- `src/main.jsx`
  - Boots the React app, wraps it with Tailwind styles, and mounts onto `#root`.
- `src/index.css`
  - Tailwind base layers plus app-specific utility overrides (e.g., scroll containers, font smoothing).
- `src/components/AssistantFeedbackTemplate.jsx`
  - Shared assistant bubble layout that renders formatted sections, nested bullet lists, and sanitized Markdown links.
- `src/utils/`
  - Houses document helpers (`getBlankDoc`), assistant formatting utilities, and HTML sanitizers used by the feedback template.

## Serverless API (`api/`)
- `api/chat.js`
  - Validates POST requests, enforces optional token limits, summarizes attachments with map/reduce helpers (`lib/tokenize.js`), and calls the OpenAI Responses or Chat Completions API depending on the configured model.
- `api/transcribe.js`
  - Accepts base64 audio, enforces MIME whitelist, converts to a `File`, transcribes with `OPENAI_STT_MODEL` or falls back to Whisper, and returns `{ text, transcript }`.
- `api/files/text.js`
  - Normalizes attachment payloads by decoding base64 uploads, extracting text from PDF/DOCX/JSON/plain inputs, trimming to ~20k characters, and reporting truncation state.
- `api/voice/sdp.js`
  - Exchanges browser SDP offers with OpenAI Realtime, forwarding environment-selected model/voice and returning the SDP answer payload.
- `api/charter/extract.js`
  - Legacy entry point that now forwards to the document router so existing clients continue to work without configuration changes.
- `api/doc/extract.js`
  - Resolves the requested doc type (defaults to charter), loads doc-type-specific prompts/metadata from `lib/doc/registry.js`, and returns structured JSON produced by OpenAI.
- `api/charter/render.js`
  - Delegates to the document router while preserving the legacy `/api/charter/render` signature.
- `api/doc/render.js`
  - Streams DOCX exports using the doc-type configuration (charter uses `templates/project_charter_tokens.docx.b64`, DDP loads `templates/doc-types/ddp/template.docx.b64`).
- `api/export/pdf.js`
  - Validates charter payloads, builds a pdfmake document definition from `templates/pdf/charter.pdfdef.mjs`, and streams the generated PDF buffer without spawning Chromium so the endpoint contract stays the same without the browser dependency.
- `api/charter/validate.js`
  - Backwards-compatible alias that forwards charter payloads into the shared validator.
- `api/doc/validate.js`
  - Compiles the schema + field rules for the requested doc type and returns `{ ok: true }` or detailed Ajv errors.
- `api/charter/make-link.js`
  - Generates short-lived, fully-qualified DOCX/PDF download URLs by signing payloads with `FILES_LINK_SECRET` and encoding an expiry timestamp alongside the charter metadata.
- `api/charter/download.js`
  - Verifies the signed token, enforces the expiry window, and streams the requested document. Supports DOCX/PDF/JSON responses and returns a `501` placeholder for unimplemented formats like XLSX.
- `api/charter/health.js`
  - Lightweight probe that reports whether `FILES_LINK_SECRET` is present so the UI can surface actionable chat guidance when export links are unavailable.

## Templates (`templates/`)
- `extract_prompt.txt` – System prompt directing the model on how to populate charter fields.
- `field_rules.json` – Field-by-field constraints that guide downstream validation/UX messaging.
- `charter/schema.json` – JSON schema consumed by Ajv in validation.
- `project_charter_tokens.docx.b64` – Base64-encoded Docxtemplater template whose tokens match charter field keys.
- `pdf/charter.pdfdef.mjs` – pdfmake document definition rendered to PDF by the serverless export handler.
- `renderers.js` – Shared buffer generators for JSON/XLSX downloads (XLSX currently throws a `FormatNotImplementedError`).
- `charter-validate.mjs` – CLI helper to validate charter JSON offline against the shared schema.
- `validate-docx-template.mjs`, `sync-charter-template.mjs` – Utilities for decoding, editing, and linting the DOCX template prior to encoding.
- `pdf/charter.html` – Legacy HTML reference used to design the PDF export layout.
- `doc-types/ddp/` – Runtime assets (schema, field rules, prompts, encoded DOCX) that allow the document router to serve the Design & Development Plan.
- `ddp/` – Editor-focused copies of the DDP template, schema, and the `ddp-validate.mjs` CLI so template authors can lint payloads and sync the DOCX outside the runtime folder.

## Public assets (`public/`)
- `favicon.svg`, `robots.txt`, and other static assets Vite serves without processing. Extend this folder with brand imagery or downloadable resources.

## Data flow
### Text chat loop
1. User enters text in the composer (`src/App.jsx` state `draftInput`).
2. `sendMessage` pushes the user message into `messages` state and posts `{ messages }` to `POST /api/chat` when live mode is enabled.
3. `api/chat.js` calls OpenAI and responds with `{ reply }`, which the frontend appends to the transcript.

### Voice capture + transcription
1. Microphone button starts a `MediaRecorder`; audio chunks buffer in `src/App.jsx`.
2. Recording stops → audio is converted to base64 and POSTed to `POST /api/transcribe`.
3. `api/transcribe.js` validates, transcodes, and requests transcription from OpenAI, returning `{ text, transcript }`.
4. Frontend inserts the transcript into chat state (either as the draft input for review or auto-sent based on toggle), then continues with the regular chat loop above.

### Realtime voice session
1. When realtime mode is toggled, the browser creates an `RTCPeerConnection` and generates an SDP offer.
2. `src/App.jsx` posts the offer to `POST /api/voice/sdp`.
3. `api/voice/sdp.js` forwards the offer to OpenAI Realtime and returns the SDP answer.
4. Frontend applies the answer, enabling bidirectional audio streaming between the user and OpenAI; fallback to transcription occurs if errors arise.

### Document extraction, validation, and rendering
1. `useBackgroundExtraction` watches chat, voice, and attachment updates; after a short debounce it calls the generalized `POST /api/documents/extract` (or the charter alias) with the latest transcript, upload metadata, and the current draft as a seed value.
2. The hook normalizes the response and merges fields that are not locked by manual edits. The Summarize/"Sync now" button triggers the same extractor immediately when project managers want an on-demand refresh.
3. `api/doc/extract.js` synthesizes structured data using the doc-type-specific prompt and returns normalized JSON when parsing succeeds (falling back to `{ result: ... }` otherwise).
4. Before exporting, the client can POST the draft to `POST /api/documents/validate` (or `/api/charter/validate`) to ensure schema compliance.
5. Validated data is sent to `POST /api/documents/render` (or `/api/charter/render`), which merges values into the DOCX template defined by the active document type and responds with the downloadable file.
6. `/api/export/pdf` converts the charter payload into a styled PDF, while `/api/charter/make-link` + `/api/charter/download` sign and serve DOCX/PDF/JSON (with an XLSX placeholder) to end users.

### Attachment text normalization
1. File uploads are routed through `POST /api/files/text` to extract text from PDFs, DOCX, JSON, or plain text while respecting size limits.
2. The normalized `{ name, mimeType, text, truncated }` payload is cached in frontend state and passed to chat/extraction endpoints as needed.
3. `lib/tokenize.js` helpers summarize or chunk attachments when constructing chat prompts so the LLM stays within token budgets.

## Companion references
- [API endpoints](./API.md) – Request/response schemas, environment variables, and notable behaviors for every serverless route.
- [Document workflows](./charter-workflow.md) – Detailed guidance on customizing prompts, templates, and validation assets for each supported doc type.
