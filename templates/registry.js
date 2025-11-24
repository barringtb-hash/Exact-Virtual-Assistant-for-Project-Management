import { createBlankCharter } from "../server/charter/utils/normalize.js";

export function createModuleReference(
  moduleId,
  { exportName = null, fallbacks = [], defaultExport = true } = {}
) {
  if (!moduleId || typeof moduleId !== "string") {
    return null;
  }

  const normalizedFallbacks = Array.isArray(fallbacks) ? fallbacks.filter(Boolean) : [];

  return {
    moduleId,
    exportName: typeof exportName === "string" && exportName.trim() ? exportName.trim() : null,
    fallbacks: normalizedFallbacks,
    defaultExport: Boolean(defaultExport),
  };
}

function createDocTypeManifest({
  id,
  label,
  version,
  schemaId,
  manifestPath,
  schema,
  form,
  extract,
  docx,
  metadata,
  normalize,
  preprocess,
  renderer,
  validation,
  enabled = true,
  notes,
  blank,
}) {
  return {
    id,
    label,
    version,
    schemaId,
    manifestPath,
    schema,
    form,
    extract,
    docx,
    metadata,
    normalize,
    preprocess,
    renderer,
    validation,
    enabled,
    notes,
    blank,
  };
}

function buildTemplateRegistry() {
  return {
    charter: createDocTypeManifest({
    id: "charter",
    label: "Charter",
    version: "2024.10",
    schemaId: "charter",
    manifestPath: "charter/manifest.json",
    schema: {
      path: "charter/schema.json",
      fieldRules: "field_rules.json",
    },
    form: {
      schema: "charter/formSchema.json",
    },
    extract: {
      fallbackPrompt: "extract_prompt.txt",
      prompts: [
        "doc-types/charter/extract_prompt.txt",
        "extract_prompt.charter.txt",
      ],
      metadata: [
        "doc-types/charter/metadata.json",
        "doc-types/charter/metadata.txt",
        "extract_metadata.charter.json",
        "extract_metadata.charter.txt",
      ],
    },
    docx: {
      template: "project_charter_tokens.docx",
      encoded: "project_charter_tokens.docx.b64",
      outputFilename: "project_charter.docx",
    },
    metadata: {
      encodedDocxPath: "project_charter_tokens.docx.b64",
    },
    normalize: createModuleReference("server/charter/utils/normalize.js", {
      exportName: "normalizeCharterPayload",
      fallbacks: ["default"],
    }),
    preprocess: createModuleReference("server/charter/utils/template-aliases.js", {
      exportName: "expandTemplateAliases",
    }),
    renderer: createModuleReference("templates/renderers.js", {
      exportName: "renderJsonBuffer",
    }),
    validation: {
      errorName: "CharterValidationError",
      errorMessage: "Charter payload failed validation.",
    },
    blank: () => createBlankCharter(),
  }),
    ddp: createDocTypeManifest({
    id: "ddp",
    label: "Design & Development Plan",
    version: "2024.10",
    schemaId: "ddp",
    manifestPath: "ddp/manifest.json",
    schema: {
      path: "doc-types/ddp/schema.json",
      fieldRules: "doc-types/ddp/field_rules.json",
    },
    form: null,
    extract: {
      fallbackPrompt: "extract_prompt.txt",
      prompts: [
        "doc-types/ddp/extract_prompt.txt",
        "extract_prompt.ddp.txt",
      ],
      metadata: [
        "doc-types/ddp/metadata.json",
        "doc-types/ddp/metadata.txt",
        "extract_metadata.ddp.json",
        "extract_metadata.ddp.txt",
      ],
    },
    docx: {
      template: null,
      encoded: "doc-types/ddp/template.docx.b64",
      outputFilename: "design_development_plan.docx",
    },
    metadata: {
      encodedDocxPath: "doc-types/ddp/template.docx.b64",
    },
    normalize: createModuleReference("lib/doc/normalizers.js", {
      exportName: "normalizeGenericDocument",
    }),
    preprocess: createModuleReference("lib/doc/normalizers.js", {
      exportName: "normalizeGenericDocument",
    }),
    renderer: createModuleReference("templates/renderers.js", {
      exportName: "renderJsonBuffer",
    }),
    validation: {
      errorName: "DDPValidationError",
      errorMessage: "DDP payload failed validation.",
    },
    blank: () => ({}),
  }),
    sow: createDocTypeManifest({
    id: "sow",
    label: "Statement of Work",
    version: null,
    schemaId: null,
    manifestPath: null,
    schema: null,
    extract: null,
    docx: null,
    metadata: null,
    normalize: createModuleReference("lib/doc/normalizers.js", {
      exportName: "identity",
    }),
    preprocess: createModuleReference("lib/doc/normalizers.js", {
      exportName: "identity",
    }),
    renderer: createModuleReference("templates/renderers.js", {
      exportName: "renderJsonBuffer",
    }),
    validation: null,
    enabled: false,
    notes: "Placeholder manifest for future Statement of Work templates.",
    blank: () => ({}),
  }),
  };
}

let registryCache;

export function getTemplateRegistry() {
  if (!registryCache) {
    registryCache = buildTemplateRegistry();
  }
  return registryCache;
}

export function resetTemplateRegistryForTests() {
  registryCache = undefined;
}

export function getTemplateManifest(docType) {
  if (!docType || typeof docType !== "string") {
    return null;
  }

  const normalized = docType.trim().toLowerCase();
  const registry = getTemplateRegistry();
  return registry[normalized] || null;
}

export function listTemplateManifests({ includeDisabled = false } = {}) {
  const registry = getTemplateRegistry();
  const manifests = Object.values(registry).filter(Boolean);
  if (includeDisabled) {
    return manifests;
  }
  return manifests.filter((entry) => entry.enabled !== false);
}

export default getTemplateRegistry;
