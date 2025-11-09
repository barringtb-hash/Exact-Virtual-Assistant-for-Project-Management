# Exact Virtual Assistant for Project Management

## Overview
The Exact Virtual Assistant for Project Management routes every request through an intent-gated document router that only extracts data when a human explicitly asks for it. Uploading files, speaking without a request, or sending chat messages that lack intent will never start extraction. Phase 1 centers on creating and updating project project charters while introducing a router-first design that can orchestrate multiple document types.

### Document router at a glance
- The router inspects user intent, then dispatches to document-specific pipelines for extraction, validation, and rendering.
- Charter, Design & Development Plan (DDP), and Statement of Work (SOW, placeholder) doc types are registered through [`templates/registry.js`](templates/registry.js).
- Explore the full workflow in [`docs/document-workflow.md`](docs/document-workflow.md) and the architecture deep-dive in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Supported document types
- **Charter (`charter`)** – Phase 1 acceptance path (see [`docs/demo/README.md`](docs/demo/README.md)).
- **Design & Development Plan (`ddp`)** – Router-enabled using prompts, schemas, and templates under [`templates/doc-types/ddp/`](templates/doc-types/ddp/); follow the walkthrough in [`docs/ddp/README.md`](docs/ddp/README.md).
- **Statement of Work (`sow`)** – Placeholder that remains disabled in the registry by default; see [`docs/sow/README.md`](docs/sow/README.md) for status updates.

### Guided charter flow
- The charter experience defaults to a guided chat that replaces the wizard UI, walks through each schema field sequentially, and pauses background extraction until the session finishes. The feature is enabled by `VITE_CHARTER_GUIDED_CHAT_ENABLED` and starts from the **Start Charter** button beneath the composer; set `VITE_CHARTER_GUIDED_BACKEND=on` to exercise the dedicated charter backend used by CI, then see [`docs/charter-guided-chat.md`](docs/charter-guided-chat.md) for behaviour, commands, and flag details. 【F:docs/charter-guided-chat.md†L1-L44】【F:docs/charter-guided-chat.md†L12-L22】【F:package.json†L13-L19】

## Intent-only extraction contract
- **Upload only** → No extraction. The preview remains unchanged and `/api/documents/extract` is never called.
- **Natural-language charter or DDP request** → Extraction runs exactly once per intent and populates the preview.
- **Server guardrails**:
  - Missing intent: `/api/documents/extract` responds with HTTP 400.
  - Missing context (no attachments or useful text): `/api/documents/extract` responds with HTTP 422.
- **Prompt guard**: [`templates/extract_prompt.txt`](templates/extract_prompt.txt) returns `{ "result": "no_op" }` when invoked without intent metadata.

## Quick Start
1. Clone the repo and install dependencies.
   ```bash
   git clone https://github.com/Exact-Sciences/Exact-Virtual-Assistant-for-Project-Management.git
   cd Exact-Virtual-Assistant-for-Project-Management
   npm install
   ```
2. Create `.env.local` with intent-only defaults and optional chat streaming toggle:
   ```bash
   cat <<'ENV' > .env.local
   INTENT_ONLY_EXTRACTION=true
   # Optional streaming switch used by /api/chat/stream
   CHAT_STREAMING=false
   ENV
   ```
3. Run the Vite dev server and open the printed URL:
   ```bash
   npm run dev
   ```
4. Follow the charter acceptance demo in [`docs/demo/README.md`](docs/demo/README.md) or the DDP flow in [`docs/ddp/README.md`](docs/ddp/README.md) to validate router behavior end to end.

## Configuration
Environment flags keep the router predictable across dev, preview, and production. See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for the complete table.

| Key | Purpose | Default |
| --- | --- | --- |
| `INTENT_ONLY_EXTRACTION` | Enforce explicit user intent before routing extraction. | `true` |
| `CHAT_STREAMING` | Enables the `/api/chat/stream` Edge handler. | `false` |
| `VITE_PREVIEW_CONDITIONAL_VISIBILITY` | Show preview panel only during active document sessions (when user starts charter or sends create/update intent). Set to `false` to always show the preview panel. | `true` |
| `OPENAI_API_KEY` (and related secrets) | Credentials consumed by serverless handlers. | _required_

