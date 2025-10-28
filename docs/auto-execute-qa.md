# Auto-Execute QA Scenarios

This checklist covers the regression cases for the synchronous auto-execute charter
workflow. Each scenario highlights the trigger, the expected assistant reply, and the UI
elements PMs should confirm before marking the run complete.

## Voice command auto-run

1. Toggle **Auto-execute** on (voice capture turns it on automatically) and use the voice
   mock (`Voice input (mock)`) to request something actionable such as “generate a project
   charter and export it.”
2. After the transcript auto-sends, confirm the assistant posts a reply and the network
   call hits `/api/chat?execute=1`.
3. Verify the response JSON includes an `executed` entry for `charter.render` with
   `status: "ok"` and a summarized buffer length. When the payload also includes base64
   data, a download chip appears in the charter panel under **Auto downloads** with a
   `blob:` URL. Selecting the chip should download the generated charter.
4. The charter preview badge flips to the `updated` state, confirming the app refreshed the
   preview after execution.

## Validation error handling

1. Request a validation step (for example, “validate our charter”) after clearing a
   required field such as Sponsor so the payload fails schema checks.
2. The assistant responds with the heading `I couldn’t validate the project charter.
   Please review the following:` followed by bullet points surfaced from Ajv errors.
3. Confirm the `executed` array contains an entry for `charter.validate` with
   `status: "error"` and that no download chips are created.
4. Export buttons should remain enabled so you can fix the draft and rerun the request.

## Duplicate send guardrails

1. Trigger an auto-executed render via voice or text, then immediately send the same
   request again.
2. The assistant should return two distinct replies, but only the executions that finish
   successfully surface downloads. Inspect the transcript for duplicate chips; if extra
   downloads appear, file a bug against the dedupe logic.

Keep this checklist alongside the broader [charter workflow guide](./charter-workflow.md)
so PMs can cover the realtime auto-execute edge cases during release certification.
