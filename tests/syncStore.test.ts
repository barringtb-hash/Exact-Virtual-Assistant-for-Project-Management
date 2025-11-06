import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPatch,
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
