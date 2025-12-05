/**
 * AnalysisResultCard component - displays document analysis results.
 *
 * Shows document classification with confidence badge, suggested targets
 * with preview fields, and coverage information. Handles high/medium/low
 * confidence UI variations as per the strategy document.
 *
 * @module features/analysis/AnalysisResultCard
 */

import React, { useCallback, useState } from "react";
import type {
  DocumentClassification,
  SuggestedTarget,
  AlternativeTarget,
  DocType,
  ConfidenceLevel,
} from "./types";
import {
  getConfidenceLevel,
  getConfidenceColorClass,
  formatConfidence,
  DOC_TYPE_LABELS,
} from "./types";
import { FieldPreview } from "./FieldPreview";

/**
 * AnalysisResultCard component props.
 */
export interface AnalysisResultCardProps {
  /** Document classification from analysis */
  classification: DocumentClassification;
  /** Primary suggested target */
  suggestedTarget: SuggestedTarget | null;
  /** Alternative target options */
  alternativeTargets: AlternativeTarget[];
  /** User's field overrides */
  fieldOverrides?: Record<string, unknown>;
  /** Currently selected document type */
  selectedDocType?: DocType | null;
  /** Whether the card is in loading state */
  isLoading?: boolean;
  /** Callback when user confirms the primary suggestion */
  onConfirm?: () => void;
  /** Callback when user wants to see preview */
  onShowPreview?: () => void;
  /** Callback when user selects a different document type */
  onSelectDocType?: (docType: DocType) => void;
  /** Callback when user edits a field */
  onFieldEdit?: (fieldId: string, value: unknown) => void;
  /** Callback to clear a field override */
  onClearOverride?: (fieldId: string) => void;
  /** Custom class name */
  className?: string;
}

/**
 * AnalysisResultCard displays analysis results with confidence-based UI.
 */
