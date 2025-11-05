# Statement of Work (SOW) Placeholder

The SOW document type is currently disabled in [`templates/registry.js`](../../templates/registry.js). When enabled, it will follow the same router-first pattern as charter and DDP:

1. Register prompts, schemas, and templates under `templates/doc-types/sow/` (create the directory when enabling the doc type).
2. Add acceptance instructions mirroring [`docs/demo/README.md`](../demo/README.md) and [`docs/ddp/README.md`](../ddp/README.md).
3. Update tests to cover intent detection, extraction, validation, and rendering flows.

Track enablement progress via future roadmap updates in the main [`README.md`](../../README.md) and [`CHANGELOG.md`](../../CHANGELOG.md).
