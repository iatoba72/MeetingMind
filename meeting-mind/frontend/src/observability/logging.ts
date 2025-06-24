/**
 * Enhanced Logging System
 * Provides structured logging with correlation IDs and observability integration
 */

import { getCurrentTraceId, getCurrentSpanId } from './tracing';

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

// Log context interface
export interface LogContext {
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  meetingId?: string;
  component?: string;
  operation?: string;
  [key: string]: any;
}

// Log entry interface
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    duration?: number;
    memory?: number;
    cpu?: number;
  };
}

// Logger configuration
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  remoteEndpoint?: string;
  maxBatchSize: number;
  flushInterval: number;
  includeStackTrace: boolean;
  sanitizeFields: string[];
  contextFields: string[];
}

// Default logger configuration
const defaultConfig: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableRemote: process.env.NODE_ENV === 'production',
  remoteEndpoint: process.env.REACT_APP_LOG_ENDPOINT,
  maxBatchSize: 100,
  flushInterval: 5000,
  includeStackTrace: true,
  sanitizeFields: ['password', 'token', 'secret', 'key', 'authorization'],
  contextFields: ['userId', 'sessionId', 'meetingId', 'component', 'operation'],
};

/**
 * Enhanced Logger class with observability integration
 */
export class Logger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private defaultContext: LogContext = {};

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.startFlushTimer();
  }

  /**
   * Set default context for all log entries
   */
  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Update default context
   */
  updateDefaultContext(context: Partial<LogContext>): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Clear default context
   */
  clearDefaultContext(): void {
    this.defaultContext = {};
  }

  /**
   * Log an error
   */
  error(message: string, error?: Error, context: LogContext = {}): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log a warning
   */
  warn(message: string, context: LogContext = {}): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context: LogContext = {}): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a debug message
   */
  debug(message: string, context: LogContext = {}): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log a trace message
   */
  trace(message: string, context: LogContext = {}): void {
    this.log(LogLevel.TRACE, message, context);
  }

  /**
   * Log with performance metrics
   */
  perf(message: string, duration: number, context: LogContext = {}): void {
    this.log(LogLevel.INFO, message, context, undefined, {
      duration,
      memory: this.getMemoryUsage(),
    });
  }

  /**
   * Log a user action
   */
  userAction(action: string, component: string, context: LogContext = {}): void {
    this.info(`User action: ${action}`, {
      ...context,
      component,
      operation: action,
      type: 'user_action',
    });
  }

  /**
   * Log a system event
   */
  systemEvent(event: string, context: LogContext = {}): void {
    this.info(`System event: ${event}`, {
      ...context,
      type: 'system_event',
      event,
    });
  }

  /**
   * Log an API request
   */
  apiRequest(method: string, url: string, duration: number, status: number, context: LogContext = {}): void {
    const level = status >= 400 ? LogLevel.WARN : LogLevel.INFO;
    this.log(level, `API ${method} ${url}`, {
      ...context,
      type: 'api_request',
      method,
      url: this.sanitizeUrl(url),
      status: status.toString(),
    }, undefined, { duration });
  }

  /**
   * Log a business event
   */
  businessEvent(event: string, data: any, context: LogContext = {}): void {
    this.info(`Business event: ${event}`, {
      ...context,
      type: 'business_event',
      event,
      data: this.sanitizeData(data),
    });
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context: LogContext = {},
    error?: Error,
    performance?: { duration?: number; memory?: number; cpu?: number }
  ): void {
    if (level > this.config.level) return;

    // Build context with correlation IDs
    const enrichedContext: LogContext = {
      ...this.defaultContext,
      ...context,
      traceId: getCurrentTraceId() || context.traceId,
      spanId: getCurrentSpanId() || context.spanId,
    };

    // Create log entry
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.sanitizeContext(enrichedContext),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          ...(this.config.includeStackTrace && { stack: error.stack }),
        },
      }),
      ...(performance && { performance }),
    };

    // Console logging
    if (this.config.enableConsole) {
      this.logToConsole(logEntry);
    }

    // Buffer for remote logging
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.logBuffer.push(logEntry);
      
      if (this.logBuffer.length >= this.config.maxBatchSize) {
        this.flush();
      }
    }
  }

  /**
   * Log to console with appropriate formatting
   */
  private logToConsole(entry: LogEntry): void {
    const { timestamp, level, message, context, error, performance } = entry;
    const levelName = LogLevel[level];
    const contextStr = Object.keys(context).length > 0 ? JSON.stringify(context, null, 2) : '';
    const perfStr = performance ? `[${performance.duration}ms]` : '';
    
    const fullMessage = `[${timestamp}] ${levelName} ${perfStr} ${message}${contextStr ? '\nContext: ' + contextStr : ''}`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(fullMessage, error);
        break;
      case LogLevel.WARN:
        console.warn(fullMessage);
        break;
      case LogLevel.INFO:
        console.info(fullMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(fullMessage);
        break;
      case LogLevel.TRACE:
        console.trace(fullMessage);
        break;
    }
  }

  /**
   * Flush logs to remote endpoint
   */
  private async flush(): Promise<void> {
    if (!this.config.remoteEndpoint || this.logBuffer.length === 0) return;

    const logs = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-Id': getCurrentTraceId() || '',
        },
        body: JSON.stringify({ logs }),
      });

      if (!response.ok) {
        console.warn(`Failed to send logs: ${response.status} ${response.statusText}`);
        // Re-add logs to buffer for retry (with limit to prevent memory issues)
        if (this.logBuffer.length < this.config.maxBatchSize * 2) {
          this.logBuffer.unshift(...logs);
        }
      }
    } catch (error) {
      console.warn('Error sending logs to remote endpoint:', error);
      // Re-add logs to buffer for retry
      if (this.logBuffer.length < this.config.maxBatchSize * 2) {
        this.logBuffer.unshift(...logs);
      }
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Sanitize context data
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized = { ...context };
    
    this.config.sanitizeFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize arbitrary data
   */
  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) return data;

    const sanitized = { ...data };
    
    this.config.sanitizeFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize URL (remove sensitive query parameters)
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Remove sensitive query parameters
      this.config.sanitizeFields.forEach(field => {
        urlObj.searchParams.delete(field);
      });
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger(this.config);
    childLogger.setDefaultContext({ ...this.defaultContext, ...context });
    return childLogger;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Check if a level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  /**
   * Shutdown logger
   */
  async shutdown(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }
}

