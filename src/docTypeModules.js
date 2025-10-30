import { getTemplateManifest, listTemplateManifests } from "../templates/registry.js";

const moduleCache = new Map();

function buildCacheKey(descriptor) {
  const moduleId = descriptor?.moduleId || "";
  const exportName = descriptor?.exportName || "default";
  const fallbacks = Array.isArray(descriptor?.fallbacks)
    ? descriptor.fallbacks.join(",")
    : "";
  return `${moduleId}::${exportName}::${fallbacks}`;
}

function resolveModuleSpecifier(moduleId) {
  if (!moduleId || typeof moduleId !== "string") {
    return null;
  }
  return `../${moduleId}`;
}

async function loadClientModule(descriptor) {
  if (!descriptor?.moduleId) {
    return null;
  }

  const cacheKey = buildCacheKey(descriptor);
  if (moduleCache.has(cacheKey)) {
    return moduleCache.get(cacheKey);
  }

  const specifier = resolveModuleSpecifier(descriptor.moduleId);
  if (!specifier) {
    moduleCache.set(cacheKey, null);
    return null;
  }

  const promise = import(/* @vite-ignore */ specifier)
    .then((module) => {
      const candidates = [];
      if (descriptor.exportName) {
        candidates.push(descriptor.exportName);
      }
      if (Array.isArray(descriptor.fallbacks)) {
        candidates.push(...descriptor.fallbacks.filter(Boolean));
      }

      for (const exportName of candidates) {
        if (exportName && Object.prototype.hasOwnProperty.call(module, exportName)) {
          return module[exportName];
        }
      }

      if (descriptor.defaultExport !== false && Object.prototype.hasOwnProperty.call(module, "default")) {
        return module.default;
      }

      console.warn(
        `Module "${descriptor.moduleId}" did not expose the requested client export.`
      );
      return null;
    })
    .catch((error) => {
      console.error(`Failed to load client module "${descriptor.moduleId}"`, error);
      return null;
    });

  moduleCache.set(cacheKey, promise);
  return promise;
}

export async function loadDocTypeNormalizer(type) {
  const manifest = getTemplateManifest(type);
  if (!manifest) {
    return null;
  }
  return loadClientModule(manifest.normalize);
}

export async function loadDocTypeRenderer(type) {
  const manifest = getTemplateManifest(type);
  if (!manifest) {
    return null;
  }
  return loadClientModule(manifest.renderer);
}

export function getDocTypeManifest(type) {
  return getTemplateManifest(type);
}

export function listDocTypeManifests(options) {
  return listTemplateManifests(options);
}

export default {
  loadDocTypeNormalizer,
  loadDocTypeRenderer,
  getDocTypeManifest,
  listDocTypeManifests,
};
