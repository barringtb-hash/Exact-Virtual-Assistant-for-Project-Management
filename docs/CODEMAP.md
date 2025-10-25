# Code Map

## Repository layout
- `src/` – React single-page client rendered by Vite + Tailwind.
- `api/` – Vercel-style serverless functions that power chat, speech, realtime voice, and charter automation.
- `templates/` – Prompt, schema, and DOCX assets used by the charter extraction/rendering pipeline.
- `public/` – Static assets served verbatim by Vite (currently minimal placeholder content).

## Frontend (`src/`)
- `src/App.jsx`
  - Owns application state for messages, draft input, attachment metadata, feature toggles, and charter preview data.
  - Provides helpers `callLLM`, `runAutoExtract`, and voice/transcription orchestration that call the API routes.
  - Renders chat composer, transcript, attachment chips, charter preview tabs, and realtime voice controls.
- `src/main.jsx`
  - Boots the React app, wraps it with Tailwind styles, and mounts onto `#root`.
- `src/index.css`
  - Tailwind base layers plus app-specific utility overrides (e.g., scroll containers, font smoothing).

## Serverless API (`api/`)
- `api/chat.js`
  - Validates POST requests, prepends a PMO-focused system prompt, truncates history, and calls `openai.chat.completions.create` to produce assistant replies.
- `api/transcribe.js`
  - Accepts base64 audio, enforces MIME whitelist, converts to a `File`, transcribes with `OPENAI_STT_MODEL` or falls back to Whisper, and returns `{ text, transcript }`.
- `api/voice/sdp.js`
  - Exchanges browser SDP offers with OpenAI Realtime, forwarding environment-selected model/voice and returning the SDP answer payload.
- `api/charter/extract.js`
  - Loads `templates/extract_prompt.txt`, builds an OpenAI chat completion request with the conversation transcript, and returns structured charter JSON.
- `api/charter/render.js`
  - Reads `templates/project_charter_tokens.docx`, merges provided charter data with Docxtemplater, and streams the generated DOCX file.
- `api/charter/validate.js`
  - Uses Ajv + `templates/charter.schema.json` to validate charter payloads, returning `{ ok: true }` or detailed validation errors.

## Templates (`templates/`)
- `extract_prompt.txt` – System prompt directing the model on how to populate charter fields.
- `field_rules.json` – Field-by-field constraints that guide downstream validation/UX messaging.
- `charter.schema.json` – JSON schema consumed by Ajv in validation.
- `project_charter_tokens.docx` – Docxtemplater template whose tokens match charter field keys.
- `charter-validate.mjs` – CLI helper to validate charter JSON offline against the shared schema.

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

### Charter extraction, validation, and rendering
1. User toggles auto-extraction or uploads supporting files; `runAutoExtract` orchestrates calls to `POST /api/charter/extract` with recent chat context.
2. `api/charter/extract.js` synthesizes structured charter data, which the client stores for preview.
3. Before exporting, the client can POST the draft to `POST /api/charter/validate` to ensure schema compliance.
4. Validated data is sent to `POST /api/charter/render`, which merges values into the DOCX template and responds with the downloadable charter document.

## Companion references
- [API endpoints](./API.md) – Request/response schemas, environment variables, and notable behaviors for every serverless route.
- [Charter workflow](./charter-workflow.md) – Detailed guidance on customizing prompts, templates, and validation assets.
