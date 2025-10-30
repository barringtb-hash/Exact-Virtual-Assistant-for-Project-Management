import templateRegistry from "../../templates/registry.js";
import { createBlankCharter } from "../../lib/charter/normalize.js";

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  return value;
}

function invokeBlankFactory(factory) {
  if (typeof factory === "function") {
    return factory();
  }
  if (factory && typeof factory === "object") {
    return factory;
  }
  return undefined;
}

export default function getBlankDoc(docType) {
  const normalized = typeof docType === "string" && docType.trim() ? docType.trim().toLowerCase() : null;
  const manifest = normalized ? templateRegistry[normalized] : null;

  let blank = invokeBlankFactory(manifest?.blank);
  if (!blank && normalized === "charter") {
    blank = createBlankCharter();
  }
  if (!blank && templateRegistry.charter?.blank) {
    blank = invokeBlankFactory(templateRegistry.charter.blank);
  }

  if (!blank || typeof blank !== "object") {
    return {};
  }

  return cloneValue(blank);
}
