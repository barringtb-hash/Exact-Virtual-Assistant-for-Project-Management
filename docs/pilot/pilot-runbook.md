# Project Charter Pilot Runbook

Use this runbook to rehearse the charter wizard before pilot launches, validate deterministic conversation coverage, and collect the metrics required for the exit criteria.

## Prerequisites

1. Install dependencies with `npm ci` (required once per workspace).
2. Ensure the `CHARTER_TELEMETRY_ROOT` environment variable points to a writable directory if you plan to capture live telemetry files (defaults to `/tmp/charter-wizard`).【F:docs/telemetry/charter-wizard.md†L6-L38】

## Execute the golden QA pack

1. Run `npm run qa:charter-wizard` from the repository root. The task replays each golden transcript at temperature 0 and writes artifacts to `tmp/golden-conversations/` by default.【F:scripts/run-golden-conversations.mjs†L1-L123】
2. For targeted debugging, pass `--scenario <slug>` (for example `npm run qa:charter-wizard -- --scenario 04-validation-failures`) to focus on a single conversation trace.【F:scripts/run-golden-conversations.mjs†L28-L63】
3. Review the generated files per scenario:
   - `result.json` – step-by-step states, action traces, and the normalized document snapshot.【F:scripts/run-golden-conversations.mjs†L82-L108】
   - `telemetry.json` – sanitized transition payloads that should match production instrumentation.【F:scripts/run-golden-conversations.mjs†L89-L103】
   - `validation-attempts.json` – condensed re-ask history useful when tuning rules.【F:scripts/run-golden-conversations.mjs†L104-L108】

The final console summary lists every scenario, total steps executed, and the folder that contains its artifacts.【F:scripts/run-golden-conversations.mjs†L110-L123】

## Collect pilot metrics

1. After each rehearsal or live pilot day, aggregate the telemetry CSVs described in the telemetry reference to compute:
   - Percentage of fields finalized (`completion_status`) and reasons for skips.【F:docs/telemetry/charter-wizard.md†L8-L27】
   - Re-ask ratios and skip counts for each required prompt to spot friction early.【F:docs/telemetry/charter-wizard.md†L8-L33】
2. Record preview coverage (`preview_count`) and session finalization state to confirm that QA transcripts mirror the production experience.【F:docs/telemetry/charter-wizard.md†L8-L34】
3. Flag any validation rule that exceeds two re-asks in rehearsal so copy or instructions can be updated before the next run.【F:docs/telemetry/charter-wizard.md†L16-L33】

## Pilot exit criteria

The pilot can exit to general availability when **at least 90% of charter sessions reach `session_finalized = true` without manual interventions or ad-hoc retries**. Monitor the completion rate using the telemetry exports or the golden-run outputs as a baseline, and escalate any rule or UX issue that pushes the completion rate below this threshold.【F:docs/telemetry/charter-wizard.md†L8-L34】

