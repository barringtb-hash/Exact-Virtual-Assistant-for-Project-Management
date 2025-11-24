import React, { FormEvent, useCallback, useMemo, useRef, useState } from "react";

import { openChatStreamFetch } from "./api.js";
import {
  ChatMessage,
  ChatProvider,
  type ChatProviderProps,
  useChatActions,
} from "./ChatContext.js";
import { createId } from "../utils/id.js";

function normalizeContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildDefaultBody({
  draft,
  history,
  systemMessage,
  threadId,
  clientStreamId,
  attachments,
}: {
  draft: string;
  history: ChatMessage[];
  systemMessage?: string;
  threadId: string;
  clientStreamId: string;
  attachments?: unknown;
}) {
  const baseMessages = history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const payloadMessages = [
    ...(systemMessage ? [{ role: "system", content: systemMessage }] : []),
    ...baseMessages,
    { role: "user", content: draft },
  ];

  const body: Record<string, unknown> = {
    stream: true,
    threadId,
    clientStreamId,
    messages: payloadMessages,
  };

  if (typeof attachments !== "undefined") {
    body.attachments = attachments;
  }

  return body;
}

export interface ChatComposerProps {
  apiPath?: string;
  attachments?: unknown;
  autoFocus?: boolean;
  buildRequestBody?: (params: {
    draft: string;
    history: ChatMessage[];
    threadId: string;
    clientStreamId: string;
  }) => Record<string, unknown>;
  className?: string;
  clientStreamId?: string;
  disabled?: boolean;
  onComplete?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
  onStreamStart?: () => void;
  placeholder?: string;
  requestInit?: RequestInit;
  systemMessage?: string;
  threadId?: string;
}

interface StreamHandle {
  cancel: (reason?: string) => void;
}

interface PendingRequest {
  body: Record<string, unknown>;
  onStreamError: (error: Error) => void;
}

function useActiveStream() {
  const activeAssistantIdRef = useRef<string | null>(null);
  const handleRef = useRef<StreamHandle | null>(null);

  const setHandle = useCallback((handle: StreamHandle | null) => {
    handleRef.current = handle;
  }, []);

  const cancelActiveStream = useCallback((reason?: string) => {
    const activeId = activeAssistantIdRef.current;
    if (handleRef.current) {
      try {
        handleRef.current.cancel(reason);
      } catch {
        // ignore cancel failures
      }
      handleRef.current = null;
    }
    activeAssistantIdRef.current = null;
    return activeId;
  }, []);

  const setActiveAssistantId = useCallback((id: string | null) => {
    activeAssistantIdRef.current = id;
  }, []);

  const getActiveAssistantId = useCallback(() => activeAssistantIdRef.current, []);

  return {
    cancelActiveStream,
    getActiveAssistantId,
    setActiveAssistantId,
    setHandle,
  } as const;
}

