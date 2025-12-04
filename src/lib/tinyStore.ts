import { useSyncExternalStore, useRef, useCallback } from "react";

export type Store<S> = {
  getState: () => S;
  setState: (
    partial: Partial<S> | ((prev: S) => Partial<S>),
    replace?: boolean,
  ) => void;
  subscribe: (listener: () => void) => () => void;
  batch: (fn: () => void) => void;
};

/**
 * Default equality function using Object.is (referential equality).
 */
function defaultEquals<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

/**
 * Shallow equality comparison for objects and arrays.
 * Returns true if two values are shallowly equal.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // Handle objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }

  return true;
}

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
 * Uses shallow equality by default to prevent infinite loops when
 * selectors return new object/array references with the same content.
 *
 * @param store - The store to subscribe to
 * @param selector - Function to select a specific part of the state
 * @param equalityFn - Optional custom equality function (defaults to shallowEqual)
 * @returns The selected value
 *
 * @example
 * ```tsx
 * const userName = useStore(userStore, (state) => state.name);
 * ```
 */
export function useStore<S, U>(
  store: Store<S>,
  selector: (state: S) => U,
  equalityFn: (a: U, b: U) => boolean = shallowEqual
): U {
  // Use refs to avoid recreating getSnapshot on every render
  // This is critical because selector is often an inline arrow function
  const selectorRef = useRef(selector);
  const equalityFnRef = useRef(equalityFn);
  const lastValueRef = useRef<{ value: U; initialized: boolean }>({
    value: undefined as U,
    initialized: false,
  });
  const lastStateRef = useRef<S | undefined>(undefined);

  // Update refs on each render (but don't cause re-subscription)
  selectorRef.current = selector;
  equalityFnRef.current = equalityFn;

  // Stable getSnapshot function that doesn't change between renders
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const nextValue = selectorRef.current(state);

    // On first call, initialize cache
    if (!lastValueRef.current.initialized) {
      lastValueRef.current = { value: nextValue, initialized: true };
      lastStateRef.current = state;
      return nextValue;
    }

    // If the raw state reference is the same, return cached value
    if (lastStateRef.current === state) {
      return lastValueRef.current.value;
    }

    // State changed, check if selected value is equal
    if (equalityFnRef.current(lastValueRef.current.value, nextValue)) {
      // Value is shallowly equal, return cached reference to prevent re-render
      lastStateRef.current = state;
      return lastValueRef.current.value;
    }

    // Value actually changed, update cache
    lastValueRef.current = { value: nextValue, initialized: true };
    lastStateRef.current = state;
    return nextValue;
  }, [store]); // Only depends on store, not selector

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook to subscribe to a store with strict referential equality.
 * Use this when you need the exact object reference to change on every state update.
 *
 * @param store - The store to subscribe to
 * @param selector - Function to select a specific part of the state
 * @returns The selected value
 */
export function useStoreStrict<S, U>(
  store: Store<S>,
  selector: (state: S) => U
): U {
  return useStore(store, selector, defaultEquals);
}

/**
 * Alias for useStore - provides selector-based subscriptions.
 * @see useStore
 */
export const useStoreSelector = useStore;
