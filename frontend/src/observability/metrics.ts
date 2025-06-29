/**
 * Custom Metrics Collection and Reporting
 * Provides application-specific metrics beyond standard OpenTelemetry
 */

import { metrics } from '@opentelemetry/api';

// Metric instruments
const meter = metrics.getMeter('meetingmind-frontend', '1.0.0');

// Counters
const meetingCounter = meter.createCounter('meetingmind_meetings_total', {
  description: 'Total number of meetings created',
});

const audioSessionCounter = meter.createCounter('meetingmind_audio_sessions_total', {
  description: 'Total number of audio sessions started',
});

const aiRequestCounter = meter.createCounter('meetingmind_ai_requests_total', {
  description: 'Total number of AI requests made',
});

const errorCounter = meter.createCounter('meetingmind_errors_total', {
  description: 'Total number of errors encountered',
});

const userActionCounter = meter.createCounter('meetingmind_user_actions_total', {
  description: 'Total number of user actions performed',
});

// Histograms
const meetingDurationHistogram = meter.createHistogram('meetingmind_meeting_duration_seconds', {
  description: 'Duration of meetings in seconds',
  boundaries: [30, 60, 300, 600, 1800, 3600, 7200], // 30s to 2h
});

const audioLatencyHistogram = meter.createHistogram('meetingmind_audio_latency_ms', {
  description: 'Audio processing latency in milliseconds',
  boundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
});

const aiResponseTimeHistogram = meter.createHistogram('meetingmind_ai_response_time_ms', {
  description: 'AI response time in milliseconds',
  boundaries: [100, 250, 500, 1000, 2500, 5000, 10000],
});

const uiRenderTimeHistogram = meter.createHistogram('meetingmind_ui_render_time_ms', {
  description: 'UI component render time in milliseconds',
  boundaries: [1, 5, 10, 16, 33, 50, 100, 250],
});

const networkLatencyHistogram = meter.createHistogram('meetingmind_network_latency_ms', {
  description: 'Network request latency in milliseconds',
  boundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000],
});

// Gauges
const activeUsersGauge = meter.createUpDownCounter('meetingmind_active_users', {
  description: 'Number of currently active users',
});

const memoryUsageGauge = meter.createUpDownCounter('meetingmind_memory_usage_bytes', {
  description: 'Current memory usage in bytes',
});

const activeMeetingsGauge = meter.createUpDownCounter('meetingmind_active_meetings', {
  description: 'Number of currently active meetings',
});

const audioQualityGauge = meter.createUpDownCounter('meetingmind_audio_quality_score', {
  description: 'Current audio quality score (0-1)',
});

const networkQualityGauge = meter.createUpDownCounter('meetingmind_network_quality_score', {
  description: 'Current network quality score (0-1)',
});

/**
 * Metrics collection and reporting interface
 */
export interface MetricsReporter {
  // Meeting metrics
  recordMeetingCreated(attributes?: Record<string, string>): void;
  recordMeetingEnded(duration: number, attributes?: Record<string, string>): void;
  recordMeetingError(errorType: string, attributes?: Record<string, string>): void;
  
  // Audio metrics
  recordAudioSession(attributes?: Record<string, string>): void;
  recordAudioLatency(latency: number, attributes?: Record<string, string>): void;
  recordAudioQuality(quality: number, attributes?: Record<string, string>): void;
  
  // AI metrics
  recordAIRequest(provider: string, model: string, attributes?: Record<string, string>): void;
  recordAIResponse(responseTime: number, provider: string, attributes?: Record<string, string>): void;
  recordAIError(provider: string, errorType: string, attributes?: Record<string, string>): void;
  
  // UI metrics
  recordUserAction(action: string, component: string, attributes?: Record<string, string>): void;
  recordUIRender(component: string, renderTime: number, attributes?: Record<string, string>): void;
  recordPageView(page: string, attributes?: Record<string, string>): void;
  
  // Network metrics
  recordNetworkRequest(method: string, url: string, latency: number, status: number): void;
  recordNetworkError(method: string, url: string, errorType: string): void;
  recordNetworkQuality(quality: number, attributes?: Record<string, string>): void;
  
  // System metrics
  recordMemoryUsage(usage: number): void;
  recordCPUUsage(usage: number): void;
  recordActiveUsers(count: number): void;
  recordActiveMeetings(count: number): void;
  
  // Error metrics
  recordError(type: string, severity: string, component: string, attributes?: Record<string, string>): void;
}

