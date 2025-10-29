import path from "path";
import { fileURLToPath } from "url";

import { expandTemplateAliases as expandCharterTemplateAliases } from "../charter/template-aliases.js";
import { normalizeCharterPayload } from "../charter/normalize.js";
import { getDocTypeMetadata } from "./typesMetadata.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", "..");
const templatesDir = path.join(projectRoot, "templates");
const identity = (value) => value;

const normalizeGenericDocument = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const charterMetadata = getDocTypeMetadata("charter");
const charterDocType = {
  type: "charter",
  label: charterMetadata?.label ?? "Charter",
  extract: {
    fallbackPromptPath: path.join(templatesDir, "extract_prompt.txt"),
    promptCandidates: [
      path.join(templatesDir, "doc-types", "charter", "extract_prompt.txt"),
      path.join(templatesDir, "extract_prompt.charter.txt"),
    ],
    metadataCandidates: [
      path.join(templatesDir, "doc-types", "charter", "metadata.json"),
      path.join(templatesDir, "doc-types", "charter", "metadata.txt"),
      path.join(templatesDir, "extract_metadata.charter.json"),
      path.join(templatesDir, "extract_metadata.charter.txt"),
    ],
  },
  validation: {
    schemaPath: path.join(templatesDir, "charter.schema.json"),
    fieldRulesPath: path.join(templatesDir, "field_rules.json"),
    normalize: normalizeCharterPayload,
    errorName: "CharterValidationError",
    errorMessage: "Charter payload failed validation.",
  },
  render: {
    preprocess: expandCharterTemplateAliases,
    docxTemplatePath: path.join(
      templatesDir,
      "project_charter_tokens.docx.b64"
    ),
    outputFilename: "project_charter.docx",
  },
};

const ddpMetadata = getDocTypeMetadata("ddp");
const ddpDocType = {
  type: "ddp",
  label: ddpMetadata?.label ?? "Design & Development Plan",
  extract: {
    fallbackPromptPath: path.join(templatesDir, "extract_prompt.txt"),
    promptCandidates: [
      path.join(templatesDir, "doc-types", "ddp", "extract_prompt.txt"),
      path.join(templatesDir, "extract_prompt.ddp.txt"),
    ],
    metadataCandidates: [
      path.join(templatesDir, "doc-types", "ddp", "metadata.json"),
      path.join(templatesDir, "doc-types", "ddp", "metadata.txt"),
      path.join(templatesDir, "extract_metadata.ddp.json"),
      path.join(templatesDir, "extract_metadata.ddp.txt"),
    ],
  },
  validation: {
    schemaPath: path.join(templatesDir, "doc-types", "ddp", "schema.json"),
    fieldRulesPath: path.join(templatesDir, "doc-types", "ddp", "field_rules.json"),
    normalize: normalizeGenericDocument,
    errorName: "DDPValidationError",
    errorMessage: "DDP payload failed validation.",
  },
  render: {
    preprocess: normalizeGenericDocument,
    docxTemplatePath: path.join(templatesDir, "doc-types", "ddp", "template.docx.b64"),
    outputFilename: "design_development_plan.docx",
  },
};

const REGISTRY = new Map([
  [charterDocType.type, charterDocType],
  [ddpDocType.type, ddpDocType],
]);

export function getDocTypeConfig(docType) {
  if (!docType) {
    return undefined;
  }
  return REGISTRY.get(docType);
}

export function getDocTypeRegistry() {
  return REGISTRY;
}

export function listSupportedDocTypes() {
  return Array.from(REGISTRY.keys());
}

export default REGISTRY;