/**
 * Logger factory for creating component-specific loggers
 */
export class LoggerFactory {
  private static defaultLogger: Logger;
  private static loggers: Map<string, Logger> = new Map();

  /**
   * Initialize the default logger
   */
  static initialize(config: Partial<LoggerConfig> = {}): Logger {
    if (!this.defaultLogger) {
      this.defaultLogger = new Logger(config);
    }
    return this.defaultLogger;
  }

  /**
   * Get or create a logger for a specific component
   */
  static getLogger(component: string, context: LogContext = {}): Logger {
    const key = `${component}:${JSON.stringify(context)}`;
    
    if (!this.loggers.has(key)) {
      const logger = this.getDefaultLogger().child({
        component,
        ...context,
      });
      this.loggers.set(key, logger);
    }

    return this.loggers.get(key)!;
  }

  /**
   * Get the default logger
   */
  static getDefaultLogger(): Logger {
    if (!this.defaultLogger) {
      this.defaultLogger = new Logger();
    }
    return this.defaultLogger;
  }

  /**
   * Shutdown all loggers
   */
  static async shutdown(): Promise<void> {
    if (this.defaultLogger) {
      await this.defaultLogger.shutdown();
    }

    for (const logger of this.loggers.values()) {
      await logger.shutdown();
    }

    this.loggers.clear();
  }
}

// Global logger instance
export const logger = LoggerFactory.getDefaultLogger();

// Convenience functions for global logging
export const log = {
  error: (message: string, error?: Error, context?: LogContext) => logger.error(message, error, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  trace: (message: string, context?: LogContext) => logger.trace(message, context),
  perf: (message: string, duration: number, context?: LogContext) => logger.perf(message, duration, context),
  userAction: (action: string, component: string, context?: LogContext) => logger.userAction(action, component, context),
  systemEvent: (event: string, context?: LogContext) => logger.systemEvent(event, context),
  apiRequest: (method: string, url: string, duration: number, status: number, context?: LogContext) => 
    logger.apiRequest(method, url, duration, status, context),
  businessEvent: (event: string, data: any, context?: LogContext) => logger.businessEvent(event, data, context),
};

export default Logger;