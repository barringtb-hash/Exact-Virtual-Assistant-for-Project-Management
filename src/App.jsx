import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssistantFeedbackTemplate, {
  useAssistantFeedbackSections,
} from "./components/AssistantFeedbackTemplate";
import Composer from "./components/Composer";
import PreviewEditable from "./components/PreviewEditable";
import DocTypeModal from "./components/DocTypeModal";
import getBlankDoc from "./utils/getBlankDoc.js";
import normalizeCharter from "../lib/charter/normalize.js";
import useBackgroundExtraction, { onFileAttached } from "./hooks/useBackgroundExtraction";
import { useSpeechInput } from "./hooks/useSpeechInput.ts";
import mergeIntoDraftWithLocks from "./lib/preview/mergeIntoDraftWithLocks.js";
import {
  handleSyncCommand,
  handleTypeCommand,
  resolveManualSyncDocType,
} from "./utils/chatDocTypeCommands.js";
import { isDocTypeConfirmed, normalizeDocTypeSuggestion } from "./utils/docTypeRouter";
import { getDocTypeSnapshot, useDocType } from "./state/docType.js";
import { useDocTemplate } from "./state/docTemplateStore.js";
import { detectCharterIntent } from "./utils/detectCharterIntent.js";
import { mergeStoredSession, readStoredSession } from "./utils/storage.js";
import { docApi } from "./lib/docApi.js";
import {
  isIntentOnlyExtractionEnabled,
} from "../config/featureFlags.js";
import { FLAGS } from "./config/flags.ts";
import { useDocSession } from "./state/docSession";
import {
  useDraftStore as useLegacyDraftStore,
  recordDraftMetadata,
  lockDraftPaths,
  resetDraftLocks,
  clearDraftHighlights,
} from "./state/draftStore.js";
import {
  chatActions,
  chatStoreApi,
  useChatMessages,
  useComposerDraft,
  useIsAssistantThinking,
  useIsStreaming,
  useIsSyncingPreview,
  useInputLocked,
} from "./state/chatStore.ts";
import { draftActions, draftStoreApi, useDraftStatus } from "./state/draftStore.ts";
import { useTranscript, useVoiceStatus, voiceActions } from "./state/voiceStore.ts";
import {
  pathToPointer,
  pointerMapToPathMap,
  pointerMapToPathObject,
  pointerSetToPathSet,
} from "./utils/jsonPointer.js";
import CharterFieldSession from "./chat/CharterFieldSession.tsx";
import { conversationActions, useConversationState } from "./state/conversationStore.ts";
import { createGuidedOrchestrator } from "./features/charter/guidedOrchestrator.ts";
import { createInitialGuidedState } from "./features/charter/guidedState.ts";
import { SYSTEM_PROMPT as CHARTER_GUIDED_SYSTEM_PROMPT } from "./features/charter/prompts.ts";
import { guidedStateToCharterDTO } from "./features/charter/persist.ts";
import { runVoiceFieldExtraction } from "./features/charter/voiceFieldController.ts";
import { usePreviewSyncService } from "./preview/PreviewSyncService.ts";
import SyncDevtools, { installSyncTelemetry } from "./devtools/SyncDevtools.jsx";
import { dispatch } from "./sync/syncStore.js";
import { isVoiceE2EModeActive } from "./utils/e2eMode.js";
import {
  CharterClientError,
  postCharterMessage,
  startCharterSession,
  subscribeToCharterStream,
} from "./lib/assistantClient.ts";
import { GUIDED_BACKEND_ON, SAFE_MODE } from "./lib/env.ts";

const SHOULD_INSTALL_SYNC_TELEMETRY =
  import.meta.env.DEV || (typeof window !== "undefined" && window.Cypress);

if (SHOULD_INSTALL_SYNC_TELEMETRY) {
  installSyncTelemetry();
}

const THEME_STORAGE_KEY = "eva-theme-mode";
const MANUAL_PARSE_FALLBACK_MESSAGE = "I couldn’t parse the last turn—keeping your entries.";
const MANUAL_SYNC_DOC_TYPE_PROMPT =
  "Confirm a document template so I know what to sync. Pick one in the modal or run `/type <id>`.";

const normalizeCharterDraft = (draft) => normalizeCharter(draft);

const DEFAULT_DOC_TYPE = "charter";
const GENERIC_DOC_NORMALIZER = (draft) =>
  draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};

const INTENT_ONLY_EXTRACTION_ENABLED = isIntentOnlyExtractionEnabled();
const CHARTER_GUIDED_CHAT_ENABLED = FLAGS.CHARTER_GUIDED_CHAT_ENABLED;
const CHARTER_WIZARD_VISIBLE = FLAGS.CHARTER_WIZARD_VISIBLE;
const AUTO_EXTRACTION_ENABLED = FLAGS.AUTO_EXTRACTION_ENABLED;
const CHARTER_GUIDED_BACKEND_ENABLED = FLAGS.CHARTER_GUIDED_BACKEND_ENABLED;
const CHARTER_DOC_API_BASES = CHARTER_GUIDED_BACKEND_ENABLED
  ? ["/api/charter", "/api/documents", "/api/doc"]
  : null;
const SHOULD_SHOW_CHARTER_WIZARD = CHARTER_GUIDED_CHAT_ENABLED && CHARTER_WIZARD_VISIBLE;
const GUIDED_CHAT_WITHOUT_WIZARD = CHARTER_GUIDED_CHAT_ENABLED && !CHARTER_WIZARD_VISIBLE;
const REMOTE_GUIDED_BACKEND_ENABLED =
  (CHARTER_GUIDED_BACKEND_ENABLED || GUIDED_BACKEND_ON) && !SAFE_MODE;
const E2E_FLAG_SAFE_MODE = SAFE_MODE;
const E2E_FLAG_GUIDED_BACKEND = Boolean(CHARTER_GUIDED_BACKEND_ENABLED || GUIDED_BACKEND_ON);
// Reduced from 500ms to 50ms for real-time sync (<500ms total latency target)
const CHAT_EXTRACTION_DEBOUNCE_MS = 50;

function sendTelemetryEvent(eventName, { conversationId = null, metadata = {} } = {}) {
  if (typeof fetch !== "function") {
    return Promise.resolve();
  }

  const payload = {
    event: eventName,
    timestamp: Date.now(),
    conversation_id: conversationId ?? null,
    metadata,
  };

  try {
    return fetch("/api/telemetry/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (error) {
    return Promise.resolve();
  }
}

function summarizeGuidedSlots(state) {
  if (!state || !state.fields || typeof state.fields !== "object") {
    return {
      totalSlots: 0,
      confirmedSlots: 0,
      capturedSlots: 0,
      skippedSlots: 0,
      rejectedSlots: 0,
      pendingSlots: 0,
    };
  }

  let totalSlots = 0;
  let confirmedSlots = 0;
  let capturedSlots = 0;
  let skippedSlots = 0;
  let rejectedSlots = 0;
  let pendingSlots = 0;

  for (const fieldState of Object.values(state.fields)) {
    if (!fieldState || typeof fieldState !== "object") {
      continue;
    }

    totalSlots += 1;
    switch (fieldState.status) {
      case "confirmed":
        confirmedSlots += 1;
        break;
      case "captured":
        capturedSlots += 1;
        break;
      case "skipped":
        skippedSlots += 1;
        break;
      case "rejected":
        rejectedSlots += 1;
        break;
      default:
        pendingSlots += 1;
        break;
    }
  }

  return {
    totalSlots,
    confirmedSlots,
    capturedSlots,
    skippedSlots,
    rejectedSlots,
    pendingSlots,
  };
}

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
  { touchedPaths = new Set(), source, timestamp, locks = {}, pending } = {}
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
    const nextPending = isTouched
      ? typeof pending === "boolean"
        ? pending
        : false
      : typeof prevEntry?.pending === "boolean"
      ? prevEntry.pending
      : false;

    nextStates[path] = {
      value,
      locked,
      source: nextSource,
      updatedAt: nextUpdatedAt,
      pending: nextPending,
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

function normalizeForComparison(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForComparison(entry));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, normalizeForComparison(entryValue)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return entries.reduce((acc, [key, entryValue]) => {
      acc[key] = entryValue;
      return acc;
    }, {});
  }

  if (value === undefined) {
    return null;
  }

  return value;
}

