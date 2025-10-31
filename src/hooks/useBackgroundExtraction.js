import { useCallback, useEffect, useRef, useState } from "react";

import { beginDraftSync, completeDraftSync } from "../state/draftStore.js";

export { mergeExtractedDraft } from "../lib/preview/mergeIntoDraftWithLocks.js";

import {
  areDocTypeSuggestionsEqual,
  isDocTypeConfirmed,
  normalizeDocTypeSuggestion,
} from "../utils/docTypeRouter.js";
import { routerDetect } from "../utils/routerDetect.js";
import {
  extractAndPopulate as runDocumentExtraction,
  sanitizeAttachments,
  sanitizeMessages,
  sanitizeVoiceEvents,
  PARSE_FALLBACK_MESSAGE,
} from "../utils/extractAndPopulate.js";
import { isIntentOnlyExtractionEnabled } from "../../config/featureFlags.js";
import {
  getDocTypeSnapshot,
  setDocType,
  setSuggested,
} from "../state/docType.js";

const DEFAULT_DEBOUNCE_MS = 1000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const AUTO_ROUTER_THRESHOLD = 0.7;

const LEGACY_AUTO_EXTRACTION_ENABLED = !isIntentOnlyExtractionEnabled();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shouldRetryStatus(status) {
  if (typeof status !== "number") return false;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500 && status < 600;
}

function isTransientError(error) {
  if (!error || typeof error !== "object") return false;
  if (error.name === "AbortError") return false;
  if (error.name === "TypeError") return true;
  if (typeof error.status === "number") {
    return shouldRetryStatus(error.status);
  }
  return false;
}

function hasUserInput(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((entry) => {
    if ((entry?.role || "user") !== "user") {
      return false;
    }
    const text = typeof entry?.text === "string" ? entry.text : typeof entry?.content === "string" ? entry.content : "";
    return Boolean(text && text.trim());
  });
}

function sanitizeSuggestion(candidate) {
  return normalizeDocTypeSuggestion(candidate);
}

function shouldAutoExtractPayload({ messages, voice, attachments }) {
  return (
    sanitizeAttachments(attachments).length > 0 ||
    sanitizeVoiceEvents(voice).length > 0 ||
    hasUserInput(messages)
  );
}

async function modernOnFileAttached({
  attachments = [],
  messages = [],
  voice = [],
  autoThreshold = AUTO_ROUTER_THRESHOLD,
  requireConfirmation,
  router = routerDetect,
  store,
} = {}) {
  const {
    getSnapshot = getDocTypeSnapshot,
    setSuggested: applySuggested = setSuggested,
  } = store || {};

  const snapshot = typeof getSnapshot === "function" ? getSnapshot() : getDocTypeSnapshot();
  const {
    docRouterEnabled,
    supportedDocTypes = new Set(),
    selectedDocType,
    suggestedDocType,
    effectiveDocType,
  } = snapshot;

  const allowedTypes =
    supportedDocTypes instanceof Set
      ? supportedDocTypes
      : new Set(Array.isArray(supportedDocTypes) ? supportedDocTypes : []);

  const hasConfirmedDocType = !docRouterEnabled
    ? true
    : isDocTypeConfirmed({
        selectedDocType,
        suggestion: suggestedDocType,
        threshold: autoThreshold,
        allowedTypes,
      });

  const sanitizedMessages = sanitizeMessages(messages);
  const sanitizedAttachments = sanitizeAttachments(attachments);
  const sanitizedVoice = sanitizeVoiceEvents(voice);

  const buildResult = (overrides = {}) => ({
    ok: false,
    reason: "idle",
    attachments: sanitizedAttachments,
    messages: sanitizedMessages,
    voice: sanitizedVoice,
    ...overrides,
  });

  if (!docRouterEnabled || hasConfirmedDocType) {
    return buildResult({ reason: "idle", docType: effectiveDocType });
  }

  if (
    sanitizedAttachments.length === 0 &&
    sanitizedMessages.length === 0 &&
    sanitizedVoice.length === 0
  ) {
    if (typeof requireConfirmation === "function") {
      requireConfirmation();
    }
    return buildResult({ reason: "insufficient-context" });
  }

  let routedSuggestion = null;
  try {
    const detected = await router({
      messages: sanitizedMessages,
      attachments: sanitizedAttachments,
      voice: sanitizedVoice,
    });
    routedSuggestion = sanitizeSuggestion(detected);
  } catch (error) {
    console.error("Doc type router detection failed", error);
  }

  if (!routedSuggestion || !allowedTypes.has(routedSuggestion.type)) {
    if (typeof applySuggested === "function") {
      applySuggested(null);
    }
    if (typeof requireConfirmation === "function") {
      requireConfirmation();
    }
    return buildResult({ reason: "no-match" });
  }

  if (typeof applySuggested === "function") {
    applySuggested((previous) => {
      if (areDocTypeSuggestionsEqual(previous, routedSuggestion)) {
        return previous;
      }
      return routedSuggestion;
    });
  }

  if (routedSuggestion.confidence < autoThreshold) {
    if (typeof requireConfirmation === "function") {
      requireConfirmation(routedSuggestion);
    }
    return buildResult({
      reason: "needs-confirmation",
      suggestion: routedSuggestion,
    });
  }

  return {
    ok: true,
    suggestion: routedSuggestion,
    attachments: sanitizedAttachments,
    messages: sanitizedMessages,
    voice: sanitizedVoice,
  };
}

