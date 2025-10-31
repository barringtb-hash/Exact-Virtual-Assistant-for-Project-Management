import { useSyncExternalStore } from "react";

import { normalizePointerInput } from "../utils/jsonPointer.js";

const DEFAULT_STATE = {
  isSyncing: false,
  pendingSyncCount: 0,
  lastSyncAt: null,
  highlightedPaths: new Set(),
  metadataByPath: new Map(),
  locks: new Map(),
};

let state = {
  ...DEFAULT_STATE,
  highlightedPaths: new Set(DEFAULT_STATE.highlightedPaths),
  metadataByPath: new Map(DEFAULT_STATE.metadataByPath),
  locks: new Map(DEFAULT_STATE.locks),
};

const listeners = new Set();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("draftStore subscriber failed", error);
    }
  });
}

function applyState(partial) {
  const nextState = { ...state };
  let changed = false;

  Object.entries(partial).forEach(([key, value]) => {
    if (key === "highlightedPaths" || key === "metadataByPath" || key === "locks") {
      if (state[key] !== value) {
        nextState[key] = value;
        changed = true;
      }
      return;
    }

    if (state[key] !== value) {
      nextState[key] = value;
      changed = true;
    }
  });

  if (!changed) {
    return state;
  }

  state = nextState;
  emit();
  return state;
}

function subscribe(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function beginDraftSync() {
  const nextCount = state.pendingSyncCount + 1;
  applyState({
    pendingSyncCount: nextCount,
    isSyncing: true,
  });
}

export function completeDraftSync() {
  const nextCount = Math.max(0, state.pendingSyncCount - 1);
  applyState({
    pendingSyncCount: nextCount,
    isSyncing: nextCount > 0,
  });
}

export function resetDraftSync() {
  applyState({ pendingSyncCount: 0, isSyncing: false });
}

export function recordDraftMetadata({ paths, source = "AI", updatedAt } = {}) {
  const timestamp =
    typeof updatedAt === "number" && !Number.isNaN(updatedAt) ? updatedAt : Date.now();

  const metadataByPath = new Map(state.metadataByPath);
  const highlightedPaths = new Set(state.highlightedPaths);

  let applied = false;

  if (paths instanceof Map) {
    paths.forEach((value, pointer) => {
      if (typeof pointer !== "string") {
        return;
      }
      const entry = value && typeof value === "object" ? value : {};
      const entrySource = entry.source || source;
      const entryUpdatedAt =
        typeof entry.updatedAt === "number" && !Number.isNaN(entry.updatedAt)
          ? entry.updatedAt
          : timestamp;
      metadataByPath.set(pointer, {
        source: entrySource,
        updatedAt: entryUpdatedAt,
      });
      highlightedPaths.add(pointer);
      applied = true;
    });
  } else {
    const normalizedPaths = normalizePointerInput(paths);
    normalizedPaths.forEach((pointer) => {
      metadataByPath.set(pointer, {
        source,
        updatedAt: timestamp,
      });
      highlightedPaths.add(pointer);
      applied = true;
    });
  }

  if (!applied) {
    return;
  }

  applyState({
    metadataByPath,
    highlightedPaths,
    lastSyncAt: timestamp,
  });
}

export function clearDraftHighlights(paths) {
  if (!paths || state.highlightedPaths.size === 0) {
    return;
  }

  const normalizedPaths = normalizePointerInput(paths);
  if (normalizedPaths.length === 0) {
    return;
  }

  let changed = false;
  const highlightedPaths = new Set(state.highlightedPaths);

  normalizedPaths.forEach((path) => {
    if (highlightedPaths.delete(path)) {
      changed = true;
    }
  });

  if (changed) {
    applyState({ highlightedPaths });
  }
}

export function clearDraftMetadata() {
  applyState({
    metadataByPath: new Map(),
    highlightedPaths: new Set(),
    lastSyncAt: null,
    locks: new Map(),
  });
}

export function getDraftSnapshot() {
  return state;
}

export function lockDraftPaths(paths) {
  const normalizedPaths = normalizePointerInput(paths);
  if (normalizedPaths.length === 0) {
    return;
  }

  const locks = new Map(state.locks);
  let changed = false;

  normalizedPaths.forEach((pointer) => {
    if (!locks.has(pointer)) {
      locks.set(pointer, true);
      changed = true;
    }
  });

  if (changed) {
    applyState({ locks });
  }
}

export function resetDraftLocks() {
  if (state.locks.size === 0) {
    return;
  }
  applyState({ locks: new Map() });
}

export function getDraftLocksSnapshot() {
  return state.locks;
}

export function useDraftStore(selector = (snapshot) => snapshot) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state)
  );
}

export default {
  beginDraftSync,
  completeDraftSync,
  resetDraftSync,
  recordDraftMetadata,
  clearDraftHighlights,
  clearDraftMetadata,
  getDraftSnapshot,
  lockDraftPaths,
  resetDraftLocks,
  getDraftLocksSnapshot,
  useDraftStore,
};
