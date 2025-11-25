/**
 * State persistence middleware.
 *
 * Provides automatic state persistence and rehydration for stores.
 * Supports debounced saving, selective persistence, and migrations.
 *
 * @module state/persistence/middleware
 */

import type { Store } from "../../lib/tinyStore";
import {
  createStorage,
  defaultStorage,
  type Storage,
  type StorageOptions,
} from "./storage";
import {
  createVersionedState,
  isVersionedState,
  type MigrationRegistry,
  type VersionedState,
} from "./migrations";

/**
 * Persistence configuration for a slice.
 */
export interface PersistConfig<S> {
  /**
   * Unique key for storage.
   */
  key: string;

  /**
   * Storage instance (defaults to defaultStorage).
   */
  storage?: Storage;

  /**
   * Migration registry for handling schema changes.
   */
  migrations?: MigrationRegistry;

  /**
   * Debounce time in ms for saving (default: 1000).
   */
  debounce?: number;

  /**
   * Selector to pick which parts of state to persist.
   * By default, persists entire state.
   */
  select?: (state: S) => Partial<S>;

  /**
   * Merger to combine persisted state with initial state.
   * By default, shallow merges persisted state over initial.
   */
  merge?: (persisted: Partial<S>, initial: S) => S;

  /**
   * Called when rehydration completes.
   */
  onRehydrate?: (state: S) => void;

  /**
   * Called when persistence fails.
   */
  onError?: (error: unknown) => void;

  /**
   * Whether to persist on every state change (default: true).
   */
  autoSave?: boolean;

  /**
   * Sensitive field names to exclude from persistence.
   */
  excludeFields?: (keyof S)[];
}

/**
 * Persistence state for tracking.
 */
interface PersistState {
  isHydrated: boolean;
  isPersisting: boolean;
  lastSaved: number | null;
  error: unknown | null;
}

/**
 * Creates a persistence middleware for a store.
 */
