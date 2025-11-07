import { docApi } from "../lib/docApi.js";
import { FLAGS } from "../config/flags.ts";
import { isIntentOnlyExtractionEnabled } from "../../config/featureFlags.js";

const DEFAULT_PARSE_FALLBACK_MESSAGE = "I couldn’t parse the last turn—keeping your entries.";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => {
      const role = typeof entry?.role === "string" ? entry.role.trim() : "user";
      if (role !== "user") {
        return null;
      }

      const text =
        typeof entry?.text === "string"
          ? entry.text
          : typeof entry?.content === "string"
          ? entry.content
          : "";
      const trimmed = text.trim();
      if (!trimmed) return null;
      return { role: "user", content: trimmed, text: trimmed };
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

function normalizeIntent(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "object") {
    return value;
  }

  return null;
}

function normalizeIntentSource(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const INTENT_REASON_MAX_LENGTH = 200;

function normalizeIntentReason(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= INTENT_REASON_MAX_LENGTH) {
    return trimmed;
  }

  return trimmed.slice(0, INTENT_REASON_MAX_LENGTH);
}

export function buildExtractionPayload({
  docType,
  messages = [],
  attachments = [],
  voice = [],
  seed,
  suggestion,
  suggestionConfidence,
  intent,
  intentSource,
  intentReason,
} = {}) {
  const normalizedDocType = normalizeDocType(docType);
  const sanitizedMessages = sanitizeMessages(messages);
  const sanitizedAttachments = sanitizeAttachments(attachments);
  const sanitizedVoice = sanitizeVoiceEvents(voice);

  const hasContext =
    sanitizedAttachments.length > 0 ||
    sanitizedVoice.length > 0 ||
    sanitizedMessages.length > 0;

  const intentOnlyExtractionEnabled = isIntentOnlyExtractionEnabled();
  const normalizedIntent = normalizeIntent(intent);
  const normalizedIntentSource = normalizeIntentSource(intentSource);
  const normalizedIntentReason = normalizeIntentReason(intentReason);

  const shouldDetectIntent =
    intentOnlyExtractionEnabled &&
    normalizedDocType === "charter" &&
    normalizedIntent === null;

  const hasIntentMetadata =
    normalizedIntentSource !== null || normalizedIntentReason !== null;

  if (shouldDetectIntent && !hasContext && !hasIntentMetadata) {
    return { skip: true, reason: "no_intent" };
  }

  const payload = {
    docType: normalizedDocType,
    messages: sanitizedMessages,
    attachments: sanitizedAttachments,
    voice: sanitizedVoice,
  };

  if (seed && typeof seed === "object") {
    payload.seed = seed;
  }

  const detection = toDocTypeDetection(suggestion, suggestionConfidence);
  if (detection && detection.type) {
    payload.docTypeDetection = detection;
  }

  if (intentOnlyExtractionEnabled) {
    if (normalizedIntent !== null) {
      payload.intent = normalizedIntent;
    }

    if (normalizedIntentSource) {
      payload.intentSource = normalizedIntentSource;
    }

    if (normalizedIntentReason) {
      payload.intentReason = normalizedIntentReason;
    }

    if (shouldDetectIntent) {
      payload.detect = true;
    }
  }

  return payload;
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
  intent,
  intentSource,
  intentReason,
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
    intent,
    intentSource,
    intentReason,
  });

  if (payload?.skip) {
    const skipReason = payload.reason || "skipped";
    return { ok: false, reason: "skipped", data: { status: "skipped", reason: skipReason } };
  }

  const normalizedDocType = payload.docType;

  const docApiOptions = { fetchImpl, signal };
  if (
    FLAGS.CHARTER_GUIDED_BACKEND_ENABLED &&
    normalizedDocType === "charter"
  ) {
    docApiOptions.bases = ["/api/charter", "/api/documents", "/api/doc"];
  }

  let data;
  try {
    data = await docApi("extract", payload, docApiOptions);
  } catch (error) {
    const status = error?.status;
    const errorPayload = error?.payload;
    const isUnsupported = status === 400 || error?.code === "unsupported-doc-type";
    const messageCandidate =
      typeof errorPayload?.error === "string" && errorPayload.error.trim()
        ? errorPayload.error.trim()
        : typeof errorPayload?.message === "string" && errorPayload.message.trim()
        ? errorPayload.message.trim()
        : typeof error?.message === "string" && error.message
        ? error.message
        : isUnsupported
        ? `Extraction is not available for "${normalizedDocType}" documents.`
        : status
        ? `Extraction failed with status ${status}`
        : "Extraction failed";

    const extractionError = createExtractionError(messageCandidate, {
      status,
      payload: errorPayload,
      code: isUnsupported ? "unsupported-doc-type" : error?.code,
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

  if (!isPlainObject(data)) {
    const extractionError = createExtractionError("Extractor returned unexpected payload", {
      status: undefined,
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

  if (data?.status === "skipped") {
    return { ok: false, reason: "skipped", data };
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
