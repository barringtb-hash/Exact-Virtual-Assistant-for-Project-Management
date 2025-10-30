import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSyncCommand,
  handleTypeCommand,
  resolveManualSyncDocType,
} from "../src/utils/chatDocTypeCommands.js";

const SUPPORTED = new Set(["charter", "ddp"]);
const METADATA = new Map([
  ["charter", { label: "Project Charter" }],
  ["ddp", { label: "DDP" }],
]);

test("handleTypeCommand applies store updates for known doc IDs", () => {
  let appliedDocType = null;
  let suggestion = null;
  let modalClosed = false;
  const toasts = [];

  const result = handleTypeCommand({
    command: "/type charter",
    metadataMap: METADATA,
    supportedDocTypes: SUPPORTED,
    setDocType: (value) => {
      appliedDocType = value;
    },
    setSuggested: (value) => {
      suggestion = value;
    },
    closeDocTypeModal: () => {
      modalClosed = true;
    },
    pushToast: (toast) => {
      toasts.push(toast);
    },
  });

  assert.deepEqual(result, {
    handled: true,
    ok: true,
    docType: "charter",
    label: "Project Charter",
  });
  assert.equal(appliedDocType, "charter");
  assert.ok(suggestion);
  assert.equal(suggestion.type, "charter");
  assert.equal(suggestion.confidence, 1);
  assert.ok(modalClosed);
  assert.equal(toasts.at(-1)?.tone, "success");
  assert.match(toasts.at(-1)?.message || "", /Project Charter/);
});

test("handleTypeCommand warns when command is incomplete", () => {
  const warnings = [];
  const result = handleTypeCommand({
    command: " /type   ",
    supportedDocTypes: SUPPORTED,
    pushToast: (toast) => warnings.push(toast.message),
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing-id");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Include a document ID/);
});

test("handleTypeCommand lists available IDs when unknown", () => {
  const warnings = [];
  const result = handleTypeCommand({
    command: "/type roadmap",
    supportedDocTypes: SUPPORTED,
    pushToast: (toast) => warnings.push(toast.message),
  });

  assert.equal(result.reason, "unknown-type");
  assert.equal(result.docType, "roadmap");
  assert.ok(warnings[0].includes("roadmap"));
  assert.ok(warnings[0].includes("charter"));
});

test("resolveManualSyncDocType picks selected value when confirmed", () => {
  const snapshot = {
    docRouterEnabled: true,
    previewDocType: null,
    defaultDocType: "charter",
    supportedDocTypes: SUPPORTED,
    docType: "ddp",
    suggestedDocType: { type: "charter", confidence: 0.9 },
  };

  const resolved = resolveManualSyncDocType({ snapshot, confirmThreshold: 0.7 });
  assert.equal(resolved, "ddp");
});

test("resolveManualSyncDocType only uses suggestions above threshold", () => {
  const snapshot = {
    docRouterEnabled: true,
    previewDocType: null,
    defaultDocType: "charter",
    supportedDocTypes: SUPPORTED,
    docType: null,
    suggestedDocType: { type: "ddp", confidence: 0.6 },
  };

  assert.equal(resolveManualSyncDocType({ snapshot, confirmThreshold: 0.7 }), null);

  const confidentSnapshot = {
    ...snapshot,
    suggestedDocType: { type: "ddp", confidence: 0.9 },
  };
  assert.equal(resolveManualSyncDocType({ snapshot: confidentSnapshot }), "ddp");
});

test("handleSyncCommand requires doc type when router enabled", async () => {
  let opened = false;
  const warnings = [];
  const result = await handleSyncCommand({
    docRouterEnabled: true,
    resolveDocType: () => "",
    openDocTypePicker: () => {
      opened = true;
    },
    manualDocTypePrompt: "Pick one",
    pushToast: (toast) => warnings.push(toast.message),
  });

  assert.equal(result.reason, "docTypeRequired");
  assert.ok(opened);
  assert.equal(warnings[0], "Pick one");
});

test("handleSyncCommand short-circuits when busy", async () => {
  const messages = [];
  let started = false;
  const result = await handleSyncCommand({
    docRouterEnabled: true,
    resolveDocType: () => "charter",
    isBusy: true,
    canSyncNow: true,
    appendAssistantMessage: (text) => messages.push(text),
    onStart: () => {
      started = true;
    },
    buildDocTypeConfig: () => ({ label: "Project Charter" }),
  });

  assert.equal(result.reason, "busy");
  assert.ok(messages[0].includes("already updating"));
  assert.equal(started, false);
});

test("handleSyncCommand triggers extraction and success messaging", async () => {
  const messages = [];
  const lifecycle = [];

  const result = await handleSyncCommand({
    docRouterEnabled: false,
    docTypeOverride: "charter",
    canSyncNow: true,
    appendAssistantMessage: (text) => messages.push(text),
    extractAndPopulate: async () => ({ ok: true, draft: { id: 1 } }),
    buildDocTypeConfig: () => ({ label: "Project Charter" }),
    onStart: () => lifecycle.push("start"),
    onSuccess: () => lifecycle.push("success"),
    onComplete: () => lifecycle.push("complete"),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(lifecycle, ["start", "success", "complete"]);
  assert.ok(messages.at(-1)?.includes("refreshed"));
});

test("handleSyncCommand surfaces parse fallback", async () => {
  const messages = [];
  const parseCalls = [];
  const result = await handleSyncCommand({
    docRouterEnabled: false,
    docTypeOverride: "charter",
    canSyncNow: true,
    appendAssistantMessage: (text) => messages.push(text),
    extractAndPopulate: async () => ({ ok: false, reason: "parse-fallback", data: { raw: true } }),
    onParseFallback: (message, payload) => parseCalls.push({ message, payload }),
  });

  assert.equal(result.reason, "parse-fallback");
  assert.ok(messages[0].includes("parse"));
  assert.equal(parseCalls.length, 1);
  assert.deepEqual(parseCalls[0].payload.data, { raw: true });
});

test("handleSyncCommand reports extraction errors", async () => {
  const messages = [];
  const errors = [];
  const result = await handleSyncCommand({
    docRouterEnabled: false,
    docTypeOverride: "charter",
    canSyncNow: true,
    appendAssistantMessage: (text) => messages.push(text),
    extractAndPopulate: async () => ({ ok: false, reason: "error" }),
    onError: (message) => errors.push(message),
  });

  assert.equal(result.reason, "error");
  assert.ok(errors[0].includes("Unable to update"));
  assert.ok(messages[0].includes("couldn’t update"));
});
