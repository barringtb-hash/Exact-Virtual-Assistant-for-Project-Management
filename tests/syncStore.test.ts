/**
---
scenario: SyncStore Test
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

import {
  applyPatch,
  beginAgentTurn,
  completeAgentTurn,
  ingestInput,
  resetSyncStore,
  setPolicy,
  submitFinalInput,
  syncStoreApi,
} from "../src/state/syncStore.ts";
import type { DocumentPatch, NormalizedInputEvent } from "../src/types/sync.ts";

test("draft events stay in the preview buffer until finalized", () => {
  resetSyncStore();

  const event: NormalizedInputEvent = {
    id: "evt-1",
    turnId: "turn-1",
    source: "user",
    stage: "draft",
    content: "Hello there",
    createdAt: 1,
  };

  ingestInput(event);

  let state = syncStoreApi.getState();
  assert.equal(state.buffers.preview.length, 1);
  assert.equal(state.buffers.final.length, 0);
  assert.equal(state.turns.length, 1);
  assert.equal(state.turns[0]?.status, "open");

  submitFinalInput(event.turnId, 10);

  state = syncStoreApi.getState();
  assert.equal(state.buffers.preview.length, 0);
  assert.equal(state.buffers.final.length, 1);
  assert.equal(state.buffers.final[0]?.stage, "final");
  assert.equal(state.turns[0]?.status, "finalized");
  assert.equal(state.turns[0]?.completedAt, 10);
});

test("submitFinalInput normalizes content, skips empties, and dedupes within a second", () => {
  resetSyncStore();

  const firstEvent: NormalizedInputEvent = {
    id: "evt-normalize-1",
    turnId: "turn-normalize-1",
    source: "user",
    stage: "draft",
    content: "  Hello   world  ",
    createdAt: 1_000,
  };

  ingestInput(firstEvent);
  submitFinalInput(firstEvent.turnId, 1_000);

  let state = syncStoreApi.getState();
  assert.equal(state.buffers.final.length, 1);
  assert.equal(state.buffers.final[0]?.content, "Hello world");
  assert.equal(state.recentFinalInputs.length, 1);

  const duplicateEvent: NormalizedInputEvent = {
    id: "evt-normalize-2",
    turnId: "turn-normalize-2",
    source: "user",
    stage: "draft",
    content: "Hello world",
    createdAt: 1_500,
  };

  ingestInput(duplicateEvent);
  submitFinalInput(duplicateEvent.turnId, 1_500);

  state = syncStoreApi.getState();
  assert.equal(state.buffers.final.length, 1);
  assert.equal(state.recentFinalInputs.length, 1);
  const duplicateTurn = state.turns.find((turn) => turn.id === duplicateEvent.turnId);
  assert(duplicateTurn);
  assert.equal(duplicateTurn.events.length, 0);

  const whitespaceEvent: NormalizedInputEvent = {
    id: "evt-normalize-3",
    turnId: "turn-normalize-3",
    source: "user",
    stage: "draft",
    content: "     ",
    createdAt: 1_600,
  };

  ingestInput(whitespaceEvent);
  submitFinalInput(whitespaceEvent.turnId, 1_600);

  state = syncStoreApi.getState();
  assert.equal(state.buffers.final.length, 1);
  const whitespaceTurn = state.turns.find((turn) => turn.id === whitespaceEvent.turnId);
  assert(whitespaceTurn);
  assert.equal(whitespaceTurn.events.length, 0);
  assert.equal(state.recentFinalInputs.length, 1);

  const laterEvent: NormalizedInputEvent = {
    id: "evt-normalize-4",
    turnId: "turn-normalize-4",
    source: "user",
    stage: "draft",
    content: "Hello   world",
    createdAt: 2_600,
  };

  ingestInput(laterEvent);
  submitFinalInput(laterEvent.turnId, 2_600);

  state = syncStoreApi.getState();
  assert.equal(state.buffers.final.length, 2);
  assert.equal(state.buffers.final[1]?.content, "Hello world");
  assert.equal(state.recentFinalInputs.length, 1);
  assert.equal(state.recentFinalInputs[0]?.timestamp, 2_600);
});

test("ingestInput appends to the active turn", () => {
  resetSyncStore();

  const first: NormalizedInputEvent = {
    id: "evt-2",
    turnId: "turn-2",
    source: "user",
    stage: "draft",
    content: "Draft 1",
    createdAt: 1,
  };

  const second: NormalizedInputEvent = {
    id: "evt-3",
    turnId: "turn-2",
    source: "user",
    stage: "draft",
    content: "Draft 2",
    createdAt: 2,
  };

  ingestInput(first);
  ingestInput(second);

  const state = syncStoreApi.getState();
  assert.equal(state.turns.length, 1);
  assert.equal(state.turns[0]?.events.length, 2);
  assert.equal(state.buffers.preview.length, 2);
  assert.equal(state.turns[0]?.events[1]?.content, "Draft 2");
});

test("applyPatch merges document fields and records the patch", () => {
  resetSyncStore();

  const patch: DocumentPatch = {
    id: "patch-1",
    version: 1,
    fields: { title: "Project Mercury" },
    appliedAt: 25,
  };

  applyPatch(patch);

  const state = syncStoreApi.getState();
  assert.equal(state.draft.version, 1);
  assert.equal(state.draft.fields.title, "Project Mercury");
  assert.equal(state.draft.updatedAt, 25);
  assert.equal(state.oplog.length, 1);
  assert.deepEqual(state.oplog[0], patch);
});

test("applyPatch ignores patches older than the current draft version", () => {
  resetSyncStore();

  const initial: DocumentPatch = {
    id: "patch-1",
    version: 1,
    fields: { title: "Initial" },
    appliedAt: 10,
  };

  const latest: DocumentPatch = {
    id: "patch-2",
    version: 2,
    fields: { description: "Up to date" },
    appliedAt: 20,
  };

  const stale: DocumentPatch = {
    id: "patch-3",
    version: 1,
    fields: { title: "Stale" },
    appliedAt: 30,
  };

  applyPatch(initial);
  applyPatch(latest);
  applyPatch(stale);

  const state = syncStoreApi.getState();
  assert.equal(state.draft.version, 2);
  assert.equal(state.draft.fields.title, "Initial");
  assert.equal(state.draft.fields.description, "Up to date");
  assert.equal(state.oplog.length, 2);
});

test("applyPatch buffers out-of-order sequences until missing entries arrive", () => {
  resetSyncStore();
  beginAgentTurn("agent-turn-buffer", 0);

  const originalNow = Date.now;
  try {
    Date.now = () => 100;
    const laterPatch: DocumentPatch = {
      id: "patch-buffer-2",
      version: 2,
      fields: { description: "Later" },
      appliedAt: 20,
    };
    applyPatch(laterPatch, { turnId: "agent-turn-buffer", seq: 1 });

    let state = syncStoreApi.getState();
    assert.equal(state.draft.version, 0);
    assert.equal(state.oplog.length, 0);
    const bufferedQueue = state.patchQueues["agent-turn-buffer"];
    assert(bufferedQueue);
    assert.equal(bufferedQueue.buffer.length, 1);

    Date.now = () => 150;
    const firstPatch: DocumentPatch = {
      id: "patch-buffer-1",
      version: 1,
      fields: { title: "First" },
      appliedAt: 10,
    };
    applyPatch(firstPatch, { turnId: "agent-turn-buffer", seq: 0 });

    state = syncStoreApi.getState();
    assert.equal(state.draft.version, 2);
    assert.equal(state.draft.fields.title, "First");
    assert.equal(state.draft.fields.description, "Later");
    assert.equal(state.oplog.length, 2);
    const flushedQueue = state.patchQueues["agent-turn-buffer"];
    assert(flushedQueue);
    assert.equal(flushedQueue.buffer.length, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("applyPatch logs a patch gap after waiting more than one second", () => {
  resetSyncStore();
  beginAgentTurn("agent-turn-gap", 0);

  const originalNow = Date.now;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    Date.now = () => 100;
    const skipped: DocumentPatch = {
      id: "patch-gap-1",
      version: 1,
      fields: { title: "Gap" },
      appliedAt: 5,
    };
    applyPatch(skipped, { turnId: "agent-turn-gap", seq: 2 });

    Date.now = () => 1_205;
    const nextPatch: DocumentPatch = {
      id: "patch-gap-2",
      version: 2,
      fields: { description: "Next" },
      appliedAt: 6,
    };
    applyPatch(nextPatch, { turnId: "agent-turn-gap", seq: 3 });

    const state = syncStoreApi.getState();
    assert.equal(state.draft.version, 2);
    assert.equal(state.draft.fields.title, "Gap");
    assert.equal(state.draft.fields.description, "Next");
    assert.equal(state.oplog.length, 2);
    const gapQueue = state.patchQueues["agent-turn-gap"];
    assert(gapQueue);
    assert.equal(gapQueue.buffer.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.[0], "sync.patch_gap");
    assert.deepEqual(warnings[0]?.[1], { expected: 0, received: 2, turnId: "agent-turn-gap" });
  } finally {
    Date.now = originalNow;
    console.warn = originalWarn;
  }
});

test("applyPatch ignores patches for unknown turns", () => {
  resetSyncStore();

  const patch: DocumentPatch = {
    id: "patch-unknown",
    version: 1,
    fields: { title: "Ignored" },
    appliedAt: 5,
  };

  applyPatch(patch, { turnId: "missing-turn", seq: 0 });

  const state = syncStoreApi.getState();
  assert.equal(state.draft.version, 0);
  assert.equal(state.oplog.length, 0);
  assert.equal(Object.keys(state.patchQueues).length, 0);
});

test("pendingTurn restores buffers when no patches apply", () => {
  resetSyncStore();

  const draftEvent: NormalizedInputEvent = {
    id: "evt-pending-1",
    turnId: "turn-pending-1",
    source: "user",
    stage: "draft",
    content: "Draft content",
    createdAt: 1,
  };

  ingestInput(draftEvent);
  beginAgentTurn("agent-pending", 10);

  completeAgentTurn("agent-pending", 20);

  const state = syncStoreApi.getState();
  assert.equal(state.pendingTurn, undefined);
  assert.equal(state.buffers.preview.length, 1);
  assert.equal(state.buffers.preview[0]?.id, draftEvent.id);
  const agentTurn = state.turns.find((turn) => turn.id === "agent-pending");
  assert(agentTurn);
  assert.equal(agentTurn.status, "finalized");
});

test("pendingTurn clears without restoring buffers when a patch is applied", () => {
  resetSyncStore();

  beginAgentTurn("agent-patched", 0);

  const originalNow = Date.now;
  try {
    Date.now = () => 50;
    const patch: DocumentPatch = {
      id: "patch-pending",
      version: 1,
      fields: { title: "Patched" },
      appliedAt: 5,
    };
    applyPatch(patch, { turnId: "agent-patched", seq: 0 });
  } finally {
    Date.now = originalNow;
  }

  let state = syncStoreApi.getState();
  assert(state.pendingTurn);
  assert.equal(state.pendingTurn?.hasAppliedPatch, true);

  completeAgentTurn("agent-patched", 100);

  state = syncStoreApi.getState();
  assert.equal(state.pendingTurn, undefined);
  assert.equal(state.buffers.preview.length, 0);
  assert.equal(state.draft.fields.title, "Patched");
});

test("exclusive policy finalizes previous turns when another source speaks", () => {
  resetSyncStore({ policy: "exclusive" });

  const userEvent: NormalizedInputEvent = {
    id: "evt-4",
    turnId: "turn-user",
    source: "user",
    stage: "draft",
    content: "User drafting",
    createdAt: 5,
  };

  const agentEvent: NormalizedInputEvent = {
    id: "evt-5",
    turnId: "turn-agent",
    source: "agent",
    stage: "draft",
    content: "Agent drafting",
    createdAt: 6,
  };

  ingestInput(userEvent);
  ingestInput(agentEvent);

  const state = syncStoreApi.getState();
  const userTurn = state.turns.find((turn) => turn.id === "turn-user");
  assert(userTurn);
  assert.equal(userTurn.status, "finalized");
  assert.equal(state.buffers.preview.length, 1);
  assert.equal(state.buffers.preview[0]?.turnId, "turn-agent");
  const committed = state.buffers.final.find((event) => event.turnId === "turn-user");
  assert(committed);
  assert.equal(committed.stage, "final");
});

test("mixed policy allows concurrent open turns", () => {
  resetSyncStore({ policy: "mixed" });

  const userEvent: NormalizedInputEvent = {
    id: "evt-6",
    turnId: "turn-mixed-user",
    source: "user",
    stage: "draft",
    content: "User draft",
    createdAt: 11,
  };

  const agentEvent: NormalizedInputEvent = {
    id: "evt-7",
    turnId: "turn-mixed-agent",
    source: "agent",
    stage: "draft",
    content: "Agent draft",
    createdAt: 12,
  };

  ingestInput(userEvent);
  ingestInput(agentEvent);

  const state = syncStoreApi.getState();
  const userTurn = state.turns.find((turn) => turn.id === "turn-mixed-user");
  const agentTurn = state.turns.find((turn) => turn.id === "turn-mixed-agent");
  assert(userTurn);
  assert(agentTurn);
  assert.equal(userTurn.status, "open");
  assert.equal(agentTurn.status, "open");
  assert.equal(state.buffers.preview.length, 2);
  assert.equal(state.buffers.final.length, 0);
});

test("switching back to exclusive policy finalizes older open turns", () => {
  resetSyncStore({ policy: "mixed" });

  const first: NormalizedInputEvent = {
    id: "evt-8",
    turnId: "turn-a",
    source: "user",
    stage: "draft",
    content: "First",
    createdAt: 20,
  };

  const second: NormalizedInputEvent = {
    id: "evt-9",
    turnId: "turn-b",
    source: "agent",
    stage: "draft",
    content: "Second",
    createdAt: 21,
  };

  ingestInput(first);
  ingestInput(second);

  setPolicy("exclusive", { timestamp: 30 });

  const state = syncStoreApi.getState();
  const firstTurn = state.turns.find((turn) => turn.id === "turn-a");
  const secondTurn = state.turns.find((turn) => turn.id === "turn-b");
  assert(firstTurn);
  assert(secondTurn);
  assert.equal(firstTurn.status, "finalized");
  assert.equal(firstTurn.completedAt, 30);
  assert.equal(secondTurn.status, "open");
});
