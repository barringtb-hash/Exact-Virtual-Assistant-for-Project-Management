/**
 * Unified slice exports.
 *
 * All state slices are exported from this module for centralized access.
 *
 * @module state/slices
 */

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
} from "./chat";

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
} from "./voice";

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
} from "./draft";

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
} from "./docType";

// Re-export existing stores with wrapper access
// These maintain backwards compatibility while using the unified system

// Conversation store - uses existing complex machine-based logic
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
} from "../conversationStore";

// Sync store - uses existing complex sync logic
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
} from "../syncStore";
