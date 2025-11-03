/**
 * Guided Form State Store
 *
 * Manages state for the guided form conversation flow.
 * Uses the tinyStore pattern for React state management.
 */

import { createStore } from '../lib/tinyStore';

export interface GuidedFormState {
  // Conversation state
  conversationState: any | null;
  conversationHistory: Array<{ role: string; content: string }>;

  // Current interaction
  currentMessage: string;
  assistantMessage: string;
  isProcessing: boolean;
  error: string | null;

  // Progress tracking
  currentFieldIndex: number;
  totalFields: number;
  completedFields: number;

  // UI state
  showPreview: boolean;
  showHelp: boolean;
  isComplete: boolean;

  // Document info
  docType: string;

  // Metadata
  startedAt: string | null;
  fieldMetrics: Record<string, any>;
}

const initialState: GuidedFormState = {
  conversationState: null,
  conversationHistory: [],
  currentMessage: '',
  assistantMessage: '',
  isProcessing: false,
  error: null,
  currentFieldIndex: 0,
  totalFields: 0,
  completedFields: 0,
  showPreview: false,
  showHelp: false,
  isComplete: false,
  docType: 'charter',
  startedAt: null,
  fieldMetrics: {}
};

export const guidedFormStore = createStore<GuidedFormState>(initialState);

// Actions
export const guidedFormActions = {
  /**
   * Initialize a new guided form session
   */
  initialize(docType: string = 'charter') {
    guidedFormStore.setState({
      ...initialState,
      docType,
      startedAt: new Date().toISOString()
    });
  },

  /**
   * Set current user message
   */
  setCurrentMessage(message: string) {
    guidedFormStore.setState(state => ({
      ...state,
      currentMessage: message
    }));
  },

  /**
   * Update conversation state from API response
   */
  updateConversation(response: any) {
    const state = guidedFormStore.getState();

    // Add to conversation history
    const newHistory = [...state.conversationHistory];

    if (state.currentMessage) {
      newHistory.push({
        role: 'user',
        content: state.currentMessage
      });
    }

    if (response.message) {
      newHistory.push({
        role: 'assistant',
        content: response.message
      });
    }

    guidedFormStore.setState({
      conversationState: response.conversation_state,
      conversationHistory: newHistory,
      assistantMessage: response.message,
      currentMessage: '',
      isProcessing: false,
      error: null,
      currentFieldIndex: response.metadata?.progress?.current || 0,
      totalFields: response.metadata?.progress?.total || 0,
      completedFields: response.metadata?.progress?.completed || 0,
      isComplete: response.action === 'end_review',
      showPreview: response.action === 'show_preview',
      showHelp: response.action === 'show_help'
    });
  },

  /**
   * Set processing state
   */
  setProcessing(isProcessing: boolean) {
    guidedFormStore.setState(state => ({
      ...state,
      isProcessing,
      error: isProcessing ? null : state.error
    }));
  },

  /**
   * Set error state
   */
  setError(error: string | null) {
    guidedFormStore.setState(state => ({
      ...state,
      error,
      isProcessing: false
    }));
  },

  /**
   * Toggle preview
   */
  togglePreview() {
    guidedFormStore.setState(state => ({
      ...state,
      showPreview: !state.showPreview
    }));
  },

  /**
   * Toggle help
   */
  toggleHelp() {
    guidedFormStore.setState(state => ({
      ...state,
      showHelp: !state.showHelp
    }));
  },

  /**
   * Reset the form
   */
  reset() {
    guidedFormStore.setState(initialState);
  },

  /**
   * Mark as complete
   */
  markComplete() {
    guidedFormStore.setState(state => ({
      ...state,
      isComplete: true
    }));
  }
};

// Hooks
export function useGuidedFormState() {
  return guidedFormStore.useState();
}

export function useConversationState() {
  return guidedFormStore.useState(state => state.conversationState);
}

export function useConversationHistory() {
  return guidedFormStore.useState(state => state.conversationHistory);
}

export function useCurrentMessage() {
  return guidedFormStore.useState(state => state.currentMessage);
}

export function useAssistantMessage() {
  return guidedFormStore.useState(state => state.assistantMessage);
}

export function useIsProcessing() {
  return guidedFormStore.useState(state => state.isProcessing);
}

export function useError() {
  return guidedFormStore.useState(state => state.error);
}

export function useProgress() {
  return guidedFormStore.useState(state => ({
    current: state.currentFieldIndex,
    total: state.totalFields,
    completed: state.completedFields,
    percentage: state.totalFields > 0
      ? Math.round((state.completedFields / state.totalFields) * 100)
      : 0
  }));
}

export function useIsComplete() {
  return guidedFormStore.useState(state => state.isComplete);
}
