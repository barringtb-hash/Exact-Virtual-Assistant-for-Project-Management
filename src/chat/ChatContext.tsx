import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
import type { ChatMessage, ChatRole } from "../types/chat.ts";

// Re-export types for backwards compatibility
export type { ChatMessage, ChatRole } from "../types/chat.ts";

interface AppendAction {
  type: "append";
  message: ChatMessage;
}

interface UpdateAction {
  type: "update";
  id: string;
  updater: (message: ChatMessage) => ChatMessage;
}

interface ResetAction {
  type: "reset";
  messages: ChatMessage[];
}

type ChatAction = AppendAction | UpdateAction | ResetAction;

type ChatReducer = (state: ChatMessage[], action: ChatAction) => ChatMessage[];

const chatReducer: ChatReducer = (state, action) => {
  switch (action.type) {
    case "append": {
      return [...state, action.message];
    }
    case "update": {
      let changed = false;
      const next = state.map((message) => {
        if (message.id !== action.id) {
          return message;
        }
        changed = true;
        return action.updater(message);
      });
      return changed ? next : state;
    }
    case "reset": {
      return [...action.messages];
    }
    default: {
      return state;
    }
  }
};

interface ChatMessagesContextValue {
  messages: ChatMessage[];
}

interface ChatActionsContextValue {
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updater: (message: ChatMessage) => ChatMessage) => void;
  resetMessages: (messages: ChatMessage[]) => void;
  getMessages: () => ChatMessage[];
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | undefined>(undefined);
const ChatActionsContext = createContext<ChatActionsContextValue | undefined>(undefined);

export interface ChatProviderProps {
  children: React.ReactNode;
  initialMessages?: ChatMessage[];
}

export function ChatProvider({ children, initialMessages = [] }: ChatProviderProps) {
  const [messages, dispatch] = useReducer(chatReducer, initialMessages);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const appendMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: "append", message });
  }, []);

  const updateMessage = useCallback((id: string, updater: (message: ChatMessage) => ChatMessage) => {
    dispatch({ type: "update", id, updater });
  }, []);

  const resetMessages = useCallback((nextMessages: ChatMessage[]) => {
    dispatch({ type: "reset", messages: nextMessages });
  }, []);

  const getMessages = useCallback(() => messagesRef.current, []);

  // Separate memoization for messages and actions
  const messagesValue = useMemo(() => ({ messages }), [messages]);

  const actionsValue = useMemo(
    () => ({ appendMessage, updateMessage, resetMessages, getMessages }),
    [appendMessage, updateMessage, resetMessages, getMessages],
  );

  return (
    <ChatMessagesContext.Provider value={messagesValue}>
      <ChatActionsContext.Provider value={actionsValue}>
        {children}
      </ChatActionsContext.Provider>
    </ChatMessagesContext.Provider>
  );
}

// Selector hooks for accessing specific parts of context
export function useChatMessages() {
  const context = useContext(ChatMessagesContext);
  if (!context) {
    throw new Error("useChatMessages must be used within a ChatProvider");
  }
  return context.messages;
}

export function useChatActions() {
  const context = useContext(ChatActionsContext);
  if (!context) {
    throw new Error("useChatActions must be used within a ChatProvider");
  }
  return context;
}

// Backwards compatibility - returns both messages and actions
export function useChatSession() {
  const messages = useChatMessages();
  const actions = useChatActions();
  return { messages, ...actions };
}
