# Project Charter Wizard Guide

This guide walks project managers through the Exact charter wizard so you can capture scope, iterate safely, and deliver a final export without surprises.

> _Annotated screenshots will be added after the UI is locked for the current release cycle._

## Navigating the flow

1. **Start the session** – Opening the wizard triggers an `INIT` event that loads the first required field and shows progress indicators for every question in the charter schema.【F:src/state/conversationMachine.ts†L605-L612】【F:src/state/conversationStore.ts†L56-L125】
2. **Capture & confirm** – Each response goes through a capture step (drafting your text), a validation pass, and a confirmation before the wizard automatically advances to the next pending field.【F:src/state/conversationMachine.ts†L626-L815】
3. **Progress tracking** – The review sidebar lists every field with its status and the most recent value. Confirmed or captured entries surface an “Edit field” link so you can jump back from the review mode without losing your place.【F:src/chat/CharterFieldSession.tsx†L250-L279】

## Command reference

The command chips under the prompt map directly to wizard events:

- **Back** rewinds to the previous field, replays the original ask prompt, and keeps the prior answer in the editor for quick edits.【F:src/state/conversationMachine.ts†L816-L835】【F:src/state/conversationStore.ts†L103-L108】
- **Edit** lets you jump to any field from the review list; the wizard resets errors and re-asks the question inline.【F:src/state/conversationMachine.ts†L839-L865】【F:src/state/conversationStore.ts†L106-L108】
- **Skip** clears the current answer, records the reason, and advances. Hidden fields produced by conditional rules are also marked as skipped automatically to keep review data clean.【F:src/state/conversationMachine.ts†L867-L905】【F:src/lib/forms/validation.ts†L445-L473】
- **Preview** enters review mode at any time so you can evaluate partial drafts before finishing. Use **Continue editing** (which sends `END_REVIEW`) to resume the next unanswered question.【F:src/state/conversationMachine.ts†L896-L913】【F:src/chat/CharterFieldSession.tsx†L284-L305】

## Validation behavior

- **Normalization first** – Inputs are normalized per field type (single-line, multiline, date, list, or structured object) before rules run, so spacing and formats stay consistent in the final document.【F:src/lib/forms/validation.ts†L267-L316】
- **Rule checks** – Required fields, maximum lengths, enumerations, patterns, and date formats raise blocking errors. The wizard tracks re-ask counts and surfaces the associated rule text in the UI for transparency.【F:src/lib/forms/validation.ts†L324-L430】
- **Visibility conditions** – Fields can remain hidden until prerequisite answers are provided; when hidden, they are marked as skipped with the `hidden` reason and are excluded from export payloads.【F:src/lib/forms/validation.ts†L205-L265】【F:src/state/conversationMachine.ts†L556-L585】
- **Escalation on repeated failures** – If a user exceeds the configured validation attempts, the wizard logs a `validation-max-attempts` skip, clears the draft value, and advances so the session can continue without blocking the entire charter.【F:src/state/conversationMachine.ts†L640-L715】

## Review & finalize

- **Automatic review gate** – When every field is either confirmed or skipped, the wizard switches to review mode automatically and prompts you to audit the captured responses before export.【F:src/state/conversationMachine.ts†L926-L931】
- **Manual preview** – You can open review mode at any time with the **Preview** command; the session remembers your place and returns to the next pending field after you close review.【F:src/state/conversationMachine.ts†L896-L913】
- **Finalize** – Selecting **Finalize charter** records the completion timestamp, locks the session into the `finalized` step, and emits telemetry so downstream systems can capture the state change.【F:src/state/conversationMachine.ts†L915-L919】【F:src/chat/CharterFieldSession.tsx†L284-L305】
- **Re-open review** – Even after finalization, you can reopen review from the summary panel to spot-check captured data before exporting or to document post-finalization adjustments.【F:src/chat/CharterFieldSession.tsx†L310-L325】

## Exporting the charter

Finalizing the session unlocks downstream export actions (DOCX, PDF, or copy-to-clipboard) just as in the standard preview pane. The wizard keeps the normalized values aligned with the charter template so the generated document reflects exactly what you confirmed in review.【F:src/state/conversationMachine.ts†L915-L919】【F:src/lib/forms/validation.ts†L445-L505】

