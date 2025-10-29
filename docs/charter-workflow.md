# Document workflows

The document router shares a single extract → validate → render pipeline across every supported doc type. Charter flows continue to work through the legacy `/api/charter/*` aliases, while the generalized `/api/doc/*` endpoints read doc-specific configuration from [`lib/doc/registry.js`](../lib/doc/registry.js). Use this guide when editing prompts, schemas, or DOCX assets so the router and its offline tooling stay in sync.

## Charter workflow (Project Charter template)

### Maintain the DOCX template
1. Decode the committed base64 file to a DOCX you can edit:
   ```sh
   node templates/sync-charter-template.mjs decode
   ```
   The default output path is `templates/project_charter_tokens.docx`. Pass a custom path as a second argument when you want to keep multiple drafts.
2. Start from the decoded, clean Word document (or rebuild from scratch). Avoid copying older binaries to prevent stray XML fragments from persisting.
3. Add the charter sections in this order:
   - Project Charter title
   - Overview details (Project Name, Sponsor, Project Lead, Start Date, Target Completion)
   - Vision, Problem Statement, and Description paragraphs
   - Scope In, Scope Out, Risks, Assumptions, Milestones, Success Metrics, Core Team, Generated On
4. Insert the docxtemplater tokens exactly as defined below. Use snake_case names for single values and wrap repeating sections in loops:
   - Single values: `{{project_name}}`, `{{sponsor}}`, `{{project_lead}}`, `{{start_date}}`, `{{end_date}}`, `{{vision}}`, `{{problem}}`, `{{description}}`
   - Array loops:
     - `{{#scope_in}}…{{/scope_in}}`
     - `{{#scope_out}}…{{/scope_out}}`
     - `{{#risks}}…{{/risks}}`
     - `{{#assumptions}}…{{/assumptions}}`
     - `{{#milestones}}…{{/milestones}}` with fields `{{phase}}`, `{{deliverable}}`, `{{date}}`
     - `{{#success_metrics}}…{{/success_metrics}}` with fields `{{benefit}}`, `{{metric}}`, `{{system_of_measurement}}`
     - `{{#core_team}}…{{/core_team}}` with fields `{{name}}`, `{{role}}`, and optional `{{responsibilities}}`
5. For lists, place the loop and token on the same line (for example, `{{#scope_in}}- {{.}}{{/scope_in}}`) so each item expands into its own bullet.
6. Save the document as `project_charter_tokens.docx` in `templates/` (or the custom path from step 1).
7. Re-encode the DOCX back into the repository’s base64 file so Git tracks a text diff:
   ```sh
   npm run docx:encode
   ```
   The script defaults to `templates/project_charter_tokens.docx` and writes `project_charter_tokens.docx.b64` alongside it. If you saved the DOCX to a different path, pass that path after a `--`, for example `npm run docx:encode -- ./drafts/charter.docx`.

### Extract
- Runtime asset: [`templates/extract_prompt.txt`](../templates/extract_prompt.txt)
- Optional overrides: place prompt variants inside `templates/doc-types/charter/` and add metadata files as needed so `/api/doc/extract` can load the latest instructions.

### Validate
- Runtime schema: [`templates/charter.schema.json`](../templates/charter.schema.json)
- Field guidance: [`templates/field_rules.json`](../templates/field_rules.json)
- CLI: `node templates/charter-validate.mjs ./path/to/charter.json`
- Validation API: `POST /api/doc/validate?docType=charter` (aliases: `/api/charter/validate`)

### Render
- Runtime template: [`templates/project_charter_tokens.docx.b64`](../templates/project_charter_tokens.docx.b64)
- Rendering API: `POST /api/doc/render?docType=charter` (alias: `/api/charter/render`)
- Smoke test: `npm run docx:smoke`

### Post-edit checklist
Run the DOCX lint and validation scripts before committing. They read from the checked-in template and fail when tokens fall out of sync with the schema or when docxtemplater detects malformed tags:
```sh
npm run docx:lint
npm run validate:charter-docx
```
After saving template edits, run the encoding, lint, and smoke rendering scripts to verify everything is synchronized:
```sh
npm run docx:encode
npm run docx:lint
npm run docx:smoke
```
If `templates/project_charter_tokens.docx` is missing, decode it from the base64 store first:
```sh
node templates/sync-charter-template.mjs decode
```
In addition to the template validator, the automated test suite exercises the charter link and download endpoints end-to-end. Run `npm test` for the unit coverage (HMAC signing, expiry handling, and template validation responses) and `npm run test:e2e` to confirm the Playwright flow can request signed downloads with the latest template changes.

`/api/export/pdf` renders the same normalized charter payload with pdfmake instead of a browser. The serverless handler loads [`templates/pdf/charter.pdfdef.mjs`](../templates/pdf/charter.pdfdef.mjs), calls `buildPdfDefinition(charter)`, and streams the result directly from `pdfmake` without requiring Chromium.

## Design & Development Plan (DDP) workflow

The DDP flow follows the same extract → validate → render pattern. Runtime assets live under [`templates/doc-types/ddp/`](../templates/doc-types/ddp/), while editors keep the DOCX source and offline tooling in [`templates/ddp/`](../templates/ddp/).

### Extract
- Prompts: [`templates/doc-types/ddp/extract_prompt.txt`](../templates/doc-types/ddp/extract_prompt.txt) (fallbacks can be added beside the charter prompts if needed)
- Metadata: optional helpers in [`templates/doc-types/ddp/metadata.json`](../templates/doc-types/ddp/metadata.json) inform the extractor about document nuances.
- API: `POST /api/doc/extract?docType=ddp`

### Validate
- Schema: [`templates/doc-types/ddp/schema.json`](../templates/doc-types/ddp/schema.json)
- Field rules: [`templates/doc-types/ddp/field_rules.json`](../templates/doc-types/ddp/field_rules.json)
- CLI: `node templates/ddp/ddp-validate.mjs ./path/to/ddp.json`
- API: `POST /api/doc/validate?docType=ddp`

### Render
- Template: [`templates/doc-types/ddp/template.docx.b64`](../templates/doc-types/ddp/template.docx.b64) (decode/edit via the copies in [`templates/ddp/`](../templates/ddp/))
- API: `POST /api/doc/render?docType=ddp`
- Output filename: `design_development_plan.docx`

### Maintenance tips
- Keep the editor-focused assets (`templates/ddp/ddp_tokens.docx.b64`, `templates/ddp/ddp.schema.json`, etc.) synchronized with the runtime copies in `templates/doc-types/ddp/`. The CLI reads from the editor directory so template authors can work locally without touching the runtime bundle.
- When adding new doc types, update [`lib/doc/registry.js`](../lib/doc/registry.js) and mirror the asset structure shown above so each document has prompts, schema, field rules, metadata, and DOCX encodings ready for the router.
