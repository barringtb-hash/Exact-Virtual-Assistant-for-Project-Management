export class UnsupportedDocTypeError extends Error {
  constructor(docType) {
    const safeType = typeof docType === "string" && docType.trim() ? docType.trim() : "document";
    super(`Unsupported document type "${safeType}".`);
    this.name = "UnsupportedDocTypeError";
    this.statusCode = 400;
    this.docType = safeType;
  }
}

export class MissingDocAssetError extends Error {
  constructor(docType, assetType, candidates = []) {
    const safeType = typeof docType === "string" && docType.trim() ? docType.trim() : "document";
    const safeAsset = typeof assetType === "string" && assetType.trim() ? assetType.trim() : "asset";
    super(`Required ${safeAsset} for "${safeType}" documents is missing.`);
    this.name = "MissingDocAssetError";
    this.statusCode = 500;
    this.docType = safeType;
    this.assetType = safeAsset;
    this.candidates = Array.isArray(candidates) ? [...candidates] : [];
  }
}

export class InvalidDocPayloadError extends Error {
  constructor(docType, message, details) {
    const safeType = typeof docType === "string" && docType.trim() ? docType.trim() : "document";
    const safeMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : `Request body must be valid JSON matching the ${safeType} schema.`;
    super(safeMessage);
    this.name = "InvalidDocPayloadError";
    this.statusCode = 400;
    this.docType = safeType;
    if (details) {
      this.details = details;
    }
  }
}

