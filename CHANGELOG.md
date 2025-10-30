# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] – Intent-only extraction
- **Feature:** Natural-language intent detection powers `useBackgroundExtraction.trigger()`, which is now the only path to charter extraction.
- **Breaking:** Removed automatic extraction pathways and all “Sync/Auto-extract” UI affordances.
- **Server:** `/api/documents/extract` requires explicit intent plus context; it returns HTTP 400 when intent is missing and HTTP 422 when context is absent.
- **Prompt:** [`templates/extract_prompt.txt`](templates/extract_prompt.txt) returns `{ "result": "no_op" }` when called without intent.
- **Documentation:** Updated [`README.md`](README.md), [`docs/CODEMAP.md`](docs/CODEMAP.md), [`docs/demo/`](docs/demo/), and [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) to reflect the new flows and acceptance guidance.
