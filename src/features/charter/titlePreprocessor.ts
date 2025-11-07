export function getTitleCandidate(input: unknown, max: number = 80): string {
  if (typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const safeMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 80;

  const quoted = trimmed.match(/[“”"']([^“”"']{2,120})[“”"']/);
  if (quoted && quoted[1]) {
    return quoted[1].trim().slice(0, safeMax);
  }

  const named = trimmed.match(/\b(title\s+is|called|named)\s+([^.,\n]{2,120})/i);
  if (named && named[2]) {
    return named[2].trim().slice(0, safeMax);
  }

  const firstSentence = trimmed.split(/[.\n]/)[0]?.trim();
  if (firstSentence) {
    return firstSentence.slice(0, safeMax);
  }

  return trimmed.slice(0, safeMax);
}

export default getTitleCandidate;
