/**
 * Knowledge Database Query Service
 *
 * Queries the knowledge database for relevant entries based on document content,
 * field triggers, and conditions. Used to inject best practices into review prompts.
 */

import fs from "fs/promises";
import path from "path";

const knowledgeCache = new Map();
const TEMPLATES_DIR = process.cwd() + "/templates/knowledge";

/**
 * Load knowledge entries from a category file
 */
async function loadKnowledgeCategory(category) {
  if (knowledgeCache.has(category)) {
    return knowledgeCache.get(category);
  }

  const entries = [];
  const categoryDir = path.join(TEMPLATES_DIR, category);

  try {
    const files = await fs.readdir(categoryDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(categoryDir, file), "utf8");
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed)) {
          entries.push(...parsed);
        } else if (parsed && typeof parsed === "object") {
          entries.push(parsed);
        }
      } catch (parseError) {
        console.warn(`Failed to parse knowledge file ${file}:`, parseError.message);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Failed to load knowledge category ${category}:`, error.message);
    }
  }

  knowledgeCache.set(category, entries);
  return entries;
}

/**
 * Evaluate a condition against a document
 */
function evaluateCondition(condition, document) {
  if (!condition || !condition.field || !condition.operator) {
    return false;
  }

  const fieldValue = document[condition.field];

  switch (condition.operator) {
    case "empty":
      return (
        fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === "" ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );

    case "less_than":
      if (Array.isArray(fieldValue)) {
        return fieldValue.length < condition.value;
      }
      if (typeof fieldValue === "number") {
        return fieldValue < condition.value;
      }
      return false;

    case "contains":
      if (typeof fieldValue === "string") {
        return fieldValue.toLowerCase().includes(String(condition.value).toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((item) => {
          if (typeof item === "string") {
            return item.toLowerCase().includes(String(condition.value).toLowerCase());
          }
          return false;
        });
      }
      return false;

    case "missing_keyword":
      if (typeof fieldValue === "string") {
        return !fieldValue.toLowerCase().includes(String(condition.value).toLowerCase());
      }
      return true;

    case "not_empty":
      return (
        fieldValue !== undefined &&
        fieldValue !== null &&
        fieldValue !== "" &&
        (!Array.isArray(fieldValue) || fieldValue.length > 0)
      );

    default:
      return false;
  }
}

/**
 * Check if a knowledge entry is triggered by the document
 */
function isEntryTriggered(entry, document, docType) {
  if (!entry.triggers) {
    // No triggers means always include (general best practice)
    return true;
  }

  const { fields, keywords, conditions } = entry.triggers;

  // Check field triggers
  if (Array.isArray(fields) && fields.length > 0) {
    const documentFields = Object.keys(document);
    const hasMatchingField = fields.some((field) => documentFields.includes(field));
    if (!hasMatchingField) {
      return false;
    }
  }

  // Check keyword triggers
  if (Array.isArray(keywords) && keywords.length > 0) {
    const documentText = JSON.stringify(document).toLowerCase();
    const hasMatchingKeyword = keywords.some((keyword) =>
      documentText.includes(keyword.toLowerCase())
    );
    if (!hasMatchingKeyword) {
      return false;
    }
  }

  // Check conditions
  if (Array.isArray(conditions) && conditions.length > 0) {
    const allConditionsMet = conditions.every((condition) =>
      evaluateCondition(condition, document)
    );
    if (!allConditionsMet) {
      return false;
    }
  }

  return true;
}

/**
 * Query knowledge database for relevant entries
 *
 * @param {object} options - Query options
 * @param {string[]} options.categories - Knowledge categories to query
 * @param {object} options.document - Document to match against triggers
 * @param {string} options.docType - Document type
 * @returns {Promise<object[]>} Matching knowledge entries
 */
export async function queryKnowledge({ categories = [], document = {}, docType = "" }) {
  const allEntries = [];

  // Load entries from all specified categories
  for (const category of categories) {
    const entries = await loadKnowledgeCategory(category);
    allEntries.push(...entries);
  }

  // Also load general knowledge if not already included
  if (!categories.includes("general")) {
    const generalEntries = await loadKnowledgeCategory("general");
    allEntries.push(...generalEntries);
  }

  // Filter entries by triggers
  const matchingEntries = allEntries.filter((entry) =>
    isEntryTriggered(entry, document, docType)
  );

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  matchingEntries.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 1;
    const bPriority = priorityOrder[b.priority] ?? 1;
    return aPriority - bPriority;
  });

  // Deduplicate by ID
  const seen = new Set();
  const deduplicated = [];
  for (const entry of matchingEntries) {
    if (entry.id && !seen.has(entry.id)) {
      seen.add(entry.id);
      deduplicated.push(entry);
    } else if (!entry.id) {
      deduplicated.push(entry);
    }
  }

  return deduplicated;
}

/**
 * Format knowledge entries for inclusion in a prompt
 */
export function formatKnowledgeForPrompt(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }

  const sections = [];

  // Group by type
  const byType = {};
  for (const entry of entries) {
    const type = entry.type || "general";
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(entry);
  }

  // Format each type
  const typeLabels = {
    best_practice: "Best Practices",
    checklist: "Checklists",
    example: "Examples",
    anti_pattern: "Common Pitfalls",
    rule: "Rules",
    general: "General Guidelines",
  };

  for (const [type, typeEntries] of Object.entries(byType)) {
    const label = typeLabels[type] || type;
    const formatted = typeEntries
      .map((entry) => {
        const title = entry.title || "Untitled";
        const content = entry.content || "";
        return `### ${title}\n${content}`;
      })
      .join("\n\n");

    sections.push(`## ${label}\n\n${formatted}`);
  }

  return sections.join("\n\n");
}

/**
 * Get all knowledge entries for a category (for admin purposes)
 */
export async function getAllKnowledge(category) {
  return loadKnowledgeCategory(category);
}

/**
 * Clear knowledge cache (for testing)
 */
export function __clearKnowledgeCache() {
  knowledgeCache.clear();
}
