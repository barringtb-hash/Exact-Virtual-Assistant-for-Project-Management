# Operations

## Continuous Integration
- `npm run lint` – Lints the frontend and serverless code.
- `npm test` – Executes unit and integration tests.
- `npm run test:e2e` / `npm run cy:run` – Exercise Playwright and Cypress suites for regression coverage.
- `node scripts/validate-doc-links.mjs` – Verifies local Markdown links resolve. CI fails when any path is missing.

Ensure all checks pass before merging. Broken doc links will now block PRs via the `docs` GitHub Action.

## Deployment
- Deploy serverless handlers (chat, extraction, validation, rendering) to a Node-compatible serverless platform (e.g., Vercel).
- Keep `INTENT_ONLY_EXTRACTION=true` across environments to preserve the router contract.
- Enable `CHAT_STREAMING=true` only when the Edge runtime is configured for SSE; otherwise rely on `/api/chat`.
- Monitor logs for extraction, validation, and rendering requests to confirm intent metadata is flowing as expected.

## Rollback
- Toggle `CHAT_STREAMING` back to `false` to disable the Edge handler if streaming degrades.
- Revert to a previous deployment or commit via your hosting platform when extraction failures occur.
- Reset environment variables (e.g., `INTENT_ONLY_EXTRACTION`) to their last known good values if unexpected automatic runs appear.
- Document incidents and mitigations in the corresponding pull request or issue for traceability.
