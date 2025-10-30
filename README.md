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
3. Run the Vite dev server and open the printed URL:
   ```bash
   npm run dev
   ```
4. Attach the demo Target Product Profile (TPP) – **OncoLiquid ctDNA Assay (Demo)** – from [`docs/demo/`](docs/demo/) and type or speak:
   > Please create a project charter from the attached document.

   **Expected**: the preview panel populates charter fields (Project Title, Sponsor, Project Manager, Objectives, etc.) using data extracted from the TPP.

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
