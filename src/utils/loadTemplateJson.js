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

function buildBrowserUrl(normalizedPath) {
  if (!normalizedPath) {
    return null;
  }
  const baseUrl = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : "/";
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmedBase}/templates/${normalizedPath}`;
}

async function loadFromNodeFile(normalizedPath) {
  try {
    const fileUrl = new URL(`../../templates/${normalizedPath}`, import.meta.url);
    if (fileUrl.protocol !== "file:") {
      return null;
    }
    const { readFile } = await import("node:fs/promises");
    const contents = await readFile(fileUrl, "utf8");
    if (!contents) {
      return null;
    }
    return JSON.parse(contents);
  } catch (error) {
    console.error("Failed to read template asset from filesystem", normalizedPath, error);
    return null;
  }
}

async function loadViaDynamicImport(normalizedPath) {
  try {
    const specifier = `../../templates/${normalizedPath}`;
    const module = await import(/* @vite-ignore */ specifier);
    const value = module && typeof module === "object" ? module.default ?? module : module;
    return value && typeof value === "object" ? value : null;
  } catch (error) {
    console.error("Failed to dynamically import template asset", normalizedPath, error);
    return null;
  }
}

async function loadViaFetch(normalizedPath) {
  if (!isBrowser || typeof fetch !== "function") {
    return null;
  }
  const url = buildBrowserUrl(normalizedPath);
  if (!url) {
    return null;
  }
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.json();
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

  if (isBrowser) {
    // In browser contexts, fall back to dynamic import so bundlers can inline the asset.
    return loadViaDynamicImport(normalized);
  }

  // Final fallback for non-browser environments if filesystem read or fetch failed.
  return loadFromNodeFile(normalized);
}

export default loadTemplateJson;
