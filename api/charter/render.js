import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  createCharterValidationError,
  validateCharterPayload,
} from "./validate.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
  memory: 1024,
};

let cachedTemplatePromise;

async function loadTemplateBuffer() {
  if (!cachedTemplatePromise) {
    cachedTemplatePromise = (async () => {
      const templatePath = path.join(
        process.cwd(),
        "templates",
        "project_charter_tokens.docx.b64"
      );
      const base64 = await fs.readFile(templatePath, "utf8");
      return Buffer.from(base64.trim(), "base64");
    })();
  }
  return cachedTemplatePromise;
}

export async function renderDocxBuffer(charter) {
  const { isValid, errors, normalized } = await validateCharterPayload(charter);
  if (!isValid) {
    throw createCharterValidationError(errors, normalized);
  }

  const content = await loadTemplateBuffer();
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.setData(normalized);
  doc.render();

  return doc.getZip().generate({ type: "nodebuffer" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const charter = parseCharterBody(req);
    let buf;
    try {
      buf = await renderDocxBuffer(charter);
    } catch (renderError) {
      const payload = formatDocRenderError(renderError);
      console.error("charter render validation failed", renderError);
      return res.status(400).json(payload);
    }
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=project_charter.docx"
    );
    res.status(200).send(buf);
  } catch (err) {
    if (err?.statusCode === 400 && err?.name === "InvalidCharterPayloadError") {
      console.error("invalid charter payload", err);
      return res.status(400).json(
        formatInvalidCharterPayload(err.message, err.details)
      );
    }
    console.error("charter render failed", err);
    res.status(500).json({
      error: {
        code: "charter_render_error",
        message: "Failed to render the charter template.",
        details: err?.message || "Unknown error",
      },
    });
  }
}

function parseCharterBody(req) {
  const body = req.body;
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    if (!body.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(body);
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

export function formatDocRenderError(error) {
  const details = [];
  const structuredErrors = [];
  const explanations = error?.properties?.errors;
  if (Array.isArray(explanations)) {
    for (const item of explanations) {
      const explanation = item?.properties?.explanation;
      if (typeof explanation === "string" && explanation.trim().length > 0) {
        const message = explanation.trim();
        details.push(message);
        structuredErrors.push({ message });
      }
    }
  }

  const validationErrors = Array.isArray(error?.validationErrors)
    ? error.validationErrors
    : [];

  for (const validationError of validationErrors) {
    if (!validationError || typeof validationError !== "object") {
      continue;
    }

    const instancePath =
      typeof validationError.instancePath === "string"
        ? validationError.instancePath
        : "";
    const message =
      typeof validationError.message === "string"
        ? validationError.message
        : "is invalid";

    structuredErrors.push({ ...validationError, instancePath, message });

    const displayPath = instancePath.replace(/^\//, "").replace(/\//g, " › ");
    const formatted = displayPath ? `${displayPath} – ${message}` : message;
    details.push(formatted);
  }

  if (details.length === 0 && typeof error?.message === "string") {
    details.push(error.message);
  }

  const normalizedErrors = structuredErrors.map((item) => ({
    instancePath:
      typeof item.instancePath === "string" ? item.instancePath : undefined,
    message: typeof item.message === "string" ? item.message : "is invalid",
    keyword: typeof item.keyword === "string" ? item.keyword : undefined,
    params:
      item.params && typeof item.params === "object"
        ? { ...item.params }
        : undefined,
    schemaPath:
      typeof item.schemaPath === "string" ? item.schemaPath : undefined,
  }));

  return {
    error: {
      code: "invalid_charter_payload",
      message: "Charter payload is invalid for the export template.",
      details: details.length > 1 ? details : details[0],
    },
    errors: normalizedErrors.length > 0 ? normalizedErrors : undefined,
  };
}

export function isDocRenderValidationError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (error.name === "CharterValidationError") {
    return true;
  }

  return Array.isArray(error?.properties?.errors);
}

function createInvalidCharterError(message, originalError) {
  const details = originalError?.message;
  const error = new Error(message);
  error.name = "InvalidCharterPayloadError";
  error.statusCode = 400;
  error.details = details;
  return error;
}

function formatInvalidCharterPayload(message, details) {
  return {
    error: {
      code: "invalid_charter_payload",
      message,
      details: details || undefined,
    },
  };
}
