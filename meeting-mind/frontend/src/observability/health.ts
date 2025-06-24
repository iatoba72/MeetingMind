/**
 * System Health Monitoring and Diagnostics
 * Provides comprehensive health checks and system monitoring
 */

import { getCurrentTraceId } from './tracing';
import { logger } from './logging';
import { getMetrics } from './metrics';

// Health check status
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

// Health check result
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, any>;
  duration: number;
  timestamp: Date;
  critical: boolean;
}

// System health summary
export interface SystemHealthSummary {
  overall: HealthStatus;
  score: number; // 0-100
  checks: HealthCheckResult[];
  timestamp: Date;
  traceId?: string;
  recommendations: string[];
}

// Health check interface
export interface HealthCheck {
  name: string;
  critical: boolean;
  timeout: number;
  execute(): Promise<HealthCheckResult>;
}

// System metrics for health evaluation
export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  performance: {
    fps: number;
    renderTime: number;
    cpuUsage?: number;
  };
  network: {
    latency: number;
    bandwidth: number;
    quality: number;
  };
  errors: {
    total: number;
    critical: number;
    lastHour: number;
  };
  audio: {
    quality: number;
    latency: number;
    deviceStatus: string;
  };
  storage: {
    used: number;
    available: number;
    percentage: number;
  };
}

/**
 * Memory health check
 */
export class MemoryHealthCheck implements HealthCheck {
  name = 'memory';
  critical = true;
  timeout = 1000;

  async execute(): Promise<HealthCheckResult> {
    const start = performance.now();
    
    try {
      const memory = this.getMemoryInfo();
      const duration = performance.now() - start;
      
      let status = HealthStatus.HEALTHY;
      let message = 'Memory usage is normal';
      
      if (memory.percentage > 90) {
        status = HealthStatus.UNHEALTHY;
        message = 'Memory usage is critically high';
      } else if (memory.percentage > 75) {
        status = HealthStatus.DEGRADED;
        message = 'Memory usage is elevated';
      }
      
      return {
        name: this.name,
        status,
        message,
        details: memory,
        duration,
        timestamp: new Date(),
        critical: this.critical,
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNKNOWN,
        message: `Memory check failed: ${error}`,
        duration: performance.now() - start,
        timestamp: new Date(),
        critical: this.critical,
      };
    }
  }

  private getMemoryInfo(): { used: number; total: number; percentage: number } {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      };
    }
    
    return { used: 0, total: 0, percentage: 0 };
  }
}

/**
 * Performance health check
 */
export class PerformanceHealthCheck implements HealthCheck {
  name = 'performance';
  critical = false;
  timeout = 2000;

  async execute(): Promise<HealthCheckResult> {
    const start = performance.now();
    
    try {
      const metrics = await this.getPerformanceMetrics();
      const duration = performance.now() - start;
      
      let status = HealthStatus.HEALTHY;
      let message = 'Performance is good';
      
      if (metrics.fps < 20 || metrics.renderTime > 100) {
        status = HealthStatus.UNHEALTHY;
        message = 'Performance is poor';
      } else if (metrics.fps < 40 || metrics.renderTime > 50) {
        status = HealthStatus.DEGRADED;
        message = 'Performance is below optimal';
      }
      
      return {
        name: this.name,
        status,
        message,
        details: metrics,
        duration,
        timestamp: new Date(),
        critical: this.critical,
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNKNOWN,
        message: `Performance check failed: ${error}`,
        duration: performance.now() - start,
        timestamp: new Date(),
        critical: this.critical,
      };
    }
  }

  private async getPerformanceMetrics(): Promise<{ fps: number; renderTime: number }> {
    return new Promise((resolve) => {
      let frames = 0;
      const startTime = performance.now();
      
      const measureFrame = () => {
        frames++;
        if (frames < 60) {
          requestAnimationFrame(measureFrame);
        } else {
          const endTime = performance.now();
          const fps = (frames * 1000) / (endTime - startTime);
          const renderTime = (endTime - startTime) / frames;
          resolve({ fps, renderTime });
        }
      };
      
      requestAnimationFrame(measureFrame);
    });
  }
}

/**
 * Network health check
 */
export class NetworkHealthCheck implements HealthCheck {
  name = 'network';
  critical = false;
  timeout = 5000;

  async execute(): Promise<HealthCheckResult> {
    const start = performance.now();
    
    try {
      const metrics = await this.getNetworkMetrics();
      const duration = performance.now() - start;
      
      let status = HealthStatus.HEALTHY;
      let message = 'Network connectivity is good';
      
      if (metrics.latency > 1000 || metrics.quality < 0.5) {
        status = HealthStatus.UNHEALTHY;
        message = 'Network connectivity is poor';
      } else if (metrics.latency > 500 || metrics.quality < 0.8) {
        status = HealthStatus.DEGRADED;
        message = 'Network connectivity is below optimal';
      }
      
      return {
        name: this.name,
        status,
        message,
        details: metrics,
        duration,
        timestamp: new Date(),
        critical: this.critical,
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        message: `Network check failed: ${error}`,
        duration: performance.now() - start,
        timestamp: new Date(),
        critical: this.critical,
      };
    }
  }