async function legacyOnFileAttached({
  attachments = [],
  messages = [],
  voice = [],
  trigger,
  autoThreshold = AUTO_ROUTER_THRESHOLD,
  requireConfirmation,
  router = routerDetect,
  store,
} = {}) {
  const {
    getSnapshot = getDocTypeSnapshot,
    setDocType: applyDocType = setDocType,
    setSuggested: applySuggested = setSuggested,
  } = store || {};

  const snapshot = typeof getSnapshot === "function" ? getSnapshot() : getDocTypeSnapshot();
  const {
    docRouterEnabled,
    supportedDocTypes = new Set(),
    selectedDocType,
    suggestedDocType,
    effectiveDocType,
  } = snapshot;

  const allowedTypes =
    supportedDocTypes instanceof Set
      ? supportedDocTypes
      : new Set(Array.isArray(supportedDocTypes) ? supportedDocTypes : []);

  const hasConfirmedDocType = !docRouterEnabled
    ? true
    : isDocTypeConfirmed({
        selectedDocType,
        suggestion: suggestedDocType,
        threshold: autoThreshold,
        allowedTypes,
      });

  if (!docRouterEnabled || hasConfirmedDocType) {
    if (typeof trigger === "function") {
      return trigger({
        docType: docRouterEnabled
          ? effectiveDocType
          : selectedDocType ?? effectiveDocType,
        attachments,
        messages,
        voice,
      });
    }
    return { ok: false, reason: "idle" };
  }

  const sanitizedMessages = sanitizeMessages(messages);
  const sanitizedAttachments = sanitizeAttachments(attachments);
  const sanitizedVoice = sanitizeVoiceEvents(voice);

  if (
    sanitizedAttachments.length === 0 &&
    sanitizedMessages.length === 0 &&
    sanitizedVoice.length === 0
  ) {
    if (typeof requireConfirmation === "function") {
      requireConfirmation();
    }
    return { ok: false, reason: "insufficient-context" };
  }

  let routedSuggestion = null;
  try {
    const detected = await router({
      messages: sanitizedMessages,
      attachments: sanitizedAttachments,
      voice: sanitizedVoice,
    });
    routedSuggestion = sanitizeSuggestion(detected);
  } catch (error) {
    console.error("Doc type router detection failed", error);
  }

  if (!routedSuggestion || !allowedTypes.has(routedSuggestion.type)) {
    if (typeof applySuggested === "function") {
      applySuggested(null);
    }
    if (typeof requireConfirmation === "function") {
      requireConfirmation();
    }
    return { ok: false, reason: "no-match" };
  }

  if (typeof applySuggested === "function") {
    applySuggested((previous) => {
      if (areDocTypeSuggestionsEqual(previous, routedSuggestion)) {
        return previous;
      }
      return routedSuggestion;
    });
  }

  if (routedSuggestion.confidence >= autoThreshold) {
    const appliedDocType =
      (typeof applyDocType === "function"
        ? applyDocType(routedSuggestion.type)
        : setDocType(routedSuggestion.type)) || routedSuggestion.type;
    if (typeof trigger === "function") {
      return trigger({
        docType: appliedDocType,
        attachments,
        messages,
        voice,
      });
    }
    return { ok: true, docType: appliedDocType, suggestion: routedSuggestion };
  }

  if (typeof requireConfirmation === "function") {
    requireConfirmation(routedSuggestion);
  }

  return { ok: false, reason: "needs-confirmation", suggestion: routedSuggestion };
}

