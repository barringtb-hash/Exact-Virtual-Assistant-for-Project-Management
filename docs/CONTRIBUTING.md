# Contributing Guide

## Pull Request Checklist
Before opening a PR, confirm the following items:

### Document Analysis Mode (Primary - DOCUMENT_ANALYSIS_ENABLED=true)
- [ ] **Analysis flow works:** Upload triggers `/api/documents/analyze` and returns classification with confidence scores.
- [ ] **Confirmation flow works:** User confirmation triggers extraction via `/api/documents/confirm`.
- [ ] **Analysis caching verified:** Results are cached and retrievable via `analysisId`.
- [ ] **Confidence-based UX tested:** High/medium/low confidence scenarios display appropriate UI.

### Fallback Mode (DOCUMENT_ANALYSIS_ENABLED=false)
- [ ] **No automatic extraction paths:** The UI and hooks never trigger charter extraction on uploads, voice activity, or generic messages.
- [ ] **Intent detection coverage:** Natural-language triggers are limited to explicit charter requests and unit tests for [`detectCharterIntent`](../src/utils/detectCharterIntent.js) are updated when phrases change. Note: This is fallback mode only.
- [ ] **Manual trigger only:** [`useBackgroundExtraction.trigger()`](../src/hooks/useBackgroundExtraction.js) remains the sole invocation site in fallback mode.
- [ ] **Server guardrails enforced:** [`api/documents/extract.js`](../api/documents/extract.js) rejects requests without intent (HTTP 400) or context (HTTP 422) when not using `analysisId`. Tests cover both negative cases.
- [ ] **Prompt no-op behavior protected:** [`templates/extract_prompt.txt`](../templates/extract_prompt.txt) returns `{ "result": "no_op" }` when invoked without intent. Add/update tests to guard this contract.

### General Requirements
- [ ] **Documentation refreshed:** [`README.md`](../README.md), [`docs/CODEMAP.md`](./CODEMAP.md), and [`docs/demo/README.md`](./demo/README.md) stay in sync with any behavior changes.
- [ ] **Demo verified:** Run the OncoLiquid ctDNA Assay (Demo) acceptance flow and note the results in the PR description.
- [ ] **Doc-type registry updated:** Changes to document types include manifest updates in [`templates/registry.js`](../templates/registry.js) and corresponding assets under [`templates/doc-types/`](../templates/doc-types/).
- [ ] **Templates + schemas validated:** Provide `schema.json`, `field_rules.json`, prompts, and metadata for each doc type. Re-encode DOCX templates, then run `npm run docx:lint` and `npm run docx:smoke` before committing.
- [ ] **Acceptance docs covered:** Update [`docs/demo/README.md`](./demo/README.md), [`docs/ddp/README.md`](./ddp/README.md), and any other doc-type guides to reflect new flows or assets.

## Development Notes
- Set `DOCUMENT_ANALYSIS_ENABLED=true` (default) for LLM-based analysis flow, or `false` for intent-only fallback mode.
- When testing fallback mode, set `INTENT_ONLY_EXTRACTION=true` in both client (`.env.local`) and serverless environments.
- Use the assets in [`docs/demo/`](./demo/) for manual QA and automated tests.
- Prefer high-signal unit/integration tests over snapshots when validating analysis, intent detection, and extraction triggers.
- When introducing a new doc type, register it in [`templates/registry.js`](../templates/registry.js), add prompts/schemas/templates under [`templates/doc-types/<type>/`](../templates/doc-types/), and extend acceptance documentation/tests accordingly.
- See [`docs/LLM-DOCUMENT-EXTRACTION-STRATEGY.md`](./LLM-DOCUMENT-EXTRACTION-STRATEGY.md) for full architecture details.
