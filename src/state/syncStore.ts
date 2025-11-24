import { createStore, useStore } from "../lib/tinyStore.ts";
import { FEATURE_FLAGS } from "../config/featureFlags.ts";
import { createId } from "../utils/id.js";
import { produce } from "immer";
import type {
  AgentTurn,
  DraftDocument,
  DocumentPatch,
  NormalizedInputEvent,
  PatchQueueState,
  PendingTurnState,
  RecentFinalInputEntry,
  SyncBuffers,
  SyncState,
  InputPolicy,
} from "../types/sync.ts";

type WorkingState = {
  turns: AgentTurn[];
  buffers: SyncBuffers;
  activeTurnId?: string;
  recentFinalInputs: RecentFinalInputEntry[];
};

type ApplyPatchOptions = {
  turnId?: string;
  seq?: number;
};

const cloneMetadata = (metadata: Record<string, unknown> | undefined) =>
  metadata ? { ...metadata } : undefined;

const DEDUPE_WINDOW_MS = 1_000;
const PATCH_GAP_WAIT_MS = 1_000;
const GLOBAL_PATCH_QUEUE_KEY = "__global__";

function cloneEvent(event: NormalizedInputEvent): NormalizedInputEvent {
  return { ...event, metadata: cloneMetadata(event.metadata) };
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function cloneBuffers(buffers: SyncBuffers): SyncBuffers {
  return {
    preview: buffers.preview.map(cloneEvent),
    final: buffers.final.map(cloneEvent),
  };
}

function cloneRecentFinalInputs(entries: RecentFinalInputEntry[]): RecentFinalInputEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function clonePatchQueue(queue: PatchQueueState): PatchQueueState {
  return {
    expectedSeq: queue.expectedSeq,
    buffer: queue.buffer.map((entry) => ({
      seq: entry.seq,
      receivedAt: entry.receivedAt,
      turnId: entry.turnId,
      patch: {
        ...entry.patch,
        fields: { ...entry.patch.fields },
      },
    })),
  };
}

function clonePendingTurnState(pending: PendingTurnState | undefined): PendingTurnState | undefined {
  if (!pending) {
    return undefined;
  }
  return {
    id: pending.id,
    startedAt: pending.startedAt,
    hasAppliedPatch: pending.hasAppliedPatch,
    activeTurnId: pending.activeTurnId,
    buffers: cloneBuffers(pending.buffers),
  };
}

function getPatchQueueKey(turnId?: string) {
  return turnId ?? GLOBAL_PATCH_QUEUE_KEY;
}

function logPatchGapEvent(details: Record<string, unknown>) {
  try {
    console.warn("sync.patch_gap", details);
  } catch (_) {
    // noop
  }
}

// cloneWorkingState removed - now using immer for immutable updates

function ensureTurn(work: WorkingState, event: NormalizedInputEvent): AgentTurn {
  let turn = work.turns.find((candidate) => candidate.id === event.turnId);
  if (!turn) {
    turn = {
      id: event.turnId,
      source: event.source,
      events: [],
      status: event.stage === "final" ? "finalized" : "open",
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
      completedAt: event.stage === "final" ? event.createdAt : undefined,
    };
    work.turns.push(turn);
  }
  return turn;
}

function finalizeTurn(work: WorkingState, turnId: string, timestamp: number) {
  const turnIndex = work.turns.findIndex((turn) => turn.id === turnId);
  if (turnIndex === -1) {
    return;
  }

  const target = work.turns[turnIndex];
  target.status = "finalized";
  target.completedAt = timestamp;
  target.updatedAt = timestamp;
  target.events = target.events.map((event) => {
    if (event.stage === "final") {
      return cloneEvent(event);
    }
    const next = cloneEvent(event);
    next.stage = "final";
    return next;
  });

  const preview: NormalizedInputEvent[] = [];
  const finalized: NormalizedInputEvent[] = [...work.buffers.final];
  for (const pending of work.buffers.preview) {
    if (pending.turnId === turnId) {
      finalized.push({ ...pending, stage: "final" });
    } else {
      preview.push(pending);
    }
  }
  work.buffers = { preview, final: finalized };

  if (work.activeTurnId === turnId) {
    work.activeTurnId = undefined;
  }
}

function ensureAgentTurn(turns: AgentTurn[], turnId: string, timestamp: number): AgentTurn[] {
  const existingIndex = turns.findIndex((turn) => turn.id === turnId);
  if (existingIndex === -1) {
    const created: AgentTurn = {
      id: turnId,
      source: "agent",
      events: [],
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return [...turns, created];
  }

  const existing = turns[existingIndex];
  if (existing.source !== "agent") {
    return turns;
  }

  const updated: AgentTurn = {
    ...existing,
    status: "open",
    completedAt: undefined,
    updatedAt: Math.max(existing.updatedAt, timestamp),
  };
  if (
    existing.status === updated.status &&
    existing.completedAt === updated.completedAt &&
    existing.updatedAt === updated.updatedAt
  ) {
    return turns;
  }
  const next = [...turns];
  next[existingIndex] = updated;
  return next;
}

function updateAgentTurnId(turns: AgentTurn[], fromId: string, toId: string, timestamp: number): AgentTurn[] {
  if (!fromId || fromId === toId) {
    return ensureAgentTurn(turns, toId, timestamp);
  }

  let replaced = false;
  const nextTurns: AgentTurn[] = [];

  for (const turn of turns) {
    if (turn.id === fromId && turn.source === "agent") {
      replaced = true;
      const updated = { ...turn, id: toId, updatedAt: Math.max(turn.updatedAt, timestamp) };
      nextTurns.push(updated);
      continue;
    }
    if (turn.id === toId && turn.source === "agent") {
      if (!replaced) {
        replaced = true;
        const updated = {
          ...turn,
          status: "open",
          completedAt: undefined,
          updatedAt: Math.max(turn.updatedAt, timestamp),
        };
        nextTurns.push(updated);
      }
      continue;
    }
    nextTurns.push(turn);
  }

  if (!replaced) {
    nextTurns.push({
      id: toId,
      source: "agent",
      events: [],
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return nextTurns;
}

const DEFAULT_DRAFT: DraftDocument = {
  version: 0,
  fields: {},
  updatedAt: 0,
};

function createInitialState(): SyncState {
  return {
    layer: FEATURE_FLAGS.INPUT_SYNC_LAYER,
    policy: FEATURE_FLAGS.INPUT_POLICY,
    draft: { ...DEFAULT_DRAFT },
    oplog: [],
    turns: [],
    buffers: { preview: [], final: [] },
    activeTurnId: undefined,
    recentFinalInputs: [],
    patchQueues: {},
    pendingTurn: undefined,
  };
}

const syncStore = createStore<SyncState>(createInitialState());

export function resetSyncStore(overrides?: Partial<SyncState>) {
  const base = createInitialState();
  const draft = overrides?.draft ? { ...base.draft, ...overrides.draft } : { ...base.draft };
  const buffers: SyncBuffers = overrides?.buffers ? cloneBuffers(overrides.buffers) : cloneBuffers(base.buffers);
  const turns = overrides?.turns
    ? overrides.turns.map((turn) => ({
        ...turn,
        events: turn.events.map(cloneEvent),
      }))
    : [];
  const oplog = overrides?.oplog
    ? overrides.oplog.map((patch) => ({
        ...patch,
        fields: { ...patch.fields },
      }))
    : [];
  const recentFinalInputs = overrides?.recentFinalInputs
    ? cloneRecentFinalInputs(overrides.recentFinalInputs)
    : [];
  const patchQueues = overrides?.patchQueues
    ? Object.fromEntries(
        Object.entries(overrides.patchQueues).map(([key, queue]) => [key, clonePatchQueue(queue)]),
      )
    : {};
  const pendingTurn = clonePendingTurnState(overrides?.pendingTurn);

  syncStore.setState(
    {
      layer: overrides?.layer ?? base.layer,
      policy: overrides?.policy ?? base.policy,
      draft,
      oplog,
      turns,
      buffers,
      activeTurnId: overrides?.activeTurnId,
      recentFinalInputs,
      patchQueues,
      pendingTurn,
    },
    true,
  );
}

export function ingestInput(event: NormalizedInputEvent) {
  syncStore.setState((state) =>
    produce(state, (draft) => {
      if (state.policy === "exclusive") {
        for (const turn of draft.turns) {
          if (turn.status === "open" && turn.id !== event.turnId && turn.source !== event.source) {
            finalizeTurn(draft, turn.id, event.createdAt);
          }
        }
      }

      const normalized = cloneEvent(event);
      const turn = ensureTurn(draft, normalized);
      turn.events.push(normalized);
      turn.updatedAt = normalized.createdAt;
      if (turn.events.length === 1) {
        turn.createdAt = normalized.createdAt;
      }

      if (normalized.stage === "final") {
        finalizeTurn(draft, normalized.turnId, normalized.createdAt);
        draft.buffers.final.push(normalized);
      } else {
        turn.status = "open";
        turn.completedAt = undefined;
        draft.buffers.preview.push(normalized);
        draft.activeTurnId = turn.id;
      }
    })
  );
}

export function submitFinalInput(turnId?: string, timestamp?: number) {
  syncStore.setState((state) =>
    produce(state, (draft) => {
      const now = timestamp ?? Date.now();
      const targetId =
        turnId ??
        draft.activeTurnId ??
        draft.turns
          .filter((turn) => turn.status === "open")
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;

      if (!targetId) {
        return;
      }

      const turnIndex = draft.turns.findIndex((turn) => turn.id === targetId);
      if (turnIndex === -1) {
        return;
      }

      const targetTurn = draft.turns[turnIndex];
      const windowStart = now - DEDUPE_WINDOW_MS;
      const recentEntries = draft.recentFinalInputs.filter((entry) => entry.timestamp >= windowStart);
      const seenContents = new Set(recentEntries.map((entry) => entry.content));

      const sanitizedById = new Map<string, NormalizedInputEvent>();
      for (const event of draft.buffers.preview) {
        if (event.turnId !== targetId) {
          continue;
        }
        const normalized = normalizeContent(event.content);
        if (!normalized) {
          continue;
        }
        if (seenContents.has(normalized)) {
          continue;
        }
        const sanitized = cloneEvent(event);
        sanitized.content = normalized;
        sanitizedById.set(event.id, sanitized);
        recentEntries.push({ content: normalized, timestamp: now });
        seenContents.add(normalized);
      }

      const nextPreview: NormalizedInputEvent[] = [];
      for (const event of draft.buffers.preview) {
        if (event.turnId !== targetId) {
          nextPreview.push(event);
          continue;
        }
        const sanitized = sanitizedById.get(event.id);
        if (sanitized) {
          nextPreview.push(sanitized);
        }
      }
      draft.buffers.preview = nextPreview;

      const nextEvents: NormalizedInputEvent[] = [];
      for (const event of targetTurn.events) {
        if (event.turnId !== targetId) {
          nextEvents.push(event);
          continue;
        }
        if (event.stage === "final") {
          nextEvents.push(event);
          continue;
        }
        const sanitized = sanitizedById.get(event.id);
        if (sanitized) {
          nextEvents.push(sanitized);
        }
      }
      targetTurn.events = nextEvents;
      draft.recentFinalInputs = recentEntries;

      finalizeTurn(draft, targetId, now);
    })
  );
}

export function applyPatch(patch: DocumentPatch, options: ApplyPatchOptions = {}) {
  const invocationTime = Date.now();
  syncStore.setState((state) => {
    const turnId = typeof options.turnId === "string" && options.turnId ? options.turnId : undefined;
    const seq = typeof options.seq === "number" && Number.isFinite(options.seq) ? options.seq : undefined;

    if (turnId) {
      const hasTurn = state.turns.some((turn) => turn.id === turnId && turn.source === "agent");
      if (!hasTurn) {
        return {};
      }
    }

    let draft = state.draft;
    let draftChanged = false;
    let oplog = state.oplog;
    let oplogChanged = false;
    const appliedPatchIds = new Set(oplog.map((entry) => entry.id));
    let pendingTurn = state.pendingTurn;
    let pendingTurnChanged = false;

    const nextPatchQueues = { ...state.patchQueues };
    let patchQueuesChanged = false;

    const markPendingTurnPatched = (candidateTurnId?: string) => {
      if (!pendingTurn || !candidateTurnId) {
        return;
      }
      if (pendingTurn.id !== candidateTurnId || pendingTurn.hasAppliedPatch) {
        return;
      }
      pendingTurn = { ...pendingTurn, hasAppliedPatch: true };
      pendingTurnChanged = true;
    };

    const applyEntry = (entryPatch: DocumentPatch, entryTurnId?: string) => {
      if (appliedPatchIds.has(entryPatch.id)) {
        return false;
      }
      const patchCopy: DocumentPatch = {
        ...entryPatch,
        fields: { ...entryPatch.fields },
      };
      const nextDraft: DraftDocument = {
        version: draft.version + 1,
        fields: { ...draft.fields, ...patchCopy.fields },
        updatedAt: Math.max(draft.updatedAt, patchCopy.appliedAt),
      };
      draft = nextDraft;
      oplog = [...oplog, patchCopy];
      appliedPatchIds.add(patchCopy.id);
      draftChanged = true;
      oplogChanged = true;
      markPendingTurnPatched(entryTurnId ?? turnId ?? pendingTurn?.id);
      return true;
    };

    if (seq === undefined) {
      if (patch.version <= state.draft.version) {
        return {};
      }
      const applied = applyEntry(patch, turnId);
      if (!applied && !pendingTurnChanged) {
        return {};
      }
    } else {
      const queueKey = getPatchQueueKey(turnId);
      const existingQueue = nextPatchQueues[queueKey];
      const queue = existingQueue ? clonePatchQueue(existingQueue) : { expectedSeq: 0, buffer: [] };
      if (!existingQueue) {
        patchQueuesChanged = true;
      }

      const normalizedSeq = Math.floor(seq);
      if (normalizedSeq < queue.expectedSeq) {
        // Stale patch; continue to flush buffered entries.
      } else if (normalizedSeq === queue.expectedSeq) {
        applyEntry(patch, turnId);
        queue.expectedSeq = normalizedSeq + 1;
        patchQueuesChanged = true;
      } else {
        const clonedPatch: DocumentPatch = {
          ...patch,
          fields: { ...patch.fields },
        };
        const existingIndex = queue.buffer.findIndex((entry) => entry.seq === normalizedSeq);
        if (existingIndex !== -1) {
          queue.buffer.splice(existingIndex, 1);
        }
        queue.buffer.push({ seq: normalizedSeq, receivedAt: invocationTime, patch: clonedPatch, turnId });
        queue.buffer.sort((a, b) => a.seq - b.seq);
        patchQueuesChanged = true;
      }

      const flushQueue = () => {
        while (true) {
          const exactIndex = queue.buffer.findIndex((entry) => entry.seq === queue.expectedSeq);
          if (exactIndex !== -1) {
            const [entry] = queue.buffer.splice(exactIndex, 1);
            patchQueuesChanged = true;
            applyEntry(entry.patch, entry.turnId);
            queue.expectedSeq = entry.seq + 1;
            continue;
          }
          const earliest = queue.buffer.reduce<typeof queue.buffer[number] | null>((acc, entry) => {
            if (!acc || entry.seq < acc.seq) {
              return entry;
            }
            return acc;
          }, null);
          if (earliest && earliest.seq > queue.expectedSeq && invocationTime - earliest.receivedAt >= PATCH_GAP_WAIT_MS) {
            logPatchGapEvent({ expected: queue.expectedSeq, received: earliest.seq, turnId: turnId ?? earliest.turnId });
            queue.buffer = queue.buffer.filter((candidate) => candidate !== earliest);
            patchQueuesChanged = true;
            applyEntry(earliest.patch, earliest.turnId);
            queue.expectedSeq = earliest.seq + 1;
            continue;
          }
          break;
        }
      };

      flushQueue();
      nextPatchQueues[queueKey] = queue;
    }

    const result: Partial<SyncState> = {};
    if (draftChanged) {
      result.draft = draft;
    }
    if (oplogChanged) {
      result.oplog = oplog;
    }
    if (patchQueuesChanged) {
      result.patchQueues = nextPatchQueues;
    }
    if (pendingTurnChanged) {
      result.pendingTurn = pendingTurn;
    }

    return Object.keys(result).length > 0 ? result : {};
  });
}

export function beginAgentTurn(turnId?: string, timestamp = Date.now()): string {
  const resolvedId = turnId ?? `agent-${createId()}`;
  syncStore.setState((state) => {
    const turns = ensureAgentTurn(state.turns, resolvedId, timestamp);
    let pendingTurnUpdate: PendingTurnState | undefined;
    if (!state.pendingTurn || state.pendingTurn.id !== resolvedId) {
      pendingTurnUpdate = {
        id: resolvedId,
        startedAt: timestamp,
        hasAppliedPatch: false,
        buffers: cloneBuffers(state.buffers),
        activeTurnId: state.activeTurnId,
      };
    }

    const result: Partial<SyncState> = {};
    if (turns !== state.turns) {
      result.turns = turns;
    }
    if (pendingTurnUpdate) {
      result.pendingTurn = pendingTurnUpdate;
    }

    return Object.keys(result).length > 0 ? result : {};
  });
  return resolvedId;
}

export function completeAgentTurn(turnId: string, timestamp = Date.now()) {
  if (!turnId) {
    return;
  }
  syncStore.setState((state) => {
    const index = state.turns.findIndex((turn) => turn.id === turnId && turn.source === "agent");
    const result: Partial<SyncState> = {};

    if (index !== -1) {
      const target = state.turns[index];
      const shouldUpdateTurn =
        target.status !== "finalized" ||
        !target.completedAt ||
        target.completedAt < timestamp ||
        target.updatedAt < timestamp;

      if (shouldUpdateTurn) {
        const nextTurns = [...state.turns];
        nextTurns[index] = {
          ...target,
          status: "finalized",
          completedAt: timestamp,
          updatedAt: Math.max(target.updatedAt, timestamp),
        };
        result.turns = nextTurns;
      }
    }

    if (state.pendingTurn && state.pendingTurn.id === turnId) {
      if (!state.pendingTurn.hasAppliedPatch) {
        result.buffers = cloneBuffers(state.pendingTurn.buffers);
        result.activeTurnId = state.pendingTurn.activeTurnId;
      }
      result.pendingTurn = undefined;
    }

    return Object.keys(result).length > 0 ? result : {};
  });
}

export function reconcileAgentTurnId(previousId: string | undefined, nextId: string, timestamp = Date.now()): string {
  if (!nextId) {
    return previousId ?? "";
  }

  const resolvedPrevious = previousId ?? "";
  syncStore.setState((state) => {
    const turns = updateAgentTurnId(state.turns, resolvedPrevious, nextId, timestamp);
    const result: Partial<SyncState> = {};
    if (turns !== state.turns) {
      result.turns = turns;
    }
    const activeTurnId = state.activeTurnId === resolvedPrevious ? nextId : state.activeTurnId;
    if (activeTurnId !== state.activeTurnId) {
      result.activeTurnId = activeTurnId;
    }
    if (state.pendingTurn && state.pendingTurn.id === resolvedPrevious) {
      result.pendingTurn = {
        ...state.pendingTurn,
        id: nextId,
      };
    }

    return Object.keys(result).length > 0 ? result : {};
  });

  return nextId;
}

export function setPolicy(nextPolicy: InputPolicy, options: { timestamp?: number } = {}) {
  syncStore.setState((state) => {
    if (state.policy === nextPolicy) {
      return {};
    }

    if (nextPolicy === "exclusive") {
      return produce(state, (draft) => {
        const openTurns = draft.turns
          .filter((turn) => turn.status === "open")
          .sort((a, b) => b.updatedAt - a.updatedAt);
        const [latest, ...others] = openTurns;
        const timestamp = options.timestamp ?? Date.now();
        for (const turn of others) {
          finalizeTurn(draft, turn.id, timestamp);
        }
        if (latest) {
          draft.activeTurnId = latest.id;
        }
        draft.policy = nextPolicy;
      });
    }

    return { policy: nextPolicy };
  });
}

export const useDraft = () => useStore(syncStore, (state) => state.draft);
export const useBuffers = () => useStore(syncStore, (state) => state.buffers);

export const syncStoreApi = syncStore;
