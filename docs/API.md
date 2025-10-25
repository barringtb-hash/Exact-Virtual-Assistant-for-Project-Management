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
    ]
  }
  ```
- **Response** – JSON object whose keys align with `templates/charter.schema.json` (falls back to raw string when parsing fails).
- **Notes**
  - Prepends the system prompt from `templates/extract_prompt.txt`.
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
