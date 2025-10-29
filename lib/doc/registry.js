import path from "path";
import { fileURLToPath } from "url";

import { expandTemplateAliases as expandCharterTemplateAliases } from "../charter/template-aliases.js";
import { normalizeCharterPayload } from "../charter/normalize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", "..");
const templatesDir = path.join(projectRoot, "templates");

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

const REGISTRY = new Map([[charterDocType.type, charterDocType]]);

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

