# Project Charter Template Workflow

This guide documents how to maintain the charter templates that power charter exports. The repository stores the DOCX source as a base64 text file (`project_charter_tokens.docx.b64`) so pull requests remain text-only and avoid "binary files are not supported" errors, and renders the PDF layout from `templates/charter-export.html.mustache`.

## Rebuilding the DOCX Template

1. Decode the committed base64 file to a DOCX you can edit:

   ```sh
   node templates/sync-charter-template.mjs decode
   ```

   The default output path is `templates/project_charter_tokens.docx`. You can pass a custom path as a second argument.
2. Start from the decoded, clean Word document (or a fresh document if you are rebuilding from scratch). Avoid copying or editing older binary files directly to prevent hidden XML fragments from persisting.
3. Add the charter sections in this order:
   - Project Charter title
   - Overview details (Project Name, Sponsor, Project Lead, Start Date, Target Completion)
   - Vision, Problem Statement, and Description paragraphs
   - Scope In, Scope Out, Risks, Assumptions, Milestones, Success Metrics, Core Team, Generated On
4. Insert the docxtemplater tokens exactly as defined below. Use camelCase names for single values and wrap repeating sections in loops:
   - Single values: `{{projectName}}`, `{{sponsor}}`, `{{projectLead}}`, `{{startDate}}`, `{{endDate}}`, `{{vision}}`, `{{problem}}`, `{{description}}`, `{{generatedOn}}`
   - Array loops:
     - `{{#scopeIn}}…{{/scopeIn}}`
     - `{{#scopeOut}}…{{/scopeOut}}`
     - `{{#risks}}…{{/risks}}`
     - `{{#assumptions}}…{{/assumptions}}`
     - `{{#milestones}}…{{/milestones}}` with fields `{{phase}}`, `{{deliverable}}`, `{{date}}`
     - `{{#successMetrics}}…{{/successMetrics}}` with fields `{{benefit}}`, `{{metric}}`, `{{systemOfMeasurement}}`
     - `{{#coreTeam}}…{{/coreTeam}}` with fields `{{name}}`, `{{role}}`, and optional `{{responsibilities}}`
5. For lists, place the loop and token on the same line (for example, `{{#scopeIn}}• {{.}}{{/scopeIn}}`) so each item expands into its own bullet.
6. Save the document as `project_charter_tokens.docx` in `templates/` (or the path you chose in step 1).
7. Re-encode the DOCX back into the repository’s base64 file so that Git tracks a text diff:

   ```sh
   npm run docx:encode
   ```

   The script defaults to `templates/project_charter_tokens.docx` and writes the updated
   `project_charter_tokens.docx.b64` alongside it. If you saved the DOCX to a different
   path, pass that path after a `--`, for example `npm run docx:encode -- ./drafts/charter.docx`.

## Validation

Run the template validation script before committing. The validator reads from the base64 store and checks for malformed or duplicated tokens:

```sh
npm run validate:charter-docx
```

The script loads the template with representative data and fails if docxtemplater reports malformed, duplicated, or unresolvable tags. CI should also execute this command.

In addition to the template validator, the automated test suite exercises the charter link and download endpoints end-to-end. Run `npm test` for the unit coverage (HMAC signing, expiry handling, and template validation responses) and `npm run test:e2e` to confirm the Playwright flow can request signed downloads with the latest template changes.

## Updating the PDF Layout

The PDF export reuses the same normalized charter payload but renders it with Mustache before printing to PDF via headless Chromium.

1. Edit `templates/charter-export.html.mustache` using standard HTML/CSS. Keep inline styles self-contained—external assets are not loaded in the serverless runtime.
2. Place tokens like `{{projectName}}`, `{{#scopeIn}}`, and `{{#milestones}}` where values should appear. These mirror the normalized keys produced by `lib/charter/normalize.js` (camelCase conversion happens inside the renderer).
3. Use conditional sections (e.g., `{{#scopeIn}}`) to hide empty lists and apply `{{^scopeIn}}` blocks for fallbacks if needed.
4. After updating the template, run `npm run validate:charter-docx` and `npm test` to ensure both the DOCX validator and PDF charter download tests still pass.
5. Deployments that cannot run the default Chromium binary should supply `CHROME_EXECUTABLE_PATH` or `PUPPETEER_EXECUTABLE_PATH` so `/api/export/pdf` can launch the browser.

## JSON & XLSX Renderers

`templates/renderers.js` exposes helpers that back the `/api/charter/download` endpoint:

- `renderJsonBuffer` serializes the charter payload into a prettified JSON buffer.
- `renderXlsxBuffer` currently throws `FormatNotImplementedError`. Implementing XLSX exports should replace this stub with a real generator and update the tests to expect a successful response.

## Version Control Notes

- Only the base64 file `project_charter_tokens.docx.b64` is committed. This keeps pull requests text-only and avoids binary diff limitations in the review tooling.
- Use `templates/sync-charter-template.mjs decode` when you need the DOCX locally, and `npm run docx:encode` after you save changes so the base64 file stays in sync.
- Document any structural changes or new tokens in this file to keep the workflow transparent.
