import assert from "node:assert/strict";
import test from "node:test";

globalThis.__DOC_ROUTER_ENABLED__ = true;

const { setDocType, setSuggested } = await import("../src/state/docType.js");
const { getDocTemplateSnapshot } = await import(
  "../src/state/docTemplateStore.js"
);

async function waitForSnapshot(predicate, { timeout = 2000, interval = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const snapshot = getDocTemplateSnapshot();
    try {
      const result = predicate(snapshot);
      if (result) {
        return result;
      }
    } catch (error) {
      // ignore predicate error and continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Timed out waiting for doc template snapshot");
}

test("charter templates resolve manifest and schema", async (t) => {
  t.after(() => {
    setDocType("charter");
    setSuggested(null);
  });

  setDocType("charter");
  setSuggested(null);

  const snapshot = await waitForSnapshot((state) => {
    if (state.manifestStatus === "ready" && state.schemaStatus === "ready") {
      return state;
    }
    return null;
  });

  assert.equal(snapshot.docType, "charter");
  assert.equal(snapshot.schemaId, "charter");
  assert.ok(snapshot.manifest, "charter manifest should load");
  assert.ok(snapshot.schema, "charter schema should load");
});

test("ddp templates hydrate registry metadata", async (t) => {
  t.after(() => {
    setDocType("charter");
    setSuggested(null);
  });

  setDocType("ddp");
  setSuggested(null);

  const snapshot = await waitForSnapshot((state) => {
    if (state.docType !== "ddp") {
      return null;
    }
    if (state.manifestStatus === "ready" && state.schemaStatus === "ready") {
      return state;
    }
    return null;
  });

  assert.equal(snapshot.templateLabel, "Design & Development Plan");
  assert.equal(snapshot.schemaId, "ddp");
  assert.equal(snapshot.templateVersion, "2024.10");
  assert.ok(snapshot.manifestMetadata);
  assert.ok(snapshot.schema);
});