/**
 * Default metrics reporter implementation
 */
export class DefaultMetricsReporter implements MetricsReporter {
  // Meeting metrics
  recordMeetingCreated(attributes: Record<string, string> = {}): void {
    meetingCounter.add(1, attributes);
  }

  recordMeetingEnded(duration: number, attributes: Record<string, string> = {}): void {
    meetingDurationHistogram.record(duration, attributes);
  }

  recordMeetingError(errorType: string, attributes: Record<string, string> = {}): void {
    errorCounter.add(1, {
      error_type: errorType,
      component: 'meeting',
      ...attributes,
    });
  }

  // Audio metrics
  recordAudioSession(attributes: Record<string, string> = {}): void {
    audioSessionCounter.add(1, attributes);
  }

  recordAudioLatency(latency: number, attributes: Record<string, string> = {}): void {
    audioLatencyHistogram.record(latency, attributes);
  }

  recordAudioQuality(quality: number, attributes: Record<string, string> = {}): void {
    audioQualityGauge.add(quality, attributes);
  }

  // AI metrics
  recordAIRequest(provider: string, model: string, attributes: Record<string, string> = {}): void {
    aiRequestCounter.add(1, {
      provider,
      model,
      ...attributes,
    });
  }

  recordAIResponse(responseTime: number, provider: string, attributes: Record<string, string> = {}): void {
    aiResponseTimeHistogram.record(responseTime, {
      provider,
      ...attributes,
    });
  }

  recordAIError(provider: string, errorType: string, attributes: Record<string, string> = {}): void {
    errorCounter.add(1, {
      error_type: errorType,
      component: 'ai',
      provider,
      ...attributes,
    });
  }

  // UI metrics
  recordUserAction(action: string, component: string, attributes: Record<string, string> = {}): void {
    userActionCounter.add(1, {
      action,
      component,
      ...attributes,
    });
  }

  recordUIRender(component: string, renderTime: number, attributes: Record<string, string> = {}): void {
    uiRenderTimeHistogram.record(renderTime, {
      component,
      ...attributes,
    });
  }

  recordPageView(page: string, attributes: Record<string, string> = {}): void {
    userActionCounter.add(1, {
      action: 'page_view',
      page,
      ...attributes,
    });
  }

  // Network metrics
  recordNetworkRequest(method: string, url: string, latency: number, status: number): void {
    networkLatencyHistogram.record(latency, {
      method,
      url: this.sanitizeUrl(url),
      status: status.toString(),
    });
  }

  recordNetworkError(method: string, url: string, errorType: string): void {
    errorCounter.add(1, {
      error_type: errorType,
      component: 'network',
      method,
      url: this.sanitizeUrl(url),
    });
  }

  recordNetworkQuality(quality: number, attributes: Record<string, string> = {}): void {
    networkQualityGauge.add(quality, attributes);
  }

  // System metrics
  recordMemoryUsage(usage: number): void {
    memoryUsageGauge.add(usage);
  }

  recordCPUUsage(usage: number): void {
    // CPU usage gauge (would be implemented when available)
    console.debug('CPU usage:', usage);
  }

  recordActiveUsers(count: number): void {
    activeUsersGauge.add(count);
  }

  recordActiveMeetings(count: number): void {
    activeMeetingsGauge.add(count);
  }

  // Error metrics
  recordError(type: string, severity: string, component: string, attributes: Record<string, string> = {}): void {
    errorCounter.add(1, {
      error_type: type,
      severity,
      component,
      ...attributes,
    });
  }

  // Utility methods
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url.replace(/[?#].*/, ''); // Remove query params and fragments
    }
  }
}

/**
 * Performance metrics collector
 */
export class PerformanceMetricsCollector {
  private reporter: MetricsReporter;
  private collectInterval: number;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(reporter: MetricsReporter, collectInterval: number = 5000) {
    this.reporter = reporter;
    this.collectInterval = collectInterval;
  }

  /**
   * Start collecting performance metrics
   */
  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.collectInterval);

    // Initial collection
    this.collectMetrics();
  }

  /**
   * Stop collecting performance metrics
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Collect current performance metrics
   */
  private collectMetrics(): void {
    if (typeof window === 'undefined') return;

    // Memory metrics
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.reporter.recordMemoryUsage(memory.usedJSHeapSize);
    }

    // Navigation timing metrics
    if ('getEntriesByType' in performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        const loadTime = navigation.loadEventEnd - navigation.navigationStart;
        this.reporter.recordUIRender('page_load', loadTime, {
          type: 'page_load'
        });
      }
    }

    // Resource timing metrics
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    resources.slice(-10).forEach(resource => { // Only process last 10 resources
      const duration = resource.responseEnd - resource.requestStart;
      this.reporter.recordNetworkRequest(
        'GET', // Simplified - actual method might not be available
        resource.name,
        duration,
        200 // Simplified - actual status might not be available
      );
    });

    // Clear processed entries to prevent memory leaks
    performance.clearResourceTimings();
  }
}

