#!/usr/bin/env node
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCX_FILENAME = "project_charter_tokens.docx";
const SCHEMA_FILENAME = "charter.schema.json";

function snakeToCamel(snake) {
  return snake.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toSnakeCase(value) {
  if (!value) {
    return "";
  }

  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildSchemaMetadata(schema) {
  const properties = schema?.properties && typeof schema.properties === "object"
    ? schema.properties
    : {};

  const allowedCanonical = new Set();
  const loopCanonical = new Set();

  for (const [key, definition] of Object.entries(properties)) {
    const camelKey = snakeToCamel(key);
    allowedCanonical.add(key);
    allowedCanonical.add(toSnakeCase(camelKey));

    if (definition && definition.type === "array") {
      loopCanonical.add(key);
      loopCanonical.add(toSnakeCase(camelKey));

      const items = definition.items;
      if (items && items.type === "object") {
        const nestedKeys = new Set([
          ...(Array.isArray(items.required) ? items.required : []),
          ...Object.keys(items.properties || {}),
        ]);

        for (const nestedKey of nestedKeys) {
          const camelNested = snakeToCamel(nestedKey);
          allowedCanonical.add(nestedKey);
          allowedCanonical.add(toSnakeCase(camelNested));
        }
      }
    }
  }

  // Array-of-strings loops may legitimately use the dot token inside the section.
  allowedCanonical.add(".");
    // Allow loops for responsibilities even though it's a string in the schema
  loopCanonical.add("responsibilities");

  return { allowedCanonical, loopCanonical };
}


async function loadDocxBuffer(docxPath) {
  try {
    return await readFile(docxPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Template not found at ${docxPath}. Run \`node templates/sync-charter-template.mjs decode\` to materialize the DOCX before linting.`
      );
    }
    throw new Error(`Unable to read DOCX template at ${docxPath}: ${error.message}`);
  }
}

function decodeXmlEntities(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractPlainText(content) {
  if (typeof content !== "string") {
    return "";
  }

  const withoutTags = content.replace(/<[^>]*>/g, "");
  return decodeXmlEntities(withoutTags);
}

async function extractTokens(buffer) {
  let PizZip;
  try {
    ({ default: PizZip } = await import("pizzip"));
  } catch (error) {
    throw new Error(
      "Missing dependency 'pizzip'. Install project dependencies with `npm install` before running this script."
    );
  }

  const zip = new PizZip(buffer);
  const tokens = new Set();
  const tokenPattern = /{{\s*([^{}]+?)\s*}}/g;

  for (const [filename, file] of Object.entries(zip.files || {})) {
    if (!filename.endsWith(".xml")) {
      continue;
    }

    let content;
    try {
      content = typeof file.asText === "function" ? file.asText() : null;
    } catch (error) {
      content = null;
    }

    const plain = extractPlainText(content);
    if (!plain.includes("{{")) {
      continue;
    }

    tokenPattern.lastIndex = 0;
    let match;
    while ((match = tokenPattern.exec(plain)) !== null) {
      const raw = match[1]?.trim();
      if (raw) {
        tokens.add(raw);
      }
    }
  }

  return tokens;
}

function validateTokens(tokens, metadata) {
  const { allowedCanonical, loopCanonical } = metadata;
  const disallowed = new Set();

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    if (token === ".") {
      continue;
    }

    const prefix = token[0];
    if (["#", "/", "^"].includes(prefix)) {
      const base = token.slice(1).trim();
      if (!base) {
        disallowed.add(token);
        continue;
      }

      const canonical = toSnakeCase(base);
      if (!loopCanonical.has(canonical)) {
        disallowed.add(token);
      }
      continue;
    }

    const canonical = toSnakeCase(token);
    if (!allowedCanonical.has(canonical)) {
      disallowed.add(token);
    }
  }

  return Array.from(disallowed);
}

async function main() {
  const docxPath = path.resolve(__dirname, "..", DOCX_FILENAME);
  const schemaPath = path.resolve(__dirname, "..", SCHEMA_FILENAME);

  const [buffer, schemaContents] = await Promise.all([
    loadDocxBuffer(docxPath),
    readFile(schemaPath, "utf8"),
  ]);

  let schema;
  try {
    schema = JSON.parse(schemaContents);
  } catch (error) {
    throw new Error(`Unable to parse schema file at ${schemaPath}: ${error.message}`);
  }

  const metadata = buildSchemaMetadata(schema);
  const tokens = await extractTokens(buffer);

  const failures = validateTokens(tokens, metadata);

  if (failures.length > 0) {
    console.error("Found tokens that do not map to schema keys:");
    for (const token of failures.sort((a, b) => a.localeCompare(b))) {
      console.error(` - {{${token}}}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `DOCX tokens in ${DOCX_FILENAME} match the schema defined in ${SCHEMA_FILENAME}.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