export async function onFileAttached(options = {}) {
  if (!isIntentOnlyExtractionEnabled()) {
    return legacyOnFileAttached(options);
  }
  return modernOnFileAttached(options);
}

export default function useBackgroundExtraction({
  docType = "charter",
  selectedDocType,
  suggestedDocType,
  allowedDocTypes,
  messages = [],
  voice = [],
  attachments = [],
  seed,
  intent,
  intentSource,
  intentReason,
  locks = {},
  getDraft,
  setDraft,
  normalize,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  isUploadingAttachments = false,
  onNotify,
  docTypeRoutingEnabled = false,
  requireDocType,
} = {}) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [docTypeSuggestion, setDocTypeSuggestion] = useState(() => sanitizeSuggestion(suggestedDocType));
  const [autoExtractAllowed, setAutoExtractAllowed] = useState(true);

  const latestStateRef = useRef({
    docType,
    selectedDocType,
    suggestion: sanitizeSuggestion(suggestedDocType),
    messages,
    voice,
    attachments,
    seed,
    intent,
    intentSource,
    intentReason,
  });
  const locksRef = useRef(locks || {});
  const normalizeRef = useRef(typeof normalize === "function" ? normalize : (value) => value);
  const draftGetterRef = useRef(typeof getDraft === "function" ? getDraft : () => undefined);
  const setDraftRef = useRef(typeof setDraft === "function" ? setDraft : () => {});
  const timerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const notifyRef = useRef(typeof onNotify === "function" ? onNotify : null);
  const isUploadingRef = useRef(Boolean(isUploadingAttachments));
  const routerEnabledRef = useRef(Boolean(docTypeRoutingEnabled));
  const suggestionRef = useRef(docTypeSuggestion);
  const autoExtractAllowedRef = useRef(true);
  const allowedDocTypesRef = useRef(
    allowedDocTypes instanceof Set
      ? allowedDocTypes
      : new Set(Array.isArray(allowedDocTypes) ? allowedDocTypes : [])
  );
  const requireDocTypeRef = useRef(
    typeof requireDocType === "function" ? requireDocType : null
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    latestStateRef.current = {
      docType,
      selectedDocType,
      suggestion: suggestionRef.current,
      messages,
      voice,
      attachments,
      seed,
      intent,
      intentSource,
      intentReason,
    };
  }, [
    docType,
    selectedDocType,
    messages,
    voice,
    attachments,
    seed,
    intent,
    intentSource,
    intentReason,
    docTypeSuggestion,
  ]);

  useEffect(() => {
    locksRef.current = locks || {};
  }, [locks]);

  useEffect(() => {
    normalizeRef.current = typeof normalize === "function" ? normalize : (value) => value;
  }, [normalize]);

  useEffect(() => {
    draftGetterRef.current = typeof getDraft === "function" ? getDraft : () => undefined;
  }, [getDraft]);

  useEffect(() => {
    setDraftRef.current = typeof setDraft === "function" ? setDraft : () => {};
  }, [setDraft]);

  useEffect(() => {
    notifyRef.current = typeof onNotify === "function" ? onNotify : null;
  }, [onNotify]);

  useEffect(() => {
    isUploadingRef.current = Boolean(isUploadingAttachments);
  }, [isUploadingAttachments]);

  useEffect(() => {
    routerEnabledRef.current = Boolean(docTypeRoutingEnabled);
  }, [docTypeRoutingEnabled]);

  useEffect(() => {
    suggestionRef.current = docTypeSuggestion;
  }, [docTypeSuggestion]);

  useEffect(() => {
    allowedDocTypesRef.current =
      allowedDocTypes instanceof Set
        ? allowedDocTypes
        : new Set(Array.isArray(allowedDocTypes) ? allowedDocTypes : []);
  }, [allowedDocTypes]);

  useEffect(() => {
    requireDocTypeRef.current =
      typeof requireDocType === "function" ? requireDocType : null;
  }, [requireDocType]);

  useEffect(() => {
    autoExtractAllowedRef.current = Boolean(autoExtractAllowed);
  }, [autoExtractAllowed]);

  useEffect(() => {
    const normalized = sanitizeSuggestion(suggestedDocType);
    setDocTypeSuggestion((prev) => {
      if (areDocTypeSuggestionsEqual(prev, normalized)) {
        return prev;
      }
      return normalized;
    });
  }, [suggestedDocType]);

  useEffect(() => {
    if (!routerEnabledRef.current) {
      setAutoExtractAllowed(true);
      return;
    }

    const allowedTypes = allowedDocTypesRef.current;
    const canExtract = isDocTypeConfirmed({
      selectedDocType,
      suggestion: suggestionRef.current,
      threshold: AUTO_ROUTER_THRESHOLD,
      allowedTypes,
    });
    setAutoExtractAllowed(canExtract);
  }, [selectedDocType, docTypeSuggestion]);

  useEffect(() => {
    if (!selectedDocType) {
      return;
    }

    const normalized = sanitizeSuggestion({ type: selectedDocType, confidence: 1 });
    setDocTypeSuggestion((prev) => {
      if (areDocTypeSuggestionsEqual(prev, normalized)) {
        return prev;
      }
      return normalized;
    });
  }, [selectedDocType]);

  useEffect(() => {
    if (!routerEnabledRef.current) {
      return undefined;
    }

    if (selectedDocType) {
      return undefined;
    }

    let canceled = false;

    const runRouting = async () => {
      const { messages: latestMessages, voice: latestVoice, attachments: latestAttachments } = latestStateRef.current;
      const sanitizedMessages = sanitizeMessages(latestMessages);
      const sanitizedAttachments = sanitizeAttachments(latestAttachments);
      const sanitizedVoice = sanitizeVoiceEvents(latestVoice);

      try {
        const detected = await routerDetect({
          messages: sanitizedMessages,
          attachments: sanitizedAttachments,
          voice: sanitizedVoice,
        });
        const routed = sanitizeSuggestion(detected);
        if (canceled) {
          return;
        }

        setDocTypeSuggestion((prev) => {
          if (areDocTypeSuggestionsEqual(prev, routed)) {
            return prev;
          }
          if (
            routed &&
            routed.confidence < AUTO_ROUTER_THRESHOLD &&
            typeof requireDocTypeRef.current === "function"
          ) {
            try {
              requireDocTypeRef.current(routed);
            } catch (error) {
              console.error("Doc type modal trigger failed", error);
            }
          }
          return routed;
        });

        setSuggested((previous) => {
          if (areDocTypeSuggestionsEqual(previous, routed)) {
            return previous;
          }
          return routed;
        });
      } catch (error) {
        console.error("Doc type routing failed", error);
      }
    };

    runRouting();

    return () => {
      canceled = true;
    };
  }, [docTypeRoutingEnabled, selectedDocType, messages, attachments, voice, seed]);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    if (!isMountedRef.current) return;
    setError(null);
  }, []);

  const executeExtraction = useCallback(async (state) => {
    if (isUploadingRef.current) {
      return { ok: false, reason: "attachments-uploading" };
    }

    const baseState =
      state && typeof state === "object" ? state : latestStateRef.current || {};
    const {
      docType: latestDocType,
      messages: latestMessages,
      voice: latestVoice,
      attachments: latestAttachments,
      seed: latestSeed,
      intent: latestIntent,
      intentSource: latestIntentSource,
      intentReason: latestIntentReason,
    } = baseState;

    const formattedAttachments = sanitizeAttachments(latestAttachments);
    const formattedVoice = sanitizeVoiceEvents(latestVoice);
    const formattedMessages = sanitizeMessages(latestMessages);

    const shouldExtract =
      formattedAttachments.length > 0 || formattedVoice.length > 0 || hasUserInput(latestMessages);

    if (!shouldExtract) {
      if (isMountedRef.current) {
        setIsExtracting(false);
      }
      return { ok: false, reason: "idle" };
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isMountedRef.current) {
      setIsExtracting(true);
      setError(null);
    }
    let syncStarted = false;
    try {
      beginDraftSync();
      syncStarted = true;
    } catch (errorInstance) {
      console.error("Failed to mark draft sync start", errorInstance);
    }

    const normalizedDocType =
      typeof latestDocType === "string" && latestDocType.trim()
        ? latestDocType.trim()
        : "charter";

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await runDocumentExtraction({
            docType: normalizedDocType,
            messages: formattedMessages,
            attachments: formattedAttachments,
            voice: formattedVoice,
            seed: latestSeed,
            suggestion: suggestionRef.current,
            intent: latestIntent,
            intentSource: latestIntentSource,
            intentReason: latestIntentReason,
            normalize: normalizeRef.current,
            applyDraft: setDraftRef.current,
            signal: controller.signal,
            parseFallbackMessage: PARSE_FALLBACK_MESSAGE,
          });

          if (result?.reason === "parse-fallback") {
            const notify = notifyRef.current;
            if (typeof notify === "function") {
              notify({ tone: "warning", message: result.message || PARSE_FALLBACK_MESSAGE });
            }
            if (isMountedRef.current) {
              setIsExtracting(false);
              setError(result.message || PARSE_FALLBACK_MESSAGE);
            }
            return { ok: false, reason: "parse-fallback", data: result.data };
          }

          if (result?.ok) {
            if (isMountedRef.current) {
              setIsExtracting(false);
              setError(null);
            }
            return { ok: true, draft: result.draft };
          }

          throw new Error("Unexpected extraction outcome");
        } catch (errorInstance) {
          if (errorInstance?.name === "AbortError") {
            throw errorInstance;
          }

          const retryable = attempt < MAX_ATTEMPTS && isTransientError(errorInstance);
          if (retryable) {
            await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
            continue;
          }

          throw errorInstance;
        }
      }
    } catch (errorInstance) {
      if (errorInstance?.name === "AbortError") {
        return { ok: false, reason: "aborted" };
      }

      console.error("Background extraction error", errorInstance);
      const message = errorInstance?.message || "Unable to extract charter data";
      if (isMountedRef.current) {
        setIsExtracting(false);
        setError(message);
      }
      const notify = notifyRef.current;
      if (typeof notify === "function") {
        notify({ tone: "error", message });
      }
      return { ok: false, reason: "error", error: errorInstance };
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (syncStarted) {
        try {
          completeDraftSync();
        } catch (errorInstance) {
          console.error("Failed to mark draft sync completion", errorInstance);
        }
      }
    }
  }, []);

  const trigger = useCallback(
    async ({
      intent: overrideIntent,
      docType: overrideDocType,
      messages: overrideMessages,
      attachments: overrideAttachments,
      voice: overrideVoice,
      reason: _reason,
    } = {}) => {
      if (isUploadingRef.current) {
        return { ok: false, reason: "attachments-uploading" };
      }

      const base = latestStateRef.current || {};
      const normalizedDocType =
        typeof overrideDocType === "string" && overrideDocType.trim()
          ? overrideDocType.trim()
          : base.docType;

      const nextState = {
        ...base,
        intent: overrideIntent ?? base.intent,
        docType: normalizedDocType,
        messages: overrideMessages ?? base.messages,
        attachments: overrideAttachments ?? base.attachments,
        voice: overrideVoice ?? base.voice,
      };

      return executeExtraction(nextState);
    },
    [executeExtraction]
  );

  const scheduleExtraction = useCallback(() => {
    if (!LEGACY_AUTO_EXTRACTION_ENABLED) {
      return;
    }
    clearPendingTimer();
    if (!autoExtractAllowedRef.current || isUploadingRef.current) {
      return;
    }
    timerRef.current = setTimeout(() => {
      if (!isUploadingRef.current && autoExtractAllowedRef.current) {
        trigger({ reason: "legacy-auto" });
      }
    }, Math.max(0, debounceMs || DEFAULT_DEBOUNCE_MS));
  }, [clearPendingTimer, debounceMs, trigger]);

  useEffect(() => {
    if (!LEGACY_AUTO_EXTRACTION_ENABLED) {
      return undefined;
    }
    if (autoExtractAllowed) {
      return undefined;
    }

    clearPendingTimer();
    if (isMountedRef.current) {
      setIsExtracting(false);
    }
    return undefined;
  }, [autoExtractAllowed, clearPendingTimer]);

  useEffect(() => {
    if (!LEGACY_AUTO_EXTRACTION_ENABLED) {
      return undefined;
    }
    if (!autoExtractAllowed) {
      return undefined;
    }

    const { messages: latestMessages, voice: latestVoice, attachments: latestAttachments } = latestStateRef.current;
    const shouldExtract = shouldAutoExtractPayload({
      messages: latestMessages,
      voice: latestVoice,
      attachments: latestAttachments,
    });

    if (!shouldExtract) {
      clearPendingTimer();
      if (isMountedRef.current) {
        setIsExtracting(false);
      }
      return undefined;
    }

    if (isUploadingRef.current) {
      clearPendingTimer();
      return undefined;
    }

    scheduleExtraction();
    return clearPendingTimer;
  }, [
    messages,
    voice,
    attachments,
    seed,
    docType,
    debounceMs,
    isUploadingAttachments,
    scheduleExtraction,
    clearPendingTimer,
    autoExtractAllowed,
  ]);

  return {
    isExtracting,
    error,
    clearError,
    trigger,
  };
}
