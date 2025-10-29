# Exact Virtual Assistant for Project Management (Phase 1)

A React + Tailwind single-page assistant that drafts project charters, validates structured outputs, and generates export links without leaving the transcript. The latest iteration layers in attachment text extraction, PDF rendering, charter-share health checks, realtime voice, and an inline command router so phrases like “share the charter” immediately validate data and respond with signed download URLs.

## Architecture Overview
- **Client shell (`src/App.jsx`)** – orchestrates chat history, attachment state, realtime voice, the editable preview draft, and the light/dark/auto appearance mode. The UI is a single-page React composition rendered through Tailwind utility classes; icons are inlined SVG components for zero extra dependencies. Chat render effects automatically scroll to the latest exchange while preserving focus for keyboard input, and the assistant bubble pipes responses through `AssistantFeedbackTemplate` to normalize Markdown links and section headings.
- **Editable preview** – the right rail renders `PreviewEditable`, a reusable form that binds to the charter draft. User edits mark fields as locked so background extraction cannot overwrite them, while list editors make risks, scope, and milestone maintenance quick.
- **Background extraction** – `useBackgroundExtraction` watches chat, voice, and attachment updates. It debounces activity (~1s), calls `/api/charter/extract` with the latest signals, normalizes the payload, and merges the result into the draft without touching locked fields. The Summarize button now triggers the same extractor immediately as a "Sync now" accelerator.
- **Message flow** – user input is pushed into local state, optionally sent to `/api/chat`, and the assistant response is appended back into the transcript. The composer includes a lightweight command router so phrases like “share links,” “download docx,” or “export pdf” skip the LLM hop and immediately trigger charter validation plus export link generation within the chat transcript.
- **Voice capture** – the microphone button records via `MediaRecorder`. Recordings are base64-encoded and POSTed to `/api/transcribe`, which chooses the primary speech-to-text model declared in `OPENAI_STT_MODEL` and automatically falls back to Whisper (`whisper-1`) if the primary model returns 400/404 errors. Voice transcripts also run through the same command router, so spoken export requests yield shareable links without touching the sidebar.
- **Realtime voice toggle** – setting `VITE_OPENAI_REALTIME_MODEL` exposes a "Realtime" button that spins up a WebRTC session. The browser offers SDP to `/api/voice/sdp`, which exchanges it with OpenAI Realtime using the `OPENAI_REALTIME_MODEL` + `OPENAI_REALTIME_VOICE` env configuration. When realtime is unavailable or errors, the UI cleans up the peer connection and users can still fall back to the recording/transcription flow above.
- **Reference map** – for a guided tour of every top-level area, read [`docs/CODEMAP.md`](docs/CODEMAP.md); UI-specific breadcrumbs remain inline in [`src/App.jsx`](src/App.jsx) comments, and the charter assets the client references are all located under [`templates/`](templates/).

## Serverless API Reference (`/api`)
All routes are implemented as Vercel serverless functions. They rely on the environment variables summarised below.

| Variable | Used By | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | All OpenAI-powered routes | Required secret for the OpenAI SDK and Realtime REST calls. |
| `CHAT_MODEL` | `/api/chat` | Overrides the default chat/summarization model (`gpt-4o-mini`). |
| `CHAT_MAX_BODY` | `/api/chat` | Custom request body size limit (defaults to `10mb`). |
| `CHAT_MAX_DURATION` | `/api/chat` | Optional function timeout override in seconds. |
| `ATTACHMENT_CHUNK_TOKENS` | `/api/chat` | Approximate token budget per attachment chunk before summarization (defaults to `700`). |
| `ATTACHMENT_SUMMARY_TOKENS` | `/api/chat` | Token cap for each map/reduce summarization call (defaults to `250`). |
| `ATTACHMENT_PARALLELISM` | `/api/chat` | Maximum concurrent attachment chunk summaries (defaults to `3`). |
| `SMALL_ATTACHMENTS_TOKEN_BUDGET` | `/api/chat` | Inlines the full attachment text when total tokens stay under this value (defaults to `1200`). |
| `VITE_OPENAI_REALTIME_MODEL` | Vite client | If set, enables realtime UI and controls which model the client requests. |
| `OPENAI_REALTIME_MODEL` | `/api/voice/sdp` | Default realtime model when exchanging SDP with OpenAI (defaults to `gpt-realtime`). |
| `OPENAI_REALTIME_VOICE` | `/api/voice/sdp` | Preferred OpenAI voice when realtime is active (defaults to `alloy`). |
| `OPENAI_STT_MODEL` | `/api/transcribe` | Primary speech-to-text model (defaults to `gpt-4o-mini-transcribe`). |
| `FILES_LINK_SECRET` | `/api/charter/make-link`, `/api/charter/download`, `/api/charter/health` | Required secret used to sign and verify temporary charter download links (and detected by the health probe). Generate a 64-character hex string with `openssl rand -hex 32` or an equivalent secrets manager. |
| `FILE_TEXT_SIZE_LIMIT` | `/api/files/text` | Optional override for the file text extractor body size (defaults to `10mb`). |
| `CHAT_PROMPT_TOKEN_LIMIT` | `/api/chat` | Optional hard cap on combined prompt tokens before early rejection (defaults to unlimited). |
| `CHROME_EXECUTABLE_PATH`, `PUPPETEER_EXECUTABLE_PATH` | `/api/export/pdf`, `/api/charter/download` | Optional custom Chromium paths when the default bundled binary is unavailable in your runtime. |

