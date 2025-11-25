/**
 * State persistence module.
 *
 * Provides tools for persisting and rehydrating state:
 * - Storage abstraction with encryption support
 * - Migration system for schema versioning
 * - Middleware for automatic persistence
 *
 * @example
 * ```typescript
 * import { persistStore, chatMigrations } from '@/state/persistence';
 * import { chatSlice } from '@/state/slices/chat';
 *
 * // Persist the chat store
 * const chatPersist = persistStore(chatSlice.store, {
 *   key: 'chat',
 *   migrations: chatMigrations,
 *   debounce: 1000,
 *   excludeFields: ['isStreaming', 'isAssistantThinking'],
 * });
 *
 * // Later, to stop persistence:
 * chatPersist.stop();
 *
 * // To force an immediate save:
 * chatPersist.flush();
 * ```
 *
 * @module state/persistence
 */

// Storage
export {
  createStorage,
  defaultStorage,
  MemoryStorage,
  type Storage,
  type StorageBackend,
  type StorageOptions,
} from "./storage";

// Migrations
export {
  MigrationRegistry,
  MigrationError,
  createVersionedState,
  isVersionedState,
  chatMigrations,
  voiceMigrations,
  draftMigrations,
  docTypeMigrations,
  migrationRegistries,
  type Migration,
  type MigrationFn,
  type VersionedState,
} from "./migrations";

// Middleware
export {
  createPersistMiddleware,
  persistStore,
  persistenceManager,
  type PersistConfig,
  type PersistMiddleware,
} from "./middleware";
