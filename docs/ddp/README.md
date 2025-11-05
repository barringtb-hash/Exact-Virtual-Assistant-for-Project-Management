# Design & Development Plan Acceptance Guide

This walkthrough mirrors the charter acceptance demo while targeting the DDP document type. It validates the router-first workflow, intent guards, and rendering pipeline.

## Prerequisites
- Local environment configured per [`README.md`](../../README.md) with `INTENT_ONLY_EXTRACTION=true` and `CHAT_STREAMING=false` (unless testing SSE).
- Representative DDP source material (attach the internal sample or an anonymized equivalent).
- Familiarity with the template assets in [`templates/doc-types/ddp/`](../../templates/doc-types/ddp/).

## Steps
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open the app in your browser and attach the DDP source document.
3. In the chat composer, request:
   > Create a design & development plan from the attached document.
4. Observe exactly one call to `/api/documents/extract?docType=ddp` in the network tab.
5. Verify the preview populates the expected DDP fields using data from the attachment.
6. Modify a field manually, then re-attach the same document **without** sending an intent message. Confirm no additional extraction occurs.
7. Send a non-intent message (e.g., “What’s next?”). Confirm no extraction occurs and the router logs remain idle.
8. Trigger validation and rendering:
   ```bash
   curl -X POST "http://localhost:5173/api/documents/validate?docType=ddp" \
     -H "Content-Type: application/json" \
     -d '{"document": {/* preview payload */}}'
   curl -X POST "http://localhost:5173/api/documents/render?docType=ddp" \
     -H "Content-Type: application/json" \
     -o ddp.docx \
     -d '{"document": {/* preview payload */}}'
   ```
9. Confirm validation returns `{ "ok": true }` and the rendered file opens with updated tokens.
10. Document the results in your PR description under “Verification”.

## Optional update flow
When testing updates, attach the original DDP, send “Update the design & development plan with the latest scope,” and ensure the router merges unlocked fields without re-running extraction multiple times.
