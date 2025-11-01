import React, { useMemo } from "react";

import { useChatSession } from "./ChatContext.js";
import ChatMessageBubble from "./ChatMessageBubble.js";

export interface ChatTranscriptProps {
  className?: string;
  emptyPlaceholder?: React.ReactNode;
  typingIndicatorLabel?: string;
}

export function ChatTranscript({
  className,
  emptyPlaceholder = null,
  typingIndicatorLabel = "Assistant is typing…",
}: ChatTranscriptProps) {
  const { messages } = useChatSession();

  const content = useMemo(() => {
    if (!messages.length) {
      return emptyPlaceholder;
    }

    return messages.map((message) => (
      <ChatMessageBubble
        key={message.id}
        message={message}
        typingIndicatorLabel={typingIndicatorLabel}
      />
    ));
  }, [emptyPlaceholder, messages, typingIndicatorLabel]);

  return (
    <div className={className} role="log" aria-live="polite">
      {content}
    </div>
  );
}

export default ChatTranscript;
