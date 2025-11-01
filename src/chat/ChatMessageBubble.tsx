import React from "react";

import type { ChatMessage } from "./ChatContext.js";

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  typingIndicatorLabel?: string;
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <span className="eva-chat-typing" role="status" aria-live="polite" aria-label={label}>
      <span className="eva-chat-typing-dot" aria-hidden />
      <span className="eva-chat-typing-dot" aria-hidden />
      <span className="eva-chat-typing-dot" aria-hidden />
    </span>
  );
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  typingIndicatorLabel = "Assistant is typing…",
}) => {
  const { role, content, pending, error, onRetry } = message;
  const isAssistant = role === "assistant";
  const isSystem = role === "system";
  const canRetry = typeof onRetry === "function";

  return (
    <div className={`eva-chat-message eva-chat-message--${role}`}>
      <div className="eva-chat-message-bubble">
        <div className="eva-chat-message-content">
          {content}
          {isAssistant && pending ? <TypingIndicator label={typingIndicatorLabel} /> : null}
        </div>
        {error ? (
          <div className="eva-chat-message-error">
            <span>{error}</span>
            {canRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="eva-chat-message-retry"
                aria-label="Retry assistant response"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {isSystem ? <div className="eva-chat-message-meta">System</div> : null}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
