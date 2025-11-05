import type { CharterField } from "./schema";

export type ValidationResult =
  | { valid: true; message?: undefined }
  | { valid: false; message: string };

type Validator = (value: string) => ValidationResult;

const REQUIRED_MESSAGE = "This field is required.";
const DATE_MESSAGE = "Enter a valid date in YYYY-MM-DD format.";
const MONEY_MESSAGE =
  "Enter a valid amount using digits, optional commas, and cents (e.g. 12,345.67).";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONEY_RE = /^\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?$/;

function toStringValue(value: string | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

function isValidIsoDate(value: string): boolean {
  const match = value.match(ISO_DATE_RE);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

export const nonEmpty: Validator = (raw) => {
  const value = toStringValue(raw).trim();
  if (!value) {
    return { valid: false, message: REQUIRED_MESSAGE };
  }
  return { valid: true };
};

export const date: Validator = (raw) => {
  const value = toStringValue(raw).trim();
  if (!value || !isValidIsoDate(value)) {
    return { valid: false, message: DATE_MESSAGE };
  }
  return { valid: true };
};

export const money: Validator = (raw) => {
  const value = toStringValue(raw).trim();
  if (!value || !MONEY_RE.test(value)) {
    return { valid: false, message: MONEY_MESSAGE };
  }
  return { valid: true };
};

export const text = (raw: string, maxLength?: number | null): ValidationResult => {
  const value = toStringValue(raw);
  if (!value.trim()) {
    return { valid: true };
  }

  if (typeof maxLength === "number" && maxLength > 0 && value.length > maxLength) {
    return {
      valid: false,
      message: `Enter ${maxLength} characters or fewer.`,
    };
  }

  return { valid: true };
};

export function validateField(
  field: CharterField,
  rawValue: string | null | undefined
): ValidationResult {
  const value = toStringValue(rawValue);
  const trimmed = value.trim();

  if (field.required) {
    const requiredResult = nonEmpty(value);
    if (!requiredResult.valid) {
      return requiredResult;
    }
  }

  if (!trimmed) {
    return { valid: true };
  }

  switch (field.type) {
    case "date":
      return date(trimmed);
    default:
      return text(trimmed, field.maxLength ?? undefined);
  }
}