export const ChatComposer = React.memo(({
  apiPath = "/api/chat",
  attachments,
  autoFocus = false,
  buildRequestBody,
  className,
  clientStreamId: providedClientStreamId,
  disabled = false,
  onComplete,
  onError,
  onStreamStart,
  placeholder = "Send a message…",
  requestInit,
  systemMessage,
  threadId: providedThreadId,
}: ChatComposerProps) => {
  const { appendMessage, updateMessage, getMessages } = useChatActions();
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasReceivedFirstTokenRef = useRef(false);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());

  const streamState = useActiveStream();

  const resolvedThreadId = useMemo(
    () => providedThreadId || createId(),
    [providedThreadId],
  );

  const resolvedClientStreamId = useMemo(
    () => providedClientStreamId || createId(),
    [providedClientStreamId],
  );


  const resetDraft = useCallback(() => {
    setDraft("");
  }, []);

  const handleToken = useCallback(
    (assistantId: string, token: string) => {
      if (!token) return;
      if (!hasReceivedFirstTokenRef.current) {
        hasReceivedFirstTokenRef.current = true;
        setIsAssistantThinking(false);
        setIsStreaming(true);
      }
      updateMessage(assistantId, (message) => ({
        ...message,
        content: message.content + token,
      }));
    },
    [updateMessage],
  );

  const finalizeAssistantMessage = useCallback(
    (assistantId: string, updater?: (message: ChatMessage) => ChatMessage) => {
      let finalMessage: ChatMessage | null = null;
      setIsStreaming(false);
      setIsAssistantThinking(false);
      hasReceivedFirstTokenRef.current = false;
      updateMessage(assistantId, (message) => {
        const base: ChatMessage = {
          ...message,
          pending: false,
          retryable: false,
          onRetry: null,
        };
        const next = updater ? updater(base) : base;
        finalMessage = next;
        return next;
      });
      return finalMessage;
    },
    [updateMessage],
  );

  const startStream = useCallback(
    (
      assistantId: string,
      body: Record<string, unknown>,
      { onStreamError }: { onStreamError: (error: Error) => void },
    ) => {
      const controller = new AbortController();
      pendingRequestsRef.current.set(assistantId, { body, onStreamError });
      hasReceivedFirstTokenRef.current = false;
      setIsAssistantThinking(true);
      setIsStreaming(false);
      const dispose = openChatStreamFetch(apiPath, {
        signal: controller.signal,
        requestInit: {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(requestInit?.headers || {}) },
          ...requestInit,
          body: JSON.stringify(body),
        },
        onOpen: () => {
          onStreamStart?.();
        },
        onToken: (token) => handleToken(assistantId, token),
        onComplete: () => {
          const completed = finalizeAssistantMessage(assistantId);
          pendingRequestsRef.current.delete(assistantId);
          streamState.setHandle(null);
          streamState.setActiveAssistantId(null);
          dispose();
          if (completed) {
            onComplete?.(completed);
          }
        },
        onError: (error) => {
          finalizeAssistantMessage(assistantId, (message) => ({
            ...message,
            error: error.message,
            retryable: true,
            onRetry: () => {
              const pending = pendingRequestsRef.current.get(assistantId);
              if (!pending) {
                return;
              }
              streamState.setActiveAssistantId(assistantId);
              hasReceivedFirstTokenRef.current = false;
              updateMessage(assistantId, (current) => ({
                ...current,
                content: "",
                pending: true,
                error: null,
                retryable: false,
                onRetry: null,
              }));
              setIsAssistantThinking(true);
              setIsStreaming(false);
              startStream(assistantId, pending.body, { onStreamError: pending.onStreamError });
            },
          }));
          streamState.setHandle(null);
          streamState.setActiveAssistantId(null);
          dispose();
          onStreamError(error);
        },
      });

      const cancel = (reason?: string) => {
        try {
          if (!controller.signal.aborted) {
            controller.abort(reason ?? "cancelled");
          }
        } catch {
          // ignore abort errors
        }
        dispose();
        streamState.setHandle(null);
        streamState.setActiveAssistantId(null);
        pendingRequestsRef.current.delete(assistantId);
        setIsAssistantThinking(false);
        setIsStreaming(false);
        hasReceivedFirstTokenRef.current = false;
      };

      streamState.setHandle({ cancel });
    },
    [
      apiPath,
      finalizeAssistantMessage,
      handleToken,
      onComplete,
      onStreamStart,
      requestInit,
      streamState,
      updateMessage,
    ],
  );

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const trimmed = normalizeContent(draft);
      if (!trimmed) {
        return;
      }

      const previousMessages = getMessages();

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
        pending: false,
      };

      const activeAssistantId = streamState.getActiveAssistantId();
      const cancelledId = streamState.cancelActiveStream("replaced");
      if (cancelledId) {
        pendingRequestsRef.current.delete(cancelledId);
      }
      const assistantToFinalize = cancelledId || activeAssistantId;
      if (assistantToFinalize) {
        finalizeAssistantMessage(assistantToFinalize);
        pendingRequestsRef.current.delete(assistantToFinalize);
      }

      appendMessage(userMessage);

      const assistantId = createId();
      streamState.setActiveAssistantId(assistantId);
      appendMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
        error: null,
        retryable: false,
        onRetry: null,
      });

      resetDraft();

      const body = buildRequestBody
        ? buildRequestBody({
            draft: trimmed,
            history: [...previousMessages, userMessage],
            threadId: resolvedThreadId,
            clientStreamId: resolvedClientStreamId,
          })
        : buildDefaultBody({
            draft: trimmed,
            history: [...previousMessages, userMessage],
            systemMessage,
            threadId: resolvedThreadId,
            clientStreamId: resolvedClientStreamId,
            attachments,
          });

      startStream(assistantId, body, {
        onStreamError: (error) => {
          onError?.(error);
        },
      });
    },
    [
      appendMessage,
      attachments,
      buildRequestBody,
      draft,
      getMessages,
      finalizeAssistantMessage,
      onError,
      resetDraft,
      resolvedClientStreamId,
      resolvedThreadId,
      startStream,
      streamState,
      systemMessage,
    ],
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <form
      className={className}
      onSubmit={handleSubmit}
      aria-busy={isAssistantThinking || isStreaming}
      data-streaming={isStreaming || undefined}
      data-thinking={isAssistantThinking || undefined}
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="eva-chat-composer-input"
        aria-label="Chat composer"
      />
      <button
        type="submit"
        disabled={disabled || isAssistantThinking || isStreaming}
        className="eva-chat-composer-send"
      >
        Send
      </button>
    </form>
  );
});

ChatComposer.displayName = 'ChatComposer';

export interface ChatInterfaceProps extends ChatProviderProps, ChatComposerProps {}

export const ChatInterface = React.memo(({
  children,
  initialMessages,
  ...composerProps
}: ChatInterfaceProps & { children?: React.ReactNode }) => {
  return (
    <ChatProvider initialMessages={initialMessages}>
      {children}
      <ChatComposer {...composerProps} />
    </ChatProvider>
  );
});

ChatInterface.displayName = 'ChatInterface';

export default ChatComposer;
