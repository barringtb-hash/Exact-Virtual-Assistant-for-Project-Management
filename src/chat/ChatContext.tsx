import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
  error?: string | null;
}

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

interface ChatContextValue {
  messages: ChatMessage[];
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updater: (message: ChatMessage) => ChatMessage) => void;
  resetMessages: (messages: ChatMessage[]) => void;
  getMessages: () => ChatMessage[];
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

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

  const value = useMemo(
    () => ({ messages, appendMessage, updateMessage, resetMessages, getMessages }),
    [appendMessage, getMessages, messages, resetMessages, updateMessage],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatSession() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatSession must be used within a ChatProvider");
  }
  return context;
}
