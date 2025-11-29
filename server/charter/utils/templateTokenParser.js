/**
 * Template Token Parser
 *
 * Extracts and analyzes token placeholders from DOCX templates.
 * Used to validate that formSchema.json fields align with template tokens.
 */

import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";

/**
 * Extract all template tokens from a DOCX buffer
 * @param {Buffer} docxBuffer - The DOCX file as a buffer
 * @returns {Object} Parsed token information
 */
export function extractTokensFromBuffer(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("Invalid DOCX: word/document.xml not found");
  }

  const xml = documentFile.asText();
  return parseTokensFromXml(xml);
}

/**
 * Parse tokens from XML content
 * @param {string} xml - The document.xml content
 * @returns {Object} Parsed token information
 */
export function parseTokensFromXml(xml) {
  const tokens = {
    scalar: new Set(),      // Simple {{field}} tokens
    loops: new Map(),       // {{#array}}...{{/array}} with their child tokens
    all: new Set(),         // All token names
  };

  // Match all mustache-style tokens: {{...}} or {...}
  // Including special {{.}} for current item in loops
  const tokenRegex = /\{+\s*([#/]?)(\.|\w+)\s*\}+/g;

  const loopStack = [];
  let match;

  while ((match = tokenRegex.exec(xml)) !== null) {
    const [, modifier, tokenName] = match;

    if (modifier === "#") {
      // Opening loop tag
      loopStack.push({ name: tokenName, children: new Set() });
      tokens.all.add(tokenName);
    } else if (modifier === "/") {
      // Closing loop tag
      const loop = loopStack.pop();
      if (loop && loop.name === tokenName) {
        tokens.loops.set(tokenName, {
          children: Array.from(loop.children),
        });
      }
    } else if (tokenName === ".") {
      // Current item reference in a loop
      if (loopStack.length > 0) {
        loopStack[loopStack.length - 1].children.add(".");
      }
    } else {
      // Regular token
      tokens.all.add(tokenName);

      if (loopStack.length > 0) {
        // Token is inside a loop - it's a child field
        loopStack[loopStack.length - 1].children.add(tokenName);
      } else {
        // Top-level scalar token
        tokens.scalar.add(tokenName);
      }
    }
  }

  return {
    scalar: Array.from(tokens.scalar),
    loops: Object.fromEntries(tokens.loops),
    all: Array.from(tokens.all),
  };
}

/**
 * Load and parse tokens from a base64-encoded template file
 * @param {string} templatePath - Path to the .b64 template file
 * @returns {Promise<Object>} Parsed token information
 */
export async function extractTokensFromFile(templatePath) {
  const b64Content = await fs.readFile(templatePath, "utf8");
  const buffer = Buffer.from(b64Content.trim(), "base64");
  return extractTokensFromBuffer(buffer);
}

/**
 * Compare template tokens against a form schema
 * @param {Object} templateTokens - Output from extractTokensFromBuffer
 * @param {Object} formSchema - The formSchema.json content
 * @returns {Object} Comparison results with matches and mismatches
 */
export function compareTokensToSchema(templateTokens, formSchema) {
  const schemaFields = new Map();
  const schemaChildFields = new Map();
  const allSchemaChildIds = new Set();

  // Build maps of schema fields
  for (const field of formSchema.fields || []) {
    schemaFields.set(field.id, field);

    if (field.type === "object_list" && Array.isArray(field.fields)) {
      const children = new Set(field.fields.map((f) => f.id));
      schemaChildFields.set(field.id, children);
      // Track all child IDs so we can identify nested loops
      for (const child of field.fields) {
        allSchemaChildIds.add(child.id);
      }
    }
  }

  const results = {
    matched: [],
    missingInTemplate: [],
    missingInSchema: [],
    loopMismatches: [],
  };

  // Check scalar tokens
  for (const token of templateTokens.scalar) {
    if (schemaFields.has(token)) {
      results.matched.push(token);
    } else if (!allSchemaChildIds.has(token)) {
      // Only report as missing if it's not a known child field
      results.missingInSchema.push(token);
    }
  }

  // Check loop tokens
  for (const [loopName, loopData] of Object.entries(templateTokens.loops)) {
    // Skip nested loops that are child fields (e.g., responsibilities within core_team)
    // These are used for textarea fields that contain multiple items
    if (allSchemaChildIds.has(loopName)) {
      continue;
    }

    if (!schemaFields.has(loopName)) {
      results.missingInSchema.push(loopName);
      continue;
    }

    const field = schemaFields.get(loopName);

    if (field.type === "string_list") {
      // String lists use {{.}} for items - they should have "." as their only meaningful child
      const hasDotChild = loopData.children.includes(".");
      if (hasDotChild) {
        results.matched.push(loopName);
      } else {
        results.loopMismatches.push({
          field: loopName,
          message: "String list should use {{.}} for items",
          found: loopData.children,
        });
      }
    } else if (field.type === "object_list") {
      // Object lists should have matching child fields
      const expectedChildren = schemaChildFields.get(loopName) || new Set();

      // Build set of found children - include both direct tokens and nested loops
      // A child can appear as: {{childName}} or {{#childName}}...{{/childName}}
      const foundChildren = new Set();
      for (const child of loopData.children) {
        if (child !== ".") {
          foundChildren.add(child);
        }
      }
      // Also include any nested loops that are expected children
      for (const childId of expectedChildren) {
        if (templateTokens.loops[childId]) {
          foundChildren.add(childId);
        }
      }

      const missingChildren = [...expectedChildren].filter(
        (c) => !foundChildren.has(c)
      );
      const extraChildren = [...foundChildren].filter(
        (c) => !expectedChildren.has(c)
      );

      if (missingChildren.length === 0 && extraChildren.length === 0) {
        results.matched.push(loopName);
      } else {
        results.loopMismatches.push({
          field: loopName,
          missingChildren,
          extraChildren,
        });
      }
    }
  }

  // Check for schema fields not in template
  for (const field of formSchema.fields || []) {
    const inTemplate =
      templateTokens.scalar.includes(field.id) ||
      Object.keys(templateTokens.loops).includes(field.id);

    if (!inTemplate) {
      results.missingInTemplate.push(field.id);
    }
  }

  return results;
}

/**
 * Validate a template against its form schema
 * @param {string} templatePath - Path to the .b64 template file
 * @param {string} schemaPath - Path to the formSchema.json file
 * @returns {Promise<Object>} Validation results
 */
export async function validateTemplateAgainstSchema(templatePath, schemaPath) {
  const tokens = await extractTokensFromFile(templatePath);
  const schemaContent = await fs.readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaContent);

  const comparison = compareTokensToSchema(tokens, schema);

  const isValid =
    comparison.missingInSchema.length === 0 &&
    comparison.missingInTemplate.length === 0 &&
    comparison.loopMismatches.length === 0;

  return {
    isValid,
    tokens,
    comparison,
    summary: {
      matched: comparison.matched.length,
      missingInSchema: comparison.missingInSchema.length,
      missingInTemplate: comparison.missingInTemplate.length,
      loopMismatches: comparison.loopMismatches.length,
    },
  };
}

export default {
  extractTokensFromBuffer,
  extractTokensFromFile,
  parseTokensFromXml,
  compareTokensToSchema,
  validateTemplateAgainstSchema,
};
