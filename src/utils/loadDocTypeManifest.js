import { getTemplateManifest } from "../../templates/registry.js";
import { loadTemplateJson } from "./loadTemplateJson.js";

const manifestCache = new Map();

function ensureCacheEntry(type) {
  let entry = manifestCache.get(type);
  if (!entry) {
    entry = { status: "idle", value: null, error: null, promise: null };
    manifestCache.set(type, entry);
  }
  return entry;
}

function normalizeManifestValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export async function loadDocTypeManifest(type) {
  const normalized = typeof type === "string" ? type.trim() : "";
  if (!normalized) {
    return null;
  }

  const entry = ensureCacheEntry(normalized);
  if (entry.status === "ready") {
    return entry.value;
  }
  if (entry.status === "loading" && entry.promise) {
    return entry.promise;
  }
  if (entry.status === "error" && entry.promise) {
    return entry.promise;
  }

  const manifestEntry = getTemplateManifest(normalized);
  const manifestPath = manifestEntry?.manifestPath;
  if (!manifestPath) {
    entry.status = "ready";
    entry.value = null;
    entry.error = null;
    entry.promise = Promise.resolve(null);
    return entry.promise;
  }

  entry.status = "loading";
  entry.error = null;
  entry.promise = loadTemplateJson(manifestPath)
    .then((value) => normalizeManifestValue(value))
    .then((manifest) => {
      entry.status = "ready";
      entry.value = manifest;
      return manifest;
    })
    .catch((error) => {
      entry.status = "error";
      entry.error = error;
      throw error;
    });
  return entry.promise;
}

export default loadDocTypeManifest;
