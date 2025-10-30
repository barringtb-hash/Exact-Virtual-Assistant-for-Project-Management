# API Reference

All backend logic is implemented as Vercel-style serverless functions under `/api`. Every route requires `OPENAI_API_KEY` unless noted otherwise.

## Common conventions
- **Error shape** – Routes return `{ error: string }` (and optional metadata) with a non-2xx status when failures occur.
- **CORS** – Handled implicitly by the hosting platform; these handlers expect same-origin calls from the Vite frontend.
- **Authentication** – None yet. Add middleware in these handlers or place an API gateway in front before production use.

## Chat completions – `POST /api/chat`
- **Body**
  ```json
  {
    "messages": [
      { "role": "user", "content": "..." }
    ],
    "attachments": [
      { "name": "Vision Brief", "text": "Trimmed excerpt..." }
    ]
  }
  ```
  `attachments` is optional and should contain the trimmed text for each supporting file you want the assistant to reference.
- **Response**
  ```json
  {
    "reply": "Assistant response"
  }
  ```
- **Notes**
  - Prepends a project-management system prompt and trims history to the most recent 18 messages.
  - Validates each attachment, enforcing non-empty `text` values and a 4,000-character cap before summarizing oversized files via a map/reduce pass (`lib/tokenize.js`). Attachments that fit under `SMALL_ATTACHMENTS_TOKEN_BUDGET` are inlined verbatim as `### {name}` sections above the base instructions (names default to "Attachment {n}" when omitted).
  - Honors `CHAT_PROMPT_TOKEN_LIMIT` when set—payloads exceeding the token budget return a `400` with an explanatory error.
  - Uses the Responses API when the configured model matches `gpt-4o`/`gpt-4.1` families; otherwise falls back to Chat Completions with `temperature: 0.3` for consistent tone.

## Speech-to-text – `POST /api/transcribe`
- **Body**
  ```json
  {
    "audioBase64": "<base64 string>",
    "mimeType": "audio/webm"
  }
  ```
- **Response**
  ```json
  {
    "text": "Transcript",
    "transcript": "Transcript"
  }
  ```
- **Notes**
  - Allowed MIME types: `audio/webm`, `audio/mp3`, `audio/mpeg`, `audio/mp4`, `audio/m4a`, `audio/wav`.
  - Tries the model specified by `OPENAI_STT_MODEL` (defaults to `gpt-4o-mini-transcribe`); on 400/404 errors it retries with `whisper-1`.
  - Errors include `{ error, model }` to signal which engine failed.

## File text extraction – `POST /api/files/text`
- **Body**
  ```json
  {
    "name": "Project Charter.pdf",
    "mimeType": "application/pdf",
    "base64": "<base64 file contents>"
  }
  ```
- **Response**
  ```json
  {
    "ok": true,
    "name": "Project Charter.pdf",
    "mimeType": "application/pdf",
    "charCount": 18432,
    "text": "Extracted text...",
    "truncated": false
  }
  ```
- **Notes**
  - Supported MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, and `application/json`. Legacy `application/msword` uploads are rejected so callers can convert to DOCX first.
  - Payloads over 10 MB are rejected (tunable via `FILE_TEXT_SIZE_LIMIT`).
  - Text responses are trimmed to ~20k characters; `truncated: true` signals that callers should surface a warning or request a smaller file.
  - Errors follow `{ ok: false, error, ... }` with optional metadata such as `name`/`mimeType` describing the rejected file.
  - JSON uploads are parsed/pretty-printed. Invalid JSON returns a 400 with `error: "Invalid JSON payload"`.
  - Returned `name` values are sanitized (defaults to `untitled`) so clients can safely echo them in the UI, and repeated uploads of the same document work because callers now send fresh file input events each time.

## Realtime voice exchange – `POST /api/voice/sdp`
- **Body**
  ```json
  {
    "sdp": "v=0...",
    "type": "offer"
  }
  ```
