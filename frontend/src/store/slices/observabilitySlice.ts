/**
 * Observability Integration Slice
 * Integrates observability features with the Zustand store
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  ObservabilityConfig,
  initializeObservability,
  getObservabilityManager,
  withObservability
} from '../observability';
import { MeetingMindTracer, TracedOperation } from '../observability/tracing';
import { LoggerFactory, LogLevel } from '../observability/logging';
import { healthMonitor, SystemHealthSummary } from '../observability/health';
import { getMetrics } from '../observability/metrics';
import { AppState, StoreActions } from '../types';

export interface ObservabilityState {
  isInitialized: boolean;
  config: ObservabilityConfig | null;
  healthSummary: SystemHealthSummary | null;
  lastHealthCheck: Date | null;
  performanceMetrics: {
    fps: number;
    memoryUsage: number;
    renderTime: number;
    networkLatency: number;
  };
  tracing: {
    enabled: boolean;
    activeSpans: number;
    totalSpans: number;
  };
  logging: {
    level: LogLevel;
    remoteEnabled: boolean;
    errorCount: number;
  };
  metrics: {
    enabled: boolean;
    totalEvents: number;
    lastReported: Date | null;
  };
}

export interface ObservabilitySlice {
  // State
  observability: ObservabilityState;
  
  // Initialization
  initializeObservability: (config: ObservabilityConfig) => Promise<boolean>;
  shutdownObservability: () => Promise<void>;
  updateObservabilityConfig: (updates: Partial<ObservabilityConfig>) => void;
  
  // Health monitoring
  runHealthCheck: () => Promise<SystemHealthSummary>;
  getHealthStatus: () => SystemHealthSummary | null;
  
  // Performance tracking
  updatePerformanceMetrics: (metrics: Partial<ObservabilityState['performanceMetrics']>) => void;
  recordPerformanceEvent: (component: string, duration: number, context?: Record<string, unknown>) => void;
  
  // Tracing utilities
  startTrace: (name: string, attributes?: Record<string, unknown>) => TracedOperation;
  traceOperation: <T>(name: string, operation: () => Promise<T>, attributes?: Record<string, unknown>) => Promise<T>;
  
  // Logging utilities
  logEvent: (level: LogLevel, message: string, context?: Record<string, unknown>) => void;
  logError: (error: Error, context?: Record<string, unknown>) => void;
  logUserAction: (action: string, component: string, context?: Record<string, unknown>) => void;
  logBusinessEvent: (event: string, data: unknown, context?: Record<string, unknown>) => void;
  
  // Metrics utilities
  recordMetric: (metricName: string, value: number, labels?: Record<string, string>) => void;
  recordCounter: (counterName: string, increment?: number, labels?: Record<string, string>) => void;
  recordHistogram: (histogramName: string, value: number, labels?: Record<string, string>) => void;
  
  // Integration with store actions
  traceStoreAction: <T>(actionName: string, action: () => T, context?: Record<string, unknown>) => T;
  traceAsyncStoreAction: <T>(actionName: string, action: () => Promise<T>, context?: Record<string, unknown>) => Promise<T>;
  
  // Debugging utilities
  enableDebugMode: () => void;
  disableDebugMode: () => void;
  getDebugInfo: () => Record<string, unknown>;
  exportObservabilityData: () => Promise<unknown>;
}

const defaultObservabilityState: ObservabilityState = {
  isInitialized: false,
  config: null,
  healthSummary: null,
  lastHealthCheck: null,
  performanceMetrics: {
    fps: 60,
    memoryUsage: 0,
    renderTime: 0,
    networkLatency: 0,
  },
  tracing: {
    enabled: false,
    activeSpans: 0,
    totalSpans: 0,
  },
  logging: {
    level: LogLevel.INFO,
    remoteEnabled: false,
    errorCount: 0,
  },
  metrics: {
    enabled: false,
    totalEvents: 0,
    lastReported: null,
  },
};

export const createObservabilitySlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  ObservabilitySlice
> = (set, get) => ({
  // Initial state
  observability: defaultObservabilityState,
  
  // Initialization
  initializeObservability: async (config) => {
    try {
      await initializeObservability(config);
      
      set(produce((state: AppState) => {
        state.observability.isInitialized = true;
        state.observability.config = config;
        state.observability.tracing.enabled = config.telemetry?.tracing?.enabled !== false;
        state.observability.logging.level = config.logging?.level || LogLevel.INFO;
        state.observability.logging.remoteEnabled = config.logging?.enableRemote || false;
        state.observability.metrics.enabled = config.metrics?.enabled !== false;
      }));
      
      // Start health monitoring
      await get().runHealthCheck();
      
      // Set up periodic performance monitoring
      get().startPerformanceMonitoring();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize observability:', error);
      get().logError(error as Error, { context: 'observability_initialization' });
      return false;
    }
  },
  
  shutdownObservability: async () => {
    try {
      const manager = getObservabilityManager();
      if (manager) {
        await manager.shutdown();
      }
      
      set(produce((state: AppState) => {
        state.observability = { ...defaultObservabilityState };
      }));
    } catch (error) {
      console.error('Failed to shutdown observability:', error);
    }
  },
  
  updateObservabilityConfig: (updates) => {
    set(produce((state: AppState) => {
      if (state.observability.config) {
        Object.assign(state.observability.config, updates);
      }
    }));
    
    const manager = getObservabilityManager();
    if (manager) {
      manager.updateConfig(updates);
    }
  },
  
  // Health monitoring
  runHealthCheck: async () => {
    try {
      const summary = await healthMonitor.runChecks();
      
      set(produce((state: AppState) => {
        state.observability.healthSummary = summary;
        state.observability.lastHealthCheck = new Date();
      }));
      
      return summary;
    } catch (error) {
      get().logError(error as Error, { context: 'health_check' });
      throw error;
    }
  },
  
  getHealthStatus: () => {
    return get().observability.healthSummary;
  },
  
  // Performance tracking
  updatePerformanceMetrics: (metrics) => {
    set(produce((state: AppState) => {
      Object.assign(state.observability.performanceMetrics, metrics);
    }));
  },
  
  recordPerformanceEvent: (component, duration, context = {}) => {
    const { businessCollector } = getMetrics();
    if (businessCollector) {
      businessCollector.recordUserEngagement('performance_event', {
        component,
        duration,
        ...context,
      });
    }
    
    get().logEvent(LogLevel.DEBUG, `Performance: ${component}`, {
      duration,
      component,
      ...context,
    });
  },
  
  // Tracing utilities
  startTrace: (name, attributes = {}) => {
    const operation = new TracedOperation(name, { attributes });
    
    set(produce((state: AppState) => {
      state.observability.tracing.activeSpans += 1;
      state.observability.tracing.totalSpans += 1;
    }));
    
    return operation;
  },
  
  traceOperation: async (name, operation, attributes = {}) => {
    return MeetingMindTracer.traceAsync(name, async (tracedOp) => {
      tracedOp.setAttributes(attributes);
      return operation();
    }, attributes);
  },
  
  // Logging utilities
  logEvent: (level, message, context = {}) => {
    const logger = LoggerFactory.getDefaultLogger();
    
    switch (level) {
      case LogLevel.ERROR:
        logger.error(message, undefined, context);
        set(produce((state: AppState) => {
          state.observability.logging.errorCount += 1;
        }));
        break;
      case LogLevel.WARN:
        logger.warn(message, context);
        break;
      case LogLevel.INFO:
        logger.info(message, context);
        break;
      case LogLevel.DEBUG:
        logger.debug(message, context);
        break;
      case LogLevel.TRACE:
        logger.trace(message, context);
        break;
    }
  },
  
  logError: (error, context = {}) => {
    const logger = LoggerFactory.getDefaultLogger();
    logger.error(error.message, error, context);
    
    set(produce((state: AppState) => {
      state.observability.logging.errorCount += 1;
    }));
  },
  
  logUserAction: (action, component, context = {}) => {
    const logger = LoggerFactory.getDefaultLogger();
    logger.userAction(action, component, context);
    
    const { businessCollector } = getMetrics();
    if (businessCollector) {
      businessCollector.recordUserEngagement(action, { component, ...context });
    }
  },
  
  logBusinessEvent: (event, data, context = {}) => {
    const logger = LoggerFactory.getDefaultLogger();
    logger.businessEvent(event, data, context);
    
    const { businessCollector } = getMetrics();
    if (businessCollector) {
      businessCollector.recordUserEngagement('business_event', { event, data, ...context });
    }
  },
  
  // Metrics utilities
  recordMetric: (metricName, value, labels = {}) => {
    const { reporter } = getMetrics();
    if (reporter) {
      // This would use a generic metric recording method
      console.debug(`Metric: ${metricName}`, { value, labels });
    }
    
    set(produce((state: AppState) => {
      state.observability.metrics.totalEvents += 1;
      state.observability.metrics.lastReported = new Date();
    }));
  },
  
  recordCounter: (counterName, increment = 1, labels = {}) => {
    get().recordMetric(`${counterName}_total`, increment, labels);
  },
  
  recordHistogram: (histogramName, value, labels = {}) => {
    get().recordMetric(`${histogramName}_histogram`, value, labels);
  },
  
  // Integration with store actions
  traceStoreAction: (actionName, action, context = {}) => {
    const operation = get().startTrace(`store.${actionName}`, {
      component: 'store',
      action: actionName,
      ...context,
    });
    
    try {
      const result = action();
      operation.setSuccess();
      return result;
    } catch (error) {
      operation.setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      operation.finish();
      
      set(produce((state: AppState) => {
        state.observability.tracing.activeSpans -= 1;
      }));
    }
  },
  
  traceAsyncStoreAction: async (actionName, action, context = {}) => {
    return get().traceOperation(`store.${actionName}`, action, {
      component: 'store',
      action: actionName,
      ...context,
    });
  },
  
  // Debugging utilities
  enableDebugMode: () => {
    const logger = LoggerFactory.getDefaultLogger();
    logger.setLevel(LogLevel.DEBUG);
    
    set(produce((state: AppState) => {
      state.observability.logging.level = LogLevel.DEBUG;
      if (state.observability.config) {
        state.observability.config.logging = {
          ...state.observability.config.logging,
          level: LogLevel.DEBUG,
        };
      }
    }));
    
    get().logEvent(LogLevel.INFO, 'Debug mode enabled');
  },
  
  disableDebugMode: () => {
    const logger = LoggerFactory.getDefaultLogger();
    logger.setLevel(LogLevel.INFO);
    
    set(produce((state: AppState) => {
      state.observability.logging.level = LogLevel.INFO;
      if (state.observability.config) {
        state.observability.config.logging = {
          ...state.observability.config.logging,
          level: LogLevel.INFO,
        };
      }
    }));
    
    get().logEvent(LogLevel.INFO, 'Debug mode disabled');
  },
  
  getDebugInfo: () => {
    const { observability } = get();
    const manager = getObservabilityManager();
    
    return {
      observability: observability,
      manager: manager?.getStatus(),
      health: healthMonitor.getLastResults(),
      metrics: getMetrics(),
      performance: {
        memory: (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory,
        timing: performance.timing,
        navigation: performance.navigation,
      },
    };
  },
  
  exportObservabilityData: async () => {
    try {
      const debugInfo = get().getDebugInfo();
      const healthSummary = await get().runHealthCheck();
      
      return {
        timestamp: new Date().toISOString(),
        service: get().observability.config?.serviceName,
        version: get().observability.config?.serviceVersion,
        environment: get().observability.config?.environment,
        debugInfo,
        healthSummary,
      };
    } catch (error) {
      get().logError(error as Error, { context: 'observability_export' });
      throw error;
    }
  },
  
  // Internal utility methods
  startPerformanceMonitoring: () => {
    if (typeof window === 'undefined') return;
    
    // Monitor performance metrics every 5 seconds
    setInterval(() => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      if (memory) {
        get().updatePerformanceMetrics({
          memoryUsage: memory.usedJSHeapSize,
        });
      }
      
      // Check for performance issues
      const metrics = get().observability.performanceMetrics;
      if (metrics.memoryUsage > 100 * 1024 * 1024) { // 100MB
        get().logEvent(LogLevel.WARN, 'High memory usage detected', {
          memoryUsage: metrics.memoryUsage,
        });
      }
    }, 5000);
    
    // Monitor FPS
    let frames = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frames++;
      const now = performance.now();
      
      if (now - lastTime >= 1000) {
        const fps = (frames * 1000) / (now - lastTime);
        get().updatePerformanceMetrics({ fps });
        
        if (fps < 30) {
          get().logEvent(LogLevel.WARN, 'Low FPS detected', { fps });
        }
        
        frames = 0;
        lastTime = now;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  },
});

// Middleware for automatic tracing of store actions
export function withObservabilityMiddleware<T extends object>(
  storeInitializer: StateCreator<T, [], [], T>
): StateCreator<T, [], [], T> {
  return (set, get, api) => {
    const store = storeInitializer(set, get, api);
    
    // Wrap all functions in the store with tracing
    const wrappedStore = {} as T;
    
    for (const [key, value] of Object.entries(store)) {
      if (typeof value === 'function') {
        wrappedStore[key as keyof T] = (async (...args: unknown[]) => {
          const actionName = key;
          const isAsync = value.constructor.name === 'AsyncFunction';
          
          if (isAsync) {
            return withObservability(
              `store.${actionName}`,
              () => value.apply(store, args),
              { component: 'store', action: actionName }
            );
          } else {
            // For sync functions, use simple tracing
            const start = performance.now();
            try {
              const result = value.apply(store, args);
              const duration = performance.now() - start;
              
              if (duration > 10) { // Log slow operations
                console.debug(`Slow store action: ${actionName}`, { duration });
              }
              
              return result;
            } catch (error) {
              console.error(`Store action failed: ${actionName}`, error);
              throw error;
            }
          }
        }) as T[keyof T];
      } else {
        wrappedStore[key as keyof T] = value;
      }
    }
    
    return wrappedStore;
  };
}