export function createPersistMiddleware<S extends object>(
  store: Store<S>,
  config: PersistConfig<S>
) {
  const {
    key,
    storage = defaultStorage,
    migrations,
    debounce = 1000,
    select,
    merge = (persisted, initial) => ({ ...initial, ...persisted }),
    onRehydrate,
    onError,
    autoSave = true,
    excludeFields = [],
  } = config;

  let persistState: PersistState = {
    isHydrated: false,
    isPersisting: false,
    lastSaved: null,
    error: null,
  };

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;

  /**
   * Gets the current version for storage.
   */
  function getCurrentVersion(): number {
    return migrations?.getCurrentVersion() ?? 1;
  }

  /**
   * Filters out excluded fields from state.
   */
  function filterState(state: Partial<S>): Partial<S> {
    if (excludeFields.length === 0) {
      return state;
    }

    const filtered = { ...state };
    for (const field of excludeFields) {
      delete filtered[field];
    }
    return filtered;
  }

  /**
   * Saves state to storage.
   */
  function save(): void {
    try {
      const currentState = store.getState();
      const selectedState = select ? select(currentState) : currentState;
      const filteredState = filterState(selectedState);

      const versioned = createVersionedState(filteredState, getCurrentVersion());

      persistState.isPersisting = true;
      const success = storage.set(key, versioned);
      persistState.isPersisting = false;

      if (success) {
        persistState.lastSaved = Date.now();
        persistState.error = null;
      }
    } catch (error) {
      persistState.isPersisting = false;
      persistState.error = error;
      onError?.(error);
      console.error(`Failed to persist state for ${key}:`, error);
    }
  }

  /**
   * Schedules a debounced save.
   */
  function scheduleSave(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(save, debounce);
  }

  /**
   * Rehydrates state from storage.
   */
  function rehydrate(): S | null {
    try {
      const stored = storage.get<unknown>(key);

      if (!stored) {
        persistState.isHydrated = true;
        return null;
      }

      // Handle versioned state
      let data: Partial<S>;
      if (isVersionedState(stored)) {
        // Apply migrations if needed
        if (migrations && stored.version < getCurrentVersion()) {
          const migrated = migrations.migrate(stored as VersionedState<Partial<S>>);
          data = migrated.data;
        } else {
          data = stored.data as Partial<S>;
        }
      } else {
        // Legacy unversioned data
        data = stored as Partial<S>;
      }

      // Merge with current state
      const currentState = store.getState();
      const mergedState = merge(data, currentState);

      // Update store
      store.setState(mergedState, true);

      persistState.isHydrated = true;
      persistState.error = null;

      onRehydrate?.(mergedState);

      return mergedState;
    } catch (error) {
      persistState.isHydrated = true;
      persistState.error = error;
      onError?.(error);
      console.error(`Failed to rehydrate state for ${key}:`, error);
      return null;
    }
  }

  /**
   * Starts automatic persistence.
   */
  function start(): void {
    if (unsubscribe) {
      return;
    }

    // Rehydrate on start
    rehydrate();

    // Subscribe to changes if autoSave is enabled
    if (autoSave) {
      unsubscribe = store.subscribe(() => {
        scheduleSave();
      });
    }
  }

  /**
   * Stops automatic persistence.
   */
  function stop(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  /**
   * Clears persisted state.
   */
  function clear(): void {
    storage.remove(key);
    persistState.lastSaved = null;
  }

  /**
   * Forces an immediate save.
   */
  function flush(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    save();
  }

  /**
   * Gets persistence state.
   */
  function getState(): PersistState {
    return { ...persistState };
  }

  return {
    start,
    stop,
    save,
    flush,
    rehydrate,
    clear,
    getState,
    key,
  };
}

/**
 * Persistence middleware instance type.
 */
export type PersistMiddleware<S extends object> = ReturnType<
  typeof createPersistMiddleware<S>
>;

// ============================================================
// Global persistence manager
// ============================================================

/**
 * Manages multiple persistence middlewares.
 */
class PersistenceManager {
  private middlewares = new Map<string, PersistMiddleware<object>>();
  private storage: Storage;

  constructor(options?: StorageOptions) {
    this.storage = options ? createStorage(options) : defaultStorage;
  }

  /**
   * Registers a store for persistence.
   */
  register<S extends object>(
    store: Store<S>,
    config: Omit<PersistConfig<S>, "storage">
  ): PersistMiddleware<S> {
    const middleware = createPersistMiddleware(store, {
      ...config,
      storage: this.storage,
    });

    this.middlewares.set(config.key, middleware as PersistMiddleware<object>);

    return middleware;
  }

  /**
   * Starts all registered persistence middlewares.
   */
  startAll(): void {
    for (const middleware of this.middlewares.values()) {
      middleware.start();
    }
  }

  /**
   * Stops all registered persistence middlewares.
   */
  stopAll(): void {
    for (const middleware of this.middlewares.values()) {
      middleware.stop();
    }
  }

  /**
   * Flushes all pending saves.
   */
  flushAll(): void {
    for (const middleware of this.middlewares.values()) {
      middleware.flush();
    }
  }

  /**
   * Clears all persisted state.
   */
  clearAll(): void {
    for (const middleware of this.middlewares.values()) {
      middleware.clear();
    }
  }

  /**
   * Gets a middleware by key.
   */
  get(key: string): PersistMiddleware<object> | undefined {
    return this.middlewares.get(key);
  }

  /**
   * Gets all persistence states.
   */
  getAllStates(): Record<string, PersistState> {
    const states: Record<string, PersistState> = {};
    for (const [key, middleware] of this.middlewares) {
      states[key] = middleware.getState();
    }
    return states;
  }

  /**
   * Checks if all stores are hydrated.
   */
  isFullyHydrated(): boolean {
    for (const middleware of this.middlewares.values()) {
      if (!middleware.getState().isHydrated) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Default persistence manager instance.
 */
export const persistenceManager = new PersistenceManager();

/**
 * Convenience function to persist a store.
 */
export function persistStore<S extends object>(
  store: Store<S>,
  config: Omit<PersistConfig<S>, "storage">
): PersistMiddleware<S> {
  const middleware = persistenceManager.register(store, config);
  middleware.start();
  return middleware;
}