- **Response** – Raw SDP answer string to feed `setRemoteDescription`.
- **Notes**
  - Model defaults to `OPENAI_REALTIME_MODEL` or `gpt-realtime`.
  - Voice defaults to `OPENAI_REALTIME_VOICE` or `alloy`.
  - Adds `OpenAI-Beta: realtime=v1` automatically when the model name contains `preview`.

## Document extraction – `POST /api/documents/extract`
- **Body**
  ```json
  {
    "docType": "charter",
    "messages": [
      { "role": "user", "content": "Project kickoff notes..." }
    ],
    "voice": [
      { "id": "evt_1", "text": "Latest transcript text", "timestamp": 1715909745123 }
    ],
    "attachments": [
      {
        "id": "file_123",
        "name": "Vision Brief",
        "mimeType": "application/pdf",
        "text": "Trimmed attachment excerpt..."
      }
    ],
    "seed": {
      "project_name": "Data Platform Modernization",
      "sponsor": "Emily Carter"
    }
  }
  ```
  `docType` selects the prompt/schema pair. Supported values are listed in [`lib/doc/registry.js`](../lib/doc/registry.js) (`charter`, `ddp`, …). `attachments` must include a `text` excerpt (up to ~20k characters are considered) so the extractor can build context; additional metadata like `mimeType` or `name` is optional but encouraged. `voice` should be an array of transcript events with `text` (and optionally `timestamp` in milliseconds) in the order they were captured. `seed` should contain the current draft so the extractor can retain known values and fill gaps.
- **Response** – JSON object whose keys align with the selected schema (falls back to `{ "result": "…" }` when parsing fails).
- **Notes**
  - Prepends the system prompt registered for the doc type before requesting structured data from OpenAI.
  - Returns normalized JSON when the model emits a valid object; downstream callers should merge the payload with manual edits, skipping locked fields.
  - `voice` is optional and should include the consolidated transcript of the latest recording.
  - **Legacy alias:** `POST /api/charter/extract` proxies to this handler with `docType=charter`.

## Document validation – `POST /api/documents/validate`
- **Body** – JSON object that matches the schema for the requested document type (pass `docType` as a query string or property in the body).
- **Response**
  ```json
  { "ok": true }
  ```
  or
  ```json
  {
    "errors": [
      { "instancePath": "/risks/0", "message": "should be string" }
    ]
  }
  ```
- **Notes**
  - Compiles the doc-type-specific schema with Ajv + `ajv-formats` and, when available, leverages field rules for better error messages.
  - Suitable for frontend validation and offline CLI workflows alike.
  - **Legacy alias:** `POST /api/charter/validate` forwards to this route with `docType=charter`.

## Document rendering – `POST /api/documents/render`
- **Body** – Validated JSON payload for the requested doc type.
- **Response** – Binary DOCX buffer streamed with a filename defined by the doc-type configuration (for example, `project_charter.docx`, `design_development_plan.docx`).
- **Notes**
  - Large payloads up to 10 MB are supported via the endpoint's body parser limit.
  - Renderer preprocessors can normalize/expand payloads before Docxtemplater runs (see `lib/doc/registry.js`).
  - The caller is responsible for prompting downloads (`URL.createObjectURL` on the frontend) or forwarding to storage.
  - **Legacy alias:** `POST /api/charter/render` forwards to this route with `docType=charter`.

## Charter PDF export – `POST /api/export/pdf`
- **Body** – Charter JSON matching the schema consumed by `/api/charter/render`.
- **Response** – Binary PDF buffer streamed with `Content-Disposition: attachment; filename=project_charter.pdf`.
- **Note** – The request/response contract is unchanged, but rendering now uses pdfmake with [`templates/pdf/charter.pdfdef.mjs`](../templates/pdf/charter.pdfdef.mjs) so the runtime no longer depends on Chromium.
- **Notes**
  - Uses `validateCharterPayload` (Ajv) before rendering; invalid payloads return `400` with structured error data identical to the DOCX handler.
  - Builds the pdfmake document definition from [`templates/pdf/charter.pdfdef.mjs`](../templates/pdf/charter.pdfdef.mjs) and renders entirely in-memory with `pdfmake`.

