/**
 * MCP Tool Definitions for Exact Virtual Assistant
 *
 * These tools wrap existing capabilities and expose them to AI orchestration.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Document extraction tool - wraps extractFieldsFromUtterance
 */
export const documentExtractTool: Tool = {
  name: "document_extract",
  description:
    "Extract structured fields from uploaded documents or conversation context into a project document (Charter, DDP, SOW)",
  inputSchema: {
    type: "object" as const,
    properties: {
      docType: {
        type: "string",
        enum: ["charter", "ddp", "sow"],
        description: "Target document type to extract into",
      },
      context: {
        type: "string",
        description: "Text content to extract from (conversation, document text, etc.)",
      },
      attachmentIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of uploaded attachments to include in extraction",
      },
      fieldIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific field IDs to extract. If omitted, extracts all available fields.",
      },
    },
    required: ["docType"],
  },
};

/**
 * Document validation tool - wraps /api/documents/validate
 */
export const documentValidateTool: Tool = {
  name: "document_validate",
  description:
    "Validate extracted document fields against schema rules. Returns validation errors and normalized values.",
  inputSchema: {
    type: "object" as const,
    properties: {
      docType: {
        type: "string",
        enum: ["charter", "ddp", "sow"],
        description: "Document type to validate against",
      },
      fields: {
        type: "object",
        description: "Field ID to value mapping to validate",
      },
    },
    required: ["docType", "fields"],
  },
};

/**
 * Document review tool - wraps /api/documents/review
 */
export const documentReviewTool: Tool = {
  name: "document_review",
  description:
    "Get AI-powered quality review with scores across 6 dimensions: completeness, specificity, feasibility, risk_coverage, scope_clarity, metric_measurability. Returns overall score, dimension scores, strengths, and actionable feedback.",
  inputSchema: {
    type: "object" as const,
    properties: {
      docType: {
        type: "string",
        enum: ["charter", "ddp", "sow"],
        description: "Document type being reviewed",
      },
      fields: {
        type: "object",
        description: "Document field values to review",
      },
      dimensions: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "completeness",
            "specificity",
            "feasibility",
            "risk_coverage",
            "scope_clarity",
            "metric_measurability",
          ],
        },
        description: "Specific dimensions to evaluate. If omitted, evaluates all dimensions.",
      },
    },
    required: ["docType", "fields"],
  },
};

/**
 * Document render tool - wraps /api/documents/render
 */
export const documentRenderTool: Tool = {
  name: "document_render",
  description:
    "Render a document to DOCX or PDF format. Returns a download URL for the generated file.",
  inputSchema: {
    type: "object" as const,
    properties: {
      docType: {
        type: "string",
        enum: ["charter", "ddp", "sow"],
        description: "Document type to render",
      },
      fields: {
        type: "object",
        description: "Document field values to render",
      },
      format: {
        type: "string",
        enum: ["docx", "pdf"],
        default: "docx",
        description: "Output format",
      },
    },
    required: ["docType", "fields"],
  },
};

/**
 * Document analysis tool - wraps /api/documents/analyze
 */
export const documentAnalyzeTool: Tool = {
  name: "document_analyze",
  description:
    "Analyze an uploaded document to classify its type and suggest extraction targets. Returns document classification, confidence score, and recommended actions.",
  inputSchema: {
    type: "object" as const,
    properties: {
      attachmentId: {
        type: "string",
        description: "ID of the uploaded attachment to analyze",
      },
      content: {
        type: "string",
        description: "Raw text content to analyze (if no attachment)",
      },
    },
  },
};

/**
 * Field feedback tool - provides detailed feedback for specific fields
 */
export const fieldFeedbackTool: Tool = {
  name: "field_feedback",
  description:
    "Get detailed feedback and suggestions for improving a specific field value. Useful for explaining validation errors or suggesting improvements.",
  inputSchema: {
    type: "object" as const,
    properties: {
      docType: {
        type: "string",
        enum: ["charter", "ddp", "sow"],
        description: "Document type containing the field",
      },
      fieldId: {
        type: "string",
        description: "ID of the field to get feedback for",
      },
      currentValue: {
        type: "string",
        description: "Current value of the field",
      },
      context: {
        type: "string",
        description: "Additional context about the project for better suggestions",
      },
    },
    required: ["docType", "fieldId", "currentValue"],
  },
};

/**
 * Draft update tool - updates fields in the current draft
 */
export const draftUpdateTool: Tool = {
  name: "draft_update",
  description:
    "Update specific fields in the current document draft. Respects field locks by default (skips fields the user has manually edited).",
  inputSchema: {
    type: "object" as const,
    properties: {
      fields: {
        type: "object",
        description: "Field ID to value mapping for fields to update",
      },
      respectLocks: {
        type: "boolean",
        default: true,
        description: "If true, skip fields that the user has manually edited (locked)",
      },
    },
    required: ["fields"],
  },
};

/**
 * Guided navigation tool - controls the guided charter session
 */
export const guidedNavigateTool: Tool = {
  name: "guided_navigate",
  description:
    "Navigate within the guided document creation session. Supports moving between fields, skipping, going back, or jumping to review.",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["next", "back", "skip", "review", "goto"],
        description: "Navigation action to perform",
      },
      targetFieldId: {
        type: "string",
        description: "For 'goto' action, the field ID to jump to",
      },
    },
    required: ["action"],
  },
};

/**
 * All internal tools exposed by the Exact VA MCP server
 */
export const exactVATools: Tool[] = [
  documentExtractTool,
  documentValidateTool,
  documentReviewTool,
  documentRenderTool,
  documentAnalyzeTool,
  fieldFeedbackTool,
  draftUpdateTool,
  guidedNavigateTool,
];

export default exactVATools;
