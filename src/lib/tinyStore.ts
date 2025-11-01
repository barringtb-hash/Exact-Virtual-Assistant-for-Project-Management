import { useSyncExternalStore } from "react";

export type Store<S> = {
  getState: () => S;
  setState: (
    partial: Partial<S> | ((prev: S) => Partial<S>),
    replace?: boolean,
  ) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState: Store<S>["setState"] = (partial, replace = false) => {
    const next =
      typeof partial === "function" ? (partial as (prev: S) => Partial<S>)(state) : partial;
    state = replace ? (next as S) : { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setState, subscribe };
}

export function useStore<S, U>(store: Store<S>, selector: (state: S) => U): U {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
