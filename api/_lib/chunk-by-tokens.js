const DEFAULT_TOKEN_DIVISOR = 4;

function estimateWordTokens(word) {
  if (!word) return 0;
  const trimmed = word.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / DEFAULT_TOKEN_DIVISOR));
}

export function estimateTokens(text) {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed
    .split(/\s+/)
    .reduce((total, word) => total + estimateWordTokens(word), 0);
}

export function chunkByTokens(text, tokensPerChunk, options = {}) {
  const limit = Number.isFinite(tokensPerChunk) && tokensPerChunk > 0 ? tokensPerChunk : 1;
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
      // Single word longer than the limit – force progress.
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

export default chunkByTokens;
