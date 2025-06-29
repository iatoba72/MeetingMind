/**
 * Distributed Tracing Utilities
 * Provides high-level tracing abstractions and custom instrumentation
 */

import { trace, context, SpanStatusCode, SpanKind, Span } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

// Custom trace attributes for MeetingMind
export const MeetingMindAttributes = {
  // Meeting attributes
  MEETING_ID: 'meetingmind.meeting.id',
  MEETING_TITLE: 'meetingmind.meeting.title',
  MEETING_DURATION: 'meetingmind.meeting.duration',
  MEETING_PARTICIPANT_COUNT: 'meetingmind.meeting.participant_count',
  MEETING_STATUS: 'meetingmind.meeting.status',
  
  // Audio attributes
  AUDIO_DEVICE_ID: 'meetingmind.audio.device_id',
  AUDIO_SAMPLE_RATE: 'meetingmind.audio.sample_rate',
  AUDIO_CHANNELS: 'meetingmind.audio.channels',
  AUDIO_QUALITY_SCORE: 'meetingmind.audio.quality_score',
  AUDIO_LATENCY: 'meetingmind.audio.latency',
  
  // AI attributes
  AI_PROVIDER: 'meetingmind.ai.provider',
  AI_MODEL: 'meetingmind.ai.model',
  AI_TASK_TYPE: 'meetingmind.ai.task_type',
  AI_CONFIDENCE: 'meetingmind.ai.confidence',
  AI_TOKEN_COUNT: 'meetingmind.ai.token_count',
  AI_COST: 'meetingmind.ai.cost',
  
  // Streaming attributes
  STREAM_TYPE: 'meetingmind.stream.type',
  STREAM_URL: 'meetingmind.stream.url',
  STREAM_BITRATE: 'meetingmind.stream.bitrate',
  STREAM_RESOLUTION: 'meetingmind.stream.resolution',
  STREAM_FPS: 'meetingmind.stream.fps',
  
  // Recording attributes
  RECORDING_FORMAT: 'meetingmind.recording.format',
  RECORDING_QUALITY: 'meetingmind.recording.quality',
  RECORDING_SIZE: 'meetingmind.recording.size',
  RECORDING_DURATION: 'meetingmind.recording.duration',
  
  // UI attributes
  UI_COMPONENT: 'meetingmind.ui.component',
  UI_ACTION: 'meetingmind.ui.action',
  UI_VIEW: 'meetingmind.ui.view',
  UI_RENDER_TIME: 'meetingmind.ui.render_time',
  
  // Error attributes
  ERROR_COMPONENT: 'meetingmind.error.component',
  ERROR_TYPE: 'meetingmind.error.type',
  ERROR_SEVERITY: 'meetingmind.error.severity',
  ERROR_CONTEXT: 'meetingmind.error.context',
} as const;

// Tracer instance
const tracer = trace.getTracer('meetingmind-frontend', '1.0.0');

/**
 * Span configuration options
 */
export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  links?: Array<Record<string, unknown>>;
  startTime?: Date;
}

/**
 * Create and manage a traced operation
 */
export class TracedOperation {
  private span: Span;
  private startTime: number;

