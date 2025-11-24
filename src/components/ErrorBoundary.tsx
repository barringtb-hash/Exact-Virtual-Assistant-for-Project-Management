/**
 * Generic Error Boundary component
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing the whole app
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../utils/logger.ts';

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Custom fallback UI to show when an error occurs */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Callback fired when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Component name for logging context */
  componentName?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component that catches errors in its children
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, componentName } = this.props;

    // Log the error
    logger.logError(
      `Error caught by ErrorBoundary${componentName ? ` in ${componentName}` : ''}`,
      error,
      { componentStack: errorInfo.componentStack }
    );

    // Call the onError callback if provided
    if (onError) {
      onError(error, errorInfo);
    }
  }

  /**
   * Resets the error state to allow recovery
   */
  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Custom fallback
      if (fallback) {
        if (typeof fallback === 'function') {
          return fallback(error, this.reset);
        }
        return fallback;
      }

      // Default fallback UI
      return (
        <div
          style={{
            padding: '20px',
            margin: '10px',
            border: '1px solid #e74c3c',
            borderRadius: '8px',
            backgroundColor: '#fdf2f2',
            color: '#c0392b',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>Something went wrong</h3>
          <p style={{ margin: '0 0 15px 0', fontSize: '14px' }}>
            An error occurred while rendering this component.
          </p>
          <button
            onClick={this.reset}
            style={{
              padding: '8px 16px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return children;
  }
}

/**
 * Higher-order component that wraps a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary componentName={displayName} {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

export default ErrorBoundary;
