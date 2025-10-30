import { loadTemplateAsset } from "../lib/loadTemplateAsset.js";

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

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

async function loadFromNodeFile(normalizedPath) {
  const searchRoots = ["../../public/templates/", "../../templates/"];
  for (const root of searchRoots) {
    try {
      const fileUrl = new URL(`${root}${normalizedPath}`, import.meta.url);
      if (fileUrl.protocol !== "file:") {
        continue;
      }
      const { readFile } = await import("node:fs/promises");
      const contents = await readFile(fileUrl, "utf8");
      if (!contents) {
        continue;
      }
      return JSON.parse(contents);
    } catch (error) {
      // continue searching other roots
    }
  }
  console.error("Failed to read template asset from filesystem", normalizedPath);
  return null;
}

async function loadViaFetch(normalizedPath) {
  if (!isBrowser || typeof fetch !== "function") {
    return null;
  }
  try {
    return await loadTemplateAsset(normalizedPath);
  } catch (error) {
    console.warn("Failed to fetch template asset", normalizedPath, error);
    return null;
  }
}

export async function loadTemplateJson(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return null;
  }

  if (!isBrowser) {
    const fromFile = await loadFromNodeFile(normalized);
    if (fromFile !== null) {
      return fromFile;
    }
  }

  const fromFetch = await loadViaFetch(normalized);
  if (fromFetch !== null) {
    return fromFetch;
  }

  return loadFromNodeFile(normalized);
}

export default loadTemplateJson;
