/**
 * Document type state slice - manages document type selection.
 *
 * Migrated from src/state/docType.js to use unified tinyStore pattern.
 *
 * @module state/slices/docType
 */

import { createSlice } from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";
import { listDocTypeMetadata } from "../../../lib/doc/typesMetadata";
import {
  areDocTypeSuggestionsEqual,
  normalizeDocTypeSuggestion,
} from "../../utils/docTypeRouter";
import { mergeStoredSession, readStoredSession } from "../../utils/storage";

/**
 * Default document type.
 */
const DEFAULT_DOC_TYPE = "charter";

/**
 * Document type suggestion with confidence.
 */
export interface DocTypeSuggestion {
  type: string;
  confidence: number;
}

/**
 * Document type slice state shape.
 */
export interface DocTypeSliceState {
  docType: string | null;
  suggested: DocTypeSuggestion | null;
  docRouterEnabled: boolean;
}

/**
 * Computes whether the doc router is enabled from environment.
 */
function computeDocRouterEnabled(): boolean {
  const override =
    typeof globalThis !== "undefined" &&
    Object.prototype.hasOwnProperty.call(globalThis, "__DOC_ROUTER_ENABLED__")
      ? (globalThis as Record<string, unknown>).__DOC_ROUTER_ENABLED__
      : undefined;

  if (typeof override === "boolean") {
    return override;
  }

  const raw = (import.meta as Record<string, Record<string, unknown>>)?.env
    ?.VITE_ENABLE_DOC_ROUTER;
  if (raw == null) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(normalized);
}

// Initialize metadata
const docRouterEnabled = computeDocRouterEnabled();
const metadataList = listDocTypeMetadata();
const metadataMap = new Map<string, (typeof metadataList)[number]>();
metadataList.forEach((entry) => {
  if (entry && entry.type) {
    metadataMap.set(entry.type, entry);
  }
});
const supportedDocTypes = new Set(metadataMap.keys());

/**
 * Normalizes a stored document type value.
 */
function normalizeStoredDocType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return supportedDocTypes.has(trimmed) ? trimmed : null;
}

/**
 * Reads the initial document state from storage.
 */
