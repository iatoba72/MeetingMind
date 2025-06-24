/**
 * Store Provider Component
 * Provides store context and handles initialization
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useStore, initializeStore, cleanupStore } from './index';
import { useErrorActions, useToast } from './hooks';

interface StoreProviderProps {
  children: ReactNode;
  enableDevMode?: boolean;
  autoInitialize?: boolean;
}

interface StoreContextValue {
  isInitialized: boolean;
  isInitializing: boolean;
  initializationError: string | null;
  reinitialize: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const useStoreContext = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStoreContext must be used within a StoreProvider');
  }
  return context;
};

export const StoreProvider: React.FC<StoreProviderProps> = ({
  children,
  enableDevMode = false,
  autoInitialize = true
}) => {
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  
  const isInitialized = useStore((state) => state.isInitialized);
  const setDebugMode = useStore((state) => state.setDebugMode);
  const { addError, reportError } = useErrorActions();
  const showToast = useToast();

  const initialize = async () => {
    setIsInitializing(true);
    setInitializationError(null);

    try {
      // Enable debug mode if requested
      if (enableDevMode) {
        setDebugMode(true);
      }

      // Initialize the store
      await initializeStore();
      
      showToast('Application initialized successfully', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      setInitializationError(errorMessage);
      
      reportError(error instanceof Error ? error : new Error(errorMessage), {
        context: 'store_initialization',
        enableDevMode,
        autoInitialize
      });
      
      showToast('Failed to initialize application', 'error');
    } finally {
      setIsInitializing(false);
    }
  };

  const reinitialize = async () => {
    // Reset store and reinitialize
    useStore.getState().resetStore();
    await initialize();
  };

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize && !isInitialized && !isInitializing) {
      initialize();
    }
  }, [autoInitialize, isInitialized, isInitializing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        cleanupStore();
      }
    };
  }, [isInitialized]);

  // Handle global errors
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      addError({
        type: 'system',
        severity: 'high',
        message: 'Unhandled promise rejection',
        details: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        context: { type: 'promise_rejection' }
      });
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      addError({
        type: 'system',
        severity: 'high',
        message: event.message,
        details: `${event.filename}:${event.lineno}:${event.colno}`,
        stack: event.error?.stack,
        context: { type: 'global_error' }
      });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [addError]);

  // Performance monitoring
  useEffect(() => {
    if (!isInitialized) return;

    const monitorPerformance = () => {
      const memory = (performance as any).memory;
      if (memory) {
        const memoryUsage = memory.usedJSHeapSize;
        const memoryLimit = memory.jsHeapSizeLimit;
        
        // Update performance metrics
        useStore.getState().updatePerformanceMetrics({
          memoryUsage,
          lastUpdate: new Date()
        });

        // Check for memory issues
        if (memoryUsage / memoryLimit > 0.9) {
          addError({
            type: 'system',
            severity: 'high',
            message: 'High memory usage detected',
            details: `Memory usage: ${(memoryUsage / 1024 / 1024).toFixed(2)}MB`,
            context: { memoryUsage, memoryLimit }
          });
        }
      }
    };

    // Monitor performance every 30 seconds
    const performanceInterval = setInterval(monitorPerformance, 30000);

    return () => {
      clearInterval(performanceInterval);
    };
  }, [isInitialized, addError]);

  // Context value
  const contextValue: StoreContextValue = {
    isInitialized,
    isInitializing,
    initializationError,
    reinitialize
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};

// Loading component for initialization
export const StoreInitializer: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isInitialized, isInitializing, initializationError, reinitialize } = useStoreContext();

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Initializing MeetingMind
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Setting up audio, AI providers, and system components...
          </p>
        </div>
      </div>
    );
  }

  if (initializationError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <div className="bg-red-100 dark:bg-red-900/20 rounded-full h-12 w-12 mx-auto mb-4 flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Initialization Failed
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {initializationError}
          </p>
          <button
            onClick={reinitialize}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            MeetingMind
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Waiting for initialization...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// HOC for components that require an initialized store
export const withStoreInitialization = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P) => (
    <StoreInitializer>
      <Component {...props} />
    </StoreInitializer>
  );
};

// Hook for checking store readiness
export const useStoreReady = () => {
  const { isInitialized, isInitializing, initializationError } = useStoreContext();
  
  return {
    isReady: isInitialized && !isInitializing && !initializationError,
    isInitialized,
    isInitializing,
    hasError: !!initializationError,
    error: initializationError
  };
};

export default StoreProvider;