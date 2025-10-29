import { getDocTypeRegistry } from "../../lib/doc/registry.js";

const DEFAULT_DOC_TYPE = "charter";
const MIN_CONFIDENCE = 0;

function clampConfidence(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return MIN_CONFIDENCE;
  }

  if (value <= MIN_CONFIDENCE) {
    return MIN_CONFIDENCE;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

export function normalizeDocTypeSuggestion(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const type = typeof value.type === "string" && value.type.trim() ? value.type.trim() : null;
  if (!type) {
    return null;
  }

  const confidence = clampConfidence(value.confidence ?? MIN_CONFIDENCE);

  return { type, confidence };
}

export function areDocTypeSuggestionsEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  if (a.type !== b.type) {
    return false;
  }

  const diff = Math.abs((a.confidence ?? 0) - (b.confidence ?? 0));
  return diff < 1e-3;
}

export function isDocTypeConfirmed({
  selectedDocType,
  suggestion,
  threshold = 0.7,
  allowedTypes,
} = {}) {
  const normalizedSelected =
    typeof selectedDocType === "string" && selectedDocType.trim() ? selectedDocType.trim() : null;

  if (normalizedSelected) {
    if (!allowedTypes || allowedTypes.has(normalizedSelected)) {
      return true;
    }
  }

  const normalizedSuggestion = normalizeDocTypeSuggestion(suggestion);
  if (!normalizedSuggestion) {
    return false;
  }

  if (allowedTypes && !allowedTypes.has(normalizedSuggestion.type)) {
    return false;
  }

  return normalizedSuggestion.confidence >= threshold;
}

function toLowerArray(values) {
  return values
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter((value) => value);
}

function normalizeKeyword(keyword) {
  if (typeof keyword !== "string") {
    return "";
  }

  return keyword
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeywordMap() {
  const registry = getDocTypeRegistry();
  const entries = Array.from(registry.values());

  return entries.map((config) => {
    const type = config?.type || "";
    const label = typeof config?.label === "string" ? config.label : type;
    const keywords = new Set();

    if (type) {
      keywords.add(type.toLowerCase());
    }

    if (label) {
      const normalizedLabel = label.trim();
      if (normalizedLabel) {
        keywords.add(normalizedLabel.toLowerCase());
        keywords.add(normalizeKeyword(normalizedLabel));
      }
    }

    if (type === "charter") {
      keywords.add("project charter");
    }

    if (type === "ddp") {
      keywords.add("design and development plan");
      keywords.add("design & development plan".toLowerCase());
      keywords.add("development plan");
    }

    const filteredKeywords = Array.from(keywords).filter(Boolean);

    return { type, keywords: filteredKeywords };
  });
}

const ROUTER_KEYWORDS = buildKeywordMap();

function collectTextSegments(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const segments = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (typeof entry.text === "string") {
      segments.push(entry.text);
    }
    if (typeof entry.content === "string") {
      segments.push(entry.content);
    }
    if (typeof entry.name === "string") {
      segments.push(entry.name);
    }
  }

  return segments;
}

function collectAttachmentNames(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((item) => (typeof item?.name === "string" ? item.name : ""))
    .filter(Boolean);
}

function collectAttachmentTexts(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .filter(Boolean);
}

function computeScore({ keywords, attachmentsText, attachmentNames, messageText, voiceText }) {
  const keywordList = keywords.map((keyword) => normalizeKeyword(keyword)).filter(Boolean);
  if (keywordList.length === 0) {
    return 0;
  }

  const attachmentsTextSegments = attachmentsText.map(normalizeKeyword);
  const attachmentNameSegments = attachmentNames.map(normalizeKeyword);
  const messageSegments = messageText.map(normalizeKeyword);
  const voiceSegments = voiceText.map(normalizeKeyword);

  let score = 0;

  const checkSegments = (segments, weight) => {
    if (segments.length === 0) {
      return;
    }
    for (const segment of segments) {
      if (!segment) continue;
      for (const keyword of keywordList) {
        if (keyword && segment.includes(keyword)) {
          score += weight;
          break;
        }
      }
      if (score >= 1) {
        score = 1;
        return;
      }
    }
  };

  checkSegments(attachmentsTextSegments, 0.7);
  checkSegments(attachmentNameSegments, 0.25);
  checkSegments(messageSegments, 0.25);
  checkSegments(voiceSegments, 0.2);

  return Math.min(1, score);
}

export function suggestDocType({ messages = [], attachments = [], voice = [] } = {}) {
  const attachmentsText = toLowerArray(collectAttachmentTexts(attachments));
  const attachmentNames = toLowerArray(collectAttachmentNames(attachments));
  const messageSegments = toLowerArray(collectTextSegments(messages));
  const voiceSegments = toLowerArray(collectTextSegments(voice));

  let bestType = DEFAULT_DOC_TYPE;
  let bestConfidence = MIN_CONFIDENCE;

  for (const entry of ROUTER_KEYWORDS) {
    if (!entry?.type) continue;
    const confidence = computeScore({
      keywords: entry.keywords,
      attachmentsText,
      attachmentNames,
      messageText: messageSegments,
      voiceText: voiceSegments,
    });

    if (confidence > bestConfidence || (confidence === bestConfidence && entry.type === DEFAULT_DOC_TYPE)) {
      bestType = entry.type;
      bestConfidence = confidence;
    }
  }

  return normalizeDocTypeSuggestion({ type: bestType, confidence: bestConfidence }) ?? {
    type: DEFAULT_DOC_TYPE,
    confidence: MIN_CONFIDENCE,
  };
}

export default suggestDocType;