  private async getNetworkMetrics(): Promise<{ latency: number; bandwidth: number; quality: number }> {
    const start = performance.now();
    
    try {
      // Simple connectivity test
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache',
      });
      
      const latency = performance.now() - start;
      const quality = response.ok ? 1.0 : 0.0;
      
      return {
        latency,
        bandwidth: 0, // Would need more sophisticated testing
        quality,
      };
    } catch {
      return {
        latency: 9999,
        bandwidth: 0,
        quality: 0,
      };
    }
  }
}

/**
 * Audio system health check
 */
export class AudioHealthCheck implements HealthCheck {
  name = 'audio';
  critical = true;
  timeout = 3000;

  async execute(): Promise<HealthCheckResult> {
    const start = performance.now();
    
    try {
      const audioStatus = await this.checkAudioSystem();
      const duration = performance.now() - start;
      
      let status = HealthStatus.HEALTHY;
      let message = 'Audio system is working properly';
      
      if (!audioStatus.deviceAvailable || audioStatus.quality < 0.5) {
        status = HealthStatus.UNHEALTHY;
        message = 'Audio system has critical issues';
      } else if (audioStatus.latency > 100 || audioStatus.quality < 0.8) {
        status = HealthStatus.DEGRADED;
        message = 'Audio system performance is degraded';
      }
      
      return {
        name: this.name,
        status,
        message,
        details: audioStatus,
        duration,
        timestamp: new Date(),
        critical: this.critical,
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        message: `Audio check failed: ${error}`,
        duration: performance.now() - start,
        timestamp: new Date(),
        critical: this.critical,
      };
    }
  }

  private async checkAudioSystem(): Promise<{
    deviceAvailable: boolean;
    permission: string;
    latency: number;
    quality: number;
  }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(d => d.kind === 'audioinput');
      
      let permission = 'unknown';
      let latency = 0;
      let quality = 0;
      
      if (audioDevices.length > 0) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          permission = 'granted';
          
          // Simple latency test
          const start = performance.now();
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(stream);
          latency = performance.now() - start;
          quality = 1.0; // Simplified quality assessment
          
          // Cleanup
          stream.getTracks().forEach(track => track.stop());
          await audioContext.close();
        } catch {
          permission = 'denied';
        }
      }
      
      return {
        deviceAvailable: audioDevices.length > 0,
        permission,
        latency,
        quality,
      };
    } catch (error) {
      throw new Error(`Audio system check failed: ${error}`);
    }
  }
}

/**
 * Error rate health check
 */
export class ErrorRateHealthCheck implements HealthCheck {
  name = 'errors';
  critical = false;
  timeout = 1000;

  async execute(): Promise<HealthCheckResult> {
    const start = performance.now();
    
    try {
      const errorMetrics = this.getErrorMetrics();
      const duration = performance.now() - start;
      
      let status = HealthStatus.HEALTHY;
      let message = 'Error rate is normal';
      
      if (errorMetrics.criticalErrors > 0) {
        status = HealthStatus.UNHEALTHY;
        message = 'Critical errors detected';
      } else if (errorMetrics.errorRate > 0.1) {
        status = HealthStatus.DEGRADED;
        message = 'Error rate is elevated';
      }
      
      return {
        name: this.name,
        status,
        message,
        details: errorMetrics,
        duration,
        timestamp: new Date(),
        critical: this.critical,
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNKNOWN,
        message: `Error check failed: ${error}`,
        duration: performance.now() - start,
        timestamp: new Date(),
        critical: this.critical,
      };
    }
  }

  private getErrorMetrics(): {
    totalErrors: number;
    criticalErrors: number;
    errorRate: number;
    lastHourErrors: number;
  } {
    // This would integrate with the error store
    return {
      totalErrors: 0,
      criticalErrors: 0,
      errorRate: 0,
      lastHourErrors: 0,
    };
  }
}

/**
 * System health monitor
 */