## Charter share links – `POST /api/charter/make-link`
- **Body**
  ```json
  {
    "charter": { "title": "Project Charter", "sponsor": "..." },
    "baseName": "Project_Charter_v1.0",
    "formats": ["docx", "pdf", "json"]
  }
  ```
- **Response**
  ```json
  {
    "links": {
      "docx": "https://example.com/api/charter/download?format=docx&token=...",
      "pdf": "https://example.com/api/charter/download?format=pdf&token=..."
    },
    "docx": "https://example.com/api/charter/download?format=docx&token=...",
    "pdf": "https://example.com/api/charter/download?format=pdf&token=...",
    "expiresAt": 1712085234,
    "expiresInSeconds": 900
  }
  ```
- **Notes**
  - Builds fully-qualified URLs using `x-forwarded-proto` and `req.headers.host`, so links pasted into chat work outside the hosting shell.
  - Signs the download payload with `FILES_LINK_SECRET` and includes an `exp` timestamp (epoch seconds) that expires 15 minutes after issuance.
  - The `formats` array is optional; when omitted the handler falls back to `docx` + `pdf`. Unsupported values are ignored.
  - The flattened `docx`/`pdf` keys remain for backward compatibility, but callers should prefer the `links` map so new formats (such as `json` or `xlsx`) flow through automatically.
  - Token payloads store the normalized charter and sanitized filename base. Use `/api/charter/normalize` server-side if you need to reproduce the payload structure.
  - Callers should surface a friendly message when the route fails because `FILES_LINK_SECRET` is missing; see the health endpoint below.

## Charter download – `GET /api/charter/download`
- **Query** – `format=<docx|pdf|json|...>&token=<signed payload>&sig=<hmac>` returned by `/api/charter/make-link`.
- **Response** – Streams the requested export format (`Content-Type`/`Content-Disposition` are derived from the format handler).
- **Notes**
  - Rejects requests when the signature fails (`403`) or when the embedded `exp` is earlier than the current epoch second (`410` with `{ error: "Download link expired" }`).
  - Returns `400` for unsupported formats and surfaces template validation errors with structured details so the UI can highlight the field failures.
  - Exposes consistent filenames that mirror the sanitized `baseName` supplied during link creation.
  - Format handlers cover DOCX (Docxtemplater), PDF (pdfmake), and JSON (plain buffer). XLSX responses delegate to `templates/renderers.js`, which currently throws a `FormatNotImplementedError` (`501`).

## Charter link health – `GET /api/charter/health`
- **Response**
  ```json
  { "ok": true, "hasSecret": false }
  ```
- **Notes**
  - Allows the frontend to detect misconfiguration (missing `FILES_LINK_SECRET`) and show actionable guidance inside the chat instead of surfacing opaque errors.
  - Non-GET methods receive `405 Method Not Allowed`.

## Upload & extraction guidance
- **Size guardrails** – File uploads larger than 10 MB are rejected; after parsing, text is trimmed to roughly 20k characters. Downstream charter extraction expects callers to honor those limits (surface truncation warnings to users if `truncated: true`).
- **Suggested client flow**
  1. Upload each supporting document to `POST /api/files/text` to normalize MIME types and capture the extracted, trimmed text payload.
  2. Pass the resulting `{ name, mimeType, text }` objects as the `attachments` array when calling `POST /api/documents/extract` (or the charter alias) alongside any chat transcript messages.
  3. Feed the structured JSON into `/api/documents/validate` and `/api/documents/render` (or the `/api/charter/*` aliases) as needed.
  4. Persist attachments/charters on the client or in external storage—these endpoints do not store state between requests.
