import assert from "node:assert/strict";
import test from "node:test";

import { listDocTypeMetadata } from "../lib/doc/typesMetadata.js";
import {
  mergeStoredSession,
  readStoredSession,
} from "../src/utils/storage.js";
import { normalizeDocTypeSuggestion } from "../src/utils/docTypeRouter.js";

function computePreviewDocType({
  docRouterEnabled,
  selectedDocType,
  suggestedDocType,
  supportedDocTypes,
}) {
  if (!docRouterEnabled) {
    return selectedDocType || "charter";
  }
  if (selectedDocType && supportedDocTypes.has(selectedDocType)) {
    return selectedDocType;
  }
  const normalizedSuggestion = normalizeDocTypeSuggestion(suggestedDocType);
  if (normalizedSuggestion && supportedDocTypes.has(normalizedSuggestion.type)) {
    return normalizedSuggestion.type;
  }
  return null;
}

test("merge helper persists doc type selection", () => {
  if (typeof window === "undefined") {
    const store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
      },
    };
  }

  window.localStorage.clear();
  mergeStoredSession({ docType: "ddp", selectedDocType: "ddp" });
  const stored = readStoredSession();
  assert.equal(stored.docType, "ddp");
  assert.equal(stored.selectedDocType, "ddp");
});

test("metadata labels drive preview display names", () => {
  const metadataMap = new Map(
    listDocTypeMetadata().map((entry) => [entry.type, entry.label])
  );
  assert.equal(metadataMap.get("charter"), "Charter");
  assert.equal(metadataMap.get("ddp"), "Design & Development Plan");
});

test("preview doc type falls back to suggestion when selection missing", () => {
  const metadata = listDocTypeMetadata();
  const supportedDocTypes = new Set(metadata.map((entry) => entry.type));
  const preview = computePreviewDocType({
    docRouterEnabled: true,
    selectedDocType: null,
    suggestedDocType: { type: "ddp", confidence: 0.9 },
    supportedDocTypes,
  });
  assert.equal(preview, "ddp");
});

test("locks should reset when preview doc type is cleared", () => {
  const metadata = listDocTypeMetadata();
  const supportedDocTypes = new Set(metadata.map((entry) => entry.type));
  const preview = computePreviewDocType({
    docRouterEnabled: true,
    selectedDocType: null,
    suggestedDocType: null,
    supportedDocTypes,
  });
  const initialLocks = { field: { locked: true } };
  const nextLocks = preview ? initialLocks : {};
  assert.deepEqual(nextLocks, {});
});
