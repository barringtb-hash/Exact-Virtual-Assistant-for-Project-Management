# Project Charter Template Workflow

This guide documents how to maintain the charter templates that power charter exports. The repository stores the DOCX source as a base64 text file (`project_charter_tokens.docx.b64`) so pull requests remain text-only and avoid "binary files are not supported" errors, and renders the PDF layout from the pdfmake definition in `templates/pdf/charter.pdfdef.mjs`.

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

Run the DOCX lint and validation scripts before committing. They read from the checked-in template and fail when the charter tokens fall out of sync with the schema or when docxtemplater detects malformed tags:

```sh
npm run docx:lint
npm run validate:charter-docx
```

The linter ensures every `{{token}}` in the DOCX maps to a schema field (including loop placeholders), and the validator renders the template with representative data to catch structural issues. CI should also execute both commands.

## Post-Edit Checklist

After saving template edits, run the encoding, lint, and smoke rendering scripts to verify everything is synchronized:

```sh
npm run docx:encode
npm run docx:lint
npm run docx:smoke
```

`docx:smoke` renders the sample payload at `samples/charter.smoke.json` and writes the DOCX to `samples/charter.smoke.docx` by default. Pass alternative payload and output paths as arguments to exercise other scenarios.

If `templates/project_charter_tokens.docx` is missing, decode it from the base64 store first:

```sh
node templates/sync-charter-template.mjs decode
```

In addition to the template validator, the automated test suite exercises the charter link and download endpoints end-to-end. Run `npm test` for the unit coverage (HMAC signing, expiry handling, and template validation responses) and `npm run test:e2e` to confirm the Playwright flow can request signed downloads with the latest template changes.

## Updating the PDF Layout

`/api/export/pdf` renders the same normalized charter payload with pdfmake instead of a browser. The serverless handler loads `templates/pdf/charter.pdfdef.mjs`, calls `buildPdfDefinition(charter)`, and streams the result directly from `pdfmake` without requiring Chromium.

1. Update layout, colors, or typography inside `templates/pdf/charter.pdfdef.mjs`. The file exports helper functions plus `buildPdfDefinition`, which assembles the pdfmake document definition (`content`, `styles`, `pageMargins`, etc.). Keep all assets inline—pdfmake cannot fetch external styles or images in this environment.
2. When adding or renaming charter fields, edit `buildTemplateData(charter)` in the same file. This helper maps the snake_case schema (`project_name`, `scope_in`, `success_metrics`, etc.) into the friendlier structure consumed by the layout helpers:
   - Overview cards read `projectName`, `sponsor`, `projectLead`, `startDate`, and `endDate`.
   - Narrative sections (`vision`, `problem`, `description`) become paragraph cards with fallback text of "Not provided".
   - List-based sections (`scopeIn`, `scopeOut`, `risks`, `assumptions`) call `normalizeStringList` so blank entries are removed and empty lists fall back to muted copy.
   - `successMetrics`, `milestones`, and `coreTeam` map to arrays of objects with explicit keys (`benefit`, `metric`, `system_of_measurement`, `phase`, `deliverable`, `dateDisplay`, `name`, `role`, `responsibilities`). The builder functions (`buildSuccessMetricSection`, `buildMilestoneSection`, `buildCoreTeamSection`) format these arrays into card grids.
3. Extend or adjust helper functions (for example, `createCardRows`, `createCardFromSections`, or the shared `styles` map) to apply new design patterns. Each helper returns pdfmake-friendly nodes, so keeping changes inside these utilities ensures consistent spacing and fallbacks throughout the document.
4. Save the file and run your preferred smoke test (for example, invoking `/api/export/pdf` locally with `samples/charter.smoke.json`). Because rendering no longer shells out to Chromium, no additional environment variables are required.

## JSON & XLSX Renderers

`templates/renderers.js` exposes helpers that back the `/api/charter/download` endpoint:

- `renderJsonBuffer` serializes the charter payload into a prettified JSON buffer.
- `renderXlsxBuffer` currently throws `FormatNotImplementedError`. Implementing XLSX exports should replace this stub with a real generator and update the tests to expect a successful response.

## Version Control Notes

- Only the base64 file `project_charter_tokens.docx.b64` is committed. This keeps pull requests text-only and avoids binary diff limitations in the review tooling.
- Use `templates/sync-charter-template.mjs decode` when you need the DOCX locally, and `npm run docx:encode` after you save changes so the base64 file stays in sync.
- Document any structural changes or new tokens in this file to keep the workflow transparent.
