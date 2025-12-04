/**
 * Review session state slice - manages document review sessions.
 *
 * Tracks review progress, feedback acceptance/dismissal, and interactive
 * review mode state for guided feedback walkthroughs.
 *
 * @module state/slices/reviewSession
 */

import { createSlice, normalizedOps, createNormalizedCollection, type NormalizedCollection } from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";

/**
 * Review session status.
 */
export type ReviewSessionStatus =
  | "idle"          // No active review
  | "loading"       // Review in progress
  | "ready"         // Review complete, displaying results
  | "interactive"   // Interactive feedback walkthrough mode
  | "error";        // Review failed

/**
 * Feedback item status.
 */
export type FeedbackStatus = "pending" | "accepted" | "dismissed" | "resolved";

/**
 * Feedback severity level.
 */
export type FeedbackSeverity = "critical" | "important" | "suggestion";

/**
 * Review dimension types.
 */
export type ReviewDimension =
  | "completeness"
  | "specificity"
  | "feasibility"
  | "risk_coverage"
  | "scope_clarity"
  | "metric_measurability";

/**
 * A single feedback item from the review.
 */
export interface FeedbackItem {
  id: string;
  field: string | null;
  dimension: ReviewDimension;
  severity: FeedbackSeverity;
  issue: string;
  recommendation: string;
  example?: string;
  status: FeedbackStatus;
  userNote?: string;
  acceptedAt?: number;
  dismissedAt?: number;
}

/**
 * Dimension scores from review.
 */
export interface DimensionScores {
  completeness: number;
  specificity: number;
  feasibility: number;
  risk_coverage: number;
  scope_clarity: number;
  metric_measurability: number;
}

/**
 * Review result from API.
 */
export interface ReviewResult {
  reviewId: string;
  docType: string;
  documentHash: string;
  timestamp: string;
  scores: {
    overall: number;
    dimensions: DimensionScores;
  };
  strengths: string[];
  feedback: FeedbackItem[];
  summary: string;
  metadata: {
    modelUsed: string;
    knowledgeEntriesUsed: string[];
    processingTimeMs: number;
  };
}

/**
 * Interactive review state for guided walkthrough.
 */
export interface InteractiveReviewState {
  currentFeedbackIndex: number;
  visitedFeedbackIds: string[];
  startedAt: number | null;
  completedAt: number | null;
}

/**
 * Review session slice state shape.
 */
export interface ReviewSessionSliceState {
  /** Current session status */
  status: ReviewSessionStatus;
  /** Document type being reviewed */
  docType: string | null;
  /** Current review result */
  review: ReviewResult | null;
  /** Feedback items with normalized access */
  feedback: NormalizedCollection<FeedbackItem>;
  /** Interactive review state */
  interactive: InteractiveReviewState;
  /** Error message if review failed */
  error: string | null;
  /** Filter for feedback severity */
  severityFilter: FeedbackSeverity | "all";
  /** Filter for feedback dimension */
  dimensionFilter: ReviewDimension | "all";
  /** Review history (for comparison) */
  previousReviewId: string | null;
}

const initialInteractiveState: InteractiveReviewState = {
  currentFeedbackIndex: 0,
  visitedFeedbackIds: [],
  startedAt: null,
  completedAt: null,
};

const initialState: ReviewSessionSliceState = {
  status: "idle",
  docType: null,
  review: null,
  feedback: createNormalizedCollection<FeedbackItem>(),
  interactive: initialInteractiveState,
  error: null,
  severityFilter: "all",
  dimensionFilter: "all",
  previousReviewId: null,
};

/**
 * Review session slice.
 */
