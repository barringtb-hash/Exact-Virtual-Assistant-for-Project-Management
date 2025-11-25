/**
 * Cross-slice coordinated actions.
 *
 * These actions coordinate state changes across multiple slices,
 * ensuring consistency when operations affect multiple domains.
 *
 * @module state/actions
 */

import { chatSlice } from "../slices/chat";
import { voiceSlice } from "../slices/voice";
import { draftSlice } from "../slices/draft";
import { docTypeSlice } from "../slices/docType";
import { normalizedOps } from "../core/createSlice";

/**
 * Coordinated actions that span multiple state slices.
 */
export const coordinatedActions = {
  /**
   * Submits voice transcript as a user message and clears the transcript.
   * Returns the submitted text, or null if nothing to submit.
   */
  submitVoiceAsMessage(): string | null {
    const transcripts = normalizedOps.selectAll(
      voiceSlice.getState().transcripts
    );

    if (transcripts.length === 0) {
      return null;
    }

    const text = transcripts.map((t) => t.text).join(" ");
    if (!text.trim()) {
      return null;
    }

    chatSlice.actions.pushUser(text);
    voiceSlice.actions.resetTranscript();

    return text;
  },

  /**
   * Submits composer draft and optional voice transcript as a user message.
   * Clears both inputs after submission.
   * Returns the submitted text, or null if nothing to submit.
   */
  submitCombinedInput(): string | null {
    const chatState = chatSlice.getState();
    const voiceState = voiceSlice.getState();

    const composerText = chatState.composerDraft.trim();
    const transcripts = normalizedOps.selectAll(voiceState.transcripts);
    const voiceText = transcripts.map((t) => t.text).join(" ").trim();

    const parts = [composerText, voiceText].filter(Boolean);
    const combined = parts.join(" ");

    if (!combined) {
      return null;
    }

    chatSlice.actions.pushUser(combined);
    chatSlice.actions.clearComposerDraft();
    voiceSlice.actions.resetTranscript();

    return combined;
  },

  /**
   * Resets all conversation state - chat messages, voice, and draft.
   * Optionally preserves the document type.
   */
  resetConversation(options?: { preserveDocType?: boolean }) {
    chatSlice.reset();
    voiceSlice.reset();
    draftSlice.actions.resetDraft();

    if (!options?.preserveDocType) {
      docTypeSlice.actions.reset();
    }
  },

  /**
   * Starts a new session with a specific document type.
   */
  startNewSession(docType: string) {
    // Reset existing state
    chatSlice.reset();
    voiceSlice.reset();
    draftSlice.actions.resetDraft();

    // Set the document type
    docTypeSlice.actions.setDocType(docType);
  },

  /**
   * Locks input across all relevant slices.
   */
  lockAllInput() {
    chatSlice.actions.lockField("composer");
    voiceSlice.actions.endVoiceStream();
  },

  /**
   * Unlocks input across all relevant slices.
   */
  unlockAllInput() {
    chatSlice.actions.unlockField("composer");
  },

  /**
   * Handles draft extraction completion.
   * Merges extracted data into draft and optionally adds a system message.
   */
  handleExtractionComplete(
    extractedData: Record<string, unknown>,
    options?: { addSystemMessage?: boolean; message?: string }
  ) {
    draftSlice.actions.mergeDraft(extractedData);

    if (options?.addSystemMessage && options?.message) {
      // Add a system/assistant message about the extraction
      const runId = `extraction-${Date.now()}`;
      chatSlice.actions.startAssistant(runId);
      chatSlice.actions.endAssistant(runId, options.message);
    }
  },

  /**
   * Cancels any ongoing operations.
   */
  cancelOngoingOperations() {
    const chatState = chatSlice.getState();

    // End streaming if active
    if (chatState.isStreaming || chatState.isAssistantThinking) {
      chatSlice.actions.endAssistant(chatState.activeRunId || "");
    }

    // End voice stream if active
    voiceSlice.actions.endVoiceStream();

    // Reset draft status
    draftSlice.actions.setStatus("idle");
  },

  /**
   * Gets the current session state snapshot for persistence.
   */
  getSessionSnapshot(): {
    messages: ReturnType<typeof normalizedOps.selectAll>;
    transcripts: ReturnType<typeof normalizedOps.selectAll>;
    draft: ReturnType<typeof draftSlice.getState>["draft"];
    docType: string | null;
  } {
    const chatState = chatSlice.getState();
    const voiceState = voiceSlice.getState();
    const draftState = draftSlice.getState();
    const docTypeState = docTypeSlice.getState();

    return {
      messages: normalizedOps.selectAll(chatState.messages),
      transcripts: normalizedOps.selectAll(voiceState.transcripts),
      draft: draftState.draft,
      docType: docTypeState.docType,
    };
  },

  /**
   * Restores session state from a snapshot.
   */
  restoreSessionSnapshot(snapshot: {
    messages?: Array<{ id: string; role: string; text: string }>;
    transcripts?: Array<{ id: string; text: string; timestamp: number }>;
    draft?: Record<string, unknown> | null;
    docType?: string | null;
  }) {
    if (snapshot.messages) {
      chatSlice.actions.hydrate(
        snapshot.messages as Parameters<typeof chatSlice.actions.hydrate>[0]
      );
    }

    if (snapshot.transcripts) {
      voiceSlice.actions.hydrate(
        snapshot.transcripts as Parameters<typeof voiceSlice.actions.hydrate>[0]
      );
    }

    if (snapshot.draft !== undefined) {
      draftSlice.actions.hydrate(snapshot.draft);
    }

    if (snapshot.docType !== undefined) {
      docTypeSlice.actions.setDocType(snapshot.docType);
    }
  },
};

// Export individual action namespaces for direct access
export { chatSlice, voiceSlice, draftSlice, docTypeSlice };

// Re-export slice actions for convenience
export const chatActions = chatSlice.actions;
export const voiceActions = voiceSlice.actions;
export const draftActions = draftSlice.actions;
export const docTypeActions = docTypeSlice.actions;
