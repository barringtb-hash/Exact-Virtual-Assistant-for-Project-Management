/**
 * useFieldFeedback Hook
 *
 * Maps review feedback items to specific fields for inline display.
 * Provides field-level feedback indicators and tooltips.
 *
 * @module hooks/useFieldFeedback
 */

import { useMemo, useCallback } from "react";
import { useReview, type FeedbackItem } from "../state/slices/reviewSession";

/**
 * Field feedback summary
 */
export interface FieldFeedback {
  /** Field ID/path */
  fieldId: string;
  /** All feedback items for this field */
  items: FeedbackItem[];
  /** Highest severity among items */
  highestSeverity: "critical" | "important" | "suggestion" | null;
  /** Count by severity */
  counts: {
    critical: number;
    important: number;
    suggestion: number;
  };
  /** Has any feedback */
  hasFeedback: boolean;
}

/**
 * Severity priority for comparison
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 0,
  important: 1,
  suggestion: 2,
};

/**
 * Get the highest severity from a list of items
 */
function getHighestSeverity(
  items: FeedbackItem[]
): "critical" | "important" | "suggestion" | null {
  if (items.length === 0) return null;

  let highest: "critical" | "important" | "suggestion" = "suggestion";
  let highestPriority = SEVERITY_PRIORITY.suggestion;

  for (const item of items) {
    const priority = SEVERITY_PRIORITY[item.severity];
    if (priority !== undefined && priority < highestPriority) {
      highest = item.severity as "critical" | "important" | "suggestion";
      highestPriority = priority;
    }
  }

  return highest;
}

/**
 * Hook return type
 */
export interface UseFieldFeedbackReturn {
  /** Map of field ID to feedback summary */
  feedbackByField: Map<string, FieldFeedback>;
  /** Get feedback for a specific field */
  getFieldFeedback: (fieldId: string) => FieldFeedback | null;
  /** Check if a field has feedback */
  hasFieldFeedback: (fieldId: string) => boolean;
  /** Get severity indicator color for a field */
  getFieldSeverityColor: (fieldId: string) => string;
  /** Get all fields with feedback */
  fieldsWithFeedback: string[];
  /** Total number of feedback items */
  totalFeedbackCount: number;
}

/**
 * Hook for mapping review feedback to fields
 *
 * @returns Field feedback mapping utilities
 *
 * @example
 * ```tsx
 * const { getFieldFeedback, hasFieldFeedback } = useFieldFeedback();
 *
 * // In your field component
 * {hasFieldFeedback("vision") && (
 *   <FieldFeedbackIndicator fieldId="vision" />
 * )}
 * ```
 */
export function useFieldFeedback(): UseFieldFeedbackReturn {
  const review = useReview();

  // Build field feedback map
  const feedbackByField = useMemo(() => {
    const map = new Map<string, FieldFeedback>();

    if (!review?.feedback || !Array.isArray(review.feedback)) {
      return map;
    }

    // Group feedback by field
    const grouped = new Map<string, FeedbackItem[]>();
    for (const item of review.feedback) {
      const fieldId = item.field || "_general";
      if (!grouped.has(fieldId)) {
        grouped.set(fieldId, []);
      }
      grouped.get(fieldId)!.push(item);
    }

    // Create feedback summaries
    for (const [fieldId, items] of grouped) {
      const counts = {
        critical: items.filter((i) => i.severity === "critical").length,
        important: items.filter((i) => i.severity === "important").length,
        suggestion: items.filter((i) => i.severity === "suggestion").length,
      };

      map.set(fieldId, {
        fieldId,
        items,
        highestSeverity: getHighestSeverity(items),
        counts,
        hasFeedback: true,
      });
    }

    return map;
  }, [review?.feedback]);

  // Get feedback for a specific field
  const getFieldFeedback = useCallback(
    (fieldId: string): FieldFeedback | null => {
      return feedbackByField.get(fieldId) || null;
    },
    [feedbackByField]
  );

  // Check if field has feedback
  const hasFieldFeedback = useCallback(
    (fieldId: string): boolean => {
      return feedbackByField.has(fieldId);
    },
    [feedbackByField]
  );

  // Get severity color for a field
  const getFieldSeverityColor = useCallback(
    (fieldId: string): string => {
      const feedback = feedbackByField.get(fieldId);
      if (!feedback) return "";

      switch (feedback.highestSeverity) {
        case "critical":
          return "text-red-500";
        case "important":
          return "text-amber-500";
        case "suggestion":
          return "text-blue-500";
        default:
          return "";
      }
    },
    [feedbackByField]
  );

  // Get all fields with feedback
  const fieldsWithFeedback = useMemo(
    () => Array.from(feedbackByField.keys()),
    [feedbackByField]
  );

  // Total feedback count
  const totalFeedbackCount = useMemo(() => {
    let count = 0;
    for (const field of feedbackByField.values()) {
      count += field.items.length;
    }
    return count;
  }, [feedbackByField]);

  return {
    feedbackByField,
    getFieldFeedback,
    hasFieldFeedback,
    getFieldSeverityColor,
    fieldsWithFeedback,
    totalFeedbackCount,
  };
}

export default useFieldFeedback;
