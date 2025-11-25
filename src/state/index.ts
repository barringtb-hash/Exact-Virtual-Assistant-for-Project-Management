/**
 * Unified State Management API
 *
 * This module provides a centralized access point for all application state.
 * It exports slices, selectors, actions, and utilities for managing state.
 *
 * @example
 * ```typescript
 * import {
 *   chatActions,
 *   useChatMessages,
 *   coordinatedActions,
 *   useIsProcessing
 * } from '@/state';
 *
 * // Use hooks in components
 * const messages = useChatMessages();
 * const isProcessing = useIsProcessing();
 *
 * // Dispatch actions
 * chatActions.pushUser('Hello!');
 * coordinatedActions.submitCombinedInput();
 * ```
 *
 * @module state
 */

// ============================================================
// Core utilities
// ============================================================

export {
  createSlice,
  normalizedOps,
  createNormalizedCollection,
  createSelectorHook,
  createSelectorHooks,
  type Slice,
  type SliceConfig,
  type NormalizedCollection,
  type Entity,
} from "./core/createSlice";

// ============================================================
// State Slices
// ============================================================

// Chat slice
export {
  chatSlice,
  chatActions,
  chatStoreApi,
  useChatMessages,
  useIsStreaming,
  useIsAssistantThinking,
  useInputLocked,
  useComposerDraft,
  useActiveRunId,
  useIsSyncingPreview,
  useChatMessageById,
  useChatMessageCount,
  type ChatSliceState,
  type NormalizedMessages,
  type Message,
  type Role,
} from "./slices/chat";

// Voice slice
export {
  voiceSlice,
  voiceActions,
  voiceStoreApi,
  useVoiceStatus,
  useTranscript,
  useVoiceStreamId,
  useTranscriptText,
  useTranscriptCount,
  useIsListening,
  useIsTranscribing,
  type VoiceSliceState,
  type VoiceStatus,
  type VoiceTranscriptEntry,
} from "./slices/voice";

// Draft slice
export {
  draftSlice,
  draftActions,
  draftStoreApi,
  useDraft,
  useDraftStatus,
  useAutoExtractMode,
  useDraftField,
  useDraftFieldCount,
  useIsDraftEmpty,
  useIsMerging,
  type DraftSliceState,
  type DraftDoc,
  type DraftStatus,
  type AutoExtractMode,
} from "./slices/draft";

// DocType slice
export {
  docTypeSlice,
  docTypeStoreApi,
  setDocType,
  setSuggested,
  useDocType,
  useSelectedDocType,
  useSuggestedDocType,
  useDocRouterEnabled,
  usePreviewDocType,
  useEffectiveDocType,
  getDocTypeSnapshot,
  DEFAULT_DOC_TYPE,
  supportedDocTypes,
  metadataList,
  metadataMap,
  type DocTypeSliceState,
  type DocTypeSuggestion,
} from "./slices/docType";

// ============================================================
// Legacy Store Exports (for backwards compatibility)
// ============================================================

// Conversation store
export {
  conversationActions,
  conversationStoreApi,
  useConversationSchema,
  useConversationState,
  useConversationActions,
  useConversationLastActions,
  serializeConversationState,
  getConversationStateSnapshot,
  hydrateConversationState,
  configureConversationMachineOptions,
  type ConversationSnapshot,
} from "./conversationStore";

// Sync store
export {
  syncStoreApi,
  resetSyncStore,
  ingestInput,
  submitFinalInput,
  applyPatch,
  beginAgentTurn,
  completeAgentTurn,
  reconcileAgentTurnId,
  setPolicy,
  useDraft as useSyncDraft,
  useBuffers,
} from "./syncStore";

// ============================================================
// Cross-Slice Selectors
// ============================================================

export {
  useIsProcessing,
  useIsInputDisabled,
  useTotalMessageCount,
  useHasActiveSession,
  useLastUserMessage,
  useLastAssistantMessage,
  useCombinedVoiceText,
  useIsVoiceActive,
  useDocTypeWithLabel,
  useDraftProgress,
  useCanSubmit,
  useCombinedInputText,
  useStateSummary,
} from "./selectors";

// ============================================================
// Coordinated Actions
// ============================================================

export { coordinatedActions } from "./actions";

// ============================================================
// Type Re-exports
// ============================================================

export type { Store } from "../lib/tinyStore";
export type { ChatMessage, ChatRole, StoreMessage } from "../types/chat";
export type {
  InputSource,
  InputStage,
  InputPolicy,
  InputSyncLayer,
  NormalizedInputEvent,
  AgentTurn,
  DocumentPatch,
  DraftDocument,
  SyncBuffers,
  SyncState,
} from "../types/sync";
