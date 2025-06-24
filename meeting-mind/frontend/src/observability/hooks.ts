/**
 * React Hooks for Observability Integration
 * Provides easy-to-use hooks for React components
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MeetingMindTracer, TracedOperation } from './tracing';
import { LoggerFactory, LogLevel } from './logging';
import { healthMonitor, HealthStatus, SystemHealthSummary } from './health';
import { withObservability } from './index';

/**
 * Hook for component-level observability
 */
export function useObservability(componentName: string) {
  const {
    initializeObservability,
    logEvent,
    logError,
    logUserAction,
    traceOperation,
    recordPerformanceEvent,
    isInitialized,
  } = useStore((state) => ({
    initializeObservability: state.initializeObservability,
    logEvent: state.logEvent,
    logError: state.logError,
    logUserAction: state.logUserAction,
    traceOperation: state.traceOperation,
    recordPerformanceEvent: state.recordPerformanceEvent,
    isInitialized: state.observability.isInitialized,
  }));

  const logger = LoggerFactory.getLogger(componentName);

  // Component lifecycle logging
  useEffect(() => {
    if (isInitialized) {
      logger.debug(`Component mounted: ${componentName}`);
    }
    
    return () => {
      if (isInitialized) {
        logger.debug(`Component unmounted: ${componentName}`);
      }
    };
  }, [componentName, isInitialized, logger]);

  return {
    // Basic logging
    log: useCallback((level: LogLevel, message: string, context?: Record<string, any>) => {
      logEvent(level, message, { component: componentName, ...context });
    }, [logEvent, componentName]),

    // Error logging
    logError: useCallback((error: Error, context?: Record<string, any>) => {
      logError(error, { component: componentName, ...context });
    }, [logError, componentName]),

    // User action logging
    logUserAction: useCallback((action: string, context?: Record<string, any>) => {
      logUserAction(action, componentName, context);
    }, [logUserAction, componentName]),

    // Performance tracking
    recordPerformance: useCallback((operation: string, duration: number, context?: Record<string, any>) => {
      recordPerformanceEvent(componentName, duration, { operation, ...context });
    }, [recordPerformanceEvent, componentName]),

    // Tracing
    trace: useCallback(<T>(operation: string, fn: () => Promise<T>, context?: Record<string, any>) => {
      return traceOperation(`${componentName}.${operation}`, fn, context);
    }, [traceOperation, componentName]),

    // Component info
    componentName,
    isInitialized,
  };
}

/**
 * Hook for performance monitoring of component renders
 */
export function usePerformanceMonitoring(componentName: string, enabled: boolean = true) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());
  const { recordPerformance } = useObservability(componentName);

  useEffect(() => {
    if (!enabled) return;

    const renderTime = performance.now() - lastRenderTime.current;
    renderCount.current += 1;

    if (renderCount.current > 1) { // Skip first render
      recordPerformance('render', renderTime, {
        renderCount: renderCount.current,
      });

      // Log slow renders
      if (renderTime > 16) { // Slower than 60fps
        console.warn(`Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`);
      }
    }

    lastRenderTime.current = performance.now();
  });

  return {
    renderCount: renderCount.current,
    lastRenderTime: lastRenderTime.current,
  };
}

/**
 * Hook for tracing API calls
 */
export function useTracedFetch() {
  const { traceOperation } = useStore((state) => ({
    traceOperation: state.traceOperation,
  }));

  return useCallback(async (
    url: string,
    options?: RequestInit,
    context?: Record<string, any>
  ) => {
    const method = options?.method || 'GET';
    
    return traceOperation(
      `http.${method.toLowerCase()}`,
      async () => {
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      },
      {
        'http.method': method,
        'http.url': url,
        'http.status_code': 0, // Will be updated in the trace
        ...context,
      }
    );
  }, [traceOperation]);
}

/**
 * Hook for user interaction tracking
 */
export function useUserInteractionTracking(componentName: string) {
  const { logUserAction } = useObservability(componentName);

  const trackClick = useCallback((elementId: string, context?: Record<string, any>) => {
    logUserAction('click', { elementId, ...context });
  }, [logUserAction]);

  const trackInput = useCallback((inputName: string, value: any, context?: Record<string, any>) => {
    logUserAction('input', { inputName, valueType: typeof value, ...context });
  }, [logUserAction]);

  const trackNavigation = useCallback((destination: string, context?: Record<string, any>) => {
    logUserAction('navigation', { destination, ...context });
  }, [logUserAction]);

  const trackFormSubmit = useCallback((formName: string, context?: Record<string, any>) => {
    logUserAction('form_submit', { formName, ...context });
  }, [logUserAction]);

  return {
    trackClick,
    trackInput,
    trackNavigation,
    trackFormSubmit,
  };
}

/**
 * Hook for system health monitoring
 */
