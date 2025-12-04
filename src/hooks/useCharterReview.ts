/**
 * useCharterReview Hook
 *
 * Provides integration with the document review API for charter documents.
 * Manages review state, API calls, and feedback handling.
 *
 * @module hooks/useCharterReview
 */

import { useCallback, useRef } from "react";
import {
  reviewSessionActions,
  useReviewSession,
  useReviewStatus,
  useReview,
  useFeedbackCounts,
  type ReviewResult,
} from "../state/slices/reviewSession";

/**
 * Review API request options
 */
export interface ReviewOptions {
  /** Specific dimensions to focus on */
  dimensions?: string[];
  /** Minimum severity level to include */
  severity?: "all" | "critical" | "important" | "suggestion";
  /** Whether to include examples in feedback */
  includeExamples?: boolean;
  /** Override default model */
  model?: string;
}

/**
 * Review hook return type
 */
export interface UseCharterReviewReturn {
  /** Current review session state */
  state: ReturnType<typeof useReviewSession>;
  /** Current review status */
  status: ReturnType<typeof useReviewStatus>;
  /** Current review result */
  review: ReviewResult | null;
  /** Feedback counts by status and severity */
  counts: ReturnType<typeof useFeedbackCounts>;
  /** Start a new review */
  startReview: (document: Record<string, unknown>, options?: ReviewOptions) => Promise<ReviewResult | null>;
  /** Accept a feedback item */
  acceptFeedback: (feedbackId: string, userNote?: string) => void;
  /** Dismiss a feedback item */
  dismissFeedback: (feedbackId: string, reason?: string) => void;
  /** Mark feedback as resolved */
  resolveFeedback: (feedbackId: string) => void;
  /** Reset the review session */
  reset: () => void;
  /** Abort any in-progress review */
  abort: () => void;
  /** Whether a review is currently in progress */
  isLoading: boolean;
  /** Error message if review failed */
  error: string | null;
}

/**
 * Hook for managing charter document reviews.
 *
 * @param docType - Document type (defaults to "charter")
 * @returns Review management interface
 *
 * @example
 * ```tsx
 * const { startReview, review, isLoading, acceptFeedback } = useCharterReview();
 *
 * const handleReview = async () => {
 *   const result = await startReview(charterDraft);
 *   if (result) {
 *     console.log("Review score:", result.scores.overall);
 *   }
 * };
 * ```
 */
export function useCharterReview(docType: string = "charter"): UseCharterReviewReturn {
  const state = useReviewSession();
  const status = useReviewStatus();
  const review = useReview();
  const counts = useFeedbackCounts();

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Start a review for the given document
   */
  const startReview = useCallback(
    async (
      document: Record<string, unknown>,
      options?: ReviewOptions
    ): Promise<ReviewResult | null> => {
      // Abort any existing review
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Start loading state
      reviewSessionActions.startReview(docType);

      try {
        const response = await fetch("/api/documents/review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            docType,
            document,
            options: options || {},
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.message ||
            errorData.error?.message ||
            `Review failed with status ${response.status}`;
          throw new Error(errorMessage);
        }

        const result: ReviewResult = await response.json();

        // Update state with result
        reviewSessionActions.setReviewResult(result);

        return result;
      } catch (error) {
        // Don't set error if aborted
        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }

        const message =
          error instanceof Error ? error.message : "Review failed unexpectedly";
        reviewSessionActions.setReviewError(message);

        return null;
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [docType]
  );

  /**
   * Accept a feedback item
   */
  const acceptFeedback = useCallback((feedbackId: string, userNote?: string) => {
    reviewSessionActions.acceptFeedback(feedbackId, userNote);
  }, []);

  /**
   * Dismiss a feedback item
   */
  const dismissFeedback = useCallback((feedbackId: string, reason?: string) => {
    reviewSessionActions.dismissFeedback(feedbackId, reason);
  }, []);

  /**
   * Mark feedback as resolved
   */
  const resolveFeedback = useCallback((feedbackId: string) => {
    reviewSessionActions.resolveFeedback(feedbackId);
  }, []);

  /**
   * Reset the review session
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reviewSessionActions.reset();
  }, []);

  /**
   * Abort any in-progress review
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const isLoading = status === "loading";
  const error = state.error;

  return {
    state,
    status,
    review,
    counts,
    startReview,
    acceptFeedback,
    dismissFeedback,
    resolveFeedback,
    reset,
    abort,
    isLoading,
    error,
  };
}

export default useCharterReview;
