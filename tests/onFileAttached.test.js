import assert from "node:assert/strict";
import test from "node:test";

import { onFileAttached } from "../src/hooks/useBackgroundExtraction.js";

function createMockStore({ routerEnabled = true } = {}) {
  const state = {
    docRouterEnabled: routerEnabled,
    supportedDocTypes: new Set(["charter", "ddp"]),
    selectedDocType: null,
    suggestedDocType: null,
    effectiveDocType: "charter",
    docType: null,
  };

  return {
    state,
    getSnapshot: () => ({
      docRouterEnabled: state.docRouterEnabled,
      supportedDocTypes: state.supportedDocTypes,
      selectedDocType: state.selectedDocType,
      suggestedDocType: state.suggestedDocType,
      effectiveDocType: state.effectiveDocType,
    }),
    setDocType: (value) => {
      state.docType = value ?? null;
      state.selectedDocType = state.docType;
      state.effectiveDocType = state.docType || "charter";
      return state.docType;
    },
    setSuggested: (nextValue) => {
      if (typeof nextValue === "function") {
        state.suggestedDocType = nextValue(state.suggestedDocType);
      } else {
        state.suggestedDocType = nextValue;
      }
      return state.suggestedDocType;
    },
  };
}

test("intent-only mode records suggestion without triggering extraction", async () => {
  const original = process.env.INTENT_ONLY_EXTRACTION;
  process.env.INTENT_ONLY_EXTRACTION = "true";

  try {
    const store = createMockStore();
    let extractionCalls = 0;
    let confirmations = 0;

    const result = await onFileAttached({
      attachments: [{ name: "requirements.pdf", text: "Project DDP overview" }],
      messages: [],
      voice: [],
      router: async () => ({ type: "ddp", confidence: 0.82 }),
      trigger: async () => {
        extractionCalls += 1;
        return { ok: true };
      },
      requireConfirmation: () => {
        confirmations += 1;
      },
      store: {
        getSnapshot: store.getSnapshot,
        setDocType: store.setDocType,
        setSuggested: store.setSuggested,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.suggestion.type, "ddp");
    assert.equal(store.state.docType, null);
    assert.equal(store.state.suggestedDocType.type, "ddp");
    assert.equal(extractionCalls, 0);
    assert.equal(confirmations, 0);
  } finally {
    if (typeof original === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = original;
    }
  }
});

test("intent-only mode requests confirmation for low confidence", async () => {
  const original = process.env.INTENT_ONLY_EXTRACTION;
  process.env.INTENT_ONLY_EXTRACTION = "true";

  try {
    const store = createMockStore();
    let confirmationRequested = 0;
    let extractionCalls = 0;

    const result = await onFileAttached({
      attachments: [{ name: "notes.txt", text: "Potential ddp scope" }],
      messages: [],
      voice: [],
      router: async () => ({ type: "ddp", confidence: 0.42 }),
      trigger: async () => {
        extractionCalls += 1;
        return { ok: true };
      },
      requireConfirmation: () => {
        confirmationRequested += 1;
      },
      store: {
        getSnapshot: store.getSnapshot,
        setDocType: store.setDocType,
        setSuggested: store.setSuggested,
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "needs-confirmation");
    assert.equal(store.state.docType, null);
    assert.equal(store.state.suggestedDocType.type, "ddp");
    assert.equal(extractionCalls, 0);
    assert.equal(confirmationRequested, 1);
  } finally {
    if (typeof original === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = original;
    }
  }
});

test("legacy mode triggers extraction when confidence meets threshold", async () => {
  const original = process.env.INTENT_ONLY_EXTRACTION;
  process.env.INTENT_ONLY_EXTRACTION = "false";

  try {
    const store = createMockStore();
    let extractionCalls = 0;

    const result = await onFileAttached({
      attachments: [{ name: "requirements.pdf", text: "Project DDP overview" }],
      messages: [],
      voice: [],
      router: async () => ({ type: "ddp", confidence: 0.82 }),
      trigger: async (overrides = {}) => {
        extractionCalls += 1;
        return { ok: true, docType: overrides.docType };
      },
      store: {
        getSnapshot: store.getSnapshot,
        setDocType: store.setDocType,
        setSuggested: store.setSuggested,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(store.state.docType, "ddp");
    assert.equal(store.state.selectedDocType, "ddp");
    assert.equal(store.state.suggestedDocType.type, "ddp");
    assert.equal(extractionCalls, 1);
  } finally {
    if (typeof original === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = original;
    }
  }
});
