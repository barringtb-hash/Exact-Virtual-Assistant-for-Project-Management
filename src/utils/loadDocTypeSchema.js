import templateRegistry from "../../templates/registry.js";

const schemaCache = new Map();

function normalizeSchemaModule(module) {
  if (!module) {
    return null;
  }
  if (module.default) {
    return module.default;
  }
  return module;
}

function resolveTemplateSpecifier(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    return null;
  }
  return `../../templates/${relativePath}`;
}

export async function loadDocTypeSchema(type) {
  const normalized = typeof type === "string" ? type.trim() : "";
  if (!normalized) {
    return null;
  }

  if (schemaCache.has(normalized)) {
    return schemaCache.get(normalized);
  }

  const manifest = templateRegistry[normalized];
  const schemaPath = manifest?.schema?.path;
  if (!schemaPath) {
    schemaCache.set(normalized, null);
    return null;
  }

  const specifier = resolveTemplateSpecifier(schemaPath);
  if (!specifier) {
    schemaCache.set(normalized, null);
    return null;
  }

  const promise = import(/* @vite-ignore */ specifier)
    .then((module) => normalizeSchemaModule(module))
    .catch((error) => {
      console.error("Failed to load schema for doc type", normalized, error);
      return null;
    });

  schemaCache.set(normalized, promise);
  return promise;
}

export default loadDocTypeSchema;
