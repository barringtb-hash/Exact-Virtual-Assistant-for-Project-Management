/**
 * Chat-specific Error Boundary component
 * Provides a chat-friendly error UI with recovery options
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { chatLogger } from '../utils/logger.ts';

export interface ChatErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Callback fired when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Callback to reset the chat state */
  onReset?: () => void;
}

export interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Error boundary specifically designed for chat components
 * Provides a user-friendly error message and recovery options
 */
export class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  private maxRetries = 3;

  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ChatErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError } = this.props;

    // Increment error count
    this.setState((prevState) => ({
      errorCount: prevState.errorCount + 1,
    }));

    // Log the error with chat context
    chatLogger.logError('Chat component error', error, {
      componentStack: errorInfo.componentStack,
      errorCount: this.state.errorCount + 1,
    });

    // Call the onError callback if provided
    if (onError) {
      onError(error, errorInfo);
    }
  }

  /**
   * Attempts to recover from the error
   */
  handleRetry = (): void => {
    if (this.state.errorCount < this.maxRetries) {
      this.setState({ hasError: false, error: null });
    }
  };

  /**
   * Resets the chat and clears the error
   */
  handleReset = (): void => {
    const { onReset } = this.props;

    this.setState({
      hasError: false,
      error: null,
      errorCount: 0,
    });

    if (onReset) {
      onReset();
    }
  };

  render(): ReactNode {
    const { hasError, error, errorCount } = this.state;
    const { children } = this.props;

    if (hasError && error) {
      const canRetry = errorCount < this.maxRetries;

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: '#fafafa',
            borderRadius: '12px',
            margin: '20px',
            minHeight: '200px',
          }}
        >
          {/* Error Icon */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h3
            style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#1f2937',
            }}
          >
            Something went wrong with the chat
          </h3>

          <p
            style={{
              margin: '0 0 24px 0',
              fontSize: '14px',
              color: '#6b7280',
              maxWidth: '300px',
            }}
          >
            {canRetry
              ? "We encountered an unexpected error. Let's try that again."
              : 'The chat has encountered multiple errors. Please reset to start fresh.'}
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            {canRetry && (
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Try Again
              </button>
            )}
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                backgroundColor: canRetry ? '#f3f4f6' : '#3b82f6',
                color: canRetry ? '#374151' : 'white',
                border: canRetry ? '1px solid #d1d5db' : 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {canRetry ? 'Reset Chat' : 'Start Over'}
            </button>
          </div>

          {errorCount > 1 && (
            <p
              style={{
                margin: '16px 0 0 0',
                fontSize: '12px',
                color: '#9ca3af',
              }}
            >
              Errors encountered: {errorCount} / {this.maxRetries}
            </p>
          )}
        </div>
      );
    }

    return children;
  }
}

export default ChatErrorBoundary;
