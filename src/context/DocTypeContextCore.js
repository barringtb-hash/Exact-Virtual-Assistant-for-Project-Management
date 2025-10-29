import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { listDocTypeMetadata } from "../../lib/doc/typesMetadata.js";
import {
  areDocTypeSuggestionsEqual,
  normalizeDocTypeSuggestion,
} from "../utils/docTypeRouter.js";

const DEFAULT_DOC_TYPE = "charter";

export const DOC_CONTEXT_STORAGE_KEY = "eva-doc-context";

function normalizeType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function safeParse(raw) {
  if (typeof raw !== "string" || !raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.error("Failed to parse stored document context", error);
  }

  return null;
}

export function readStoredDocContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DOC_CONTEXT_STORAGE_KEY);
  return safeParse(raw);
}

export function mergeStoredDocContext(partial) {
  if (typeof window === "undefined") {
    return null;
  }

  if (!partial || typeof partial !== "object") {
    return readStoredDocContext();
  }

  const current = readStoredDocContext();
  const base = current && typeof current === "object" ? current : {};
  const next = { ...base, ...partial };

  try {
    window.localStorage.setItem(
      DOC_CONTEXT_STORAGE_KEY,
      JSON.stringify(next)
    );
  } catch (error) {
    console.error("Failed to persist document context", error);
  }

  return next;
}

const DocTypeContext = createContext(null);

