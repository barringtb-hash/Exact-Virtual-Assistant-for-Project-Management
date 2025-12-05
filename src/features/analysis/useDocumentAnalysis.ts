/**
 * React hook for document analysis workflow.
 *
 * Manages the complete analysis flow including:
 * - Analyzing uploaded documents
 * - Handling user confirmation
 * - Triggering extraction
 * - Error handling and retries
 *
 * @module features/analysis/useDocumentAnalysis
 */

import { useCallback, useMemo } from "react";
import {
  analysisActions,
  useAnalysisStatus,
  useAnalysisId,
  useAnalysisResult,
  useSelectedTarget,
  useFieldOverrides,
  useAnalysisError,
  useExtractedFields,
  useIsAnalyzing,
  useIsAwaitingConfirmation,
  useIsExtracting,
  useIsComplete as useIsAnalysisComplete,
  useNeedsClarification,
  useSuggestedTargets,
  useAlternativeTargets,
  useDocumentClassification,
  usePreviewFieldsWithOverrides,
} from "../../state/slices/analysis";
import type {
  AnalyzeResponse,
  ConfirmResponse,
  DocType,
  AnalysisError,
} from "./types";
import { isDocumentAnalysisEnabled } from "../../../config/featureFlags";

/**
 * Attachment type matching the API expectations.
 * The /api/documents/analyze endpoint expects { id?, name?, mimeType?, text: string }
 */
export interface Attachment {
  id?: string;
  name?: string;
  mimeType?: string;
  text: string;
}

/**
 * Options for the analyze function.
 */
export interface AnalyzeOptions {
  /** Uploaded file attachments */
  attachments: Attachment[];
  /** Optional conversation context for better analysis */
  conversationContext?: string[];
  /** Existing draft state to consider */
  existingDraft?: Record<string, unknown>;
}

/**
 * Options for the confirm function.
 */
export interface ConfirmOptions {
  /** Selected document type */
  docType: DocType;
  /** Action to perform */
  action?: "create" | "update";
  /** Optional field overrides */
  fieldOverrides?: Record<string, unknown>;
}

/**
 * Return type for the useDocumentAnalysis hook.
 */
export interface UseDocumentAnalysisReturn {
  // State
  /** Current analysis status */
  status: ReturnType<typeof useAnalysisStatus>;
  /** Current analysis ID */
  analysisId: ReturnType<typeof useAnalysisId>;
  /** Complete analysis result */
  analysis: ReturnType<typeof useAnalysisResult>;
  /** Selected target document */
  selectedTarget: ReturnType<typeof useSelectedTarget>;
  /** User field overrides */
  fieldOverrides: ReturnType<typeof useFieldOverrides>;
  /** Analysis error if any */
  error: ReturnType<typeof useAnalysisError>;
  /** Extracted fields after confirmation */
  extractedFields: ReturnType<typeof useExtractedFields>;

  // Derived state
  /** Whether analysis is in progress */
  isAnalyzing: boolean;
  /** Whether awaiting user confirmation */
  isAwaitingConfirmation: boolean;
  /** Whether extraction is in progress */
  isExtracting: boolean;
  /** Whether workflow is complete */
  isComplete: boolean;
  /** Whether clarification is needed */
  needsClarification: boolean;
  /** Whether feature is enabled */
  isEnabled: boolean;

  // Selectors
  /** Suggested targets from analysis */
  suggestedTargets: ReturnType<typeof useSuggestedTargets>;
  /** Alternative targets */
  alternativeTargets: ReturnType<typeof useAlternativeTargets>;
  /** Document classification */
  classification: ReturnType<typeof useDocumentClassification>;
  /** Preview fields with user overrides applied */
  previewFields: ReturnType<typeof usePreviewFieldsWithOverrides>;

  // Actions
  /** Analyze uploaded documents */
  analyze: (options: AnalyzeOptions) => Promise<void>;
  /** Confirm selection and trigger extraction */
  confirm: (options?: ConfirmOptions) => Promise<void>;
  /** Select a different document type */
  selectDocType: (docType: DocType) => void;
  /** Set a field override */
  setFieldOverride: (fieldId: string, value: unknown) => void;
  /** Reset the analysis state */
  reset: () => void;
  /** Clear current error */
  clearError: () => void;
}

/**
 * API response parsing helper.
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw {
      message: errorData.message || `Request failed with status ${response.status}`,
      code: errorData.code || `HTTP_${response.status}`,
      details: errorData.details,
    } as AnalysisError;
  }
  return response.json();
}

/**
 * Hook for managing the document analysis workflow.
 *
 * @example
 * ```tsx
 * function DocumentUploadHandler() {
 *   const {
 *     analyze,
 *     confirm,
 *     isAnalyzing,
 *     isAwaitingConfirmation,
 *     suggestedTargets,
 *     selectDocType,
 *   } = useDocumentAnalysis();
 *
 *   const handleUpload = async (files: File[]) => {
 *     const attachments = await processFiles(files);
 *     await analyze({ attachments });
 *   };
 *
 *   const handleConfirm = async () => {
 *     await confirm();
 *   };
 *
 *   // Render UI based on state...
 * }
 * ```
 */
