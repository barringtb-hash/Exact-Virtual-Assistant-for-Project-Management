import { createRequire } from "module";
import {
  normalizeObjectEntries,
  normalizeStringList,
  toTrimmedString,
} from "../../server/charter/utils/normalize.js";

const require = createRequire(import.meta.url);
const charterFieldRules = require("../../templates/field_rules.json");

const defaultFieldRules = charterFieldRules;

function toStringValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return String(value ?? "");
}

function normalizeSingleLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
  return normalized;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_SHORT_RE = /^(\d{4})-(\d{2})$/;
const US_DATE_RE = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function tryParseDate(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { iso: "" };
  }

  let match = trimmed.match(ISO_DATE_RE);
  if (match) {
    return { iso: trimmed };
  }

  match = trimmed.match(US_DATE_RE);
  if (match) {
    const [, month, day, year] = match;
    const parsed = new Date(`${year}-${pad(Number(month))}-${pad(Number(day))}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return { iso: formatIsoDate(parsed) };
    }
  }

  match = trimmed.match(ISO_DATE_SHORT_RE);
  if (match) {
    const [, year, month] = match;
    const parsed = new Date(`${year}-${month}-01T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        iso: formatIsoDate(parsed),
        warning: {
          code: "inferred-date",
          severity: "warning",
          message: "Date was inferred using the first day of the month.",
        },
      };
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { iso: formatIsoDate(parsed) };
  }

  return { iso: null };
}

function createIssue(code, message, ruleText, severity = "error", details) {
  return {
    code,
    message,
    ruleText: ruleText ?? undefined,
    severity,
    details,
  };
}

function valueIsPresent(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function matchesCondition(condition, values) {
  const fieldId = condition.field ?? "";
  const target = fieldId ? values[fieldId] : undefined;

  if (Array.isArray(condition.anyOf) && condition.anyOf.length > 0) {
    return condition.anyOf.some((candidate) => candidate === target);
  }

  if (Array.isArray(condition.noneOf) && condition.noneOf.length > 0) {
    return !condition.noneOf.some((candidate) => candidate === target);
  }

  if (condition.equals !== undefined) {
    const equalsCandidates = Array.isArray(condition.equals)
      ? condition.equals
      : [condition.equals];
    return equalsCandidates.some((candidate) => candidate === target);
  }

  if (condition.notEquals !== undefined) {
    const notEqualsCandidates = Array.isArray(condition.notEquals)
      ? condition.notEquals
      : [condition.notEquals];
    return !notEqualsCandidates.some((candidate) => candidate === target);
  }

  if (typeof condition.exists === "boolean") {
    return condition.exists ? valueIsPresent(target) : !valueIsPresent(target);
  }

  if (typeof condition.truthy === "boolean") {
    return condition.truthy ? Boolean(target) : !Boolean(target);
  }

  return valueIsPresent(target);
}

function evaluateVisibility(field, values) {
  const config = field.visibility ?? null;
  if (!config) {
    return true;
  }

  const { when } = config;
  const conditions = Array.isArray(when) ? when : when ? [when] : [];
  if (conditions.length === 0) {
    return true;
  }

  const mode = (config.mode || config.operator || "all").toString().toLowerCase();
  const useAny = mode === "any" || mode === "or";

  const results = conditions.map((condition) => matchesCondition(condition, values));
  return useAny ? results.some(Boolean) : results.every(Boolean);
}

function normalizeField(field, rawValue) {
  const rawText = toStringValue(rawValue);
  switch (field.type) {
    case "text":
    case "textarea": {
      const text = normalizeMultiline(rawText);
      return { text, structured: text };
    }
    case "date": {
      const text = normalizeSingleLine(rawText);
      const parsed = tryParseDate(text);
      const warnings = parsed.warning ? [parsed.warning] : undefined;
      return { text: parsed.iso ?? text, structured: parsed.iso ?? text, warnings };
    }
    case "string_list": {
      const items = normalizeStringList(rawValue);
      const text = Array.isArray(rawValue) ? items.join("\n") : normalizeMultiline(rawText);
      return { text, structured: items };
    }
    case "object_list": {
      const text = normalizeMultiline(rawText);
      let parsed = [];
      if (Array.isArray(rawValue)) {
        parsed = rawValue;
      } else if (text.trim()) {
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            parsed = json;
          }
        } catch {
          const segments = text
            .split(/\n{2,}|\n[-*•]\s*/)
            .map((segment) => segment.trim())
            .filter(Boolean);
          parsed = segments;
        }
      }
      const childFields = Array.isArray(field.fields)
        ? field.fields.map((child) => child.id).filter(Boolean)
        : [];
      const objects = normalizeObjectEntries(parsed, childFields);
      return { text, structured: objects };
    }
    default: {
      const text = normalizeSingleLine(rawText);
      return { text, structured: text };
    }
  }
}

