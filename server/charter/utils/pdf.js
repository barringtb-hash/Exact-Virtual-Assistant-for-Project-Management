import pdfMake from "pdfmake/build/pdfmake.js";
import * as pdfFonts from "pdfmake/build/vfs_fonts.js";

import {
  createCharterValidationError,
  validateCharterPayload,
} from "../../../api/charter/validate.js";
import { buildPdfDefinition } from "../../../templates/pdf/charter.pdfdef.mjs";

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

export async function renderCharterPdfBuffer(charter) {
  const { isValid, errors, normalized } = await validateCharterPayload(charter);
  if (!isValid) {
    throw createCharterValidationError(errors, normalized);
  }

  const docDefinition = buildPdfDefinition(normalized);
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
