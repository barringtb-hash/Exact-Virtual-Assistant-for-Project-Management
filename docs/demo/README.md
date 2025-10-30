# OncoLiquid ctDNA Assay (Demo) – Acceptance Walkthrough

The **OncoLiquid ctDNA Assay (Demo)** Target Product Profile (TPP) is the canonical test artifact for validating intent-only charter extraction.

## Files
- `OncoLiquid-ctDNA-Assay-TPP.txt` – Plain-text copy of the demo TPP used for tests and manual verification.

> If you regenerate the source file (for example to refresh formatting or fix typos), keep the filename stable and update this README with a revision note.

## Acceptance Test Flow
1. Launch the dev server (`npm run dev`) with `INTENT_ONLY_EXTRACTION=true` in `.env.local`.
2. Attach `OncoLiquid-ctDNA-Assay-TPP.txt` from this folder.
3. Type or speak the exact phrase:
   > Please create a project charter from the attached document.
4. Verify the preview updates once with charter fields (Project Title, Sponsor, Project Manager, Objectives, Scope Summary, Milestones, Risks).
5. Confirm no additional extraction calls occur when you:
   - Re-attach the same file.
   - Edit the preview manually.
   - Send non-intent messages (e.g., “Thanks!”).
6. (Optional) Trigger an update flow by editing the TPP file (e.g., adjust scope) and saying:
   > Update the project charter using the latest scope.
7. Document the run in your PR description or QA notes.

## Automation Hooks
- UI tests should import this file path to simulate uploads.
- Server tests should expect `/api/documents/extract` to reject requests without both `intent` and `attachments`.
- Prompt regressions must assert that calling [`templates/extract_prompt.txt`](../../templates/extract_prompt.txt) without intent yields `{ "result": "no_op" }`.
