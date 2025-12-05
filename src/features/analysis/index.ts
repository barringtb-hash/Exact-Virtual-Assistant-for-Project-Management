/**
 * Document Analysis Feature
 *
 * This module provides components and utilities for the LLM-based
 * document analysis workflow. It enables automatic analysis of
 * uploaded documents to determine their type and suggest extraction
 * targets with confidence scores.
 *
 * ## Usage
 *
 * ```tsx
 * import {
 *   useDocumentAnalysis,
 *   AnalysisResultCard,
 *   ConfirmationDialog,
 *   FieldPreview,
 * } from './features/analysis';
 *
 * function DocumentUpload() {
 *   const {
 *     analyze,
 *     confirm,
 *     isAnalyzing,
 *     isAwaitingConfirmation,
 *     selectedTarget,
 *     suggestedTargets,
 *   } = useDocumentAnalysis();
 *
 *   // Handle document upload and analysis...
 * }
 * ```
 *
 * ## Feature Flag
 *
 * This feature is controlled by the `DOCUMENT_ANALYSIS_ENABLED`
 * environment variable. Use `isDocumentAnalysisEnabled()` from
 * `config/featureFlags` to check if the feature is enabled.
 *
 * @module features/analysis
 */

// Types
export type {
  DocType,
  AnalysisStatus,
  ConfidenceLevel,
  DocumentClassification,
  FieldCoverage,
  SuggestedTarget,
  AlternativeTarget,
  AnalysisResult,
  RawContent,
  AnalyzeResponse,
  ConfirmRequest,
  ConfirmResponse,
  AnalysisError,
  FieldExtractionResult,
} from "./types";

export {
  getConfidenceLevel,
  getConfidenceColorClass,
  formatConfidence,
  DOC_TYPE_LABELS,
} from "./types";

// Hook
export {
  useDocumentAnalysis,
  type Attachment,
  type AnalyzeOptions,
  type ConfirmOptions,
  type UseDocumentAnalysisReturn,
} from "./useDocumentAnalysis";

// Components
export {
  FieldPreview,
  FieldPreviewItem,
  type FieldPreviewProps,
  type FieldPreviewItemProps,
} from "./FieldPreview";

export {
  AnalysisResultCard,
  type AnalysisResultCardProps,
} from "./AnalysisResultCard";

export {
  ConfirmationDialog,
  type ConfirmationDialogProps,
} from "./ConfirmationDialog";

// Re-export state slice selectors for convenience
export {
  useAnalysisStatus,
  useAnalysisId,
  useAnalysisResult,
  useSelectedTarget,
  useFieldOverrides,
  useExtractionId,
  useExtractedFields,
  useAnalysisError,
  useIsAnalyzing,
  useIsAwaitingConfirmation,
  useIsExtracting,
  useNeedsClarification,
  useSuggestedTargets,
  useAlternativeTargets,
  useDocumentClassification,
  usePreviewFieldsWithOverrides,
  analysisActions,
} from "../../state/slices/analysis";
