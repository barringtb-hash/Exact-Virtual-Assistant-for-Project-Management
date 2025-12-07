/**
 * Review Orchestrator
 *
 * Manages interactive review sessions with state machine-based navigation
 * through feedback items. Supports guided feedback acceptance, elaboration
 * requests, and navigation commands.
 *
 * @module server/review/Orchestrator
 */

import { executeOpenAIExtraction } from "../documents/openai/client.js";

/**
 * Session store (in-memory for now)
 * @type {Map<string, ReviewSessionState>}
 */
const sessions = new Map();

/**
 * Session cleanup configuration
 * Sessions expire after 2 hours of inactivity
 */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let cleanupIntervalId = null;

/**
 * Start session cleanup interval
 */
function startSessionCleanup() {
  if (cleanupIntervalId !== null) return;

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, state] of sessions.entries()) {
      // Get last activity time from messages or session start
      const lastActivity = state.messages.length > 0
        ? state.messages[state.messages.length - 1].timestamp
        : state.startedAt;

      // Remove completed sessions older than TTL or inactive sessions
      const isExpired = now - lastActivity > SESSION_TTL_MS;
      const isOldCompleted = state.status === "complete" && state.completedAt && (now - state.completedAt > SESSION_TTL_MS / 2);

      if (isExpired || isOldCompleted) {
        sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ReviewOrchestrator] Cleaned up ${cleanedCount} expired session(s). Active sessions: ${sessions.size}`);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  // Allow process to exit without waiting for cleanup
  if (typeof cleanupIntervalId.unref === "function") {
    cleanupIntervalId.unref();
  }
}

/**
 * Stop session cleanup interval (for testing)
 */
export function stopSessionCleanup() {
  if (cleanupIntervalId !== null) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

/**
 * Get count of active sessions (for monitoring)
 * @returns {number}
 */
export function getActiveSessionCount() {
  return sessions.size;
}

// Start cleanup on module load
startSessionCleanup();

/**
 * Format document type for display in messages
 * @param {string} docType
 * @returns {string}
 */
function formatDocTypeLabel(docType) {
  const labels = {
    charter: "Charter",
    ddp: "Design & Development Plan",
    sow: "Statement of Work",
  };
  return labels[docType?.toLowerCase()] || docType?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "document";
}

/**
 * Generate unique session ID
 * @returns {string}
 */
function generateSessionId() {
  return `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get current feedback item
 * @param {ReviewSessionState} state
 * @returns {SessionFeedbackItem|null}
 */
function getCurrentFeedback(state) {
  const pendingItems = state.feedback.filter((f) => f.status === "pending");
  if (state.currentFeedbackIndex >= pendingItems.length) {
    return null;
  }
  return pendingItems[state.currentFeedbackIndex];
}

/**
 * Get pending feedback count
 * @param {ReviewSessionState} state
 * @returns {number}
 */
function getPendingCount(state) {
  return state.feedback.filter((f) => f.status === "pending").length;
}

/**
 * Format feedback item for display
 * @param {SessionFeedbackItem} item
 * @param {number} index
 * @param {number} total
 * @returns {string}
 */
function formatFeedbackMessage(item, index, total) {
  const fieldLabel = item.field
    ? item.field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "General";

  const severityEmoji = {
    critical: "🔴",
    important: "🟡",
    suggestion: "🔵",
  }[item.severity];

  let message = `**Feedback ${index + 1} of ${total}** ${severityEmoji} ${item.severity.toUpperCase()}\n\n`;
  message += `**Field:** ${fieldLabel}\n`;
  message += `**Issue:** ${item.issue}\n\n`;
  message += `**Recommendation:** ${item.recommendation}`;

  if (item.example) {
    message += `\n\n**Example:** ${item.example}`;
  }

  message += "\n\n---\n";
  message += "Commands: **accept** | **dismiss** | **tell me more** | **next** | **previous** | **done**";

  return message;
}

/**
 * Parse user input for commands
 * @param {string} input
 * @returns {NavigationCommand|null}
 */
function parseUserCommand(input) {
  const normalized = input.toLowerCase().trim();

  if (normalized === "next" || normalized === "skip") {
    return { type: "next" };
  }

  if (normalized === "previous" || normalized === "back" || normalized === "prev") {
    return { type: "previous" };
  }

  if (normalized === "accept" || normalized === "ok" || normalized === "yes") {
    return { type: "accept" };
  }

  if (normalized.startsWith("accept ")) {
    return { type: "accept", note: input.slice(7).trim() };
  }

  if (normalized === "dismiss" || normalized === "no" || normalized === "ignore") {
    return { type: "dismiss" };
  }

  if (normalized.startsWith("dismiss ")) {
    return { type: "dismiss", reason: input.slice(8).trim() };
  }

  if (
    normalized === "elaborate" ||
    normalized === "tell me more" ||
    normalized === "explain" ||
    normalized === "more"
  ) {
    return { type: "elaborate" };
  }

  if (normalized === "done" || normalized === "complete" || normalized === "finish") {
    return { type: "complete" };
  }

  if (normalized === "exit" || normalized === "quit" || normalized === "cancel") {
    return { type: "exit" };
  }

  // Check for goto command
  const gotoMatch = normalized.match(/^(?:go to|goto|jump to)\s+(\d+|fb_\w+)$/);
  if (gotoMatch) {
    const target = gotoMatch[1];
    if (target.startsWith("fb_")) {
      return { type: "goto", feedbackId: target };
    }
    // Convert number to feedback ID (0-indexed internally)
    const index = parseInt(target, 10) - 1;
    return { type: "goto", feedbackId: `fb_${String(index + 1).padStart(3, "0")}` };
  }

  return null;
}

/**
 * Generate elaboration for a feedback item using LLM
 * @param {SessionFeedbackItem} item
 * @param {string} docType
 * @returns {Promise<string>}
 */
async function generateElaboration(item, docType) {
  const prompt = `You are a project management expert providing detailed guidance on improving a ${docType}.

A reviewer identified this issue:
- Field: ${item.field || "General"}
- Issue: ${item.issue}
- Initial Recommendation: ${item.recommendation}
${item.example ? `- Example: ${item.example}` : ""}

Please provide a more detailed explanation:
1. Why this matters for project success
2. Specific steps to address this issue
3. Common mistakes to avoid
4. A concrete example if applicable

Keep your response focused and actionable, around 150-200 words.`;

  try {
    const response = await executeOpenAIExtraction({
      systemSections: [prompt],
      messages: [{ role: "user", content: "Please elaborate on this feedback." }],
      model: "gpt-4o-mini",
      temperature: 0.4,
    });

    return response.elaboration || response.content || response.result || "Unable to generate elaboration.";
  } catch (error) {
    console.error("Failed to generate elaboration:", error);
    return "Sorry, I couldn't generate additional details at this time.";
  }
}

/**
 * Create a new review session
 *
 * @param {string} docType - Document type
 * @param {object} reviewResult - Review result object
 * @param {string} reviewResult.reviewId
 * @param {{ overall: number; dimensions: Record<string, number> }} reviewResult.scores
 * @param {string[]} reviewResult.strengths
 * @param {SessionFeedbackItem[]} reviewResult.feedback
 * @param {string} reviewResult.summary
 * @returns {ReviewSessionState}
 */
export function createReviewSession(docType, reviewResult) {
  const sessionId = generateSessionId();

  const state = {
    sessionId,
    docType,
    status: "reviewing",
    reviewId: reviewResult.reviewId,
    overallScore: reviewResult.scores.overall,
    dimensionScores: reviewResult.scores.dimensions,
    strengths: reviewResult.strengths,
    summary: reviewResult.summary,
    feedback: reviewResult.feedback.map((f) => ({
      ...f,
      status: f.status || "pending",
    })),
    currentFeedbackIndex: 0,
    visitedIndices: [0],
    startedAt: Date.now(),
    completedAt: null,
    messages: [],
  };

  // Add initial message
  const pendingCount = getPendingCount(state);
  const currentItem = getCurrentFeedback(state);

  // Use document type label instead of hardcoded "charter"
  const docLabel = formatDocTypeLabel(docType);

  let welcomeMessage = `## Interactive Review Session\n\n`;
  welcomeMessage += `Your ${docLabel} scored **${state.overallScore}%** overall.\n\n`;

  if (state.strengths.length > 0) {
    welcomeMessage += `**Strengths:**\n`;
    state.strengths.forEach((s) => {
      welcomeMessage += `- ${s}\n`;
    });
    welcomeMessage += "\n";
  }

  welcomeMessage += `I found **${pendingCount}** feedback items to review.\n\n`;

  if (currentItem) {
    welcomeMessage += formatFeedbackMessage(currentItem, 0, pendingCount);
  } else {
    welcomeMessage += `No feedback items to review. Your ${docLabel} looks good!`;
    state.status = "complete";
  }

  state.messages.push({
    role: "assistant",
    content: welcomeMessage,
    timestamp: Date.now(),
    feedbackId: currentItem?.id,
  });

  sessions.set(sessionId, state);
  return state;
}

/**
 * Handle navigation command
 * @param {ReviewSessionState} state
 * @param {NavigationCommand} command
 * @returns {Promise<string>}
 */
async function handleCommand(state, command) {
  const pendingItems = state.feedback.filter((f) => f.status === "pending");
  const currentItem = getCurrentFeedback(state);

  switch (command.type) {
    case "next": {
      if (state.currentFeedbackIndex >= pendingItems.length - 1) {
        return "You've reached the end of the feedback items. Say **done** to complete the review or **previous** to go back.";
      }
      state.currentFeedbackIndex++;
      if (!state.visitedIndices.includes(state.currentFeedbackIndex)) {
        state.visitedIndices.push(state.currentFeedbackIndex);
      }
      const nextItem = getCurrentFeedback(state);
      return nextItem
        ? formatFeedbackMessage(nextItem, state.currentFeedbackIndex, pendingItems.length)
        : "No more feedback items.";
    }

    case "previous": {
      if (state.currentFeedbackIndex <= 0) {
        return "You're at the first feedback item.";
      }
      state.currentFeedbackIndex--;
      const prevItem = getCurrentFeedback(state);
      return prevItem
        ? formatFeedbackMessage(prevItem, state.currentFeedbackIndex, pendingItems.length)
        : "No feedback item found.";
    }

    case "goto": {
      const targetIndex = pendingItems.findIndex((f) => f.id === command.feedbackId);
      if (targetIndex === -1) {
        return `Feedback item ${command.feedbackId} not found or already addressed.`;
      }
      state.currentFeedbackIndex = targetIndex;
      if (!state.visitedIndices.includes(targetIndex)) {
        state.visitedIndices.push(targetIndex);
      }
      const gotoItem = pendingItems[targetIndex];
      return formatFeedbackMessage(gotoItem, targetIndex, pendingItems.length);
    }

    case "accept": {
      if (!currentItem) {
        return "No current feedback item to accept.";
      }
      const itemToAccept = state.feedback.find((f) => f.id === currentItem.id);
      if (itemToAccept) {
        itemToAccept.status = "accepted";
        if (command.note) {
          itemToAccept.userNote = command.note;
        }
      }

      const remainingPending = state.feedback.filter((f) => f.status === "pending");
      if (remainingPending.length === 0) {
        state.status = "complete";
        state.completedAt = Date.now();
        return `Feedback accepted. ✓\n\nYou've addressed all feedback items! Your review session is complete.\n\n**Summary:** ${state.summary}`;
      }

      // Move to next pending item
      state.currentFeedbackIndex = 0; // Reset since pending list changed
      const nextPending = getCurrentFeedback(state);
      let acceptResponse = `Feedback accepted. ✓\n\n${remainingPending.length} item(s) remaining.\n\n`;
      if (nextPending) {
        acceptResponse += formatFeedbackMessage(nextPending, 0, remainingPending.length);
      }
      return acceptResponse;
    }

    case "dismiss": {
      if (!currentItem) {
        return "No current feedback item to dismiss.";
      }
      const itemToDismiss = state.feedback.find((f) => f.id === currentItem.id);
      if (itemToDismiss) {
        itemToDismiss.status = "dismissed";
        if (command.reason) {
          itemToDismiss.userNote = command.reason;
        }
      }

      const remainingPending = state.feedback.filter((f) => f.status === "pending");
      if (remainingPending.length === 0) {
        state.status = "complete";
        state.completedAt = Date.now();
        return `Feedback dismissed.\n\nYou've addressed all feedback items! Your review session is complete.\n\n**Summary:** ${state.summary}`;
      }

      state.currentFeedbackIndex = 0;
      const nextPending = getCurrentFeedback(state);
      let dismissResponse = `Feedback dismissed.\n\n${remainingPending.length} item(s) remaining.\n\n`;
      if (nextPending) {
        dismissResponse += formatFeedbackMessage(nextPending, 0, remainingPending.length);
      }
      return dismissResponse;
    }

    case "elaborate": {
      if (!currentItem) {
        return "No current feedback item to elaborate on.";
      }

      state.status = "discussing";
      const elaboration = await generateElaboration(currentItem, state.docType);
      currentItem.elaboration = elaboration;
      state.status = "reviewing";

      return `## More Details\n\n${elaboration}\n\n---\nCommands: **accept** | **dismiss** | **next** | **previous** | **done**`;
    }

    case "complete": {
      const remaining = state.feedback.filter((f) => f.status === "pending");
      if (remaining.length > 0) {
        return `You still have ${remaining.length} pending feedback item(s). Do you want to **accept all**, **dismiss all**, or continue reviewing?`;
      }
      state.status = "complete";
      state.completedAt = Date.now();

      const accepted = state.feedback.filter((f) => f.status === "accepted").length;
      const dismissed = state.feedback.filter((f) => f.status === "dismissed").length;

      return `## Review Complete! ✓\n\n**Results:**\n- Accepted: ${accepted}\n- Dismissed: ${dismissed}\n\n**Summary:** ${state.summary}\n\nYour feedback has been recorded. You can now update your charter based on the accepted recommendations.`;
    }

    case "exit": {
      state.status = "complete";
      state.completedAt = Date.now();
      return "Review session ended. Your progress has been saved.";
    }

    default:
      return "Unknown command.";
  }
}

/**
 * Process user message in review session
 *
 * @param {string} sessionId
 * @param {string} userMessage
 * @returns {Promise<{ state: ReviewSessionState; response: string }>}
 */
export async function processReviewMessage(sessionId, userMessage) {
  const state = sessions.get(sessionId);

  if (!state) {
    throw new Error(`Review session not found: ${sessionId}`);
  }

  // Add user message to history
  state.messages.push({
    role: "user",
    content: userMessage,
    timestamp: Date.now(),
  });

  // Parse command
  const command = parseUserCommand(userMessage);
  let response = "";

  if (!command) {
    // If no command detected, treat as a question and provide guidance
    response = "I didn't understand that command. You can say:\n";
    response += "- **accept** - Accept this feedback\n";
    response += "- **dismiss** - Dismiss this feedback\n";
    response += "- **tell me more** - Get more details\n";
    response += "- **next** / **previous** - Navigate between items\n";
    response += "- **done** - Complete the review session";
  } else {
    response = await handleCommand(state, command);
  }

  // Add response to history
  state.messages.push({
    role: "assistant",
    content: response,
    timestamp: Date.now(),
    feedbackId: getCurrentFeedback(state)?.id,
  });

  sessions.set(sessionId, state);
  return { state, response };
}

/**
 * Get review session by ID
 *
 * @param {string} sessionId
 * @returns {ReviewSessionState|null}
 */
export function getReviewSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Delete review session
 *
 * @param {string} sessionId
 * @returns {boolean}
 */
export function deleteReviewSession(sessionId) {
  return sessions.delete(sessionId);
}

/**
 * Get session summary
 *
 * @param {string} sessionId
 * @returns {{ accepted: SessionFeedbackItem[]; dismissed: SessionFeedbackItem[]; pending: SessionFeedbackItem[] }|null}
 */
export function getSessionSummary(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) return null;

  return {
    accepted: state.feedback.filter((f) => f.status === "accepted"),
    dismissed: state.feedback.filter((f) => f.status === "dismissed"),
    pending: state.feedback.filter((f) => f.status === "pending"),
  };
}

