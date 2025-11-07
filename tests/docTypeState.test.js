/**
---
scenario: DocTypeState Test
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

import { readStoredSession } from "../src/utils/storage.js";

function setupLocalStorage() {
  const previousWindow = globalThis.window;
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
  };
  return previousWindow;
}

test("manual doc type selection persists when router disabled", async () => {
  const previousWindow = setupLocalStorage();
  window.localStorage.clear();
  globalThis.__DOC_ROUTER_ENABLED__ = false;

  const moduleId = `../src/state/docType.js?router-disabled=${Date.now()}`;
  const { setDocType, getDocTypeSnapshot, DEFAULT_DOC_TYPE } = await import(
    moduleId
  );

  try {
    const initialSnapshot = getDocTypeSnapshot();
    assert.equal(initialSnapshot.docType, DEFAULT_DOC_TYPE);

    setDocType("ddp");
    const updatedSnapshot = getDocTypeSnapshot();
    assert.equal(updatedSnapshot.docType, "ddp");

    const stored = readStoredSession();
    assert.equal(stored.docType, "ddp");
    assert.equal(stored.selectedDocType, "ddp");

    setDocType("unknown");
    const fallbackSnapshot = getDocTypeSnapshot();
    assert.equal(fallbackSnapshot.docType, DEFAULT_DOC_TYPE);

    const persistedFallback = readStoredSession();
    assert.equal(persistedFallback.docType, DEFAULT_DOC_TYPE);
    assert.equal(persistedFallback.selectedDocType, DEFAULT_DOC_TYPE);
  } finally {
    delete globalThis.__DOC_ROUTER_ENABLED__;
    window.localStorage.clear();
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});
