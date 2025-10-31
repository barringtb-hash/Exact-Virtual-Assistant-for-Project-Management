import { createStore, useStore } from "../lib/tinyStore.ts";

export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  text: string;
  runId?: string;
}

type ChatState = {
  messages: Message[];
  isStreaming: boolean;
  inputLocked: boolean;
  activeRunId?: string;
  composerDraft: string;
};

type MessageUpdater = (messages: Message[]) => Message[];

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const chatStore = createStore<ChatState>({
  messages: [],
  isStreaming: false,
  inputLocked: false,
  activeRunId: undefined,
  composerDraft: "",
});

function updateMessages(updater: MessageUpdater) {
  chatStore.setState((state) => ({ messages: updater(state.messages) }));
}

export const chatActions = {
  hydrate(messages: Message[]) {
    chatStore.setState({ messages });
  },
  reset() {
    chatStore.setState({
      messages: [],
      isStreaming: false,
      inputLocked: false,
      activeRunId: undefined,
    });
  },
  pushUser(content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    const id = createId();
    updateMessages((prev) => [
      ...prev,
      { id, role: "user", text: trimmed },
    ]);
  },
  startAssistant(runId: string) {
    const assistantId = runId || createId();
    chatStore.setState({
      isStreaming: true,
      activeRunId: assistantId,
    });
    updateMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", runId: assistantId },
    ]);
  },
  appendAssistant(runId: string, delta: string) {
    if (!runId || !delta) {
      return;
    }
    const fragment = delta;
    updateMessages((prev) =>
      prev.map((message) =>
        message.runId === runId
          ? { ...message, text: message.text + fragment }
          : message,
      ),
    );
  },
  endAssistant(runId: string, final?: string) {
    const resolvedRunId = runId || chatStore.getState().activeRunId;
    chatStore.setState({
      isStreaming: false,
      activeRunId: undefined,
    });
    if (!resolvedRunId) {
      return;
    }
    updateMessages((prev) =>
      prev.map((message) =>
        message.runId === resolvedRunId
          ? { ...message, text: typeof final === "string" ? final : message.text }
          : message,
      ),
    );
  },
  lockField(field: "composer") {
    if (field === "composer") {
      chatStore.setState({ inputLocked: true });
    }
  },
  unlockField(field: "composer") {
    if (field === "composer") {
      chatStore.setState({ inputLocked: false });
    }
  },
  setComposerDraft(value: string) {
    chatStore.setState({ composerDraft: value });
  },
  clearComposerDraft() {
    chatStore.setState({ composerDraft: "" });
  },
  setMessages(updater: MessageUpdater | Message[]) {
    if (typeof updater === "function") {
      updateMessages(updater as MessageUpdater);
      return;
    }
    chatStore.setState({ messages: updater });
  },
};

export const useChatMessages = () => useStore(chatStore, (state) => state.messages);
export const useIsStreaming = () => useStore(chatStore, (state) => state.isStreaming);
export const useInputLocked = () => useStore(chatStore, (state) => state.inputLocked);
export const useComposerDraft = () => useStore(chatStore, (state) => state.composerDraft);
export const useActiveRunId = () => useStore(chatStore, (state) => state.activeRunId);

export const chatStoreApi = chatStore;
