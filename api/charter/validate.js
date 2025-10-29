import docHandler from "../doc/validate.js";
import { getDocTypeConfig } from "../../lib/doc/registry.js";
import {
  createDocValidationError,
  normalizeAjvErrors as normalizeErrors,
  validateDocument,
} from "../../lib/doc/validation.js";

const DOC_TYPE = "charter";
const charterConfig = getDocTypeConfig(DOC_TYPE);

function withCharterContext(req) {
  const query = { ...(req.query || {}), docType: DOC_TYPE };
  return { ...req, query };
}

export const normalizeAjvErrors = normalizeErrors;

export async function validateCharterPayload(data) {
  const { isValid, errors, normalized } = await validateDocument(
    DOC_TYPE,
    charterConfig,
    data
  );
  return { isValid, errors, normalized };
}

export function createCharterValidationError(errors, normalized) {
  return createDocValidationError(DOC_TYPE, charterConfig, errors, normalized);
}

export default async function handler(req, res) {
  return docHandler(withCharterContext(req), res);
}