export function useHealthMonitoring() {
  const [healthSummary, setHealthSummary] = useState<SystemHealthSummary | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  
  const { runHealthCheck, getHealthStatus } = useStore((state) => ({
    runHealthCheck: state.runHealthCheck,
    getHealthStatus: state.getHealthStatus,
  }));

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    try {
      const summary = await runHealthCheck();
      setHealthSummary(summary);
      return summary;
    } catch (error) {
      console.error('Health check failed:', error);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [runHealthCheck]);

  // Get cached health status
  useEffect(() => {
    const cachedStatus = getHealthStatus();
    if (cachedStatus) {
      setHealthSummary(cachedStatus);
    }
  }, [getHealthStatus]);

  return {
    healthSummary,
    isChecking,
    checkHealth,
    isHealthy: healthSummary?.overall === HealthStatus.HEALTHY,
    isDegraded: healthSummary?.overall === HealthStatus.DEGRADED,
    isUnhealthy: healthSummary?.overall === HealthStatus.UNHEALTHY,
    score: healthSummary?.score || 0,
  };
}

/**
 * Hook for error boundary integration
 */
export function useErrorBoundary(componentName: string) {
  const { logError } = useObservability(componentName);

  const reportError = useCallback((error: Error, errorInfo?: any) => {
    logError(error, {
      errorBoundary: true,
      errorInfo,
    });
  }, [logError]);

  return { reportError };
}

/**
 * Hook for business event tracking
 */
export function useBusinessEvents() {
  const { logBusinessEvent } = useStore((state) => ({
    logBusinessEvent: state.logBusinessEvent,
  }));

  const trackMeetingEvent = useCallback((event: string, meetingId: string, data?: any) => {
    logBusinessEvent(`meeting.${event}`, { meetingId, ...data });
  }, [logBusinessEvent]);

  const trackAudioEvent = useCallback((event: string, data?: any) => {
    logBusinessEvent(`audio.${event}`, data);
  }, [logBusinessEvent]);

  const trackAIEvent = useCallback((event: string, provider: string, data?: any) => {
    logBusinessEvent(`ai.${event}`, { provider, ...data });
  }, [logBusinessEvent]);

  const trackUserEvent = useCallback((event: string, data?: any) => {
    logBusinessEvent(`user.${event}`, data);
  }, [logBusinessEvent]);

  return {
    trackMeetingEvent,
    trackAudioEvent,
    trackAIEvent,
    trackUserEvent,
    trackCustomEvent: logBusinessEvent,
  };
}

/**
 * Hook for real-time metrics monitoring
 */
export function useMetricsMonitoring() {
  const [metrics, setMetrics] = useState({
    fps: 60,
    memoryUsage: 0,
    renderTime: 0,
    networkLatency: 0,
  });

  const { performanceMetrics } = useStore((state) => ({
    performanceMetrics: state.observability.performanceMetrics,
  }));

  useEffect(() => {
    setMetrics(performanceMetrics);
  }, [performanceMetrics]);

  return {
    metrics,
    isPerformanceGood: metrics.fps > 45 && metrics.renderTime < 20,
    isMemoryHigh: metrics.memoryUsage > 100 * 1024 * 1024, // 100MB
    isNetworkSlow: metrics.networkLatency > 500,
  };
}

/**
 * Hook for debug mode management
 */
export function useDebugMode() {
  const {
    enableDebugMode,
    disableDebugMode,
    getDebugInfo,
    exportObservabilityData,
    debugLevel,
  } = useStore((state) => ({
    enableDebugMode: state.enableDebugMode,
    disableDebugMode: state.disableDebugMode,
    getDebugInfo: state.getDebugInfo,
    exportObservabilityData: state.exportObservabilityData,
    debugLevel: state.observability.logging.level,
  }));

  const [isExporting, setIsExporting] = useState(false);

  const isDebugEnabled = debugLevel === LogLevel.DEBUG || debugLevel === LogLevel.TRACE;

  const exportData = useCallback(async () => {
    setIsExporting(true);
    try {
      const data = await exportObservabilityData();
      
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `observability-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      return data;
    } catch (error) {
      console.error('Failed to export observability data:', error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, [exportObservabilityData]);

  return {
    isDebugEnabled,
    enableDebugMode,
    disableDebugMode,
    getDebugInfo,
    exportData,
    isExporting,
  };
}

/**
 * Higher-order component for automatic observability integration
 */
export function withObservabilityHOC<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  return function ObservableComponent(props: P) {
    const { log, logError } = useObservability(displayName);
    usePerformanceMonitoring(displayName);

    useEffect(() => {
      log(LogLevel.DEBUG, 'Component rendered', { props: Object.keys(props) });
    });

    // Error boundary for the component
    useEffect(() => {
      const handleError = (event: ErrorEvent) => {
        logError(new Error(event.message), {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      };

      window.addEventListener('error', handleError);
      return () => window.removeEventListener('error', handleError);
    }, [logError]);

    return <WrappedComponent {...props} />;
  };
}

/**
 * Hook for async operation tracing
 */
export function useAsyncOperation() {
  const { traceOperation } = useStore((state) => ({
    traceOperation: state.traceOperation,
  }));

  return useCallback(async <T>(
    name: string,
    operation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> => {
    return traceOperation(name, operation, context);
  }, [traceOperation]);
}