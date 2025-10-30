import crypto from "crypto";

function toBuffer(value) {
  if (value == null) {
    return null;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return Buffer.from(trimmed, "utf8");
  }

  if (typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      return Buffer.from(serialized, "utf8");
    } catch {
      return null;
    }
  }

  return null;
}

function clampConfidence(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

export function normalizeDocumentDetection(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typeCandidate = value.type ?? value.docType ?? value.documentType;
  const type =
    typeof typeCandidate === "string" && typeCandidate.trim()
      ? typeCandidate.trim()
      : null;

  if (!type) {
    return null;
  }

  const confidenceCandidate =
    typeof value.confidence === "number"
      ? value.confidence
      : typeof value.score === "number"
      ? value.score
      : typeof value.confidence === "string"
      ? Number.parseFloat(value.confidence)
      : typeof value.score === "string"
      ? Number.parseFloat(value.score)
      : undefined;

  const confidence = clampConfidence(confidenceCandidate);

  return {
    type,
    confidence: confidence ?? null,
  };
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

export function resolveDetectionFromRequest(req = {}) {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const fromBody =
      body.docTypeDetection ??
      body.detectedDocType ??
      body.suggestedDocType ??
      body.suggestion ??
      null;
    const normalized = normalizeDocumentDetection(fromBody);
    if (normalized) {
      return normalized;
    }
  }

  const query = req.query || {};
  const getFirst = (value) => {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };

  const queryType = getFirst(query.detectedDocType ?? query.detectedType ?? null);
  const queryConfidence = getFirst(query.detectedConfidence ?? query.confidence ?? null);
  if (queryType) {
    const normalized = normalizeDocumentDetection({
      type: queryType,
      confidence: queryConfidence != null ? Number.parseFloat(queryConfidence) : undefined,
    });
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function computeDocumentHash(source) {
  const buffer = toBuffer(source);
  if (!buffer) {
    return null;
  }

  const hash = crypto.createHash("sha256");
  hash.update(buffer);
  return hash.digest("hex");
}

export function recordDocumentAudit(
  eventName,
  {
    hashSource = null,
    detection = null,
    finalType = null,
    templateVersion = null,
    intentSource = null,
    intentReason = null,
  } = {},
  { logger = console, analyticsHook = globalThis?.__analyticsHook__ } = {}
) {
  const fileHash = computeDocumentHash(hashSource);
  const normalizedDetection = normalizeDocumentDetection(detection);
  const normalizedIntentSource = normalizeIntentSource(intentSource);
  const normalizedIntentReason = normalizeIntentReason(intentReason);

  const payload = {
    event: eventName,
    fileHash,
    detectedType: normalizedDetection?.type ?? null,
    confidence:
      typeof normalizedDetection?.confidence === "number"
        ? normalizedDetection.confidence
        : normalizedDetection?.confidence ?? null,
    finalType: typeof finalType === "string" && finalType.trim() ? finalType.trim() : null,
    templateVersion:
      typeof templateVersion === "string" && templateVersion.trim()
        ? templateVersion.trim()
        : null,
    timestamp: new Date().toISOString(),
    intent_source: normalizedIntentSource,
    intent_reason: normalizedIntentReason,
  };

  if (logger && typeof logger.info === "function") {
    logger.info("[documents:audit]", payload);
  } else if (logger && typeof logger.log === "function") {
    logger.log("[documents:audit]", payload);
  }

  if (typeof analyticsHook === "function") {
    try {
      analyticsHook(eventName, payload);
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("[documents:audit] analytics hook failed", error);
      }
    }
  }

  return payload;
}

export default recordDocumentAudit;
