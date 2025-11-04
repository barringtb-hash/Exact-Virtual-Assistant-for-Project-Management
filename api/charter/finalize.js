import fs from "node:fs/promises";

import {
  copyDocument,
  fetchDocument,
  shareDocument,
} from "../../lib/connectors/googleDrive.js";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { normalizeCharterFormSchema } from "../../src/lib/charter/formSchema.ts";
import { normalizeFormValues } from "../../src/lib/forms/validation.ts";
import { renderPdfBuffer } from "../export/pdf.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2mb",
    },
  },
  maxDuration: 60,
  memory: 1024,
};

const DOC_TYPE = "charter";
const charterConfig = getDocTypeConfig(DOC_TYPE);
let cachedSchema = null;

const REQUIRED_TEMPLATE_ENV = "GOOGLE_DRIVE_CHARTER_TEMPLATE_ID";
const REQUIRED_FOLDER_ENV = "GOOGLE_DRIVE_CHARTER_DESTINATION_FOLDER_ID";

async function loadCharterSchema() {
  if (cachedSchema) {
    return cachedSchema;
  }
  const formSchemaPath = charterConfig?.validation?.formSchemaPath;
  if (!formSchemaPath) {
    throw new Error("Charter form schema path is not configured.");
  }
  const raw = await fs.readFile(formSchemaPath, "utf8");
  const parsed = JSON.parse(raw);
  const schema = normalizeCharterFormSchema(parsed);
  cachedSchema = schema;
  return schema;
}

function parseRequestBody(body) {
  if (body == null) {
    return {};
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (error) {
      throw Object.assign(new Error("Request body must be valid JSON."), {
        statusCode: 400,
      });
    }
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  throw Object.assign(new Error("Request body must be a JSON object."), {
    statusCode: 400,
  });
}

function ensureConversationState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw Object.assign(new Error("Conversation state is required."), {
      statusCode: 400,
    });
  }
  const { documentType, fields, fieldOrder } = candidate;
  if (documentType !== DOC_TYPE) {
    throw Object.assign(new Error("Conversation is not a charter session."), {
      statusCode: 400,
    });
  }
  if (!fields || typeof fields !== "object") {
    throw Object.assign(new Error("Conversation fields are missing."), {
      statusCode: 400,
    });
  }
  if (!Array.isArray(fieldOrder)) {
    throw Object.assign(new Error("Conversation field order is missing."), {
      statusCode: 400,
    });
  }
  return candidate;
}

function pickEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(
      new Error(`Environment variable ${name} must be configured for charter finalization.`),
      {
        statusCode: 500,
      }
    );
  }
  return value.trim();
}

function valueIsPresent(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueIsPresent(item));
  }
  if (typeof value === "object") {
    return Object.values(value).some((entry) => valueIsPresent(entry));
  }
  return false;
}

function formatObjectEntry(childFields, entry) {
  if (!entry || typeof entry !== "object") {
    return "";
  }
  const parts = [];
  for (const child of childFields) {
    const raw = entry[child.id];
    if (!valueIsPresent(raw)) {
      continue;
    }
    const label = child.label || child.id;
    parts.push(`${label}: ${raw}`);
  }
  return parts.join(" • ");
}

