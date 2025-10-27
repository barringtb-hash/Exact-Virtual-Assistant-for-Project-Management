# Project Charter Template Workflow

This guide documents how to maintain the charter template (`project_charter_tokens.docx`) that powers charter exports. The repository stores the template as a base64 text file (`project_charter_tokens.docx.b64`) so pull requests remain text-only and avoid "binary files are not supported" errors.

## Rebuilding the Template

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
   node templates/sync-charter-template.mjs encode
   ```

   If you saved the DOCX to a different path, pass that path as the second argument.

## Validation

Run the template validation script before committing. The validator reads from the base64 store and checks for malformed or duplicated tokens:

```sh
npm run validate:charter-docx
```

The script loads the template with representative data and fails if docxtemplater reports malformed, duplicated, or unresolvable tags. CI should also execute this command.

## Version Control Notes

- Only the base64 file `project_charter_tokens.docx.b64` is committed. This keeps pull requests text-only and avoids binary diff limitations in the review tooling.
- Use `templates/sync-charter-template.mjs decode` when you need the DOCX locally, and `encode` after you save changes so the base64 file stays in sync.
- Document any structural changes or new tokens in this file to keep the workflow transparent.
