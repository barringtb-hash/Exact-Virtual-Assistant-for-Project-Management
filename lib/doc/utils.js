import { UnsupportedDocTypeError } from "./errors.js";

export const DEFAULT_DOC_TYPE = "charter";

export function sanitizeDocType(value, fallback = DEFAULT_DOC_TYPE) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

export function resolveDocType(queryValue, bodyValue, fallback = DEFAULT_DOC_TYPE) {
  const fromQuery = sanitizeDocType(queryValue, null);
  if (fromQuery) {
    return fromQuery;
  }

  const fromBody = sanitizeDocType(bodyValue, null);
  if (fromBody) {
    return fromBody;
  }

  return fallback;
}

export function assertSupportedDocType(docType, registry) {
  if (!registry?.has(docType)) {
    throw new UnsupportedDocTypeError(docType);
  }
  return docType;
}

