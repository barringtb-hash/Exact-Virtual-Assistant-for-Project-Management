import { formatDocRenderError } from "../charter/render.js";
import { renderCharterPdfBuffer } from "../../server/charter/utils/pdf.js";
import { createAttachmentHeaderValue } from "../../lib/http/contentDisposition.js";

// Backwards-compatible export for existing callers.
export const renderPdfBuffer = renderCharterPdfBuffer;

export const config = {
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const charter = parseCharterBody(req);
    const pdfBuffer = await renderCharterPdfBuffer(charter);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      createAttachmentHeaderValue("project_charter.pdf")
    );
    res.status(200).send(pdfBuffer);
  } catch (error) {
    if (error?.name === "CharterValidationError" && error?.statusCode === 400) {
      console.error("invalid charter payload for pdf", error);
      res.status(400).json(formatDocRenderError(error));
      return;
    }

    if (
      error?.name === "InvalidCharterPayloadError" &&
      error?.statusCode === 400
    ) {
      console.error("invalid charter payload for pdf", error);
      res.status(400).json({
        error: error.message,
        details: error.details || undefined,
      });
      return;
    }

    console.error("failed to export charter pdf", error);
    res.status(500).json({ error: "Failed to generate charter PDF" });
}
}

function parseCharterBody(req) {
  const body = req.body;
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
      throw new Error("Parsed value is not a JSON object.");
    } catch (error) {
      throw createInvalidCharterError(
        "Request body must be valid JSON matching the charter schema.",
        error
      );
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  throw createInvalidCharterError("Request body must be a JSON object.");
}

function createInvalidCharterError(message, originalError) {
  const error = new Error(message);
  error.name = "InvalidCharterPayloadError";
  error.statusCode = 400;
  error.details = originalError?.message;
  return error;
}

// Legacy helper retained for backward compatibility. The implementation now
// lives in lib/charter/pdf.js so the export API can reuse the same rendering
// pipeline as the finalize workflow.