function valuesEqual(a, b) {
  return JSON.stringify(normalizeForComparison(a)) === JSON.stringify(normalizeForComparison(b));
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

function cloneGuidedStateShallow(state) {
  if (!state) {
    return createInitialGuidedState();
  }

  const fields = {};
  if (state.fields && typeof state.fields === "object") {
    for (const [id, value] of Object.entries(state.fields)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      fields[id] = {
        ...value,
        issues: Array.isArray(value.issues) ? value.issues.slice() : [],
      };
    }
  }

  return {
    ...state,
    order: Array.isArray(state.order) ? state.order.slice() : [],
    fields,
    waiting: state.waiting
      ? { ...state.waiting }
      : { assistant: false, user: false, validation: false },
  };
}

function ensureFieldDefinition(fieldId, existingDefinition, descriptor) {
  if (existingDefinition) {
    return existingDefinition;
  }

  if (descriptor && typeof descriptor === "object") {
    return {
      id: descriptor.slot_id ?? descriptor.id ?? fieldId,
      label: descriptor.label ?? fieldId,
      question: descriptor.question ?? null,
      helpText: descriptor.help_text ?? null,
      required: Boolean(descriptor.required),
      type: descriptor.type ?? "text",
      placeholder: descriptor.placeholder ?? null,
      example: descriptor.example ?? null,
      maxLength: descriptor.max_length ?? null,
      reviewLabel: descriptor.review_label ?? null,
      children: Array.isArray(descriptor.children)
        ? descriptor.children.map((child) => ({
            id: child.id,
            label: child.label,
            type: child.type,
            placeholder: child.placeholder ?? null,
          }))
        : [],
    };
  }

  return {
    id: fieldId,
    label: fieldId,
    question: null,
    helpText: null,
    required: false,
    type: "text",
    placeholder: null,
    example: null,
    maxLength: null,
    reviewLabel: null,
    children: [],
  };
}

function applySlotUpdateToGuidedStateEvent(event, slotMetadataMap, previousState) {
  const baseState = cloneGuidedStateShallow(previousState);
  const nextState = cloneGuidedStateShallow(baseState);

  if (event && typeof event === "object") {
    const status =
      typeof event.status === "string"
        ? event.status
        : typeof event.state === "string"
        ? event.state
        : null;
    if (status) {
      nextState.status = status;
    }

    const currentFieldId =
      typeof event.current_slot_id === "string"
        ? event.current_slot_id
        : typeof event.currentSlotId === "string"
        ? event.currentSlotId
        : null;
    if (currentFieldId !== null) {
      nextState.currentFieldId = currentFieldId;
    }

    const startedAt =
      typeof event.started_at === "string"
        ? event.started_at
        : typeof event.startedAt === "string"
        ? event.startedAt
        : null;
    if (startedAt !== null) {
      nextState.startedAt = startedAt;
    }

    const completedAt =
      typeof event.completed_at === "string"
        ? event.completed_at
        : typeof event.completedAt === "string"
        ? event.completedAt
        : null;
    if (completedAt !== null) {
      nextState.completedAt = completedAt;
    }

    if (event.waiting && typeof event.waiting === "object") {
      nextState.waiting = {
        assistant: Boolean(event.waiting.assistant),
        user: Boolean(event.waiting.user),
        validation: Boolean(event.waiting.validation),
      };
    }

    if (Array.isArray(event.slots)) {
      const fields = { ...nextState.fields };

      for (const slot of event.slots) {
        if (!slot || typeof slot !== "object") {
          continue;
        }

        const fieldId =
          typeof slot.slot_id === "string"
            ? slot.slot_id
            : typeof slot.slotId === "string"
            ? slot.slotId
            : null;
        if (!fieldId) {
          continue;
        }

        const existing = fields[fieldId] || baseState.fields?.[fieldId] || null;
        const descriptor = slotMetadataMap?.get?.(fieldId);
        const definition = ensureFieldDefinition(fieldId, existing?.definition, descriptor);

        const issues = Array.isArray(slot.issues)
          ? slot.issues
              .map((issue) => (typeof issue === "string" ? issue : String(issue)))
              .filter(Boolean)
          : [];

        fields[fieldId] = {
          id: fieldId,
          definition,
          status: typeof slot.status === "string" ? slot.status : existing?.status ?? "pending",
          value:
            slot.value !== undefined
              ? slot.value
              : slot.captured_value !== undefined
              ? slot.captured_value
              : existing?.value ?? null,
          confirmedValue:
            slot.confirmed_value !== undefined
              ? slot.confirmed_value
              : slot.confirmedValue !== undefined
              ? slot.confirmedValue
              : existing?.confirmedValue ?? null,
          issues,
          skippedReason:
            slot.skipped_reason ?? slot.skippedReason ?? existing?.skippedReason ?? null,
          lastAskedAt:
            slot.last_asked_at ?? slot.lastAskedAt ?? existing?.lastAskedAt ?? null,
          lastUpdatedAt:
            slot.last_updated_at ?? slot.lastUpdatedAt ?? existing?.lastUpdatedAt ?? null,
        };
      }

      nextState.fields = fields;
    }
  }

  return nextState;
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

function createTempId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ExactVirtualAssistantPM() {
  const initialDraftRef = useRef(null);
  const intentOnlyExtractionEnabled = INTENT_ONLY_EXTRACTION_ENABLED;
  const legacyAutoExtractionEnabled = !intentOnlyExtractionEnabled;
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
  const storedContextRef = useRef(SAFE_MODE ? null : readStoredSession());
  const chatHydratedRef = useRef(false);
  const voiceHydratedRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const messages = useChatMessages();
  const composerDraft = useComposerDraft();
  const isAssistantThinking = useIsAssistantThinking();
  const isAssistantStreaming = useIsStreaming();
  const isComposerLocked = useInputLocked();
  const isSyncingPreviewFlag = useIsSyncingPreview();
  const voiceStatus = useVoiceStatus();
  const voiceTranscripts = useTranscript();
  const listening = voiceStatus === "listening";
  const conversationState = useConversationState();
  const { state: docSession, start: startDocSession, end: endDocSession } = useDocSession();
  const [guidedState, setGuidedState] = useState(null);
  const [guidedPendingProposal, setGuidedPendingProposal] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Cypress) {
      window.__E2E_FLAGS__ = {
        SAFE_MODE: E2E_FLAG_SAFE_MODE,
        GUIDED_BACKEND_ON: E2E_FLAG_GUIDED_BACKEND,
      };
    }
  }, []);
  const [guidedAutoExtractionDisabled, setGuidedAutoExtractionDisabled] = useState(false);
  const guidedOrchestratorRef = useRef(null);
  const [guidedConversationId, setGuidedConversationId] = useState(null);
  const [guidedSlotMetadata, setGuidedSlotMetadata] = useState([]);
  const [guidedInitialPromptAt, setGuidedInitialPromptAt] = useState(null);
  const [guidedVoiceEnabled, setGuidedVoiceEnabled] = useState(false);
  const charterStreamRef = useRef(null);
  const processedGuidedEventIdsRef = useRef(new Set());
  const hasPostedInitialPromptRef = useRef(false);
  const guidedStateRef = useRef(null);
  const guidedPendingRef = useRef(null);
  const guidedSlotMapRef = useRef(new Map());
  const guidedVoiceEnabledRef = useRef(false);
  const guidedConversationIdRef = useRef(null);
  const guidedInitialPromptAtRef = useRef(null);
  const featureFlagsReady = true;
  useEffect(() => {
    guidedStateRef.current = guidedState;
  }, [guidedState]);
  useEffect(() => {
    guidedPendingRef.current = guidedPendingProposal;
  }, [guidedPendingProposal]);
  useEffect(() => {
    guidedConversationIdRef.current = guidedConversationId;
  }, [guidedConversationId]);
  useEffect(() => {
    guidedVoiceEnabledRef.current = guidedVoiceEnabled;
  }, [guidedVoiceEnabled]);
  useEffect(() => {
    guidedInitialPromptAtRef.current = guidedInitialPromptAt;
  }, [guidedInitialPromptAt]);
  useEffect(() => {
    const map = new Map();
    if (Array.isArray(guidedSlotMetadata)) {
      for (const slot of guidedSlotMetadata) {
        if (!slot || typeof slot !== "object") continue;
        const slotId = slot.slot_id ?? slot.slotId;
        if (!slotId) continue;
        map.set(slotId, slot);
      }
    }
    guidedSlotMapRef.current = map;
  }, [guidedSlotMetadata]);
  const resetGuidedRemoteSession = useCallback(() => {
    if (charterStreamRef.current) {
      try {
        charterStreamRef.current.close();
      } catch (error) {
        console.error("Failed to close charter stream", error);
      }
      charterStreamRef.current = null;
    }
    processedGuidedEventIdsRef.current = new Set();
    hasPostedInitialPromptRef.current = false;
    guidedConversationIdRef.current = null;
    guidedVoiceEnabledRef.current = false;
    setGuidedConversationId(null);
    setGuidedSlotMetadata([]);
    setGuidedInitialPromptAt(null);
    guidedInitialPromptAtRef.current = null;
    setGuidedVoiceEnabled(false);
    if (CHARTER_GUIDED_BACKEND_ENABLED) {
      setGuidedAutoExtractionDisabled(false);
    }
    voiceActions.setStatus("idle");
  }, []);
  useEffect(() => {
    if (!CHARTER_GUIDED_BACKEND_ENABLED) {
      return;
    }
    if (guidedConversationId) {
      setGuidedAutoExtractionDisabled(true);
    }
  }, [guidedConversationId]);
  const voiceE2EModeActive = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return isVoiceE2EModeActive(window);
  }, []);
  const shouldRenderSyncDevtools = useMemo(
    () =>
      import.meta.env.DEV ||
      (typeof window !== "undefined" && window.Cypress) ||
      voiceE2EModeActive,
    [voiceE2EModeActive],
  );
  const [overlayReady, setOverlayReady] = useState(() => !shouldRenderSyncDevtools);
  const [voiceReady, setVoiceReady] = useState(false);
  const [baseConversationReady, setBaseConversationReady] = useState(false);
  const appReadyRef = useRef(false);
  const handleDevtoolsReady = useCallback(() => {
    setOverlayReady(true);
  }, []);
  const isGuidedChatEnabled = useMemo(
    () => GUIDED_CHAT_WITHOUT_WIZARD && templateDocType === "charter",
    [templateDocType],
  );

  useEffect(() => {
    if (!shouldRenderSyncDevtools) {
      setOverlayReady(true);
    }
  }, [shouldRenderSyncDevtools]);

  // Detect if Charter Wizard is active - if so, disable background extraction
  // The wizard handles field collection sequentially through conversationMachine
  const isWizardActive = useMemo(() => {
    // Guided chat must be enabled and the wizard must be visible
    if (!SHOULD_SHOW_CHARTER_WIZARD) return false;
    if (!conversationState) return false;
    if (templateDocType !== "charter") return false;
    if (conversationState.mode === "finalized") return false;
    // Wizard is active if we're in session or review mode
    return conversationState.mode === "session" || conversationState.mode === "review";
  }, [conversationState, templateDocType]);

  const visibleMessages = useMemo(() => {
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.filter((entry) => entry.role === "user" || entry.role === "assistant");
  }, [messages]);
  const assistantActivityStatus = isAssistantThinking
    ? "thinking"
    : isAssistantStreaming
    ? "streaming"
    : null;
  const isGuidedSessionActive = Boolean(
    guidedState && guidedState.status !== "idle" && guidedState.status !== "complete"
  );
  const canStartGuided =
    (!guidedState || guidedState.status === "idle" || guidedState.status === "complete") &&
    (!CHARTER_GUIDED_BACKEND_ENABLED || !guidedConversationId);
  const guidedCurrentField = useMemo(() => {
    if (!guidedState?.currentFieldId) {
      return null;
    }
    const fieldState = guidedState.fields?.[guidedState.currentFieldId];
    if (!fieldState?.definition) {
      return null;
    }
    const { label, reviewLabel, question } = fieldState.definition;
    return {
      label: reviewLabel ?? label ?? null,
      question: question ?? null,
    };
  }, [guidedState?.currentFieldId, guidedState?.fields]);
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
  useEffect(() => {
    if (templateDocType !== "charter") {
      conversationActions.reset();
    }
  }, [templateDocType]);

  // Clear "Auto" metadata when wizard starts - prevents showing auto-extracted chips
  // for fields that will be collected through the wizard
  const wizardInitializedRef = useRef(false);
  useEffect(() => {
    if (!isWizardActive) {
      wizardInitializedRef.current = false;
      return;
    }

    // Only run once when wizard first becomes active
    if (wizardInitializedRef.current) {
      return;
    }
    wizardInitializedRef.current = true;

    // Clear metadata for all fields that will be collected by wizard
    if (conversationState && conversationState.fieldOrder.length > 0) {
      const metadataUpdates = {};
      for (const fieldId of conversationState.fieldOrder) {
        metadataUpdates[fieldId] = {
          source: null,
          updatedAt: null,
        };
      }
      recordDraftMetadata({
        paths: metadataUpdates,
        source: null,
        updatedAt: null,
      });
    }
  }, [isWizardActive, conversationState]);

  // Sync conversation wizard state to draft store
  useEffect(() => {
    if (!conversationState || !isWizardActive) {
      return;
    }

    // Extract confirmed field values from conversation state
    const updates = {};
    const touchedPaths = new Set();
    for (const fieldId of conversationState.fieldOrder) {
      const fieldState = conversationState.fields[fieldId];
      if (!fieldState) continue;

      // Only sync confirmed or captured fields
      if (fieldState.status === "confirmed" || fieldState.status === "captured") {
        const value = fieldState.confirmedValue || fieldState.value;
        if (value !== null && value !== undefined && value !== "") {
          updates[fieldId] = value;
          touchedPaths.add(fieldId);
        }
      }
    }

    // Update draft if we have any values to sync
    if (Object.keys(updates).length > 0) {
      draftActions.merge(updates);

      // Update metadata to mark these as wizard-sourced, not auto-extracted
      const metadataUpdates = {};
      for (const path of touchedPaths) {
        metadataUpdates[path] = {
          source: "Wizard",
          updatedAt: Date.now(),
        };
      }
      recordDraftMetadata({
        paths: metadataUpdates,
        source: "Wizard",
        updatedAt: Date.now(),
      });
    }
  }, [conversationState, isWizardActive]);

  const [showDocTypeModal, setShowDocTypeModal] = useState(false);
  const [pendingIntentExtraction, setPendingIntentExtraction] = useState(null);
  const messagesRef = useRef(messages);
  const attachmentsRef = useRef(attachments);
  const voiceTranscriptsRef = useRef(voiceTranscripts);
  const pendingIntentRef = useRef(null);
  const chatExtractionTimerRef = useRef(null);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    voiceTranscriptsRef.current = voiceTranscripts;
  }, [voiceTranscripts]);

  const resolveGuidedExtractionContext = useCallback(() => {
    const attachmentEntries = Array.isArray(attachmentsRef.current)
      ? attachmentsRef.current
          .map((item) => {
            const text = typeof item?.text === "string" ? item.text.trim() : "";
            if (!text) {
              return null;
            }
            return {
              name: typeof item?.name === "string" ? item.name : undefined,
              mimeType: typeof item?.mimeType === "string" ? item.mimeType : undefined,
              text,
            };
          })
          .filter(Boolean)
      : [];

    const voiceEntries = Array.isArray(voiceTranscriptsRef.current)
      ? voiceTranscriptsRef.current
          .map((entry) => {
            const text = typeof entry?.text === "string" ? entry.text.trim() : "";
            if (!text) {
              return null;
            }
            const normalized = {
              text,
            };
            if (entry?.id) {
              normalized.id = entry.id;
            }
            if (typeof entry?.timestamp === "number" && !Number.isNaN(entry.timestamp)) {
              normalized.timestamp = entry.timestamp;
            }
            return normalized;
          })
          .filter(Boolean)
      : [];

    return { attachments: attachmentEntries, voice: voiceEntries };
  }, []);

  const runGuidedExtraction = useCallback(async (request) => {
    const payload = {
      guided: true,
      docType: "charter",
      requestedFieldIds: Array.isArray(request?.requestedFieldIds)
        ? request.requestedFieldIds
        : [],
      messages: Array.isArray(request?.messages) ? request.messages : [],
    };

    if (request?.seed !== undefined) {
      payload.seed = request.seed;
    }
    if (Array.isArray(request?.attachments) && request.attachments.length > 0) {
      payload.attachments = request.attachments;
    }
    if (Array.isArray(request?.voice) && request.voice.length > 0) {
      payload.voice = request.voice;
    }

    const response = await docApi("extract", payload);
    if (!response || typeof response !== "object") {
      throw new Error("Invalid extractor response");
    }

    const warnings = Array.isArray(response.warnings) ? response.warnings : [];
    if (response.status === "ok") {
      return {
        ok: true,
        fields: response.fields || {},
        warnings,
        rawToolArguments: null,
      };
    }

    if (response.status === "error") {
      return {
        ok: false,
        error: response.error || null,
        warnings,
        fields: response.fields || {},
        rawToolArguments: null,
      };
    }

    throw new Error(`Unsupported extractor status: ${response.status}`);
  }, []);
  const initialDraftValue = initialDraftRef.current;
  useEffect(() => {
    if (chatHydratedRef.current) {
      if (!baseConversationReady) {
        setBaseConversationReady(true);
      }
      return;
    }
    const stored = storedContextRef.current;
    const storedMessages = Array.isArray(stored?.messages) ? stored.messages : null;
    const baseMessages = storedMessages && storedMessages.length > 0 ? storedMessages : seedMessages;
    const normalized = baseMessages.map((entry) => ({
      id: String(entry?.id ?? createTempId()),
      role: entry?.role === "assistant" || entry?.role === "system" ? entry.role : "user",
      text:
        typeof entry?.text === "string"
          ? entry.text
          : typeof entry?.content === "string"
          ? entry.content
          : "",
      runId: typeof entry?.runId === "string" ? entry.runId : undefined,
    }));
    chatActions.hydrate(normalized);
    chatHydratedRef.current = true;
    setBaseConversationReady(true);
  }, [baseConversationReady]);
  useEffect(() => {
    if (voiceHydratedRef.current) {
      if (!voiceReady) {
        setVoiceReady(true);
      }
      return;
    }
    voiceActions.setTranscripts(Array.isArray(voiceTranscripts) ? voiceTranscripts : []);
    voiceHydratedRef.current = true;
    setVoiceReady(true);
  }, [voiceReady, voiceTranscripts]);
  useEffect(() => {
    if (draftHydratedRef.current) {
      return;
    }
    if (initialDraftValue) {
      draftActions.hydrate(initialDraftValue);
      draftHydratedRef.current = true;
    }
  }, []);
  useEffect(() => {
    return () => {
      if (chatExtractionTimerRef.current) {
        clearTimeout(chatExtractionTimerRef.current);
        chatExtractionTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (appReadyRef.current) {
      return;
    }
    if (!featureFlagsReady || !voiceReady || !baseConversationReady || !overlayReady) {
      return;
    }
    if (typeof window !== "undefined") {
      window.__appReady = true;
    }
    if (typeof document !== "undefined" && document.body) {
      if (voiceE2EModeActive || document.body.dataset.e2eReady !== undefined) {
        document.body.dataset.e2eReady = "1";
      }
    }
    appReadyRef.current = true;
  }, [
    featureFlagsReady,
    voiceReady,
    baseConversationReady,
    overlayReady,
    voiceE2EModeActive,
  ]);

  const clearPendingIntentExtraction = useCallback(() => {
    pendingIntentRef.current = null;
    setPendingIntentExtraction(null);
  }, []);

  const queuePendingIntentExtraction = useCallback((payload) => {
    pendingIntentRef.current = payload;
    setPendingIntentExtraction(payload);
  }, []);

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
  const shouldShowPreview = !FLAGS.PREVIEW_CONDITIONAL_VISIBILITY || docSession.isActive;

  // Stage 7: Preview focus state - when preview should dominate layout
  const isPreviewFocus = useMemo(
    () => Boolean(shouldShowPreview && FLAGS.PREVIEW_FOCUS_ENABLED),
    [shouldShowPreview]
  );

  // Stage 7: Chat overlay pinned state - allow users to toggle between overlay and docked
  const [chatOverlayPinned, setChatOverlayPinned] = useState(true);
  const chatIsOverlay = useMemo(
    () => isPreviewFocus && FLAGS.CHAT_OVERLAY_ON_PREVIEW && chatOverlayPinned,
    [chatOverlayPinned, isPreviewFocus]
  );

  const previewPanelClassName = useMemo(() => {
    const previewFocusClass = isPreviewFocus ? "lg:col-span-12" : "lg:col-span-4";
    return chatIsOverlay ? previewFocusClass : "lg:col-span-4";
  }, [chatIsOverlay, isPreviewFocus]);

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
  const { draft: previewDraftDocument, pendingTurn: hasPendingPreviewTurn } =
    usePreviewSyncService();
  const draftState = previewDraftDocument?.fields ?? null;
  const charterPreview = draftState ?? initialDraftRef.current;
  const [fieldStates, setFieldStates] = useState(() => {
    const draft = initialDraftRef.current;
    const paths = expandPathsWithAncestors(collectPaths(draft));
    const now = Date.now();
    return synchronizeFieldStates(draft, {}, { touchedPaths: paths, source: "Auto", timestamp: now, locks: {} });
  });
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingExportLinks, setIsGeneratingExportLinks] = useState(false);
  const [rtcState, setRtcState] = useState("idle");
  const [isCharterSyncing, setIsCharterSyncing] = useState(false);
  const draftStatus = useDraftStatus();
  const isDraftSyncing = draftStatus === "merging";
  const isPreviewSyncing =
    isSyncingPreviewFlag || isDraftSyncing || hasPendingPreviewTurn;
  const legacyDraftSnapshot = useLegacyDraftStore();
  const pointerLocks =
    legacyDraftSnapshot?.locks instanceof Map ? legacyDraftSnapshot.locks : new Map();
  const pointerMetadata =
    legacyDraftSnapshot?.metadataByPath instanceof Map
      ? legacyDraftSnapshot.metadataByPath
      : new Map();
  const pointerHighlights =
    legacyDraftSnapshot?.highlightedPaths instanceof Set
      ? legacyDraftSnapshot.highlightedPaths
      : new Set();
  const locks = useMemo(() => pointerMapToPathObject(pointerLocks), [pointerLocks]);
  const highlightedPaths = useMemo(
    () => pointerSetToPathSet(pointerHighlights),
    [pointerHighlights]
  );
  const aiMetadataByPath = useMemo(
    () => pointerMapToPathMap(pointerMetadata),
    [pointerMetadata]
  );
  const [charterSyncError, setCharterSyncError] = useState(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [manualExtractionTrigger, setManualExtractionTrigger] = useState(false);
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
  const pointerLocksRef = useRef(pointerLocks);
  const toastTimersRef = useRef(new Map());
  const realtimeEnabled = Boolean(import.meta.env.VITE_OPENAI_REALTIME_MODEL);
  useEffect(() => {
    charterDraftRef.current = charterPreview;
  }, [charterPreview]);

  useEffect(() => {
    locksRef.current = locks;
  }, [locks]);

  useEffect(() => {
    pointerLocksRef.current = pointerLocks;
  }, [pointerLocks]);

  useEffect(() => {
    if (!pointerHighlights || pointerHighlights.size === 0) {
      return undefined;
    }
    const pointers = Array.from(pointerHighlights).filter((entry) => typeof entry === "string");
    if (pointers.length === 0) {
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      clearDraftHighlights(pointers);
    }, 3000);
    return () => clearTimeout(timeoutId);
  }, [pointerHighlights]);

  useEffect(() => {
    if (!previewDocType) {
      initialDraftRef.current = null;
      charterDraftRef.current = null;
      if (charterPreview !== null) {
        draftActions.resetDraft();
      }
      if (pointerLocksRef.current && pointerLocksRef.current.size > 0) {
        pointerLocksRef.current = new Map();
        locksRef.current = {};
        resetDraftLocks();
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
      draftActions.setDraft(baseDraft);
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
    if (SAFE_MODE) {
      return;
    }
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
      const pointerLocksSnapshot =
        pointerLocksRef.current instanceof Map ? pointerLocksRef.current : new Map();
      const baseDraft = charterDraftRef.current ?? initialDraftRef.current ?? createBlankDraft();
      const {
        draft: finalDraft,
        updatedPaths,
        metadataByPointer,
        updatedAt: mergedAt,
      } = mergeIntoDraftWithLocks(baseDraft, normalizedDraft, pointerLocksSnapshot, {
        source: "AI",
        updatedAt: Date.now(),
      });

      charterDraftRef.current = finalDraft;
      draftActions.setDraft(finalDraft);

      const timestamp =
        typeof mergedAt === "number" && !Number.isNaN(mergedAt) ? mergedAt : Date.now();

      setFieldStates((prevStates) =>
        synchronizeFieldStates(finalDraft, prevStates, {
          touchedPaths: updatedPaths,
          source: "AI",
          timestamp,
          locks: locksSnapshot,
        })
      );

      recordDraftMetadata({
        paths: metadataByPointer,
        source: "AI",
        updatedAt: timestamp,
      });

      return finalDraft;
    },
    [createBlankDraft, previewDocType]
  );

  const autoExtractionDisabled = isWizardActive || guidedAutoExtractionDisabled;

  const {
    isExtracting,
    error: extractError,
    clearError: clearExtractionError,
    trigger: triggerExtraction,
  } = useBackgroundExtraction({
    docType: effectiveDocType,
    selectedDocType: supportedDocTypes.has(docType)
      ? docType
      : null,
    suggestedDocType: suggested,
    allowedDocTypes: supportedDocTypes,
    // When guidance workflows are active, don't pass messages/attachments/voice to prevent auto-extraction
    messages: autoExtractionDisabled ? [] : messages,
    voice: autoExtractionDisabled ? [] : voiceTranscripts,
    attachments: autoExtractionDisabled ? [] : attachments,
    seed: extractionSeed,
    locks,
    getDraft: getCurrentDraft,
    setDraft: applyNormalizedDraft,
    normalize: normalizeDraft,
    isUploadingAttachments,
    onNotify: pushToast,
    docTypeRoutingEnabled: docRouterEnabled,
    requireDocType: () => setShowDocTypeModal(true),
    manualTrigger: manualExtractionTrigger,
  });
  const attemptIntentExtraction = useCallback(
    async ({ intent, reason, messages: history, voice: voiceEvents }) => {
      const result = await triggerExtraction({
        intent,
        docType: "charter",
        messages: history,
        attachments,
        voice: voiceEvents,
        reason,
      });

      if (!result?.ok && result?.reason === "attachments-uploading") {
        const isNewPending = !pendingIntentRef.current;
        queuePendingIntentExtraction({ intent, reason });
        if (isNewPending) {
          pushToast({
            tone: "info",
            message: "Waiting for attachments to finish before extracting the charter.",
          });
        }
      } else {
        clearPendingIntentExtraction();
      }

      return result;
    },
    [attachments, clearPendingIntentExtraction, queuePendingIntentExtraction, triggerExtraction, pushToast]
  );

  // Reset manual extraction trigger after extraction completes
  useEffect(() => {
    if (manualExtractionTrigger && !isExtracting) {
      setManualExtractionTrigger(false);
    }
  }, [manualExtractionTrigger, isExtracting]);

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
  const isCharterSyncInFlight = isExtracting || isCharterSyncing || isPreviewSyncing;
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
        pointerLocksRef.current = new Map();
        locksRef.current = {};
        resetDraftLocks();
      }

      charterDraftRef.current = draft;
      draftActions.setDraft(draft);

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

      const base = draftStoreApi.getState().draft ?? createBlankDraft();
      const next = setNestedValue(base, segments, value);
      charterDraftRef.current = next;
      const touchedPaths = getPathsToUpdate(path);
      const subtreeValue = getValueAtPath(next, segments);
      if (typeof subtreeValue !== "undefined") {
        walkDraft(
          subtreeValue,
          (subPath) => {
            touchedPaths.add(subPath);
          },
          path,
        );
      }
      const now = Date.now();
      setFieldStates((prevStates) =>
        synchronizeFieldStates(next, prevStates, {
          touchedPaths,
          source: "Manual",
          timestamp: now,
          locks: locksRef.current,
        }),
      );
      draftActions.setDraft(next);
      dispatch("PREVIEW_UPDATED", { source: "text" });
    },
    [createBlankDraft, previewDocType]
  );

  const handleLockField = useCallback(
    (path) => {
      if (!path) return;
      if (!previewDocType) return;
      if (locksRef.current?.[path]) {
        return;
      }

      const nextLocks = { ...(locksRef.current || {}), [path]: true };
      locksRef.current = nextLocks;

      const pointer = pathToPointer(path);
      if (pointer) {
        const nextPointerLocks =
          pointerLocksRef.current instanceof Map
            ? new Map(pointerLocksRef.current)
            : new Map();
        nextPointerLocks.set(pointer, true);
        pointerLocksRef.current = nextPointerLocks;
        lockDraftPaths(pointer);
      }

      const touchedPaths = getPathsToUpdate(path);
      setFieldStates((prevStates) => {
        const prevEntry = prevStates?.[path];
        const source = prevEntry?.source ?? "Manual";
        const updatedAt =
          typeof prevEntry?.updatedAt === "number" ? prevEntry.updatedAt : Date.now();
        return synchronizeFieldStates(charterDraftRef.current, prevStates, {
          touchedPaths,
          source,
          timestamp: updatedAt,
          locks: nextLocks,
        });
      });
    },
    [previewDocType]
  );

  const draftHasContent = useMemo(() => hasDraftContent(charterPreview), [charterPreview]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isAssistantThinking, isAssistantStreaming]);

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

  const appendAssistantMessage = useCallback((text) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return;
    chatActions.setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), role: "assistant", text: safeText },
    ]);
  }, []);

  useEffect(() => {
    if (!GUIDED_CHAT_WITHOUT_WIZARD) {
      if (guidedOrchestratorRef.current) {
        guidedOrchestratorRef.current.reset();
      }
      setGuidedState(null);
      setGuidedAutoExtractionDisabled(false);
      return;
    }

    if (!guidedOrchestratorRef.current) {
      guidedOrchestratorRef.current = createGuidedOrchestrator({
        postAssistantMessage: appendAssistantMessage,
        onStateChange: setGuidedState,
        onActiveChange: setGuidedAutoExtractionDisabled,
        onPendingChange: setGuidedPendingProposal,
        extractFieldsFromUtterance: runGuidedExtraction,
        getExtractionContext: resolveGuidedExtractionContext,
      });
    }

    const orchestrator = guidedOrchestratorRef.current;

    if (CHARTER_GUIDED_BACKEND_ENABLED && guidedConversationId) {
      orchestrator.reset();
      return;
    }

    if (!isGuidedChatEnabled) {
      orchestrator.reset();
      setGuidedState(orchestrator.getState());
      setGuidedAutoExtractionDisabled(orchestrator.isAutoExtractionDisabled());
      return;
    }

    setGuidedState(orchestrator.getState());
    setGuidedAutoExtractionDisabled(orchestrator.isAutoExtractionDisabled());
  }, [
    appendAssistantMessage,
    guidedConversationId,
    isGuidedChatEnabled,
    resolveGuidedExtractionContext,
    runGuidedExtraction,
  ]);

  const applyGuidedAnswersToDraft = useCallback(
    (state) => {
      if (!isGuidedChatEnabled) {
        return null;
      }
      if (previewDocType !== "charter") {
        return null;
      }
      if (!state || !state.fields) {
        return null;
      }

      const patch = guidedStateToCharterDTO(state);
      const entries = Object.entries(patch);
      if (entries.length === 0) {
        return null;
      }

      const baseDraft =
        charterDraftRef.current ?? initialDraftRef.current ?? createBlankDraft();
      const diff = {};

      for (const [fieldId, nextValue] of entries) {
        if (typeof nextValue === "undefined") {
          continue;
        }
        const currentValue = getValueAtPath(baseDraft, fieldId);
        if (!valuesEqual(currentValue, nextValue)) {
          diff[fieldId] = nextValue;
        }
      }

      if (Object.keys(diff).length === 0) {
        return null;
      }

      const pointerLocksSnapshot =
        pointerLocksRef.current instanceof Map ? pointerLocksRef.current : new Map();
      const { draft: finalDraft, updatedPaths, metadataByPointer, updatedAt } =
        mergeIntoDraftWithLocks(baseDraft, diff, pointerLocksSnapshot, {
          source: "Guided",
          updatedAt: Date.now(),
        });

      if (!updatedPaths || updatedPaths.size === 0) {
        return null;
      }

      charterDraftRef.current = finalDraft;
      draftActions.setDraft(finalDraft);

      const timestamp =
        typeof updatedAt === "number" && !Number.isNaN(updatedAt) ? updatedAt : Date.now();
      const locksSnapshot = locksRef.current || {};

      setFieldStates((prevStates) =>
        synchronizeFieldStates(finalDraft, prevStates, {
          touchedPaths: updatedPaths,
          source: "Guided",
          timestamp,
          locks: locksSnapshot,
        }),
      );

      recordDraftMetadata({
        paths: metadataByPointer,
        source: "Guided",
        updatedAt: timestamp,
      });

      return finalDraft;
    },
    [
      createBlankDraft,
      isGuidedChatEnabled,
      previewDocType,
      setFieldStates,
    ],
  );

  const applyVoiceExtractionToDraft = useCallback(
    (fields) => {
      if (previewDocType !== "charter") {
        return null;
      }
      if (!fields || typeof fields !== "object") {
        return null;
      }

      const entries = Object.entries(fields);
      if (entries.length === 0) {
        return null;
      }

      const baseDraft =
        charterDraftRef.current ?? initialDraftRef.current ?? createBlankDraft();
      const diff = {};

      for (const [key, value] of entries) {
        if (typeof key !== "string") {
          continue;
        }
        const currentValue =
          baseDraft && typeof baseDraft === "object" && key in baseDraft
            ? baseDraft[key]
            : undefined;
        if (!valuesEqual(currentValue, value)) {
          diff[key] = value;
        }
      }

      if (Object.keys(diff).length === 0) {
        return null;
      }

      const pointerLocksSnapshot =
        pointerLocksRef.current instanceof Map ? pointerLocksRef.current : new Map();
      const { draft: finalDraft, updatedPaths, metadataByPointer, updatedAt } =
        mergeIntoDraftWithLocks(baseDraft, diff, pointerLocksSnapshot, {
          source: "Voice",
          updatedAt: Date.now(),
        });

      if (!updatedPaths || updatedPaths.size === 0) {
        return null;
      }

      charterDraftRef.current = finalDraft;
      draftActions.setDraft(finalDraft);

      const timestamp =
        typeof updatedAt === "number" && !Number.isNaN(updatedAt) ? updatedAt : Date.now();
      const locksSnapshot = locksRef.current || {};

      setFieldStates((prevStates) =>
        synchronizeFieldStates(finalDraft, prevStates, {
          touchedPaths: updatedPaths,
          source: "Voice",
          timestamp,
          locks: locksSnapshot,
          pending: true,
        }),
      );

      const annotatedMetadata = new Map();
      metadataByPointer.forEach((value, pointer) => {
        const entry = value && typeof value === "object" ? value : {};
        annotatedMetadata.set(pointer, {
          ...entry,
          source: "Voice",
          updatedAt: timestamp,
          pending: true,
        });
      });

      recordDraftMetadata({
        paths: annotatedMetadata,
        source: "Voice",
        updatedAt: timestamp,
      });

      return finalDraft;
    },
    [createBlankDraft, previewDocType, recordDraftMetadata, setFieldStates],
  );

  const flushGuidedAnswers = useCallback(() => {
    if (!guidedState) {
      return null;
    }
    return applyGuidedAnswersToDraft(guidedState);
  }, [applyGuidedAnswersToDraft, guidedState]);

  useEffect(() => {
    flushGuidedAnswers();
  }, [flushGuidedAnswers]);

  const scheduleChatPreviewSync = useCallback(
    ({ reason = "chat-completion" } = {}) => {
      if (!effectiveDocType) {
        return;
      }
      if (chatExtractionTimerRef.current) {
        clearTimeout(chatExtractionTimerRef.current);
        chatExtractionTimerRef.current = null;
      }

      chatExtractionTimerRef.current = setTimeout(async () => {
        chatExtractionTimerRef.current = null;
        const latestMessages = Array.isArray(messagesRef.current)
          ? messagesRef.current
          : [];
        const latestAttachments = Array.isArray(attachmentsRef.current)
          ? attachmentsRef.current
          : [];
        const latestVoice = Array.isArray(voiceTranscriptsRef.current)
          ? voiceTranscriptsRef.current
          : [];
        const latestDraft = charterDraftRef.current;

        // Performance tracking: Measure real-time sync latency
        const syncStartTime = performance.now();

        chatActions.setSyncingPreview(true);
        try {
          const result = await triggerExtraction({
            docType: effectiveDocType,
            draft: latestDraft,
            messages: latestMessages,
            attachments: latestAttachments,
            voice: latestVoice,
            reason,
          });

          // Log sync performance (target: <500ms total)
          const syncDuration = performance.now() - syncStartTime;
          console.log(`[Real-time Sync] ${reason}: ${syncDuration.toFixed(0)}ms ${syncDuration > 500 ? '⚠️ SLOW' : '✓'}`);

          if (!result?.ok && result?.reason === "attachments-uploading") {
            pushToast({
              tone: "info",
              message:
                "Waiting for attachments to finish before updating the preview.",
            });
          }
        } catch (error) {
          console.error("Chat-triggered extraction failed", error);
          pushToast({
            tone: "error",
            message: "Unable to update the preview from the latest chat turn.",
          });
        } finally {
          chatActions.setSyncingPreview(false);
        }
      }, CHAT_EXTRACTION_DEBOUNCE_MS);
    },
    [effectiveDocType, pushToast, triggerExtraction]
  );

  const emitGuidedCompletionTelemetry = useCallback(
    (state, { reason = "complete" } = {}) => {
      if (!CHARTER_GUIDED_BACKEND_ENABLED || !state) {
        return;
      }

      const conversationId = guidedConversationIdRef.current;
      const summary = summarizeGuidedSlots(state);
      const startedAt = guidedInitialPromptAtRef.current;
      const elapsedMs =
        typeof startedAt === "number" && Number.isFinite(startedAt)
          ? Math.max(0, Date.now() - startedAt)
          : null;

      const metadata = {
        ...summary,
        reason,
        status: state.status,
        elapsedMs,
        completedAt: state.completedAt,
        startedAt: state.startedAt,
        voiceEnabled: Boolean(guidedVoiceEnabledRef.current),
      };

      sendTelemetryEvent("charter_guided_complete", {
        conversationId,
        metadata,
      });
    },
    [],
  );

  const emitGuidedFallbackTelemetry = useCallback(
    (phase, error, extraMetadata = {}) => {
      if (!CHARTER_GUIDED_BACKEND_ENABLED) {
        return;
      }

      const conversationId = guidedConversationIdRef.current;
      const metadata = {
        phase,
        status: error?.status ?? null,
        message: error?.message ?? null,
        errorName: error?.name ?? null,
        voiceEnabled: Boolean(guidedVoiceEnabledRef.current),
        hasConversationId: Boolean(conversationId),
        ...extraMetadata,
      };

      sendTelemetryEvent("charter_guided_fallback_local", {
        conversationId,
        metadata,
      });
    },
    [],
  );

  const processGuidedEvents = useCallback(
    (events, { reason } = {}) => {
      if (!Array.isArray(events) || events.length === 0) {
        return { stateChanged: false, sessionCompleted: false, appendedAssistant: false };
      }

      const seen = processedGuidedEventIdsRef.current;
      let nextState = guidedStateRef.current;
      let stateChanged = false;
      let sessionCompleted = false;
      let appendedAssistant = false;

      for (const rawEvent of events) {
        if (!rawEvent || typeof rawEvent !== "object") {
          continue;
        }

        const eventId =
          typeof rawEvent.event_id === "string" && rawEvent.event_id
            ? rawEvent.event_id
            : typeof rawEvent.eventId === "string"
            ? rawEvent.eventId
            : null;

        if (eventId && seen.has(eventId)) {
          continue;
        }

        if (eventId) {
          seen.add(eventId);
        }

        const eventType =
          typeof rawEvent.type === "string" && rawEvent.type
            ? rawEvent.type
            : typeof rawEvent.event === "string"
            ? rawEvent.event
            : null;

        if (eventType === "assistant_prompt") {
          const message =
            typeof rawEvent.message === "string" ? rawEvent.message.trim() : "";
          if (message) {
            appendAssistantMessage(message);
            appendedAssistant = true;
            if (guidedVoiceEnabledRef.current) {
              voiceActions.setStatus("listening");
            }
          }
          continue;
        }

        if (eventType === "slot_update") {
          nextState = applySlotUpdateToGuidedStateEvent(
            rawEvent,
            guidedSlotMapRef.current,
            nextState,
          );
          stateChanged = true;
          if (nextState?.status === "complete") {
            sessionCompleted = true;
          }
        }
      }

      if (stateChanged && nextState) {
        setGuidedState(nextState);
        scheduleChatPreviewSync({ reason: reason || "guided-slot-update" });
      }

      if (appendedAssistant && !hasPostedInitialPromptRef.current) {
        hasPostedInitialPromptRef.current = true;
        const firstPromptTimestamp = Date.now();
        setGuidedInitialPromptAt(firstPromptTimestamp);
        guidedInitialPromptAtRef.current = firstPromptTimestamp;
      }

      if (stateChanged || appendedAssistant) {
        messagesRef.current = chatStoreApi.getState().messages;
      }

      if (sessionCompleted) {
        emitGuidedCompletionTelemetry(nextState, { reason: reason || "guided-slot-update" });
        endDocSession('submitted');
        resetGuidedRemoteSession();
      }

      return { stateChanged, sessionCompleted, appendedAssistant };
    },
    [
      appendAssistantMessage,
      emitGuidedCompletionTelemetry,
      endDocSession,
      resetGuidedRemoteSession,
      scheduleChatPreviewSync,
    ],
  );

  const sendGuidedBackendMessage = useCallback(
    async (text, { source = "chat", isFinal = true } = {}) => {
      const conversationId = guidedConversationIdRef.current;
      if (!conversationId) {
        throw new CharterClientError("No active guided conversation.");
      }

      const response = await postCharterMessage(conversationId, text, source, isFinal);
      processGuidedEvents(response?.events ?? [], {
        reason: source === "voice" ? "guided-voice-update" : "guided-chat-update",
      });
      messagesRef.current = chatStoreApi.getState().messages;
      return response;
    },
    [processGuidedEvents],
  );

  useEffect(() => {
    if (!CHARTER_GUIDED_BACKEND_ENABLED) {
      return;
    }

    if (!guidedConversationId) {
      if (charterStreamRef.current) {
        charterStreamRef.current.close();
        charterStreamRef.current = null;
      }
      return;
    }

    try {
      const subscription = subscribeToCharterStream(guidedConversationId, (event) => {
        if (!event) {
          return;
        }

        if (event.type === "close") {
          endDocSession('cancelled');
          resetGuidedRemoteSession();
          return;
        }

        const payload = typeof event.data === "string" ? event.data.trim() : "";
        if (!payload) {
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch (error) {
          console.error("Failed to parse charter stream event", error);
          return;
        }

        if (!parsed || typeof parsed !== "object") {
          return;
        }

        if (!parsed.type && event.type) {
          parsed.type = event.type;
        }

        if (!parsed.event_id && event.lastEventId) {
          parsed.event_id = event.lastEventId;
        }

        processGuidedEvents([parsed], { reason: "guided-stream-update" });
      });

      charterStreamRef.current = subscription;
    } catch (error) {
      console.error("Unable to subscribe to charter stream", error);
    }

    return () => {
      if (charterStreamRef.current) {
        charterStreamRef.current.close();
        charterStreamRef.current = null;
      }
    };
  }, [guidedConversationId, processGuidedEvents, resetGuidedRemoteSession]);

  useEffect(() => {
    return () => {
      endDocSession('cleared');
      resetGuidedRemoteSession();
    };
  }, [endDocSession, resetGuidedRemoteSession]);

  const appendUserMessageToChat = useCallback((text) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return null;
    chatActions.pushUser(safeText);
    const nextHistory = chatStoreApi.getState().messages;
    messagesRef.current = nextHistory;
    return nextHistory[nextHistory.length - 1] ?? null;
  }, []);

  const shareLinksNotConfiguredMessage =
    "Share links aren’t configured yet. Ask your admin to set EVA_SHARE_SECRET.";
