import docHandler, {
  config as docConfig,
  getFormatHandlersForDocType,
  listSupportedFormats,
} from "../documents/download.js";

const DOC_TYPE = "charter";

export const config = docConfig;
export const formatHandlers = getFormatHandlersForDocType(DOC_TYPE);
export const supportedFormats = listSupportedFormats();

function withCharterContext(req) {
  const query = { ...(req.query || {}), docType: DOC_TYPE };
  return { ...req, query };
}

export default async function handler(req, res) {
  return docHandler(withCharterContext(req), res);
}
