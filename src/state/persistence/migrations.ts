/**
 * State migration system for handling schema changes.
 *
 * Provides versioned migrations to transform persisted state
 * when the state schema changes between versions.
 *
 * @module state/persistence/migrations
 */

/**
 * Migration function type.
 */
export type MigrationFn<T = unknown> = (state: T) => T;

/**
 * Migration definition.
 */
export interface Migration {
  version: number;
  description: string;
  migrate: MigrationFn;
}

/**
 * Persisted state wrapper with version.
 */
export interface VersionedState<T> {
  version: number;
  data: T;
  timestamp: number;
}

/**
 * Migration registry for a specific slice.
 */
export class MigrationRegistry {
  private migrations: Migration[] = [];
  private currentVersion: number = 1;

  constructor(currentVersion: number) {
    this.currentVersion = currentVersion;
  }

  /**
   * Registers a migration.
   */
  register(migration: Migration): this {
    // Insert in version order
    const index = this.migrations.findIndex((m) => m.version >= migration.version);
    if (index === -1) {
      this.migrations.push(migration);
    } else if (this.migrations[index].version === migration.version) {
      // Replace existing
      this.migrations[index] = migration;
    } else {
      this.migrations.splice(index, 0, migration);
    }
    return this;
  }

  /**
   * Migrates state from one version to the current version.
   */
  migrate<T>(state: VersionedState<T>): VersionedState<T> {
    if (state.version >= this.currentVersion) {
      return state;
    }

    let currentState = state.data;
    let currentVer = state.version;

    // Apply migrations in order
    for (const migration of this.migrations) {
      if (migration.version > currentVer && migration.version <= this.currentVersion) {
        try {
          currentState = migration.migrate(currentState) as T;
          currentVer = migration.version;
          console.log(`Applied migration v${migration.version}: ${migration.description}`);
        } catch (error) {
          console.error(`Migration v${migration.version} failed:`, error);
          throw new MigrationError(migration.version, error);
        }
      }
    }

    return {
      version: this.currentVersion,
      data: currentState,
      timestamp: Date.now(),
    };
  }

  /**
   * Gets the current schema version.
   */
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  /**
   * Lists all registered migrations.
   */
  listMigrations(): Migration[] {
    return [...this.migrations];
  }

  /**
   * Validates that state can be migrated.
   */
  canMigrate(version: number): boolean {
    if (version >= this.currentVersion) {
      return true;
    }

    // Check if we have all necessary migrations
    let v = version;
    for (const migration of this.migrations) {
      if (migration.version > v && migration.version <= this.currentVersion) {
        v = migration.version;
      }
    }

    return v >= this.currentVersion;
  }
}

/**
 * Migration error.
 */
export class MigrationError extends Error {
  constructor(
    public version: number,
    public cause: unknown
  ) {
    super(`Migration to version ${version} failed`);
    this.name = "MigrationError";
  }
}

/**
 * Creates a versioned state wrapper.
 */
export function createVersionedState<T>(
  data: T,
  version: number
): VersionedState<T> {
  return {
    version,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Checks if state is versioned.
 */
export function isVersionedState(value: unknown): value is VersionedState<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "data" in value &&
    typeof (value as VersionedState<unknown>).version === "number"
  );
}

// ============================================================
// Slice-specific migration registries
// ============================================================

/**
 * Chat slice migrations.
 * Current version: 2 (normalized messages)
 */
export const chatMigrations = new MigrationRegistry(2)
  .register({
    version: 2,
    description: "Normalize messages to byId/allIds structure",
    migrate: (state: unknown) => {
      const s = state as Record<string, unknown>;

      // If already normalized, return as-is
      if (
        s.messages &&
        typeof s.messages === "object" &&
        "byId" in (s.messages as object)
      ) {
        return state;
      }

      // Convert array to normalized structure
      if (Array.isArray(s.messages)) {
        const byId: Record<string, unknown> = {};
        const allIds: string[] = [];

        for (const msg of s.messages as Array<{ id: string }>) {
          if (msg.id) {
            byId[msg.id] = msg;
            allIds.push(msg.id);
          }
        }

        return {
          ...s,
          messages: { byId, allIds },
        };
      }

      return state;
    },
  });

/**
 * Voice slice migrations.
 * Current version: 2 (normalized transcripts)
 */
export const voiceMigrations = new MigrationRegistry(2)
  .register({
    version: 2,
    description: "Normalize transcripts to byId/allIds structure",
    migrate: (state: unknown) => {
      const s = state as Record<string, unknown>;

      // If already normalized, return as-is
      if (
        s.transcripts &&
        typeof s.transcripts === "object" &&
        "byId" in (s.transcripts as object)
      ) {
        return state;
      }

      // Convert array to normalized structure
      if (Array.isArray(s.transcripts)) {
        const byId: Record<string, unknown> = {};
        const allIds: string[] = [];

        for (const t of s.transcripts as Array<{ id: string }>) {
          if (t.id) {
            byId[t.id] = t;
            allIds.push(t.id);
          }
        }

        return {
          ...s,
          transcripts: { byId, allIds },
        };
      }

      return state;
    },
  });

/**
 * Draft slice migrations.
 * Current version: 1 (no migrations needed)
 */
export const draftMigrations = new MigrationRegistry(1);

/**
 * DocType slice migrations.
 * Current version: 1 (no migrations needed)
 */
export const docTypeMigrations = new MigrationRegistry(1);

/**
 * All migration registries.
 */
export const migrationRegistries = {
  chat: chatMigrations,
  voice: voiceMigrations,
  draft: draftMigrations,
  docType: docTypeMigrations,
} as const;
