import docHandler, {
  config as docRenderConfig,
  renderDocxBufferForDocType,
} from "../documents/render.js";
import { expandTemplateAliases } from "../../server/charter/utils/template-aliases.js";
import { formatDocRenderError, isDocRenderValidationError } from "../../lib/doc/render.js";

const DOC_TYPE = "charter";

function withCharterContext(req) {
  const query = { ...(req.query || {}), docType: DOC_TYPE };
  return { ...req, query };
}

export const config = docRenderConfig;

export { expandTemplateAliases, formatDocRenderError, isDocRenderValidationError };

export async function renderDocxBuffer(charter) {
  return renderDocxBufferForDocType(DOC_TYPE, charter);
}

export default async function handler(req, res) {
  return docHandler(withCharterContext(req), res);
}

