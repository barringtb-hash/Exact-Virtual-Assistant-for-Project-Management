import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { templateRegistry } from "../../templates/registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", "..");
const templatesDir = path.join(projectRoot, "templates");

const moduleExportCache = new Map();

function buildCacheKey(descriptor) {
  const moduleId = descriptor?.moduleId || "";
  const exportName = descriptor?.exportName || "default";
  const fallbacks = Array.isArray(descriptor?.fallbacks)
    ? descriptor.fallbacks.join(",")
    : "";
  return `${moduleId}::${exportName}::${fallbacks}`;
}

export function resolveProjectPath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    return null;
  }
  return path.join(projectRoot, relativePath);
}

export function resolveTemplateAssetPath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    return null;
  }
  return path.join(templatesDir, relativePath);
}

async function importModuleByDescriptor(descriptor) {
  if (!descriptor?.moduleId || typeof descriptor.moduleId !== "string") {
    return null;
  }

  const cacheKey = buildCacheKey(descriptor);
  if (moduleExportCache.has(cacheKey)) {
    return moduleExportCache.get(cacheKey);
  }

  const absolutePath = resolveProjectPath(descriptor.moduleId);
  const moduleUrl = pathToFileURL(absolutePath).href;
  const promise = import(moduleUrl)
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

      const error = new Error(
        `Module "${descriptor.moduleId}" does not export the requested symbol.`
      );
      error.moduleId = descriptor.moduleId;
      error.descriptor = descriptor;
      throw error;
    })
    .catch((error) => {
      const wrapped = new Error(
        `Failed to load module "${descriptor.moduleId}" for doc template manifest.`
      );
      wrapped.cause = error;
      throw wrapped;
    });

  moduleExportCache.set(cacheKey, promise);
  return promise;
}

export async function loadServerModule(descriptor) {
  return importModuleByDescriptor(descriptor);
}

export function getManifestModuleDescriptor(docType, key) {
  const manifest = templateRegistry?.[docType];
  if (!manifest) {
    return null;
  }
  return manifest?.[key] || null;
}

export async function loadDocTypeModule(docType, key) {
  const descriptor = getManifestModuleDescriptor(docType, key);
  if (!descriptor) {
    return null;
  }
  return loadServerModule(descriptor);
}

export function getTemplatesDir() {
  return templatesDir;
}

export function getProjectRoot() {
  return projectRoot;
}

export default {
  resolveProjectPath,
  resolveTemplateAssetPath,
  loadServerModule,
  loadDocTypeModule,
  getManifestModuleDescriptor,
  getTemplatesDir,
  getProjectRoot,
};
