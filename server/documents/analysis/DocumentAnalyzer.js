/**
 * Document Analysis Orchestrator
 *
 * Analyzes uploaded documents using LLM to determine:
 * - Document type classification
 * - Suggested extraction targets (charter, ddp, sow)
 * - Confidence scoring
 * - Preview field mappings
 *
 * @module server/documents/analysis/DocumentAnalyzer
 */

import OpenAI from "openai";
import { getAnalysisModel, getAnalysisConfidenceThreshold } from "../../../config/featureFlags.js";
import REGISTRY from "../../../lib/doc/registry.js";

/**
 * Source document type classifications
 */
const SOURCE_DOC_TYPES = [
  "project_scope",
  "meeting_notes",
  "requirements",
  "proposal",
  "contract",
  "email_thread",
  "presentation",
  "spreadsheet",
  "mixed",
  "unknown",
];

/**
 * Target document types we can extract to
 */
const TARGET_DOC_TYPES = Array.from(REGISTRY.keys());

/**
 * System prompt for document analysis
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a document analysis assistant. Your task is to analyze uploaded documents and determine:

1. **Document Classification**: What type of document is this? (project_scope, meeting_notes, requirements, proposal, contract, email_thread, presentation, spreadsheet, mixed, unknown)

2. **Intent/Purpose**: What was this document created for? What information does it contain?

3. **Extraction Targets**: Which project management documents could be populated from this content?
   - charter: Project Charter - for high-level project definition
   - ddp: Design & Development Plan - for technical requirements and specifications
   - sow: Statement of Work - for contractual deliverables and scope

4. **Field Preview**: For each suggested target, identify key fields that can be extracted.

5. **Confidence Scoring**:
   - High (>0.8): Clear document purpose, direct field mappings available
   - Medium (0.5-0.8): Some ambiguity, requires inference
   - Low (<0.5): Unclear purpose, multiple interpretations possible

6. **Classification Signals**: List specific evidence supporting your classification (e.g., "Contains 'Project Scope' heading", "Has milestone table", "Includes signature block")

Respond with a JSON object following this structure:
{
  "documentClassification": {
    "primaryType": "project_scope",
    "confidence": 0.87,
    "signals": ["Contains 'Project Scope' heading", "Has deliverables section"]
  },
  "suggestedTargets": [
    {
      "docType": "charter",
      "confidence": 0.87,
      "rationale": "Document contains project scope, vision, and timeline suitable for a Project Charter",
      "previewFields": {
        "project_name": "Extracted project name",
        "vision": "Extracted vision statement..."
      },
      "coverage": {
        "available": ["project_name", "vision", "scope_in"],
        "missing": ["sponsor", "project_lead"],
        "inferrable": ["start_date"]
      }
    }
  ],
  "alternativeTargets": [],
  "clarificationQuestions": []
}

If confidence is below 0.5, include clarificationQuestions to help refine the analysis.`;

/**
 * Create OpenAI client
 * @returns {OpenAI}
 */
function createClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error("OpenAI API key is not configured.");
    error.statusCode = 500;
    error.code = "missing_api_key";
    throw error;
  }
  return new OpenAI({ apiKey });
}

/**
 * Fields relevant for document classification analysis.
 * Only include fields that help determine document type and extraction targets.
 */
const RELEVANT_DRAFT_FIELDS = [
  "project_name",
  "description",
  "vision",
  "scope_in",
  "scope_out",
];

/**
 * Build the user message content for analysis
 *
 * Optimized for token efficiency:
 * - Limits total document content to 15000 chars (was per-attachment)
 * - Only includes last user message from conversation (was all 5 messages)
 * - Only includes relevant draft fields for classification (was entire object)
 *
 * @param {Object} params
 * @param {Array} params.attachments - Document attachments with text
 * @param {Array} [params.conversationContext] - Optional chat context
 * @param {Object} [params.existingDraft] - Optional existing draft values
 * @returns {string}
 */
function buildAnalysisInput({ attachments, conversationContext, existingDraft }) {
  const sections = [];

  // Add document content with total limit (not per-attachment)
  if (Array.isArray(attachments) && attachments.length > 0) {
    sections.push("## Document Content\n");
    let totalChars = 0;
    const maxTotalChars = 15000;

    for (const attachment of attachments) {
      if (!attachment?.text) continue;
      const name = attachment.name || "Uploaded Document";
      const remainingChars = maxTotalChars - totalChars;
      if (remainingChars <= 0) break;

      const text = attachment.text.slice(0, remainingChars);
      sections.push(`### ${name}\n${text}\n`);
      totalChars += text.length;
    }
  }

  // Add only last user message for context (reduces tokens by ~60%)
  if (Array.isArray(conversationContext) && conversationContext.length > 0) {
    const lastUserMessage = conversationContext
      .filter((msg) => typeof msg === "string" && msg.trim())
      .slice(-1)[0];
    if (lastUserMessage) {
      sections.push("## User Context\n");
      sections.push(lastUserMessage.slice(0, 500));
    }
  }

  // Add only relevant draft fields for classification (reduces tokens by ~50%)
  if (existingDraft && typeof existingDraft === "object") {
    const relevantFields = {};
    for (const field of RELEVANT_DRAFT_FIELDS) {
      if (existingDraft[field] && typeof existingDraft[field] === "string") {
        relevantFields[field] = existingDraft[field].slice(0, 200);
      }
    }
    if (Object.keys(relevantFields).length > 0) {
      sections.push("## Existing Draft Fields\n");
      sections.push(JSON.stringify(relevantFields, null, 2));
    }
  }

  return sections.join("\n\n");
}