function readInitialDocState(): Pick<DocTypeSliceState, "docType" | "suggested"> {
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

// Read initial state
const initial = readInitialDocState();

const initialState: DocTypeSliceState = {
  docType: initial.docType,
  suggested: initial.suggested,
  docRouterEnabled,
};

/**
 * Persists the document type to storage.
 */
function persistDocType(value: string | null) {
  const normalized =
    value && supportedDocTypes.has(value) ? value : null;
  const fallback = docRouterEnabled ? null : DEFAULT_DOC_TYPE;
  const toStore = normalized ?? fallback;
  mergeStoredSession({
    docType: toStore,
    selectedDocType: toStore,
  });
}

/**
 * Persists the suggested document type to storage.
 */
function persistSuggested(value: DocTypeSuggestion | null) {
  if (!docRouterEnabled) {
    return;
  }
  mergeStoredSession({ suggestedDocType: value });
}

/**
 * Document type slice for managing document type selection.
 */
export const docTypeSlice = createSlice({
  name: "docType",
  initialState,
  actions: (setState, getState) => ({
    /**
     * Sets the document type.
     */
    setDocType(
      nextValue: string | null | ((prev: string | null) => string | null)
    ): string | null {
      const state = getState();
      const previous = state.docType;
      const candidate =
        typeof nextValue === "function" ? nextValue(previous) : nextValue;

      const fallback = state.docRouterEnabled ? null : DEFAULT_DOC_TYPE;

      let next: string | null;
      if (typeof candidate !== "string") {
        next = fallback;
      } else {
        const trimmed = candidate.trim();
        if (!trimmed) {
          next = fallback;
        } else if (supportedDocTypes.has(trimmed)) {
          next = trimmed;
        } else if (state.docRouterEnabled) {
          next = previous ?? fallback;
        } else {
          next = fallback;
        }
      }

      if (previous === next) {
        return next;
      }

      setState({ docType: next });
      persistDocType(next);
      return next;
    },

    /**
     * Sets the suggested document type.
     */
    setSuggested(
      nextValue:
        | DocTypeSuggestion
        | null
        | ((prev: DocTypeSuggestion | null) => DocTypeSuggestion | null)
    ): DocTypeSuggestion | null {
      const state = getState();
      const previous = state.suggested;

      if (!state.docRouterEnabled) {
        if (previous !== null) {
          setState({ suggested: null });
          mergeStoredSession({ suggestedDocType: null });
        }
        return null;
      }

      const candidate =
        typeof nextValue === "function" ? nextValue(previous) : nextValue;
      const normalized = normalizeDocTypeSuggestion(candidate);
      const next =
        normalized && supportedDocTypes.has(normalized.type)
          ? normalized
          : null;

      if (areDocTypeSuggestionsEqual(previous, next)) {
        return next;
      }

      setState({ suggested: next });
      persistSuggested(next);
      return next;
    },

    /**
     * Resets the document type to default.
     */
    reset() {
      const fallback = docRouterEnabled ? null : DEFAULT_DOC_TYPE;
      setState({
        docType: fallback,
        suggested: null,
      });
      persistDocType(fallback);
      persistSuggested(null);
    },
  }),
});

// Export actions for backwards compatibility
export const { setDocType, setSuggested } = docTypeSlice.actions;

/**
 * Builds a snapshot of the document type state with computed properties.
 */
function buildSnapshot(baseState: DocTypeSliceState) {
  const selectedDocType =
    baseState.docType && supportedDocTypes.has(baseState.docType)
      ? baseState.docType
      : baseState.docRouterEnabled
      ? baseState.docType
      : DEFAULT_DOC_TYPE;

  let previewDocType: string | null;
  if (!baseState.docRouterEnabled) {
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
  const previewEntry = metadataMap.get(previewDocType ?? "");
  const selectedEntry = metadataMap.get(selectedDocType ?? "");
  const previewDocTypeLabel = previewDocType
    ? previewEntry?.label || previewDocType
    : "Document";
  const selectedDocTypeLabel = selectedDocType
    ? selectedEntry?.label || selectedDocType
    : "";
  const confidence = baseState.suggested?.confidence ?? 0;

  return {
    docRouterEnabled: baseState.docRouterEnabled,
    metadataList,
    metadataMap,
    supportedDocTypes,
    defaultDocType: DEFAULT_DOC_TYPE,
    docType: selectedDocType,
    setDocType: docTypeSlice.actions.setDocType,
    suggested: baseState.suggested,
    setSuggested: docTypeSlice.actions.setSuggested,
    confidence,
    previewDocType,
    previewDocTypeLabel,
    effectiveDocType,
    selectedDocType,
    setSelectedDocType: docTypeSlice.actions.setDocType,
    suggestedDocType: baseState.suggested,
    setSuggestedDocType: docTypeSlice.actions.setSuggested,
    suggestionConfidence: confidence,
    selectedDocTypeLabel,
  };
}

/**
 * Gets the current document type snapshot.
 */
export function getDocTypeSnapshot() {
  return buildSnapshot(docTypeSlice.getState());
}

/**
 * Hook to access document type state with optional selector.
 */
export function useDocType<T = ReturnType<typeof buildSnapshot>>(
  selector?: (snapshot: ReturnType<typeof buildSnapshot>) => T
): T {
  const state = useStore(docTypeSlice.store, (s) => s);
  const snapshot = buildSnapshot(state);
  return typeof selector === "function"
    ? selector(snapshot)
    : (snapshot as unknown as T);
}

// Additional selector hooks
export const useSelectedDocType = () =>
  useStore(docTypeSlice.store, (state) => state.docType);

export const useSuggestedDocType = () =>
  useStore(docTypeSlice.store, (state) => state.suggested);

export const useDocRouterEnabled = () =>
  useStore(docTypeSlice.store, (state) => state.docRouterEnabled);

export const usePreviewDocType = () => {
  const state = useStore(docTypeSlice.store, (s) => s);
  return buildSnapshot(state).previewDocType;
};

export const useEffectiveDocType = () => {
  const state = useStore(docTypeSlice.store, (s) => s);
  return buildSnapshot(state).effectiveDocType;
};

// Export constants
export { DEFAULT_DOC_TYPE, supportedDocTypes, metadataList, metadataMap };

// Export store API for direct access
export const docTypeStoreApi = docTypeSlice.store;
