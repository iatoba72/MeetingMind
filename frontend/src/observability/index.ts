/**
 * Observability Integration Hub
 * Centralized initialization and management of all observability components
 */

import { initializeTelemetry, shutdownTelemetry, TelemetryConfig } from './telemetry';
import { initializeMetrics, shutdownMetrics, MetricsReporter } from './metrics';
import { LoggerFactory, LogLevel } from './logging';
import { healthMonitor, HealthMonitor } from './health'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { MeetingMindTracer } from './tracing';

// Observability configuration
export interface ObservabilityConfig {
  telemetry?: Partial<TelemetryConfig>;
  logging?: {
    level: LogLevel;
    enableRemote: boolean;
    remoteEndpoint?: string;
  };
  metrics?: {
    enabled: boolean;
    reportingInterval: number;
  };
  health?: {
    enabled: boolean;
    checkInterval: number;
  };
  environment: 'development' | 'staging' | 'production';
  serviceName: string;
  serviceVersion: string;
}

// Observability manager class
export class ObservabilityManager {
  private config: ObservabilityConfig;
  private isInitialized = false;
  private metricsReporter?: MetricsReporter;

  constructor(config: ObservabilityConfig) {
    this.config = config;
  }

  /**
   * Initialize all observability components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('⚠️ Observability already initialized');
      return;
    }

    try {
      console.log('🔍 Initializing observability...');

      // Initialize telemetry (tracing)
      if (this.config.telemetry?.enabled !== false) {
        initializeTelemetry({
          serviceName: this.config.serviceName,
          serviceVersion: this.config.serviceVersion,
          environment: this.config.environment,
          ...this.config.telemetry,
        });
        console.log('✅ Telemetry initialized');
      }

      // Initialize logging
      LoggerFactory.initialize({
        level: this.config.logging?.level || LogLevel.INFO,
        enableRemote: this.config.logging?.enableRemote || false,
        remoteEndpoint: this.config.logging?.remoteEndpoint,
      });
      console.log('✅ Logging initialized');

      // Initialize metrics
      if (this.config.metrics?.enabled !== false) {
        const { reporter } = initializeMetrics();
        this.metricsReporter = reporter;
        console.log('✅ Metrics initialized');
      }

      // Initialize health monitoring
      if (this.config.health?.enabled !== false) {
        healthMonitor.startMonitoring(this.config.health?.checkInterval || 30000);
        console.log('✅ Health monitoring initialized');
      }

      this.isInitialized = true;
      console.log('🎉 Observability initialization complete');

      // Log initialization event
      const logger = LoggerFactory.getDefaultLogger();
      logger.systemEvent('observability_initialized', {
        serviceName: this.config.serviceName,
        serviceVersion: this.config.serviceVersion,
        environment: this.config.environment,
      });

    } catch (error) {
      console.error('❌ Failed to initialize observability:', error);
      throw error;
    }
  }

  /**
   * Shutdown all observability components
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      console.log('🔍 Shutting down observability...');

      // Stop health monitoring
      healthMonitor.stopMonitoring();

      // Shutdown metrics
      shutdownMetrics();

      // Shutdown logging
      await LoggerFactory.shutdown();

      // Shutdown telemetry
      await shutdownTelemetry();

      this.isInitialized = false;
      console.log('✅ Observability shutdown complete');

    } catch (error) {
      console.error('❌ Error during observability shutdown:', error);
    }
  }

  /**
   * Get observability status
   */
  getStatus(): {
    initialized: boolean;
    config: ObservabilityConfig;
    systemHealth?: Record<string, unknown>;
  } {
    return {
      initialized: this.isInitialized,
      config: this.config,
      systemHealth: this.isInitialized ? healthMonitor.getLastResults() : undefined,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ObservabilityConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Global observability instance
let observabilityManager: ObservabilityManager | null = null;

/**
 * Initialize global observability
 */
export async function initializeObservability(config: ObservabilityConfig): Promise<ObservabilityManager> {
  if (observabilityManager) {
    console.warn('⚠️ Observability already initialized globally');
    return observabilityManager;
  }

  observabilityManager = new ObservabilityManager(config);
  await observabilityManager.initialize();
  
  return observabilityManager;
}

/**
 * Get global observability manager
 */
export function getObservabilityManager(): ObservabilityManager | null {
  return observabilityManager;
}

/**
 * Shutdown global observability
 */
export async function shutdownObservability(): Promise<void> {
  if (observabilityManager) {
    await observabilityManager.shutdown();
    observabilityManager = null;
  }
}

/**
 * Default configuration for different environments
 */
export const defaultConfigs: Record<string, Partial<ObservabilityConfig>> = {
  development: {
    telemetry: {
      tracing: {
        enabled: true,
        sampleRate: 1.0,
      },
    },
    logging: {
      level: LogLevel.DEBUG,
      enableRemote: false,
    },
    metrics: {
      enabled: true,
      reportingInterval: 10000,
    },
    health: {
      enabled: true,
      checkInterval: 15000,
    },
  },
  staging: {
    telemetry: {
      tracing: {
        enabled: true,
        sampleRate: 0.5,
      },
    },
    logging: {
      level: LogLevel.INFO,
      enableRemote: true,
    },
    metrics: {
      enabled: true,
      reportingInterval: 5000,
    },
    health: {
      enabled: true,
      checkInterval: 30000,
    },
  },
  production: {
    telemetry: {
      tracing: {
        enabled: true,
        sampleRate: 0.1,
      },
    },
    logging: {
      level: LogLevel.INFO,
      enableRemote: true,
    },
    metrics: {
      enabled: true,
      reportingInterval: 5000,
    },
    health: {
      enabled: true,
      checkInterval: 30000,
    },
  },
};

/**
 * Create observability configuration for environment
 */
export function createObservabilityConfig(
  environment: 'development' | 'staging' | 'production',
  serviceName: string,
  serviceVersion: string,
  overrides: Partial<ObservabilityConfig> = {}
): ObservabilityConfig {
  const baseConfig = defaultConfigs[environment] || defaultConfigs.development;
  
  return {
    environment,
    serviceName,
    serviceVersion,
    ...baseConfig,
    ...overrides,
  };
}

/**
 * React hook for observability integration
 */
export function useObservability() {
  const manager = getObservabilityManager();
  
  return {
    isInitialized: manager?.getStatus().initialized || false,
    manager,
    tracer: MeetingMindTracer,
    logger: LoggerFactory.getDefaultLogger(),
    health: healthMonitor,
  };
}

/**
 * Utility function to add observability to async operations
 */
export async function withObservability<T>(
  operationName: string,
  operation: () => Promise<T>,
  context: Record<string, any> = {}
): Promise<T> {
  const logger = LoggerFactory.getDefaultLogger();
  const start = performance.now();
  
  logger.debug(`Starting operation: ${operationName}`, context);
  
  try {
    const result = await MeetingMindTracer.traceAsync(
      operationName,
      async (tracedOperation) => {
        tracedOperation.setAttributes(context);
        return operation();
      },
      context
    );
    
    const duration = performance.now() - start;
    logger.perf(`Operation completed: ${operationName}`, duration, context);
    
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logger.error(`Operation failed: ${operationName}`, error as Error, {
      ...context,
      duration,
    });
    throw error;
  }
}

/**
 * Create an instrumented HTTP client
 */
export function createInstrumentedFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof URL ? input.toString() : 
                typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    
    return withObservability(
      `http.${method.toLowerCase()}`,
      async () => {
        const response = await fetch(input, init);
        
        // Log the request
        const logger = LoggerFactory.getDefaultLogger();
        logger.apiRequest(method, url, 0, response.status, {
          url,
          method,
          status: response.status.toString(),
        });
        
        return response;
      },
      {
        'http.method': method,
        'http.url': url,
      }
    );
  };
}

// Auto-initialize in browser environment if configured
if (typeof window !== 'undefined' && process.env.REACT_APP_OBSERVABILITY_AUTO_INIT !== 'false') {
  const environment = (process.env.NODE_ENV as any) || 'development';
  const serviceName = process.env.REACT_APP_SERVICE_NAME || 'meetingmind-frontend';
  const serviceVersion = process.env.REACT_APP_VERSION || '1.0.0';
  
  const config = createObservabilityConfig(environment, serviceName, serviceVersion);
  
  initializeObservability(config).catch(error => {
    console.error('Failed to auto-initialize observability:', error);
  });
}

// Export all components for direct use
export * from './telemetry';
export * from './tracing';
export * from './metrics';
export * from './logging';
export * from './health';

// Export types
export type {
  TelemetryConfig,
  ObservabilityConfig,
  HealthCheckResult,
  SystemHealthSummary,
  LogContext,
  LogEntry,
};

export default ObservabilityManager;