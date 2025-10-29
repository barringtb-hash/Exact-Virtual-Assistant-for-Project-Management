import { config as docConfig, handleDocMakeLink } from "../doc/make-link.js";

const DOC_TYPE = "charter";
const DOWNLOAD_PATH = "/api/charter/download";

export const config = docConfig;

function withCharterContext(req) {
  const query = { ...(req.query || {}), docType: DOC_TYPE };
  let body = req.body;

  if (body && typeof body === "object" && !Array.isArray(body)) {
    body = { ...body, docType: DOC_TYPE };
  }

  return { ...req, query, body };
}

export default async function handler(req, res) {
  return handleDocMakeLink(withCharterContext(req), res, {
    downloadPath: DOWNLOAD_PATH,
  });
}
