import templateRegistry from "../../templates/registry.js";

const manifestCache = new Map();

function normalizeManifestModule(module) {
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

export async function loadDocTypeManifest(type) {
  const normalized = typeof type === "string" ? type.trim() : "";
  if (!normalized) {
    return null;
  }

  if (manifestCache.has(normalized)) {
    return manifestCache.get(normalized);
  }

  const manifestEntry = templateRegistry[normalized];
  const manifestPath = manifestEntry?.manifestPath;
  if (!manifestPath) {
    manifestCache.set(normalized, null);
    return null;
  }

  const specifier = resolveTemplateSpecifier(manifestPath);
  if (!specifier) {
    manifestCache.set(normalized, null);
    return null;
  }

  const promise = import(/* @vite-ignore */ specifier)
    .then((module) => normalizeManifestModule(module))
    .catch((error) => {
      console.error("Failed to load manifest for doc type", normalized, error);
      return null;
    });

  manifestCache.set(normalized, promise);
  return promise;
}

export default loadDocTypeManifest;
