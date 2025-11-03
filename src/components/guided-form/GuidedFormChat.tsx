/**
 * Guided Form Chat Component
 *
 * Displays the conversation messages in a chat-like interface.
 */

import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface GuidedFormChatProps {
  messages: Message[];
  isProcessing: boolean;
  error: string | null;
}

export const GuidedFormChat: React.FC<GuidedFormChatProps> = ({
  messages,
  isProcessing,
  error
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const renderMarkdown = (content: string) => {
    const html = marked(content, { breaks: true });
    return DOMPurify.sanitize(html as string);
  };

  return (
    <div className="flex flex-col space-y-4 p-6 max-w-4xl mx-auto w-full">
      {messages.map((message, index) => (
        <div
          key={index}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-3 ${
              message.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-900'
            }`}
          >
            {message.role === 'assistant' ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        </div>
      ))}

      {isProcessing && (
        <div className="flex justify-start">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex justify-center">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-[80%]">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {error}
            </p>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};