  constructor(
    name: string,
    options: SpanOptions = {}
  ) {
    this.startTime = performance.now();
    this.span = tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes,
      links: options.links,
      startTime: options.startTime,
    });
  }

  /**
   * Add attributes to the span
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void {
    this.span.setAttributes(attributes);
  }

  /**
   * Add a single attribute
   */
  setAttribute(key: string, value: string | number | boolean): void {
    this.span.setAttribute(key, value);
  }

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.span.addEvent(name, attributes);
  }

  /**
   * Mark the operation as successful
   */
  setSuccess(): void {
    this.span.setStatus({ code: SpanStatusCode.OK });
  }

  /**
   * Mark the operation as failed
   */
  setError(error: Error | string, attributes?: Record<string, string | number | boolean>): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });

    this.span.setAttributes({
      'error.message': errorMessage,
      'error.name': error instanceof Error ? error.name : 'Error',
      ...(errorStack && { 'error.stack': errorStack }),
      ...attributes,
    });

    this.addEvent('error', {
      'error.message': errorMessage,
      ...attributes,
    });
  }

  /**
   * Get the span context for linking
   */
  getContext() {
    return trace.setSpan(context.active(), this.span);
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Finish the operation
   */
  finish(): void {
    const duration = this.getElapsedTime();
    this.span.setAttribute('operation.duration_ms', duration);
    this.span.end();
  }

  /**
   * Execute a function within this span context
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return context.with(this.getContext(), async () => {
      try {
        const result = await fn();
        this.setSuccess();
        return result;
      } catch (error) {
        this.setError(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        this.finish();
      }
    });
  }
}

/**
 * High-level tracing functions for common operations
 */
export class MeetingMindTracer {
  /**
   * Trace a meeting operation
   */
  static traceMeetingOperation<T>(
    operationType: string,
    meetingId: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`meeting.${operationType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        [MeetingMindAttributes.MEETING_ID]: meetingId,
        'operation.type': operationType,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace an audio operation
   */
  static traceAudioOperation<T>(
    operationType: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`audio.${operationType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'operation.type': operationType,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace an AI operation
   */
  static traceAIOperation<T>(
    operationType: string,
    provider: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`ai.${operationType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        [MeetingMindAttributes.AI_PROVIDER]: provider,
        'operation.type': operationType,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace a streaming operation
   */
  static traceStreamingOperation<T>(
    operationType: string,
    streamType: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`streaming.${operationType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        [MeetingMindAttributes.STREAM_TYPE]: streamType,
        'operation.type': operationType,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace a recording operation
   */
  static traceRecordingOperation<T>(
    operationType: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`recording.${operationType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'operation.type': operationType,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace a UI operation
   */
  static traceUIOperation<T>(
    component: string,
    action: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`ui.${component}.${action}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        [MeetingMindAttributes.UI_COMPONENT]: component,
        [MeetingMindAttributes.UI_ACTION]: action,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace an HTTP request
   */
  static traceHttpRequest<T>(
    method: string,
    url: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const operation = new TracedOperation(`http.${method.toLowerCase()}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        [SemanticAttributes.HTTP_METHOD]: method,
        [SemanticAttributes.HTTP_URL]: url,
        ...attributes,
      },
    });

    return operation.execute(() => fn(operation));
  }

  /**
   * Trace a database operation
   */
  static traceDatabaseOperation<T>(
    operation: string,
    table: string,
    fn: (operation: TracedOperation) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const tracedOp = new TracedOperation(`db.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        [SemanticAttributes.DB_OPERATION]: operation,
        [SemanticAttributes.DB_SQL_TABLE]: table,
        ...attributes,
      },
    });

    return tracedOp.execute(() => fn(tracedOp));
  }
}

/**
 * Decorator for tracing class methods
 */
export function Traced(
  spanName?: string,
  attributes?: Record<string, unknown>
) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const finalSpanName = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: unknown[]) {
      const operation = new TracedOperation(finalSpanName, {
        attributes: {
          'method.class': target.constructor.name,
          'method.name': propertyKey,
          ...attributes,
        },
      });

      return operation.execute(async () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * Trace a synchronous function
 */
export function traceSync<T>(
  spanName: string,
  fn: (operation: TracedOperation) => T,
  attributes: Record<string, any> = {}
): T {
  const operation = new TracedOperation(spanName, { attributes });
  
  try {
    const result = fn(operation);
    operation.setSuccess();
    return result;
  } catch (error) {
    operation.setError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    operation.finish();
  }
}

/**
 * Trace an asynchronous function
 */
export async function traceAsync<T>(
  spanName: string,
  fn: (operation: TracedOperation) => Promise<T>,
  attributes: Record<string, any> = {}
): Promise<T> {
  const operation = new TracedOperation(spanName, { attributes });
  return operation.execute(fn);
}

/**
 * Get the current trace ID for correlation
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  
  const spanContext = span.spanContext();
  return spanContext.traceId;
}

/**
 * Get the current span ID
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  
  const spanContext = span.spanContext();
  return spanContext.spanId;
}

/**
 * Add correlation IDs to HTTP headers
 */
export function addTraceHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const traceId = getCurrentTraceId();
  const spanId = getCurrentSpanId();
  
  if (traceId) {
    headers['x-trace-id'] = traceId;
  }
  
  if (spanId) {
    headers['x-span-id'] = spanId;
  }
  
  return headers;
}

export { TracedOperation, tracer };