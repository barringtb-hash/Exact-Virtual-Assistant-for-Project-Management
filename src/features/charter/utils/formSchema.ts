import { useMemo } from "react";

import {
  getDocTemplateFormState,
  useDocTemplateForm,
} from "../../../state/docTemplateStore.js";
import { loadTemplateJson } from "../../../utils/loadTemplateJson.js";

export const CHARTER_FORM_SCHEMA_PATH = "charter/formSchema.json";

export interface CharterFormChildField {
  id: string;
  label: string;
  type: string;
  placeholder: string | null;
}

export interface CharterFormField {
  id: string;
  label: string;
  help_text: string | null;
  required: boolean;
  type: string;
  options: unknown[];
  max_length: number | null;
  pattern?: string | null;
  placeholder: string | null;
  example: string | null;
  visibility: Record<string, unknown> | null;
  fields?: CharterFormChildField[];
}

export interface CharterFormSchema {
  document_type: string;
  version: string;
  fields: CharterFormField[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function toRequiredString(value: unknown, fallbackMessage: string): string {
  const normalized = toOptionalString(value);
  if (normalized === null) {
    throw new Error(fallbackMessage);
  }
  return normalized;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toOptionsArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice();
}

function toVisibility(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  return value;
}

function normalizeChildField(value: unknown): CharterFormChildField | null {
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

function normalizeField(value: unknown): CharterFormField | null {
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

  let nestedFields: CharterFormChildField[] | undefined;
  if (Array.isArray(value.fields)) {
    nestedFields = value.fields
      .map((child) => normalizeChildField(child))
      .filter((child): child is CharterFormChildField => Boolean(child));
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

export function normalizeCharterFormSchema(value: unknown): CharterFormSchema {
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
    .filter((field): field is CharterFormField => Boolean(field));

  if (fields.length === 0) {
    throw new Error("Form schema has no fields");
  }

  return {
    document_type: documentType,
    version,
    fields,
  };
}

export async function loadCharterFormSchema(
  path: string = CHARTER_FORM_SCHEMA_PATH
): Promise<CharterFormSchema> {
  const raw = await loadTemplateJson(path);
  if (!raw) {
    throw new Error(`Unable to load charter form schema at ${path}`);
  }
  return normalizeCharterFormSchema(raw);
}

export function getCharterFieldOrder(schema: CharterFormSchema): string[] {
  return schema.fields.map((field) => field.id);
}

export function getRequiredCharterFieldIds(schema: CharterFormSchema): string[] {
  return schema.fields.filter((field) => field.required).map((field) => field.id);
}

export function createCharterFieldLookup(
  schema: CharterFormSchema
): Map<string, CharterFormField> {
  return new Map(schema.fields.map((field) => [field.id, field] as const));
}

export function getCharterFieldById(
  schema: CharterFormSchema,
  fieldId: string
): CharterFormField | undefined {
  return createCharterFieldLookup(schema).get(fieldId);
}

export interface CharterFormSchemaState {
  status: string;
  schema: CharterFormSchema | null;
  error: unknown;
}

export function useCharterFormSchema(): CharterFormSchemaState {
  const { status, form, error } = useDocTemplateForm();

  const { schema, normalizationError } = useMemo(() => {
    if (!form) {
      return { schema: null, normalizationError: null };
    }
    try {
      return { schema: normalizeCharterFormSchema(form), normalizationError: null };
    } catch (err) {
      return { schema: null, normalizationError: err };
    }
  }, [form]);

  return {
    status,
    schema,
    error: error ?? normalizationError,
  };
}

export function getCharterFormSchemaSnapshot(): CharterFormSchemaState {
  const { status, form, error } = getDocTemplateFormState();
  if (!form) {
    return { status, schema: null, error };
  }
  try {
    return { status, schema: normalizeCharterFormSchema(form), error };
  } catch (normalizationError) {
    return { status, schema: null, error: error ?? normalizationError };
  }
}

export { useDocTemplateForm } from "../../../state/docTemplateStore.js";
