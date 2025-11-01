# Contributing Guide

## Pull Request Checklist
Before opening a PR, confirm the following items:
- [ ] **No automatic extraction paths:** The UI and hooks never trigger charter extraction on uploads, voice activity, or generic messages.
- [ ] **Intent detection coverage:** Natural-language triggers are limited to explicit charter requests and unit tests for [`detectCharterIntent`](../src/utils/detectCharterIntent.js) are updated when phrases change.
- [ ] **Manual trigger only:** [`useBackgroundExtraction.trigger()`](../src/hooks/useBackgroundExtraction.js) remains the sole invocation site. New code paths call this method directly rather than reintroducing watchers or debounced effects.
- [ ] **Server guardrails enforced:** [`api/documents/extract.js`](../api/documents/extract.js) rejects requests without intent (HTTP 400) or context (HTTP 422). Tests cover both negative cases.
- [ ] **Prompt no-op behavior protected:** [`templates/extract_prompt.txt`](../templates/extract_prompt.txt) returns `{ "result": "no_op" }` when invoked without intent. Add/update tests to guard this contract.
- [ ] **Documentation refreshed:** [`README.md`](../README.md), [`docs/CODEMAP.md`](./CODEMAP.md), and [`docs/demo/README.md`](./demo/README.md) stay in sync with any behavior changes.
- [ ] **Demo verified:** Run the OncoLiquid ctDNA Assay (Demo) acceptance flow and note the results in the PR description.

## Development Notes
- Set `INTENT_ONLY_EXTRACTION=true` in both client (`.env.local`) and serverless environments to reproduce production behavior.
- Use the assets in [`docs/demo/`](./demo/) for manual QA and automated tests.
- Prefer high-signal unit/integration tests over snapshots when validating intent detection and extraction triggers.
