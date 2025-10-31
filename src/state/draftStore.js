import { useSyncExternalStore } from "react";

const DEFAULT_STATE = {
  isSyncing: false,
  pendingSyncCount: 0,
  lastSyncAt: null,
  highlightedPaths: new Set(),
  metadataByPath: new Map(),
};

let state = {
  ...DEFAULT_STATE,
  highlightedPaths: new Set(DEFAULT_STATE.highlightedPaths),
  metadataByPath: new Map(DEFAULT_STATE.metadataByPath),
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
    if (key === "highlightedPaths" || key === "metadataByPath") {
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

function normalizePaths(paths) {
  const result = [];
  if (!paths) return result;
  if (typeof paths === "string") {
    const trimmed = paths.trim();
    if (trimmed) {
      result.push(trimmed);
    }
    return result;
  }
  if (paths instanceof Set) {
    paths.forEach((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) {
          result.push(trimmed);
        }
      }
    });
    return result;
  }
  if (Array.isArray(paths)) {
    paths.forEach((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) {
          result.push(trimmed);
        }
      }
    });
  }
  return result;
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
  const normalizedPaths = normalizePaths(paths);
  if (normalizedPaths.length === 0) {
    return;
  }

  const timestamp =
    typeof updatedAt === "number" && !Number.isNaN(updatedAt) ? updatedAt : Date.now();

  const metadataByPath = new Map(state.metadataByPath);
  const highlightedPaths = new Set(state.highlightedPaths);

  normalizedPaths.forEach((path) => {
    metadataByPath.set(path, {
      source,
      updatedAt: timestamp,
    });
    highlightedPaths.add(path);
  });

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

  const normalizedPaths = normalizePaths(paths);
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
  });
}

export function getDraftSnapshot() {
  return state;
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
  useDraftStore,
};