### `POST /api/chat`
- **Payload** – `{ messages: [{ role: "system" | "user" | "assistant", content: string }], attachments?: [{ name: string, text: string }] }`. The frontend sends the running transcript without the system prompt, optionally pairing it with pre-parsed attachment excerpts.
- **Response** – `{ reply: string }`. Errors return `{ error }` with appropriate HTTP status codes.
- **Notes** – wraps `openai.chat.completions.create` with a concise system prompt tailored for PMO tone. Attachments are validated for non-empty text, summarized via a map/reduce pass (or inlined when under `SMALL_ATTACHMENTS_TOKEN_BUDGET` tokens), and the resulting bullet summary is prepended to the system prompt as `### {name}` sections.

### `POST /api/transcribe`
- **Payload** – `{ audioBase64: string, mimeType: string }` where `audioBase64` is the base64-encoded audio blob captured in the browser.
- **Response** – `{ text: string, transcript: string }` on success. 4xx/5xx responses surface `{ error, model }` when transcription fails.
- **Behavior** – validates MIME types, converts to a `File`, and first invokes the model from `OPENAI_STT_MODEL`; if OpenAI returns 400/404 it retries with `whisper-1` before surfacing the error.

### `POST /api/files/text`
- **Payload** – `{ name: string, mimeType: string, base64: string }`. Supported MIME types include PDF, DOCX, JSON, and plain text.
- **Response** – `{ ok: true, text, truncated, charCount, name, mimeType }` with sanitized names and trimmed text (up to ~20k characters). Requests over the body size limit return 413 with `{ ok: false, error }`.
- **Behavior** – Validates file type, decodes base64 safely, parses JSON/documents, and normalizes extracted text before attachments feed into chat or charter extraction. Calls reject DOC uploads so clients can convert to DOCX first.

### `POST /api/voice/sdp`
- **Payload** – `{ sdp: string, type: "offer" }` from the browser's `RTCPeerConnection`.
- **Response** – Raw SDP answer text suitable for `setRemoteDescription`.
- **Behavior** – forwards the SDP to OpenAI Realtime REST with the `Authorization` header sourced from `OPENAI_API_KEY`. Applies the `OpenAI-Beta: realtime=v1` header automatically when the chosen realtime model includes "preview".

### Charter automation endpoints
All endpoints live under `/api/charter` and share the same OpenAI key dependency when they call the API.

#### `POST /api/charter/extract`
- **Payload** – `{ docType, messages, voice, attachments, seed }` representing the active document type plus the latest chat, voice, and upload context to analyze. `docType` defaults to `"charter"`, `voice` is optional, `attachments` accepts `{ id, name, mime, size }` metadata, and `seed` carries the current draft so the extractor can preserve existing values.
- **Response** – JSON body generated by OpenAI that aligns to the schema rules (falls back to raw string if parsing fails).
- **Behavior** – loads [`templates/extract_prompt.txt`](templates/extract_prompt.txt) and prepends it as the system prompt before asking the model for structured charter data. Future doc types can switch prompts based on `docType` without changing the client flow.

