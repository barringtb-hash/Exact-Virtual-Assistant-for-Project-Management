const DEFAULT_PARSE_FALLBACK_MESSAGE = "I couldn’t parse the last turn—keeping your entries.";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => {
      const role = entry?.role === "assistant" ? "assistant" : "user";
      const text =
        typeof entry?.text === "string"
          ? entry.text
          : typeof entry?.content === "string"
          ? entry.content
          : "";
      const trimmed = text.trim();
      if (!trimmed) return null;
      return { role, content: trimmed, text: trimmed };
    })
    .filter(Boolean);
}

export function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((item) => {
      const text = typeof item?.text === "string" ? item.text : "";
      const trimmed = text.trim();
      if (!trimmed) return null;
      return {
        name: typeof item?.name === "string" ? item.name : undefined,
        mimeType: typeof item?.mimeType === "string" ? item.mimeType : undefined,
        text: trimmed,
      };
    })
    .filter(Boolean);
}

export function sanitizeVoiceEvents(voice) {
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

function normalizeDocType(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "charter";
}

function toDocTypeDetection(suggestion, suggestionConfidence) {
  if (suggestion && typeof suggestion === "object") {
    const type = typeof suggestion.type === "string" ? suggestion.type.trim() : "";
    const confidenceCandidate =
      typeof suggestion.confidence === "number" && !Number.isNaN(suggestion.confidence)
        ? suggestion.confidence
        : undefined;
    if (type) {
      return {
        type,
        confidence:
          typeof confidenceCandidate === "number"
            ? confidenceCandidate
            : typeof suggestionConfidence === "number"
            ? suggestionConfidence
            : undefined,
      };
    }
  }

  if (typeof suggestionConfidence === "number" && suggestionConfidence > 0) {
    return { confidence: suggestionConfidence };
  }

  return undefined;
}

export function buildExtractionPayload({
  docType,
  messages = [],
  attachments = [],
  voice = [],
  seed,
  suggestion,
  suggestionConfidence,
} = {}) {
  const normalizedDocType = normalizeDocType(docType);
  const payload = {
    docType: normalizedDocType,
    messages: sanitizeMessages(messages),
    attachments: sanitizeAttachments(attachments),
    voice: sanitizeVoiceEvents(voice),
  };

  if (seed && typeof seed === "object") {
    payload.seed = seed;
  }

  const detection = toDocTypeDetection(suggestion, suggestionConfidence);
  if (detection && detection.type) {
    payload.docTypeDetection = detection;
  }

  return payload;
}

function ensureFetch(fetchImpl) {
  return typeof fetchImpl === "function" ? fetchImpl : fetch;
}

async function requestExtraction({ docType, requestInit, fetchImpl }) {
  const fetchFn = ensureFetch(fetchImpl);
  const endpoint = `/api/documents/extract?docType=${encodeURIComponent(docType)}`;
  try {
    const response = await fetchFn(endpoint, requestInit);
    if (
      response &&
      !response.ok &&
      docType === "charter" &&
      (response.status === 404 || response.status === 405)
    ) {
      return fetchFn("/api/charter/extract", requestInit);
    }
    return response;
  } catch (networkError) {
    if (docType !== "charter") {
      throw networkError;
    }
    return fetchFn("/api/charter/extract", requestInit);
  }
}

function createExtractionError(message, { status, payload, code } = {}) {
  const error = new Error(message);
  if (typeof status === "number") {
    error.status = status;
  }
  if (payload !== undefined) {
    error.payload = payload;
  }
  if (code) {
    error.code = code;
  }
  return error;
}

export async function extractAndPopulate({
  docType,
  messages,
  attachments,
  voice,
  seed,
  suggestion,
  suggestionConfidence,
  normalize = (value) => value,
  applyDraft,
  signal,
  fetchImpl,
  parseFallbackMessage = DEFAULT_PARSE_FALLBACK_MESSAGE,
  onParseFallback,
  onUnsupportedDocType,
  onError,
} = {}) {
  const payload = buildExtractionPayload({
    docType,
    messages,
    attachments,
    voice,
    seed,
    suggestion,
    suggestionConfidence,
  });

  const normalizedDocType = payload.docType;

  const requestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  };

  const response = await requestExtraction({
    docType: normalizedDocType,
    requestInit,
    fetchImpl,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const isUnsupported = response.status === 400;
    const messageCandidate =
      typeof errorPayload?.error === "string" && errorPayload.error.trim()
        ? errorPayload.error.trim()
        : typeof errorPayload?.message === "string" && errorPayload.message.trim()
        ? errorPayload.message.trim()
        : isUnsupported
        ? `Extraction is not available for "${normalizedDocType}" documents.`
        : `Extraction failed with status ${response.status}`;
    const extractionError = createExtractionError(messageCandidate, {
      status: response.status,
      payload: errorPayload,
      code: isUnsupported ? "unsupported-doc-type" : undefined,
    });

    if (isUnsupported && typeof onUnsupportedDocType === "function") {
      try {
        onUnsupportedDocType(extractionError);
      } catch (callbackError) {
        console.error("extractAndPopulate onUnsupportedDocType callback failed", callbackError);
      }
    }

    if (typeof onError === "function") {
      try {
        onError(extractionError);
      } catch (callbackError) {
        console.error("extractAndPopulate onError callback failed", callbackError);
      }
    }

    throw extractionError;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    const extractionError = createExtractionError("Extractor returned unexpected payload", {
      status: response.status,
    });
    if (typeof onError === "function") {
      try {
        onError(extractionError);
      } catch (callbackError) {
        console.error("extractAndPopulate onError callback failed", callbackError);
      }
    }
    throw extractionError;
  }

  if (!isPlainObject(data)) {
    const extractionError = createExtractionError("Extractor returned unexpected payload", {
      status: response.status,
      payload: data,
    });
    if (typeof onError === "function") {
      try {
        onError(extractionError);
      } catch (callbackError) {
        console.error("extractAndPopulate onError callback failed", callbackError);
      }
    }
    throw extractionError;
  }

  if (Object.prototype.hasOwnProperty.call(data, "result")) {
    const outcome = {
      ok: false,
      reason: "parse-fallback",
      data,
      message: parseFallbackMessage,
    };

    if (typeof onParseFallback === "function") {
      try {
        onParseFallback(outcome);
      } catch (callbackError) {
        console.error("extractAndPopulate onParseFallback callback failed", callbackError);
      }
    }

    return outcome;
  }

  let normalizedDraft = data;
  try {
    normalizedDraft = normalize(data);
  } catch (normalizeError) {
    console.error("extractAndPopulate normalize error", normalizeError);
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
      console.error("extractAndPopulate applyDraft error", applyError);
      if (typeof onError === "function") {
        try {
          onError(applyError);
        } catch (callbackError) {
          console.error("extractAndPopulate onError callback failed", callbackError);
        }
      }
    }
  }

  return { ok: true, draft: finalDraft, data };
}

export const PARSE_FALLBACK_MESSAGE = DEFAULT_PARSE_FALLBACK_MESSAGE;

export default extractAndPopulate;
