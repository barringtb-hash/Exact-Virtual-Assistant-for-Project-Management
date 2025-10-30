import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssistantFeedbackTemplate, {
  useAssistantFeedbackSections,
} from "./components/AssistantFeedbackTemplate";
import Composer from "./components/Composer";
import PreviewEditable from "./components/PreviewEditable";
import DocTypeModal from "./components/DocTypeModal";
import getBlankDoc from "./utils/getBlankDoc.js";
import normalizeCharter from "../lib/charter/normalize.js";
import useBackgroundExtraction, {
  mergeExtractedDraft,
  onFileAttached,
} from "./hooks/useBackgroundExtraction";
import {
  handleSyncCommand,
  handleTypeCommand,
  resolveManualSyncDocType,
} from "./utils/chatDocTypeCommands.js";
import { isDocTypeConfirmed, normalizeDocTypeSuggestion } from "./utils/docTypeRouter";
import { getDocTypeSnapshot, useDocType } from "./state/docType.js";
import { useDocTemplate } from "./state/docTemplateStore.js";
import { mergeStoredSession, readStoredSession } from "./utils/storage.js";
import { docApi } from "./lib/docApi.js";

const THEME_STORAGE_KEY = "eva-theme-mode";
const MANUAL_PARSE_FALLBACK_MESSAGE = "I couldn’t parse the last turn—keeping your entries.";
const MANUAL_SYNC_DOC_TYPE_PROMPT =
  "Confirm a document template so I know what to sync. Pick one in the modal or run `/type <id>`.";

const normalizeCharterDraft = (draft) => normalizeCharter(draft);

const DEFAULT_DOC_TYPE = "charter";
const GENERIC_DOC_NORMALIZER = (draft) =>
  draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};

function buildDocTypeConfig(docType, metadataMap = new Map()) {
  const hasExplicitDocType = typeof docType === "string" && docType.trim();
  if (!hasExplicitDocType) {
    return {
      type: null,
      label: "Document",
      normalize: GENERIC_DOC_NORMALIZER,
      createBlank: () => getBlankDoc(null),
      requiredFieldsHeading: "Document required fields",
      defaultBaseName: "Project_Document_v1.0",
      previewKind: "generic",
    };
  }

  const normalized = docType.trim();

  if (normalized === "charter") {
    const label = metadataMap.get("charter")?.label || "Charter";
    return {
      type: "charter",
      label,
      normalize: normalizeCharterDraft,
      createBlank: () => normalizeCharterDraft(getBlankDoc("charter")),
      requiredFieldsHeading: "Charter required fields",
      defaultBaseName: "Project_Charter_v1.0",
      previewKind: "charter",
    };
  }

  if (normalized === "ddp") {
    const label = metadataMap.get("ddp")?.label || "DDP";
    return {
      type: "ddp",
      label,
      normalize: GENERIC_DOC_NORMALIZER,
      createBlank: () => getBlankDoc("ddp"),
      requiredFieldsHeading: `${label} required fields`,
      defaultBaseName: `Project_${label.replace(/\s+/g, "_")}_v1.0`,
      previewKind: "generic",
    };
  }

  const fallbackLabel = metadataMap.get(normalized)?.label || "Document";
  return {
    type: normalized,
    label: fallbackLabel,
    normalize: GENERIC_DOC_NORMALIZER,
    createBlank: () => getBlankDoc(normalized),
    requiredFieldsHeading: `${fallbackLabel} required fields`,
    defaultBaseName: `Project_${fallbackLabel.replace(/\s+/g, "_")}_v1.0`,
    previewKind: "generic",
  };
}

const NUMERIC_SEGMENT_PATTERN = /^\d+$/;

function setNestedValue(source, segments, value) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return source;
  }

  const [segment, ...rest] = segments;
  const isIndex = NUMERIC_SEGMENT_PATTERN.test(segment);
  const key = isIndex ? Number(segment) : segment;

  let container;
  if (Array.isArray(source)) {
    container = [...source];
  } else if (source && typeof source === "object") {
    container = { ...source };
  } else {
    container = isIndex ? [] : {};
  }

  if (rest.length === 0) {
    if (Array.isArray(container) && typeof key === "number") {
      const arr = [...container];
      arr[key] = value;
      return arr;
    }
    container[key] = value;
    return container;
  }

  const nextSource = container[key];
  const nextContainer = setNestedValue(nextSource, rest, value);

  if (Array.isArray(container) && typeof key === "number") {
    const arr = [...container];
    arr[key] = nextContainer;
    return arr;
  }

  container[key] = nextContainer;
  return container;
}

function hasDraftContent(value) {
  if (!value) {
    return false;
  }

  if (typeof value === "string") {
    return Boolean(value.trim());
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasDraftContent(entry));
  }

  if (typeof value === "object") {
    return Object.values(value).some((entry) => hasDraftContent(entry));
  }

  return false;
}

function walkDraft(value, callback, basePath = "") {
  if (basePath) {
    callback(basePath, value);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const childPath = basePath ? `${basePath}.${index}` : `${index}`;
      walkDraft(item, callback, childPath);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const childPath = basePath ? `${basePath}.${key}` : key;
      walkDraft(entry, callback, childPath);
    });
  }
}

function collectPaths(value) {
  const paths = [];
  walkDraft(value, (path) => paths.push(path));
  return paths;
}

function expandPathsWithAncestors(paths) {
  const set = new Set();
  paths.forEach((path) => {
    if (!path) return;
    const segments = path.split(".").filter(Boolean);
    for (let index = 1; index <= segments.length; index += 1) {
      set.add(segments.slice(0, index).join("."));
    }
  });
  return set;
}

function getPathsToUpdate(path) {
  if (!path) return new Set();
  const segments = path.split(".").filter(Boolean);
  const result = new Set();
  for (let index = 1; index <= segments.length; index += 1) {
    result.add(segments.slice(0, index).join("."));
  }
  return result;
}

