import finalizeCharter from "../../../server/charter/utils/finalizeCharter.js";
import { formatDocRenderError } from "../../documents/render.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
  maxDuration: 120,
  memory: 1536,
};

function parseRequestBody(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const parseError = new Error("Request body must be valid JSON");
      parseError.statusCode = 400;
      parseError.details = error?.message;
      throw parseError;
    }
  }
  if (typeof body === "object") {
    return body;
  }
  throw new Error("Request body must be a JSON object");
}

function ensureBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return fallback;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { id: charterIdParam } = req.query ?? {};
  const charterId = Array.isArray(charterIdParam)
    ? charterIdParam[0]
    : charterIdParam;

  if (!charterId || typeof charterId !== "string") {
    res.status(400).json({ error: "charter_id_required" });
    return;
  }

  try {
    const body = parseRequestBody(req.body);
    const charterPayload = body?.charter ?? body?.payload ?? body?.data;
    if (!charterPayload || typeof charterPayload !== "object") {
      res.status(400).json({ error: "charter_payload_required" });
      return;
    }

    const exportOptions = body?.export ?? {};
    const storageOptions = body?.storage ?? {};
    const metadata = body?.metadata ?? {};

    const resolvedExport = {
      docx: ensureBoolean(exportOptions.docx, true),
      pdf: ensureBoolean(exportOptions.pdf, true),
    };

    if (!resolvedExport.docx && !resolvedExport.pdf) {
      res.status(400).json({ error: "no_exports_requested" });
      return;
    }

    const result = await finalizeCharter({
      charterId,
      charter: charterPayload,
      exportOptions: resolvedExport,
      storageOptions,
      metadata,
      version: body?.version ?? null,
      createdBy: body?.createdBy ?? null,
    });

    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error?.statusCode === 400) {
      res.status(400).json({ error: error.message, details: error.details });
      return;
    }
    if (error?.name === "CharterValidationError") {
      res.status(error.statusCode || 400).json(formatDocRenderError(error));
      return;
    }
    if (error?.name === "DocValidationError") {
      res.status(error.statusCode || 400).json(formatDocRenderError(error));
      return;
    }
    if (error?.name === "InvalidDocPayloadError") {
      res.status(400).json({ error: error.message, details: error.details });
      return;
    }
    if (error?.status === 401 || error?.status === 403) {
      res.status(error.status || 403).json({
        error: "graph_access_denied",
        details: error.body ?? error.message,
      });
      return;
    }
    if (error?.status === 404) {
      res.status(404).json({
        error: "graph_resource_not_found",
        details: error.body ?? error.message,
      });
      return;
    }
    if (error?.body && typeof error.body === "string") {
      console.error("charter finalize graph error", error.body);
    } else {
      console.error("charter finalize failed", error);
    }
    res.status(500).json({ error: error?.message || "finalization_failed" });
  }
}
