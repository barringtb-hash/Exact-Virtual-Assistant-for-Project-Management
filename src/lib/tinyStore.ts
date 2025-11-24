import { useSyncExternalStore } from "react";

export type Store<S> = {
  getState: () => S;
  setState: (
    partial: Partial<S> | ((prev: S) => Partial<S>),
    replace?: boolean,
  ) => void;
  subscribe: (listener: () => void) => () => void;
  batch: (fn: () => void) => void;
};

// Batching mechanism for efficient updates
let updateDepth = 0;
let pendingNotifications = new Set<() => void>();

function scheduleBatchedNotifications(listeners: Set<() => void>) {
  if (updateDepth === 0) {
    // Not in a batch, notify immediately
    listeners.forEach((listener) => listener());
  } else {
    // In a batch, schedule for later
    listeners.forEach((listener) => pendingNotifications.add(listener));
  }
}

function flushPendingNotifications() {
  if (updateDepth === 0 && pendingNotifications.size > 0) {
    pendingNotifications.forEach((listener) => listener());
    pendingNotifications.clear();
  }
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState: Store<S>["setState"] = (partial, replace = false) => {
    const next =
      typeof partial === "function" ? (partial as (prev: S) => Partial<S>)(state) : partial;
    state = replace ? (next as S) : { ...state, ...next };
    scheduleBatchedNotifications(listeners);
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const batch = (fn: () => void) => {
    updateDepth++;
    try {
      fn();
    } finally {
      updateDepth--;
      flushPendingNotifications();
    }
  };

  return { getState, setState, subscribe, batch };
}

/**
 * Hook to subscribe to a store with a selector function.
 * Only re-renders when the selected value changes.
 *
 * @param store - The store to subscribe to
 * @param selector - Function to select a specific part of the state
 * @returns The selected value
 *
 * @example
 * ```tsx
 * const userName = useStore(userStore, (state) => state.name);
 * ```
 */
export function useStore<S, U>(store: Store<S>, selector: (state: S) => U): U {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

/**
 * Alias for useStore - provides selector-based subscriptions.
 * @see useStore
 */
export const useStoreSelector = useStore;
