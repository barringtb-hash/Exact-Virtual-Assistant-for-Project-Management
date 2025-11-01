import { useEffect, useSyncExternalStore, useCallback } from "react";

import { getTemplateManifest } from "../../templates/registry.js";
import { getDocTypeSnapshot, useDocType } from "./docType.js";
import { loadTemplateJson } from "../utils/loadTemplateJson.js";

const DEFAULT_STATE = {
  docType: null,
  templateLabel: null,
  templateVersion: null,
  schemaId: null,
  manifestMetadata: null,
  manifestStatus: "idle",
  manifest: null,
  manifestError: null,
  schemaStatus: "idle",
  schema: null,
  schemaError: null,
};

const manifestResources = new Map();
const schemaResources = new Map();

function normalizeDocType(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function createResource(status = "idle") {
  return {
    status,
    data: null,
    error: null,
    promise: null,
  };
}

function getResource(map, docType) {
  if (!docType) {
    return createResource("idle");
  }
  let entry = map.get(docType);
  if (!entry) {
    entry = createResource("idle");
    map.set(docType, entry);
  }
  return entry;
}

function normalizeManifestValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeSchemaValue(value) {
  return value && typeof value === "object" ? value : null;
}

let state = { ...DEFAULT_STATE };
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("Doc template subscriber failed", error);
    }
  });
}

function subscribe(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function applyState(partial) {
  const nextState = { ...state, ...partial };
  const keys = Object.keys(nextState);
  const changed = keys.some((key) => nextState[key] !== state[key]);
  if (!changed) {
    return;
  }
  state = nextState;
  emit();
}

function updateStateFromResources(docType) {
  const normalized = normalizeDocType(docType);
  const template = normalized ? getTemplateManifest(normalized) : null;
  const manifestResource = normalized ? manifestResources.get(normalized) : null;
  const schemaResource = normalized ? schemaResources.get(normalized) : null;

  const manifestStatus = normalized
    ? template?.manifestPath
      ? manifestResource?.status ?? "idle"
      : "missing"
    : "idle";
  const schemaStatus = normalized
    ? template?.schema?.path
      ? schemaResource?.status ?? "idle"
      : "missing"
    : "idle";

  applyState({
    docType: normalized,
    templateLabel: template?.label ?? null,
    templateVersion: template?.version ?? null,
    schemaId: template?.schemaId ?? null,
    manifestMetadata: template?.metadata ?? null,
    manifestStatus,
    manifest: manifestResource?.data ?? null,
    manifestError: manifestResource?.error ?? null,
    schemaStatus,
    schema: schemaResource?.data ?? null,
    schemaError: schemaResource?.error ?? null,
  });
}

function loadManifestForDocType(docType, manifestPath) {
  const resource = getResource(manifestResources, docType);
  if (!manifestPath) {
    resource.status = "missing";
    resource.data = null;
    resource.error = null;
    resource.promise = null;
    return;
  }
  if (resource.status === "loading" || resource.status === "ready") {
    return;
  }
  resource.status = "loading";
  resource.data = resource.data ?? null;
  resource.error = null;
  resource.promise = loadTemplateJson(manifestPath)
    .then((value) => normalizeManifestValue(value))
    .then((manifest) => {
      resource.status = "ready";
      resource.data = manifest;
      resource.error = null;
      resource.promise = null;
      if (state.docType === docType) {
        updateStateFromResources(docType);
      }
      return manifest;
    })
    .catch((error) => {
      console.error("Failed to load manifest for doc type", docType, error);
      resource.status = "error";
      resource.error = error;
      resource.data = null;
      resource.promise = null;
      if (state.docType === docType) {
        updateStateFromResources(docType);
      }
      return null;
    });
}

function loadSchemaForDocType(docType, schemaPath) {
  const resource = getResource(schemaResources, docType);
  if (!schemaPath) {
    resource.status = "missing";
    resource.data = null;
    resource.error = null;
    resource.promise = null;
    return;
  }
  if (resource.status === "loading" || resource.status === "ready") {
    return;
  }
  resource.status = "loading";
  resource.data = resource.data ?? null;
  resource.error = null;
  resource.promise = loadTemplateJson(schemaPath)
    .then((value) => normalizeSchemaValue(value))
    .then((schema) => {
      resource.status = "ready";
      resource.data = schema;
      resource.error = null;
      resource.promise = null;
      if (state.docType === docType) {
        updateStateFromResources(docType);
      }
      return schema;
    })
    .catch((error) => {
      console.error("Failed to load schema for doc type", docType, error);
      resource.status = "error";
      resource.error = error;
      resource.data = null;
      resource.promise = null;
      if (state.docType === docType) {
        updateStateFromResources(docType);
      }
      return null;
    });
}

function setActiveDocType(nextValue) {
  const docType = normalizeDocType(nextValue);
  if (!docType) {
    applyState({ ...DEFAULT_STATE });
    return;
  }

  const template = getTemplateManifest(docType);
  if (!template) {
    applyState({
      docType,
      templateLabel: null,
      templateVersion: null,
      schemaId: null,
      manifestMetadata: null,
      manifestStatus: "missing",
      manifest: null,
      manifestError: null,
      schemaStatus: "missing",
      schema: null,
      schemaError: null,
    });
    return;
  }

  loadManifestForDocType(docType, template.manifestPath ?? null);
  loadSchemaForDocType(docType, template.schema?.path ?? null);
  updateStateFromResources(docType);
}

const initialDocTypeSnapshot = (() => {
  try {
    return getDocTypeSnapshot()?.previewDocType ?? null;
  } catch (error) {
    return null;
  }
})();

if (initialDocTypeSnapshot) {
  setActiveDocType(initialDocTypeSnapshot);
}

export function useDocTemplate(selector) {
  const selectDocType = useCallback((snapshot) => snapshot.previewDocType, []);
  const previewDocType = useDocType(selectDocType);

  if (state.docType !== normalizeDocType(previewDocType)) {
    setActiveDocType(previewDocType);
  }

  useEffect(() => {
    setActiveDocType(previewDocType);
  }, [previewDocType]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return typeof selector === "function" ? selector(snapshot) : snapshot;
}

export function getDocTemplateSnapshot() {
  let snapshot;
  try {
    snapshot = getDocTypeSnapshot();
  } catch (error) {
    snapshot = null;
  }
  const nextDocType = normalizeDocType(snapshot?.previewDocType ?? null);
  if (state.docType !== nextDocType) {
    setActiveDocType(nextDocType);
  }
  return state;
}

export { setActiveDocType };