## API
Document pipelines live behind the router-first API layer:
- `POST /api/documents/extract?docType=<type>` – Run the doc-type extraction pipeline when intent and context are present.
- `POST /api/documents/validate?docType=<type>` – Validate structured output using the registered schema.
- `POST /api/documents/render?docType=<type>` – Render a finished artifact with the encoded template.

Chat endpoints remain available for conversational assistance:
- `POST /api/chat` – Standard responses with optional streaming via the `stream` body flag.
- `POST /api/chat/stream` – Edge runtime SSE handler controlled by `CHAT_STREAMING`. Review streaming considerations below.

### Streaming considerations
- **Hosting** – `/api/chat/stream` runs on the Vercel Edge runtime and streams with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, and periodic keep-alives. Disable proxy buffering (for example, `proxy_buffering off;` in Nginx or AWS ALB idle timeout tweaks) so tokens flush immediately.
- **Client behaviour** – Browsers use SSE when available; the app automatically falls back to `fetch` + streaming readers to support environments without `EventSource` (for example, React Native or constrained browsers). Both paths expect newline-delimited events that end with `event: done`.
- **Configuration & rollback** – Set `CHAT_STREAMING=true` to route `/api/chat/stream` traffic; unset or set it to `false`/`0` to revert to the non-streaming `/api/chat` flow. You can also opt individual requests out by omitting `stream` in the body or the `?stream=1` query parameter.

## Architecture & Data Flow
The app ships with a React client, serverless API routes, and a template registry wired through a central document router. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for context, component breakdowns, and Mermaid diagrams. For implementation details, consult [`docs/CODEMAP.md`](docs/CODEMAP.md) and [`docs/document-workflow.md`](docs/document-workflow.md).

Key router touchpoints:
- [`src/utils/detectCharterIntent.js`](src/utils/detectCharterIntent.js) parses user messages and returns `{ docType: 'charter', action: 'create' | 'update', intentText }` when intent is detected.
- [`src/App.jsx`](src/App.jsx) routes matching intents to [`useBackgroundExtraction.trigger()`](src/hooks/useBackgroundExtraction.js) and prevents any automatic runs.
- [`src/hooks/useBackgroundExtraction.js`](src/hooks/useBackgroundExtraction.js) exposes a `trigger()` method only; it no longer debounces chat, attachment, or voice activity.
- [`api/documents/extract.js`](api/documents/extract.js) enforces explicit intent plus contextual attachments/text before calling OpenAI, then routes to validation and rendering handlers.
- [`templates/`](templates/) holds prompts, schemas, and encoded templates for every registered document type.

## Testing
- **Unit and integration** – Run `npm test` to execute the current suite.
- **End-to-end** – Use `npm run cy:open` or `npm run cy:run` for Cypress coverage, and `npm run test:e2e` for Playwright scenarios.
- **Guided charter** – `npm run e2e:guided` runs the guided chat Cypress suite; `npm run e2e:wizard` re-enables the wizard flags for regression checks. 【F:docs/charter-guided-chat.md†L46-L52】
- **Document acceptance** – Follow [`docs/demo/README.md`](docs/demo/README.md) for the charter flow and [`docs/ddp/README.md`](docs/ddp/README.md) for the DDP flow. Both paths should execute exactly one extraction per intent.
- **Regression coverage** – Ensure attaching files alone never issues a network call to `/api/documents/extract`, and that intent + upload flows call extraction exactly once.

## Operations & Support
Operational expectations, deployment notes, and rollback tips live in [`docs/OPERATIONS.md`](docs/OPERATIONS.md). Release cadence and template update workflows are captured in [`docs/RELEASE.md`](docs/RELEASE.md). For security posture (supported Node versions, vulnerability reporting, and hardening guidance) see [`docs/SECURITY.md`](docs/SECURITY.md).

File an issue or open a pull request with reproduction steps. Every change must preserve intent-only extraction, update relevant documentation/tests, and pass the docs link validation job.
