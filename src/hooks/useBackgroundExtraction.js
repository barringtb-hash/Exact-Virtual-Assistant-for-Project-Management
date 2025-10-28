import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 1000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const PARSE_FALLBACK_MESSAGE = "I couldn’t parse the last turn—keeping your entries.";

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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPathLocked(locks, segments) {
  if (!locks) return false;
  if (!Array.isArray(segments) || segments.length === 0) {
    return false;
  }

  let current = "";
  for (const segment of segments) {
    current = current ? `${current}.${segment}` : `${segment}`;
    if (locks[current]) {
      return true;
    }
  }

  return false;
}

function mergeRecursive(currentValue, nextValue, segments, locks) {
  if (isPathLocked(locks, segments)) {
    return currentValue;
  }

  if (Array.isArray(nextValue)) {
    const currentArray = Array.isArray(currentValue) ? currentValue : [];
    const result = currentArray.slice();

    for (let index = 0; index < nextValue.length; index += 1) {
      const childSegments = [...segments, String(index)];
      result[index] = mergeRecursive(currentArray[index], nextValue[index], childSegments, locks);
    }

    for (let index = result.length - 1; index >= nextValue.length; index -= 1) {
      const childSegments = [...segments, String(index)];
      if (!isPathLocked(locks, childSegments)) {
        result.splice(index, 1);
      }
    }

    return result;
  }

  if (isPlainObject(nextValue)) {
    const currentObject = isPlainObject(currentValue) ? currentValue : {};
    const result = { ...currentObject };

    for (const [key, value] of Object.entries(nextValue)) {
      const childSegments = [...segments, key];
      result[key] = mergeRecursive(currentObject[key], value, childSegments, locks);
    }

    return result;
  }

  if (typeof nextValue === "undefined") {
    return currentValue;
  }

  return nextValue;
}

export function mergeExtractedDraft(currentDraft, extractedDraft, locks = {}) {
  if (!isPlainObject(extractedDraft) && !Array.isArray(extractedDraft)) {
    return currentDraft ?? extractedDraft;
  }

  const baseDraft = isPlainObject(currentDraft) || Array.isArray(currentDraft) ? currentDraft : {};
  const merged = mergeRecursive(baseDraft, extractedDraft, [], locks);
  return merged;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => {
      const role = entry?.role === "assistant" ? "assistant" : "user";
      const text = typeof entry?.text === "string" ? entry.text : typeof entry?.content === "string" ? entry.content : "";
      const trimmed = text.trim();
      return {
        role,
        content: trimmed,
        text: trimmed,
      };
    })
    .filter((entry) => entry.text);
}

function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((item) => ({
      name: typeof item?.name === "string" ? item.name : undefined,
      mimeType: typeof item?.mimeType === "string" ? item.mimeType : undefined,
      text: typeof item?.text === "string" ? item.text : "",
    }))
    .filter((item) => item.text);
}

function sanitizeVoiceEvents(voice) {
  if (!Array.isArray(voice)) return [];
  return voice
    .map((event) => {
      const text = typeof event?.text === "string" ? event.text.trim() : "";
      if (!text) {
        return null;
      }
      const timestamp = typeof event?.timestamp === "number" ? event.timestamp : Date.now();
      return {
        id: event?.id ?? `${timestamp}`,
        text,
        timestamp,
      };
    })
    .filter(Boolean);
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

export default function useBackgroundExtraction({
  docType = "charter",
  messages = [],
  voice = [],
  attachments = [],
  seed,
  locks = {},
  getDraft,
  setDraft,
  normalize,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  isUploadingAttachments = false,
  onNotify,
} = {}) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState(null);

  const latestStateRef = useRef({
    docType,
    messages,
    voice,
    attachments,
    seed,
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
    latestStateRef.current = { docType, messages, voice, attachments, seed };
  }, [docType, messages, voice, attachments, seed]);

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

  const performExtraction = useCallback(async () => {
    if (isUploadingRef.current) {
      return { ok: false, reason: "attachments-uploading" };
    }

    const { docType: latestDocType, messages: latestMessages, voice: latestVoice, attachments: latestAttachments, seed: latestSeed } =
      latestStateRef.current;

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

    const payload = {
      docType: latestDocType,
      seed: latestSeed,
      messages: formattedMessages,
      voice: formattedVoice,
      attachments: formattedAttachments,
    };

    if (!payload.seed) {
      delete payload.seed;
    }

    const applyDraft = setDraftRef.current;

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await fetch("/api/charter/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            const message = errorPayload?.error || `Extraction failed with status ${response.status}`;
            const errorInstance = new Error(message);
            errorInstance.status = response.status;
            errorInstance.payload = errorPayload;
            if (attempt < MAX_ATTEMPTS && shouldRetryStatus(response.status)) {
              await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
              continue;
            }
            throw errorInstance;
          }

          const data = await response.json();
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Extractor returned unexpected payload");
          }

          if (Object.prototype.hasOwnProperty.call(data, "result")) {
            const notify = notifyRef.current;
            if (typeof notify === "function") {
              notify({ tone: "warning", message: PARSE_FALLBACK_MESSAGE });
            }
            if (isMountedRef.current) {
              setIsExtracting(false);
              setError(PARSE_FALLBACK_MESSAGE);
            }
            return { ok: false, reason: "parse-fallback", data };
          }

          const normalizeFn = normalizeRef.current;
          let normalizedDraft;
          try {
            normalizedDraft = normalizeFn(data);
          } catch (normalizeError) {
            console.error("Background extraction normalize error", normalizeError);
            normalizedDraft = data;
          }

          let finalDraft = normalizedDraft;
          if (typeof applyDraft === "function") {
            try {
              const maybeDraft = await applyDraft(normalizedDraft);
              if (typeof maybeDraft !== "undefined") {
                finalDraft = maybeDraft;
              }
            } catch (applyError) {
              console.error("Background extraction apply error", applyError);
            }
          }

          if (isMountedRef.current) {
            setIsExtracting(false);
            setError(null);
          }

          return { ok: true, draft: finalDraft };
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
    }
  }, []);

  const scheduleExtraction = useCallback(() => {
    clearPendingTimer();
    if (isUploadingRef.current) {
      return;
    }
    timerRef.current = setTimeout(() => {
      if (!isUploadingRef.current) {
        performExtraction();
      }
    }, Math.max(0, debounceMs || DEFAULT_DEBOUNCE_MS));
  }, [clearPendingTimer, debounceMs, performExtraction]);

  const syncNow = useCallback(() => {
    clearPendingTimer();
    return performExtraction();
  }, [clearPendingTimer, performExtraction]);

  useEffect(() => {
    const { messages: latestMessages, voice: latestVoice, attachments: latestAttachments } = latestStateRef.current;
    const shouldExtract =
      sanitizeAttachments(latestAttachments).length > 0 ||
      sanitizeVoiceEvents(latestVoice).length > 0 ||
      hasUserInput(latestMessages);

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
  ]);

  return { isExtracting, error, syncNow, clearError };
}
