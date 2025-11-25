/**
 * Unified selectors for cross-slice derived state.
 *
 * These selectors combine state from multiple slices to provide
 * derived values used across the application.
 *
 * @module state/selectors
 */

import { useStore } from "../../lib/tinyStore";
import { chatSlice } from "../slices/chat";
import { voiceSlice } from "../slices/voice";
import { draftSlice } from "../slices/draft";
import { docTypeSlice } from "../slices/docType";
import { normalizedOps } from "../core/createSlice";

/**
 * Returns whether the application is in an active processing state.
 * True when streaming, thinking, transcribing, or merging.
 */
export function useIsProcessing(): boolean {
  const chatState = useStore(chatSlice.store, (s) => ({
    isStreaming: s.isStreaming,
    isAssistantThinking: s.isAssistantThinking,
    isSyncingPreview: s.isSyncingPreview,
  }));
  const voiceStatus = useStore(voiceSlice.store, (s) => s.status);
  const draftStatus = useStore(draftSlice.store, (s) => s.status);

  return (
    chatState.isStreaming ||
    chatState.isAssistantThinking ||
    chatState.isSyncingPreview ||
    voiceStatus === "transcribing" ||
    draftStatus === "merging"
  );
}

/**
 * Returns whether input should be disabled.
 * True when processing or input is explicitly locked.
 */
export function useIsInputDisabled(): boolean {
  const isProcessing = useIsProcessing();
  const inputLocked = useStore(chatSlice.store, (s) => s.inputLocked);
  return isProcessing || inputLocked;
}

/**
 * Returns the total message count.
 */
export function useTotalMessageCount(): number {
  return useStore(chatSlice.store, (s) =>
    normalizedOps.selectCount(s.messages)
  );
}

/**
 * Returns whether there is an active chat session (messages exist).
 */
export function useHasActiveSession(): boolean {
  const messageCount = useStore(chatSlice.store, (s) =>
    normalizedOps.selectCount(s.messages)
  );
  return messageCount > 0;
}

/**
 * Returns the last user message text, if any.
 */
export function useLastUserMessage(): string | undefined {
  return useStore(chatSlice.store, (s) => {
    const messages = normalizedOps.selectAll(s.messages);
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return messages[i].text;
      }
    }
    return undefined;
  });
}

/**
 * Returns the last assistant message text, if any.
 */
export function useLastAssistantMessage(): string | undefined {
  return useStore(chatSlice.store, (s) => {
    const messages = normalizedOps.selectAll(s.messages);
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return messages[i].text;
      }
    }
    return undefined;
  });
}

/**
 * Returns the combined voice transcript text.
 */
export function useCombinedVoiceText(): string {
  return useStore(voiceSlice.store, (s) =>
    normalizedOps
      .selectAll(s.transcripts)
      .map((t) => t.text)
      .join(" ")
  );
}

/**
 * Returns whether voice input is active.
 */
export function useIsVoiceActive(): boolean {
  return useStore(voiceSlice.store, (s) =>
    s.status === "listening" || s.status === "transcribing"
  );
}

/**
 * Returns the effective document type with label.
 */
export function useDocTypeWithLabel(): { type: string; label: string } {
  return useStore(docTypeSlice.store, (s) => {
    const docType = s.docType ?? "charter";
    // Get label from metadata if available
    const metadata = (docTypeSlice.store as unknown as { _metadata?: Map<string, { label?: string }> })._metadata;
    const entry = metadata?.get(docType);
    return {
      type: docType,
      label: entry?.label ?? docType,
    };
  });
}

/**
 * Returns draft field count and completion status.
 */
export function useDraftProgress(): { fieldCount: number; hasFields: boolean } {
  return useStore(draftSlice.store, (s) => {
    const draft = s.draft;
    const fieldCount = draft ? Object.keys(draft).length : 0;
    return {
      fieldCount,
      hasFields: fieldCount > 0,
    };
  });
}

/**
 * Returns whether the composer has content to submit.
 */
export function useCanSubmit(): boolean {
  const composerDraft = useStore(chatSlice.store, (s) => s.composerDraft);
  const voiceText = useCombinedVoiceText();
  const isDisabled = useIsInputDisabled();

  return !isDisabled && (composerDraft.trim().length > 0 || voiceText.trim().length > 0);
}

/**
 * Returns combined input text from composer and voice.
 */
export function useCombinedInputText(): string {
  const composerDraft = useStore(chatSlice.store, (s) => s.composerDraft);
  const voiceText = useCombinedVoiceText();

  const parts = [composerDraft.trim(), voiceText.trim()].filter(Boolean);
  return parts.join(" ");
}

/**
 * Returns application state summary for debugging.
 */
export function useStateSummary(): {
  messageCount: number;
  isStreaming: boolean;
  voiceStatus: string;
  draftStatus: string;
  docType: string | null;
} {
  const messageCount = useStore(chatSlice.store, (s) =>
    normalizedOps.selectCount(s.messages)
  );
  const isStreaming = useStore(chatSlice.store, (s) => s.isStreaming);
  const voiceStatus = useStore(voiceSlice.store, (s) => s.status);
  const draftStatus = useStore(draftSlice.store, (s) => s.status);
  const docType = useStore(docTypeSlice.store, (s) => s.docType);

  return {
    messageCount,
    isStreaming,
    voiceStatus,
    draftStatus,
    docType,
  };
}
