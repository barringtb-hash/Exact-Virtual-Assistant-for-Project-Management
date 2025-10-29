import pdfMake from "pdfmake/build/pdfmake.js";
import * as pdfFonts from "pdfmake/build/vfs_fonts.js";
import {
  createCharterValidationError,
  validateCharterPayload,
} from "../charter/validate.js";
import { formatDocRenderError } from "../charter/render.js";
import { buildPdfDefinition } from "../../templates/pdf/charter.pdfdef.mjs";

function looksLikeVfsMap(candidate) {
  return (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    Object.keys(candidate).length > 0 &&
    !("pdfMake" in candidate) &&
    !("vfs" in candidate)
  );
}

const embeddedVfs =
  pdfFonts?.pdfMake?.vfs ??
  pdfFonts?.vfs ??
  pdfFonts?.default?.pdfMake?.vfs ??
  pdfFonts?.default?.vfs ??
  (looksLikeVfsMap(pdfFonts?.default) ? pdfFonts.default : undefined) ??
  (looksLikeVfsMap(pdfFonts) ? pdfFonts : undefined) ??
  {};

if (!embeddedVfs || Object.keys(embeddedVfs).length === 0) {
  throw new Error(
    "pdfmake fonts vfs not loaded: vfs_fonts export shape not recognized."
  );
}

pdfMake.vfs = embeddedVfs;

export const config = {
  maxDuration: 60,
  memory: 1024,
};

export async function renderPdfBuffer(charter) {
  const { isValid, errors, normalized } = await validateCharterPayload(charter);
  if (!isValid) {
    throw createCharterValidationError(errors, normalized);
  }

  const docDefinition = buildPdfDefinition(normalized);
  return createPdfBuffer(docDefinition);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const charter = parseCharterBody(req);
    const pdfBuffer = await renderPdfBuffer(charter);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=project_charter.pdf"
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

function createPdfBuffer(docDefinition) {
  return new Promise((resolve, reject) => {
    try {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      pdfDocGenerator.getBuffer((buffer) => {
        resolve(Buffer.from(buffer));
      });
    } catch (error) {
      reject(error);
    }
  });
}
