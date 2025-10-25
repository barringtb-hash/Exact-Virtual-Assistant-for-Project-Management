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
    ]
  }
  ```
- **Response**
  ```json
  {
    "reply": "Assistant response"
  }
  ```
- **Notes**
  - Prepends a project-management system prompt and trims history to the most recent 18 messages.
  - Uses `gpt-4o-mini` with `temperature: 0.3` for consistent tone.

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

## Charter extraction – `POST /api/charter/extract`
- **Body**
  ```json
  {
    "messages": [
      { "role": "user", "content": "Project kickoff notes..." }
    ],
    "attachments": [
      {
        "name": "Vision Brief",
        "mimeType": "application/pdf",
        "text": "Trimmed file contents..."
      }
    ]
  }
  ```
- **Response** – JSON object whose keys align with `templates/charter.schema.json` (falls back to raw string when parsing fails).
- **Notes**
  - Prepends the system prompt from `templates/extract_prompt.txt`. When attachments are present, the handler builds a leading block where each entry becomes `### {name}\n{text}` before the base prompt so the model reads attachment context first.
  - `attachments` is optional. Each object must include a `text` field (trimmed to ~20k characters before submission), along with descriptive `name`/`mimeType` metadata that mirrors the upload.
  - Use the response as input to validation/rendering endpoints.

## Charter validation – `POST /api/charter/validate`
- **Body** – Charter JSON object to validate.
- **Response**
  ```json
  { "ok": true }
  ```
  or
  ```json
  {
    "errors": [
      { "instancePath": "/risks/0", "message": "should be string", ... }
    ]
  }
  ```
- **Notes**
  - Compiles `templates/charter.schema.json` with Ajv + `ajv-formats`.
  - Suitable for both frontend validation and offline CLI workflows.

## Charter rendering – `POST /api/charter/render`
- **Body** – Validated charter JSON with fields matching tokens in `templates/project_charter_tokens.docx`.
- **Response** – Binary DOCX buffer streamed with `Content-Disposition: attachment; filename=project_charter.docx`.
- **Notes**
  - Large payloads up to 10 MB are supported via the endpoint's body parser limit.
  - The caller is responsible for prompting downloads (`URL.createObjectURL` on the frontend) or forwarding to storage.

## Upload & extraction guidance
- **Size guardrails** – File uploads larger than 10 MB are rejected; after parsing, text is trimmed to roughly 20k characters. Downstream charter extraction expects callers to honor those limits (surface truncation warnings to users if `truncated: true`).
- **Suggested client flow**
  1. Upload each supporting document to `POST /api/files/text` to normalize MIME types and capture the extracted, trimmed text payload.
  2. Pass the resulting `{ name, mimeType, text }` objects as the `attachments` array when calling `POST /api/charter/extract`, alongside any chat transcript messages.
  3. Feed the charter JSON into `/api/charter/validate` and `/api/charter/render` as needed.
  4. Persist attachments/charters on the client or in external storage—these endpoints do not store state between requests.
