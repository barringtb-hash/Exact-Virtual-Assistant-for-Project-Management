import { createStore, useStore } from "../lib/tinyStore.ts";
import { FEATURE_FLAGS } from "../config/featureFlags.ts";
import type {
  AgentTurn,
  DraftDocument,
  DocumentPatch,
  NormalizedInputEvent,
  SyncBuffers,
  SyncState,
  InputPolicy,
} from "../types/sync.ts";

type WorkingState = {
  turns: AgentTurn[];
  buffers: SyncBuffers;
  activeTurnId?: string;
};

const cloneMetadata = (metadata: Record<string, unknown> | undefined) =>
  metadata ? { ...metadata } : undefined;

function cloneEvent(event: NormalizedInputEvent): NormalizedInputEvent {
  return { ...event, metadata: cloneMetadata(event.metadata) };
}

function cloneWorkingState(state: SyncState): WorkingState {
  return {
    turns: state.turns.map((turn) => ({
      ...turn,
      events: turn.events.map(cloneEvent),
    })),
    buffers: {
      preview: state.buffers.preview.map(cloneEvent),
      final: state.buffers.final.map(cloneEvent),
    },
    activeTurnId: state.activeTurnId,
  };
}

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
    work.turns = [...work.turns, turn];
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
  };
}

const syncStore = createStore<SyncState>(createInitialState());

export function resetSyncStore(overrides?: Partial<SyncState>) {
  const base = createInitialState();
  const draft = overrides?.draft ? { ...base.draft, ...overrides.draft } : { ...base.draft };
  const buffers: SyncBuffers = overrides?.buffers
    ? {
        preview: overrides.buffers.preview?.map(cloneEvent) ?? [],
        final: overrides.buffers.final?.map(cloneEvent) ?? [],
      }
    : { preview: [], final: [] };
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

  syncStore.setState(
    {
      layer: overrides?.layer ?? base.layer,
      policy: overrides?.policy ?? base.policy,
      draft,
      oplog,
      turns,
      buffers,
      activeTurnId: overrides?.activeTurnId,
    },
    true,
  );
}

export function ingestInput(event: NormalizedInputEvent) {
  syncStore.setState((state) => {
    const work = cloneWorkingState(state);

    if (state.policy === "exclusive") {
      for (const turn of work.turns.slice()) {
        if (turn.status === "open" && turn.id !== event.turnId && turn.source !== event.source) {
          finalizeTurn(work, turn.id, event.createdAt);
        }
      }
    }

    const normalized = cloneEvent(event);
    const turn = ensureTurn(work, normalized);
    turn.events = [...turn.events, normalized];
    turn.updatedAt = normalized.createdAt;
    if (turn.events.length === 1) {
      turn.createdAt = normalized.createdAt;
    }

    if (normalized.stage === "final") {
      finalizeTurn(work, normalized.turnId, normalized.createdAt);
      work.buffers.final = [...work.buffers.final, normalized];
    } else {
      turn.status = "open";
      turn.completedAt = undefined;
      work.buffers.preview = [...work.buffers.preview, normalized];
      work.activeTurnId = turn.id;
    }

    return {
      turns: work.turns,
      buffers: work.buffers,
      activeTurnId: work.activeTurnId,
    };
  });
}

export function submitFinalInput(turnId?: string, timestamp?: number) {
  syncStore.setState((state) => {
    const work = cloneWorkingState(state);
    const targetId =
      turnId ??
      work.activeTurnId ??
      work.turns
        .filter((turn) => turn.status === "open")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;

    if (!targetId) {
      return {};
    }

    finalizeTurn(work, targetId, timestamp ?? Date.now());

    return {
      turns: work.turns,
      buffers: work.buffers,
      activeTurnId: work.activeTurnId,
    };
  });
}

export function applyPatch(patch: DocumentPatch) {
  syncStore.setState((state) => {
    const nextDraft: DraftDocument = {
      version: Math.max(state.draft.version, patch.version),
      fields: { ...state.draft.fields, ...patch.fields },
      updatedAt: patch.appliedAt,
    };

    const patchCopy: DocumentPatch = {
      ...patch,
      fields: { ...patch.fields },
    };

    return {
      draft: nextDraft,
      oplog: [...state.oplog, patchCopy],
    };
  });
}

export function setPolicy(nextPolicy: InputPolicy, options: { timestamp?: number } = {}) {
  syncStore.setState((state) => {
    if (state.policy === nextPolicy) {
      return {};
    }

    if (nextPolicy === "exclusive") {
      const work = cloneWorkingState(state);
      const openTurns = work.turns
        .filter((turn) => turn.status === "open")
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const [latest, ...others] = openTurns;
      const timestamp = options.timestamp ?? Date.now();
      for (const turn of others) {
        finalizeTurn(work, turn.id, timestamp);
      }
      if (latest) {
        work.activeTurnId = latest.id;
      }
      return {
        policy: nextPolicy,
        turns: work.turns,
        buffers: work.buffers,
        activeTurnId: work.activeTurnId,
      };
    }

    return { policy: nextPolicy };
  });
}

export const useDraft = () => useStore(syncStore, (state) => state.draft);
export const useBuffers = () => useStore(syncStore, (state) => state.buffers);

export const syncStoreApi = syncStore;