function formatDisplayValue(field, value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (field.type === "object_list" && Array.isArray(field.fields)) {
      return value
        .map((entry) => formatObjectEntry(field.fields, entry))
        .filter(Boolean)
        .join("\n");
    }
    return value
      .map((item) => {
        if (item == null) {
          return "";
        }
        if (typeof item === "string") {
          const trimmed = item.trim();
          return trimmed ? `• ${trimmed}` : "";
        }
        if (typeof item === "object") {
          return `• ${formatObjectEntry(field.fields || [], item)}`;
        }
        return `• ${item}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    if (field.type === "object_list" && Array.isArray(field.fields)) {
      return formatObjectEntry(field.fields, value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function gatherRawValues(state, schema) {
  const rawValues = {};
  for (const field of schema.fields) {
    const fieldState = state.fields?.[field.id];
    if (!fieldState) {
      continue;
    }
    if (fieldState.status === "skipped" && fieldState.skippedReason === "hidden") {
      continue;
    }
    if (fieldState.normalizedValue !== undefined && fieldState.normalizedValue !== null) {
      rawValues[field.id] = fieldState.normalizedValue;
      continue;
    }
    if (valueIsPresent(fieldState.confirmedValue)) {
      rawValues[field.id] = fieldState.confirmedValue;
      continue;
    }
    if (valueIsPresent(fieldState.value)) {
      rawValues[field.id] = fieldState.value;
    }
  }
  return rawValues;
}

function buildChecklist(schema, state, normalized, issues) {
  const checklist = [];
  const replacements = {};

  for (const field of schema.fields) {
    const fieldState = state.fields?.[field.id];
    const normalizedValue =
      normalized[field.id] !== undefined
        ? normalized[field.id]
        : fieldState?.normalizedValue;

    const displayValue = formatDisplayValue(field, normalizedValue);
    const fieldIssues = issues[field.id] || [];
    const missingRequired =
      field.required &&
      !valueIsPresent(normalizedValue) &&
      (fieldState?.status !== "skipped" || fieldState?.skippedReason !== "hidden");

    if (normalizedValue !== undefined && normalizedValue !== null) {
      replacements[field.id] = displayValue;
    } else if (fieldState?.status === "skipped") {
      replacements[field.id] = "";
    }

    checklist.push({
      id: field.id,
      label: field.label,
      required: field.required,
      status: fieldState?.status ?? "pending",
      skippedReason: fieldState?.skippedReason ?? null,
      missingRequired,
      issues: fieldIssues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
        ruleText: issue.ruleText ?? null,
        details: issue.details ?? null,
      })),
      normalizedValue,
      displayValue,
    });
  }

  return { checklist, replacements };
}

function buildDocumentName(charter) {
  const title = valueIsPresent(charter.project_name)
    ? String(charter.project_name).trim()
    : "Project Charter";
  return `${title} – Charter`;
}

function buildPdfFilename(name) {
  const safeName = name.replace(/[\\/:*?"<>|]+/g, "-");
  return `${safeName || "project-charter"}.pdf`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const body = parseRequestBody(req.body);
    const conversation = ensureConversationState(
      body.conversation || body.state
    );
    const schema = await loadCharterSchema();

    const rawValues = gatherRawValues(conversation, schema);
    const { normalized, issues } = normalizeFormValues(schema, rawValues);
    const { checklist, replacements } = buildChecklist(
      schema,
      conversation,
      normalized,
      issues
    );

    const charter = { ...normalized };
    for (const field of schema.fields) {
      if (Object.prototype.hasOwnProperty.call(charter, field.id)) {
        continue;
      }
      if (field.type === "string_list" || field.type === "object_list") {
        charter[field.id] = [];
      } else {
        charter[field.id] = "";
      }
    }

    const templateDocumentId = pickEnv(REQUIRED_TEMPLATE_ENV);
    const destinationFolderId = pickEnv(REQUIRED_FOLDER_ENV);

    const documentName = buildDocumentName(charter);

    const copyResponse = await copyDocument({
      templateDocumentId,
      destinationFolderId,
      name: documentName,
      replacements,
      structuredReplacements: charter,
    });

    const documentId =
      copyResponse?.documentId || copyResponse?.id || copyResponse?.document_id || null;
    let documentUrl =
      copyResponse?.url || copyResponse?.webViewLink || copyResponse?.alternateLink || null;

    if (documentId) {
      const shareResponse = await shareDocument({ documentId });
      documentUrl =
        shareResponse?.url ||
        shareResponse?.webViewLink ||
        shareResponse?.alternateLink ||
        documentUrl ||
        null;

      const fetchResponse = await fetchDocument({ documentId });
      documentUrl =
        fetchResponse?.url ||
        fetchResponse?.webViewLink ||
        fetchResponse?.alternateLink ||
        documentUrl ||
        null;
    }

    let pdfInfo = null;
    const exportPdfRequested = body.exportPdf || body?.options?.exportPdf;
    const hasMissingRequiredFields = checklist.some(
      (item) => item.missingRequired
    );

    if (exportPdfRequested && !hasMissingRequiredFields) {
      const pdfBuffer = await renderPdfBuffer(charter);
      pdfInfo = {
        base64: pdfBuffer.toString("base64"),
        contentType: "application/pdf",
        filename: buildPdfFilename(documentName),
        size: pdfBuffer.length,
      };
    }

    res.status(200).json({
      ok: true,
      charter,
      checklist,
      document: {
        id: documentId,
        name: documentName,
        url: documentUrl,
      },
      pdf: pdfInfo,
    });
  } catch (error) {
    console.error("charter finalize failed", error);
    const statusCode = error?.statusCode || error?.status || 500;
    res
      .status(statusCode)
      .json({ error: error?.message || "Failed to finalize charter" });
  }
}
