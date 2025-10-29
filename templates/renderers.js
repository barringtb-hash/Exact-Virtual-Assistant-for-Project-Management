export class FormatNotImplementedError extends Error {
  constructor(format) {
    super(`${format.toUpperCase()} export is not yet implemented.`);
    this.name = "FormatNotImplementedError";
    this.format = format;
    this.statusCode = 501;
  }
}

export async function renderXlsxBuffer(docType, document) {
  throw new FormatNotImplementedError("xlsx");
}

export async function renderJsonBuffer(docType, document) {
  const sanitized =
    document && typeof document === "object" && !Array.isArray(document)
      ? document
      : {};
  const json = JSON.stringify(sanitized, null, 2);
  return Buffer.from(json, "utf8");
}