export const reviewSessionSlice = createSlice({
  name: "reviewSession",
  initialState,
  actions: (setState, getState) => ({
    /**
     * Start a review (set loading state).
     */
    startReview(docType: string) {
      setState((state) => ({
        ...state,
        status: "loading",
        docType,
        error: null,
        previousReviewId: state.review?.reviewId || null,
      }));
    },

    /**
     * Set review result from API.
     */
    setReviewResult(result: ReviewResult) {
      const feedbackCollection = normalizedOps.setAll(
        result.feedback.map((item) => ({
          ...item,
          status: item.status || "pending",
        }))
      );

      setState((state) => ({
        ...state,
        status: "ready",
        review: result,
        feedback: feedbackCollection,
        error: null,
      }));
    },

    /**
     * Set review error.
     */
    setReviewError(error: string) {
      setState((state) => ({
        ...state,
        status: "error",
        error,
      }));
    },

    /**
     * Accept a feedback item.
     */
    acceptFeedback(feedbackId: string, userNote?: string) {
      setState((state) => ({
        ...state,
        feedback: normalizedOps.update(state.feedback, feedbackId, (item) => ({
          ...item,
          status: "accepted" as FeedbackStatus,
          acceptedAt: Date.now(),
          userNote: userNote || item.userNote,
        })),
      }));
    },

    /**
     * Dismiss a feedback item.
     */
    dismissFeedback(feedbackId: string, reason?: string) {
      setState((state) => ({
        ...state,
        feedback: normalizedOps.update(state.feedback, feedbackId, (item) => ({
          ...item,
          status: "dismissed" as FeedbackStatus,
          dismissedAt: Date.now(),
          userNote: reason || item.userNote,
        })),
      }));
    },

    /**
     * Mark feedback as resolved (user made the change).
     */
    resolveFeedback(feedbackId: string) {
      setState((state) => ({
        ...state,
        feedback: normalizedOps.update(state.feedback, feedbackId, (item) => ({
          ...item,
          status: "resolved" as FeedbackStatus,
        })),
      }));
    },

    /**
     * Reset feedback status to pending.
     */
    resetFeedbackStatus(feedbackId: string) {
      setState((state) => ({
        ...state,
        feedback: normalizedOps.update(state.feedback, feedbackId, (item) => ({
          ...item,
          status: "pending" as FeedbackStatus,
          acceptedAt: undefined,
          dismissedAt: undefined,
        })),
      }));
    },

    /**
     * Set severity filter.
     */
    setSeverityFilter(severity: FeedbackSeverity | "all") {
      setState((state) => ({
        ...state,
        severityFilter: severity,
      }));
    },

    /**
     * Set dimension filter.
     */
    setDimensionFilter(dimension: ReviewDimension | "all") {
      setState((state) => ({
        ...state,
        dimensionFilter: dimension,
      }));
    },

    /**
     * Start interactive review mode.
     */
    startInteractiveMode() {
      const state = getState();
      const feedbackIds = state.feedback.allIds.filter((id) => {
        const item = state.feedback.byId[id];
        return item && item.status === "pending";
      });

      setState((s) => ({
        ...s,
        status: "interactive",
        interactive: {
          currentFeedbackIndex: 0,
          visitedFeedbackIds: feedbackIds.length > 0 ? [feedbackIds[0]] : [],
          startedAt: Date.now(),
          completedAt: null,
        },
      }));
    },

    /**
     * Navigate to next feedback item in interactive mode.
     */
    nextFeedback() {
      setState((state) => {
        const pendingIds = state.feedback.allIds.filter((id) => {
          const item = state.feedback.byId[id];
          return item && item.status === "pending";
        });

        const nextIndex = Math.min(
          state.interactive.currentFeedbackIndex + 1,
          pendingIds.length - 1
        );

        const nextId = pendingIds[nextIndex];
        const visitedIds = nextId && !state.interactive.visitedFeedbackIds.includes(nextId)
          ? [...state.interactive.visitedFeedbackIds, nextId]
          : state.interactive.visitedFeedbackIds;

        return {
          ...state,
          interactive: {
            ...state.interactive,
            currentFeedbackIndex: nextIndex,
            visitedFeedbackIds: visitedIds,
          },
        };
      });
    },

    /**
     * Navigate to previous feedback item in interactive mode.
     */
    previousFeedback() {
      setState((state) => ({
        ...state,
        interactive: {
          ...state.interactive,
          currentFeedbackIndex: Math.max(0, state.interactive.currentFeedbackIndex - 1),
        },
      }));
    },

    /**
     * Jump to a specific feedback item in interactive mode.
     */
    goToFeedback(feedbackId: string) {
      setState((state) => {
        const pendingIds = state.feedback.allIds.filter((id) => {
          const item = state.feedback.byId[id];
          return item && item.status === "pending";
        });

        const index = pendingIds.indexOf(feedbackId);
        if (index === -1) return state;

        const visitedIds = !state.interactive.visitedFeedbackIds.includes(feedbackId)
          ? [...state.interactive.visitedFeedbackIds, feedbackId]
          : state.interactive.visitedFeedbackIds;

        return {
          ...state,
          interactive: {
            ...state.interactive,
            currentFeedbackIndex: index,
            visitedFeedbackIds: visitedIds,
          },
        };
      });
    },

    /**
     * Complete interactive review mode.
     */
    completeInteractiveMode() {
      setState((state) => ({
        ...state,
        status: "ready",
        interactive: {
          ...state.interactive,
          completedAt: Date.now(),
        },
      }));
    },

    /**
     * Exit interactive mode without completing.
     */
    exitInteractiveMode() {
      setState((state) => ({
        ...state,
        status: "ready",
      }));
    },

    /**
     * Reset review session.
     */
    reset() {
      setState(initialState);
    },

    /**
     * Clear review but keep filters.
     */
    clearReview() {
      setState((state) => ({
        ...initialState,
        severityFilter: state.severityFilter,
        dimensionFilter: state.dimensionFilter,
      }));
    },
  }),
});

