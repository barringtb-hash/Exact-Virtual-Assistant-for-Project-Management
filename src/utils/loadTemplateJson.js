import { loadTemplateAsset } from "../lib/loadTemplateAsset.js";

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
const hasImportGlob = typeof import.meta !== "undefined" && typeof import.meta.glob === "function";
const templateModules = hasImportGlob
  ? import.meta.glob("../../templates/**/*.json", { eager: true })
  : {};

function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== "string") {
    return "";
  }
  const trimmed = relativePath.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^\.\/?/, "");
}

function loadFromBundledModule(normalizedPath) {
  if (!normalizedPath) {
    return null;
  }
  const entries = Object.entries(templateModules);
  if (entries.length === 0) {
    return null;
  }
  const match = entries.find(([key]) => key.endsWith(`/${normalizedPath}`));
  if (!match) {
    return null;
  }
  const moduleExport = match[1];
  if (moduleExport && typeof moduleExport === "object" && "default" in moduleExport) {
    return moduleExport.default;
  }
  return moduleExport;
}

async function loadFromNodeFile(normalizedPath) {
  if (!normalizedPath || isBrowser) {
    return null;
  }
  const searchRoots = ["../../public/templates/", "../../templates/"];
  for (const root of searchRoots) {
    try {
      const fileUrl = new URL(`${root}${normalizedPath}`, import.meta.url);
      if (fileUrl.protocol !== "file:") {
        continue;
      }
      const module = await import(/* @vite-ignore */ fileUrl.href, {
        assert: { type: "json" },
      });
      if (module && typeof module === "object") {
        return module.default ?? module;
      }
    } catch (error) {
      // ignore and continue searching other roots
    }
  }
  return null;
}

export async function loadTemplateJson(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return null;
  }

  const bundled = loadFromBundledModule(normalized);
  if (bundled !== null) {
    return bundled;
  }

  try {
    return await loadTemplateAsset(normalized);
  } catch (error) {
    const fromFile = await loadFromNodeFile(normalized);
    if (fromFile !== null) {
      return fromFile;
    }
    throw error;
  }
}

export default loadTemplateJson;
