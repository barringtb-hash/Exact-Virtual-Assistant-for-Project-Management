import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs/promises";
import path from "path";
import { normalizeCharterServer } from "./normalize.js";

// Load the schema once at startup
const schemaPromise = fs
  .readFile(path.join(process.cwd(), "templates", "charter.schema.json"), "utf-8")
  .then(JSON.parse);

let validatorPromise;

async function loadCharterValidator() {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const schema = await schemaPromise;
      const ajv = new Ajv({ allErrors: true, strict: true });
      addFormats(ajv);
      return ajv.compile(schema);
    })();
  }

  return validatorPromise;
}

export function normalizeAjvErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  return errors
    .map((error) => {
      if (!error || typeof error !== "object") {
        return null;
      }

      const instancePath =
        typeof error.instancePath === "string"
          ? error.instancePath
          : typeof error.dataPath === "string"
          ? error.dataPath
          : "";

      return {
        instancePath,
        message: typeof error.message === "string" ? error.message : "is invalid",
        keyword: typeof error.keyword === "string" ? error.keyword : undefined,
        params:
          error.params && typeof error.params === "object"
            ? { ...error.params }
            : undefined,
        schemaPath:
          typeof error.schemaPath === "string" ? error.schemaPath : undefined,
      };
    })
    .filter(Boolean);
}

export async function validateCharterPayload(data) {
  const validator = await loadCharterValidator();
  const normalized = normalizeCharterServer(data);
  const isValid = validator(normalized);
  const errors = isValid ? [] : normalizeAjvErrors(validator.errors);

  return { isValid, errors, normalized };
}

export function createCharterValidationError(errors, normalized) {
  const normalizedErrors = normalizeAjvErrors(errors);
  const error = new Error("Charter payload failed validation.");
  error.name = "CharterValidationError";
  error.statusCode = 400;
  error.validationErrors = normalizedErrors;
  if (normalized && typeof normalized === "object") {
    error.normalizedPayload = normalizeCharterServer(normalized);
  }
  return error;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const data = req.body;
  const { isValid, errors, normalized } = await validateCharterPayload(data);

  if (!isValid) {
    return res.status(400).json({ errors, normalized });
  }

  return res.status(200).json({ ok: true, normalized });
}
