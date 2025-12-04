import React, { useState, useCallback, useMemo } from "react";

/**
 * Score bar component for displaying dimension scores
 */
function ScoreBar({ score, label, threshold = 70 }) {
  const percentage = Math.min(100, Math.max(0, score));
  const isPassing = percentage >= threshold;

  const getScoreColor = () => {
    if (percentage >= 90) return "bg-green-500";
    if (percentage >= 75) return "bg-green-400";
    if (percentage >= 60) return "bg-yellow-400";
    if (percentage >= 40) return "bg-orange-400";
    return "bg-red-400";
  };

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-sm text-gray-600 w-32 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getScoreColor()} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={`text-sm font-medium w-10 text-right ${
          isPassing ? "text-gray-700" : "text-orange-600"
        }`}
      >
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

/**
 * Severity badge component
 */
function SeverityBadge({ severity }) {
  const config = {
    critical: {
      bg: "bg-red-100",
      text: "text-red-700",
      border: "border-red-200",
      icon: "!",
      label: "Critical",
    },
    important: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      border: "border-yellow-200",
      icon: "!",
      label: "Important",
    },
    suggestion: {
      bg: "bg-blue-100",
      text: "text-blue-700",
      border: "border-blue-200",
      icon: "i",
      label: "Suggestion",
    },
  };

  const { bg, text, border, label } = config[severity] || config.suggestion;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${bg} ${text} ${border} border`}
    >
      {label}
    </span>
  );
}

/**
 * Individual feedback item component
 */
function FeedbackItem({ item, onAccept, onDismiss, onTellMore }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDismissed = item.status === "dismissed";
  const isAccepted = item.status === "accepted";
  const isResolved = item.status === "resolved";

  const fieldLabel = item.field
    ? item.field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "General";

  const dimensionLabel = item.dimension
    ? item.dimension.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  if (isDismissed) {
    return null;
  }

  return (
    <div
      className={`border rounded-lg p-4 mb-3 transition-all ${
        isAccepted || isResolved
          ? "bg-green-50 border-green-200"
          : item.severity === "critical"
          ? "bg-red-50 border-red-200"
          : item.severity === "important"
          ? "bg-yellow-50 border-yellow-200"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={item.severity} />
          <span className="text-sm font-medium text-gray-700">{fieldLabel}</span>
          {dimensionLabel && (
            <span className="text-xs text-gray-500">({dimensionLabel})</span>
          )}
        </div>
        {(isAccepted || isResolved) && (
          <span className="text-green-600 text-sm font-medium">
            {isResolved ? "Resolved" : "Accepted"}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-800 mb-2">{item.issue}</p>

      {item.recommendation && (
        <div className="text-sm text-gray-600 mb-2">
          <span className="font-medium">Recommendation: </span>
          {item.recommendation}
        </div>
      )}

      {isExpanded && item.example && (
        <div className="text-sm text-gray-600 bg-gray-100 rounded p-2 mb-2">
          <span className="font-medium">Example: </span>
          {item.example}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        {!isAccepted && !isResolved && (
          <>
            <button
              onClick={() => onAccept?.(item.id)}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onDismiss?.(item.id)}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Dismiss
            </button>
          </>
        )}
        {item.example && !isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            Show example
          </button>
        )}
        {onTellMore && !isAccepted && !isResolved && (
          <button
            onClick={() => onTellMore?.(item.id)}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            Tell me more
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Strengths list component
 */
function StrengthsList({ strengths }) {
  if (!strengths || strengths.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
        <span className="text-green-500">&#10003;</span> Strengths
      </h4>
      <ul className="space-y-1">
        {strengths.map((strength, index) => (
          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="text-green-500 mt-0.5">&#8226;</span>
            {strength}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Overall score display component
 */
function OverallScore({ score }) {
  const getScoreGrade = () => {
    if (score >= 90) return { label: "Excellent", color: "text-green-600" };
    if (score >= 75) return { label: "Good", color: "text-green-500" };
    if (score >= 60) return { label: "Adequate", color: "text-yellow-600" };
    if (score >= 40) return { label: "Needs Work", color: "text-orange-600" };
    return { label: "Critical", color: "text-red-600" };
  };

  const { label, color } = getScoreGrade();

  return (
    <div className="text-center mb-6">
      <div className="text-5xl font-bold text-gray-800">{Math.round(score)}%</div>
      <div className={`text-lg font-medium ${color}`}>{label}</div>
    </div>
  );
}

/**
 * Dimension labels for display
 */
const DIMENSION_LABELS = {
  completeness: "Completeness",
  specificity: "Specificity",
  feasibility: "Feasibility",
  risk_coverage: "Risk Coverage",
  scope_clarity: "Scope Clarity",
  metric_measurability: "Metric Measurability",
};

/**
 * Main ReviewPanel component
 *
 * @param {object} props
 * @param {object} props.review - Review result from API
 * @param {function} props.onAcceptFeedback - Callback when feedback is accepted
 * @param {function} props.onDismissFeedback - Callback when feedback is dismissed
 * @param {function} props.onTellMore - Callback for "tell me more" action
 * @param {function} props.onRerunReview - Callback to re-run the review
 * @param {function} props.onExportFeedback - Callback to export feedback
 * @param {boolean} props.isLoading - Whether a review is in progress
 * @param {string} props.className - Additional CSS classes
 */
export default function ReviewPanel({
  review,
  onAcceptFeedback,
  onDismissFeedback,
  onTellMore,
  onRerunReview,
  onExportFeedback,
  isLoading = false,
  className = "",
}) {
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [feedbackStates, setFeedbackStates] = useState({});

  // Merge feedback states with review feedback
  const feedbackWithStates = useMemo(() => {
    if (!review?.feedback) return [];
    return review.feedback.map((item) => ({
      ...item,
      status: feedbackStates[item.id] || item.status || "pending",
    }));
  }, [review?.feedback, feedbackStates]);

  // Filter feedback by severity
  const filteredFeedback = useMemo(() => {
    if (filterSeverity === "all") {
      return feedbackWithStates;
    }
    return feedbackWithStates.filter((item) => item.severity === filterSeverity);
  }, [feedbackWithStates, filterSeverity]);

  // Count by severity
  const severityCounts = useMemo(() => {
    if (!review?.feedback) return { critical: 0, important: 0, suggestion: 0 };
    return review.feedback.reduce(
      (acc, item) => {
        if (item.severity && acc[item.severity] !== undefined) {
          acc[item.severity]++;
        }
        return acc;
      },
      { critical: 0, important: 0, suggestion: 0 }
    );
  }, [review?.feedback]);

  // Handle accept feedback
  const handleAccept = useCallback(
    (feedbackId) => {
      setFeedbackStates((prev) => ({ ...prev, [feedbackId]: "accepted" }));
      onAcceptFeedback?.(feedbackId);
    },
    [onAcceptFeedback]
  );

  // Handle dismiss feedback
  const handleDismiss = useCallback(
    (feedbackId) => {
      setFeedbackStates((prev) => ({ ...prev, [feedbackId]: "dismissed" }));
      onDismissFeedback?.(feedbackId);
    },
    [onDismissFeedback]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Analyzing document...</span>
        </div>
      </div>
    );
  }

  // No review data
  if (!review) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
        <div className="text-center py-8 text-gray-500">
          <p>No review data available.</p>
          {onRerunReview && (
            <button
              onClick={onRerunReview}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Start Review
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Charter Review</h3>
          <div className="flex items-center gap-2">
            {onRerunReview && (
              <button
                onClick={onRerunReview}
                className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-100 transition-colors"
              >
                Re-run Review
              </button>
            )}
            {onExportFeedback && (
              <button
                onClick={onExportFeedback}
                className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-100 transition-colors"
              >
                Export
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Overall Score */}
        <OverallScore score={review.scores?.overall || 0} />

        {/* Dimension Scores */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Dimension Scores</h4>
          <div className="space-y-1">
            {Object.entries(review.scores?.dimensions || {}).map(([dimension, score]) => (
              <ScoreBar
                key={dimension}
                label={DIMENSION_LABELS[dimension] || dimension}
                score={score}
              />
            ))}
          </div>
        </div>

        {/* Strengths */}
        <StrengthsList strengths={review.strengths} />

        {/* Feedback Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              Feedback
              <span className="text-xs text-gray-500 font-normal">
                ({filteredFeedback.filter((f) => f.status !== "dismissed").length} items)
              </span>
            </h4>

            {/* Severity Filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterSeverity("all")}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === "all"
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterSeverity("critical")}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === "critical"
                    ? "bg-red-600 text-white"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >
                Critical ({severityCounts.critical})
              </button>
              <button
                onClick={() => setFilterSeverity("important")}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === "important"
                    ? "bg-yellow-600 text-white"
                    : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                }`}
              >
                Important ({severityCounts.important})
              </button>
              <button
                onClick={() => setFilterSeverity("suggestion")}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === "suggestion"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
              >
                Suggestions ({severityCounts.suggestion})
              </button>
            </div>
          </div>

          {/* Feedback Items */}
          <div className="space-y-3">
            {filteredFeedback.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No feedback items to display.
              </p>
            ) : (
              filteredFeedback.map((item) => (
                <FeedbackItem
                  key={item.id}
                  item={item}
                  onAccept={handleAccept}
                  onDismiss={handleDismiss}
                  onTellMore={onTellMore}
                />
              ))
            )}
          </div>
        </div>

        {/* Summary */}
        {review.summary && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Summary</h4>
            <p className="text-sm text-gray-600">{review.summary}</p>
          </div>
        )}

        {/* Metadata */}
        {review.metadata && (
          <div className="mt-4 pt-4 border-t text-xs text-gray-400">
            <span>Model: {review.metadata.modelUsed}</span>
            <span className="mx-2">|</span>
            <span>Processing time: {review.metadata.processingTimeMs}ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

export { ScoreBar, SeverityBadge, FeedbackItem, StrengthsList, OverallScore };
