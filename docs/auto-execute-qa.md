# Auto-Execute QA Scenarios

This checklist covers the regression cases for the auto-execute charter workflow. Each
scenario summarizes the trigger, the expected assistant reply, and the UI elements PMs
should confirm before marking the run complete.

## Voice command auto-run

1. Toggle **Auto-execute** on and use the voice mock (`Voice input (mock)`) to capture a
   request such as “render the voice charter docx.”
2. After the mock transcript posts, the assistant should reply with
   `Auto-run complete. Voice Charter is ready for download.`
3. A DOCX download chip appears in the charter panel under **Auto downloads** with the
   filename `Voice Charter.docx` and a `blob:` href. Selecting the chip downloads the
   generated charter.
4. The charter preview badge updates to `Preview synced with voice command`, confirming
   the rendered data refreshed from the executed action.

## Validation error handling

1. Request an export (share links, DOCX, PDF, or blank charter) when the current charter
   draft fails validation—for example, by clearing the required Sponsor field.
2. The assistant responds with the heading `I couldn’t validate the project charter.
   Please review the following:`.
3. Each validation issue renders as a bullet that maps the JSON path to a human-readable
   label (e.g., `project.sponsor – must be present`).
4. No download chips are created, and the export buttons remain enabled so you can fix
   the draft and rerun the request.

## Duplicate send guardrails

1. Start generating an export (share links, DOCX, or PDF) and, before it completes, send
   another request for the same asset.
2. The assistant posts the “busy” message that matches the action in flight, such as
   `I’m already working on DOCX links. I’ll share them here shortly.`
3. The second request does **not** enqueue a duplicate API call, and no extra download
   chips appear until the original export finishes.

Keep this checklist alongside the broader [charter workflow guide](./charter-workflow.md)
so PMs can cover the realtime auto-execute edge cases during release certification.
