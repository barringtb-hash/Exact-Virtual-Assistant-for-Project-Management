import { renderDocxBufferForDocType } from "../../api/documents/render.js";
import { renderCharterPdfBuffer } from "./pdf.js";

const CHARTER_DOC_TYPE = "charter";

export async function assembleCharterDocxBuffer(charter) {
  return renderDocxBufferForDocType(CHARTER_DOC_TYPE, charter);
}

export async function assembleCharterPdfBuffer(charter) {
  return renderCharterPdfBuffer(charter);
}
