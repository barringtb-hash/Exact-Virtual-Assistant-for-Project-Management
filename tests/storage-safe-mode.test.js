/**
---
scenario: Storage Safe Mode Test
feature: unknown
subsystem: unknown
envs: []
risk: unknown
owner: TBD
ci_suites: []
flaky: false
needs_review: true
preconditions:
  - TBD
data_setup: TBD
refs: []
---
*/

import assert from "node:assert/strict";
import test from "node:test";

function createTestWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
    },
  };
}

function withUniqueModuleUrl() {
  const url = new URL("../src/utils/storage.js", import.meta.url);
  url.search = `?safe-mode=${Math.random().toString(36).slice(2)}`;
  return url;
}

test("storage skips persistence in Cypress safe mode", async () => {
  const win = createTestWindow();
  globalThis.window = win;
  globalThis.__FLAG_OVERRIDES__ = { VITE_CYPRESS_SAFE_MODE: true };

  const moduleUrl = withUniqueModuleUrl();
  const { readStoredSession, mergeStoredSession, DOC_SESSION_STORAGE_KEY } = await import(
    moduleUrl.href
  );

  win.localStorage.setItem(DOC_SESSION_STORAGE_KEY, JSON.stringify({ foo: "bar" }));
  assert.equal(readStoredSession(), null);

  mergeStoredSession({ foo: "baz" });
  assert.equal(win.localStorage.getItem(DOC_SESSION_STORAGE_KEY), JSON.stringify({ foo: "bar" }));

  delete globalThis.window;
  delete globalThis.__FLAG_OVERRIDES__;
});

test("storage persists when safe mode is disabled", async () => {
  const win = createTestWindow();
  globalThis.window = win;
  delete globalThis.__FLAG_OVERRIDES__;

  const moduleUrl = withUniqueModuleUrl();
  const { readStoredSession, mergeStoredSession, DOC_SESSION_STORAGE_KEY } = await import(
    moduleUrl.href
  );

  assert.equal(readStoredSession(), null);
  mergeStoredSession({ foo: "bar" });
  assert.deepEqual(readStoredSession(), { foo: "bar" });

  win.localStorage.clear();
  delete globalThis.window;
});
