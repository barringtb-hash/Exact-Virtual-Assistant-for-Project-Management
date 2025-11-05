# Charter Wizard Telemetry

The charter wizard emits normalized telemetry so operations and analytics teams can monitor step-by-step completion quality without exposing user-entered text.
All CSV exports share the schema defined in [`FIELD_METRIC_HEADER`](../../lib/telemetry/fieldMetrics.js).

## CSV columns

| Column | Description | Notes |
| --- | --- | --- |
| `timestamp` | ISO-8601 timestamp when the row was generated. | Represents the flush time, not the original ask moment. |
| `session_id` | An anonymized identifier for the conversation session. | Reset whenever a new schema/version starts. |
| `document_type` | Sanitized document type reported by the client. | Expected to be `charter`. |
| `schema_version` | Version string of the active charter schema. | Useful for correlating template updates. |
| `field_id` | Sanitized field identifier. | Matches charter schema field IDs. |
| `field_position` | One-based index of the field in the schema ordering. | Empty if the field was never displayed. |
| `ask_count` | Number of prompts for the field (including re-asks). | Minimum healthy value is `1` for visible fields. |
| `reask_count` | Count of re-ask cycles triggered by validation errors. | Values greater than `2` merit a rules review. |
| `reask_codes` | Semi-colon separated `<code>:<count>` breakdown for validation failures. | Codes align with `FieldValidationIssue.code`. |
| `skip_count` | Number of times the field was skipped. | Should be `0` for required fields unless validation exhausted. |
| `skip_reasons` | Semi-colon separated `<reason>:<count>` describing skip outcomes. | Reasons are sanitized tokens (e.g., `user-skipped`, `hidden`). |
| `preview_count` | Number of preview cycles completed while the field was present. | Expected baseline is `1` per finalized charter. |
| `completion_status` | `confirmed`, `skipped`, or `pending`. | Only `confirmed` and `skipped` should appear in finalized sessions. |
| `completion_reason` | The sanitized reason associated with the completion outcome. | `confirmed` or the dominant skip reason. |
| `first_asked_at` | ISO timestamp of the first prompt for the field. | Empty when a field was never displayed. |
| `completed_at` | ISO timestamp when the field reached a terminal state. | Used with `first_asked_at` to compute durations. |
| `duration_ms` | Milliseconds between the first ask and completion. | Long durations (>120000 ms) should be reviewed for UX friction. |
| `session_finalized` | `true` if the session emitted a finalize event before export. | `false` rows indicate incomplete conversations. |

## Threshold guidance

- **Re-ask rate**: track the ratio `reask_count / ask_count`. Values above `0.5` consistently indicate confusing instructions or overly strict validators.
- **Skip rate**: monitor `skip_count` for required fields. Anything above `5%` for a given field suggests either relevance issues or validation fatigue.
- **Completion latency**: flag fields with median `duration_ms` greater than **120,000 ms (2 minutes)**. Coordinate UX improvements for those prompts.
- **Preview coverage**: `preview_count` should be at least `1` for every field in finalized sessions. Zero counts imply premature exits before review.

## Log rotation

Telemetry batches append to `${CHARTER_TELEMETRY_ROOT:-/tmp}/charter-wizard/metrics.csv`. When the file exceeds **5 MB**, it rotates to `metrics-<timestamp>.csv` and a fresh file is created with the same header. Consumers should be resilient to multiple CSV files when building long-term aggregates.