#### `POST /api/charter/render`
- **Payload** – Structured charter object (e.g. `{ title, sponsor, risks, milestones, ... }`) whose keys correspond to the placeholders in the charter template stored at [`templates/project_charter_tokens.docx.b64`](templates/project_charter_tokens.docx.b64).
- **Response** – Streams a rendered `application/vnd.openxmlformats-officedocument.wordprocessingml.document` buffer with the filename `project_charter.docx`.
- **Behavior** – Uses Docxtemplater to inject data into the DOCX template, with paragraph and linebreak support enabled.

#### `POST /api/export/pdf`
- **Payload** – Same charter JSON shape accepted by the DOCX renderer.
- **Response** – Streams a polished PDF (`application/pdf`) with a generated-on timestamp and structured sections.
- **Behavior** – Validates input with Ajv, builds a pdfmake document definition with [`templates/pdf/charter.pdfdef.mjs`](templates/pdf/charter.pdfdef.mjs), and resolves the buffer through `pdfmake`'s in-memory renderer—no headless browser required.

#### `POST /api/charter/validate`
- **Payload** – Structured charter JSON object to validate.
- **Response** – `{ ok: true }` when the payload conforms to [`templates/charter.schema.json`](templates/charter.schema.json); otherwise `{ errors: AjvError[] }` with HTTP 400.
- **Behavior** – Compiles the schema once, augments Ajv with `ajv-formats`, and returns detailed validation errors to help highlight missing or malformed fields.

#### `POST /api/charter/make-link`
- **Payload** – `{ charter, baseName, formats? }` where `formats` is an optional array drawn from the supported exports (`docx`, `pdf`, `json`, `xlsx`, …). When omitted the handler falls back to `docx` and `pdf`.
- **Response** – `{ links, docx?, pdf?, expiresAt, expiresInSeconds }` with fully-qualified, signed download URLs. The legacy `docx`/`pdf` keys remain for backwards compatibility but the `links` map should be preferred so future formats (JSON, XLSX, etc.) flow through automatically.
- **Behavior** – Uses `FILES_LINK_SECRET` to sign tokens, constructs absolute URLs from `x-forwarded-proto` plus the request host, and ignores unsupported formats. Token payloads embed the normalized charter, sanitized filename base, and a 15-minute expiry. Callers should fall back to the health endpoint below when the secret is missing.

#### `GET /api/charter/download`
- **Query** – `format`, `token`, and `sig` parameters returned from `/api/charter/make-link`.
- **Response** – Streams the requested export; expired tokens return HTTP 410 (`{ error: "Download link expired" }`) and bad signatures return HTTP 403 (`{ error: "Invalid signature" }`).
- **Behavior** – Verifies the HMAC signature, ensures the embedded `exp` timestamp is still in the future, and surfaces template validation issues (status 400) with structured error metadata. Supports `docx`, `pdf`, and `json` natively; `xlsx` currently returns a `501 Not Implemented` placeholder via `templates/renderers.js`.

#### `GET /api/charter/health`
- **Response** – `{ ok: true, hasSecret: boolean }` so the UI can surface configuration issues in-chat when `FILES_LINK_SECRET` is unset.
- **Behavior** – Supports GET requests only and reads the secret directly from `process.env` without triggering link generation.

## Charter automation workflow
1. **Prompt + field rules** – The extraction step reads [`extract_prompt.txt`](templates/extract_prompt.txt) and is guided by the business constraints encoded in [`field_rules.json`](templates/field_rules.json) as well as the JSON schema in [`charter.schema.json`](templates/charter.schema.json). Customize these files to change tone, required sections, or value formats.
2. **Extraction** – `/api/charter/extract` (or a direct OpenAI call with the same prompt) produces draft charter JSON keyed to the schema. Downstream processes should assume optional sections may be empty and rely on schema validation before render.
3. **Validation** – Use `/api/charter/validate` inside the app or run the CLI helper for offline workflows:
   ```bash
   node templates/charter-validate.mjs ./path/to/charter.json
   ```
   The script prints success/failure along with human-readable Ajv errors. Because it loads the schema locally, no API access is required.
