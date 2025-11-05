# Security

## Runtime Support
- Target active LTS releases of Node.js. Update dependencies or CI matrices when Node LTS cycles.
- Serverless deployments must match supported Node versions to guarantee compatibility and security patches.

## Vulnerability Disclosure
- Report vulnerabilities via `security@exact.com` or by opening a GitHub issue with the `security` label.
- Provide reproduction steps, impacted endpoints, and suggested mitigations where possible.
- Do not post sensitive information publicly; coordinate fixes with the maintainers before disclosure.

## Hardening Notes
- **Intent-only extraction** – `/api/documents/extract` rejects requests without intent (HTTP 400) or context (HTTP 422), preventing unauthorized data pulls.
- **Graceful fallbacks** – Router prompts return `{ "result": "no_op" }` without intent metadata, ensuring automation pipelines stay idle.
- **Secret management** – Store OpenAI credentials in encrypted secret stores (Vercel, GitHub Actions, etc.). Never commit `.env.local` with real values.
- **Streaming safeguards** – Keep `CHAT_STREAMING` disabled unless SSE routing is required. Validate TLS termination and proxy buffering settings before enabling.
- **Audit logging** – Capture doc-type, intent action, and validation outcomes in serverless logs to aid incident response.
