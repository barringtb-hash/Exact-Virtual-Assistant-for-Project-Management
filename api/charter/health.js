import { formatErrorResponse, MethodNotAllowedError } from "../../server/utils/apiErrors.js";

export default async function handler(req, res) {
  const requestPath = req?.path || "/api/charter/health";

  if (req.method !== "GET") {
    const error = new MethodNotAllowedError(req.method, ["GET"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  const hasSecret = Boolean(process.env.FILES_LINK_SECRET);
  return res.status(200).json({ ok: true, hasSecret, timestamp: new Date().toISOString() });
}
