import { listTemplateManifests } from "../../templates/registry.js";
import { getDocTypeMetadata } from "./typesMetadata.js";
import { identity } from "./normalizers.js";
import {
  loadServerModule,
  loadDocTypeModule,
  resolveTemplateAssetPath,
} from "./moduleResolver.js";

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

async function buildDocTypeConfig(manifest) {
  const metadata = getDocTypeMetadata(manifest.id);
  const label = metadata?.label || manifest.label || manifest.id;

  const normalize = (await loadServerModule(manifest.normalize)) || identity;
  const preprocess = (await loadServerModule(manifest.preprocess)) || identity;

  const extractConfig = manifest.extract || {};
  const docxConfig = manifest.docx || {};
  const validationConfig = manifest.validation || {};
  const schemaConfig = manifest.schema || {};
  const formConfig = manifest.form || {};
  const metadataConfig = manifest.metadata || {};
  const reviewConfig = manifest.review || null;

  const config = {
    type: manifest.id,
    label,
    schemaId: manifest.schemaId || null,
    manifestPath: resolveTemplateAssetPath(manifest.manifestPath),
    templateVersion: manifest.version || null,
    extract: {
      fallbackPromptPath: resolveTemplateAssetPath(extractConfig.fallbackPrompt),
      promptCandidates: ensureArray(extractConfig.prompts)
        .map(resolveTemplateAssetPath)
        .filter(Boolean),
      metadataCandidates: ensureArray(extractConfig.metadata)
        .map(resolveTemplateAssetPath)
        .filter(Boolean),
    },
    validation: {
      schemaPath: resolveTemplateAssetPath(schemaConfig.path || validationConfig.schemaPath),
      fieldRulesPath: resolveTemplateAssetPath(
        schemaConfig.fieldRules || validationConfig.fieldRulesPath
      ),
      formSchemaPath: resolveTemplateAssetPath(
        formConfig.schema || validationConfig.formSchemaPath
      ),
      normalize,
      errorName: validationConfig.errorName || `${label.replace(/\s+/g, "")}ValidationError`,
      errorMessage:
        validationConfig.errorMessage || `${label} payload failed validation.`,
    },
    render: {
      preprocess,
      docxTemplatePath: resolveTemplateAssetPath(
        docxConfig.encoded || docxConfig.templateEncoded || docxConfig.template
      ),
      outputFilename:
        docxConfig.outputFilename || `${label.replace(/\s+/g, "_")}.docx`,
    },
    metadata: {
      ...metadataConfig,
      encodedDocxPath: resolveTemplateAssetPath(
        metadataConfig.encodedDocxPath || docxConfig.encoded
      ),
    },
    // Review configuration (for document feedback feature)
    review: reviewConfig
      ? {
          promptPath: resolveTemplateAssetPath(reviewConfig.prompt),
          rulesPath: resolveTemplateAssetPath(reviewConfig.rules),
          knowledgeCategories: ensureArray(reviewConfig.knowledgeCategories),
          dimensions: ensureArray(reviewConfig.dimensions),
          thresholds: reviewConfig.thresholds || {},
        }
      : null,
  };

  return config;
}

const manifests = listTemplateManifests();
const hydratedConfigs = await Promise.all(manifests.map(buildDocTypeConfig));
const REGISTRY = new Map(hydratedConfigs.map((config) => [config.type, config]));

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

export async function loadDocTypeNormalizer(docType) {
  return loadDocTypeModule(docType, "normalize");
}

export async function loadDocTypeRenderer(docType) {
  return loadDocTypeModule(docType, "renderer");
}

export default REGISTRY;
