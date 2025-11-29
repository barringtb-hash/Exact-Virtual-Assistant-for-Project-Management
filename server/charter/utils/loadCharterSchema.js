/**
 * Charter Schema Loader
 *
 * Loads charter field definitions from formSchema.json and converts them
 * to the format used by the extraction process. This makes formSchema.json
 * the single source of truth for field definitions.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../../templates");

// Cache for loaded schema
let cachedSchema = null;
let cachedFields = null;
let cachedFieldMap = null;

/**
 * @typedef {Object} CharterFieldChild
 * @property {string} id
 * @property {string} label
 * @property {string} type
 * @property {string|null} placeholder
 */

/**
 * @typedef {Object} CharterField
 * @property {string} id
 * @property {string} label
 * @property {string} question
 * @property {string} helpText
 * @property {boolean} required
 * @property {string} type
 * @property {number|null} maxLength
 * @property {string|null} placeholder
 * @property {string|null} example
 * @property {string|null} reviewLabel
 * @property {CharterFieldChild[]} [children]
 */

/**
 * Load the raw formSchema.json content
 * @returns {Promise<Object>} The raw schema object
 */
export async function loadRawFormSchema() {
  if (cachedSchema) {
    return cachedSchema;
  }

  const schemaPath = path.join(TEMPLATES_DIR, "charter", "formSchema.json");
  const content = await fs.readFile(schemaPath, "utf8");
  cachedSchema = JSON.parse(content);
  return cachedSchema;
}

/**
 * Convert a formSchema field to the extraction format
 * @param {Object} field - A field from formSchema.json
 * @returns {CharterField} The field in extraction format
 */
function convertFieldToExtractionFormat(field) {
  const converted = {
    id: field.id,
    label: field.label,
    question: field.question || field.help_text || `What is the ${field.label.toLowerCase()}?`,
    helpText: field.help_text || "",
    required: Boolean(field.required),
    type: mapFieldType(field.type),
    maxLength: field.max_length || null,
    placeholder: field.placeholder || null,
    example: field.example || null,
  };

  // Convert nested fields for object_list types
  if (field.type === "object_list" && Array.isArray(field.fields)) {
    converted.children = field.fields.map((child) => ({
      id: child.id,
      label: child.label,
      type: mapFieldType(child.type),
      placeholder: child.placeholder || null,
    }));
  }

  return converted;
}

/**
 * Map formSchema field types to extraction types
 * @param {string} type - The formSchema type
 * @returns {string} The extraction type
 */
function mapFieldType(type) {
  const typeMap = {
    string: "string",
    textarea: "textarea",
    date: "date",
    string_list: "string_list",
    object_list: "object_list",
  };
  return typeMap[type] || "string";
}

/**
 * Load charter fields in the extraction format
 * @returns {Promise<CharterField[]>} Array of charter fields
 */
export async function loadCharterFields() {
  if (cachedFields) {
    return cachedFields;
  }

  const schema = await loadRawFormSchema();
  cachedFields = (schema.fields || []).map(convertFieldToExtractionFormat);
  return cachedFields;
}

/**
 * Get a map of field IDs to field definitions
 * @returns {Promise<Map<string, CharterField>>} Map of field ID to field
 */
export async function getCharterFieldMap() {
  if (cachedFieldMap) {
    return cachedFieldMap;
  }

  const fields = await loadCharterFields();
  cachedFieldMap = new Map(fields.map((f) => [f.id, f]));
  return cachedFieldMap;
}

/**
 * Get the list of all charter field IDs
 * @returns {Promise<string[]>} Array of field IDs
 */
export async function getCharterFieldIds() {
  const fields = await loadCharterFields();
  return fields.map((f) => f.id);
}

/**
 * Get required field IDs
 * @returns {Promise<string[]>} Array of required field IDs
 */
export async function getRequiredFieldIds() {
  const fields = await loadCharterFields();
  return fields.filter((f) => f.required).map((f) => f.id);
}

/**
 * Get optional field IDs
 * @returns {Promise<string[]>} Array of optional field IDs
 */
export async function getOptionalFieldIds() {
  const fields = await loadCharterFields();
  return fields.filter((f) => !f.required).map((f) => f.id);
}

/**
 * Build the field order list (for system prompts)
 * @returns {Promise<string[]>} Array of field labels in order
 */
export async function getFieldOrderLabels() {
  const fields = await loadCharterFields();
  return fields.map((f) => f.label);
}

/**
 * Generate a system prompt from the schema
 * @returns {Promise<string>} The system prompt for charter extraction
 */
export async function generateSystemPrompt() {
  const fields = await loadCharterFields();
  const fieldLabels = fields.map((f) => f.label).join(", ");

  return [
    "You are the Exact Virtual Assistant guiding a project charter working session.",
    `Walk the project manager through each charter field sequentially in schema order: ${fieldLabels}.`,
    "Ask one concise question at a time, flag whether the section is required, and weave in brief help text or examples from the charter schema when it helps clarify the request.",
    'Honor guided commands: "skip" moves on, "back" revisits the previous field, "edit <field name>" jumps to that section, and "review" summarizes confirmed versus pending sections.',
    "Confirm captured answers, reuse the latest confirmed value when referencing past entries, keep responses crisp and professional, and never recommend external blank-charter websites.",
  ].join(" ");
}

/**
 * Clear the schema cache (useful for testing or hot-reloading)
 */
export function clearSchemaCache() {
  cachedSchema = null;
  cachedFields = null;
  cachedFieldMap = null;
}

/**
 * Get schema metadata
 * @returns {Promise<Object>} Schema metadata (version, document_type)
 */
export async function getSchemaMetadata() {
  const schema = await loadRawFormSchema();
  return {
    documentType: schema.document_type,
    version: schema.version,
  };
}

export default {
  loadRawFormSchema,
  loadCharterFields,
  getCharterFieldMap,
  getCharterFieldIds,
  getRequiredFieldIds,
  getOptionalFieldIds,
  getFieldOrderLabels,
  generateSystemPrompt,
  clearSchemaCache,
  getSchemaMetadata,
};