/**
 * Clear all sessions (for testing)
 */
export function __clearSessions() {
  sessions.clear();
}

/**
 * @typedef {'idle' | 'reviewing' | 'discussing' | 'complete'} ReviewSessionStatus
 * @typedef {'pending' | 'accepted' | 'dismissed' | 'resolved'} FeedbackItemStatus
 * @typedef {'critical' | 'important' | 'suggestion'} FeedbackSeverity
 *
 * @typedef {object} SessionFeedbackItem
 * @property {string} id
 * @property {string|null} field
 * @property {string} dimension
 * @property {FeedbackSeverity} severity
 * @property {string} issue
 * @property {string} recommendation
 * @property {string} [example]
 * @property {FeedbackItemStatus} status
 * @property {string} [userNote]
 * @property {string} [elaboration]
 *
 * @typedef {object} ReviewSessionState
 * @property {string} sessionId
 * @property {string} docType
 * @property {ReviewSessionStatus} status
 * @property {string} reviewId
 * @property {number} overallScore
 * @property {Record<string, number>} dimensionScores
 * @property {string[]} strengths
 * @property {string} summary
 * @property {SessionFeedbackItem[]} feedback
 * @property {number} currentFeedbackIndex
 * @property {number[]} visitedIndices
 * @property {number} startedAt
 * @property {number|null} completedAt
 * @property {SessionMessage[]} messages
 *
 * @typedef {object} SessionMessage
 * @property {'assistant' | 'user'} role
 * @property {string} content
 * @property {number} timestamp
 * @property {string} [feedbackId]
 *
 * @typedef {{ type: 'next' } | { type: 'previous' } | { type: 'goto'; feedbackId: string } | { type: 'accept'; feedbackId?: string; note?: string } | { type: 'dismiss'; feedbackId?: string; reason?: string } | { type: 'elaborate'; feedbackId?: string } | { type: 'complete' } | { type: 'exit' }} NavigationCommand
 */