// Export actions for easy access
export const reviewSessionActions = reviewSessionSlice.actions;

// Selectors
export const selectReviewStatus = (state: ReviewSessionSliceState) => state.status;
export const selectReview = (state: ReviewSessionSliceState) => state.review;
export const selectFeedbackItems = (state: ReviewSessionSliceState) =>
  normalizedOps.selectAll(state.feedback);
export const selectFeedbackById = (state: ReviewSessionSliceState, id: string) =>
  normalizedOps.selectById(state.feedback, id);
export const selectOverallScore = (state: ReviewSessionSliceState) =>
  state.review?.scores.overall ?? 0;
export const selectDimensionScores = (state: ReviewSessionSliceState) =>
  state.review?.scores.dimensions ?? null;
export const selectStrengths = (state: ReviewSessionSliceState) =>
  state.review?.strengths ?? [];
export const selectSummary = (state: ReviewSessionSliceState) =>
  state.review?.summary ?? "";
export const selectIsInteractive = (state: ReviewSessionSliceState) =>
  state.status === "interactive";
export const selectCurrentInteractiveFeedback = (state: ReviewSessionSliceState) => {
  if (state.status !== "interactive") return null;
  const pendingIds = state.feedback.allIds.filter((id) => {
    const item = state.feedback.byId[id];
    return item && item.status === "pending";
  });
  const currentId = pendingIds[state.interactive.currentFeedbackIndex];
  return currentId ? state.feedback.byId[currentId] : null;
};
export const selectFilteredFeedback = (state: ReviewSessionSliceState) => {
  let items = normalizedOps.selectAll(state.feedback);

  if (state.severityFilter !== "all") {
    items = items.filter((item) => item.severity === state.severityFilter);
  }

  if (state.dimensionFilter !== "all") {
    items = items.filter((item) => item.dimension === state.dimensionFilter);
  }

  return items;
};
export const selectFeedbackCounts = (state: ReviewSessionSliceState) => {
  const items = normalizedOps.selectAll(state.feedback);
  return {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    accepted: items.filter((i) => i.status === "accepted").length,
    dismissed: items.filter((i) => i.status === "dismissed").length,
    resolved: items.filter((i) => i.status === "resolved").length,
    critical: items.filter((i) => i.severity === "critical").length,
    important: items.filter((i) => i.severity === "important").length,
    suggestion: items.filter((i) => i.severity === "suggestion").length,
  };
};

// Hooks
export function useReviewSession() {
  return useStore(reviewSessionSlice.store, (state) => state);
}

export function useReviewStatus() {
  return useStore(reviewSessionSlice.store, selectReviewStatus);
}

export function useReview() {
  return useStore(reviewSessionSlice.store, selectReview);
}

export function useFeedbackItems() {
  return useStore(reviewSessionSlice.store, selectFeedbackItems);
}

export function useFilteredFeedback() {
  return useStore(reviewSessionSlice.store, selectFilteredFeedback);
}

export function useFeedbackCounts() {
  return useStore(reviewSessionSlice.store, selectFeedbackCounts);
}

export function useOverallScore() {
  return useStore(reviewSessionSlice.store, selectOverallScore);
}

export function useDimensionScores() {
  return useStore(reviewSessionSlice.store, selectDimensionScores);
}

export function useIsInteractive() {
  return useStore(reviewSessionSlice.store, selectIsInteractive);
}

export function useCurrentInteractiveFeedback() {
  return useStore(reviewSessionSlice.store, selectCurrentInteractiveFeedback);
}
