// React Error Boundary for Recording and Playback Components
// Provides graceful error handling and recovery for media-related features

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Log to external error reporting service
    this.logErrorToService(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error state when props change (useful for retries)
    if (hasError && resetOnPropsChange) {
      if (resetKeys) {
        const hasResetKeyChanged = resetKeys.some(
          (key, idx) => prevProps.resetKeys?.[idx] !== key
        );
        if (hasResetKeyChanged) {
          this.resetErrorBoundary();
        }
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // In a real application, send to error reporting service
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Example: send to logging service
    // fetch('/api/errors', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(errorReport),
    // }).catch(console.error);

    console.log('Error report:', errorReport);
  };

  private resetErrorBoundary = () => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: 0,
    });
  };

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount < maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: prevState.retryCount + 1,
      }));

      // Add a small delay before retry to avoid immediate re-error
      this.retryTimeoutId = setTimeout(() => {
        // Force a re-render
        this.forceUpdate();
      }, 100);
    }
  };

  private getErrorType = (error: Error): string => {
    // Categorize common media-related errors
    if (error.message.includes('MediaRecorder')) {
      return 'Recording Error';
    }
    if (error.message.includes('getUserMedia')) {
      return 'Camera/Microphone Access Error';
    }
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return 'Network Error';
    }
    if (error.message.includes('decode') || error.message.includes('audio')) {
      return 'Audio Processing Error';
    }
    if (error.message.includes('canvas') || error.message.includes('render')) {
      return 'Visualization Error';
    }
    return 'Application Error';
  };

  private getSuggestion = (error: Error): string => {
    const errorType = this.getErrorType(error);
    
    switch (errorType) {
      case 'Recording Error':
        return 'Please check if your browser supports recording and try refreshing the page.';
      case 'Camera/Microphone Access Error':
        return 'Please allow camera and microphone access in your browser settings.';
      case 'Network Error':
        return 'Please check your internet connection and try again.';
      case 'Audio Processing Error':
        return 'There was an issue processing the audio. Please try with a different file.';
      case 'Visualization Error':
        return 'Graphics rendering failed. Please try refreshing or use a different browser.';
      default:
        return 'Please try refreshing the page or contact support if the issue persists.';
    }
  };

  render() {
    const { hasError, error, retryCount } = this.state;
    const { children, fallback, maxRetries = 3 } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      const errorType = this.getErrorType(error);
      const suggestion = this.getSuggestion(error);
      const canRetry = retryCount < maxRetries;

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md mx-auto text-center">
            <div className="mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {errorType}
              </h2>
              <p className="text-gray-600 mb-4">
                {suggestion}
              </p>
            </div>

            {/* Error details (collapsible) */}
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Technical Details
              </summary>
              <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-32">
                <div className="mb-2">
                  <strong>Error:</strong> {error.message}
                </div>
                {error.stack && (
                  <div>
                    <strong>Stack:</strong>
                    <pre className="mt-1 whitespace-pre-wrap">
                      {error.stack.split('\n').slice(0, 5).join('\n')}
                    </pre>
                  </div>
                )}
              </div>
            </details>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Try Again ({maxRetries - retryCount} attempts left)
                </button>
              )}
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Refresh Page
              </button>
              
              <button
                onClick={this.resetErrorBoundary}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Retry count indicator */}
            {retryCount > 0 && (
              <div className="mt-4 text-sm text-gray-500">
                Retry attempt: {retryCount}/{maxRetries}
              </div>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

// Hook for error boundary context
export function useErrorHandler() {
  return {
    captureError: (error: Error, errorInfo?: Record<string, unknown>) => {
      console.error('Manual error capture:', error, errorInfo);
      // In a real app, send to error reporting service
    },
    
    reportIssue: (description: string, metadata?: Record<string, unknown>) => {
      console.log('Issue reported:', description, metadata);
      // In a real app, send to issue tracking service
    },
  };
}

// Specific error boundaries for different components
export const RecordingErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    maxRetries={2}
    onError={(error, errorInfo) => {
      console.error('Recording component error:', error, errorInfo);
    }}
  >
    {children}
  </ErrorBoundary>
);

export const PlaybackErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    maxRetries={3}
    onError={(error, errorInfo) => {
      console.error('Playback component error:', error, errorInfo);
    }}
  >
    {children}
  </ErrorBoundary>
);

export const StudyModeErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    maxRetries={2}
    onError={(error, errorInfo) => {
      console.error('Study mode component error:', error, errorInfo);
    }}
  >
    {children}
  </ErrorBoundary>
);