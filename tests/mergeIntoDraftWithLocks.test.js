/**
---
scenario: MergeIntoDraftWithLocks Test
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

import { mergeIntoDraftWithLocks } from "../src/lib/preview/mergeIntoDraftWithLocks.js";

const FIXED_TIMESTAMP = 1_725_897_600_000;

test("mergeIntoDraftWithLocks respects locked paths", () => {
  const currentDraft = {
    title: "Original Charter",
    sections: {
      intro: "Existing intro",
      summary: "Existing summary",
    },
  };

  const incomingDraft = {
    title: "Updated Charter",
    sections: {
      intro: "Fresh intro",
      summary: "Fresh summary",
    },
  };

  const locks = {
    title: true,
    "sections.summary": true,
  };

  const result = mergeIntoDraftWithLocks(currentDraft, incomingDraft, locks, {
    source: "AI",
    updatedAt: FIXED_TIMESTAMP,
  });

  assert.deepEqual(result.draft, {
    title: "Original Charter",
    sections: {
      intro: "Fresh intro",
      summary: "Existing summary",
    },
  });

  assert.equal(result.metadataByPointer.has("/title"), false);
  assert.equal(result.metadataByPointer.has("/sections/summary"), false);
  const introMetadata = result.metadataByPointer.get("/sections/intro");
  assert.ok(introMetadata, "expected unlocked field metadata to be tracked");
  assert.equal(introMetadata.source, "AI");
  assert.equal(introMetadata.updatedAt, FIXED_TIMESTAMP);
});

test("mergeIntoDraftWithLocks annotates unlocked updates with metadata", () => {
  const currentDraft = {
    overview: "Initial overview",
    stakeholders: { owner: "Taylor" },
  };

  const incomingDraft = {
    overview: "Initial overview",
    stakeholders: { owner: "Jordan", reviewer: "Kai" },
  };

  const locks = new Map([["/overview", true]]);

  const result = mergeIntoDraftWithLocks(currentDraft, incomingDraft, locks, {
    source: "AI",
    updatedAt: FIXED_TIMESTAMP,
  });

  assert.equal(result.draft.overview, "Initial overview");
  assert.deepEqual(result.draft.stakeholders, { owner: "Jordan", reviewer: "Kai" });

  const ownerMetadata = result.metadataByPointer.get("/stakeholders/owner");
  assert.ok(ownerMetadata);
  assert.equal(ownerMetadata.source, "AI");
  assert.equal(ownerMetadata.updatedAt, FIXED_TIMESTAMP);

  const reviewerMetadata = result.metadataByPointer.get("/stakeholders/reviewer");
  assert.ok(reviewerMetadata);
  assert.equal(reviewerMetadata.source, "AI");
  assert.equal(reviewerMetadata.updatedAt, FIXED_TIMESTAMP);

  assert.equal(result.metadataByPointer.has("/overview"), false);
  assert.deepEqual(Array.from(result.updatedPaths).sort(), [
    "stakeholders",
    "stakeholders.owner",
    "stakeholders.reviewer",
  ]);
});
