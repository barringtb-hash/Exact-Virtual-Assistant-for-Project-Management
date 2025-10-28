import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  createCharterValidationError,
  validateCharterPayload,
} from "./validate.js";

const TEMPLATE_ALIAS_TO_SNAKE_CASE = {
  projectTitle: "project_name",
  projectName: "project_name",
  project_title: "project_name",
  title: "project_name",
  projectManager: "project_lead",
  projectLead: "project_lead",
  project_manager: "project_lead",
  manager: "project_lead",
  sponsorName: "sponsor",
  sponsor_name: "sponsor",
  projectSponsor: "sponsor",
  project_sponsor: "sponsor",
  startDate: "start_date",
  endDate: "end_date",
  visionStatement: "vision",
  vision_statement: "vision",
  problemStatement: "problem",
  projectProblem: "problem",
  problem_statement: "problem",
  project_problem: "problem",
  projectDescription: "description",
  project_description: "description",
  scopeIn: "scope_in",
  scopeOut: "scope_out",
  riskList: "risks",
  risk_list: "risks",
  risksList: "risks",
  assumptionList: "assumptions",
  assumption_list: "assumptions",
  assumptionsList: "assumptions",
  milestonesList: "milestones",
  milestones_list: "milestones",
  successMetrics: "success_metrics",
  metrics: "success_metrics",
  coreTeam: "core_team",
  systemOfMeasurement: "system_of_measurement",
};

export function expandTemplateAliases(charter) {
  if (!charter || typeof charter !== "object" || Array.isArray(charter)) {
    return charter;
  }

  const expanded = { ...charter };

  for (const [legacyKey, canonicalKey] of Object.entries(
    TEMPLATE_ALIAS_TO_SNAKE_CASE
  )) {
    if (
      Object.prototype.hasOwnProperty.call(charter, legacyKey) &&
      !Object.prototype.hasOwnProperty.call(expanded, canonicalKey)
    ) {
      expanded[canonicalKey] = charter[legacyKey];
    }
  }

  return expanded;
}

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
  // Temporary shim to support legacy payload keys until upstream callers migrate.
  const expandedCharter = expandTemplateAliases(charter);
  const { isValid, errors, normalized } = await validateCharterPayload(
    expandedCharter
  );
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

  const unresolvedTags = [];
  try {
    const docZip = doc.getZip();
    const documentFile =
      docZip && typeof docZip.file === "function"
        ? docZip.file("word/document.xml")
        : undefined;
    const documentXml =
      documentFile && typeof documentFile.asText === "function"
        ? documentFile.asText()
        : undefined;

    if (typeof documentXml === "string" && documentXml.includes("{{")) {
      const seen = new Set();
      const regex = /{{\s*([^{}]+?)\s*}}/g;
      let match;
      while ((match = regex.exec(documentXml)) !== null) {
        const tag = match[1]?.trim();
        if (tag && !seen.has(tag)) {
          seen.add(tag);
          unresolvedTags.push(tag);
        }
      }
    }
  } catch (error) {
    console.warn("failed to inspect rendered charter document", error);
  }

  if (unresolvedTags.length > 0) {
    const validationErrors = unresolvedTags.map((tag) => ({
      instancePath: "",
      message: `Missing template value for tag "{{${tag}}}"`,
      keyword: "unresolved_template_tag",
      params: { tag },
    }));
    throw createCharterValidationError(validationErrors, normalized);
  }

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
