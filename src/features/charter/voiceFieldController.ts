import { docApi } from "../../lib/docApi.js";
import { FLAGS } from "../../config/flags.ts";
import { buildExtractionPayload } from "../../utils/extractAndPopulate.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface VoiceFieldExtractionRequest {
  docType?: string | null;
  messages?: unknown[];
  attachments?: unknown[];
  voice?: unknown[];
  seed?: unknown;
  signal?: AbortSignal;
}

export interface VoiceFieldExtractionResult {
  ok: boolean;
  fields?: Record<string, unknown>;
  raw?: unknown;
  reason?: string;
}

export async function runVoiceFieldExtraction({
  docType = "charter",
  messages = [],
  attachments = [],
  voice = [],
  seed,
  signal,
}: VoiceFieldExtractionRequest): Promise<VoiceFieldExtractionResult> {
  const payload = buildExtractionPayload({
    docType,
    messages,
    attachments,
    voice,
    seed,
  });

  if (payload?.skip) {
    const reason = typeof payload.reason === "string" ? payload.reason : "skipped";
    return { ok: false, reason };
  }

  const normalizedDocType = typeof docType === "string" && docType.trim() ? docType.trim() : "charter";

  const bases =
    FLAGS.CHARTER_GUIDED_BACKEND_ENABLED && normalizedDocType === "charter"
      ? ["/api/charter", "/api/documents", "/api/doc"]
      : undefined;

  try {
    const response = await docApi("extract", payload, { signal, bases });
    const candidate = isPlainObject(response?.draft)
      ? (response.draft as Record<string, unknown>)
      : isPlainObject(response)
      ? (response as Record<string, unknown>)
      : null;

    if (!candidate) {
      return { ok: false, raw: response, reason: "empty" };
    }

    const fields = isPlainObject(candidate.fields)
      ? (candidate.fields as Record<string, unknown>)
      : candidate;

    if (!isPlainObject(fields) || Object.keys(fields).length === 0) {
      return { ok: false, raw: response, reason: "empty" };
    }

    return { ok: true, fields, raw: response };
  } catch (error) {
    return {
      ok: false,
      raw: error,
      reason: error instanceof Error && error.message ? error.message : "error",
    };
  }
}