/**
 * Business metrics collector for application-specific metrics
 */
export class BusinessMetricsCollector {
  private reporter: MetricsReporter;

  constructor(reporter: MetricsReporter) {
    this.reporter = reporter;
  }

  /**
   * Record meeting lifecycle events
   */
  recordMeetingLifecycle(event: 'created' | 'started' | 'ended' | 'error', data: Record<string, unknown>): void {
    switch (event) {
      case 'created':
        this.reporter.recordMeetingCreated({
          type: data.type || 'standard',
          participant_count: data.participantCount?.toString() || '0',
        });
        break;
      case 'ended':
        this.reporter.recordMeetingEnded(data.duration || 0, {
          participant_count: data.participantCount?.toString() || '0',
          had_recording: data.hadRecording ? 'true' : 'false',
          had_transcription: data.hadTranscription ? 'true' : 'false',
        });
        break;
      case 'error':
        this.reporter.recordMeetingError(data.errorType || 'unknown', {
          phase: data.phase || 'unknown',
        });
        break;
    }
  }

  /**
   * Record audio quality metrics over time
   */
  recordAudioQualityMetrics(metrics: {
    latency: number;
    quality: number;
    snr: number;
    stability: number;
  }): void {
    this.reporter.recordAudioLatency(metrics.latency);
    this.reporter.recordAudioQuality(metrics.quality, {
      snr: metrics.snr.toString(),
      stability: metrics.stability.toString(),
    });
  }

  /**
   * Record AI service usage and performance
   */
  recordAIUsage(provider: string, model: string, taskType: string, metrics: {
    responseTime: number;
    tokenCount?: number;
    cost?: number;
    success: boolean;
  }): void {
    this.reporter.recordAIRequest(provider, model, {
      task_type: taskType,
    });

    if (metrics.success) {
      this.reporter.recordAIResponse(metrics.responseTime, provider, {
        model,
        task_type: taskType,
        token_count: metrics.tokenCount?.toString() || '0',
        cost: metrics.cost?.toString() || '0',
      });
    } else {
      this.reporter.recordAIError(provider, 'request_failed', {
        model,
        task_type: taskType,
      });
    }
  }

  /**
   * Record user engagement metrics
   */
  recordUserEngagement(action: string, context: Record<string, any>): void {
    this.reporter.recordUserAction(action, context.component || 'unknown', {
      view: context.view || 'unknown',
      duration: context.duration?.toString() || '0',
    });
  }
}

// Global metrics instances
let metricsReporter: MetricsReporter | null = null;
let performanceCollector: PerformanceMetricsCollector | null = null;
let businessCollector: BusinessMetricsCollector | null = null;

/**
 * Initialize metrics collection
 */
export function initializeMetrics(reporter?: MetricsReporter): {
  reporter: MetricsReporter;
  performanceCollector: PerformanceMetricsCollector;
  businessCollector: BusinessMetricsCollector;
} {
  if (!metricsReporter) {
    metricsReporter = reporter || new DefaultMetricsReporter();
    performanceCollector = new PerformanceMetricsCollector(metricsReporter);
    businessCollector = new BusinessMetricsCollector(metricsReporter);

    // Start performance collection in browser
    if (typeof window !== 'undefined') {
      performanceCollector.start();
    }
  }

  return {
    reporter: metricsReporter,
    performanceCollector: performanceCollector!,
    businessCollector: businessCollector!,
  };
}

/**
 * Get global metrics instances
 */
export function getMetrics(): {
  reporter: MetricsReporter | null;
  performanceCollector: PerformanceMetricsCollector | null;
  businessCollector: BusinessMetricsCollector | null;
} {
  return {
    reporter: metricsReporter,
    performanceCollector,
    businessCollector,
  };
}

/**
 * Shutdown metrics collection
 */
export function shutdownMetrics(): void {
  if (performanceCollector) {
    performanceCollector.stop();
  }
  
  metricsReporter = null;
  performanceCollector = null;
  businessCollector = null;
}

export { meter };