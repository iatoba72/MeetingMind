// Hook for error boundary context
export function useErrorHandler() {
  return {
    captureError: (error: Error, errorInfo?: Record<string, unknown>) => {
      console.error('Manual error capture:', error, errorInfo);
      
      // In a real app, you might want to send this to an error reporting service
      // Example: Sentry.captureException(error, { extra: errorInfo });
    },
    
    reportError: (message: string, context?: Record<string, unknown>) => {
      const error = new Error(message);
      console.error('Manual error report:', error, context);
      
      // In a real app, send to error reporting service
    }
  };
}