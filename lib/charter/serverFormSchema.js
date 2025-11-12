function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function toRequiredString(value, fallbackMessage) {
  const normalized = toOptionalString(value);
  if (normalized === null) {
    throw new Error(fallbackMessage);
  }
  return normalized;
}

function toBoolean(value) {
  return value === true;
}

function toOptionalNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toOptionsArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice();
}

function toVisibility(value) {
  if (!isRecord(value)) {
    return null;
  }
  return value;
}

function normalizeChildField(value) {
  if (!isRecord(value)) {
    return null;
  }
  const id = toOptionalString(value.id);
  if (!id) {
    return null;
  }
  const label = toOptionalString(value.label) ?? id;
  const type = toOptionalString(value.type) ?? "string";
  const placeholder = toOptionalString(value.placeholder);

  return {
    id,
    label,
    type,
    placeholder,
  };
}

function normalizeField(value) {
  if (!isRecord(value)) {
    return null;
  }
  const id = toOptionalString(value.id);
  if (!id) {
    return null;
  }
  const label = toOptionalString(value.label) ?? id;
  const helpText = toOptionalString(value.help_text);
  const placeholder = toOptionalString(value.placeholder);
  const example = toOptionalString(value.example);
  const type = toOptionalString(value.type) ?? "string";
  const options = toOptionsArray(value.options);
  const required = toBoolean(value.required);
  const maxLength = toOptionalNumber(value.max_length);
  const pattern = toOptionalString(value.pattern);
  const visibility = toVisibility(value.visibility);

  let nestedFields;
  if (Array.isArray(value.fields)) {
    nestedFields = value.fields
      .map((child) => normalizeChildField(child))
      .filter((child) => Boolean(child));
    if (nestedFields.length === 0) {
      nestedFields = undefined;
    }
  }

  return {
    id,
    label,
    help_text: helpText,
    required,
    type,
    options,
    max_length: maxLength,
    pattern,
    placeholder,
    example,
    visibility,
    fields: nestedFields,
  };
}

/**
 * Normalizes a raw charter form schema object into a predictable structure.
 *
 * @param {*} value - The raw form schema to normalize.
 * @returns {{
 *   document_type: string,
 *   version: string,
 *   fields: Array<{
 *     id: string,
 *     label: string,
 *     help_text: string | null,
 *     required: boolean,
 *     type: string,
 *     options: Array<*>,
 *     max_length: number | null,
 *     pattern?: string | null,
 *     placeholder: string | null,
 *     example: string | null,
 *     visibility: Object<string, *> | null,
 *     fields?: Array<{
 *       id: string,
 *       label: string,
 *       type: string,
 *       placeholder: string | null,
 *     }>,
 *   }>
 * }} The normalized charter form schema.
 */
export function normalizeCharterFormSchema(value) {
  if (!isRecord(value)) {
    throw new Error("Form schema must be an object");
  }

  const documentType = toRequiredString(
    value.document_type,
    "Form schema is missing document_type"
  );
  if (documentType !== "charter") {
    throw new Error(`Unexpected form schema type: ${documentType}`);
  }
  const version = toRequiredString(value.version, "Form schema is missing version");

  if (!Array.isArray(value.fields)) {
    throw new Error("Form schema is missing fields");
  }

  const fields = value.fields
    .map((field) => normalizeField(field))
    .filter((field) => Boolean(field));

  if (fields.length === 0) {
    throw new Error("Form schema has no fields");
  }

  return {
    document_type: documentType,
    version,
    fields,
  };
}
