import handler from "../doc/extract.js";

function withCharterContext(req) {
  const query = { ...(req.query || {}), docType: "charter" };
  return { ...req, query };
}

export default async function charterExtractHandler(req, res) {
  return handler(withCharterContext(req), res);
}

