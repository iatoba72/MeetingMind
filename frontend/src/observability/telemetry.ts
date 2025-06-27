/**
 * OpenTelemetry Configuration and Setup
 * Provides distributed tracing, metrics, and observability
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';

// Telemetry configuration interface
export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: 'development' | 'staging' | 'production';
  tracing: {
    enabled: boolean;
    jaegerEndpoint?: string;
    otlpEndpoint?: string;
    sampleRate: number;
  };
  metrics: {
    enabled: boolean;
    prometheusPort?: number;
    otlpEndpoint?: string;
    collectInterval: number;
  };
  logging: {
    enabled: boolean;
    level: 'error' | 'warn' | 'info' | 'debug';
  };
  userInteractions: boolean;
  customAttributes?: Record<string, string | number | boolean>;
}

// Default telemetry configuration
const defaultConfig: TelemetryConfig = {
  serviceName: 'meetingmind-frontend',
  serviceVersion: process.env.REACT_APP_VERSION || '1.0.0',
  environment: (process.env.NODE_ENV as any) || 'development',
  tracing: {
    enabled: true,
    jaegerEndpoint: process.env.REACT_APP_JAEGER_ENDPOINT,
    otlpEndpoint: process.env.REACT_APP_OTLP_TRACE_ENDPOINT,
    sampleRate: parseFloat(process.env.REACT_APP_TRACE_SAMPLE_RATE || '1.0')
  },
  metrics: {
    enabled: true,
    prometheusPort: parseInt(process.env.REACT_APP_PROMETHEUS_PORT || '9090'),
    otlpEndpoint: process.env.REACT_APP_OTLP_METRICS_ENDPOINT,
    collectInterval: parseInt(process.env.REACT_APP_METRICS_INTERVAL || '5000')
  },
  logging: {
    enabled: true,
    level: (process.env.REACT_APP_LOG_LEVEL as any) || 'info'
  },
  userInteractions: true,
  customAttributes: {
    'user.agent': navigator?.userAgent || 'unknown',
    'screen.resolution': typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'unknown',
    'deployment.environment': process.env.REACT_APP_ENVIRONMENT || 'local'
  }
};

// Telemetry manager class
export class TelemetryManager {
  private config: TelemetryConfig;
  private tracerProvider: WebTracerProvider | NodeTracerProvider | null = null;
  private isInitialized = false;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Initialize telemetry for web environment
   */
  initializeWeb(): void {
    if (this.isInitialized || typeof window === 'undefined') return;

    try {
      // Create resource with service information
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
        ...this.config.customAttributes
      });

      // Initialize tracing
      if (this.config.tracing.enabled) {
        this.tracerProvider = new WebTracerProvider({
          resource,
          sampler: this.createSampler()
        });

        // Add span processors
        this.addSpanProcessors();

        // Register instrumentations
        this.registerWebInstrumentations();

        // Register the provider
        this.tracerProvider.register();
      }

      this.isInitialized = true;
      console.log(`✅ Telemetry initialized for ${this.config.serviceName}`);
    } catch (error) {
      console.error('❌ Failed to initialize telemetry:', error);
    }
  }

  /**
   * Initialize telemetry for Node.js environment
   */
  initializeNode(): NodeSDK | null {
    if (typeof window !== 'undefined') return null;

    try {
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
        ...this.config.customAttributes
      });

      const sdk = new NodeSDK({
        resource,
        traceExporter: this.createTraceExporter(),
        metricReader: this.createMetricReader(),
        instrumentations: [getNodeAutoInstrumentations()],
      });

      sdk.start();
      this.isInitialized = true;
      console.log(`✅ Node.js telemetry initialized for ${this.config.serviceName}`);
      
      return sdk;
    } catch (error) {
      console.error('❌ Failed to initialize Node.js telemetry:', error);
      return null;
    }
  }

  /**
   * Create sampler based on configuration
   */
  private createSampler() {
    const { TraceIdRatioBasedSampler, AlwaysOnSampler, AlwaysOffSampler } = require('@opentelemetry/sdk-trace-base');
    
    if (this.config.tracing.sampleRate <= 0) {
      return new AlwaysOffSampler();
    } else if (this.config.tracing.sampleRate >= 1) {
      return new AlwaysOnSampler();
    } else {
      return new TraceIdRatioBasedSampler(this.config.tracing.sampleRate);
    }
  }

  /**
   * Add span processors for trace export
   */
  private addSpanProcessors(): void {
    if (!this.tracerProvider) return;

    // Jaeger exporter
    if (this.config.tracing.jaegerEndpoint) {
      const jaegerExporter = new JaegerExporter({
        endpoint: this.config.tracing.jaegerEndpoint,
      });
      this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
    }

    // OTLP exporter
    if (this.config.tracing.otlpEndpoint) {
      const otlpExporter = new OTLPTraceExporter({
        url: this.config.tracing.otlpEndpoint,
      });
      this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(otlpExporter));
    }
  }

  /**
   * Register web-specific instrumentations
   */
  private registerWebInstrumentations(): void {
    const { registerInstrumentations } = require('@opentelemetry/instrumentation');

    const instrumentations = [
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: /.*/,
      }),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: /.*/,
      }),
      new DocumentLoadInstrumentation(),
    ];

    if (this.config.userInteractions) {
      instrumentations.push(new UserInteractionInstrumentation());
    }

    registerInstrumentations({
      instrumentations,
    });
  }

  /**
   * Create trace exporter for Node.js
   */
  private createTraceExporter() {
    if (this.config.tracing.otlpEndpoint) {
      return new OTLPTraceExporter({
        url: this.config.tracing.otlpEndpoint,
      });
    }

    if (this.config.tracing.jaegerEndpoint) {
      return new JaegerExporter({
        endpoint: this.config.tracing.jaegerEndpoint,
      });
    }

    return undefined;
  }

  /**
   * Create metric reader for Node.js
   */
  private createMetricReader() {
    if (!this.config.metrics.enabled) return undefined;

    const readers = [];

    // Prometheus exporter
    if (this.config.metrics.prometheusPort) {
      readers.push(new PrometheusExporter({
        port: this.config.metrics.prometheusPort,
      }));
    }

    // OTLP metrics exporter
    if (this.config.metrics.otlpEndpoint) {
      readers.push(new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: this.config.metrics.otlpEndpoint,
        }),
        exportIntervalMillis: this.config.metrics.collectInterval,
      }));
    }

    return readers[0]; // Return first reader for now
  }

  /**
   * Shutdown telemetry
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      if (this.tracerProvider) {
        await this.tracerProvider.shutdown();
      }
      this.isInitialized = false;
      console.log('✅ Telemetry shutdown completed');
    } catch (error) {
      console.error('❌ Error during telemetry shutdown:', error);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  /**
   * Check if telemetry is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Global telemetry instance
let telemetryManager: TelemetryManager | null = null;

/**
 * Initialize global telemetry
 */
export function initializeTelemetry(config?: Partial<TelemetryConfig>): TelemetryManager {
  if (telemetryManager) {
    console.warn('⚠️ Telemetry already initialized');
    return telemetryManager;
  }

  telemetryManager = new TelemetryManager(config);

  // Initialize based on environment
  if (typeof window !== 'undefined') {
    telemetryManager.initializeWeb();
  } else {
    telemetryManager.initializeNode();
  }

  return telemetryManager;
}

/**
 * Get global telemetry instance
 */
export function getTelemetryManager(): TelemetryManager | null {
  return telemetryManager;
}

/**
 * Shutdown global telemetry
 */
export async function shutdownTelemetry(): Promise<void> {
  if (telemetryManager) {
    await telemetryManager.shutdown();
    telemetryManager = null;
  }
}

// Auto-initialize in browser environment
if (typeof window !== 'undefined' && process.env.REACT_APP_TELEMETRY_AUTO_INIT !== 'false') {
  initializeTelemetry();
}

export default TelemetryManager;