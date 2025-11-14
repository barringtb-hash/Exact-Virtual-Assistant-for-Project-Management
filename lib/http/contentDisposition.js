const DEFAULT_FALLBACK = "download";

function escapeQuotedString(value) {
  return value.replace(/(["\\])/g, "\\$1");
}

function encodeRfc5987Value(value) {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(7C|60|5E)/g, (match) => match.toUpperCase());
}

function normalizeFilenameCandidate(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.replace(/[\r\n]+/g, " ").trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed;
}

function toAsciiFallback(value) {
  return value
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code <= 0x7e ? char : "_";
    })
    .join("");
}

/**
 * Create a safe Content-Disposition header value for attachments that supports
 * non-ASCII filenames and guards against header injection.
 *
 * @param {string} filename - Preferred filename for the attachment.
 * @param {{ fallbackFilename?: string }} [options]
 * @returns {string}
 */
export function createAttachmentHeaderValue(
  filename,
  { fallbackFilename = DEFAULT_FALLBACK } = {}
) {
  const safeBase = normalizeFilenameCandidate(filename, fallbackFilename || DEFAULT_FALLBACK);
  const asciiFallback = toAsciiFallback(safeBase) || DEFAULT_FALLBACK;
  const quotedAscii = `"${escapeQuotedString(asciiFallback)}"`;

  const parts = ["attachment", `filename=${quotedAscii}`];

  const encoded = encodeRfc5987Value(safeBase);
  if (encoded && encoded !== asciiFallback) {
    parts.push(`filename*=UTF-8''${encoded}`);
  }

  return parts.join("; ");
}

