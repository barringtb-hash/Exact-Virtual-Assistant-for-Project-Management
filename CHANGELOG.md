# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] – Hide Charter Wizard; Guided Chat by Default
- **Feature:** Charter Wizard UI is now hidden by default; users interact via guided chat (line-by-line field collection).
- **Feature:** Added explicit "Auto-fill from uploaded scope" button that only appears when wizard mode is enabled.
- **Feature Flags:** Added `VITE_CHARTER_WIZARD_VISIBLE` (default: false) and `VITE_AUTO_EXTRACT` (default: false) to control wizard visibility and auto-extraction behavior.
- **Breaking:** Automatic background extraction is now disabled by default; requires explicit trigger via the Auto-fill button.
- **UI:** "Auto · just now" source chips are hidden in guided chat mode to prevent confusion about auto-extracted vs. confirmed values.
- **Telemetry:** Added `charter_auto_fill_invoked` event tracking when the Auto-fill button is clicked.
- **Configuration:** Updated feature flags in `config/featureFlags.js` with new `isCharterWizardVisible()` and `isAutoExtractionEnabled()` functions.
- **Documentation:** Updated implementation to prioritize guided chat experience with wizard as opt-in feature.

## [Unreleased] – Intent-only extraction
- **Feature:** Natural-language intent detection powers `useBackgroundExtraction.trigger()`, which is now the only path to charter extraction.
- **Breaking:** Removed automatic extraction pathways and all “Sync/Auto-extract” UI affordances.
- **Server:** `/api/documents/extract` requires explicit intent plus context; it returns HTTP 400 when intent is missing and HTTP 422 when context is absent.
- **Prompt:** [`templates/extract_prompt.txt`](templates/extract_prompt.txt) returns `{ "result": "no_op" }` when called without intent.
- **Documentation:** Updated [`README.md`](README.md), [`docs/CODEMAP.md`](docs/CODEMAP.md), [`docs/demo/`](docs/demo/), and [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) to reflect the new flows and acceptance guidance.
- **Documentation Refresh:** Added [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md), [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/RELEASE.md`](docs/RELEASE.md), and [`docs/ddp/README.md`](docs/ddp/README.md). Introduced docs link validation CI (`scripts/validate-doc-links.mjs`, `.github/workflows/docs.yml`).
