# Configuration

This project relies on environment variables and manifest metadata to keep intent-only extraction predictable across environments. Use `.env.local` for local development and runtime configuration tools (Vercel, GitHub Actions secrets, etc.) in hosted environments.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `INTENT_ONLY_EXTRACTION` | Yes | `true` | Enforces the intent gate for `/api/documents/extract`. When `false`, the router is disabled and requests will be rejected. |
| `CHAT_STREAMING` | No | `false` | Enables the Edge streaming handler at `/api/chat/stream`. Leave disabled to fall back to `/api/chat` only. |
| `OPENAI_API_KEY` | Yes | _n/a_ | API key consumed by extraction, validation, rendering, and chat handlers. Provide via secret storage; never commit real keys. |
| `OPENAI_ORG_ID` (or equivalent) | No | _unset_ | Optional override if your account requires explicit organization scoping. |

Add any doc-type specific toggles (for example, preview flags) adjacent to their manifests in [`templates/registry.js`](../templates/registry.js) and document the behavior in the relevant acceptance guide.

## Local development example
Create `.env.local` during setup:

```bash
cat <<'ENV' > .env.local
INTENT_ONLY_EXTRACTION=true
CHAT_STREAMING=false
# OPENAI_API_KEY=sk-...
ENV
```

## Secrets management
- Store secrets in your deployment platform (e.g., Vercel project settings) rather than committing them to the repo.
- Rotate keys regularly and revoke unused credentials.
- If a credential leaks, invalidate it immediately and notify the maintainers via the security channel in [`docs/SECURITY.md`](./SECURITY.md).
