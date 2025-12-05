/**
 * ConfirmationDialog component - modal for confirming document extraction.
 *
 * Displays:
 * - Primary action: "Create [DocType]" button
 * - Secondary: "Choose Different Type" with alternatives
 * - Field preview before confirmation
 * - Loading state during extraction
 *
 * @module features/analysis/ConfirmationDialog
 */

import React, { useCallback, useEffect, useRef } from "react";
import type { SuggestedTarget, AlternativeTarget, DocType } from "./types";
import { DOC_TYPE_LABELS, formatConfidence, getConfidenceLevel, getConfidenceColorClass } from "./types";
import { FieldPreview } from "./FieldPreview";

/**
 * ConfirmationDialog component props.
 */
export interface ConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Selected target for extraction */
  selectedTarget: SuggestedTarget | null;
  /** Alternative targets user can choose */
  alternativeTargets: AlternativeTarget[];
  /** User's field overrides */
  fieldOverrides?: Record<string, unknown>;
  /** Whether extraction is in progress */
  isExtracting?: boolean;
  /** Error message if extraction failed */
  error?: string | null;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback when user confirms extraction */
  onConfirm: () => void;
  /** Callback when user selects a different type */
  onSelectDocType: (docType: DocType) => void;
  /** Callback when user edits a field */
  onFieldEdit?: (fieldId: string, value: unknown) => void;
  /** Callback to clear a field override */
  onClearOverride?: (fieldId: string) => void;
  /** Callback to retry after error */
  onRetry?: () => void;
}

/**
 * ConfirmationDialog for confirming document extraction.
 */
export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  selectedTarget,
  alternativeTargets,
  fieldOverrides = {},
  isExtracting = false,
  error = null,
  onClose,
  onConfirm,
  onSelectDocType,
  onFieldEdit,
  onClearOverride,
  onRetry,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle escape key and focus trap
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !isExtracting) {
          onClose();
        }

        // Focus trap
        if (e.key === "Tab" && dialogRef.current) {
          const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen, isExtracting, onClose]);

  // Focus first focusable element when dialog opens
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled])'
      );
      setTimeout(() => firstFocusable?.focus(), 0);
    }
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isExtracting) {
        onClose();
      }
    },
    [isExtracting, onClose]
  );

  if (!isOpen) return null;

  const docTypeInfo = selectedTarget
    ? DOC_TYPE_LABELS[selectedTarget.docType]
    : null;
  const confidence = selectedTarget?.confidence ?? 0;
  const confidenceLevel = getConfidenceLevel(confidence);
  const confidenceColorClass = getConfidenceColorClass(confidenceLevel);

  // Merge preview fields with overrides
  const previewFieldsWithOverrides = {
    ...selectedTarget?.previewFields,
    ...fieldOverrides,
  };

  const fieldCount = selectedTarget?.coverage.available.length ?? 0;
  const totalFields =
    (selectedTarget?.coverage.available.length ?? 0) +
    (selectedTarget?.coverage.missing.length ?? 0) +
    (selectedTarget?.coverage.inferrable.length ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      data-testid="confirmation-dialog"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2
              id="confirmation-dialog-title"
              className="text-lg font-semibold text-slate-800 dark:text-slate-100"
            >
              {error ? "Extraction Failed" : "Confirm Document Creation"}
            </h2>
            {!error && selectedTarget && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Review and confirm before extraction
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExtracting}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 dark:hover:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Close dialog"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center dark:bg-red-900/30">
                <ErrorIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                Something went wrong
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
              <div className="flex justify-center gap-3">
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Try Again
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : isExtracting ? (
            <div className="text-center py-12">
              <LoadingSpinner className="w-10 h-10 mx-auto mb-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                Creating {docTypeInfo?.label}...
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Extracting fields from your document
              </p>
            </div>
          ) : (
            <>
              {/* Selected target info */}
              {selectedTarget && (
                <div className="mb-6">
                  <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl dark:bg-slate-800/50">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center dark:bg-indigo-900/50">
                      <DocumentIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                          {docTypeInfo?.label}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${confidenceColorClass}`}
                        >
                          {formatConfidence(confidence)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {docTypeInfo?.description}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                        {fieldCount} of {totalFields} fields will be populated
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Field preview */}
              {selectedTarget && Object.keys(selectedTarget.previewFields).length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Fields to be populated
                  </h4>
                  <div className="border border-slate-200 rounded-lg dark:border-slate-700">
                    <FieldPreview
                      previewFields={selectedTarget.previewFields}
                      fieldOverrides={fieldOverrides}
                      coverage={selectedTarget.coverage}
                      editable={true}
                      onFieldEdit={onFieldEdit}
                      onClearOverride={onClearOverride}
                      maxInitialFields={5}
                      className="p-3"
                    />
                  </div>
                </div>
              )}

              {/* Alternative options */}
              {alternativeTargets.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Or choose a different type
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {alternativeTargets.map((alt) => {
                      const altInfo = DOC_TYPE_LABELS[alt.docType];
                      return (
                        <button
                          key={alt.docType}
                          type="button"
                          onClick={() => onSelectDocType(alt.docType)}
                          className="px-3 py-2 text-sm font-medium text-slate-700 rounded-lg border border-slate-300 hover:border-indigo-300 hover:bg-indigo-50 transition-colors dark:text-slate-300 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/30"
                        >
                          {altInfo.label}{" "}
                          <span className="text-slate-400">
                            ({formatConfidence(alt.confidence)})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!error && !isExtracting && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!selectedTarget}
              className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:focus:ring-offset-slate-900"
            >
              Create {docTypeInfo?.label ?? "Document"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Icon components
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

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

const ErrorIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
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

export default ConfirmationDialog;
