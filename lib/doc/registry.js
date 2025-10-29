import path from "path";
import { fileURLToPath } from "url";

import { expandTemplateAliases as expandCharterTemplateAliases } from "../charter/template-aliases.js";
import { normalizeCharterPayload } from "../charter/normalize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", "..");
const templatesDir = path.join(projectRoot, "templates");
const identity = (value) => value;

const charterDocType = {
  type: "charter",
  label: "Charter",
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

const ddpDocType = {
  type: "ddp",
  label: "DDP",
  extract: {
    fallbackPromptPath: path.join(templatesDir, "ddp", "extract_prompt.txt"),
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
    schemaPath: path.join(templatesDir, "ddp", "ddp.schema.json"),
    fieldRulesPath: path.join(templatesDir, "ddp", "field_rules.json"),
    normalize: identity,
    errorName: "DDPValidationError",
    errorMessage: "DDP payload failed validation.",
  },
  render: {
    preprocess: identity,
    docxTemplatePath: path.join(templatesDir, "ddp", "ddp_tokens.docx.b64"),
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

