import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeCharterFormSchema } from "../server/charter/utils/serverFormSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadJson(relativePath) {
  const absolutePath = path.resolve(__dirname, "..", relativePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw);
}

function toExpectedChildField(child) {
  return {
    id: child.id,
    label: typeof child.label === "string" && child.label.trim() ? child.label.trim() : child.id,
    type: typeof child.type === "string" && child.type.trim() ? child.type.trim() : "string",
    placeholder:
      typeof child.placeholder === "string"
        ? child.placeholder.trim().length > 0
          ? child.placeholder.trim()
          : ""
        : null,
  };
}

function toExpectedField(field) {
  const expected = {
    id: field.id,
    label: typeof field.label === "string" && field.label.trim() ? field.label.trim() : field.id,
    help_text:
      typeof field.help_text === "string"
        ? field.help_text.trim().length > 0
          ? field.help_text.trim()
          : ""
        : null,
    required: field.required === true,
    type: typeof field.type === "string" && field.type.trim() ? field.type.trim() : "string",
    options: Array.isArray(field.options) ? field.options.slice() : [],
    max_length:
      typeof field.max_length === "number" && Number.isFinite(field.max_length)
        ? field.max_length
        : null,
    pattern:
      typeof field.pattern === "string"
        ? field.pattern.trim().length > 0
          ? field.pattern.trim()
          : ""
        : null,
    placeholder:
      typeof field.placeholder === "string"
        ? field.placeholder.trim().length > 0
          ? field.placeholder.trim()
          : ""
        : null,
    example:
      typeof field.example === "string"
        ? field.example.trim().length > 0
          ? field.example.trim()
          : ""
        : null,
    visibility:
      field && typeof field.visibility === "object" && field.visibility !== null && !Array.isArray(field.visibility)
        ? field.visibility
        : null,
  };

  if (Array.isArray(field.fields) && field.fields.length > 0) {
    expected.fields = field.fields.map((child) => toExpectedChildField(child));
  } else {
    expected.fields = undefined;
  }

  return expected;
}

function buildExpectedSchema(raw) {
  return {
    document_type: raw.document_type,
    version: raw.version,
    fields: Array.isArray(raw.fields) ? raw.fields.map((field) => toExpectedField(field)) : [],
  };
}

test("normalizeCharterFormSchema matches the charter template", async () => {
  const raw = await loadJson("templates/charter/formSchema.json");
  const normalized = normalizeCharterFormSchema(raw);
  const expected = buildExpectedSchema(raw);
  assert.deepStrictEqual(normalized, expected);
});

test("normalizeCharterFormSchema rejects malformed input", () => {
  assert.throws(() => normalizeCharterFormSchema(null), /Form schema must be an object/);

  assert.throws(
    () =>
      normalizeCharterFormSchema({
        document_type: "not-charter",
        version: "1.0",
        fields: [],
      }),
    /Unexpected form schema type/
  );

  assert.throws(
    () =>
      normalizeCharterFormSchema({
        document_type: "charter",
        version: "2024.10",
      }),
    /Form schema is missing fields/
  );
});
