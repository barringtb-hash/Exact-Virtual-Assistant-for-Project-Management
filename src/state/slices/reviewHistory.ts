/**
 * Review History State Slice
 *
 * Tracks past review sessions to show improvement over time.
 * Persists to localStorage for session continuity.
 *
 * @module state/slices/reviewHistory
 */

import { createSlice } from "../core/createSlice";

/**
 * Review history entry
 */
export interface ReviewHistoryEntry {
  /** Unique review ID */
  reviewId: string;
  /** Document type */
  docType: string;
  /** Document hash for comparison */
  documentHash: string;
  /** Timestamp of review */
  timestamp: string;
  /** Overall score */
  overallScore: number;
  /** Dimension scores */
  dimensionScores: Record<string, number>;
  /** Number of feedback items */
  feedbackCount: number;
  /** Number of critical issues */
  criticalCount: number;
  /** Number of important issues */
  importantCount: number;
  /** Number of suggestions */
  suggestionCount: number;
  /** Summary text */
  summary: string;
}

/**
 * Review history state
 */
export interface ReviewHistoryState {
  /** All review history entries */
  entries: ReviewHistoryEntry[];
  /** Maximum number of entries to keep */
  maxEntries: number;
  /** Last loaded from storage timestamp */
  lastLoadedAt: number | null;
}

const STORAGE_KEY = "eva_review_history";
const MAX_ENTRIES = 50;

/**
 * Load history from localStorage
 */
function loadFromStorage(): ReviewHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validate entries
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.reviewId === "string" &&
        typeof entry.timestamp === "string"
    );
  } catch (error) {
    console.warn("Failed to load review history from storage:", error);
    return [];
  }
}

/**
 * Save history to localStorage
 */
function saveToStorage(entries: ReviewHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Failed to save review history to storage:", error);
  }
}

const initialState: ReviewHistoryState = {
  entries: [],
  maxEntries: MAX_ENTRIES,
  lastLoadedAt: null,
};

/**
 * Review history slice
 */
export const reviewHistorySlice = createSlice({
  name: "reviewHistory",
  initialState,
  actions: (setState, getState) => ({
    /**
     * Load history from localStorage
     */
    loadHistory() {
      const entries = loadFromStorage();
      setState({
        entries,
        lastLoadedAt: Date.now(),
      });
    },

    /**
     * Add a new review to history
     */
    addReview(review: {
      reviewId: string;
      docType: string;
      documentHash: string;
      timestamp: string;
      scores: { overall: number; dimensions: Record<string, number> };
      feedback: Array<{ severity: string }>;
      summary: string;
    }) {
      const state = getState();

      const entry: ReviewHistoryEntry = {
        reviewId: review.reviewId,
        docType: review.docType,
        documentHash: review.documentHash,
        timestamp: review.timestamp,
        overallScore: review.scores.overall,
        dimensionScores: review.scores.dimensions,
        feedbackCount: review.feedback.length,
        criticalCount: review.feedback.filter((f) => f.severity === "critical").length,
        importantCount: review.feedback.filter((f) => f.severity === "important").length,
        suggestionCount: review.feedback.filter((f) => f.severity === "suggestion").length,
        summary: review.summary,
      };

      // Add to front, remove duplicates by documentHash, limit to maxEntries
      const filteredEntries = state.entries.filter(
        (e) => e.documentHash !== entry.documentHash
      );
      const newEntries = [entry, ...filteredEntries].slice(0, state.maxEntries);

      setState({ entries: newEntries });
      saveToStorage(newEntries);
    },

    /**
     * Clear all history
     */
    clearHistory() {
      setState({ entries: [] });
      saveToStorage([]);
    },

    /**
     * Remove a specific review from history
     */
    removeReview(reviewId: string) {
      const state = getState();
      const newEntries = state.entries.filter((e) => e.reviewId !== reviewId);
      setState({ entries: newEntries });
      saveToStorage(newEntries);
    },

    /**
     * Get reviews for a specific document hash
     */
    getReviewsForDocument(documentHash: string): ReviewHistoryEntry[] {
      const state = getState();
      return state.entries.filter((e) => e.documentHash === documentHash);
    },
  }),
});

/**
 * Export actions
 */
export const reviewHistoryActions = reviewHistorySlice.actions;

/**
 * Hook to get review history state
 */
export function useReviewHistory() {
  return reviewHistorySlice.useStore();
}

/**
 * Hook to get review history entries
 */
export function useReviewHistoryEntries() {
  return reviewHistorySlice.useStore().entries;
}

/**
 * Hook to get latest review for a document type
 */
export function useLatestReview(docType: string) {
  const state = reviewHistorySlice.useStore();
  return state.entries.find((e) => e.docType === docType) || null;
}

/**
 * Hook to get review improvement stats
 */
export function useReviewImprovement(documentHash: string) {
  const state = reviewHistorySlice.useStore();
  const reviews = state.entries
    .filter((e) => e.documentHash === documentHash)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (reviews.length < 2) {
    return null;
  }

  const first = reviews[0];
  const latest = reviews[reviews.length - 1];

  return {
    firstScore: first.overallScore,
    latestScore: latest.overallScore,
    improvement: latest.overallScore - first.overallScore,
    reviewCount: reviews.length,
    firstReview: first,
    latestReview: latest,
    allReviews: reviews,
  };
}

/**
 * Selector to get review history statistics
 */
export function selectReviewStats(state: ReviewHistoryState) {
  const entries = state.entries;

  if (entries.length === 0) {
    return {
      totalReviews: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      mostRecentReview: null,
    };
  }

  const scores = entries.map((e) => e.overallScore);

  return {
    totalReviews: entries.length,
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    mostRecentReview: entries[0],
  };
}

export default reviewHistorySlice;
