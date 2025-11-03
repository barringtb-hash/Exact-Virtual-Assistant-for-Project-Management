/**
 * Guided Form Controls Component
 *
 * Input controls and command buttons for the guided form.
 */

import React, { useState, KeyboardEvent } from 'react';

interface GuidedFormControlsProps {
  onSendMessage: (message: string) => void;
  onFinalize: () => void;
  isProcessing: boolean;
  isComplete: boolean;
  currentMessage: string;
  onMessageChange: (message: string) => void;
}

export const GuidedFormControls: React.FC<GuidedFormControlsProps> = ({
  onSendMessage,
  onFinalize,
  isProcessing,
  isComplete,
  currentMessage,
  onMessageChange
}) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (currentMessage.trim() && !isProcessing) {
      onSendMessage(currentMessage);
      onMessageChange('');
    }
  };

  const quickCommands = [
    { label: 'Back', value: 'back', icon: '←' },
    { label: 'Skip', value: 'skip', icon: '⤸' },
    { label: 'Preview', value: 'preview', icon: '👁' },
    { label: 'Help', value: 'help', icon: '?' }
  ];

  return (
    <div className="p-4 space-y-3">
      {/* Quick Command Buttons */}
      {!isComplete && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          {quickCommands.map(cmd => (
            <button
              key={cmd.value}
              onClick={() => {
                onMessageChange(cmd.value);
                onSendMessage(cmd.value);
              }}
              disabled={isProcessing}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={cmd.label}
            >
              <span className="mr-1">{cmd.icon}</span>
              {cmd.label}
            </button>
          ))}
        </div>
      )}

      {/* Message Input */}
      <div className="flex items-end space-x-2">
        <div className="flex-1">
          <textarea
            value={currentMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isComplete
                ? 'Type "finalize" to generate document or "edit <field_name>" to make changes...'
                : 'Type your answer or a command...'
            }
            disabled={isProcessing}
            rows={2}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>

        {/* Send/Finalize Button */}
        {isComplete ? (
          <button
            onClick={onFinalize}
            disabled={isProcessing}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-[60px]"
          >
            {isProcessing ? 'Generating...' : 'Finalize Document'}
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!currentMessage.trim() || isProcessing}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-[60px]"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
};
