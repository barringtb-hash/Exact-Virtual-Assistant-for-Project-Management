import { MissingDocAssetError, UnsupportedDocTypeError } from "../../lib/doc/errors.js";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { resolveDocType } from "../../lib/doc/utils.js";
import {
  ensureValidationAssets,
  validateDocument,
} from "../../lib/doc/validation.js";

function normalizeRequestBody(body) {
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  return {};
}

function extractDocumentPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const documentCandidate = body.document;
  if (documentCandidate && typeof documentCandidate === "object" && !Array.isArray(documentCandidate)) {
    return documentCandidate;
  }

  const charterCandidate = body.charter;
  if (charterCandidate && typeof charterCandidate === "object" && !Array.isArray(charterCandidate)) {
    return charterCandidate;
  }

  return body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = normalizeRequestBody(req.body);
    const docType = resolveDocType(req.query?.docType, body?.docType);
    const config = getDocTypeConfig(docType);
    if (!config) {
      throw new UnsupportedDocTypeError(docType);
    }

    await ensureValidationAssets(docType, config);

    const payload = extractDocumentPayload(body);
    const { isValid, errors, normalized } = await validateDocument(
      docType,
      config,
      payload
    );

    if (!isValid) {
      return res.status(400).json({ errors, normalized });
    }

    return res.status(200).json({ ok: true, normalized, docType: config.type });
  } catch (error) {
    if (error instanceof UnsupportedDocTypeError) {
      return res.status(400).json({
        error: `Validation is not available for "${error.docType}" documents.`,
      });
    }

    if (error instanceof MissingDocAssetError || error?.name === "DocAssetLoadError") {
      console.error("doc validate asset error", error);
      return res.status(error.statusCode || 500).json({
        error: error.message,
        docType: error.docType,
        assetType: error.assetType,
      });
    }

    console.error("doc validate failed", error);
    res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