export const AnalysisResultCard: React.FC<AnalysisResultCardProps> = ({
  classification,
  suggestedTarget,
  alternativeTargets,
  fieldOverrides = {},
  selectedDocType,
  isLoading = false,
  onConfirm,
  onShowPreview,
  onSelectDocType,
  onFieldEdit,
  onClearOverride,
  className = "",
}) => {
  const [showFieldPreview, setShowFieldPreview] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const confidence = suggestedTarget?.confidence ?? classification.confidence;
  const confidenceLevel = getConfidenceLevel(confidence);
  const confidenceColorClass = getConfidenceColorClass(confidenceLevel);

  const docTypeInfo = suggestedTarget
    ? DOC_TYPE_LABELS[suggestedTarget.docType]
    : null;

  const handleConfirm = useCallback(() => {
    onConfirm?.();
  }, [onConfirm]);

  const handleShowPreview = useCallback(() => {
    setShowFieldPreview(!showFieldPreview);
    onShowPreview?.();
  }, [showFieldPreview, onShowPreview]);

  const handleSelectAlternative = useCallback(
    (docType: DocType) => {
      onSelectDocType?.(docType);
      setShowAlternatives(false);
    },
    [onSelectDocType]
  );

  // Determine which UI variation to show based on confidence
  const renderContent = () => {
    switch (confidenceLevel) {
      case "high":
        return renderHighConfidenceUI();
      case "medium":
        return renderMediumConfidenceUI();
      case "low":
        return renderLowConfidenceUI();
    }
  };

  // High confidence (>80%): Direct suggestion with confirm button
  const renderHighConfidenceUI = () => (
    <>
      <div className="mb-4">
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          This looks like a{" "}
          <span className="font-semibold">{classification.primaryType}</span>. I can
          create a{" "}
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            {docTypeInfo?.label}
          </span>{" "}
          from it and populate{" "}
          <span className="font-semibold">
            {suggestedTarget?.coverage.available.length ?? 0} of{" "}
            {getTotalFieldCount(suggestedTarget?.coverage)} fields
          </span>
          . Should I proceed?
        </p>
      </div>

      {/* Field preview toggle */}
      {showFieldPreview && suggestedTarget && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700">
          <FieldPreview
            previewFields={suggestedTarget.previewFields}
            fieldOverrides={fieldOverrides}
            coverage={suggestedTarget.coverage}
            editable={true}
            onFieldEdit={onFieldEdit}
            onClearOverride={onClearOverride}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:focus:ring-offset-slate-900"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner className="w-4 h-4" />
              Creating...
            </span>
          ) : (
            `Create ${docTypeInfo?.label ?? "Document"}`
          )}
        </button>

        <button
          type="button"
          onClick={handleShowPreview}
          className="px-4 py-2 text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {showFieldPreview ? "Hide Preview" : "Show Preview"}
        </button>

        {alternativeTargets.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Choose Different
          </button>
        )}
      </div>
    </>
  );

  // Medium confidence (50-80%): Show multiple options
  const renderMediumConfidenceUI = () => {
    const allTargets = [
      ...(suggestedTarget ? [suggestedTarget] : []),
      ...alternativeTargets.map((alt) => ({
        ...alt,
        previewFields: {},
        coverage: { available: [], missing: [], inferrable: [] },
      })),
    ];

    return (
      <>
        <div className="mb-4">
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            This document contains project information, but I'm not entirely sure of
            its purpose. It could be used for:
          </p>
        </div>

        {/* Target options */}
        <div className="space-y-3 mb-4">
          {allTargets.map((target, index) => {
            const targetInfo = DOC_TYPE_LABELS[target.docType];
            const isSelected = selectedDocType === target.docType;
            const targetConfidence = getConfidenceLevel(target.confidence);

            return (
              <button
                key={target.docType}
                type="button"
                onClick={() => onSelectDocType?.(target.docType)}
                className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-400"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {index + 1}. {targetInfo.label}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${getConfidenceColorClass(
                          targetConfidence
                        )}`}
                      >
                        {formatConfidence(target.confidence)} match
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {target.rationale || targetInfo.description}
                    </p>
                  </div>
                  {isSelected && (
                    <CheckIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Confirm selection */}
        {selectedDocType && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:focus:ring-offset-slate-900"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner className="w-4 h-4" />
                Creating...
              </span>
            ) : (
              `Create ${DOC_TYPE_LABELS[selectedDocType].label}`
            )}
          </button>
        )}
      </>
    );
  };

  // Low confidence (<50%): Ask for clarification
  const renderLowConfidenceUI = () => (
    <>
      <div className="mb-4">
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          I've analyzed your document but I'm not confident about the best use. Can
          you help me understand:
        </p>
        <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5">1.</span>
            What is this document? (e.g., meeting notes, proposal, requirements)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5">2.</span>
            What would you like to create from it?
          </li>
        </ul>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">
          This will help me extract the right information.
        </p>
      </div>

      {/* Manual selection */}
      <div className="flex flex-wrap gap-2">
        {(["charter", "ddp", "sow"] as DocType[]).map((docType) => {
          const info = DOC_TYPE_LABELS[docType];
          const isSelected = selectedDocType === docType;

          return (
            <button
              key={docType}
              type="button"
              onClick={() => onSelectDocType?.(docType)}
              className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                isSelected
                  ? "bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500"
                  : "text-slate-700 border-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800"
              }`}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {selectedDocType && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:focus:ring-offset-slate-900"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner className="w-4 h-4" />
                Creating...
              </span>
            ) : (
              `Create ${DOC_TYPE_LABELS[selectedDocType].label}`
            )}
          </button>
        </div>
      )}
    </>
  );

  // Alternative targets dropdown
  const renderAlternatives = () => {
    if (!showAlternatives || alternativeTargets.length === 0) return null;

    return (
      <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Other options:
        </h4>
        <div className="space-y-2">
          {alternativeTargets.map((alt) => {
            const altInfo = DOC_TYPE_LABELS[alt.docType];

            return (
              <button
                key={alt.docType}
                type="button"
                onClick={() => handleSelectAlternative(alt.docType)}
                className="w-full flex items-center justify-between p-3 text-left rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors dark:border-slate-700 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/30"
              >
                <span className="text-slate-700 dark:text-slate-300">
                  {altInfo.label}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {formatConfidence(alt.confidence)} match
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
      data-testid="analysis-result-card"
    >
      {/* Header with classification and confidence */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <DocumentIcon className="w-5 h-5 text-slate-400" />
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                Document Analysis Complete
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {classification.primaryType}
              </p>
            </div>
          </div>
          <div
            className={`px-3 py-1 rounded-full border text-sm font-medium ${confidenceColorClass}`}
          >
            {formatConfidence(confidence)} confidence
          </div>
        </div>

        {/* Classification signals */}
        {classification.signals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {classification.signals.slice(0, 3).map((signal, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded dark:bg-slate-800 dark:text-slate-400"
              >
                {signal}
              </span>
            ))}
            {classification.signals.length > 3 && (
              <span className="text-xs px-2 py-1 text-slate-500 dark:text-slate-500">
                +{classification.signals.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="px-5 py-4">
        {renderContent()}
        {renderAlternatives()}
      </div>
    </div>
  );
};

// Helper function
function getTotalFieldCount(
  coverage?: { available: string[]; missing: string[]; inferrable: string[] } | null
): number {
  if (!coverage) return 15; // Default assumption
  return coverage.available.length + coverage.missing.length + coverage.inferrable.length;
}

// Icon components
const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const LoadingSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export default AnalysisResultCard;
