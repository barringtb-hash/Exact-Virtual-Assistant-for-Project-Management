# Exact Virtual Assistant for Project Management (Phase 1)

A minimal React + Tailwind prototype with a center chat window, file attach button, and a right-hand preview panel. Recent UI polish includes a persistent dark mode toggle, smoother transcript autoscroll, and hardened attachment handling so re-uploading the same document works reliably.

## Architecture Overview
- **Client shell (`src/App.jsx`)** – orchestrates chat history, attachment state, the right-hand charter preview selector, and feature toggles for LLM, auto-extraction, and the light/dark/auto appearance mode. The UI is a single-page React composition rendered through Tailwind utility classes; icons are inlined SVG components for zero extra dependencies. New chat render effects automatically scroll to the latest exchange while preserving focus for keyboard input.
- **Message flow** – user input is pushed into local state, optionally sent to `/api/chat`, and the assistant response is appended back into the transcript. The composer now includes a lightweight command router so phrases like “share links,” “download docx,” or “export pdf” skip the LLM hop and immediately trigger charter validation plus export link generation within the chat transcript. Attachments are stored in memory and routed through a mocked `runAutoExtract` helper that can be replaced with real parsers.
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
| `FILES_LINK_SECRET` | `/api/charter/make-link`, `/api/charter/download`, `/api/charter/health` | Required secret used to sign and verify temporary charter download links (and detected by the health probe). |

### `POST /api/chat`
- **Payload** – `{ messages: [{ role: "system" | "user" | "assistant", content: string }], attachments?: [{ name: string, text: string }] }`. The frontend sends the running transcript without the system prompt, optionally pairing it with pre-parsed attachment excerpts.
- **Response** – `{ reply: string }`. Errors return `{ error }` with appropriate HTTP status codes.
- **Notes** – wraps `openai.chat.completions.create` with a concise system prompt tailored for PMO tone. Attachments are validated for non-empty text, summarized via a map/reduce pass (or inlined when under `SMALL_ATTACHMENTS_TOKEN_BUDGET` tokens), and the resulting bullet summary is prepended to the system prompt as `### {name}` sections.

### `POST /api/transcribe`
- **Payload** – `{ audioBase64: string, mimeType: string }` where `audioBase64` is the base64-encoded audio blob captured in the browser.
- **Response** – `{ text: string, transcript: string }` on success. 4xx/5xx responses surface `{ error, model }` when transcription fails.
- **Behavior** – validates MIME types, converts to a `File`, and first invokes the model from `OPENAI_STT_MODEL`; if OpenAI returns 400/404 it retries with `whisper-1` before surfacing the error.

### `POST /api/voice/sdp`
- **Payload** – `{ sdp: string, type: "offer" }` from the browser's `RTCPeerConnection`.
- **Response** – Raw SDP answer text suitable for `setRemoteDescription`.
- **Behavior** – forwards the SDP to OpenAI Realtime REST with the `Authorization` header sourced from `OPENAI_API_KEY`. Applies the `OpenAI-Beta: realtime=v1` header automatically when the chosen realtime model includes "preview".

### Charter automation endpoints
All endpoints live under `/api/charter` and share the same OpenAI key dependency when they call the API.

#### `POST /api/charter/extract`
- **Payload** – `{ messages: [{ role, content | text }] }` representing the chat context to analyze.
- **Response** – JSON body generated by OpenAI that aligns to the schema rules (falls back to raw string if parsing fails).
- **Behavior** – loads [`templates/extract_prompt.txt`](templates/extract_prompt.txt) and prepends it as the system prompt before asking the model for structured charter data.

#### `POST /api/charter/render`
- **Payload** – Structured charter object (e.g. `{ title, sponsor, risks, milestones, ... }`) whose keys correspond to the placeholders in [`templates/project_charter_tokens.docx`](templates/project_charter_tokens.docx).
- **Response** – Streams a rendered `application/vnd.openxmlformats-officedocument.wordprocessingml.document` buffer with the filename `project_charter.docx`.
- **Behavior** – Uses Docxtemplater to inject data into the DOCX template, with paragraph and linebreak support enabled.

#### `POST /api/charter/validate`
- **Payload** – Structured charter JSON object to validate.
- **Response** – `{ ok: true }` when the payload conforms to [`templates/charter.schema.json`](templates/charter.schema.json); otherwise `{ errors: AjvError[] }` with HTTP 400.
- **Behavior** – Compiles the schema once, augments Ajv with `ajv-formats`, and returns detailed validation errors to help highlight missing or malformed fields.

#### `POST /api/charter/make-link`
- **Payload** – `{ charter, baseName, only }` where `only` can be `"docx"`, `"pdf"`, or omitted to request both links.
- **Response** – `{ docx, pdf, exp }` with fully-qualified, signed download URLs. The `exp` field is expressed in epoch seconds (15-minute TTL by default).
- **Behavior** – Uses `FILES_LINK_SECRET` to sign tokens, constructs absolute URLs from `x-forwarded-proto` plus the request host, and returns only the formats requested. Callers should fall back to the health endpoint below when the secret is missing.

#### `GET /api/charter/download`
- **Query** – `token` parameter returned from `/api/charter/make-link`.
- **Response** – Streams the requested DOCX or PDF; expired or invalid tokens return HTTP 403 with `{ error: "Link expired" }`.
- **Behavior** – Verifies the HMAC signature and ensures the embedded `exp` timestamp is still in the future before streaming the file contents.

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
4. **Render** – Once validated, POST the charter object to `/api/charter/render` (or run a similar Node script) to merge values into [`project_charter_tokens.docx`](templates/project_charter_tokens.docx). The output is a ready-to-share DOCX.

## Local development (Vite)
Prerequisites: Node.js 18+ and npm 9+. Populate `.env.local` with any client-side env values such as `VITE_OPENAI_REALTIME_MODEL` when testing realtime voice. When exercising the charter download endpoints locally, add `FILES_LINK_SECRET` to your environment (for example via `.env.local` or direct export) and set it to a long, random string.

```bash
npm install
npm run dev
```

Open the printed localhost URL.

## Deploying to Vercel or other hosts
1. Provision secrets – configure `OPENAI_API_KEY`, `OPENAI_STT_MODEL` (optional override), `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, and `FILES_LINK_SECRET` in your deployment environment. In Vercel, add them under **Project Settings → Environment Variables**; for other hosts, export them in the serverless runtime. Generate `FILES_LINK_SECRET` as a long, random string so signed charter links cannot be forged.
2. Ensure the platform supports Node 18+ and either native Vercel serverless runtime or an equivalent serverless adapter for `api/` routes (e.g., Netlify Functions, AWS Lambda). If you deploy outside Vercel, map the functions to their platform-specific entrypoints while preserving the route names above.
3. Build & serve – run `npm run build` locally or rely on the platform’s build step (Vercel auto-detects Vite). Serve the `dist/` output alongside the serverless handlers.
4. Optional realtime voice – verify the host allows outbound HTTPS requests to `https://api.openai.com/v1/realtime` and supports WebRTC if you proxy SDP. Without realtime env variables, the UI gracefully falls back to transcription-only voice capture.

## Where to add a real LLM
- See `src/App.jsx` → `callLLM(text)` — currently returns a mocked reply.
- Replace with a real fetch to `/api/chat` or your preferred endpoint.
- For Vercel Functions, create `api/chat.js` at the repo root and return `{ reply: string }`.

## Notes
- Tailwind is preconfigured (see `tailwind.config.js`, `postcss.config.js`, and `src/index.css`).
- The “Auto-extract (beta)” toggle is wired to a mocked filename-based extractor. Swap in a real parser later.
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
