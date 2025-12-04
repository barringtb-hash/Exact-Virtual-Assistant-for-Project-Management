# Configuration

This project relies on environment variables and manifest metadata to keep document extraction predictable across environments. Use `.env.local` for local development and runtime configuration tools (Vercel, GitHub Actions secrets, etc.) in hosted environments.

## Environment variables

### Document Analysis (Primary Mode)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DOCUMENT_ANALYSIS_ENABLED` | No | `true` | Enables LLM-based document analysis flow. When `false`, reverts to intent-only extraction (fallback mode). |
| `ANALYSIS_CACHE_TTL_SECONDS` | No | `900` | TTL for cached analysis results (15 minutes default). |
| `ANALYSIS_CONFIDENCE_THRESHOLD` | No | `0.5` | Minimum confidence for auto-suggest. Below this threshold, clarifying questions are asked. |
| `ANALYSIS_MODEL` | No | `gpt-4o` | Model used for document analysis and classification. |

### Fallback Mode (Intent-Only)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `INTENT_ONLY_EXTRACTION` | No | `true` | (Fallback mode) Enforces the intent gate for `/api/documents/extract`. Only applies when `DOCUMENT_ANALYSIS_ENABLED=false`. |

### Core Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CHAT_STREAMING` | No | `false` | Enables the Edge streaming handler at `/api/chat/stream`. Leave disabled to fall back to `/api/chat` only. |
| `OPENAI_API_KEY` | Yes | _n/a_ | API key consumed by analysis, extraction, validation, rendering, and chat handlers. Provide via secret storage; never commit real keys. |
| `OPENAI_ORG_ID` (or equivalent) | No | _unset_ | Optional override if your account requires explicit organization scoping. |
| `FILES_LINK_SECRET` | Yes (for charter share links) | _unset_ | HMAC secret that signs `/api/charter/make-link` payloads and verifies `/api/charter/download` requests. Provide a strong 32-byte hex value and rotate if exposed. |

Add any doc-type specific toggles (for example, preview flags) adjacent to their manifests in [`templates/registry.js`](../templates/registry.js) and document the behavior in the relevant acceptance guide.

## Local development example
Create `.env.local` during setup:

```bash
cat <<'ENV' > .env.local
# Document Analysis (default: enabled)
DOCUMENT_ANALYSIS_ENABLED=true
ANALYSIS_CACHE_TTL_SECONDS=900
ANALYSIS_CONFIDENCE_THRESHOLD=0.5
ANALYSIS_MODEL=gpt-4o

# Fallback mode (when DOCUMENT_ANALYSIS_ENABLED=false)
INTENT_ONLY_EXTRACTION=true

CHAT_STREAMING=false
# OPENAI_API_KEY=sk-...
# FILES_LINK_SECRET=$(openssl rand -hex 32)
ENV
```

# Generate `FILES_LINK_SECRET` locally with: `openssl rand -hex 32`

## Secrets management
- Store secrets in your deployment platform (e.g., Vercel project settings) rather than committing them to the repo.
- Rotate keys regularly and revoke unused credentials.
- If a credential leaks, invalidate it immediately and notify the maintainers via the security channel in [`docs/SECURITY.md`](./SECURITY.md).
