/**
 * Review Orchestrator
 *
 * Manages interactive review sessions with state machine-based navigation
 * through feedback items. Supports guided feedback acceptance, elaboration
 * requests, and navigation commands.
 */

import { executeOpenAIExtraction } from "../documents/openai/client.js";

/**
 * Review session status
 */
export type ReviewSessionStatus =
  | "idle"
  | "reviewing"
  | "discussing"
  | "complete";

/**
 * Feedback item status
 */
export type FeedbackItemStatus =
  | "pending"
  | "accepted"
  | "dismissed"
  | "resolved";

/**
 * Feedback severity
 */
export type FeedbackSeverity = "critical" | "important" | "suggestion";

/**
 * A feedback item in the session
 */
export interface SessionFeedbackItem {
  id: string;
  field: string | null;
  dimension: string;
  severity: FeedbackSeverity;
  issue: string;
  recommendation: string;
  example?: string;
  status: FeedbackItemStatus;
  userNote?: string;
  elaboration?: string;
}

/**
 * Review session state
 */
export interface ReviewSessionState {
  sessionId: string;
  docType: string;
  status: ReviewSessionStatus;
  reviewId: string;
  overallScore: number;
  dimensionScores: Record<string, number>;
  strengths: string[];
  summary: string;
  feedback: SessionFeedbackItem[];
  currentFeedbackIndex: number;
  visitedIndices: number[];
  startedAt: number;
  completedAt: number | null;
  messages: SessionMessage[];
}

/**
 * Message in the review conversation
 */
export interface SessionMessage {
  role: "assistant" | "user";
  content: string;
  timestamp: number;
  feedbackId?: string;
}

/**
 * Navigation command types
 */
export type NavigationCommand =
  | { type: "next" }
  | { type: "previous" }
  | { type: "goto"; feedbackId: string }
  | { type: "accept"; feedbackId?: string; note?: string }
  | { type: "dismiss"; feedbackId?: string; reason?: string }
  | { type: "elaborate"; feedbackId?: string }
  | { type: "complete" }
  | { type: "exit" };

/**
 * Session store (in-memory for now)
 */
const sessions = new Map<string, ReviewSessionState>();

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get current feedback item
 */
function getCurrentFeedback(state: ReviewSessionState): SessionFeedbackItem | null {
  const pendingItems = state.feedback.filter((f) => f.status === "pending");
  if (state.currentFeedbackIndex >= pendingItems.length) {
    return null;
  }
  return pendingItems[state.currentFeedbackIndex];
}

/**
 * Get pending feedback count
 */
function getPendingCount(state: ReviewSessionState): number {
  return state.feedback.filter((f) => f.status === "pending").length;
}

/**
 * Format feedback item for display
 */
function formatFeedbackMessage(item: SessionFeedbackItem, index: number, total: number): string {
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
 */
function parseUserCommand(input: string): NavigationCommand | null {
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
 */
async function generateElaboration(
  item: SessionFeedbackItem,
  docType: string
): Promise<string> {
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
 */
export function createReviewSession(
  docType: string,
  reviewResult: {
    reviewId: string;
    scores: { overall: number; dimensions: Record<string, number> };
    strengths: string[];
    feedback: SessionFeedbackItem[];
    summary: string;
  }
): ReviewSessionState {
  const sessionId = generateSessionId();

  const state: ReviewSessionState = {
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

  let welcomeMessage = `## Interactive Review Session\n\n`;
  welcomeMessage += `Your charter scored **${state.overallScore}%** overall.\n\n`;

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
    welcomeMessage += "No feedback items to review. Your charter looks good!";
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
 * Process user message in review session
 */
export async function processReviewMessage(
  sessionId: string,
  userMessage: string
): Promise<{ state: ReviewSessionState; response: string }> {
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
 * Handle navigation command
 */
async function handleCommand(
  state: ReviewSessionState,
  command: NavigationCommand
): Promise<string> {
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
 * Get review session by ID
 */
export function getReviewSession(sessionId: string): ReviewSessionState | null {
  return sessions.get(sessionId) || null;
}

/**
 * Delete review session
 */
export function deleteReviewSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Get session summary
 */
export function getSessionSummary(sessionId: string): {
  accepted: SessionFeedbackItem[];
  dismissed: SessionFeedbackItem[];
  pending: SessionFeedbackItem[];
} | null {
  const state = sessions.get(sessionId);
  if (!state) return null;

  return {
    accepted: state.feedback.filter((f) => f.status === "accepted"),
    dismissed: state.feedback.filter((f) => f.status === "dismissed"),
    pending: state.feedback.filter((f) => f.status === "pending"),
  };
}
