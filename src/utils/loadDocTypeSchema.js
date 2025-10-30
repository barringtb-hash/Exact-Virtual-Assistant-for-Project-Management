import { getTemplateManifest } from "../../templates/registry.js";
import { loadTemplateJson } from "./loadTemplateJson.js";

const schemaCache = new Map();

function ensureCacheEntry(type) {
  let entry = schemaCache.get(type);
  if (!entry) {
    entry = { status: "idle", value: null, error: null, promise: null };
    schemaCache.set(type, entry);
  }
  return entry;
}

function normalizeSchemaValue(value) {
  return value && typeof value === "object" ? value : null;
}

export async function loadDocTypeSchema(type) {
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

  const manifest = getTemplateManifest(normalized);
  const schemaPath = manifest?.schema?.path;
  if (!schemaPath) {
    entry.status = "ready";
    entry.value = null;
    entry.error = null;
    entry.promise = Promise.resolve(null);
    return entry.promise;
  }

  entry.status = "loading";
  entry.error = null;
  entry.promise = loadTemplateJson(schemaPath)
    .then((value) => normalizeSchemaValue(value))
    .then((schema) => {
      entry.status = "ready";
      entry.value = schema;
      return schema;
    })
    .catch((error) => {
      entry.status = "error";
      entry.error = error;
      throw error;
    });
  return entry.promise;
}

export default loadDocTypeSchema;
