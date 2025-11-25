/**
 * Chat state slice - manages chat messages and streaming state.
 *
 * @module state/slices/chat
 */

import { produce } from "immer";
import {
  createSlice,
  normalizedOps,
  type NormalizedCollection,
} from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";
import { createId } from "../../utils/id";
import type { ChatRole, StoreMessage } from "../../types/chat";

// Re-export types for backwards compatibility
export type Role = ChatRole;
export type Message = StoreMessage;

/**
 * Normalized messages collection.
 */
export interface NormalizedMessages extends NormalizedCollection<Message> {}

/**
 * Chat slice state shape.
 */
export interface ChatSliceState {
  messages: NormalizedMessages;
  isStreaming: boolean;
  isAssistantThinking: boolean;
  isSyncingPreview: boolean;
  inputLocked: boolean;
  activeRunId?: string;
  composerDraft: string;
}

const initialState: ChatSliceState = {
  messages: { byId: {}, allIds: [] },
  isStreaming: false,
  isAssistantThinking: false,
  isSyncingPreview: false,
  inputLocked: false,
  activeRunId: undefined,
  composerDraft: "",
};

/**
 * Chat slice with normalized message storage.
 */
export const chatSlice = createSlice({
  name: "chat",
  initialState,
  actions: (setState, getState, store) => ({
    /**
     * Hydrates the store with a list of messages.
     */
    hydrate(messages: Message[]) {
      setState({ messages: normalizedOps.setAll(messages) });
    },

    /**
     * Resets the chat to initial state.
     */
    reset() {
      setState({
        messages: { byId: {}, allIds: [] },
        isStreaming: false,
        isAssistantThinking: false,
        isSyncingPreview: false,
        inputLocked: false,
        activeRunId: undefined,
      });
    },

    /**
     * Adds a user message to the chat.
     */
    pushUser(content: string) {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }
      const message: Message = {
        id: createId(),
        role: "user",
        text: trimmed,
      };
      setState((state) => ({
        messages: normalizedOps.add(state.messages, message),
      }));
    },

    /**
     * Starts an assistant response.
     */
    startAssistant(runId: string) {
      const assistantId = runId || createId();
      const message: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
        runId: assistantId,
      };
      store.batch(() => {
        setState({
          isStreaming: false,
          isAssistantThinking: true,
          activeRunId: assistantId,
        });
        setState((state) => ({
          messages: normalizedOps.add(state.messages, message),
        }));
      });
    },

    /**
     * Appends text to an assistant response.
     */
    appendAssistant(runId: string, delta: string) {
      if (!runId || !delta) {
        return;
      }
      store.batch(() => {
        setState({
          isAssistantThinking: false,
          isStreaming: true,
        });
        setState((state) => ({
          messages: normalizedOps.update(state.messages, runId, (msg) => ({
            ...msg,
            text: msg.text + delta,
          })),
        }));
      });
    },

    /**
     * Ends an assistant response.
     */
    endAssistant(runId: string, final?: string) {
      const resolvedRunId = runId || getState().activeRunId;
      store.batch(() => {
        setState({
          isStreaming: false,
          isAssistantThinking: false,
          activeRunId: undefined,
        });
        if (resolvedRunId) {
          setState((state) => ({
            messages: normalizedOps.update(state.messages, resolvedRunId, (msg) => ({
              ...msg,
              text: typeof final === "string" ? final : msg.text,
            })),
          }));
        }
      });
    },

    /**
     * Sets the assistant thinking state.
     */
    setAssistantThinking(value: boolean) {
      setState({ isAssistantThinking: value });
    },

    /**
     * Locks the composer input.
     */
    lockField(field: "composer") {
      if (field === "composer") {
        setState({ inputLocked: true });
      }
    },

    /**
     * Unlocks the composer input.
     */
    unlockField(field: "composer") {
      if (field === "composer") {
        setState({ inputLocked: false });
      }
    },

    /**
     * Sets the composer draft text.
     */
    setComposerDraft(value: string) {
      setState({ composerDraft: value });
    },

    /**
     * Clears the composer draft.
     */
    clearComposerDraft() {
      setState({ composerDraft: "" });
    },

    /**
     * Sets the syncing preview state.
     */
    setSyncingPreview(value: boolean) {
      setState({ isSyncingPreview: value });
    },

    /**
     * Updates messages with an updater function or replaces them entirely.
     */
    setMessages(updater: ((messages: Message[]) => Message[]) | Message[]) {
      if (typeof updater === "function") {
        setState((state) => {
          const currentMessages = normalizedOps.selectAll(state.messages);
          const nextMessages = updater(currentMessages);
          return { messages: normalizedOps.setAll(nextMessages) };
        });
        return;
      }
      setState({ messages: normalizedOps.setAll(updater) });
    },

    /**
     * Gets a message by its ID.
     */
    getMessageById(id: string): Message | undefined {
      return normalizedOps.selectById(getState().messages, id);
    },
  }),
});

// Export actions for backwards compatibility
export const chatActions = chatSlice.actions;

// Selector hooks
export const useChatMessages = () =>
  useStore(chatSlice.store, (state) => normalizedOps.selectAll(state.messages));

export const useIsStreaming = () =>
  useStore(chatSlice.store, (state) => state.isStreaming);

export const useIsAssistantThinking = () =>
  useStore(chatSlice.store, (state) => state.isAssistantThinking);

export const useInputLocked = () =>
  useStore(chatSlice.store, (state) => state.inputLocked);

export const useComposerDraft = () =>
  useStore(chatSlice.store, (state) => state.composerDraft);

export const useActiveRunId = () =>
  useStore(chatSlice.store, (state) => state.activeRunId);

export const useIsSyncingPreview = () =>
  useStore(chatSlice.store, (state) => state.isSyncingPreview);

// Additional normalized selectors
export const useChatMessageById = (id: string) =>
  useStore(chatSlice.store, (state) =>
    normalizedOps.selectById(state.messages, id)
  );

export const useChatMessageCount = () =>
  useStore(chatSlice.store, (state) =>
    normalizedOps.selectCount(state.messages)
  );

// Export store API for direct access
export const chatStoreApi = chatSlice.store;
