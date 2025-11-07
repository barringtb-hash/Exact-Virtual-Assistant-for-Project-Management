/**
---
scenario: DocTypeRouter Test
feature: unknown
subsystem: unknown
envs: []
risk: unknown
owner: TBD
ci_suites: []
flaky: false
needs_review: true
preconditions:
  - TBD
data_setup: TBD
refs: []
---
*/

import assert from "node:assert/strict";
import test from "node:test";

import suggestDocType, {
  areDocTypeSuggestionsEqual,
  isDocTypeConfirmed,
  normalizeDocTypeSuggestion,
} from "../src/utils/docTypeRouter.js";

const VALID_TYPES = new Set(["charter", "ddp"]);

test("suggestDocType returns low confidence for unknown content", () => {
  const result = suggestDocType({ messages: [], attachments: [], voice: [] });
  assert.equal(result.type, "charter");
  assert.equal(result.confidence, 0);
});

test("suggestDocType boosts confidence when attachments reference DDP", () => {
  const result = suggestDocType({
    attachments: [
      {
        name: "requirements-ddp.txt",
        text: "This Design and Development Plan covers implementation details.",
      },
    ],
  });
  assert.equal(result.type, "ddp");
  assert.ok(
    result.confidence >= 0.7,
    `expected confidence to be at least 0.7, received ${result.confidence}`
  );
});

test("normalizeDocTypeSuggestion clamps invalid confidence values", () => {
  assert.equal(normalizeDocTypeSuggestion(null), null);
  assert.deepEqual(normalizeDocTypeSuggestion({ type: "ddp", confidence: 5 }), {
    type: "ddp",
    confidence: 1,
  });
  assert.deepEqual(normalizeDocTypeSuggestion({ type: "charter", confidence: -1 }), {
    type: "charter",
    confidence: 0,
  });
});

test("areDocTypeSuggestionsEqual tolerates small floating point differences", () => {
  const a = { type: "charter", confidence: 0.7000001 };
  const b = { type: "charter", confidence: 0.7000002 };
  assert.ok(areDocTypeSuggestionsEqual(a, b));
  assert.ok(!areDocTypeSuggestionsEqual(a, { type: "ddp", confidence: 0.7 }));
});

test("isDocTypeConfirmed requires either selection or high-confidence suggestion", () => {
  assert.ok(
    !isDocTypeConfirmed({
      selectedDocType: null,
      suggestion: { type: "ddp", confidence: 0.4 },
      threshold: 0.7,
      allowedTypes: VALID_TYPES,
    })
  );

  assert.ok(
    isDocTypeConfirmed({
      selectedDocType: null,
      suggestion: { type: "ddp", confidence: 0.8 },
      threshold: 0.7,
      allowedTypes: VALID_TYPES,
    })
  );

  assert.ok(
    isDocTypeConfirmed({
      selectedDocType: "charter",
      suggestion: { type: "ddp", confidence: 0.2 },
      threshold: 0.7,
      allowedTypes: VALID_TYPES,
    })
  );
});
