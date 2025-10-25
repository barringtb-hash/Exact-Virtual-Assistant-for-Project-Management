import { createRequire } from "module";

const require = createRequire(import.meta.url);

let encodingForModel = null;
let getEncoding = null;
let tiktokenLoadError = null;

try {
  const tiktoken = require("@dqbd/tiktoken");
  encodingForModel = tiktoken?.encoding_for_model ?? tiktoken?.encodingForModel ?? null;
  getEncoding = tiktoken?.get_encoding ?? tiktoken?.getEncoding ?? null;
} catch (err) {
  tiktokenLoadError = err;
}

const hasTiktoken =
  typeof encodingForModel === "function" && typeof getEncoding === "function";

const FALLBACK_ENCODER = {
  encode(value) {
    if (typeof value !== "string") return [];
    return Array.from(value);
  },
  decode(tokens) {
    if (!Array.isArray(tokens)) return "";
    return tokens.join("");
  },
};

const DEFAULT_MODEL = "gpt-4o-mini";
const FALLBACK_ENCODING = "cl100k_base";
const encoderCache = new Map();

const DEFAULT_TOKEN_DIVISOR = 4;

const textDecoder = typeof TextDecoder === "function" ? new TextDecoder("utf-8") : null;

function decodeToString(encoder, tokenSlice) {
  if (!encoder || typeof encoder.decode !== "function") {
    return "";
  }

  let result;
  try {
    result = encoder.decode(tokenSlice);
  } catch (err) {
    return "";
  }

  if (typeof result === "string") {
    return result;
  }

  if (result instanceof Uint8Array) {
    if (textDecoder) {
      try {
        return textDecoder.decode(result);
      } catch (err) {
        // fall through to other strategies
      }
    }
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      return Buffer.from(result).toString("utf8");
    }
  }

  if (typeof Buffer !== "undefined" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(result)) {
    return result.toString("utf8");
  }

  if (result == null) {
    return "";
  }

  return String(result);
}

function estimateWordTokens(word) {
  if (!word) return 0;
  const trimmed = String(word).trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / DEFAULT_TOKEN_DIVISOR));
}

function estimateTokens(text) {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed
    .split(/\s+/)
    .reduce((total, word) => total + estimateWordTokens(word), 0);
}

function fallbackChunkByTokens(text, tokensPerChunk, options = {}) {
  const limit = Number.isFinite(tokensPerChunk) && tokensPerChunk > 0 ? Math.floor(tokensPerChunk) : 1;
  const overlap = Number.isFinite(options.overlap) && options.overlap > 0 ? Math.floor(options.overlap) : 0;

  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let tokenCount = 0;

    while (end < words.length) {
      const tokenEstimate = estimateWordTokens(words[end]);
      if (end > start && tokenCount + tokenEstimate > limit) {
        break;
      }
      tokenCount += tokenEstimate;
      end += 1;
      if (tokenCount >= limit) {
        break;
      }
    }

    if (end === start) {
      tokenCount = estimateWordTokens(words[end]);
      end += 1;
    }

    const chunkWords = words.slice(start, end);
    const chunkText = chunkWords.join(" ").trim();
    if (chunkText) {
      chunks.push({ text: chunkText, tokenCount: tokenCount || estimateTokens(chunkText) || chunkWords.length });
    }

    if (end >= words.length) {
      break;
    }

    if (overlap > 0) {
      start = Math.max(0, end - overlap);
    } else {
      start = end;
    }
  }

  return chunks;
}

function resolveModel(model) {
  if (typeof model === "string" && model.trim()) {
    return model.trim();
  }
  return DEFAULT_MODEL;
}

export function getEncoder(model = DEFAULT_MODEL) {
  const resolvedModel = resolveModel(model);

  if (encoderCache.has(resolvedModel)) {
    return encoderCache.get(resolvedModel);
  }

  if (!hasTiktoken) {
    encoderCache.set(resolvedModel, FALLBACK_ENCODER);
    return FALLBACK_ENCODER;
  }

  let encoder = null;
  let lastError = null;

  try {
    encoder = encodingForModel(resolvedModel);
  } catch (err) {
    lastError = err;
  }

  if (!encoder && resolvedModel !== DEFAULT_MODEL) {
    try {
      encoder = encodingForModel(DEFAULT_MODEL);
    } catch (err) {
      lastError = err;
    }
  }

  if (!encoder) {
    try {
      encoder = getEncoding(FALLBACK_ENCODING);
    } catch (err) {
      lastError = err;
    }
  }

  if (!encoder) {
    const error = new Error(`Unable to load tokenizer for model "${resolvedModel}".`);
    if (lastError) {
      error.cause = lastError;
    }
    if (tiktokenLoadError) {
      error.cause = error.cause ?? tiktokenLoadError;
    }
    throw error;
  }

  encoderCache.set(resolvedModel, encoder);
  return encoder;
}

function collectStrings(value, bucket, seen = new Set()) {
  if (value == null) return;

  const valueType = typeof value;
  if (valueType === "string") {
    if (value.trim()) {
      bucket.push(value);
    }
    return;
  }

  if (valueType === "number" || valueType === "boolean") {
    bucket.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, bucket, seen);
    }
    return;
  }

  if (valueType === "object") {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Object.prototype.hasOwnProperty.call(value, "content")) {
      collectStrings(value.content, bucket, seen);
    }
    for (const key of Object.keys(value)) {
      if (key === "content" || key === "role") continue;
      collectStrings(value[key], bucket, seen);
    }
  }
}

export function countTokens(input, options = {}) {
  const strings = [];
  collectStrings(input, strings, new Set());
  if (!strings.length) {
    return 0;
  }
  if (!hasTiktoken) {
    return strings.reduce((sum, str) => sum + estimateTokens(str), 0);
  }
  const encoder = getEncoder(options.model ?? DEFAULT_MODEL);
  let total = 0;
  for (const str of strings) {
    total += encoder.encode(str).length;
  }
  return total;
}

export function chunkByTokens(text, tokensPerChunk, options = {}) {
  if (!hasTiktoken) {
    return fallbackChunkByTokens(text, tokensPerChunk, options);
  }
  const limit = Number.isFinite(tokensPerChunk) && tokensPerChunk > 0 ? Math.floor(tokensPerChunk) : 1;
  const overlap = Number.isFinite(options.overlap) && options.overlap > 0 ? Math.floor(options.overlap) : 0;
  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const encoder = getEncoder(options.model ?? DEFAULT_MODEL);
  const tokens = encoder.encode(trimmed);
  if (!tokens.length) return [];

  const chunks = [];
  let start = 0;

  while (start < tokens.length) {
    let end = Math.min(tokens.length, start + limit);
    if (end <= start) {
      end = Math.min(tokens.length, start + limit || start + 1);
    }

    const slice = tokens.slice(start, end);
    const raw = decodeToString(encoder, slice);
    const chunkText = typeof raw === "string" ? raw.trim() : "";
    if (chunkText) {
      chunks.push({
        text: chunkText,
        tokenCount: slice.length,
      });
    }

    if (end >= tokens.length) {
      break;
    }

    if (overlap > 0) {
      start = Math.max(0, end - overlap);
    } else {
      start = end;
    }
  }

  return chunks;
}

export default {
  getEncoder,
  countTokens,
  chunkByTokens,
};
