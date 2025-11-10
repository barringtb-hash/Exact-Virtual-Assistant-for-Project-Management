# Release Management

## Versioning
- Follow Semantic Versioning for the application: increment MAJOR for breaking router/API changes, MINOR for new doc types or capabilities, and PATCH for fixes.
- Update [`CHANGELOG.md`](../CHANGELOG.md) with every release. Document intent-only contract affirmations alongside new features.

## Template & Schema Changes
1. Decode templates (DOCX, PDF definitions) from the base64 artifacts under [`templates/doc-types/<type>/`](../templates/doc-types/).
2. Update `schema.json`, `field_rules.json`, prompts, and metadata to reflect the desired document output.
3. Re-encode templates using the project scripts, then run:
   ```bash
   npm run docx:lint
   npm run docx:smoke
   ```
4. Update acceptance guides (e.g., [`docs/demo/README.md`](./demo/README.md), [`docs/ddp/README.md`](./ddp/README.md)) and relevant tests.

## Release Checklist
- [ ] All CI checks (lint, unit, integration, e2e, docs) pass.
- [ ] `npm test` succeeds (unit and integration coverage).
- [ ] `npm run test:e2e` and Playwright smoke coverage (`npx playwright test tests/e2e/smoke`) pass locally.
- [ ] Production build validated with the smoke suite (for example, `npm run build && npm run preview -- --port 4173` followed by `npx playwright test tests/e2e/smoke`).
- [ ] Intent-only extraction contract confirmed during manual QA.
- [ ] Registry manifests updated with version bumps where applicable.
- [ ] Documentation links resolve (verified via `node scripts/validate-doc-links.mjs`).