function runFieldValidation(field, normalized, ruleText) {
  const issues = [];
  const value = normalized.structured;
  const text = typeof normalized.text === "string" ? normalized.text : toStringValue(value);

  const effectiveValue = Array.isArray(value) ? value : text;
  const hasValue = valueIsPresent(effectiveValue);

  if (field.required && !hasValue) {
    issues.push(createIssue("required", `${field.label} is required.`, ruleText));
  }

  if (typeof field.max_length === "number" && field.max_length > 0) {
    const length = text.length;
    if (length > field.max_length) {
      issues.push(
        createIssue(
          "max_length",
          `${field.label} must be ${field.max_length} characters or fewer.`,
          ruleText,
          "error",
          { max: field.max_length, length },
        ),
      );
    }
  }

  if (Array.isArray(field.options) && field.options.length > 0 && typeof value === "string") {
    const allowed = field.options.map((option) => toTrimmedString(option));
    if (!allowed.includes(value)) {
      issues.push(
        createIssue(
          "enum",
          `${field.label} must be one of the allowed options.`,
          ruleText,
          "error",
          { allowed },
        ),
      );
    }
  }

  if (typeof field.pattern === "string" && field.pattern.trim()) {
    try {
      const pattern = new RegExp(field.pattern);
      if (typeof text === "string" && text && !pattern.test(text)) {
        issues.push(createIssue("pattern", `${field.label} is not in the expected format.`, ruleText));
      }
    } catch {
      // ignore invalid patterns
    }
  }

  if (field.type === "date") {
    const parsed = tryParseDate(toStringValue(value));
    if (!parsed.iso) {
      issues.push(createIssue("date", `${field.label} must be a valid date (YYYY-MM-DD).`, ruleText));
    } else if (parsed.warning) {
      issues.push({ ...parsed.warning, ruleText: ruleText ?? undefined });
    }
  }

  if (field.type === "string_list" && Array.isArray(value) && field.required && value.length === 0) {
    issues.push(createIssue("required", `${field.label} requires at least one entry.`, ruleText));
  }

  if (field.type === "object_list" && Array.isArray(value) && field.required && value.length === 0) {
    issues.push(createIssue("required", `${field.label} requires at least one entry.`, ruleText));
  }

  return issues;
}

/**
 * Normalize raw form values according to a charter form schema while collecting validation issues.
 * @param {{ fields?: Array<Record<string, any>> }} schema - Form schema describing charter fields.
 * @param {Record<string, any>} values - Raw form values keyed by field id.
 * @param {{ fieldRules?: Record<string, string> }} [options] - Optional configuration for rule text.
 * @returns {{ normalized: Record<string, any>, issues: Record<string, Array<Record<string, any>>> }}
 */
export function normalizeFormValues(schema, values, options = {}) {
  const fieldRules = options.fieldRules ?? defaultFieldRules;
  const normalized = {};
  const issues = {};

  const schemaFields = Array.isArray(schema?.fields) ? schema.fields : [];
  const sourceValues = values ?? {};

  for (const field of schemaFields) {
    if (!field || typeof field !== "object") {
      continue;
    }

    const fieldId = field.id;
    if (typeof fieldId !== "string" || !fieldId) {
      continue;
    }

    const contextValues = { ...normalized };
    const visible = evaluateVisibility(field, contextValues);
    const normalizedResult = normalizeField(field, sourceValues[fieldId]);

    if (!visible) {
      normalized[fieldId] = normalizedResult.structured;
      continue;
    }

    const ruleText = fieldRules?.[fieldId] ?? null;
    const fieldIssues = [
      ...(normalizedResult.warnings ?? []),
      ...runFieldValidation(field, normalizedResult, ruleText),
    ];

    if (fieldIssues.length > 0) {
      issues[fieldId] = fieldIssues;
    }

    const hasError = fieldIssues.some((issue) => issue.severity === "error");
    if (!hasError) {
      normalized[fieldId] = normalizedResult.structured;
    }
  }

  return { normalized, issues };
}
