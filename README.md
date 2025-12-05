# Exact Virtual Assistant for Project Management

## Overview
The Exact Virtual Assistant for Project Management uses an LLM-powered document analysis system that intelligently classifies uploaded documents and suggests appropriate extraction targets. When `DOCUMENT_ANALYSIS_ENABLED=true` (default), the system automatically analyzes uploaded files, presents classification results with confidence scores, and waits for user confirmation before extracting data. The application supports creating and updating project charters, Design & Development Plans (DDP), and other document types through a router-first design.

When `DOCUMENT_ANALYSIS_ENABLED=false`, the system reverts to intent-gated extraction that only extracts data when a human explicitly asks for it via natural language.

### Project Status
The codebase has undergone a comprehensive 6-phase refactoring effort (completed Nov 2025) that addressed 37 architectural, performance, and code quality issues. Key improvements include:
- Unified state management using the tinyStore pattern with slices, selectors, and persistence
- Consolidated API routing (removed redundant layers)
- TypeScript migration for core state and type definitions
- Normalized state patterns for chat messages and voice transcripts

Historical documentation from the refactoring effort is archived in [`docs/archive/`](docs/archive/).

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

### Document review
- AI-powered document review evaluates charters and DDPs across six quality dimensions (completeness, specificity, feasibility, risk coverage, scope clarity, metric measurability) and provides prioritized, actionable feedback. Use the **Review Charter** button in the preview panel to trigger a review; optionally enable `VITE_REQUIRE_REVIEW_BEFORE_EXPORT=true` to gate exports on review completion. See [`docs/DOCUMENT_REVIEW_SYSTEM.md`](docs/DOCUMENT_REVIEW_SYSTEM.md) for full feature documentation.

## Document Extraction Contract

### Primary Mode: LLM-Based Analysis (DOCUMENT_ANALYSIS_ENABLED=true)
- **Upload triggers analysis** → System analyzes document via `/api/documents/analyze` and presents classification with confidence score.
- **User confirmation required** → Extraction only proceeds after user confirms document type via `/api/documents/confirm`.
- **Confidence-based UX**:
  - High (>80%): Quick confirm with field preview
  - Medium (50-80%): Multiple options presented
  - Low (<50%): Clarifying questions asked
- **Analysis caching**: Results cached for 15 minutes (`ANALYSIS_CACHE_TTL_SECONDS`)

### Fallback Mode: Intent-Only (DOCUMENT_ANALYSIS_ENABLED=false)
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
   # FILES_LINK_SECRET=$(openssl rand -hex 32)
   ENV
   ```

   # Generate FILES_LINK_SECRET with: openssl rand -hex 32
3. Run the Vite dev server and open the printed URL:
   ```bash
   npm run dev
   ```
4. Follow the charter acceptance demo in [`docs/demo/README.md`](docs/demo/README.md) or the DDP flow in [`docs/ddp/README.md`](docs/ddp/README.md) to validate router behavior end to end.

## Configuration
Environment flags keep the router predictable across dev, preview, and production. See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for the complete table.

| Key | Purpose | Default |
| --- | --- | --- |
| `DOCUMENT_ANALYSIS_ENABLED` | Enable LLM-based document analysis flow. When `false`, reverts to intent-only extraction. | `true` |
| `ANALYSIS_CACHE_TTL_SECONDS` | TTL for cached analysis results. | `900` (15 min) |
| `ANALYSIS_CONFIDENCE_THRESHOLD` | Minimum confidence for auto-suggest. | `0.5` |
| `ANALYSIS_MODEL` | Model used for document analysis. | `gpt-4o` |
| `INTENT_ONLY_EXTRACTION` | (Fallback mode) Enforce explicit user intent before routing extraction. | `true` |
| `CHAT_STREAMING` | Enables the `/api/chat/stream` Edge handler. | `false` |
| `VITE_PREVIEW_CONDITIONAL_VISIBILITY` | Show preview panel only during active document sessions. | `true` |
| `OPENAI_API_KEY` (and related secrets) | Credentials consumed by serverless handlers. | _required_ |
| `FILES_LINK_SECRET` | HMAC secret for charter share links. | _required for charter links_ |

## API
Document pipelines live behind the router-first API layer:
- `POST /api/documents/analyze` – Analyze uploaded document, classify type, and suggest extraction targets.
- `POST /api/documents/confirm` – Confirm analysis and trigger extraction with user-selected document type.
- `GET /api/documents/analysis/:id` – Retrieve cached analysis result.
- `POST /api/documents/extract?docType=<type>` – Run the doc-type extraction pipeline (accepts optional `analysisId`).
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
- `server/documents/analysis/DocumentAnalyzer.js` orchestrates LLM-based document analysis, classification, and field preview generation.
- `api/documents/analyze.js` analyzes uploaded documents and returns classification with confidence scores.
- `api/documents/confirm.js` processes user confirmation and triggers extraction with cached analysis context.
- [`src/utils/detectCharterIntent.js`](src/utils/detectCharterIntent.js) **(fallback mode)** parses user messages and returns `{ docType: 'charter', action: 'create' | 'update', intentText }` when intent is detected.
- [`src/App.jsx`](src/App.jsx) triggers document analysis on file upload (when enabled) or routes matching intents to extraction.
- [`api/documents/extract.js`](api/documents/extract.js) accepts `analysisId` for analysis-driven flow, or enforces explicit intent in fallback mode.
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