const resolveDocTypeForManualSync = useCallback(
    () =>
      resolveManualSyncDocType({
        snapshot: getDocTypeSnapshot(),
        confirmThreshold: 0.7,
      }),
    []
  );
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
        trigger: triggerExtraction,
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
      triggerExtraction,
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

  const validateCharter = async (draft = null) => {
    const flushedDraft = flushGuidedAnswers();
    const coerceDraft = (value) =>
      value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const effectiveDraft =
      coerceDraft(draft) ??
      coerceDraft(flushedDraft) ??
      coerceDraft(charterDraftRef.current) ??
      coerceDraft(charterPreview);

    if (!effectiveDraft) {
      return {
        ok: false,
        errors: [
          { message: `No ${docTypeDisplayLabel} data available. Generate a draft before exporting.` },
        ],
      };
    }

    const docPayload = {
      docType: requestDocType,
      document: effectiveDraft,
      charter: requestDocType === "charter" ? effectiveDraft : undefined,
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

    const docApiOptions =
      CHARTER_GUIDED_BACKEND_ENABLED && requestDocType === "charter" && CHARTER_DOC_API_BASES
        ? { bases: CHARTER_DOC_API_BASES }
        : undefined;

    let payload;
    try {
      payload = await docApi("validate", docPayload, docApiOptions);
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

    const docApiOptions =
      CHARTER_GUIDED_BACKEND_ENABLED && requestDocType === "charter" && CHARTER_DOC_API_BASES
        ? { bases: CHARTER_DOC_API_BASES }
        : undefined;

    try {
      const payload = await docApi("render", docPayload, docApiOptions);
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
    const flushedDraft = flushGuidedAnswers();
    const coerceDraft = (value) =>
      value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const latestDraft =
      coerceDraft(flushedDraft) ??
      coerceDraft(charterDraftRef.current) ??
      coerceDraft(charterPreview);
    const normalizedDocument = latestDraft ? normalizeDraft(latestDraft) : null;

    if (normalizedDocument) {
      applyCharterDraft(normalizedDocument);
    }

    const validation = await validateCharter(normalizedDocument ?? latestDraft);
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

  const cleanupRealtime = ({ dispatchStop = true, dispatchStreamClose = true } = {}) => {
    if (dataRef.current) {
      try {
        dataRef.current.close();
      } catch (error) {
        console.error("Error closing realtime data channel", error);
      }
      dataRef.current.onmessage = null;
      dataRef.current.onclose = null;
      dataRef.current = null;
      if (dispatchStreamClose) {
        dispatch("STREAM_CLOSE");
      }
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
      if (dispatchStop) {
        dispatch("VOICE_STOP");
      }
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const stopRealtime = (options) => {
    cleanupRealtime(options);
    setRtcState("idle");
  };

  const startRealtime = async () => {
    if (!realtimeEnabled) return;
    if (rtcState === "connecting" || rtcState === "live") return;
    setRtcState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      dispatch("VOICE_START");

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
        const normalized = normalizeRealtimeTranscriptEvent(event?.data);
        if (!normalized || !normalized.text) {
          return;
        }
        await handleVoiceTranscriptMessage(normalized.text, {
          isFinal: normalized.isFinal,
        });
      };

      dataChannel.onopen = () => {
        dispatch("STREAM_OPEN");
      };

      dataChannel.onclose = () => {
        dataRef.current = null;
        dispatch("STREAM_CLOSE");
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

  
  const handleCommandFromText = useCallback(
    async (
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
    },
    [
      appendAssistantMessage,
      appendUserMessageToChat,
      defaultShareBaseName,
      exportDocxViaChat,
      exportPdfViaChat,
      generateBlankCharter,
      metadataMap,
      pushToast,
      setDocType,
      setShowDocTypeModal,
      setSuggested,
      shareLinksViaChat,
      supportedDocTypes,
      syncDocFromChat,
    ]
  );

  const handleSpeechTranscript = useCallback(
    async (rawTranscript) => {
      const trimmedTranscript =
        typeof rawTranscript === "string" ? rawTranscript.trim() : "";
      if (!trimmedTranscript) {
        return;
      }

      const handled = await handleCommandFromText(trimmedTranscript);
      if (!handled) {
        const currentDraft = chatStoreApi.getState().composerDraft;
        chatActions.setComposerDraft(
          currentDraft ? `${currentDraft} ${trimmedTranscript}` : trimmedTranscript,
        );
      }
    },
    [handleCommandFromText],
  );

  const { startRecording, stopRecording } = useSpeechInput({
    onTranscript: handleSpeechTranscript,
    onError: (error) => {
      console.error("Transcription failed", error);
    },
  });

  const submitChatTurn = useCallback(
    async (rawText, { source }) => {
      const trimmed = typeof rawText === "string" ? rawText.trim() : "";
      if (!trimmed) {
        return { status: "empty" };
      }

      const { isStreaming, isAssistantThinking } = chatStoreApi.getState();
      if (isStreaming || isAssistantThinking) {
        return { status: "busy" };
      }

      if (source !== "voice") {
        dispatch("PREVIEW_UPDATED", { source: "text" });
      }

      chatActions.pushUser(trimmed);
      const nextHistory = chatStoreApi.getState().messages;
      messagesRef.current = nextHistory;

      chatActions.lockField("composer");

      const orchestrator = guidedOrchestratorRef.current;
      const shouldBypassGuided = trimmed.startsWith("/");
      const shouldAttemptRemote =
        CHARTER_GUIDED_BACKEND_ENABLED &&
        Boolean(guidedConversationIdRef.current) &&
        !shouldBypassGuided;

      try {
        if (shouldAttemptRemote) {
          let remoteHandled = false;
          const runId = createTempId();
          chatActions.startAssistant(runId);
          try {
            const response = await sendGuidedBackendMessage(trimmed, {
              source: source === "voice" ? "voice" : "chat",
              isFinal: true,
            });
            remoteHandled = response?.handled !== false;
          } catch (error) {
            if (error instanceof CharterClientError) {
              emitGuidedFallbackTelemetry("message", error, {
                source: source === "voice" ? "voice" : "chat",
              });
            } else {
              throw error;
            }
          } finally {
            chatActions.endAssistant(runId, "");
            chatActions.setMessages((prev) =>
              prev.filter((message) => message.runId !== runId),
            );
            messagesRef.current = chatStoreApi.getState().messages;
          }

          if (remoteHandled) {
            return { status: "guided" };
          }
        }

        if (orchestrator && !shouldBypassGuided) {
          const handledByOrchestrator = orchestrator.handleUserMessage(trimmed);
          if (handledByOrchestrator) {
            return { status: "guided" };
          }
        }

        if (intentOnlyExtractionEnabled) {
          const intent = detectCharterIntent(trimmed);
          if (intent) {
            let startedIntentSession = false;
            if (intent === 'create_charter' || intent === 'update_charter') {
              startDocSession({ docType: 'charter', origin: 'intent' });
              startedIntentSession = true;
            }
            const latestVoice = Array.isArray(voiceTranscriptsRef.current)
              ? voiceTranscriptsRef.current
              : [];
            try {
              await attemptIntentExtraction({
                intent,
                reason: source === "voice" ? "voice-intent" : "composer-intent",
                messages: nextHistory,
                voice: latestVoice,
              });
            } finally {
              if (startedIntentSession) {
                endDocSession('submitted');
              }
            }
            return { status: "intent" };
          }
        } else {
          scheduleChatPreviewSync({
            reason: source === "voice" ? "voice-input-immediate" : "user-input-immediate",
          });
        }

        const handled = await handleCommandFromText(trimmed, { userMessageAppended: true });
        if (handled) {
          return { status: "command" };
        }

        const runId = createTempId();
        chatActions.startAssistant(runId);
        let reply = "";
        try {
          const latestAttachments = Array.isArray(attachmentsRef.current)
            ? attachmentsRef.current
            : [];
          const guidedSystemPrompt =
            orchestrator && !shouldBypassGuided && orchestrator.isActive()
              ? CHARTER_GUIDED_SYSTEM_PROMPT
              : undefined;
          reply = await callLLM(trimmed, nextHistory, latestAttachments, {
            systemPrompt: guidedSystemPrompt,
          });
        } catch (e) {
          reply = "LLM error (demo): " + (e?.message || "unknown");
        }
        chatActions.endAssistant(runId, reply || "");
        scheduleChatPreviewSync({
          reason: source === "voice" ? "voice-chat-completion" : "chat-completion",
        });

        return { status: "responded" };
      } finally {
        chatActions.unlockField("composer");
      }
    },
    [
      attemptIntentExtraction,
      emitGuidedFallbackTelemetry,
      handleCommandFromText,
      intentOnlyExtractionEnabled,
      scheduleChatPreviewSync,
      sendGuidedBackendMessage,
    ],
  );

  const handleStartGuidedCharter = useCallback(async () => {
    if (!isGuidedChatEnabled) {
      return;
    }

    const orchestrator = guidedOrchestratorRef.current;

    if (!REMOTE_GUIDED_BACKEND_ENABLED) {
      startDocSession({ docType: 'charter', origin: 'wizard' });
      orchestrator?.start();
      return;
    }

    const correlationId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : createTempId();

    if (guidedStateRef.current?.status === "complete") {
      emitGuidedCompletionTelemetry(guidedStateRef.current, { reason: "restart" });
    }

    try {
      resetGuidedRemoteSession();
      processedGuidedEventIdsRef.current = new Set();
      hasPostedInitialPromptRef.current = false;
      setGuidedState(createInitialGuidedState());
      startDocSession({ docType: 'charter', origin: 'wizard' });

      const startResponse = await startCharterSession(correlationId);

      setGuidedConversationId(startResponse.conversationId);
      guidedConversationIdRef.current = startResponse.conversationId;
      const slotList = Array.isArray(startResponse.slots) ? startResponse.slots : [];
      setGuidedSlotMetadata(slotList);
      setGuidedVoiceEnabled(Boolean(startResponse.hasVoiceSupport));
      guidedVoiceEnabledRef.current = Boolean(startResponse.hasVoiceSupport);
      setGuidedAutoExtractionDisabled(true);

      if (startResponse.hasVoiceSupport) {
        voiceActions.setStatus("listening");
      }

      const events = Array.isArray(startResponse.events) ? startResponse.events : [];
      const prompt =
        typeof startResponse.prompt === "string" ? startResponse.prompt.trim() : "";

      sendTelemetryEvent("charter_guided_start", {
        conversationId: startResponse.conversationId,
        metadata: {
          correlationId,
          slotCount: slotList.length,
          voiceEnabled: Boolean(startResponse.hasVoiceSupport),
          idempotent: Boolean(startResponse.idempotent),
          initialEventCount: events.length,
          hasInitialPrompt: Boolean(prompt),
        },
      });

      const result = processGuidedEvents(events, { reason: "guided-session-start" });

      if (prompt && !(result?.appendedAssistant)) {
        appendAssistantMessage(prompt);
        if (!hasPostedInitialPromptRef.current) {
          hasPostedInitialPromptRef.current = true;
          const initialPromptTimestamp = Date.now();
          setGuidedInitialPromptAt(initialPromptTimestamp);
          guidedInitialPromptAtRef.current = initialPromptTimestamp;
        }
      }
    } catch (error) {
      emitGuidedFallbackTelemetry("start", error, { correlationId });
      resetGuidedRemoteSession();
      if (error instanceof CharterClientError) {
        orchestrator?.start();
        return;
      }
      console.error("Failed to start guided charter session", error);
      orchestrator?.start();
    }
  }, [
    appendAssistantMessage,
    emitGuidedCompletionTelemetry,
    emitGuidedFallbackTelemetry,
    isGuidedChatEnabled,
    processGuidedEvents,
    resetGuidedRemoteSession,
    setGuidedState,
  ]);

  const handleGuidedCommandChip = useCallback(
    async (command) => {
      const trimmed = typeof command === "string" ? command.trim() : "";
      if (!trimmed) {
        return;
      }

      const { isAssistantThinking: thinking, isStreaming, inputLocked } =
        chatStoreApi.getState();
      if (thinking || isStreaming || inputLocked) {
        return;
      }

      const previousDraft = chatStoreApi.getState().composerDraft;

      try {
        await submitChatTurn(trimmed, { source: "chat" });
      } finally {
        if (previousDraft) {
          chatActions.setComposerDraft(previousDraft);
        } else {
          chatActions.clearComposerDraft();
        }
      }
    },
    [submitChatTurn],
  );

  const handleVoiceTranscriptMessage = useCallback(
    async (rawText, { isFinal = true } = {}) => {
      const trimmed = typeof rawText === "string" ? rawText.trim() : "";
      if (!trimmed) return;

      if (!isFinal) {
        voiceActions.setStatus("transcribing");
        return;
      }

      const { isStreaming, isAssistantThinking } = chatStoreApi.getState();
      if (isStreaming || isAssistantThinking) {
        voiceActions.setStatus("idle");
        return;
      }

      const entry = {
        id: Date.now() + Math.random(),
        text: trimmed,
        timestamp: Date.now(),
      };
      const baseVoice = Array.isArray(voiceTranscriptsRef.current)
        ? voiceTranscriptsRef.current
        : [];
      const nextVoice = [...baseVoice, entry].slice(-20);
      voiceTranscriptsRef.current = nextVoice;
      voiceActions.setTranscripts(nextVoice);
      dispatch("PREVIEW_UPDATED", { source: "voice" });

      voiceActions.setStatus("transcribing");
      try {
        chatActions.pushUser(trimmed);
        messagesRef.current = chatStoreApi.getState().messages;

        const voiceResult = await runVoiceFieldExtraction({
          docType: previewDocType,
          messages: messagesRef.current,
          attachments: attachmentsRef.current,
          voice: nextVoice,
          seed: charterDraftRef.current ?? initialDraftRef.current ?? createBlankDraft(),
        });

        if (voiceResult?.ok && voiceResult.fields) {
          applyVoiceExtractionToDraft(voiceResult.fields);
        } else if (voiceResult?.reason === "empty") {
          pushToast({
            tone: "info",
            message: "Voice transcript captured—review and confirm in the preview.",
          });
        } else if (voiceResult?.reason && voiceResult.reason !== "skipped") {
          console.error("Voice field extraction failed", voiceResult);
          pushToast({
            tone: "error",
            message: "Unable to process the voice transcript. Please review and try again.",
          });
        }
      } finally {
        voiceActions.setStatus("idle");
      }
    },
    [
      applyVoiceExtractionToDraft,
      createBlankDraft,
      previewDocType,
      pushToast,
      runVoiceFieldExtraction,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.Cypress) {
      return undefined;
    }

    window.__simulateGuidedVoiceFinal = async (text, options = {}) => {
      await handleVoiceTranscriptMessage(text, options);
    };

    return () => {
      delete window.__simulateGuidedVoiceFinal;
    };
  }, [handleVoiceTranscriptMessage]);

  const handleSend = async () => {
    const text = composerDraft.trim();
    if (!text) return;
    if (isAssistantThinking || isAssistantStreaming) return;
    chatActions.clearComposerDraft();
    await submitChatTurn(text, { source: "composer" });
  };

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
              chatActions.setMessages((prev) => [
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
            chatActions.setMessages((prev) => [
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

          if (legacyAutoExtractionEnabled) {
            setExtractionSeed(Date.now());
          }

          try {
            await onFileAttached({
              attachments: updatedAttachments,
              messages,
              voice: voiceTranscripts,
              trigger: (overrides = {}) =>
                triggerExtraction({
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
      triggerExtraction,
      messages,
      legacyAutoExtractionEnabled,
      setAttachments,
      setFiles,
      setExtractionSeed,
      setIsUploadingAttachments,
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
        await triggerExtraction({
          docType: normalized,
          attachments,
          messages,
          voice: voiceTranscripts,
        });
      } catch (error) {
        console.error("triggerExtraction after confirm failed", error);
      }
    },
    [
      attachments,
      defaultDocType,
      triggerExtraction,
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
      if (legacyAutoExtractionEnabled) {
        setExtractionSeed(Date.now());
      }
    }
  };

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

  useEffect(() => {
    if (!intentOnlyExtractionEnabled) {
      return;
    }
    if (!pendingIntentExtraction) {
      return;
    }
    if (!pendingIntentExtraction.intent) {
      clearPendingIntentExtraction();
      return;
    }
    if (isUploadingAttachments) {
      return;
    }

    let canceled = false;

    const flushPendingIntent = async () => {
      const latestMessages = Array.isArray(messagesRef.current)
        ? messagesRef.current
        : [];
      const latestVoice = Array.isArray(voiceTranscriptsRef.current)
        ? voiceTranscriptsRef.current
        : [];

      const result = await triggerExtraction({
        intent: pendingIntentExtraction.intent,
        docType: "charter",
        messages: latestMessages,
        attachments,
        voice: latestVoice,
        reason: pendingIntentExtraction.reason || "intent-retry",
      });

      if (canceled) {
        return;
      }

      if (!result?.ok && result?.reason === "attachments-uploading") {
        return;
      }

      if (
        !result?.ok &&
        result?.reason &&
        result.reason !== "aborted" &&
        result.reason !== "idle"
      ) {
        pushToast({
          tone: "warning",
          message: "Charter extraction did not start. Please try again.",
        });
      }

      clearPendingIntentExtraction();
    };

    flushPendingIntent();

    return () => {
      canceled = true;
    };
  }, [
    attachments,
    intentOnlyExtractionEnabled,
    isUploadingAttachments,
    pendingIntentExtraction,
    triggerExtraction,
    clearPendingIntentExtraction,
    pushToast,
  ]);

  const handleComposerDragOver = (event) => {
    event.preventDefault();
  };

  return (
    <div
      data-testid="app-ready"
      className="min-h-screen w-full font-sans bg-gradient-to-br from-indigo-100 via-slate-100 to-sky-100 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100"
    >
      {/* Top Bar */}
      <header
        data-testid="app-header"
        className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/60 border-b border-white/40 dark:supports-[backdrop-filter]:bg-slate-900/60 dark:bg-slate-900/60 dark:border-slate-700/60"
      >
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
          <section
            className={
              chatIsOverlay
                ? "bottom-sheet floating-card"
                : shouldShowPreview
                  ? "lg:col-span-8"
                  : "lg:col-span-12"
            }
            data-testid="chat-panel"
            role={chatIsOverlay ? "complementary" : undefined}
            aria-label={chatIsOverlay ? "Chat assistant" : undefined}
          >
            <Panel
              title="Chat Assistant"
              right={
                <div className="flex items-center gap-2">
                  {isPreviewFocus && (
                    <button
                      type="button"
                      aria-pressed={chatOverlayPinned ? "true" : "false"}
                      aria-label={chatOverlayPinned ? "Dock chat" : "Pop out chat"}
                      onClick={() => setChatOverlayPinned((value) => !value)}
                      className="p-1.5 rounded-lg hover:bg-white/60 border border-white/50 dark:hover:bg-slate-700/60 dark:border-slate-600/60 dark:text-slate-200"
                    >
                      <span className="text-xs">{chatOverlayPinned ? "Dock" : "Pop out"}</span>
                    </button>
                  )}
                  <button className="p-1.5 rounded-lg hover:bg-white/60 border border-white/50 dark:hover:bg-slate-700/60 dark:border-slate-600/60 dark:text-slate-200">
                    <IconPlus className="h-4 w-4" />
                  </button>
                </div>
              }
              className={chatIsOverlay ? "h-full flex flex-col" : undefined}
            >
              <div
                className={`flex flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/60 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/40 ${
                  chatIsOverlay ? "flex-1 min-h-0" : "h-[480px]"
                }`}
              >
                {chatIsOverlay && (
                  <div className="md:hidden flex justify-center pt-2 pb-1">
                    <div className="h-1.5 w-12 rounded-full bg-slate-300/80 dark:bg-slate-600/80" />
                  </div>
                )}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3"
                >
                  {visibleMessages.map((m) => (
                    <ChatBubble
                      key={m.id}
                      role={m.role}
                      text={m.text}
                      hideEmptySections={hideEmptySections}
                    />
                  ))}
                </div>
                {assistantActivityStatus && (
                  <div className="px-4 pb-2">
                    <AssistantThinkingIndicator status={assistantActivityStatus} />
                  </div>
                )}
                <div className="border-t border-white/50 p-3 dark:border-slate-700/60">
                  {isGuidedChatEnabled && (
                    <div className="mb-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          data-testid="btn-start-charter"
                          onClick={handleStartGuidedCharter}
                          disabled={!canStartGuided}
                          className="rounded-lg border border-indigo-500 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                        >
                          {guidedState?.status === "complete" ? "Restart Charter" : "Start Charter"}
                        </button>
                        {isGuidedSessionActive && guidedCurrentField ? (
                          <span className="text-xs text-slate-500 dark:text-slate-300">
                            Working on: {guidedCurrentField.label}
                            {guidedCurrentField.question
                              ? ` — ${guidedCurrentField.question}`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                      {isGuidedSessionActive ? (
                        <div className="flex flex-wrap gap-2">
                          {[{
                            label: "Back",
                            command: "back",
                            testId: "chip-back",
                          }, {
                            label: "Skip",
                            command: "skip",
                            testId: "chip-skip",
                          }, {
                            label: "Review",
                            command: "review",
                            testId: "chip-review",
                          }].map((chip) => (
                            <button
                              key={chip.testId}
                              type="button"
                              data-testid={chip.testId}
                              onClick={() => handleGuidedCommandChip(chip.command)}
                              disabled={isAssistantThinking || isAssistantStreaming || isComposerLocked}
                              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-400/60 dark:bg-indigo-900/40 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {SHOULD_SHOW_CHARTER_WIZARD && <CharterFieldSession className="mb-3" />}
                  {SHOULD_SHOW_CHARTER_WIZARD && AUTO_EXTRACTION_ENABLED && (attachments.length > 0 || messages.length > 0) && (
                    <div className="mb-3">
                      <button
                        onClick={() => {
                          setManualExtractionTrigger(true);
                          // Track auto-fill button usage for analytics
                          if (typeof fetch === "function") {
                            fetch("/api/telemetry/event", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                event: "charter_auto_fill_invoked",
                                timestamp: Date.now(),
                                metadata: {
                                  attachmentCount: attachments.length,
                                  messageCount: messages.length,
                                },
                              }),
                            }).catch(() => {}); // Silently fail telemetry
                          }
                        }}
                        disabled={isExtracting || manualExtractionTrigger}
                        className="w-full rounded-lg border border-indigo-500 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                      >
                        {isExtracting ? "Auto-filling..." : "Auto-fill from uploaded scope"}
                      </button>
                    </div>
                  )}
                  <input type="file" multiple ref={fileInputRef} onChange={handleFilePick} className="hidden" />
                  <Composer
                    onSend={handleSend}
                    onUploadClick={() => fileInputRef.current?.click()}
                    onStartRecording={!realtimeEnabled ? startRecording : undefined}
                    onStopRecording={!realtimeEnabled ? stopRecording : undefined}
                    uploadDisabled={isUploadingAttachments}
                    realtimeEnabled={realtimeEnabled}
                    rtcState={rtcState}
                    startRealtime={startRealtime}
                    stopRealtime={stopRealtime}
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
                  {isPreviewSyncing ? (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-900/40 dark:text-indigo-200">
                      <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-inner animate-pulse" aria-hidden="true" />
                      Updating preview…
                    </div>
                  ) : null}
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
          {shouldShowPreview && (
            <aside
              className={previewPanelClassName}
              data-testid="preview-panel"
            >
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
                data-testid="preview-panel"
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
                    draft={previewDraftDocument}
                    locks={locks}
                    fieldStates={fieldStates}
                    highlightedPaths={highlightedPaths}
                    metadata={aiMetadataByPath}
                    isLoading={isCharterSyncInFlight}
                    isPending={hasPendingPreviewTurn}
                    onDraftChange={handleDraftChange}
                    onLockField={handleLockField}
                    manifest={activeDocManifest}
                    schema={activeDocSchema}
                  />
                )}
              </div>
              {isPreviewSyncing ? (
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-900/40 dark:text-indigo-200">
                  <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-inner animate-pulse" aria-hidden="true" />
                  Updating preview…
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
          )}
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
      {shouldRenderSyncDevtools && <SyncDevtools onReady={handleDevtoolsReady} />}
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

function Panel({ title, icon, right, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-white/60 bg-white/50 backdrop-blur shadow-sm p-3 md:p-4 dark:border-slate-700/60 dark:bg-slate-800/40 ${className}`}
    >
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

function AssistantThinkingIndicator({ status = "thinking" }) {
  const label = status === "streaming" ? "Assistant is responding…" : "Assistant is thinking…";
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-slate-600 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70 dark:text-slate-200">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400/80 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
        </span>
        <span className="font-medium">{label}</span>
      </div>
    </div>
  );
}

function ChatBubble({ role, text, hideEmptySections }) {
  const isUser = role === "user";
  const safeText = typeof text === "string" ? text : text != null ? String(text) : "";
  const sections = useAssistantFeedbackSections(!isUser ? safeText : null);
  const testId = isUser ? "user-message" : "assistant-message";
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} data-testid={testId}>
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
const DEFAULT_SYSTEM_PROMPT =
  "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff. Never recommend external blank-charter websites.";

async function callLLM(
  text,
  history = [],
  contextAttachments = [],
  options = {},
) {
  try {
    const normalizedHistory = Array.isArray(history)
      ? history.map((item) => ({ role: item.role, content: item.text || "" }))
      : [];
    const preparedAttachments = Array.isArray(contextAttachments)
      ? contextAttachments
          .map((attachment) => ({ name: attachment?.name, text: attachment?.text }))
          .filter((attachment) => attachment.name && attachment.text)
      : [];
    const overridePrompt =
      typeof options?.systemPrompt === "string" ? options.systemPrompt.trim() : "";
    const systemPrompt = overridePrompt || DEFAULT_SYSTEM_PROMPT;
    const systemMessage = systemPrompt
      ? {
          role: "system",
          content: systemPrompt,
        }
      : null;
    const payload = {
      messages: systemMessage
        ? [systemMessage, ...normalizedHistory.slice(-19)]
        : normalizedHistory.slice(-19),
      attachments: preparedAttachments,
    };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Unexpected response (${res.status}) from chat stream.`);
    }

    const data = await res.json();
    return data.reply || "";
  } catch (e) {
    const errorMessage = e?.message || "unknown";
    // If error message already starts with "Unexpected response", use it as-is
    if (errorMessage.startsWith("Unexpected response")) {
      return errorMessage;
    }
    return "OpenAI endpoint error: " + errorMessage;
  }
}


function normalizeRealtimeTranscriptEvent(rawPayload) {
  if (rawPayload == null) {
    return null;
  }

  let payload = rawPayload;

  if (typeof payload === "object" && payload !== null && "data" in payload && typeof payload.data === "string") {
    payload = payload.data;
  }

  if (payload instanceof ArrayBuffer) {
    try {
      payload = new TextDecoder().decode(payload);
    } catch (_) {
      return null;
    }
  }

  if (typeof Blob !== "undefined" && payload instanceof Blob) {
    return null;
  }

  let parsed = payload;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (_) {
        parsed = trimmed;
      }
    } else {
      parsed = trimmed;
    }
  }

  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) {
      return null;
    }
    return { text, isFinal: true };
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const pickText = (...candidates) => {
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      if (typeof candidate === "object") {
        const nestedText = pickText(candidate.text, candidate.transcript, candidate.content);
        if (nestedText) {
          return nestedText;
        }
      }
    }
    return "";
  };

  let text = pickText(parsed.text, parsed.transcript, parsed.segment, parsed.message);

  if (!text && Array.isArray(parsed.alternatives)) {
    for (const alternative of parsed.alternatives) {
      text = pickText(alternative);
      if (text) {
        break;
      }
    }
  }

  if (!text) {
    text = pickText(parsed.delta, parsed.content, parsed.result, parsed.response);
  }

  if (!text && Array.isArray(parsed.segments)) {
    for (const segment of parsed.segments) {
      text = pickText(segment);
      if (text) {
        break;
      }
    }
  }

  if (!text) {
    return null;
  }

  const boolHints = [
    parsed.final,
    parsed.isFinal,
    parsed.is_final,
    parsed.completed,
    parsed.complete,
    parsed.done,
    parsed?.delta?.final,
    parsed?.delta?.isFinal,
    parsed?.delta?.is_final,
  ];

  let isFinal;
  for (const hint of boolHints) {
    if (typeof hint === "boolean") {
      isFinal = hint;
      break;
    }
  }

  const statusHints = [
    parsed.type,
    parsed.event,
    parsed.status,
    parsed.state,
    parsed.stage,
    parsed.phase,
  ];

  for (const hint of statusHints) {
    if (typeof hint !== "string") continue;
    const lowered = hint.toLowerCase();
    if (lowered.includes("delta") || lowered.includes("partial") || lowered.includes("interim")) {
      isFinal = false;
      break;
    }
    if (lowered.includes("complete") || lowered.includes("final") || lowered.includes("done")) {
      isFinal = true;
      break;
    }
  }

  if (parsed.partial === true || parsed?.delta?.partial === true) {
    isFinal = false;
  }

  const streamId =
    typeof parsed.stream_id === "string"
      ? parsed.stream_id
      : typeof parsed.streamId === "string"
      ? parsed.streamId
      : typeof parsed.streamID === "string"
      ? parsed.streamID
      : typeof parsed.id === "string"
      ? parsed.id
      : undefined;

  return { text, isFinal: typeof isFinal === "boolean" ? isFinal : true, streamId };
}