4. **Render** – Once validated, POST the charter object to `/api/charter/render` (or run a similar Node script) to merge values into the committed charter template (`templates/project_charter_tokens.docx.b64`). The endpoint decodes the base64 file, renders it, and returns a ready-to-share DOCX.
5. **Export/share** – Call `/api/export/pdf` for the styled PDF, or `/api/charter/make-link` to generate signed download URLs for DOCX/PDF/JSON (XLSX placeholder). `/api/charter/download` verifies signatures and streams the requested format on demand.

## Local development (Vite)
Prerequisites: Node.js 18+ and npm 9+. Populate `.env.local` with any client-side env values such as `VITE_OPENAI_REALTIME_MODEL` when testing realtime voice. When exercising the charter download endpoints locally, add `FILES_LINK_SECRET` to your environment (for example via `.env.local` or direct export) and set it to a long, random string.

```bash
export FILES_LINK_SECRET="$(openssl rand -hex 32)"
```

```bash
npm install
npm run dev
```

Open the printed localhost URL.

### Testing

- Run unit tests (Node's test runner):

  ```bash
  npm test
  ```

- Run the Playwright integration suite (spins up the minimal charter API test server):

  ```bash
  npm run test:e2e
  ```

  The first run requires installing Playwright's dependencies: `npx playwright install --with-deps`.
- Validate the DOCX template tokens before committing charter template changes:

  ```bash
  npm run validate:charter-docx
  ```

- After editing `templates/project_charter_tokens.docx`, regenerate the base64 store so the
  renderer picks up your changes:

  ```bash
  npm run docx:encode
  ```

## Deploying to Vercel or other hosts
1. Provision secrets – configure `OPENAI_API_KEY`, `OPENAI_STT_MODEL` (optional override), `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, and `FILES_LINK_SECRET` in your deployment environment. In Vercel, add them under **Project Settings → Environment Variables**; for other hosts, export them in the serverless runtime. Generate `FILES_LINK_SECRET` as a long, random string so signed charter links cannot be forged.
2. Ensure the platform supports Node 18+ and either native Vercel serverless runtime or an equivalent serverless adapter for `api/` routes (e.g., Netlify Functions, AWS Lambda). If you deploy outside Vercel, map the functions to their platform-specific entrypoints while preserving the route names above.
3. Build & serve – run `npm run build` locally or rely on the platform’s build step (Vercel auto-detects Vite). Serve the `dist/` output alongside the serverless handlers.
4. Optional realtime voice – verify the host allows outbound HTTPS requests to `https://api.openai.com/v1/realtime` and supports WebRTC if you proxy SDP. Without realtime env variables, the UI gracefully falls back to transcription-only voice capture.

## Where to add a real LLM
- The UI already POSTs to `/api/chat` through `src/App.jsx` → `callLLM(text, history, attachments)`. Update this helper if you want to call a different backend.
- Adjust `api/chat.js` to swap models, tweak prompts, or forward requests to another orchestration service.
- Keep the attachment summarization helpers in sync when changing models so token budgets and truncation behavior remain predictable.

## Notes
- Tailwind is preconfigured (see `tailwind.config.js`, `postcss.config.js`, and `src/index.css`).
- Background extraction is always on; `useBackgroundExtraction` debounces chat, voice, and attachment signals and keeps the editable preview in sync without overwriting manually locked fields.
- This is a UI-only prototype; no data persistence yet.
- Attachment picker resets after each upload so the same file can be reattached without refreshing. Removing the last attachment now clears stale charter previews to avoid confusion.
- Dark mode preference is stored under `localStorage['eva-theme-mode']` and respects the OS scheme when set to **Auto**.

## OpenAI Endpoint

This project includes a Vercel serverless function at **`/api/chat`** that calls the OpenAI API using the official Node SDK.

### Set your API key
In Vercel Project Settings → *Environment Variables*:
- `OPENAI_API_KEY` = your key

For local development, you can use Vercel CLI which reads `.vercel/.env.*` or you can export the var before running:

```bash
export OPENAI_API_KEY=sk-...    # macOS/Linux
setx OPENAI_API_KEY sk-...      # Windows (new shell required)
```

### Run locally with Vercel dev (recommended)
```bash
npm i -g vercel
vercel dev
```
This runs both the Vite frontend and the `/api/chat` function locally.

### How the frontend calls the endpoint
`src/App.jsx` → `callLLM(text)` makes a POST to `/api/chat` with a chat `messages` array. The server responds with `{ reply }` and the UI displays it.
