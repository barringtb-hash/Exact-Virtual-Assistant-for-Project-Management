import fs from "fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import { MissingDocAssetError } from "./errors.js";
import { normalizeCharterFormSchema } from "../charter/serverFormSchema.js";
import { normalizeFormValues } from "../forms/serverValidation.js";

const schemaCache = new Map();
const fieldRulesCache = new Map();
const validatorCache = new Map();
const formSchemaCache = new Map();

function createAssetLoadError(docType, assetType, cause, filePath) {
  if (cause?.code === "ENOENT") {
    throw new MissingDocAssetError(docType, assetType, filePath ? [filePath] : []);
  }

  const error = new Error(`Failed to load ${assetType} for "${docType}" documents.`);
  error.name = "DocAssetLoadError";
  error.statusCode = 500;
  error.docType = docType;
  error.assetType = assetType;
  error.cause = cause;
  if (filePath) {
    error.filePath = filePath;
  }
  throw error;
}

async function readJsonAsset(filePath, cache, { docType, assetType }) {
  if (!filePath) {
    return null;
  }

  if (cache.has(filePath)) {
    return cache.get(filePath);
  }

  const promise = fs
    .readFile(filePath, "utf8")
    .then((contents) => {
      try {
        return JSON.parse(contents);
      } catch (parseError) {
        createAssetLoadError(docType, assetType, parseError, filePath);
      }
    })
    .catch((readError) => {
      createAssetLoadError(docType, assetType, readError, filePath);
    });

  cache.set(filePath, promise);
  return promise;
}

async function loadSchema(docType, config) {
  const schemaPath = config?.validation?.schemaPath;
  if (!schemaPath) {
    return null;
  }
  return readJsonAsset(schemaPath, schemaCache, {
    docType,
    assetType: "validation schema",
  });
}

async function loadFieldRules(docType, config) {
  const fieldRulesPath = config?.validation?.fieldRulesPath;
  if (!fieldRulesPath) {
    return null;
  }
  return readJsonAsset(fieldRulesPath, fieldRulesCache, {
    docType,
    assetType: "field rules",
  });
}

async function loadFormSchema(docType, config) {
  const formSchemaPath = config?.validation?.formSchemaPath;
  if (!formSchemaPath) {
    return null;
  }
  const raw = await readJsonAsset(formSchemaPath, formSchemaCache, {
    docType,
    assetType: "form schema",
  });
  if (!raw) {
    return null;
  }
  try {
    return normalizeCharterFormSchema(raw);
  } catch (error) {
    createAssetLoadError(docType, "form schema", error, formSchemaPath);
  }
  return null;
}

async function getValidator(docType, config) {
  if (validatorCache.has(docType)) {
    return validatorCache.get(docType);
  }

  const promise = (async () => {
    const schema = await loadSchema(docType, config);
    if (!schema) {
      throw createAssetLoadError(
        docType,
        "validation schema",
        new Error("Schema file is not configured."),
        config?.validation?.schemaPath
      );
    }

    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    return ajv.compile(schema);
  })();

  validatorCache.set(docType, promise);
  return promise;
}

export function normalizeAjvErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const error of errors) {
    if (!error || typeof error !== "object") {
      continue;
    }

    const instancePath =
      typeof error.instancePath === "string"
        ? error.instancePath
        : typeof error.dataPath === "string"
        ? error.dataPath
        : "";

    const message =
      typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : "is invalid";

    const params =
      error.params && typeof error.params === "object"
        ? { ...error.params }
        : undefined;

    const normalizedError = {
      instancePath,
      message,
      keyword: typeof error.keyword === "string" ? error.keyword : undefined,
      params,
      schemaPath: typeof error.schemaPath === "string" ? error.schemaPath : undefined,
    };

    const dedupeKey = JSON.stringify([
      normalizedError.instancePath || "",
      normalizedError.message,
      normalizedError.keyword || "",
      normalizedError.schemaPath || "",
      params ? JSON.stringify(params) : "",
    ]);

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push(normalizedError);
  }

  return normalized;
}

export async function ensureValidationAssets(docType, config) {
  await Promise.all([
    loadSchema(docType, config),
    loadFieldRules(docType, config),
    loadFormSchema(docType, config),
  ]);
}

export async function validateDocument(docType, config, data) {
  if (!config?.validation) {
    return { isValid: true, errors: [], normalized: data };
  }

  const normalizeFn =
    typeof config.validation.normalize === "function"
      ? config.validation.normalize
      : (value) => value;

  let preparedInput = data;
  const formSchema = await loadFormSchema(docType, config);
  if (formSchema) {
    try {
      const { normalized } = normalizeFormValues(formSchema, preparedInput || {});
      preparedInput = { ...preparedInput, ...normalized };
    } catch {
      // ignore normalization issues; Ajv will report validation failures
    }
  }

  const prepared = normalizeFn(preparedInput);
  const validator = await getValidator(docType, config);
  const isValid = validator(prepared);
  const errors = isValid ? [] : normalizeAjvErrors(validator.errors);

  return { isValid, errors, normalized: prepared };
}

export function createDocValidationError(docType, config, errors, normalized) {
  const normalizedErrors = normalizeAjvErrors(errors);
  const message =
    typeof config?.validation?.errorMessage === "string"
      ? config.validation.errorMessage
      : "Document payload failed validation.";
  const error = new Error(message);
  error.name = config?.validation?.errorName || "DocumentValidationError";
  error.statusCode = 400;
  error.docType = docType;
  error.docLabel = config?.label || docType;
  error.validationErrors = normalizedErrors;

  if (normalized && typeof normalized === "object") {
    try {
      const normalizeFn =
        typeof config?.validation?.normalize === "function"
          ? config.validation.normalize
          : null;
      error.normalizedPayload = normalizeFn ? normalizeFn(normalized) : normalized;
    } catch {
      error.normalizedPayload = normalized;
    }
  }

  return error;
}

export function __clearValidationCaches() {
  schemaCache.clear();
  fieldRulesCache.clear();
  validatorCache.clear();
  formSchemaCache.clear();
}

