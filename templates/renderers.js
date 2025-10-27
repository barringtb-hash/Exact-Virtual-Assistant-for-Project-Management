export class FormatNotImplementedError extends Error {
  constructor(format) {
    super(`${format.toUpperCase()} export is not yet implemented.`);
    this.name = "FormatNotImplementedError";
    this.format = format;
    this.statusCode = 501;
  }
}

export async function renderXlsxBuffer() {
  throw new FormatNotImplementedError("xlsx");
}

export async function renderJsonBuffer(charter) {
  const sanitized = charter && typeof charter === "object" ? charter : {};
  const json = JSON.stringify(sanitized, null, 2);
  return Buffer.from(json, "utf8");
}