/**
 * Parse and validate analysis response
 *
 * @param {string} content - Raw response content
 * @returns {Object} Validated analysis object
 */
function parseAnalysisResponse(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Return minimal valid structure on parse failure
    return {
      documentClassification: {
        primaryType: "unknown",
        confidence: 0.3,
        signals: ["Failed to parse analysis response"],
      },
      suggestedTargets: [],
      alternativeTargets: [],
      clarificationQuestions: ["Could you tell me more about this document and what you'd like to create from it?"],
    };
  }

  // Validate and normalize the response
  const analysis = {
    documentClassification: {
      primaryType: parsed.documentClassification?.primaryType || "unknown",
      confidence: Math.min(1, Math.max(0, Number(parsed.documentClassification?.confidence) || 0.5)),
      signals: Array.isArray(parsed.documentClassification?.signals)
        ? parsed.documentClassification.signals
        : [],
    },
    suggestedTargets: [],
    alternativeTargets: [],
    clarificationQuestions: [],
  };

  // Normalize suggested targets
  if (Array.isArray(parsed.suggestedTargets)) {
    for (const target of parsed.suggestedTargets) {
      if (!target?.docType || !TARGET_DOC_TYPES.includes(target.docType)) continue;
      analysis.suggestedTargets.push({
        docType: target.docType,
        confidence: Math.min(1, Math.max(0, Number(target.confidence) || 0.5)),
        rationale: String(target.rationale || ""),
        previewFields: target.previewFields && typeof target.previewFields === "object"
          ? target.previewFields
          : {},
        coverage: {
          available: Array.isArray(target.coverage?.available) ? target.coverage.available : [],
          missing: Array.isArray(target.coverage?.missing) ? target.coverage.missing : [],
          inferrable: Array.isArray(target.coverage?.inferrable) ? target.coverage.inferrable : [],
        },
      });
    }
  }

  // Normalize alternative targets
  if (Array.isArray(parsed.alternativeTargets)) {
    for (const target of parsed.alternativeTargets) {
      if (!target?.docType || !TARGET_DOC_TYPES.includes(target.docType)) continue;
      analysis.alternativeTargets.push({
        docType: target.docType,
        confidence: Math.min(1, Math.max(0, Number(target.confidence) || 0.3)),
        rationale: String(target.rationale || ""),
      });
    }
  }

  // Normalize clarification questions
  if (Array.isArray(parsed.clarificationQuestions)) {
    analysis.clarificationQuestions = parsed.clarificationQuestions
      .filter((q) => typeof q === "string" && q.trim())
      .map((q) => q.trim());
  }

  return analysis;
}

/**
 * Analyze uploaded documents to determine type and extraction targets
 *
 * @param {Object} params
 * @param {Array} params.attachments - Document attachments with extracted text
 * @param {Array} [params.conversationContext] - Optional chat context
 * @param {Object} [params.existingDraft] - Optional existing draft values
 * @returns {Promise<Object>} Analysis result
 */
export async function analyzeDocument({ attachments, conversationContext, existingDraft }) {
  // Validate attachments
  if (!Array.isArray(attachments) || attachments.length === 0) {
    const error = new Error("At least one attachment with text content is required for analysis.");
    error.statusCode = 400;
    error.code = "missing_attachments";
    throw error;
  }

  const hasContent = attachments.some((a) => a?.text && typeof a.text === "string" && a.text.trim());
  if (!hasContent) {
    const error = new Error("Attachments must contain extracted text for analysis.");
    error.statusCode = 400;
    error.code = "empty_attachments";
    throw error;
  }

  const client = createClient();
  const model = getAnalysisModel();
  const confidenceThreshold = getAnalysisConfidenceThreshold();

  const userContent = buildAnalysisInput({ attachments, conversationContext, existingDraft });

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    const responseContent = completion.choices?.[0]?.message?.content || "{}";
    const analysis = parseAnalysisResponse(responseContent);

    // Determine status based on confidence
    const primaryConfidence = analysis.suggestedTargets[0]?.confidence ?? 0;
    const status = primaryConfidence >= confidenceThreshold ? "analyzed" : "needs_clarification";

    // Build raw content summary
    const rawContent = {
      extractedText: attachments
        .map((a) => a?.text || "")
        .join("\n\n---\n\n")
        .slice(0, 20000),
      tables: [],
      metadata: {
        attachmentCount: attachments.length,
        totalCharacters: attachments.reduce((sum, a) => sum + (a?.text?.length || 0), 0),
      },
    };

    return {
      status,
      analysis,
      rawContent,
    };
  } catch (error) {
    // Handle OpenAI API errors
    if (error.statusCode) {
      throw error;
    }

    const status = error?.status || error?.response?.status || 500;
    const message = error?.error?.message || error?.message || "Document analysis failed";

    const apiError = new Error(message);
    apiError.statusCode = status;
    apiError.code = error?.code || "analysis_error";
    throw apiError;
  }
}

export default {
  analyzeDocument,
};
