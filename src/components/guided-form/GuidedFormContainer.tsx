/**
 * Guided Form Container
 *
 * Main container component for the guided form experience.
 * Orchestrates the field-by-field conversation flow.
 */

import React, { useEffect } from 'react';
import { guidedFormActions, useGuidedFormState } from '../../state/guidedFormStore';
import { GuidedFormChat } from './GuidedFormChat';
import { GuidedFormProgress } from './GuidedFormProgress';
import { GuidedFormControls } from './GuidedFormControls';
import { GuidedFormPreview } from './GuidedFormPreview';

interface GuidedFormContainerProps {
  docType?: string;
  onComplete?: (data: any) => void;
  onCancel?: () => void;
}

export const GuidedFormContainer: React.FC<GuidedFormContainerProps> = ({
  docType = 'charter',
  onComplete,
  onCancel
}) => {
  const state = useGuidedFormState();

  useEffect(() => {
    // Initialize on mount
    guidedFormActions.initialize(docType);

    // Start the conversation
    handleSendMessage('__INIT__');

    return () => {
      // Cleanup on unmount
      guidedFormActions.reset();
    };
  }, [docType]);

  const handleSendMessage = async (message: string) => {
    try {
      guidedFormActions.setProcessing(true);

      const response = await fetch('/api/guided-form/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          conversation_state: state.conversationState,
          doc_type: state.docType,
          conversation_history: state.conversationHistory,
          use_claude: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process message');
      }

      const data = await response.json();
      guidedFormActions.updateConversation(data);

      // Check if complete
      if (data.action === 'end_review') {
        guidedFormActions.markComplete();
      }

      // Handle cancellation
      if (data.action === 'cancel') {
        if (onCancel) {
          onCancel();
        }
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      guidedFormActions.setError(error.message || 'Failed to send message');
    }
  };

  const handleFinalize = async () => {
    try {
      guidedFormActions.setProcessing(true);

      const response = await fetch('/api/guided-form/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversation_state: state.conversationState,
          doc_type: state.docType,
          output_format: 'docx'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to finalize document');
      }

      const data = await response.json();

      if (onComplete) {
        onComplete(data);
      }

    } catch (error: any) {
      console.error('Error finalizing:', error);
      guidedFormActions.setError(error.message || 'Failed to finalize document');
    } finally {
      guidedFormActions.setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Guided Project Charter
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              I'll guide you through each field step by step
            </p>
          </div>

          <GuidedFormProgress />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {state.showPreview ? (
          <GuidedFormPreview
            conversationState={state.conversationState}
            onClose={() => guidedFormActions.togglePreview()}
          />
        ) : (
          <>
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto">
              <GuidedFormChat
                messages={state.conversationHistory}
                isProcessing={state.isProcessing}
                error={state.error}
              />
            </div>

            {/* Controls */}
            <div className="border-t border-gray-200 bg-white">
              <GuidedFormControls
                onSendMessage={handleSendMessage}
                onFinalize={handleFinalize}
                isProcessing={state.isProcessing}
                isComplete={state.isComplete}
                currentMessage={state.currentMessage}
                onMessageChange={guidedFormActions.setCurrentMessage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
