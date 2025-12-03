import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import {
  InvalidDocPayloadError,
  MissingDocAssetError,
  UnsupportedDocTypeError,
} from "../../lib/doc/errors.js";
import {
  formatDocRenderError,
  formatInvalidDocPayload,
  isDocRenderValidationError,
} from "../../lib/doc/render.js";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import { resolveDocType } from "../../lib/doc/utils.js";
import { createAttachmentHeaderValue } from "../../lib/http/contentDisposition.js";
import {
  createDocValidationError,
  ensureValidationAssets,
  validateDocument,
} from "../../lib/doc/validation.js";
import {
  recordDocumentAudit,
  resolveDetectionFromRequest,
} from "../../lib/doc/audit.js";
import {
  parseDocumentBody,
} from "../../server/documents/utils/index.js";
import {
  getTemplateBuffer,
  clearTemplateCache,
} from "../../server/utils/templatePreloader.js";

// Use the centralized template preloader instead of local cache
async function loadDocxTemplateBuffer(docType, config) {
  return getTemplateBuffer(docType, config);
}

function inspectUnresolvedTags(doc) {
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
    console.warn("failed to inspect rendered document", error);
  }

  return unresolvedTags;
}

export async function renderDocxBufferForDocType(docType, document) {
  const config = getDocTypeConfig(docType);
  if (!config) {
    throw new UnsupportedDocTypeError(docType);
  }

  await ensureValidationAssets(docType, config);

  const preprocess =
    typeof config?.render?.preprocess === "function"
      ? config.render.preprocess
      : (value) => value;

  const preparedInput = preprocess(document);
  const { isValid, errors, normalized } = await validateDocument(
    docType,
    config,
    preparedInput
  );

  if (!isValid) {
    throw createDocValidationError(docType, config, errors, normalized);
  }

  const templateBuffer = await loadDocxTemplateBuffer(docType, config);
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: {
      start: "{{",
      end: "}}",
    },
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.setData(normalized);
  doc.render();

  const unresolvedTags = inspectUnresolvedTags(doc);
  if (unresolvedTags.length > 0) {
    const validationErrors = unresolvedTags.map((tag) => ({
      instancePath: "",
      message: `Missing template value for tag "{{${tag}}}"`,
      keyword: "unresolved_template_tag",
      params: { tag },
    }));
    throw createDocValidationError(docType, config, validationErrors, normalized);
  }

  return doc.getZip().generate({ type: "nodebuffer" });
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

export function __clearDocTemplateCache() {
  clearTemplateCache();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const docType = resolveDocType(req.query?.docType, req.body?.docType);
    const config = getDocTypeConfig(docType);
    if (!config) {
      throw new UnsupportedDocTypeError(docType);
    }

    const detection = resolveDetectionFromRequest(req);

    const docLabel = config.label || docType;

    let document;
    try {
      document = parseDocumentBody(req.body, { docType, docLabel });
    } catch (parseError) {
      if (parseError instanceof InvalidDocPayloadError) {
        console.error("doc render invalid payload", parseError);
        const payload = formatInvalidDocPayload(parseError.message, parseError.details, {
          docType,
          docLabel,
        });
        return res.status(parseError.statusCode || 400).json(payload);
      }
      throw parseError;
    }

    let buffer;
    try {
      buffer = await renderDocxBufferForDocType(docType, document);
    } catch (renderError) {
      if (renderError instanceof MissingDocAssetError || renderError?.name === "DocAssetLoadError") {
        console.error("doc render asset error", renderError);
        return res.status(renderError.statusCode || 500).json({
          error: renderError.message,
          docType: renderError.docType,
          assetType: renderError.assetType,
        });
      }

      if (isDocRenderValidationError(renderError)) {
        if (typeof renderError.docType !== "string") {
          renderError.docType = docType;
        }
        if (typeof renderError.docLabel !== "string") {
          renderError.docLabel = docLabel;
        }

        const payload = formatDocRenderError(renderError);
        console.error("doc render validation failed", renderError);
        return res.status(renderError.statusCode || 400).json(payload);
      }

      throw renderError;
    }

    const filename = config?.render?.outputFilename || `${docType}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", createAttachmentHeaderValue(filename));
    res.status(200).send(buffer);

    recordDocumentAudit("documents.render", {
      hashSource: buffer,
      detection,
      finalType: config.type,
      templateVersion: config.templateVersion,
    });
  } catch (error) {
    if (error instanceof UnsupportedDocTypeError) {
      return res.status(400).json({
        error: `Rendering is not available for "${error.docType}" documents.`,
      });
    }

    if (error instanceof MissingDocAssetError || error?.name === "DocAssetLoadError") {
      console.error("doc render asset error", error);
      return res.status(error.statusCode || 500).json({
        error: error.message,
        docType: error.docType,
        assetType: error.assetType,
      });
    }

    console.error("doc render failed", error);
    res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
