/**
 * Core utilities for creating state slices with standardized patterns.
 *
 * @module state/core/createSlice
 */

import { createStore, useStore, type Store } from "../../lib/tinyStore";

/**
 * Normalized collection structure for efficient entity management.
 */
export interface NormalizedCollection<T> {
  byId: Record<string, T>;
  allIds: string[];
}

/**
 * Creates an empty normalized collection.
 */
export function createNormalizedCollection<T>(): NormalizedCollection<T> {
  return { byId: {}, allIds: [] };
}

/**
 * Entity with required id field.
 */
export interface Entity {
  id: string;
}

/**
 * Normalized state operations for managing entity collections.
 */
export const normalizedOps = {
  /**
   * Adds an entity to a normalized collection.
   */
  add<T extends Entity>(
    collection: NormalizedCollection<T>,
    entity: T
  ): NormalizedCollection<T> {
    if (collection.byId[entity.id]) {
      // Update existing
      return {
        byId: { ...collection.byId, [entity.id]: entity },
        allIds: collection.allIds,
      };
    }
    // Add new
    return {
      byId: { ...collection.byId, [entity.id]: entity },
      allIds: [...collection.allIds, entity.id],
    };
  },

  /**
   * Adds multiple entities to a normalized collection.
   */
  addMany<T extends Entity>(
    collection: NormalizedCollection<T>,
    entities: T[]
  ): NormalizedCollection<T> {
    let result = collection;
    for (const entity of entities) {
      result = normalizedOps.add(result, entity);
    }
    return result;
  },

  /**
   * Updates an entity in a normalized collection.
   */
  update<T extends Entity>(
    collection: NormalizedCollection<T>,
    id: string,
    updater: (entity: T) => T
  ): NormalizedCollection<T> {
    const existing = collection.byId[id];
    if (!existing) {
      return collection;
    }
    const updated = updater(existing);
    if (updated === existing) {
      return collection;
    }
    return {
      byId: { ...collection.byId, [id]: updated },
      allIds: collection.allIds,
    };
  },

  /**
   * Removes an entity from a normalized collection.
   */
  remove<T extends Entity>(
    collection: NormalizedCollection<T>,
    id: string
  ): NormalizedCollection<T> {
    if (!collection.byId[id]) {
      return collection;
    }
    const { [id]: removed, ...byId } = collection.byId;
    return {
      byId,
      allIds: collection.allIds.filter((itemId) => itemId !== id),
    };
  },

  /**
   * Removes multiple entities from a normalized collection.
   */
  removeMany<T extends Entity>(
    collection: NormalizedCollection<T>,
    ids: string[]
  ): NormalizedCollection<T> {
    const idsSet = new Set(ids);
    const byId: Record<string, T> = {};
    const allIds: string[] = [];

    for (const id of collection.allIds) {
      if (!idsSet.has(id)) {
        byId[id] = collection.byId[id];
        allIds.push(id);
      }
    }

    return { byId, allIds };
  },

  /**
   * Replaces all entities in a normalized collection.
   */
  setAll<T extends Entity>(entities: T[]): NormalizedCollection<T> {
    const byId: Record<string, T> = {};
    const allIds: string[] = [];

    for (const entity of entities) {
      byId[entity.id] = entity;
      allIds.push(entity.id);
    }

    return { byId, allIds };
  },

  /**
   * Selects all entities from a normalized collection as an array.
   */
  selectAll<T extends Entity>(collection: NormalizedCollection<T>): T[] {
    return collection.allIds.map((id) => collection.byId[id]);
  },

  /**
   * Selects a single entity by id.
   */
  selectById<T extends Entity>(
    collection: NormalizedCollection<T>,
    id: string
  ): T | undefined {
    return collection.byId[id];
  },

  /**
   * Selects multiple entities by ids.
   */
  selectByIds<T extends Entity>(
    collection: NormalizedCollection<T>,
    ids: string[]
  ): T[] {
    return ids.map((id) => collection.byId[id]).filter(Boolean) as T[];
  },

  /**
   * Returns the count of entities in the collection.
   */
  selectCount<T extends Entity>(collection: NormalizedCollection<T>): number {
    return collection.allIds.length;
  },

  /**
   * Returns whether the collection contains an entity with the given id.
   */
  selectHas<T extends Entity>(
    collection: NormalizedCollection<T>,
    id: string
  ): boolean {
    return id in collection.byId;
  },
};

/**
 * Configuration for createSlice.
 */
export interface SliceConfig<S, A> {
  name: string;
  initialState: S;
  actions: (
    setState: Store<S>["setState"],
    getState: Store<S>["getState"],
    store: Store<S>
  ) => A;
}

/**
 * Slice result type.
 */
export interface Slice<S, A> {
  name: string;
  store: Store<S>;
  actions: A;
  getState: () => S;
  setState: Store<S>["setState"];
  subscribe: Store<S>["subscribe"];
  batch: Store<S>["batch"];
  reset: () => void;
}

/**
 * Creates a state slice with standardized patterns.
 *
 * @example
 * ```typescript
 * const counterSlice = createSlice({
 *   name: 'counter',
 *   initialState: { count: 0 },
 *   actions: (setState, getState) => ({
 *     increment() {
 *       setState((state) => ({ count: state.count + 1 }));
 *     },
 *     decrement() {
 *       setState((state) => ({ count: state.count - 1 }));
 *     },
 *   }),
 * });
 * ```
 */
export function createSlice<S extends object, A extends object>(
  config: SliceConfig<S, A>
): Slice<S, A> {
  const store = createStore(config.initialState);
  const actions = config.actions(store.setState, store.getState, store);

  return {
    name: config.name,
    store,
    actions,
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe,
    batch: store.batch,
    reset: () => store.setState(config.initialState, true),
  };
}

/**
 * Creates a hook for using a specific selector from a slice.
 */
export function createSelectorHook<S, R>(
  store: Store<S>,
  selector: (state: S) => R
): () => R {
  return () => useStore(store, selector);
}

/**
 * Creates multiple selector hooks from a map of selectors.
 */
export function createSelectorHooks<S, M extends Record<string, (state: S) => unknown>>(
  store: Store<S>,
  selectors: M
): { [K in keyof M]: () => ReturnType<M[K]> } {
  const hooks: Record<string, () => unknown> = {};

  for (const [name, selector] of Object.entries(selectors)) {
    hooks[name] = () => useStore(store, selector);
  }

  return hooks as { [K in keyof M]: () => ReturnType<M[K]> };
}

export { createStore, useStore, type Store };
