/**
 * Storage abstraction for state persistence.
 *
 * Provides a unified interface for storing and retrieving state,
 * with support for different storage backends and encryption.
 *
 * @module state/persistence/storage
 */

/**
 * Storage backend interface.
 */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/**
 * Storage options.
 */
export interface StorageOptions {
  /**
   * Storage key prefix.
   */
  prefix?: string;

  /**
   * Whether to encrypt stored data.
   */
  encrypt?: boolean;

  /**
   * Custom encryption key (if encrypt is true).
   */
  encryptionKey?: string;

  /**
   * Storage backend to use.
   */
  backend?: StorageBackend;
}

/**
 * Default storage prefix.
 */
const DEFAULT_PREFIX = "eva_state_";

/**
 * Simple XOR-based encryption for basic obfuscation.
 * Note: This is not cryptographically secure but provides
 * basic obfuscation for casual inspection.
 */
function xorEncrypt(data: string, key: string): string {
  if (!key) return data;

  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    result.push(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypts XOR-encrypted data.
 */
function xorDecrypt(data: string, key: string): string {
  if (!key) return data;

  try {
    const decoded = atob(data);
    const result: number[] = [];
    for (let i = 0; i < decoded.length; i++) {
      result.push(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return String.fromCharCode(...result);
  } catch {
    return data;
  }
}

/**
 * Memory storage backend for testing or SSR.
 */
export class MemoryStorage implements StorageBackend {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Gets the appropriate storage backend.
 */
function getStorageBackend(options?: StorageOptions): StorageBackend {
  if (options?.backend) {
    return options.backend;
  }

  // Check if localStorage is available
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      // Test if localStorage is accessible
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      // localStorage not available (e.g., private browsing)
    }
  }

  // Fallback to memory storage
  return new MemoryStorage();
}

/**
 * Creates a storage instance with the given options.
 */
export function createStorage(options?: StorageOptions) {
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const encrypt = options?.encrypt ?? false;
  const encryptionKey = options?.encryptionKey ?? "";
  const backend = getStorageBackend(options);

  /**
   * Gets the full storage key.
   */
  function getKey(key: string): string {
    return `${prefix}${key}`;
  }

  /**
   * Retrieves and parses a value from storage.
   */
  function get<T>(key: string): T | null {
    try {
      const fullKey = getKey(key);
      let data = backend.getItem(fullKey);

      if (data === null) {
        return null;
      }

      if (encrypt && encryptionKey) {
        data = xorDecrypt(data, encryptionKey);
      }

      return JSON.parse(data) as T;
    } catch (error) {
      console.warn(`Failed to read from storage: ${key}`, error);
      return null;
    }
  }

  /**
   * Serializes and stores a value.
   */
  function set<T>(key: string, value: T): boolean {
    try {
      const fullKey = getKey(key);
      let data = JSON.stringify(value);

      if (encrypt && encryptionKey) {
        data = xorEncrypt(data, encryptionKey);
      }

      backend.setItem(fullKey, data);
      return true;
    } catch (error) {
      console.warn(`Failed to write to storage: ${key}`, error);
      return false;
    }
  }

  /**
   * Removes a value from storage.
   */
  function remove(key: string): boolean {
    try {
      const fullKey = getKey(key);
      backend.removeItem(fullKey);
      return true;
    } catch (error) {
      console.warn(`Failed to remove from storage: ${key}`, error);
      return false;
    }
  }

  /**
   * Clears all values with the prefix.
   */
  function clearAll(): void {
    if (backend instanceof MemoryStorage) {
      backend.clear();
      return;
    }

    // For localStorage, iterate and remove prefixed keys
    if (typeof window !== "undefined" && window.localStorage) {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keys.push(key);
        }
      }
      keys.forEach((key) => window.localStorage.removeItem(key));
    }
  }

  /**
   * Lists all keys with the prefix.
   */
  function listKeys(): string[] {
    const keys: string[] = [];

    if (backend instanceof MemoryStorage) {
      // MemoryStorage doesn't expose keys, so we can't list them
      return keys;
    }

    if (typeof window !== "undefined" && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keys.push(key.slice(prefix.length));
        }
      }
    }

    return keys;
  }

  return {
    get,
    set,
    remove,
    clearAll,
    listKeys,
    prefix,
  };
}

/**
 * Default storage instance.
 */
export const defaultStorage = createStorage();

/**
 * Type alias for the storage instance.
 */
export type Storage = ReturnType<typeof createStorage>;
