/**
 * Analysis state slice - manages document analysis workflow state.
 *
 * This slice handles the LLM-based document analysis flow including:
 * - Analysis status tracking
 * - Analysis results storage
 * - User field overrides before confirmation
 * - Error handling
 *
 * @module state/slices/analysis
 */

import { createSlice } from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";
import type {
  AnalysisStatus,
  AnalyzeResponse,
  AnalysisResult,
  DocType,
  SuggestedTarget,
  AnalysisError,
} from "../../features/analysis/types";

/**
 * Analysis slice state shape.
 */
export interface AnalysisSliceState {
  /** Current status in the analysis workflow */
  status: AnalysisStatus;
  /** Status before error occurred (for restoration) */
  statusBeforeError: AnalysisStatus | null;
  /** Unique identifier for the current analysis session */
  analysisId: string | null;
  /** Complete analysis result from the API */
  analysis: AnalysisResult | null;
  /** Raw extracted content (text, tables, metadata) */
  rawContent: {
    extractedText: string;
    tables: unknown[];
    metadata: Record<string, unknown>;
  } | null;
  /** User-selected document type (may differ from primary suggestion) */
  selectedDocType: DocType | null;
  /** User-selected target from suggestions */
  selectedTarget: SuggestedTarget | null;
  /** User's field value overrides before confirmation */
  fieldOverrides: Record<string, unknown>;
  /** Extraction ID after confirmation */
  extractionId: string | null;
  /** Extracted fields after confirmation */
  extractedFields: Record<string, unknown> | null;
  /** Error state */
  error: AnalysisError | null;
  /** Timestamp of last analysis */
  lastAnalyzedAt: number | null;
}

const initialState: AnalysisSliceState = {
  status: "idle",
  statusBeforeError: null,
  analysisId: null,
  analysis: null,
  rawContent: null,
  selectedDocType: null,
  selectedTarget: null,
  fieldOverrides: {},
  extractionId: null,
  extractedFields: null,
  error: null,
  lastAnalyzedAt: null,
};

/**
 * Analysis slice for managing document analysis workflow.
 */
export const analysisSlice = createSlice({
  name: "analysis",
  initialState,
  actions: (setState, getState, store) => ({
    /**
     * Starts the analysis process.
     * Called when a document is uploaded and analysis begins.
     */
    startAnalysis() {
      setState({
        status: "analyzing",
        statusBeforeError: null,
        error: null,
        analysisId: null,
        analysis: null,
        rawContent: null,
        selectedDocType: null,
        selectedTarget: null,
        fieldOverrides: {},
        extractionId: null,
        extractedFields: null,
      });
    },

    /**
     * Sets the analysis result from the API response.
     */
    setAnalysisResult(response: AnalyzeResponse) {
      const status: AnalysisStatus =
        response.status === "needs_clarification"
          ? "needs_clarification"
          : "awaiting_confirmation";

      // Auto-select the primary suggested target if available
      const primaryTarget =
        response.analysis.suggestedTargets.length > 0
          ? response.analysis.suggestedTargets[0]
          : null;

      setState({
        status,
        analysisId: response.analysisId,
        analysis: response.analysis,
        rawContent: response.raw,
        selectedDocType: primaryTarget?.docType ?? null,
        selectedTarget: primaryTarget,
        lastAnalyzedAt: Date.now(),
        error: null,
      });
    },

    /**
     * Updates the selected document type.
     * Called when user chooses a different target from suggestions.
     */
    selectDocType(docType: DocType) {
      const { analysis } = getState();
      if (!analysis) return;

      // Find the target matching this doc type
      const target =
        analysis.suggestedTargets.find((t) => t.docType === docType) ??
        analysis.alternativeTargets.find((t) => t.docType === docType);

      // For alternative targets, create a minimal SuggestedTarget structure
      let selectedTarget: SuggestedTarget | null = null;
      if (target) {
        if ("previewFields" in target) {
          selectedTarget = target as SuggestedTarget;
        } else {
          // Alternative target - create minimal structure
          selectedTarget = {
            docType: target.docType,
            confidence: target.confidence,
            rationale: target.rationale,
            previewFields: {},
            coverage: { available: [], missing: [], inferrable: [] },
          };
        }
      }

      setState({
        selectedDocType: docType,
        selectedTarget,
        fieldOverrides: {}, // Reset overrides when changing target
      });
    },

    /**
     * Sets a field override value.
     * Called when user edits a preview field before confirmation.
     */
    setFieldOverride(fieldId: string, value: unknown) {
      setState((state) => ({
        fieldOverrides: {
          ...state.fieldOverrides,
          [fieldId]: value,
        },
      }));
    },

    /**
     * Removes a field override.
     */
    removeFieldOverride(fieldId: string) {
      setState((state) => {
        const { [fieldId]: removed, ...rest } = state.fieldOverrides;
        return { fieldOverrides: rest };
      });
    },

    /**
     * Clears all field overrides.
     */
    clearFieldOverrides() {
      setState({ fieldOverrides: {} });
    },

    /**
     * Starts the extraction process after user confirms.
     */
    startExtraction() {
      setState({ status: "extracting", error: null });
    },

    /**
     * Sets the extraction result after confirmation.
     */
    setExtractionResult(extractionId: string, fields: Record<string, unknown>) {
      setState({
        status: "complete",
        extractionId,
        extractedFields: fields,
        error: null,
      });
    },

    /**
     * Sets an error state, preserving the current status for restoration.
     */
    setError(error: AnalysisError) {
      const { status } = getState();
      setState({
        status: "error",
        statusBeforeError: status !== "error" ? status : getState().statusBeforeError,
        error,
      });
    },

    /**
     * Clears the error state and returns to the status before the error.
     * Properly preserves needs_clarification status when applicable.
     */
    clearError() {
      const { statusBeforeError, analysisId, analysis } = getState();

      // Determine the correct status to restore
      let restoredStatus: AnalysisStatus;
      if (statusBeforeError && statusBeforeError !== "error") {
        // Restore to the status before the error occurred
        restoredStatus = statusBeforeError;
      } else if (analysisId && analysis) {
        // Fallback: determine from analysis state
        restoredStatus =
          analysis.clarificationQuestions.length > 0
            ? "needs_clarification"
            : "awaiting_confirmation";
      } else {
        restoredStatus = "idle";
      }

      setState({
        error: null,
        status: restoredStatus,
        statusBeforeError: null,
      });
    },

    /**
     * Resets the analysis state to initial.
     */
    reset() {
      setState(initialState);
    },

    /**
     * Gets the preview fields with user overrides applied.
     */
    getPreviewFieldsWithOverrides(): Record<string, unknown> {
      const { selectedTarget, fieldOverrides } = getState();
      if (!selectedTarget) return {};

      return {
        ...selectedTarget.previewFields,
        ...fieldOverrides,
      };
    },

    /**
     * Gets the current analysis summary for display.
     */
    getAnalysisSummary() {
      const { analysis, selectedTarget, status } = getState();
      if (!analysis) return null;

      return {
        classification: analysis.documentClassification,
        primaryTarget: selectedTarget,
        alternativeCount: analysis.alternativeTargets.length,
        hasClarificationNeeded: status === "needs_clarification",
        clarificationQuestions: analysis.clarificationQuestions,
      };
    },
  }),
});

