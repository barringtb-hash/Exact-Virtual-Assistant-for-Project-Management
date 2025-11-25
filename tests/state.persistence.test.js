/**
 * Tests for state persistence module.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

// Mock implementations for testing
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.get(key) ?? null;
  }

  setItem(key, value) {
    this.store.set(key, value);
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

function createStorage(options = {}) {
  const prefix = options.prefix ?? "eva_state_";
  const backend = options.backend ?? new MemoryStorage();

  function getKey(key) {
    return `${prefix}${key}`;
  }

  function get(key) {
    try {
      const fullKey = getKey(key);
      const data = backend.getItem(fullKey);
      if (data === null) {
        return null;
      }
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  function set(key, value) {
    try {
      const fullKey = getKey(key);
      backend.setItem(fullKey, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      const fullKey = getKey(key);
      backend.removeItem(fullKey);
      return true;
    } catch {
      return false;
    }
  }

  return { get, set, remove, prefix };
}

function createVersionedState(data, version) {
  return {
    version,
    data,
    timestamp: Date.now(),
  };
}

function isVersionedState(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "data" in value &&
    typeof value.version === "number"
  );
}

class MigrationRegistry {
  constructor(currentVersion) {
    this.migrations = [];
    this.currentVersion = currentVersion;
  }

  register(migration) {
    const index = this.migrations.findIndex((m) => m.version >= migration.version);
    if (index === -1) {
      this.migrations.push(migration);
    } else if (this.migrations[index].version === migration.version) {
      this.migrations[index] = migration;
    } else {
      this.migrations.splice(index, 0, migration);
    }
    return this;
  }

  migrate(state) {
    if (state.version >= this.currentVersion) {
      return state;
    }

    let currentState = state.data;
    let currentVer = state.version;

    for (const migration of this.migrations) {
      if (migration.version > currentVer && migration.version <= this.currentVersion) {
        currentState = migration.migrate(currentState);
        currentVer = migration.version;
      }
    }

    return {
      version: this.currentVersion,
      data: currentState,
      timestamp: Date.now(),
    };
  }

  getCurrentVersion() {
    return this.currentVersion;
  }

  listMigrations() {
    return [...this.migrations];
  }

  canMigrate(version) {
    if (version >= this.currentVersion) {
      return true;
    }
    let v = version;
    for (const migration of this.migrations) {
      if (migration.version > v && migration.version <= this.currentVersion) {
        v = migration.version;
      }
    }
    return v >= this.currentVersion;
  }
}

function createNormalizedCollection() {
  return { byId: {}, allIds: [] };
}

const normalizedOps = {
  add(collection, entity) {
    if (collection.byId[entity.id]) {
      return {
        byId: { ...collection.byId, [entity.id]: entity },
        allIds: collection.allIds,
      };
    }
    return {
      byId: { ...collection.byId, [entity.id]: entity },
      allIds: [...collection.allIds, entity.id],
    };
  },

  remove(collection, id) {
    if (!collection.byId[id]) {
      return collection;
    }
    const { [id]: removed, ...byId } = collection.byId;
    return {
      byId,
      allIds: collection.allIds.filter((itemId) => itemId !== id),
    };
  },

  update(collection, id, updater) {
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

  setAll(entities) {
    const byId = {};
    const allIds = [];
    for (const entity of entities) {
      byId[entity.id] = entity;
      allIds.push(entity.id);
    }
    return { byId, allIds };
  },

  selectAll(collection) {
    return collection.allIds.map((id) => collection.byId[id]);
  },

  selectById(collection, id) {
    return collection.byId[id];
  },

  selectCount(collection) {
    return collection.allIds.length;
  },

  selectHas(collection, id) {
    return id in collection.byId;
  },
};

describe("Storage", () => {
  describe("MemoryStorage", () => {
    let storage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    it("should store and retrieve items", () => {
      storage.setItem("key1", "value1");
      assert.strictEqual(storage.getItem("key1"), "value1");
    });

    it("should return null for non-existent keys", () => {
      assert.strictEqual(storage.getItem("nonexistent"), null);
    });

    it("should remove items", () => {
      storage.setItem("key1", "value1");
      storage.removeItem("key1");
      assert.strictEqual(storage.getItem("key1"), null);
    });

    it("should clear all items", () => {
      storage.setItem("key1", "value1");
      storage.setItem("key2", "value2");
      storage.clear();
      assert.strictEqual(storage.getItem("key1"), null);
      assert.strictEqual(storage.getItem("key2"), null);
    });
  });

  describe("createStorage", () => {
    it("should create storage with default prefix", () => {
      const storage = createStorage({ backend: new MemoryStorage() });
      assert.strictEqual(storage.prefix, "eva_state_");
    });

    it("should create storage with custom prefix", () => {
      const storage = createStorage({
        prefix: "custom_",
        backend: new MemoryStorage(),
      });
      assert.strictEqual(storage.prefix, "custom_");
    });

    it("should set and get values", () => {
      const storage = createStorage({ backend: new MemoryStorage() });
      storage.set("test", { foo: "bar" });
      assert.deepStrictEqual(storage.get("test"), { foo: "bar" });
    });

    it("should return null for non-existent keys", () => {
      const storage = createStorage({ backend: new MemoryStorage() });
      assert.strictEqual(storage.get("nonexistent"), null);
    });

    it("should remove values", () => {
      const storage = createStorage({ backend: new MemoryStorage() });
      storage.set("test", { foo: "bar" });
      storage.remove("test");
      assert.strictEqual(storage.get("test"), null);
    });

    it("should handle complex objects", () => {
      const storage = createStorage({ backend: new MemoryStorage() });
      const complex = {
        array: [1, 2, 3],
        nested: { a: { b: { c: "deep" } } },
        nullValue: null,
      };
      storage.set("complex", complex);
      assert.deepStrictEqual(storage.get("complex"), complex);
    });
  });
});

describe("Migrations", () => {
  describe("MigrationRegistry", () => {
    it("should register migrations in order", () => {
      const registry = new MigrationRegistry(3)
        .register({ version: 2, description: "v2", migrate: (s) => s })
        .register({ version: 1, description: "v1", migrate: (s) => s });

      const migrations = registry.listMigrations();
      assert.strictEqual(migrations[0].version, 1);
      assert.strictEqual(migrations[1].version, 2);
    });

    it("should return current version", () => {
      const registry = new MigrationRegistry(5);
      assert.strictEqual(registry.getCurrentVersion(), 5);
    });

    it("should not migrate if already at current version", () => {
      const registry = new MigrationRegistry(2);
      const state = createVersionedState({ value: 1 }, 2);

      const result = registry.migrate(state);
      assert.strictEqual(result.version, 2);
      assert.deepStrictEqual(result.data, { value: 1 });
    });

    it("should apply migrations in order", () => {
      const registry = new MigrationRegistry(3)
        .register({
          version: 2,
          description: "Add count",
          migrate: (s) => ({ ...s, count: 0 }),
        })
        .register({
          version: 3,
          description: "Double count",
          migrate: (s) => ({ ...s, count: (s.count || 0) * 2 + 1 }),
        });

      const state = createVersionedState({ value: 1 }, 1);
      const result = registry.migrate(state);

      assert.strictEqual(result.version, 3);
      assert.deepStrictEqual(result.data, { value: 1, count: 1 });
    });

    it("should check if migration is possible", () => {
      const registry = new MigrationRegistry(3)
        .register({ version: 2, description: "v2", migrate: (s) => s })
        .register({ version: 3, description: "v3", migrate: (s) => s });

      assert.strictEqual(registry.canMigrate(1), true);
      assert.strictEqual(registry.canMigrate(2), true);
      assert.strictEqual(registry.canMigrate(3), true);
    });
  });

  describe("createVersionedState", () => {
    it("should create versioned state wrapper", () => {
      const data = { foo: "bar" };
      const versioned = createVersionedState(data, 1);

      assert.strictEqual(versioned.version, 1);
      assert.deepStrictEqual(versioned.data, data);
      assert.ok(versioned.timestamp);
    });
  });

  describe("isVersionedState", () => {
    it("should return true for versioned state", () => {
      const versioned = createVersionedState({ foo: "bar" }, 1);
      assert.strictEqual(isVersionedState(versioned), true);
    });

    it("should return false for non-versioned objects", () => {
      assert.strictEqual(isVersionedState({ foo: "bar" }), false);
      assert.strictEqual(isVersionedState(null), false);
      assert.strictEqual(isVersionedState(undefined), false);
      assert.strictEqual(isVersionedState("string"), false);
    });
  });
});

describe("NormalizedOps", () => {
  it("should create empty collection", () => {
    const collection = createNormalizedCollection();
    assert.deepStrictEqual(collection.byId, {});
    assert.deepStrictEqual(collection.allIds, []);
  });

  it("should add entity to collection", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", name: "Item 1" });

    assert.deepStrictEqual(collection.byId["1"], { id: "1", name: "Item 1" });
    assert.deepStrictEqual(collection.allIds, ["1"]);
  });

  it("should update existing entity", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", name: "Item 1" });
    collection = normalizedOps.add(collection, { id: "1", name: "Updated" });

    assert.strictEqual(collection.byId["1"].name, "Updated");
    assert.deepStrictEqual(collection.allIds, ["1"]);
  });

  it("should remove entity from collection", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", name: "Item 1" });
    collection = normalizedOps.add(collection, { id: "2", name: "Item 2" });
    collection = normalizedOps.remove(collection, "1");

    assert.strictEqual(collection.byId["1"], undefined);
    assert.deepStrictEqual(collection.allIds, ["2"]);
  });

  it("should select all entities", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", name: "Item 1" });
    collection = normalizedOps.add(collection, { id: "2", name: "Item 2" });

    const all = normalizedOps.selectAll(collection);
    assert.strictEqual(all.length, 2);
    assert.strictEqual(all[0].id, "1");
    assert.strictEqual(all[1].id, "2");
  });

  it("should select entity by id", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", name: "Item 1" });

    const entity = normalizedOps.selectById(collection, "1");
    assert.deepStrictEqual(entity, { id: "1", name: "Item 1" });

    const missing = normalizedOps.selectById(collection, "999");
    assert.strictEqual(missing, undefined);
  });

  it("should update entity with updater function", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", count: 0 });
    collection = normalizedOps.update(collection, "1", (e) => ({
      ...e,
      count: e.count + 1,
    }));

    assert.strictEqual(collection.byId["1"].count, 1);
  });

  it("should set all entities", () => {
    const entities = [
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
    ];
    const collection = normalizedOps.setAll(entities);

    assert.deepStrictEqual(collection.allIds, ["1", "2"]);
    assert.strictEqual(normalizedOps.selectCount(collection), 2);
  });

  it("should check if collection has entity", () => {
    let collection = createNormalizedCollection();
    collection = normalizedOps.add(collection, { id: "1", name: "Item 1" });

    assert.strictEqual(normalizedOps.selectHas(collection, "1"), true);
    assert.strictEqual(normalizedOps.selectHas(collection, "2"), false);
  });
});