export function DocTypeProvider({ children }) {
  const docRouterEnabled = useMemo(() => {
    const override =
      typeof globalThis !== "undefined" &&
      Object.prototype.hasOwnProperty.call(globalThis, "__DOC_ROUTER_ENABLED__")
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
  }, []);

  const metadataList = useMemo(() => listDocTypeMetadata(), []);
  const metadataMap = useMemo(() => {
    const entries = new Map();
    metadataList.forEach((entry) => {
      if (entry && entry.type) {
        entries.set(entry.type, entry);
      }
    });
    return entries;
  }, [metadataList]);
  const supportedDocTypes = useMemo(
    () => new Set(metadataMap.keys()),
    [metadataMap]
  );

  const storedContextRef = useRef(readStoredDocContext());
  const initialStored = storedContextRef.current;

  const initialSelected = (() => {
    const storedType = normalizeType(
      initialStored?.selectedDocType ?? initialStored?.docType
    );
    if (storedType && supportedDocTypes.has(storedType)) {
      return storedType;
    }
    return docRouterEnabled ? null : DEFAULT_DOC_TYPE;
  })();

  const initialSuggestion = (() => {
    const normalized = normalizeDocTypeSuggestion(
      initialStored?.suggestedDocType
    );
    if (normalized && supportedDocTypes.has(normalized.type)) {
      return normalized;
    }
    return null;
  })();

  const [selectedDocType, setSelectedDocTypeState] = useState(initialSelected);
  const [suggestedDocType, setSuggestedDocTypeState] = useState(
    initialSuggestion
  );

  const lastPersistedTypeRef = useRef(null);
  const lastPersistedSuggestionRef = useRef(null);

  useEffect(() => {
    if (!docRouterEnabled) {
      if (!selectedDocType || !supportedDocTypes.has(selectedDocType)) {
        setSelectedDocTypeState(DEFAULT_DOC_TYPE);
      }
      if (suggestedDocType) {
        setSuggestedDocTypeState(null);
      }
    }
  }, [docRouterEnabled, selectedDocType, suggestedDocType, supportedDocTypes]);

  useEffect(() => {
    const normalized = normalizeType(selectedDocType);
    const valid = normalized && supportedDocTypes.has(normalized)
      ? normalized
      : docRouterEnabled
      ? null
      : DEFAULT_DOC_TYPE;

    if (lastPersistedTypeRef.current === valid) {
      return;
    }

    const next = mergeStoredDocContext({
      docType: valid,
      selectedDocType: valid,
    });
    if (next) {
      storedContextRef.current = next;
    }
    lastPersistedTypeRef.current = valid;
  }, [selectedDocType, docRouterEnabled, supportedDocTypes]);

  useEffect(() => {
    const normalized = suggestedDocType &&
      supportedDocTypes.has(suggestedDocType.type)
      ? suggestedDocType
      : null;

    if (
      areDocTypeSuggestionsEqual(normalized, lastPersistedSuggestionRef.current)
    ) {
      return;
    }

    const next = mergeStoredDocContext({
      suggestedDocType: normalized,
    });
    if (next) {
      storedContextRef.current = next;
    }
    lastPersistedSuggestionRef.current = normalized;
  }, [suggestedDocType, supportedDocTypes]);

  const setSelectedDocType = useCallback(
    (value) => {
      setSelectedDocTypeState((prev) => {
        const nextValue =
          typeof value === "function" ? value(prev) : value;
        const normalized = normalizeType(nextValue);
        if (!normalized) {
          return docRouterEnabled ? null : DEFAULT_DOC_TYPE;
        }
        if (!supportedDocTypes.has(normalized)) {
          return prev;
        }
        return normalized;
      });
    },
    [docRouterEnabled, supportedDocTypes]
  );

  const setSuggestedDocType = useCallback((value) => {
    setSuggestedDocTypeState((prev) => {
      const nextValue =
        typeof value === "function" ? value(prev) : value;
      const normalized = normalizeDocTypeSuggestion(nextValue);
      if (!normalized) {
        return null;
      }
      if (!supportedDocTypes.has(normalized.type)) {
        return null;
      }
      return normalized;
    });
  }, [supportedDocTypes]);

  const previewDocType = useMemo(() => {
    if (!docRouterEnabled) {
      return selectedDocType || DEFAULT_DOC_TYPE;
    }

    if (selectedDocType && supportedDocTypes.has(selectedDocType)) {
      return selectedDocType;
    }

    if (suggestedDocType && supportedDocTypes.has(suggestedDocType.type)) {
      return suggestedDocType.type;
    }

    return null;
  }, [
    docRouterEnabled,
    selectedDocType,
    suggestedDocType,
    supportedDocTypes,
  ]);

  const effectiveDocType = previewDocType ?? DEFAULT_DOC_TYPE;

  const previewDocTypeLabel = useMemo(() => {
    if (!previewDocType) {
      return "Document";
    }
    const entry = metadataMap.get(previewDocType);
    return entry?.label || previewDocType;
  }, [metadataMap, previewDocType]);

  const selectedDocTypeLabel = useMemo(() => {
    if (!selectedDocType) {
      return "";
    }
    const entry = metadataMap.get(selectedDocType);
    return entry?.label || selectedDocType;
  }, [metadataMap, selectedDocType]);

  const suggestionConfidence = suggestedDocType?.confidence ?? 0;

  const contextValue = useMemo(
    () => ({
      docRouterEnabled,
      supportedDocTypes,
      metadataList,
      metadataMap,
      defaultDocType: DEFAULT_DOC_TYPE,
      selectedDocType,
      selectedDocTypeLabel,
      setSelectedDocType,
      suggestedDocType,
      suggestionConfidence,
      setSuggestedDocType,
      previewDocType,
      previewDocTypeLabel,
      effectiveDocType,
    }),
    [
      docRouterEnabled,
      effectiveDocType,
      metadataList,
      metadataMap,
      previewDocType,
      previewDocTypeLabel,
      selectedDocType,
      selectedDocTypeLabel,
      setSelectedDocType,
      setSuggestedDocType,
      suggestedDocType,
      suggestionConfidence,
      supportedDocTypes,
    ]
  );

  return React.createElement(
    DocTypeContext.Provider,
    { value: contextValue },
    children
  );
}

export function useDocTypeContext() {
  const context = useContext(DocTypeContext);
  if (!context) {
    throw new Error("useDocTypeContext must be used within a DocTypeProvider");
  }
  return context;
}

export default DocTypeContext;
