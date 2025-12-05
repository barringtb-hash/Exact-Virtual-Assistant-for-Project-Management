/**
 * FieldPreview component - displays preview of extracted fields.
 *
 * Shows key fields that will be populated from the analysis,
 * indicates which are explicit vs inferred, and allows
 * field overrides before confirmation.
 *
 * @module features/analysis/FieldPreview
 */

import React, { useCallback, useState } from "react";
import type { FieldCoverage, ConfidenceLevel } from "./types";
import { getConfidenceColorClass } from "./types";

/**
 * Single field preview item props.
 */
export interface FieldPreviewItemProps {
  /** Field identifier */
  fieldId: string;
  /** Field display label */
  label: string;
  /** Current value (from analysis or override) */
  value: unknown;
  /** Whether value is from user override */
  isOverridden?: boolean;
  /** Source type: explicit, inferred, or missing */
  source: "explicit" | "inferred" | "missing";
  /** Whether field is editable */
  editable?: boolean;
  /** Callback when value is edited */
  onEdit?: (fieldId: string, value: unknown) => void;
  /** Callback to clear override and restore original */
  onClearOverride?: (fieldId: string) => void;
}

/**
 * Individual field preview item with edit capability.
 */
export const FieldPreviewItem: React.FC<FieldPreviewItemProps> = ({
  fieldId,
  label,
  value,
  isOverridden = false,
  source,
  editable = true,
  onEdit,
  onClearOverride,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const displayValue = formatFieldValue(value);
  const isEmpty = value === null || value === undefined || value === "";

  const handleEditClick = useCallback(() => {
    setEditValue(typeof value === "string" ? value : JSON.stringify(value) || "");
    setIsEditing(true);
  }, [value]);

  const handleSave = useCallback(() => {
    if (onEdit) {
      // Try to parse as JSON for arrays/objects, otherwise use string
      let parsedValue: unknown = editValue;
      try {
        parsedValue = JSON.parse(editValue);
      } catch {
        // Keep as string
      }
      onEdit(fieldId, parsedValue);
    }
    setIsEditing(false);
  }, [fieldId, editValue, onEdit]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const sourceIcon = getSourceIcon(source);
  const sourceTooltip = getSourceTooltip(source);

  return (
    <div
      className={`group flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors ${
        isOverridden
          ? "bg-indigo-50 dark:bg-indigo-900/20"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
      }`}
      data-testid={`field-preview-${fieldId}`}
    >
      {/* Source indicator */}
      <span
        className={`flex-shrink-0 mt-0.5 ${getSourceColorClass(source)}`}
        title={sourceTooltip}
      >
        {sourceIcon}
      </span>

      {/* Field content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </span>
          {isOverridden && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              Edited
            </span>
          )}
          {source === "inferred" && !isOverridden && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              Inferred
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
              rows={Math.min(5, editValue.split("\n").length + 1)}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-2.5 py-1 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {isEmpty ? (
              <span className="italic text-slate-400 dark:text-slate-500">
                {source === "missing" ? "Not found in document" : "No value"}
              </span>
            ) : (
              <span className="break-words">{displayValue}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {editable && !isEditing && (
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleEditClick}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700"
            title="Edit value"
          >
            <EditIcon className="w-4 h-4" />
          </button>
          {isOverridden && onClearOverride && (
            <button
              type="button"
              onClick={() => onClearOverride(fieldId)}
              className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-900/30"
              title="Restore original value"
            >
              <UndoIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * FieldPreview component props.
 */
export interface FieldPreviewProps {
  /** Preview fields from analysis */
  previewFields: Record<string, unknown>;
  /** User's field overrides */
  fieldOverrides?: Record<string, unknown>;
  /** Field coverage information */
  coverage?: FieldCoverage;
  /** Field metadata for display */
  fieldMetadata?: Record<string, { label: string; description?: string }>;
  /** Whether fields are editable */
  editable?: boolean;
  /** Callback when a field is edited */
  onFieldEdit?: (fieldId: string, value: unknown) => void;
  /** Callback to clear an override */
  onClearOverride?: (fieldId: string) => void;
  /** Maximum fields to show initially */
  maxInitialFields?: number;
  /** Custom class name */
  className?: string;
}

/**
 * FieldPreview component displays extracted fields with edit capability.
 */
export const FieldPreview: React.FC<FieldPreviewProps> = ({
  previewFields,
  fieldOverrides = {},
  coverage,
  fieldMetadata = {},
  editable = true,
  onFieldEdit,
  onClearOverride,
  maxInitialFields = 6,
  className = "",
}) => {
  const [showAll, setShowAll] = useState(false);

  // Combine fields and determine their source
  const fieldEntries = Object.entries(previewFields);
  const availableSet = new Set(coverage?.available ?? []);
  const inferrableSet = new Set(coverage?.inferrable ?? []);
  const missingSet = new Set(coverage?.missing ?? []);

  const getFieldSource = (fieldId: string): "explicit" | "inferred" | "missing" => {
    if (missingSet.has(fieldId)) return "missing";
    if (inferrableSet.has(fieldId)) return "inferred";
    return "explicit";
  };

  const displayedFields = showAll
    ? fieldEntries
    : fieldEntries.slice(0, maxInitialFields);

  const hasMore = fieldEntries.length > maxInitialFields;
  const remainingCount = fieldEntries.length - maxInitialFields;

  // Stats
  const explicitCount = availableSet.size;
  const inferredCount = inferrableSet.size;
  const missingCount = missingSet.size;

  return (
    <div className={`${className}`} data-testid="field-preview">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {explicitCount} fields found
          </span>
        </div>
        {inferredCount > 0 && (
          <div className="flex items-center gap-1.5">
            <LightbulbIcon className="w-4 h-4 text-amber-500" />
            <span className="text-slate-600 dark:text-slate-400">
              {inferredCount} inferred
            </span>
          </div>
        )}
        {missingCount > 0 && (
          <div className="flex items-center gap-1.5">
            <CircleDashedIcon className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 dark:text-slate-400">
              {missingCount} missing
            </span>
          </div>
        )}
      </div>

      {/* Field list */}
      <div className="space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
        {displayedFields.map(([fieldId, value]) => {
          const metadata = fieldMetadata[fieldId];
          const isOverridden = fieldId in fieldOverrides;
          const displayValue = isOverridden ? fieldOverrides[fieldId] : value;

          return (
            <FieldPreviewItem
              key={fieldId}
              fieldId={fieldId}
              label={metadata?.label ?? formatFieldLabel(fieldId)}
              value={displayValue}
              isOverridden={isOverridden}
              source={getFieldSource(fieldId)}
              editable={editable}
              onEdit={onFieldEdit}
              onClearOverride={onClearOverride}
            />
          );
        })}
      </div>

      {/* Show more/less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors dark:text-indigo-400 dark:hover:text-indigo-300 dark:hover:bg-indigo-900/30"
        >
          {showAll ? "Show less" : `Show ${remainingCount} more fields`}
        </button>
      )}
    </div>
  );
};

// Helper functions
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function formatFieldLabel(fieldId: string): string {
  return fieldId
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSourceIcon(source: "explicit" | "inferred" | "missing"): React.ReactNode {
  switch (source) {
    case "explicit":
      return <CheckCircleIcon className="w-4 h-4" />;
    case "inferred":
      return <LightbulbIcon className="w-4 h-4" />;
    case "missing":
      return <CircleDashedIcon className="w-4 h-4" />;
  }
}

function getSourceTooltip(source: "explicit" | "inferred" | "missing"): string {
  switch (source) {
    case "explicit":
      return "Found in document";
    case "inferred":
      return "Inferred from context";
    case "missing":
      return "Not found in document";
  }
}

function getSourceColorClass(source: "explicit" | "inferred" | "missing"): string {
  switch (source) {
    case "explicit":
      return "text-emerald-500 dark:text-emerald-400";
    case "inferred":
      return "text-amber-500 dark:text-amber-400";
    case "missing":
      return "text-slate-400 dark:text-slate-500";
  }
}

// Icon components
const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const LightbulbIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

const CircleDashedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
  </svg>
);

const EditIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

const UndoIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  </svg>
);

export default FieldPreview;