// Export actions for external use
export const analysisActions = analysisSlice.actions;

// Selector hooks
export const useAnalysisStatus = () =>
  useStore(analysisSlice.store, (state) => state.status);

export const useAnalysisId = () =>
  useStore(analysisSlice.store, (state) => state.analysisId);

export const useAnalysisResult = () =>
  useStore(analysisSlice.store, (state) => state.analysis);

export const useSelectedDocType = () =>
  useStore(analysisSlice.store, (state) => state.selectedDocType);

export const useSelectedTarget = () =>
  useStore(analysisSlice.store, (state) => state.selectedTarget);

export const useFieldOverrides = () =>
  useStore(analysisSlice.store, (state) => state.fieldOverrides);

export const useExtractionId = () =>
  useStore(analysisSlice.store, (state) => state.extractionId);

export const useExtractedFields = () =>
  useStore(analysisSlice.store, (state) => state.extractedFields);

export const useAnalysisError = () =>
  useStore(analysisSlice.store, (state) => state.error);

export const useRawContent = () =>
  useStore(analysisSlice.store, (state) => state.rawContent);

// Derived selectors
export const useIsAnalyzing = () =>
  useStore(analysisSlice.store, (state) => state.status === "analyzing");

export const useIsAwaitingConfirmation = () =>
  useStore(analysisSlice.store, (state) => state.status === "awaiting_confirmation");

export const useIsExtracting = () =>
  useStore(analysisSlice.store, (state) => state.status === "extracting");

export const useIsComplete = () =>
  useStore(analysisSlice.store, (state) => state.status === "complete");

export const useHasError = () =>
  useStore(analysisSlice.store, (state) => state.status === "error");

export const useNeedsClarification = () =>
  useStore(analysisSlice.store, (state) => state.status === "needs_clarification");

export const useSuggestedTargets = () =>
  useStore(analysisSlice.store, (state) => state.analysis?.suggestedTargets ?? []);

export const useAlternativeTargets = () =>
  useStore(analysisSlice.store, (state) => state.analysis?.alternativeTargets ?? []);

export const useClarificationQuestions = () =>
  useStore(analysisSlice.store, (state) => state.analysis?.clarificationQuestions ?? []);

export const useDocumentClassification = () =>
  useStore(analysisSlice.store, (state) => state.analysis?.documentClassification ?? null);

// Computed preview fields with overrides
export const usePreviewFieldsWithOverrides = () =>
  useStore(analysisSlice.store, (state) => {
    if (!state.selectedTarget) return {};
    return {
      ...state.selectedTarget.previewFields,
      ...state.fieldOverrides,
    };
  });

// Export store API for direct access
export const analysisStoreApi = analysisSlice.store;