export function useDocumentAnalysis(): UseDocumentAnalysisReturn {
  // State selectors
  const status = useAnalysisStatus();
  const analysisId = useAnalysisId();
  const analysis = useAnalysisResult();
  const selectedTarget = useSelectedTarget();
  const fieldOverrides = useFieldOverrides();
  const error = useAnalysisError();
  const extractedFields = useExtractedFields();

  // Derived state
  const isAnalyzing = useIsAnalyzing();
  const isAwaitingConfirmation = useIsAwaitingConfirmation();
  const isExtracting = useIsExtracting();
  const isComplete = useIsAnalysisComplete();
  const needsClarification = useNeedsClarification();

  // Collections
  const suggestedTargets = useSuggestedTargets();
  const alternativeTargets = useAlternativeTargets();
  const classification = useDocumentClassification();
  const previewFields = usePreviewFieldsWithOverrides();

  // Feature flag
  const isEnabled = useMemo(() => isDocumentAnalysisEnabled(), []);

  /**
   * Analyze uploaded documents.
   */
  const analyze = useCallback(
    async (options: AnalyzeOptions): Promise<void> => {
      if (!isEnabled) {
        console.warn("[useDocumentAnalysis] Feature is disabled");
        return;
      }

      try {
        analysisActions.startAnalysis();

        const response = await fetch("/api/documents/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attachments: options.attachments,
            conversationContext: options.conversationContext,
            existingDraft: options.existingDraft,
          }),
        });

        const data = await parseResponse<AnalyzeResponse>(response);
        analysisActions.setAnalysisResult(data);
      } catch (err) {
        const analysisError: AnalysisError =
          err && typeof err === "object" && "message" in err
            ? (err as AnalysisError)
            : { message: "Analysis failed. Please try again." };

        analysisActions.setError(analysisError);
        throw err;
      }
    },
    [isEnabled]
  );

  /**
   * Confirm selection and trigger extraction.
   */
  const confirm = useCallback(
    async (options?: ConfirmOptions): Promise<void> => {
      const currentAnalysisId = analysisId;
      const currentSelectedTarget = selectedTarget;
      const currentFieldOverrides = fieldOverrides;

      if (!currentAnalysisId) {
        throw new Error("No analysis to confirm");
      }

      const docType = options?.docType ?? currentSelectedTarget?.docType;
      if (!docType) {
        throw new Error("No document type selected");
      }

      try {
        analysisActions.startExtraction();

        const response = await fetch("/api/documents/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: currentAnalysisId,
            confirmed: {
              docType,
              action: options?.action ?? "create",
              fieldOverrides: options?.fieldOverrides ?? currentFieldOverrides,
            },
          }),
        });

        const data = await parseResponse<ConfirmResponse>(response);
        analysisActions.setExtractionResult(data.extractionId, data.fields);
      } catch (err) {
        const analysisError: AnalysisError =
          err && typeof err === "object" && "message" in err
            ? (err as AnalysisError)
            : { message: "Extraction failed. Please try again." };

        analysisActions.setError(analysisError);
        throw err;
      }
    },
    [analysisId, selectedTarget, fieldOverrides]
  );

  /**
   * Select a different document type.
   */
  const selectDocType = useCallback((docType: DocType): void => {
    analysisActions.selectDocType(docType);
  }, []);

  /**
   * Set a field override value.
   */
  const setFieldOverride = useCallback(
    (fieldId: string, value: unknown): void => {
      analysisActions.setFieldOverride(fieldId, value);
    },
    []
  );

  /**
   * Reset the analysis state.
   */
  const reset = useCallback((): void => {
    analysisActions.reset();
  }, []);

  /**
   * Clear the current error.
   */
  const clearError = useCallback((): void => {
    analysisActions.clearError();
  }, []);

  return {
    // State
    status,
    analysisId,
    analysis,
    selectedTarget,
    fieldOverrides,
    error,
    extractedFields,

    // Derived state
    isAnalyzing,
    isAwaitingConfirmation,
    isExtracting,
    isComplete,
    needsClarification,
    isEnabled,

    // Selectors
    suggestedTargets,
    alternativeTargets,
    classification,
    previewFields,

    // Actions
    analyze,
    confirm,
    selectDocType,
    setFieldOverride,
    reset,
    clearError,
  };
}

export default useDocumentAnalysis;