export class HealthMonitor {
  private checks: Map<string, HealthCheck> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.registerDefaultChecks();
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    this.registerCheck(new MemoryHealthCheck());
    this.registerCheck(new PerformanceHealthCheck());
    this.registerCheck(new NetworkHealthCheck());
    this.registerCheck(new AudioHealthCheck());
    this.registerCheck(new ErrorRateHealthCheck());
  }

  /**
   * Register a health check
   */
  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.lastResults.delete(name);
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<SystemHealthSummary> {
    const start = performance.now();
    const results: HealthCheckResult[] = [];
    const traceId = getCurrentTraceId();

    logger.debug('Starting health checks', { traceId, checkCount: this.checks.size });

    // Run checks in parallel with timeout
    const checkPromises = Array.from(this.checks.values()).map(async (check) => {
      try {
        const result = await Promise.race([
          check.execute(),
          this.createTimeoutResult(check),
        ]);
        
        this.lastResults.set(check.name, result);
        return result;
      } catch (error) {
        const result: HealthCheckResult = {
          name: check.name,
          status: HealthStatus.UNKNOWN,
          message: `Check execution failed: ${error}`,
          duration: 0,
          timestamp: new Date(),
          critical: check.critical,
        };
        
        this.lastResults.set(check.name, result);
        return result;
      }
    });

    const checkResults = await Promise.allSettled(checkPromises);
    
    checkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const checkName = Array.from(this.checks.keys())[index];
        results.push({
          name: checkName,
          status: HealthStatus.UNKNOWN,
          message: `Check failed: ${result.reason}`,
          duration: 0,
          timestamp: new Date(),
          critical: this.checks.get(checkName)?.critical || false,
        });
      }
    });

    const summary = this.calculateSystemHealth(results);
    summary.traceId = traceId;

    const duration = performance.now() - start;
    logger.info('Health checks completed', {
      traceId,
      overall: summary.overall,
      score: summary.score,
      duration,
      criticalIssues: results.filter(r => r.critical && r.status !== HealthStatus.HEALTHY).length,
    });

    // Report metrics
    const metrics = getMetrics();
    if (metrics.businessCollector) {
      // Record health check metrics (would need to implement this method)
      logger.systemEvent('health_check_completed', {
        overall: summary.overall,
        score: summary.score,
        duration,
      });
    }

    return summary;
  }

  /**
   * Create a timeout result for a health check
   */
  private async createTimeoutResult(check: HealthCheck): Promise<HealthCheckResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout: ${check.name}`));
      }, check.timeout);
    });
  }

  /**
   * Calculate overall system health
   */
  private calculateSystemHealth(results: HealthCheckResult[]): SystemHealthSummary {
    let score = 100;
    let overall = HealthStatus.HEALTHY;
    const recommendations: string[] = [];

    // Analyze critical checks first
    const criticalIssues = results.filter(r => r.critical && r.status !== HealthStatus.HEALTHY);
    if (criticalIssues.length > 0) {
      overall = HealthStatus.UNHEALTHY;
      score = Math.min(score, 30);
      recommendations.push('Address critical system issues immediately');
    }

    // Calculate score based on check results
    results.forEach(result => {
      switch (result.status) {
        case HealthStatus.UNHEALTHY:
          score -= result.critical ? 30 : 15;
          break;
        case HealthStatus.DEGRADED:
          score -= result.critical ? 15 : 8;
          break;
        case HealthStatus.UNKNOWN:
          score -= result.critical ? 20 : 5;
          break;
      }
    });

    score = Math.max(0, score);

    // Determine overall status
    if (overall !== HealthStatus.UNHEALTHY) {
      if (score >= 80) {
        overall = HealthStatus.HEALTHY;
      } else if (score >= 60) {
        overall = HealthStatus.DEGRADED;
        recommendations.push('Monitor system performance closely');
      } else {
        overall = HealthStatus.UNHEALTHY;
        recommendations.push('System requires immediate attention');
      }
    }

    // Add specific recommendations
    results.forEach(result => {
      if (result.status === HealthStatus.UNHEALTHY || result.status === HealthStatus.DEGRADED) {
        switch (result.name) {
          case 'memory':
            recommendations.push('Consider refreshing the application to free memory');
            break;
          case 'performance':
            recommendations.push('Close unnecessary tabs or applications');
            break;
          case 'network':
            recommendations.push('Check internet connection and try again');
            break;
          case 'audio':
            recommendations.push('Check audio device connections and permissions');
            break;
          case 'errors':
            recommendations.push('Review error logs and resolve outstanding issues');
            break;
        }
      }
    });

    return {
      overall,
      score,
      checks: results,
      timestamp: new Date(),
      recommendations: [...new Set(recommendations)], // Remove duplicates
    };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('Starting health monitoring', { interval: intervalMs });

    // Run initial check
    this.runChecks().catch(error => {
      logger.error('Initial health check failed', error);
    });

    // Set up periodic checks
    this.interval = setInterval(() => {
      this.runChecks().catch(error => {
        logger.error('Periodic health check failed', error);
      });
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    logger.info('Health monitoring stopped');
  }

  /**
   * Get last health check results
   */
  getLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const memory = this.getMemoryMetrics();
    const performance = this.getPerformanceMetrics();
    
    return {
      memory,
      performance,
      network: { latency: 0, bandwidth: 0, quality: 0 }, // Would be populated from actual checks
      errors: { total: 0, critical: 0, lastHour: 0 },
      audio: { quality: 0, latency: 0, deviceStatus: 'unknown' },
      storage: { used: 0, available: 0, percentage: 0 },
    };
  }

  private getMemoryMetrics(): SystemMetrics['memory'] {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      };
    }
    
    return { used: 0, total: 0, percentage: 0 };
  }

  private getPerformanceMetrics(): SystemMetrics['performance'] {
    return {
      fps: 60, // Would be calculated from actual measurements
      renderTime: 16, // Would be calculated from actual measurements
      cpuUsage: undefined,
    };
  }
}

// Global health monitor instance
export const healthMonitor = new HealthMonitor();

// Auto-start monitoring in browser environment
if (typeof window !== 'undefined' && process.env.REACT_APP_HEALTH_MONITORING !== 'false') {
  healthMonitor.startMonitoring(30000); // Check every 30 seconds
}

export default HealthMonitor;