function isPathLocked(locks, path) {
  if (!locks || !path) return false;
  const segments = path.split(".").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}.${segment}` : segment;
    if (locks[current]) {
      return true;
    }
  }
  return false;
}

function synchronizeFieldStates(
  draft,
  prevStates = {},
  { touchedPaths = new Set(), source, timestamp, locks = {} } = {}
) {
  const nextStates = {};
  const touched = touchedPaths instanceof Set ? touchedPaths : new Set(touchedPaths);
  const hasTimestamp = typeof timestamp === "number" && !Number.isNaN(timestamp);
  const baseNow = Date.now();

  walkDraft(draft, (path, value) => {
    const prevEntry = prevStates[path];
    const isTouched = touched.has(path);
    const locked = Boolean(locks && locks[path]);
    const nextSource = isTouched
      ? source ?? prevEntry?.source ?? "Auto"
      : prevEntry?.source ?? "Auto";
    const nextUpdatedAt = isTouched
      ? hasTimestamp
        ? timestamp
        : baseNow
      : typeof prevEntry?.updatedAt === "number"
      ? prevEntry.updatedAt
      : baseNow;

    nextStates[path] = {
      value,
      locked,
      source: nextSource,
      updatedAt: nextUpdatedAt,
    };
  });

  return nextStates;
}

function getValueAtPath(source, path) {
  if (!path) {
    return source;
  }

  const segments = Array.isArray(path) ? path : path.split(".").filter(Boolean);
  let current = source;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(segment in current)) {
        return undefined;
      }
      current = current[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

// --- Tiny inline icons (no external deps) ---
const IconUpload = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M12 16V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
  </svg>
);
const IconPaperclip = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M21.44 11.05L12 20.5a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.17 18.17" />
  </svg>
);
const IconSend = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);
const IconMic = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </svg>
);
const IconPlus = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);
const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("File reading failed"));
    reader.readAsDataURL(file);
  });

const prettyBytes = (num) => {
  if (!Number.isFinite(num) || num < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = num;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value < 10 && unitIndex > 0 ? 1 : 0;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

function restoreFilesFromStoredAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const baseTimestamp = Date.now();
  return attachments
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const name = typeof item.name === "string" ? item.name : "";
      if (!name) {
        return null;
      }

      const text = typeof item.text === "string" ? item.text : "";
      let sizeLabel = "";
      if (text) {
        try {
          const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
          const bytes = encoder ? encoder.encode(text).length : text.length;
          sizeLabel = prettyBytes(bytes);
        } catch (error) {
          sizeLabel = `${text.length} chars`;
        }
      }

      return {
        id: `${baseTimestamp}-restored-${index}`,
        name,
        size: sizeLabel || undefined,
        file: null,
      };
    })
    .filter(Boolean);
}

// --- Seed messages ---
// Friendly, generic starter messages to welcome users
const seedMessages = [
  {
    id: 1,
    role: "assistant",
    text: "Hello! I’m your project management assistant. How can I help you today?",
  },
  {
    id: 2,
    role: "assistant",
    text: "Feel free to share your project scope or ask any project‑related questions.",
  },
];

export default function ExactVirtualAssistantPM() {
  const initialDraftRef = useRef(null);
  const {
    docRouterEnabled,
    supportedDocTypes,
    metadataMap,
    selectedDocType,
    setSelectedDocType,
    suggestedDocType,
    suggestionConfidence,
    setSuggestedDocType,
    previewDocType,
    previewDocTypeLabel,
    effectiveDocType,
    defaultDocType,
  } = useDocType();
  const docType = selectedDocType;
  const setDocType = setSelectedDocType;
  const suggested = suggestedDocType;
  const setSuggested = setSuggestedDocType;
  const {
    docType: templateDocType,
    templateLabel: activeTemplateLabel,
    templateVersion: activeTemplateVersion,
    schemaId: activeSchemaId,
    manifestMetadata: activeManifestMetadata,
    manifestStatus,
    manifest: activeDocManifest,
    schemaStatus,
    schema: activeDocSchema,
  } = useDocTemplate();
  const storedContextRef = useRef(readStoredSession());
  const [messages, setMessages] = useState(() => {
    const stored = storedContextRef.current;
    if (stored && Array.isArray(stored.messages) && stored.messages.length > 0) {
      return stored.messages;
    }
    return seedMessages;
  });
  const visibleMessages = useMemo(() => {
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.filter((entry) => entry.role === "user" || entry.role === "assistant");
  }, [messages]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState(() => {
    const stored = storedContextRef.current;
    return restoreFilesFromStoredAttachments(stored?.attachments);
  });
  const [attachments, setAttachments] = useState(() => {
    const stored = storedContextRef.current;
    if (stored && Array.isArray(stored.attachments) && stored.attachments.length > 0) {
      return stored.attachments
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const name = typeof item.name === "string" ? item.name : "";
          const text = typeof item.text === "string" ? item.text : "";
          if (!name || !text) {
            return null;
          }
          const mimeType = typeof item.mimeType === "string" ? item.mimeType : undefined;
          return { name, mimeType, text };
        })
        .filter(Boolean);
    }
    return [];
  });
  const [showDocTypeModal, setShowDocTypeModal] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState([]);
  const suggestionType = suggested?.type;
  const hasConfirmedDocType = useMemo(() => {
    if (!docRouterEnabled) {
      return true;
    }
    return isDocTypeConfirmed({
      selectedDocType: supportedDocTypes.has(docType)
        ? docType
        : null,
      suggestion: suggested,
      threshold: 0.7,
      allowedTypes: supportedDocTypes,
    });
  }, [
    docRouterEnabled,
    docType,
    suggested,
    supportedDocTypes,
  ]);
  const docTypeConfig = useMemo(() => {
    const baseConfig = buildDocTypeConfig(previewDocType, metadataMap);
    if (activeTemplateLabel && baseConfig.label !== activeTemplateLabel) {
      return { ...baseConfig, label: activeTemplateLabel };
    }
    return baseConfig;
  }, [activeTemplateLabel, metadataMap, previewDocType]);
  const docTypeDisplayLabel = docTypeConfig.label;
  const docPreviewLabel = previewDocType
    ? `${docTypeDisplayLabel} preview`
    : "Document preview";
  const docTypeBadgeLabel = previewDocTypeLabel || docTypeDisplayLabel || "Document";
  const normalizedConfidence = Number.isFinite(suggestionConfidence)
    ? Math.max(0, Math.min(1, suggestionConfidence))
    : null;
  const docTypeConfidencePercent =
    docRouterEnabled &&
    suggestionType &&
    suggestionType === previewDocType &&
    (!selectedDocType || selectedDocType !== previewDocType) &&
    normalizedConfidence !== null &&
    normalizedConfidence > 0
      ? Math.round(normalizedConfidence * 100)
      : null;
  const requiredFieldsHeading = docTypeConfig.requiredFieldsHeading;
  const defaultShareBaseName = docTypeConfig.defaultBaseName;
  const hasPreviewDocType = Boolean(previewDocType);
  const manifestLoading =
    hasPreviewDocType && (manifestStatus === "loading" || manifestStatus === "idle");
  const schemaLoading =
    hasPreviewDocType && (schemaStatus === "loading" || schemaStatus === "idle");
  const templateLoading = manifestLoading || schemaLoading;
  const templateError =
    hasPreviewDocType &&
    (manifestStatus === "error" || schemaStatus === "error");
  const createBlankDraft = useCallback(() => {
    if (!previewDocType) {
      return {};
    }
    return docTypeConfig.createBlank();
  }, [docTypeConfig, previewDocType]);
  if (initialDraftRef.current === null && previewDocType) {
    initialDraftRef.current = createBlankDraft();
  }
  const normalizeDraft = useCallback(
    (draft) => (previewDocType ? docTypeConfig.normalize(draft) : GENERIC_DOC_NORMALIZER(draft)),
    [docTypeConfig, previewDocType]
  );
  const requestDocType = previewDocType || defaultDocType || DEFAULT_DOC_TYPE;
  const lastDocTypeRef = useRef(requestDocType);
  const [extractionSeed, setExtractionSeed] = useState(() => Date.now());
  const [charterPreview, setCharterPreview] = useState(initialDraftRef.current);
  const [locks, setLocks] = useState(() => ({}));
  const [fieldStates, setFieldStates] = useState(() => {
    const draft = initialDraftRef.current;
    const paths = expandPathsWithAncestors(collectPaths(draft));
    const now = Date.now();
    return synchronizeFieldStates(draft, {}, { touchedPaths: paths, source: "Auto", timestamp: now, locks: {} });
  });
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingExportLinks, setIsGeneratingExportLinks] = useState(false);
  const [listening, setListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [rec, setRec] = useState(null);
  const [rtcState, setRtcState] = useState("idle");
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [isCharterSyncing, setIsCharterSyncing] = useState(false);
  const [charterSyncError, setCharterSyncError] = useState(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const mode = stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
    const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = mode === "dark" || (mode === "auto" && prefersDark);
    return useDark ? "dark" : "light";
  });
  const shareLinksHealthRef = useRef({ status: "unknown" });
  const shareLinksWarningPostedRef = useRef(false);
  // voice picker removed; server uses env OPENAI_REALTIME_VOICE
  const fileInputRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const micStreamRef = useRef(null);
  const dataRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const hideEmptySections = useMemo(() => {
    const raw = import.meta?.env?.VITE_HIDE_EMPTY_SECTIONS;
    if (raw == null) {
      return true;
    }

    return String(raw).trim().toLowerCase() !== "false";
  }, []);
  const charterDraftRef = useRef(initialDraftRef.current);
  const locksRef = useRef(locks);
  const toastTimersRef = useRef(new Map());
  const realtimeEnabled = Boolean(import.meta.env.VITE_OPENAI_REALTIME_MODEL);
  useEffect(() => {
    charterDraftRef.current = charterPreview;
  }, [charterPreview]);

  useEffect(() => {
    locksRef.current = locks;
  }, [locks]);

  useEffect(() => {
    if (!previewDocType) {
      initialDraftRef.current = null;
      charterDraftRef.current = null;
      if (charterPreview !== null) {
        setCharterPreview(null);
      }
      if (locksRef.current && Object.keys(locksRef.current).length > 0) {
        locksRef.current = {};
        setLocks({});
      }
      setFieldStates((prev) => (prev && Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    if (initialDraftRef.current === null) {
      initialDraftRef.current = createBlankDraft();
    }

    if (charterPreview === null) {
      const baseDraft = initialDraftRef.current ?? createBlankDraft();
      charterDraftRef.current = baseDraft;
      setCharterPreview(baseDraft);
      const touchedPaths = expandPathsWithAncestors(collectPaths(baseDraft));
      const now = Date.now();
      setFieldStates((prev) =>
        synchronizeFieldStates(baseDraft, prev || {}, {
          touchedPaths,
          source: "Auto",
          timestamp: now,
          locks: locksRef.current || {},
        })
      );
    }
  }, [previewDocType, charterPreview, createBlankDraft]);

  useEffect(() => {
    if (!docRouterEnabled) {
      setShowDocTypeModal(false);
      if (suggested) {
        setSuggested(null);
      }
      if (!docType || !supportedDocTypes.has(docType)) {
        setDocType(defaultDocType);
      }
    }
  }, [
    defaultDocType,
    docRouterEnabled,
    docType,
    setDocType,
    setSuggested,
    suggested,
    supportedDocTypes,
  ]);

  useEffect(() => {
    mergeStoredSession({ attachments, messages });
  }, [attachments, messages]);

  const getCurrentDraft = useCallback(() => charterDraftRef.current, []);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      toastTimersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id) => {
    if (!id) return;
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeoutId = toastTimersRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    ({ tone = "info", message, ttl = 6000 } = {}) => {
      const text = typeof message === "string" ? message.trim() : "";
      if (!text) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast = { id, tone, message: text, createdAt: Date.now() };
      setToasts((prev) => [...prev, toast]);
      if (ttl > 0) {
        const timeoutId = setTimeout(() => {
          dismissToast(id);
        }, ttl);
        toastTimersRef.current.set(id, timeoutId);
      }
    },
    [dismissToast]
  );
  const applyNormalizedDraft = useCallback(
    (normalizedDraft) => {
      if (!previewDocType) {
        return charterDraftRef.current ?? initialDraftRef.current ?? {};
      }
      if (!normalizedDraft || typeof normalizedDraft !== "object") {
        return charterDraftRef.current ?? initialDraftRef.current ?? createBlankDraft();
      }

      const locksSnapshot = locksRef.current || {};
      const baseDraft = charterDraftRef.current ?? initialDraftRef.current ?? createBlankDraft();
      const finalDraft = mergeExtractedDraft(baseDraft, normalizedDraft, locksSnapshot);

      charterDraftRef.current = finalDraft;
      setCharterPreview(finalDraft);

      const candidatePaths = collectPaths(normalizedDraft);
      const filteredPaths = candidatePaths.filter((path) => !isPathLocked(locksSnapshot, path));
      const touchedPaths = expandPathsWithAncestors(filteredPaths);
      const now = Date.now();

      setFieldStates((prevStates) =>
        synchronizeFieldStates(finalDraft, prevStates, {
          touchedPaths,
          source: "Auto",
          timestamp: now,
          locks: locksSnapshot,
        })
      );

      return finalDraft;
    },
    [createBlankDraft, previewDocType]
  );

  const {
    isExtracting,
    error: extractError,
    clearError: clearExtractionError,
    extractAndPopulate,
  } = useBackgroundExtraction({
    docType: effectiveDocType,
    selectedDocType: supportedDocTypes.has(docType)
      ? docType
      : null,
    suggestedDocType: suggested,
    allowedDocTypes: supportedDocTypes,
    messages,
    voice: voiceTranscripts,
    attachments,
    seed: extractionSeed,
    locks,
    getDraft: getCurrentDraft,
    setDraft: applyNormalizedDraft,
    normalize: normalizeDraft,
    isUploadingAttachments,
    onNotify: pushToast,
    docTypeRoutingEnabled: docRouterEnabled,
    requireDocType: () => setShowDocTypeModal(true),
  });
  const canSyncNow = useMemo(() => {
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const hasVoice = Array.isArray(voiceTranscripts) && voiceTranscripts.length > 0;
    const hasUserMessage = Array.isArray(messages)
      ? messages.some((entry) => {
          if ((entry?.role || "user") !== "user") return false;
          const text = typeof entry?.text === "string" ? entry.text : entry?.content;
          return Boolean(typeof text === "string" && text.trim());
        })
      : false;
    return hasAttachments || hasVoice || hasUserMessage;
  }, [attachments, voiceTranscripts, messages]);
  useEffect(() => {
    if (!docRouterEnabled) {
      return;
    }
    if (hasConfirmedDocType) {
      return;
    }
    if (!canSyncNow) {
      return;
    }
    setShowDocTypeModal(true);
  }, [docRouterEnabled, hasConfirmedDocType, canSyncNow]);
  const isCharterSyncInFlight = isExtracting || isCharterSyncing;
  const activeCharterError = charterSyncError || extractError;

  const applyCharterDraft = useCallback(
    (nextDraft, { resetLocks = false, source = "Auto" } = {}) => {
      if (!previewDocType) {
        return null;
      }
      const draft =
        nextDraft && typeof nextDraft === "object" && !Array.isArray(nextDraft)
          ? nextDraft
          : createBlankDraft();
      const locksSnapshot = resetLocks ? {} : locksRef.current || {};

      if (resetLocks) {
        locksRef.current = {};
        setLocks({});
      }

      charterDraftRef.current = draft;
      setCharterPreview(draft);

      const touchedPaths = expandPathsWithAncestors(collectPaths(draft));
      const now = Date.now();

      setFieldStates((prevStates) =>
        synchronizeFieldStates(draft, resetLocks ? {} : prevStates, {
          touchedPaths,
          source,
          timestamp: now,
          locks: locksSnapshot,
        })
      );
      return draft;
    },
    [createBlankDraft, previewDocType]
  );

  useEffect(() => {
    if (!previewDocType) {
      lastDocTypeRef.current = requestDocType;
      return;
    }
    if (lastDocTypeRef.current === requestDocType) {
      return;
    }
    lastDocTypeRef.current = requestDocType;
    const blankDraft = createBlankDraft();
    initialDraftRef.current = blankDraft;
    if (!hasDraftContent(charterPreview)) {
      applyCharterDraft(blankDraft, { resetLocks: true });
    }
  }, [
    applyCharterDraft,
    charterPreview,
    createBlankDraft,
    previewDocType,
    requestDocType,
  ]);

  const handleDraftChange = useCallback(
    (path, value) => {
      if (!previewDocType) return;
      if (!path) return;
      const segments = path.split(".").filter(Boolean);
      if (segments.length === 0) return;

      setCharterPreview((prev) => {
        const base = prev ?? createBlankDraft();
        const next = setNestedValue(base, segments, value);
        charterDraftRef.current = next;
        const touchedPaths = getPathsToUpdate(path);
        const subtreeValue = getValueAtPath(next, segments);
        if (typeof subtreeValue !== "undefined") {
          walkDraft(subtreeValue, (subPath) => {
            touchedPaths.add(subPath);
          }, path);
        }
        const now = Date.now();
        setFieldStates((prevStates) =>
          synchronizeFieldStates(next, prevStates, {
            touchedPaths,
            source: "Manual",
            timestamp: now,
            locks: locksRef.current,
          })
        );
        return next;
      });
    },
    [createBlankDraft, previewDocType]
  );

  const handleLockField = useCallback((path) => {
    if (!path) return;
    if (!previewDocType) return;
    setLocks((prev) => {
      if (prev[path]) {
        return prev;
      }
      const nextLocks = { ...prev, [path]: true };
      locksRef.current = nextLocks;
      const touchedPaths = getPathsToUpdate(path);
      setFieldStates((prevStates) => {
        const prevEntry = prevStates?.[path];
        const source = prevEntry?.source ?? "Manual";
        const updatedAt = typeof prevEntry?.updatedAt === "number" ? prevEntry.updatedAt : Date.now();
        return synchronizeFieldStates(charterDraftRef.current, prevStates, {
          touchedPaths,
          source,
          timestamp: updatedAt,
          locks: nextLocks,
        });
      });
      return nextLocks;
    });
  }, [previewDocType]);

  const draftHasContent = useMemo(() => hasDraftContent(charterPreview), [charterPreview]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isAssistantThinking]);

  const handleThemeModeChange = (value) => {
    if (value === "light" || value === "dark" || value === "auto") {
      setThemeMode(value);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    const applyTheme = (mode) => {
      const useDark = mode === "dark" || (mode === "auto" && mediaQuery ? mediaQuery.matches : false);
      document.documentElement.classList.toggle("dark", useDark);
      document.documentElement.style.colorScheme = useDark ? "dark" : "light";
      setResolvedTheme(useDark ? "dark" : "light");
    };

    applyTheme(themeMode);

    const handleSchemeChange = () => {
      if (themeMode === "auto") {
        applyTheme("auto");
      }
    };

    if (!mediaQuery) {
      return undefined;
    }

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSchemeChange);
      return () => mediaQuery.removeEventListener("change", handleSchemeChange);
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleSchemeChange);
      return () => mediaQuery.removeListener(handleSchemeChange);
    }

    return undefined;
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const rtcStateToLabel = {
    idle: "Idle",
    connecting: "Connecting",
    live: "Live",
    error: "Error",
  };

  const appendAssistantMessage = useCallback((text) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), role: "assistant", text: safeText },
    ]);
  }, []);

  const appendUserMessageToChat = useCallback((text) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return null;
    const entry = { id: Date.now() + Math.random(), role: "user", text: safeText };
    setMessages((prev) => [...prev, entry]);
    return entry;
  }, []);

  const shareLinksNotConfiguredMessage =
    "Share links aren’t configured yet. Ask your admin to set EVA_SHARE_SECRET.";

  const syncDocFromChat = useCallback(
    (docTypeOverride) =>
      handleSyncCommand({
        docRouterEnabled,
        docTypeOverride,
        resolveDocType: resolveDocTypeForManualSync,
        openDocTypePicker: () => setShowDocTypeModal(true),
        manualDocTypePrompt: MANUAL_SYNC_DOC_TYPE_PROMPT,
        pushToast,
        isBusy: isCharterSyncInFlight,
        canSyncNow,
        appendAssistantMessage,
        extractAndPopulate,
        buildDocTypeConfig: (nextType) => buildDocTypeConfig(nextType, metadataMap),
        parseFallbackMessage: MANUAL_PARSE_FALLBACK_MESSAGE,
        onStart: () => {
          setIsCharterSyncing(true);
          setCharterSyncError(null);
        },
        onSuccess: () => {
          clearExtractionError();
          setCharterSyncError(null);
        },
        onParseFallback: (message) => {
          setCharterSyncError(message);
        },
        onError: (message) => {
          setCharterSyncError(message);
        },
        onComplete: () => {
          setIsCharterSyncing(false);
        },
      }),
    [
      appendAssistantMessage,
      canSyncNow,
      clearExtractionError,
      docRouterEnabled,
      extractAndPopulate,
      isCharterSyncInFlight,
      metadataMap,
      pushToast,
      resolveDocTypeForManualSync,
      setCharterSyncError,
      setIsCharterSyncing,
      setShowDocTypeModal,
    ]
  );

  const formatValidationErrorsForChat = (errors = []) => {
    if (!Array.isArray(errors) || errors.length === 0) {
      return [
        `I couldn’t validate the ${docTypeDisplayLabel} document. Please review ${requiredFieldsHeading}.`,
      ];
    }

    return errors
      .map((error) => {
        const rawPath = typeof error?.instancePath === "string" ? error.instancePath : error?.path;
        const cleanedPath = rawPath ? rawPath.replace(/^\//, "").replace(/\//g, " › ") : "";
        const message = error?.message || "needs attention.";
        return cleanedPath ? `${cleanedPath} – ${message}` : message;
      })
      .filter(Boolean);
  };

  const extractValidationErrorsFromPayload = (payload) => {
    if (!payload || typeof payload !== "object") {
      return [];
    }

    const { errors } = payload;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const message =
            typeof item.message === "string"
              ? item.message
              : typeof item.detail === "string"
              ? item.detail
              : undefined;

          if (!message) {
            return null;
          }

          const instancePath =
            typeof item.instancePath === "string"
              ? item.instancePath
              : typeof item.path === "string"
              ? item.path
              : "";

          return { instancePath, message };
        })
        .filter(Boolean);
    }

    const detailMessages = payload?.error?.details;
    if (Array.isArray(detailMessages)) {
      return detailMessages
        .map((message) =>
          typeof message === "string" && message.trim()
            ? { message: message.trim() }
            : null
        )
        .filter(Boolean);
    }

    if (typeof detailMessages === "string" && detailMessages.trim()) {
      return [{ message: detailMessages.trim() }];
    }

    return [];
  };

  const postValidationErrorsToChat = (
    errors = [],
    { heading } = {}
  ) => {
    const bulletLines = formatValidationErrorsForChat(errors);
    const intro =
      heading ||
      `I couldn’t validate the ${docTypeDisplayLabel} document. Please review the following:`;
    const message = [intro, ...bulletLines.map((line) => `- ${line}`)].join("\n");
    appendAssistantMessage(message);
  };

  const validateCharter = async (draft = charterPreview) => {
    if (!draft) {
      return {
        ok: false,
        errors: [
          { message: `No ${docTypeDisplayLabel} data available. Generate a draft before exporting.` },
        ],
      };
    }

    const docPayload = {
      docType: requestDocType,
      document: draft,
      charter: requestDocType === "charter" ? draft : undefined,
    };

    if (suggested && typeof suggested?.type === "string") {
      docPayload.docTypeDetection = {
        type: suggested.type,
        confidence:
          typeof suggested.confidence === "number"
            ? suggested.confidence
            : typeof suggestionConfidence === "number"
            ? suggestionConfidence
            : undefined,
      };
    }

    let payload;
    try {
      payload = await docApi("validate", docPayload);
    } catch (error) {
      console.error("/api/documents/validate request failed", error);
      const structuredErrors = extractValidationErrorsFromPayload(error?.payload);

      if (structuredErrors.length === 0) {
        structuredErrors.push({
          message:
            error?.payload?.error ||
            error?.payload?.message ||
            error?.message ||
            `Unable to validate the ${docTypeDisplayLabel}. Please try again.`,
        });
      }

      return {
        ok: false,
        errors: structuredErrors,
        payload: error?.payload,
        cause: error,
      };
    }

    const structuredErrors = extractValidationErrorsFromPayload(payload);

    if (structuredErrors.length === 0 && payload?.ok === false) {
      structuredErrors.push({
        message:
          payload?.error ||
          payload?.message ||
          `${docTypeDisplayLabel} validation failed. Please review ${requiredFieldsHeading}.`,
      });
    }

    if (structuredErrors.length > 0) {
      return { ok: false, errors: structuredErrors, payload };
    }

    return { ok: true, payload };
  };

  const getShareLinksHealth = async () => {
    const cachedStatus = shareLinksHealthRef.current?.status;
    if (cachedStatus === "missing") {
      return { ok: true, hasSecret: false, cached: true };
    }
    if (cachedStatus === "available") {
      return { ok: true, hasSecret: true, cached: true };
    }

    try {
      const response = await fetch("/api/charter/health", { method: "GET" });
      let payload = {};
      try {
        payload = (await response.json()) ?? {};
      } catch (parseError) {
        console.error("Failed to parse /api/charter/health response", parseError);
      }

      if (!response.ok) {
        return { ok: false, status: response.status, payload };
      }

      const hasSecret = Boolean(payload?.hasSecret);
      shareLinksHealthRef.current = {
        status: hasSecret ? "available" : "missing",
      };

      return { ok: true, hasSecret };
    } catch (error) {
      console.error("/api/charter/health request failed", error);
      return { ok: false, error };
    }
  };

  const checkShareLinksConfigured = async () => {
    const result = await getShareLinksHealth();
    if (result?.ok && result.hasSecret === false && !shareLinksWarningPostedRef.current) {
      appendAssistantMessage(shareLinksNotConfiguredMessage);
      shareLinksWarningPostedRef.current = true;
    }
    return result;
  };

  const postDocRender = async ({ document, baseName, formats = [] }) => {
    const docPayload = {
      docType: requestDocType,
      document,
      baseName,
    };
    if (Array.isArray(formats) && formats.length > 0) {
      docPayload.formats = formats;
    }
    if (requestDocType === "charter") {
      docPayload.charter = document;
    }
    if (suggested && typeof suggested?.type === "string") {
      docPayload.docTypeDetection = {
        type: suggested.type,
        confidence:
          typeof suggested.confidence === "number"
            ? suggested.confidence
            : typeof suggestionConfidence === "number"
            ? suggestionConfidence
            : undefined,
      };
    }

    try {
      const payload = await docApi("render", docPayload);
      return { ok: true, payload };
    } catch (error) {
      error.endpoint = "/api/documents/render";
      throw error;
    }
  };

  const makeShareLinksAndReply = async ({
    baseName = defaultShareBaseName,
    includeDocx = true,
    includePdf = true,
    introText,
  } = {}) => {
    const hasCharterDraft =
      charterPreview && typeof charterPreview === "object" && !Array.isArray(charterPreview);
    const normalizedDocument = hasCharterDraft ? normalizeDraft(charterPreview) : null;

    if (hasCharterDraft) {
      applyCharterDraft(normalizedDocument);
    }

    const validation = await validateCharter(normalizedDocument);
    if (!validation.ok) {
      postValidationErrorsToChat(validation.errors);
      return { ok: false, reason: "validation" };
    }

    const requestedFormats = [];
    if (includeDocx) {
      requestedFormats.push("docx");
    }
    if (includePdf) {
      requestedFormats.push("pdf");
    }

    let payload;
    try {
      const result = await postDocRender({
        document: normalizedDocument,
        baseName,
        formats: requestedFormats,
      });
      payload = result.payload;
    } catch (error) {
      const endpointLabel = error?.endpoint || "/api/documents/render";
      if (typeof error?.status === "number") {
        const validationErrors = extractValidationErrorsFromPayload(error.payload);
        if (validationErrors.length > 0) {
          postValidationErrorsToChat(validationErrors, {
            heading:
              `Export link error: I couldn’t validate the ${docTypeDisplayLabel} document. Please review the following:`,
          });
          await checkShareLinksConfigured();
          return {
            ok: false,
            reason: "validation",
            status: error.status,
            payload: error.payload,
            errors: validationErrors,
          };
        }

        const fallbackMessage =
          error?.payload?.error?.message ||
          error?.payload?.error ||
          error?.payload?.message ||
          `Unable to create ${docTypeDisplayLabel} export links right now.`;
        appendAssistantMessage(`Export link error: ${fallbackMessage}`);
        await checkShareLinksConfigured();
        return { ok: false, reason: "http", status: error.status, payload: error?.payload };
      }

      console.error(`${endpointLabel} network error`, error);
      appendAssistantMessage(
        "Export link error: Unable to create export links right now. Please try again shortly."
      );
      await checkShareLinksConfigured();
      return { ok: false, reason: "network", error };
    }

    const validationErrors = extractValidationErrorsFromPayload(payload);
    if (validationErrors.length > 0) {
      postValidationErrorsToChat(validationErrors, {
        heading:
          `Export link error: I couldn’t validate the ${docTypeDisplayLabel} document. Please review the following:`,
      });
      await checkShareLinksConfigured();
      return { ok: false, reason: "validation", payload, errors: validationErrors };
    }

    if (payload?.ok === false) {
      const fallbackMessage =
        payload?.error?.message ||
        payload?.error ||
        payload?.message ||
        `Unable to create ${docTypeDisplayLabel} export links right now.`;
      appendAssistantMessage(`Export link error: ${fallbackMessage}`);
      await checkShareLinksConfigured();
      return { ok: false, reason: "http", payload };
    }

    const responseLinks =
      payload && typeof payload === "object" && payload.links &&
      typeof payload.links === "object" && !Array.isArray(payload.links)
        ? payload.links
        : {};

    const lines = [];
    const resolvedLinks = {};

    for (const format of requestedFormats) {
      const link =
        responseLinks[format] ??
        (format === "docx"
          ? payload?.docx
          : format === "pdf"
          ? payload?.pdf
          : undefined);

      if (!link) {
        const label = format.toUpperCase();
        appendAssistantMessage(
          `Export link error: The ${label} link was missing from the response.`
        );
        return { ok: false, reason: `missing-${format}` };
      }

      lines.push(`- [Download ${format.toUpperCase()}](${link})`);
      resolvedLinks[format] = link;
    }

    if (lines.length === 0) {
      appendAssistantMessage("Export link error: No formats were requested.");
      return { ok: false, reason: "no-formats" };
    }

    const safeBaseName = baseName || defaultShareBaseName;
    const heading = introText || `Here are your export links for ${safeBaseName}:`;
    const message = `${heading}\n${lines.join("\n")}`;
    appendAssistantMessage(message);

    return { ok: true, links: resolvedLinks };
  };

  const generateBlankCharter = async ({ baseName = defaultShareBaseName } = {}) => {
    if (isGeneratingExportLinks || isExportingDocx || isExportingPdf) {
      return { ok: false, reason: "busy" };
    }

    setIsGeneratingExportLinks(true);
    try {
      const blankDocument = normalizeDraft(createBlankDraft());
      let payload;
      try {
        const result = await postDocRender({
          document: blankDocument,
          baseName,
          formats: ["docx", "pdf"],
        });
        payload = result.payload;
      } catch (error) {
        const endpointLabel = error?.endpoint || "/api/documents/render";
        if (typeof error?.status === "number") {
          const validationErrors = extractValidationErrorsFromPayload(error.payload);
          if (validationErrors.length > 0) {
            postValidationErrorsToChat(validationErrors, {
              heading:
                `Blank ${docTypeDisplayLabel} error: I couldn’t validate the ${docTypeDisplayLabel} document. Please review the following:`,
            });
            await checkShareLinksConfigured();
            return {
              ok: false,
              reason: "validation",
              status: error.status,
              payload: error.payload,
              errors: validationErrors,
            };
          }

          const fallbackMessage =
            error?.payload?.error?.message ||
            error?.payload?.error ||
            error?.payload?.message ||
            `Unable to create blank ${docTypeDisplayLabel} download links right now.`;
          appendAssistantMessage(`Blank ${docTypeDisplayLabel} error: ${fallbackMessage}`);
          await checkShareLinksConfigured();
          return { ok: false, reason: "http", status: error.status, payload: error?.payload };
        }

        console.error(`${endpointLabel} network error (blank document)`, error);
        appendAssistantMessage(
          `Blank ${docTypeDisplayLabel} error: Unable to create download links right now. Please try again shortly.`
        );
        await checkShareLinksConfigured();
        return { ok: false, reason: "network", error };
      }

      const validationErrors = extractValidationErrorsFromPayload(payload);
      if (validationErrors.length > 0) {
        postValidationErrorsToChat(validationErrors, {
          heading:
            `Blank ${docTypeDisplayLabel} error: I couldn’t validate the ${docTypeDisplayLabel} document. Please review the following:`,
        });
        await checkShareLinksConfigured();
        return { ok: false, reason: "validation", payload, errors: validationErrors };
      }

      if (payload?.ok === false) {
        const fallbackMessage =
          payload?.error?.message ||
          payload?.error ||
          payload?.message ||
          `Unable to create blank ${docTypeDisplayLabel} download links right now.`;
        appendAssistantMessage(`Blank ${docTypeDisplayLabel} error: ${fallbackMessage}`);
        await checkShareLinksConfigured();
        return { ok: false, reason: "http", payload };
      }

      const responseLinks =
        payload && typeof payload === "object" && payload.links &&
        typeof payload.links === "object" && !Array.isArray(payload.links)
          ? payload.links
          : {};

      const requiredFormats = ["docx", "pdf"];
      const lines = [];
      const resolvedLinks = {};

      for (const format of requiredFormats) {
        const link =
          responseLinks[format] ??
          (format === "docx"
            ? payload?.docx
            : format === "pdf"
            ? payload?.pdf
            : undefined);

        if (!link) {
          const label = format.toUpperCase();
          appendAssistantMessage(
            `Blank ${docTypeDisplayLabel} error: The ${label} link was missing from the response.`
          );
          await checkShareLinksConfigured();
          return { ok: false, reason: `missing-${format}` };
        }

        lines.push(`- [Download ${format.toUpperCase()}](${link})`);
        resolvedLinks[format] = link;
      }

      const safeBaseName = baseName || defaultShareBaseName;
      const message = `Here’s a blank ${docTypeDisplayLabel} for ${safeBaseName}:\n${lines.join("\n")}`;
      appendAssistantMessage(message);

      return { ok: true, links: resolvedLinks };
    } finally {
      setIsGeneratingExportLinks(false);
    }
  };

  const exportDocxViaChat = async (baseName = defaultShareBaseName) => {
    if (isExportingDocx || isGeneratingExportLinks || isExportingPdf) {
      return { ok: false, reason: "busy" };
    }

    setIsExportingDocx(true);
    try {
      return await makeShareLinksAndReply({
        baseName,
        includeDocx: true,
        includePdf: false,
        introText: `Here’s your DOCX download for ${baseName}:`,
      });
    } finally {
      setIsExportingDocx(false);
    }
  };

  const exportPdfViaChat = async (baseName = defaultShareBaseName) => {
    if (isExportingPdf || isGeneratingExportLinks || isExportingDocx) {
      return { ok: false, reason: "busy" };
    }

    setIsExportingPdf(true);
    try {
      return await makeShareLinksAndReply({
        baseName,
        includeDocx: false,
        includePdf: true,
        introText: `Here’s your PDF download for ${baseName}:`,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const shareLinksViaChat = async (baseName = defaultShareBaseName) => {
    if (isGeneratingExportLinks || isExportingDocx || isExportingPdf) {
      return { ok: false, reason: "busy" };
    }

    setIsGeneratingExportLinks(true);
    try {
      return await makeShareLinksAndReply({
        baseName,
        includeDocx: true,
        includePdf: true,
      });
    } finally {
      setIsGeneratingExportLinks(false);
    }
  };

  const cleanupRealtime = () => {
    if (dataRef.current) {
      try {
        dataRef.current.close();
      } catch (error) {
        console.error("Error closing realtime data channel", error);
      }
      dataRef.current.onmessage = null;
      dataRef.current.onclose = null;
      dataRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch (error) {
        console.error("Error closing realtime peer connection", error);
      }
      pcRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {
          console.error("Error stopping realtime media track", error);
        }
      });
      micStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const stopRealtime = () => {
    cleanupRealtime();
    setRtcState("idle");
  };

  const startRealtime = async () => {
    if (!realtimeEnabled) return;
    if (rtcState === "connecting" || rtcState === "live") return;
    setRtcState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected") {
          console.error("Realtime connection ended", state);
          cleanupRealtime();
          setRtcState("error");
        }
      };

      const dataChannel = pc.createDataChannel("oai-events");
      dataRef.current = dataChannel;

      dataChannel.onmessage = async (event) => {
        const payload = event?.data;
        let transcript = "";
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload);
            if (typeof parsed === "string") {
              transcript = parsed;
            } else if (parsed?.transcript) {
              transcript = parsed.transcript;
            } else if (parsed?.text) {
              transcript = parsed.text;
            } else if (Array.isArray(parsed?.alternatives) && parsed.alternatives[0]?.transcript) {
              transcript = parsed.alternatives[0].transcript;
            }
          } catch (error) {
            transcript = payload;
          }
        }
        if (!transcript && payload?.text) {
          transcript = payload.text;
        }
        if (transcript) {
          const trimmedTranscript = transcript.trim();
          if (!trimmedTranscript) return;
          setVoiceTranscripts((prev) => {
            const entry = {
              id: Date.now() + Math.random(),
              text: trimmedTranscript,
              timestamp: Date.now(),
            };
            const next = [...prev, entry];
            return next.slice(-20);
          });
          const handled = await handleCommandFromText(trimmedTranscript);
          if (!handled) {
            appendUserMessageToChat(trimmedTranscript);
          }
        }
      };

      dataChannel.onclose = () => {
        dataRef.current = null;
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch("/api/voice/sdp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
      });

      if (!response.ok) {
        throw new Error(`SDP exchange failed with status ${response.status}`);
      }

      const answerSdp = await response.text();
      if (!answerSdp?.trim()) {
        throw new Error("Invalid SDP answer payload");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setRtcState("live");
    } catch (error) {
      console.error("Realtime start failed", error);
      cleanupRealtime();
      setRtcState("error");
    }
  };

  useEffect(() => {
    return () => {
      if (pcRef.current || micStreamRef.current || dataRef.current) {
        stopRealtime();
      }
    };
  }, []);

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result.split(",")[1] || "");
        } else {
          reject(new Error("Unexpected FileReader result"));
        }
      };
      reader.onerror = () => reject(reader.error || new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

  const startRecording = async () => {
    if (rec) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported
          ? MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : ""
          : "";
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          setIsTranscribing(true);
          const blob = new Blob(chunks, { type: recorder.mimeType || preferredMime || "audio/webm" });
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64, mimeType: (blob.type || "").split(";")[0] }),
          });
          const data = await res.json().catch(() => ({}));
          const transcript = data?.transcript ?? data?.text ?? "";
          const trimmedTranscript = typeof transcript === "string" ? transcript.trim() : "";
          if (trimmedTranscript) {
            const handled = await handleCommandFromText(trimmedTranscript);
            if (!handled) {
              setInput((prev) => (prev ? `${prev} ${trimmedTranscript}` : trimmedTranscript));
            }
          }
        } catch (error) {
          console.error("Transcription failed", error);
        } finally {
          setIsTranscribing(false);
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }
          setRec(null);
          setListening(false);
        }
      };

      recorder.start();
      setRec(recorder);
      setListening(true);
    } catch (error) {
      console.error("Microphone access denied", error);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setRec(null);
      setListening(false);
    }
  };

  const stopRecording = () => {
    if (!rec) return;
    try {
      rec.stop();
      rec.stream?.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Error stopping recorder", error);
    } finally {
      setRec(null);
      setListening(false);
    }
  };

  const resolveDocTypeForManualSync = useCallback(
    () =>
      resolveManualSyncDocType({
        snapshot: getDocTypeSnapshot(),
        confirmThreshold: 0.7,
      }),
    []
  );

  const handleCommandFromText = async (
    rawText,
    { userMessageAppended = false, baseName = defaultShareBaseName } = {}
  ) => {
    const trimmed = typeof rawText === "string" ? rawText.trim() : "";
    if (!trimmed) return false;

    const normalized = trimmed.toLowerCase();
    const ensureUserLogged = () => {
      if (!userMessageAppended) {
        appendUserMessageToChat(trimmed);
      }
    };

    if (normalized.startsWith("/type")) {
      ensureUserLogged();
      handleTypeCommand({
        command: trimmed,
        metadataMap,
        supportedDocTypes,
        setDocType,
        setSuggested,
        closeDocTypeModal: () => setShowDocTypeModal(false),
        pushToast,
      });
      return true;
    }

    const wantsManualSync =
      normalized.startsWith("/sync") ||
      normalized.startsWith("/charter") ||
      normalized.includes("commit charter") ||
      normalized.includes("commit the charter") ||
      normalized.includes("update charter") ||
      normalized.includes("update the charter") ||
      normalized.includes("sync charter") ||
      normalized.includes("sync the charter");

    if (wantsManualSync) {
      ensureUserLogged();
      await syncDocFromChat();
      return true;
    }

    const mentionsDocx = normalized.includes("docx") || normalized.includes("word");
    const mentionsPdf = normalized.includes("pdf");
    const mentionsBlankCharter =
      normalized.includes("blank project charter") ||
      (normalized.includes("blank") && normalized.includes("charter")) ||
      normalized.includes("blank charter");
    const mentionsDownload =
      normalized.includes("download") ||
      normalized.includes("export") ||
      normalized.includes("send") ||
      normalized.includes("get");
    const mentionsShare =
      normalized.includes("share link") ||
      normalized.includes("share the link") ||
      normalized.includes("share links") ||
      (normalized.includes("links") && (normalized.includes("share") || normalized.includes("send")));

    const wantsBothFormats = mentionsDocx && mentionsPdf;
    const wantsDocx = mentionsDocx && (mentionsDownload || normalized.includes("docx link"));
    const wantsPdf = mentionsPdf && (mentionsDownload || normalized.includes("pdf link"));
    const wantsShareLinks = mentionsShare || (mentionsDownload && normalized.includes("links"));

    if (wantsBothFormats || wantsShareLinks) {
      ensureUserLogged();
      const result = await shareLinksViaChat(baseName);
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already preparing shareable links. I’ll post them here as soon as they’re ready."
        );
      }
      return true;
    }

    if (mentionsBlankCharter) {
      ensureUserLogged();
      const result = await generateBlankCharter({ baseName });
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already preparing shareable links. I’ll post them here as soon as they’re ready."
        );
      }
      return true;
    }

    if (wantsDocx) {
      ensureUserLogged();
      const result = await exportDocxViaChat(baseName);
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already working on DOCX links. I’ll share them here shortly."
        );
      }
      return true;
    }

    if (wantsPdf) {
      ensureUserLogged();
      const result = await exportPdfViaChat(baseName);
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already working on PDF links. I’ll share them here shortly."
        );
      }
      return true;
    }

    return false;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (isAssistantThinking) return;
    const userMsg = { id: Date.now() + Math.random(), role: "user", text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    const handled = await handleCommandFromText(text, { userMessageAppended: true });
    if (handled) {
      return;
    }
    let reply = "";
    setIsAssistantThinking(true);
    try {
      reply = await callLLM(text, nextHistory, attachments);
    } catch (e) {
      reply = "LLM error (demo): " + (e?.message || "unknown");
    } finally {
      setIsAssistantThinking(false);
    }
    appendAssistantMessage(reply || "");
  };

  const handleSyncNow = useCallback(async () => {
    const result = await onFileAttached({
      attachments,
      messages,
      voice: voiceTranscripts,
      extractAndPopulate: async (overrides = {}) => {
        const manualDocType =
          overrides?.docType || resolveDocTypeForManualSync();
        if (!manualDocType) {
          if (docRouterEnabled) {
            setShowDocTypeModal(true);
          }
          pushToast({ tone: "warning", message: MANUAL_SYNC_DOC_TYPE_PROMPT });
          return { ok: false, reason: "docTypeRequired" };
        }
        return syncDocFromChat(manualDocType);
      },
      requireConfirmation: () => {
        if (docRouterEnabled) {
          setShowDocTypeModal(true);
        }
        pushToast({ tone: "warning", message: MANUAL_SYNC_DOC_TYPE_PROMPT });
      },
    });

    if (!result) {
      const manualDocType = resolveDocTypeForManualSync();
      if (!manualDocType) {
        return { ok: false, reason: "docTypeRequired" };
      }
      return syncDocFromChat(manualDocType);
    }

    return result;
  }, [
    attachments,
    docRouterEnabled,
    messages,
    pushToast,
    resolveDocTypeForManualSync,
    setShowDocTypeModal,
    syncDocFromChat,
    voiceTranscripts,
  ]);

  const processPickedFiles = useCallback(
    async (list) => {
      if (!list || !list.length) return;
      setIsUploadingAttachments(true);
      try {
        const pickedFiles = Array.from(list);
        const baseTimestamp = Date.now();
        const newFiles = pickedFiles.map((f, index) => ({
          id: `${baseTimestamp}-${index}`,
          name: f.name,
          size: prettyBytes(f.size),
          file: f,
        }));

        setFiles((prev) => [...prev, ...newFiles]);

        const processedAttachments = [];

        for (const file of pickedFiles) {
          try {
            const base64 = await fileToBase64(file);
            const response = await fetch("/api/files/text", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: file.name,
                mimeType: file.type,
                base64,
              }),
            });

            let payload = {};
            try {
              payload = await response.json();
            } catch (err) {
              console.error("Failed to parse /api/files/text response", err);
            }

            if (!response.ok || payload?.ok === false) {
              const message = payload?.error || `Unable to process ${file.name}`;
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  role: "assistant",
                  text: `Attachment error (${file.name}): ${message}`,
                },
              ]);
              continue;
            }

            processedAttachments.push({
              name: payload?.name || file.name,
              mimeType: payload?.mimeType || file.type,
              text: payload?.text || "",
            });
          } catch (error) {
            const message = error?.message || "Unknown error";
            console.error("processPickedFiles error", error);
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + Math.random(),
                role: "assistant",
                text: `Attachment error (${file.name}): ${message}`,
              },
            ]);
          }
        }

        if (processedAttachments.length) {
          let updatedAttachments = [];
          setAttachments((prev) => {
            updatedAttachments = [...prev, ...processedAttachments];
            return updatedAttachments;
          });
          setExtractionSeed(Date.now());

          try {
            await onFileAttached({
              attachments: updatedAttachments,
              messages,
              voice: voiceTranscripts,
              extractAndPopulate: (overrides = {}) =>
                extractAndPopulate({
                  attachments: updatedAttachments,
                  messages,
                  voice: voiceTranscripts,
                  ...overrides,
                }),
              requireConfirmation: () => setShowDocTypeModal(true),
            });
          } catch (error) {
            console.error("onFileAttached failed", error);
          }
        }
      } finally {
        setIsUploadingAttachments(false);
      }
    },
    [
      extractAndPopulate,
      messages,
      setAttachments,
      setFiles,
      setIsUploadingAttachments,
      setMessages,
      setShowDocTypeModal,
      voiceTranscripts,
    ]
  );
  const handleDocTypeConfirm = useCallback(
    async (nextValue) => {
      const normalized = supportedDocTypes.has(nextValue)
        ? nextValue
        : defaultDocType;
      setDocType(normalized);
      setSuggested(
        normalizeDocTypeSuggestion({ type: normalized, confidence: 1 })
      );
      setShowDocTypeModal(false);
      try {
        await extractAndPopulate({
          docType: normalized,
          attachments,
          messages,
          voice: voiceTranscripts,
        });
      } catch (error) {
        console.error("extractAndPopulate after confirm failed", error);
      }
    },
    [
      attachments,
      defaultDocType,
      extractAndPopulate,
      messages,
      setDocType,
      setShowDocTypeModal,
      setSuggested,
      supportedDocTypes,
      voiceTranscripts,
    ]
  );
  const handleDocTypeCancel = useCallback(() => {
    setShowDocTypeModal(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFilePick = async (e) => {
    const fileList = e.target?.files ? Array.from(e.target.files) : [];
    if (e.target) e.target.value = "";
    if (fileList.length) {
      await processPickedFiles(fileList);
    }
  };

  const handleRemoveFile = (id) => {
    const removedFile = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (!removedFile) return;

    let nextAttachments = null;
    setAttachments((prev) => {
      const index = prev.findIndex((att) => att.name === removedFile.name);
      if (index === -1) return prev;
      const updated = [...prev.slice(0, index), ...prev.slice(index + 1)];
      nextAttachments = updated;
      return updated;
    });

    if (nextAttachments) {
      if (!nextAttachments.length) {
        applyCharterDraft(createBlankDraft(), { resetLocks: true });
        clearExtractionError();
        setCharterSyncError(null);
      }
      setExtractionSeed(Date.now());
    }
  };

  const composerStatus = useMemo(() => {
    if (isUploadingAttachments) {
      return "Processing attachments…";
    }
    if (isTranscribing) {
      return "Transcribing…";
    }
    if (listening) {
      return "Recording…";
    }
    if (isAssistantThinking) {
      return "Assistant is responding…";
    }
    if (isCharterSyncInFlight) {
      return `Syncing ${docPreviewLabel}…`;
    }
    return "Idle";
  }, [
    isAssistantThinking,
    isCharterSyncInFlight,
    isTranscribing,
    isUploadingAttachments,
    listening,
  ]);

  const handleComposerDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedFiles = event.dataTransfer?.files
      ? Array.from(event.dataTransfer.files)
      : [];
    if (droppedFiles.length) {
      await processPickedFiles(droppedFiles);
    }
  };

  const handleComposerDragOver = (event) => {
    event.preventDefault();
  };

  return (
    <div className="min-h-screen w-full font-sans bg-gradient-to-br from-indigo-100 via-slate-100 to-sky-100 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/60 border-b border-white/40 dark:supports-[backdrop-filter]:bg-slate-900/60 dark:bg-slate-900/60 dark:border-slate-700/60">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-600/90 text-white grid place-items-center font-bold shadow-sm">EX</div>
            <div className="text-slate-700 font-semibold dark:text-slate-200">Exact Sciences Virtual Assistant for Project Management</div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSelect mode={themeMode} resolvedMode={resolvedTheme} onChange={handleThemeModeChange} />
            <button className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400">New Draft</button>
            <div className="px-3 py-1.5 rounded-xl bg-white/70 border border-white/50 text-sm shadow-sm dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100">Guest</div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="mx-auto max-w-7xl px-3 sm:px-4 py-4 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          {/* Center Chat */}
          <section className="lg:col-span-8">
            <Panel
              title="Chat Assistant"
              right={
                <button className="p-1.5 rounded-lg hover:bg-white/60 border border-white/50 dark:hover:bg-slate-700/60 dark:border-slate-600/60 dark:text-slate-200">
                  <IconPlus className="h-4 w-4" />
                </button>
              }
            >
              <div className="flex flex-col h-[480px] rounded-2xl border border-white/50 bg-white/60 backdrop-blur overflow-hidden dark:border-slate-700/60 dark:bg-slate-900/40">
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {visibleMessages.map((m) => (
                    <ChatBubble
                      key={m.id}
                      role={m.role}
                      text={m.text}
                      hideEmptySections={hideEmptySections}
                    />
                  ))}
                </div>
                {isAssistantThinking && (
                  <div className="px-4 pb-2">
                    <AssistantThinkingIndicator />
                  </div>
                )}
                <div className="border-t border-white/50 p-3 dark:border-slate-700/60">
                  <input type="file" multiple ref={fileInputRef} onChange={handleFilePick} className="hidden" />
                  <Composer
                    draft={input}
                    onDraftChange={setInput}
                    onSend={handleSend}
                    onUploadClick={() => fileInputRef.current?.click()}
                    onStartRecording={!realtimeEnabled ? startRecording : undefined}
                    onStopRecording={!realtimeEnabled ? stopRecording : undefined}
                    recording={listening}
                    statusText={composerStatus}
                    onSyncNow={handleSyncNow}
                    canSync={canSyncNow}
                    syncDisabled={isCharterSyncInFlight}
                    syncLabel={isCharterSyncInFlight ? "Syncing…" : undefined}
                    sendDisabled={isAssistantThinking}
                    uploadDisabled={isUploadingAttachments}
                    realtimeEnabled={realtimeEnabled}
                    rtcState={rtcState}
                    startRealtime={startRealtime}
                    stopRealtime={stopRealtime}
                    rtcStatusLabel={rtcStateToLabel[rtcState] || "Idle"}
                    rtcReset={stopRealtime}
                    placeholder="Type here… (paste scope or attach files)"
                    onDrop={handleComposerDrop}
                    onDragOver={handleComposerDragOver}
                    IconUpload={IconUpload}
                    IconMic={IconMic}
                    IconSend={IconSend}
                  >
                    {realtimeEnabled ? (
                      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                    ) : null}
                  </Composer>
                  {!realtimeEnabled && listening ? (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">Recording… (simulated)</div>
                  ) : null}
                  {files.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {files.map((f) => (
                        <span
                          key={f.id}
                          className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/80 px-2 py-1 text-xs dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100"
                        >
                          <IconPaperclip className="h-3 w-3" />
                          <span className="max-w-[160px] truncate">{f.name}</span>
                          <button
                            onClick={() => handleRemoveFile(f.id)}
                            className="ml-1 text-slate-500 transition hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </section>

          {/* Right Preview */}
          <aside className="lg:col-span-4">
            <Panel
              title="Document preview"
              right={
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-200">
                    <span>{docTypeBadgeLabel}</span>
                    {docTypeConfidencePercent != null ? (
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {docTypeConfidencePercent}% confidence
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDocTypeModal(true)}
                    className="rounded-xl border border-white/60 bg-white/70 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-white/80 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Change
                  </button>
                </div>
              }
            >
              <div
                className="rounded-2xl bg-white/70 border border-white/60 p-4 dark:bg-slate-900/40 dark:border-slate-700/60"
                data-doc-type={templateDocType || undefined}
                data-doc-schema={activeSchemaId || undefined}
                data-template-version={activeTemplateVersion || undefined}
                data-has-manifest-metadata={
                  activeManifestMetadata ? "true" : undefined
                }
              >
                {!hasPreviewDocType ? (
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <p className="font-medium text-slate-700 dark:text-slate-100">
                      Choose a document template to get started.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      The preview will appear once you pick a document type.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDocTypeModal(true)}
                      className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus-visible:ring-offset-slate-900"
                    >
                      Choose document type
                    </button>
                  </div>
                ) : templateLoading ? (
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <p className="font-medium">Loading {docTypeDisplayLabel} template…</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Hang tight while we fetch the schema and layout.
                    </p>
                  </div>
                ) : templateError ? (
                  <div className="space-y-2 text-sm text-red-600 dark:text-red-300">
                    <p className="font-medium">Unable to load template metadata.</p>
                    <p className="text-xs text-red-500 dark:text-red-400">
                      Retry selecting the document type or refresh the page.
                    </p>
                  </div>
                ) : (
                  <PreviewEditable
                    draft={charterPreview}
                    locks={locks}
                    fieldStates={fieldStates}
                    isLoading={isCharterSyncInFlight}
                    onDraftChange={handleDraftChange}
                    onLockField={handleLockField}
                    manifest={activeDocManifest}
                    schema={activeDocSchema}
                  />
                )}
              </div>
              {isCharterSyncInFlight && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Updating {docPreviewLabel}…</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={!canSyncNow || isCharterSyncInFlight || isAssistantThinking}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !canSyncNow || isCharterSyncInFlight || isAssistantThinking
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
                  }`}
                  title="Commit the latest chat context to the preview"
                >
                  {isCharterSyncInFlight ? "Committing…" : "Commit to Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => exportDocxViaChat(defaultShareBaseName)}
                  disabled={
                    !draftHasContent ||
                    isCharterSyncInFlight ||
                    isExportingDocx ||
                    isGeneratingExportLinks ||
                    isExportingPdf
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !draftHasContent ||
                    isCharterSyncInFlight ||
                    isExportingDocx ||
                    isGeneratingExportLinks ||
                    isExportingPdf
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  }`}
                >
                  {isExportingDocx ? "Preparing DOCX…" : "Export DOCX"}
                </button>
                <button
                  type="button"
                  onClick={() => shareLinksViaChat(defaultShareBaseName)}
                  disabled={
                    !draftHasContent ||
                    isCharterSyncInFlight ||
                    isGeneratingExportLinks ||
                    isExportingDocx ||
                    isExportingPdf
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !draftHasContent ||
                    isCharterSyncInFlight ||
                    isGeneratingExportLinks ||
                    isExportingDocx ||
                    isExportingPdf
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  }`}
                >
                  {isGeneratingExportLinks ? "Creating Links…" : "Make Share Links"}
                </button>
                <button
                  type="button"
                  onClick={() => exportPdfViaChat(defaultShareBaseName)}
                  disabled={
                    !draftHasContent ||
                    isCharterSyncInFlight ||
                    isExportingPdf ||
                    isGeneratingExportLinks ||
                    isExportingDocx
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !draftHasContent ||
                    isCharterSyncInFlight ||
                    isExportingPdf ||
                    isGeneratingExportLinks ||
                    isExportingDocx
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                  }`}
                >
                  {isExportingPdf ? "Preparing PDF…" : "Export PDF"}
                </button>
              </div>
              {activeCharterError && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                  {activeCharterError}
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-4 dark:bg-slate-900/40 dark:border-slate-700/60">
                <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">{requiredFieldsHeading}</div>
                {docTypeConfig.type === "charter" ? (
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    <li className="flex items-center gap-2"><span className="text-emerald-600 dark:text-emerald-400"><IconCheck className="h-4 w-4" /></span> Sponsor</li>
                    <li className="flex items-center gap-2"><span className="text-emerald-600 dark:text-emerald-400"><IconCheck className="h-4 w-4" /></span> Problem Statement</li>
                    <li className="flex items-center gap-2"><span className="text-amber-600 dark:text-amber-300"><IconAlert className="h-4 w-4" /></span> Milestones</li>
                  </ul>
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    Required field guidance isn’t available for this document type yet.
                  </p>
                )}
              </div>
            </Panel>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">Phase 1 • Minimal viable UI • No data is saved</footer>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <DocTypeModal
        open={docRouterEnabled && showDocTypeModal}
        onConfirm={handleDocTypeConfirm}
        onCancel={handleDocTypeCancel}
      />
    </div>
  );
}

function ThemeSelect({ mode, resolvedMode, onChange }) {
  const autoLabel = resolvedMode === "dark" ? "Auto (Dark)" : "Auto (Light)";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/70 border border-white/50 text-xs shadow-sm dark:bg-slate-800/70 dark:border-slate-600/60">
      <span className="font-medium text-slate-600 dark:text-slate-200">Theme</span>
      <select
        value={mode}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-100"
        aria-label="Theme mode"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="auto">{autoLabel}</option>
      </select>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!Array.isArray(toasts) || toasts.length === 0) {
    return null;
  }

  const toneStyles = {
    info: "border-slate-200 bg-white/90 text-slate-700 dark:border-slate-600/60 dark:bg-slate-800/80 dark:text-slate-100",
    warning: "border-amber-200 bg-amber-100/90 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/80 dark:text-amber-100",
    error: "border-red-200 bg-red-100/90 text-red-900 dark:border-red-700/60 dark:bg-red-900/80 dark:text-red-100",
    success: "border-emerald-200 bg-emerald-100/90 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-900/80 dark:text-emerald-100",
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 px-4 sm:right-4 sm:px-0">
      {toasts.map((toast) => {
        const key = toast?.tone && toneStyles[toast.tone] ? toast.tone : "info";
        const toneClass = toneStyles[key];
        const message = typeof toast?.message === "string" ? toast.message : "";
        if (!message) return null;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur ${toneClass}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 whitespace-pre-line leading-snug">{message}</div>
              <button
                type="button"
                onClick={() => onDismiss?.(toast.id)}
                className="text-lg leading-none text-slate-500 transition hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, icon, right, children }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/50 backdrop-blur shadow-sm p-3 md:p-4 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-slate-700 font-semibold dark:text-slate-200">
          {icon && <span className="text-slate-500 dark:text-slate-400">{icon}</span>}
          <span>{title}</span>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function AssistantThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-slate-600 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70 dark:text-slate-200">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400/80 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
        </span>
        <span className="font-medium">Assistant is thinking…</span>
      </div>
    </div>
  );
}

function ChatBubble({ role, text, hideEmptySections }) {
  const isUser = role === "user";
  const safeText = typeof text === "string" ? text : text != null ? String(text) : "";
  const sections = useAssistantFeedbackSections(!isUser ? safeText : null);
  const { structuredSections, hasStructuredContent } = useMemo(() => {
    if (!Array.isArray(sections)) {
      return { structuredSections: [], hasStructuredContent: false };
    }

    let containsStructuredContent = false;

    const filteredSections = sections.filter((section) => {
      if (!section) {
        return false;
      }

      const hasHeading = typeof section.heading === "string" && section.heading.trim().length > 0;
      const hasItems = Array.isArray(section.items) && section.items.length > 0;
      const hasParagraphs = Array.isArray(section.paragraphs) && section.paragraphs.length > 0;

      if (hasHeading || hasItems) {
        containsStructuredContent = true;
      }

      return hasHeading || hasItems || hasParagraphs;
    });

    return { structuredSections: filteredSections, hasStructuredContent: containsStructuredContent };
  }, [sections]);
  const showStructured =
    !isUser &&
    Array.isArray(sections) &&
    (hasStructuredContent || hideEmptySections === false);
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-6 shadow-sm border ${
          isUser
            ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-500 dark:border-indigo-400'
            : 'bg-white/70 border-white/60 text-slate-800 dark:bg-slate-800/70 dark:border-slate-700/60 dark:text-slate-100'
        }`}
      >
        {isUser || !showStructured ? (
          <span className="whitespace-pre-wrap">{safeText}</span>
        ) : (
          <AssistantFeedbackTemplate sections={structuredSections} />
        )}
      </div>
    </div>
  );
}

// --- LLM wiring (placeholder) ---
async function callLLM(text, history = [], contextAttachments = []) {
  try {
    const normalizedHistory = Array.isArray(history)
      ? history.map((item) => ({ role: item.role, content: item.text || "" }))
      : [];
    const preparedAttachments = Array.isArray(contextAttachments)
      ? contextAttachments
          .map((attachment) => ({ name: attachment?.name, text: attachment?.text }))
          .filter((attachment) => attachment.name && attachment.text)
      : [];
    const systemMessage = {
      role: "system",
      content:
        "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff. Never recommend external blank-charter websites."
    };
    const payload = {
      messages: [systemMessage, ...normalizedHistory.slice(-19)],
      attachments: preparedAttachments,
    };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.reply || "";
  } catch (e) {
    return "OpenAI endpoint error: " + (e?.message || "unknown");
  }
}
