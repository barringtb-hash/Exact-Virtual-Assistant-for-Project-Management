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

  try {
    return await loadTemplateAsset(normalized);
  } catch (error) {
    if (!isBrowser) {
      const fromFile = await loadFromNodeFile(normalized);
      if (fromFile !== null) {
        return fromFile;
      }
    }
    throw error;
  }
}

export default loadTemplateJson;
