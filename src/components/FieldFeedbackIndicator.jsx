/**
 * Field Feedback Indicator Component
 *
 * Displays an inline indicator next to form fields that have review feedback.
 * Shows severity icon and tooltip with feedback summary.
 *
 * @module components/FieldFeedbackIndicator
 */

import { useState, useCallback, useMemo } from "react";
import { useFieldFeedback } from "../hooks/useFieldFeedback.ts";

/**
 * Severity icons
 */
const SeverityIcon = ({ severity, className = "" }) => {
  switch (severity) {
    case "critical":
      return (
        <svg
          className={`w-4 h-4 text-red-500 ${className}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case "important":
      return (
        <svg
          className={`w-4 h-4 text-amber-500 ${className}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "suggestion":
      return (
        <svg
          className={`w-4 h-4 text-blue-500 ${className}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return null;
  }
};

/**
 * Tooltip component
 */
const Tooltip = ({ feedback, visible, position = "right" }) => {
  if (!visible || !feedback) return null;

  const positionClasses = {
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`absolute z-50 ${positionClasses[position]} w-64 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 text-sm animate-fade-in`}
    >
      <div className="font-medium text-slate-900 dark:text-white mb-2">
        {feedback.items.length} issue{feedback.items.length !== 1 ? "s" : ""} found
      </div>

      <ul className="space-y-2 max-h-48 overflow-y-auto">
        {feedback.items.slice(0, 3).map((item, index) => (
          <li key={item.id || index} className="flex gap-2">
            <SeverityIcon severity={item.severity} className="flex-shrink-0 mt-0.5" />
            <span className="text-slate-600 dark:text-slate-300 text-xs">
              {item.issue}
            </span>
          </li>
        ))}
        {feedback.items.length > 3 && (
          <li className="text-xs text-slate-500 dark:text-slate-400 italic">
            +{feedback.items.length - 3} more...
          </li>
        )}
      </ul>

      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        Click to view in Review Panel
      </div>
    </div>
  );
};

/**
 * Field Feedback Indicator
 *
 * @param {object} props
 * @param {string} props.fieldId - The field ID to show feedback for
 * @param {function} [props.onClick] - Callback when indicator is clicked
 * @param {string} [props.tooltipPosition] - Tooltip position (right, left, top, bottom)
 * @param {string} [props.className] - Additional CSS classes
 */
export default function FieldFeedbackIndicator({
  fieldId,
  onClick,
  tooltipPosition = "right",
  className = "",
}) {
  const { getFieldFeedback, hasFieldFeedback } = useFieldFeedback();
  const [showTooltip, setShowTooltip] = useState(false);

  const feedback = useMemo(() => getFieldFeedback(fieldId), [getFieldFeedback, fieldId]);
  const hasFeedback = hasFieldFeedback(fieldId);

  const handleMouseEnter = useCallback(() => {
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const handleClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (onClick) {
        onClick(fieldId, feedback);
      }
    },
    [onClick, fieldId, feedback]
  );

  if (!hasFeedback || !feedback) {
    return null;
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        aria-label={`${feedback.items.length} feedback item${feedback.items.length !== 1 ? "s" : ""} for this field`}
        data-testid={`field-feedback-${fieldId}`}
      >
        <SeverityIcon severity={feedback.highestSeverity} />

        {/* Badge showing count if multiple items */}
        {feedback.items.length > 1 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-slate-600 dark:bg-slate-500 rounded-full">
            {feedback.items.length}
          </span>
        )}
      </button>

      <Tooltip feedback={feedback} visible={showTooltip} position={tooltipPosition} />
    </div>
  );
}

/**
 * Hook to get feedback indicator props for a field
 *
 * Convenience hook for integrating feedback indicators with form fields.
 */
export function useFieldFeedbackIndicator(fieldId) {
  const { getFieldFeedback, hasFieldFeedback } = useFieldFeedback();

  return {
    hasFeedback: hasFieldFeedback(fieldId),
    feedback: getFieldFeedback(fieldId),
    indicatorProps: {
      fieldId,
    },
  };
}
