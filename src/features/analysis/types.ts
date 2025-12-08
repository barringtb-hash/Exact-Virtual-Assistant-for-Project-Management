/**
 * Type definitions for the document analysis feature.
 *
 * These types define the API response shapes and state structures
 * for the LLM-based document analysis workflow.
 *
 * @module features/analysis/types
 */

/**
 * Supported document types for extraction targets.
 */
export type DocType = "charter" | "ddp" | "sow";

/**
 * Analysis workflow states following the state machine design.
 */
export type AnalysisStatus =
  | "idle"
  | "analyzing"
  | "awaiting_confirmation"
  | "needs_clarification"
  | "extracting"
  | "complete"
  | "error";

/**
 * Confidence level thresholds for UI display.
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Document classification result from analysis.
 */
export interface DocumentClassification {
  /** Primary document type classification */
  primaryType: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Evidence signals supporting this classification */
  signals: string[];
}

/**
 * Field coverage information for a suggested target.
 */
export interface FieldCoverage {
  /** Fields that can be directly populated */
  available: string[];
  /** Fields that are missing from the source document */
  missing: string[];
  /** Fields that can be inferred with reasoning */
  inferrable: string[];
}

/**
 * Suggested target document type from analysis.
 */
export interface SuggestedTarget {
  /** Target document type */
  docType: DocType;
  /** Confidence score (0-1) for this target */
  confidence: number;
  /** Reasoning for this suggestion */
  rationale: string;
  /** Preview of extractable field values */
  previewFields: Record<string, unknown>;
  /** Field coverage information */
  coverage: FieldCoverage;
}

/**
 * Alternative target option with lower confidence.
 */
export interface AlternativeTarget {
  /** Alternative document type */
  docType: DocType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Brief rationale for this alternative */
  rationale: string;
}

/**
 * Complete analysis result from the LLM.
 */
export interface AnalysisResult {
  /** Document classification details */
  documentClassification: DocumentClassification;
  /** Primary suggested targets ordered by confidence */
  suggestedTargets: SuggestedTarget[];
  /** Alternative lower-confidence targets */
  alternativeTargets: AlternativeTarget[];
  /** Questions for user when confidence is low */
  clarificationQuestions: string[];
}

/**
 * Raw extracted content from the uploaded document.
 */
export interface RawContent {
  /** Extracted text content */
  extractedText: string;
  /** Extracted tables (if any) */
  tables: unknown[];
  /** Document metadata */
  metadata: Record<string, unknown>;
}

/**
 * Response from POST /api/documents/analyze endpoint.
 */
export interface AnalyzeResponse {
  /** Analysis status */
  status: "analyzed" | "needs_clarification";
  /** Unique identifier for this analysis session */
  analysisId: string;
  /** HMAC signature for serverless fallback verification */
  analysisSignature: string;
  /** Complete analysis result */
  analysis: AnalysisResult;
  /** Raw extracted content */
  raw: RawContent;
}

/**
 * Request body for POST /api/documents/confirm endpoint.
 */
export interface ConfirmRequest {
  /** Analysis ID to confirm */
  analysisId: string;
  /** User's confirmed selection */
  confirmed: {
    /** Selected document type */
    docType: DocType;
    /** Action to perform */
    action: "create" | "update";
    /** Optional field overrides from user edits */
    fieldOverrides?: Record<string, unknown>;
  };
}

/**
 * Response from POST /api/documents/confirm endpoint.
 */
export interface ConfirmResponse {
  /** Extraction status */
  status: "extracted";
  /** Unique identifier for this extraction */
  extractionId: string;
  /** Extracted field values */
  fields: Record<string, unknown>;
}

/**
 * Error response from analysis endpoints.
 */
export interface AnalysisError {
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Field extraction result with metadata.
 */
export interface FieldExtractionResult {
  /** Field identifier */
  fieldId: string;
  /** Extracted value */
  value: unknown;
  /** Confidence level for this extraction */
  confidence: ConfidenceLevel;
  /** Source type: explicit from document, inferred, or default */
  source: "explicit" | "inferred" | "default";
  /** Evidence from document where value was found */
  evidence?: string;
  /** Reasoning for inferred values */
  reasoning?: string;
  /** Alternative possible values */
  alternatives?: unknown[];
}

/**
 * Helper function to determine confidence level from score.
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

/**
 * Helper function to get confidence display color class.
 */
export function getConfidenceColorClass(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800";
    case "medium":
      return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800";
    case "low":
      return "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800";
  }
}

/**
 * Helper function to format confidence as percentage.
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Document type display metadata.
 */
export const DOC_TYPE_LABELS: Record<DocType, { label: string; description: string }> = {
  charter: {
    label: "Project Charter",
    description: "Defines project scope, vision, and key stakeholders",
  },
  ddp: {
    label: "Design & Development Plan",
    description: "Technical specifications and development roadmap",
  },
  sow: {
    label: "Statement of Work",
    description: "Formal agreement defining deliverables and terms",
  },
};
