import { useMemo, useSyncExternalStore } from "react";

import { listDocTypeMetadata } from "../../lib/doc/typesMetadata.js";
import {
  areDocTypeSuggestionsEqual,
  normalizeDocTypeSuggestion,
} from "../utils/docTypeRouter.js";
import {
  mergeStoredSession,
  readStoredSession,
} from "../utils/storage.js";

const DEFAULT_DOC_TYPE = "charter";

function computeDocRouterEnabled() {
  const override =
    typeof globalThis !== "undefined" &&
    Object.prototype.hasOwnProperty.call(
      globalThis,
      "__DOC_ROUTER_ENABLED__"
    )
      ? globalThis.__DOC_ROUTER_ENABLED__
      : undefined;

  if (typeof override === "boolean") {
    return override;
  }

  const raw = import.meta?.env?.VITE_ENABLE_DOC_ROUTER;
  if (raw == null) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(normalized);
}

const docRouterEnabled = computeDocRouterEnabled();
const metadataList = listDocTypeMetadata();
const metadataMap = new Map();
metadataList.forEach((entry) => {
  if (entry && entry.type) {
    metadataMap.set(entry.type, entry);
  }
});
const supportedDocTypes = new Set(metadataMap.keys());

function normalizeStoredDocType(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return supportedDocTypes.has(trimmed) ? trimmed : null;
}

function readInitialDocState() {
  const stored = readStoredSession();
  const storedType = normalizeStoredDocType(
    stored?.selectedDocType ?? stored?.docType
  );
  const storedSuggestion = docRouterEnabled
    ? normalizeDocTypeSuggestion(stored?.suggestedDocType)
    : null;

  const initialDocType = docRouterEnabled
    ? storedType
    : storedType || DEFAULT_DOC_TYPE;

  const initialSuggested =
    storedSuggestion && supportedDocTypes.has(storedSuggestion.type)
      ? storedSuggestion
      : null;

  return {
    docType: initialDocType,
    suggested: initialSuggested,
  };
}

let state = readInitialDocState();

const listeners = new Set();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("Doc type subscriber failed", error);
    }
  });
}

function getState() {
  return state;
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

function persistDocType(value) {
  const normalized = value && supportedDocTypes.has(value) ? value : null;
  const fallback = docRouterEnabled ? null : DEFAULT_DOC_TYPE;
  const toStore = normalized ?? fallback;
  mergeStoredSession({
    docType: toStore,
    selectedDocType: toStore,
  });
}

function persistSuggested(value) {
  if (!docRouterEnabled) {
    return;
  }
  mergeStoredSession({ suggestedDocType: value });
}

export function setDocType(nextValue) {
  const previous = state.docType;
  const candidate =
    typeof nextValue === "function" ? nextValue(previous) : nextValue;

  const fallback = docRouterEnabled ? null : DEFAULT_DOC_TYPE;

  let next;
  if (typeof candidate !== "string") {
    next = fallback;
  } else {
    const trimmed = candidate.trim();
    if (!trimmed) {
      next = fallback;
    } else if (supportedDocTypes.has(trimmed)) {
      next = trimmed;
    } else if (docRouterEnabled) {
      next = previous ?? fallback;
    } else {
      next = fallback;
    }
  }

  if (previous === next) {
    return next;
  }

  state = { ...state, docType: next };
  persistDocType(next);
  notify();
  return next;
}

export function setSuggested(nextValue) {
  const previous = state.suggested;
  if (!docRouterEnabled) {
    if (previous !== null) {
      state = { ...state, suggested: null };
      mergeStoredSession({ suggestedDocType: null });
      notify();
    }
    return null;
  }

  const candidate =
    typeof nextValue === "function" ? nextValue(previous) : nextValue;
  const normalized = normalizeDocTypeSuggestion(candidate);
  const next =
    normalized && supportedDocTypes.has(normalized.type) ? normalized : null;

  if (areDocTypeSuggestionsEqual(previous, next)) {
    return next;
  }

  state = { ...state, suggested: next };
  persistSuggested(next);
  notify();
  return next;
}

function buildSnapshot(baseState) {
  const selectedDocType =
    baseState.docType && supportedDocTypes.has(baseState.docType)
      ? baseState.docType
      : docRouterEnabled
      ? baseState.docType
      : DEFAULT_DOC_TYPE;

  let previewDocType;
  if (!docRouterEnabled) {
    previewDocType = selectedDocType || DEFAULT_DOC_TYPE;
  } else if (selectedDocType && supportedDocTypes.has(selectedDocType)) {
    previewDocType = selectedDocType;
  } else if (
    baseState.suggested &&
    supportedDocTypes.has(baseState.suggested.type)
  ) {
    previewDocType = baseState.suggested.type;
  } else {
    previewDocType = null;
  }

  const effectiveDocType = previewDocType ?? DEFAULT_DOC_TYPE;
  const previewEntry = metadataMap.get(previewDocType);
  const selectedEntry = metadataMap.get(selectedDocType);
  const previewDocTypeLabel = previewDocType
    ? previewEntry?.label || previewDocType
    : "Document";
  const selectedDocTypeLabel = selectedDocType
    ? selectedEntry?.label || selectedDocType
    : "";
  const confidence = baseState.suggested?.confidence ?? 0;

  return {
    docRouterEnabled,
    metadataList,
    metadataMap,
    supportedDocTypes,
    defaultDocType: DEFAULT_DOC_TYPE,
    docType: selectedDocType,
    setDocType,
    suggested: baseState.suggested,
    setSuggested,
    confidence,
    previewDocType,
    previewDocTypeLabel,
    effectiveDocType,
    selectedDocType,
    setSelectedDocType: setDocType,
    suggestedDocType: baseState.suggested,
    setSuggestedDocType: setSuggested,
    suggestionConfidence: confidence,
    selectedDocTypeLabel,
  };
}

export function getDocTypeSnapshot() {
  return buildSnapshot(getState());
}

export function useDocType(selector) {
  const baseState = useSyncExternalStore(subscribe, getState, getState);
  const snapshot = useMemo(() => buildSnapshot(baseState), [baseState]);
  return typeof selector === "function" ? selector(snapshot) : snapshot;
}

export { DEFAULT_DOC_TYPE };
