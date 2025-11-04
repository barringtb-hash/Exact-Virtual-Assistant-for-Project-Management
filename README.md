# Exact Virtual Assistant for Project Management

## Overview
The Exact Virtual Assistant for Project Management extracts project documents only when asked in plain English (typed or voice). Uploading files, speaking without a request, or sending chat messages that lack intent will never start extraction. This repo tracks the Phase 1 assistant experience that focuses on creating and updating project charters.

## Quick Start
1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/Exact-Sciences/Exact-Virtual-Assistant-for-Project-Management.git
   cd Exact-Virtual-Assistant-for-Project-Management
   npm install
   ```
2. Set the environment flag for intent-only extraction (defaults to `true` but should be explicit in local `.env.local`):
   ```bash
   echo "INTENT_ONLY_EXTRACTION=true" >> .env.local
   ```
3. Configure the charter finalization template identifiers for Google Drive:
   ```bash
   echo "GOOGLE_DRIVE_CHARTER_TEMPLATE_ID=your-template-doc-id" >> .env.local
   echo "GOOGLE_DRIVE_CHARTER_DESTINATION_FOLDER_ID=your-destination-folder-id" >> .env.local
   ```
   These values point to the Google Doc template that will be copied during charter finalization and the Drive folder where generated charters should be stored.
4. Run the Vite dev server and open the printed URL:
   ```bash
   npm run dev
   ```
5. Attach the demo Target Product Profile (TPP) – **OncoLiquid ctDNA Assay (Demo)** – from [`docs/demo/`](docs/demo/) and type or speak:
   > Please create a project charter from the attached document.

   **Expected**: the preview panel populates charter fields (Project Title, Sponsor, Project Manager, Objectives, etc.) using data extracted from the TPP.

## Charter Finalization Environment

Generating a Google Doc charter requires two Google Drive identifiers:

- `GOOGLE_DRIVE_CHARTER_TEMPLATE_ID` – the document ID for the charter template to copy.
- `GOOGLE_DRIVE_CHARTER_DESTINATION_FOLDER_ID` – the Drive folder ID where finalized charters are created.

Set these values in `.env.local` for local development or the hosting provider’s environment settings so `/api/charter/finalize` can duplicate and share documents successfully.

## Behavioral Contract
- **Upload only** → No extraction. The preview remains unchanged and `/api/documents/extract` is never called.
- **Natural-language charter request** → Extraction runs exactly once per intent and populates the preview.
- **Server guardrails**:
  - Missing intent: `/api/documents/extract` responds with HTTP 400.
  - Missing context (no attachments or useful text): `/api/documents/extract` responds with HTTP 422.
- **Prompt guard**: [`templates/extract_prompt.txt`](templates/extract_prompt.txt) returns `{ "result": "no_op" }` when invoked without intent metadata.

## Natural-language Triggers
Examples that **do** trigger extraction:
- “Create a project charter from the attached file.”
- “Draft a project charter using the TPP I just uploaded.”
- “Update the project charter using the latest scope.”

Examples that **do not** trigger extraction:
- “I uploaded the TPP.” (Missing request to create or update a charter.)
- “What’s next?” (General chat without project charter intent.)

## Architecture Basics
- [`src/utils/detectCharterIntent.js`](src/utils/detectCharterIntent.js) parses user messages and returns `{ docType: 'charter', action: 'create' | 'update', intentText }` when intent is detected.
- [`src/App.jsx`](src/App.jsx) routes matching intents to [`useBackgroundExtraction.trigger()`](src/hooks/useBackgroundExtraction.js) and prevents any automatic runs.
- [`src/hooks/useBackgroundExtraction.js`](src/hooks/useBackgroundExtraction.js) exposes a `trigger()` method only; it no longer debounces chat, attachment, or voice activity.
- [`api/documents/extract.js`](api/documents/extract.js) enforces explicit intent plus contextual attachments/text before calling OpenAI.
- [`templates/extract_prompt.txt`](templates/extract_prompt.txt) short-circuits with `{ "result": "no_op" }` when called without intent, ensuring downstream tools remain idle.

## API usage

### Chat completions – `POST /api/chat`
- **Non-streaming request**
  ```bash
  curl -X POST http://localhost:5173/api/chat \
    -H "Content-Type: application/json" \
    -d '{
      "messages": [
        { "role": "user", "content": "Summarize the current risks." }
      ],
      "attachments": [
        { "name": "Risk Log", "text": "Escalation owners and deadlines..." }
      ]
    }'
  ```
- **Non-streaming response**
  ```json
  {
    "reply": "Here are the active risks and owners..."
  }
  ```
- **Body toggle for SSE streaming** – pass `"stream": true` together with a unique `clientStreamId`/`threadId` pair to receive server-sent events (SSE) from the same route.
  ```json
  {
    "messages": [
      { "role": "user", "content": "Draft the next project update." }
    ],
    "stream": true,
    "clientStreamId": "composer-123",
    "threadId": "run-abc"
  }
  ```
  Events arrive as `event: token` with JSON `{ "delta": "partial text" }` chunks, followed by `event: done` when the assistant finishes.

### Chat streaming edge endpoint – `POST /api/chat/stream`
- **Enablement** – set `CHAT_STREAMING=true` (or append `?stream=1` to the URL) to allow the dedicated Edge runtime handler to respond. The route requires `threadId`, `clientStreamId`, and the same JSON body as `/api/chat`.
- **Request example**
  ```bash
  curl -N -X POST "https://your-host/api/chat/stream?stream=1" \
    -H "Content-Type: application/json" \
    -d '{
      "threadId": "run-abc",
      "clientStreamId": "composer-123",
      "messages": [
        { "role": "user", "content": "List the open action items." }
      ]
    }'
  ```
- **Response stream** – the handler emits SSE frames such as:
  ```text
  event: token
  data: {"delta":"Action item 1:"}

  event: token
  data: {"delta":" Assign owners"}

  event: done
  data: {}
  ```

### Document extraction – `POST /api/documents/extract`
- **Request**
  ```bash
  curl -X POST http://localhost:5173/api/documents/extract \
    -H "Content-Type: application/json" \
    -d '{
      "docType": "charter",
      "messages": [
        { "role": "user", "content": "Create a project charter from the attachment." }
      ],
      "attachments": [
        {
          "id": "file_123",
          "name": "Onboarding Plan",
          "mimeType": "application/pdf",
          "text": "Trimmed excerpt..."
        }
      ]
    }'
  ```
- **Response**
  ```json
  {
    "project_name": "Data Platform Modernization",
    "sponsor": "Emily Carter",
    "objectives": ["Unify analytics", "Retire legacy ETL"],
    "risks": [
      { "description": "Vendor integration backlog", "owner": "PMO" }
    ]
  }
  ```

### Streaming considerations
- **Hosting** – `/api/chat/stream` runs on the Vercel Edge runtime and streams with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, and periodic keep-alives. Disable proxy buffering (for example, `proxy_buffering off;` in Nginx or AWS ALB idle timeout tweaks) so tokens flush immediately.
- **Client behaviour** – browsers use SSE when available; the app automatically falls back to `fetch` + streaming readers to support environments without `EventSource` (for example, React Native or constrained browsers). Both paths expect newline-delimited events that end with `event: done`.
- **Configuration & rollback** – set `CHAT_STREAMING=true` to route `/api/chat/stream` traffic; unset or set it to `false`/`0` to revert to the non-streaming `/api/chat` flow. You can also opt individual requests out by omitting `stream` in the body or the `?stream=1` query parameter.

## Testing
- **Upload-only regression**: Use [`tests/onFileAttached.test.js`](tests/onFileAttached.test.js) (or create an equivalent) to assert that attaching files alone does **not** issue a network call to `/api/documents/extract`.
- **Intent + upload flow**: Add or update a test (for example `tests/intentExtraction.test.js`) to simulate attaching the demo TPP and sending “Please create a project charter from the attached document,” then assert exactly one call to `/api/documents/extract` with `intent: 'create_charter'`.
- **Acceptance validation**: Follow [`docs/demo/README.md`](docs/demo/README.md) to run the demo end-to-end with the OncoLiquid ctDNA Assay (Demo) TPP and verify the extracted fields in the preview.

## Breaking Changes / Migration Notes
- **Removed**: All automatic extraction pathways, the Summarize/“Sync now” buttons, and any background triggers tied to uploads or voice activity.
- **New requirement**: Explicit natural-language intent is mandatory. Ensure `.env.local` (client) and serverless environments set `INTENT_ONLY_EXTRACTION=true`.
- **Server behavior**: `/api/documents/extract` now rejects requests that lack intent or context; legacy clients relying on auto extraction must be updated to send intent metadata.
- **Prompt behavior**: The extract prompt returns `{ "result": "no_op" }` without intent so downstream automation tools can safely ignore idle invocations.
- **Documentation**: See [`CHANGELOG.md`](CHANGELOG.md) for the full entry and [`docs/CODEMAP.md`](docs/CODEMAP.md) for updated flow diagrams.

## Additional References
- [`docs/CODEMAP.md`](docs/CODEMAP.md) – Updated end-to-end architecture and trigger flow.
- [`docs/document-workflow.md`](docs/document-workflow.md) – Customizing prompts, schemas, and renderers for charter and future document types.
- [`docs/demo/README.md`](docs/demo/README.md) – Canonical acceptance test path using the OncoLiquid ctDNA Assay (Demo) TPP.
- [`templates/`](templates/) – Prompt, schema, and template assets consumed by extraction, validation, and rendering.

## Support
File an issue or open a pull request with reproduction steps. Every change must preserve intent-only extraction and include updates to documentation/tests where applicable.
