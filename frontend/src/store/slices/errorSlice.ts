/**
 * Error Management Slice
 * Handles error tracking, debugging, and system health monitoring
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  ErrorState, 
  AppError,
  AppState,
  StoreActions 
} from '../types';

export interface ErrorSlice {
  // State
  errors: ErrorState;
  
  // Error management
  addError: (error: Omit<AppError, 'id' | 'timestamp' | 'isResolved'>) => string;
  updateError: (id: string, updates: Partial<AppError>) => void;
  resolveError: (id: string, resolution?: string) => void;
  dismissError: (id: string) => void;
  clearErrors: (type?: AppError['type']) => void;
  clearResolvedErrors: () => void;
  
  // Error reporting
  reportError: (error: Error, context?: Record<string, unknown>) => string;
  reportNetworkError: (url: string, status: number, message: string) => string;
  reportAPIError: (endpoint: string, error: unknown) => string;
  reportUIError: (component: string, error: Error) => string;
  
  // Error analysis
  getErrorsByType: (type: AppError['type']) => AppError[];
  getErrorsBySeverity: (severity: AppError['severity']) => AppError[];
  getUnresolvedErrors: () => AppError[];
  getCriticalErrors: () => AppError[];
  getErrorStats: () => ErrorStats;
  
  // Debug mode
  setDebugMode: (enabled: boolean) => void;
  toggleDebugMode: () => void;
  getDebugInfo: () => DebugInfo;
  
  // Error boundary
  triggerErrorBoundary: (error: Error) => void;
  resetErrorBoundary: () => void;
  
  // Logging and reporting
  exportErrorLog: () => ErrorLog;
  sendErrorReport: (errorIds: string[]) => Promise<boolean>;
  
  // Health monitoring
  checkSystemHealth: () => SystemHealth;
  monitorMemoryUsage: () => void;
  detectPerformanceIssues: () => PerformanceIssue[];
  
  // Cleanup
  cleanup: () => void;
}

export interface ErrorStats {
  total: number;
  byType: Record<AppError['type'], number>;
  bySeverity: Record<AppError['severity'], number>;
  resolved: number;
  unresolved: number;
  lastWeek: number;
  mostCommon: AppError['type'] | null;
}

export interface DebugInfo {
  userAgent: string;
  url: string;
  timestamp: Date;
  memory: {
    used: number;
    total: number;
    limit: number;
  };
  performance: {
    timing: PerformanceTiming;
    navigation: PerformanceNavigation;
  };
  errors: AppError[];
  console: string[];
}

export interface ErrorLog {
  errors: AppError[];
  stats: ErrorStats;
  debugInfo: DebugInfo;
  exportedAt: Date;
  version: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  score: number; // 0-100
  issues: HealthIssue[];
  lastCheck: Date;
}

export interface HealthIssue {
  type: 'memory' | 'performance' | 'network' | 'storage' | 'audio' | 'video';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendation?: string;
}

export interface PerformanceIssue {
  type: 'memory_leak' | 'slow_render' | 'high_cpu' | 'network_slow';
  detected: Date;
  metrics: Record<string, number>;
  suggestion: string;
}

const defaultErrorState: ErrorState = {
  errors: [],
  isErrorBoundaryTriggered: false,
  debugMode: false,
  errorReporting: true
};

const generateErrorId = () => `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Console monkey patch for debug mode
let originalConsole: Record<string, (...args: unknown[]) => void> = {};
let consoleHistory: string[] = [];

const setupConsoleCapture = () => {
  if (typeof window !== 'undefined' && !originalConsole.log) {
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
    
    ['log', 'warn', 'error', 'info'].forEach(method => {
      (console as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        consoleHistory.push(`[${method.toUpperCase()}] ${new Date().toISOString()}: ${message}`);
        
        // Keep only last 100 entries
        if (consoleHistory.length > 100) {
          consoleHistory = consoleHistory.slice(-100);
        }
        
        // Call original method
        originalConsole[method](...args);
      };
    });
  }
};

export const createErrorSlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  ErrorSlice
> = (set, get) => ({
  // Initial state
  errors: defaultErrorState,
  
  // Error management
  addError: (errorData) => {
    const id = generateErrorId();
    const error: AppError = {
      id,
      ...errorData,
      timestamp: new Date(),
      isResolved: false
    };
    
    set(produce((state: AppState) => {
      state.errors.errors.push(error);
    }));
    
    // Auto-report critical errors
    if (error.severity === 'critical' && get().errors.errorReporting) {
      setTimeout(() => get().sendErrorReport([id]), 1000);
    }
    
    // Log to console in debug mode
    if (get().errors.debugMode) {
      console.error('Error added:', error);
    }
    
    return id;
  },
  
  updateError: (id, updates) => {
    set(produce((state: AppState) => {
      const error = state.errors.errors.find(e => e.id === id);
      if (error) {
        Object.assign(error, updates);
      }
    }));
  },
  
  resolveError: (id, resolution) => {
    set(produce((state: AppState) => {
      const error = state.errors.errors.find(e => e.id === id);
      if (error) {
        error.isResolved = true;
        if (resolution) {
          error.resolution = resolution;
        }
      }
    }));
  },
  
  dismissError: (id) => {
    set(produce((state: AppState) => {
      state.errors.errors = state.errors.errors.filter(e => e.id !== id);
    }));
  },
  
  clearErrors: (type) => {
    set(produce((state: AppState) => {
      if (type) {
        state.errors.errors = state.errors.errors.filter(e => e.type !== type);
      } else {
        state.errors.errors = [];
      }
    }));
  },
  
  clearResolvedErrors: () => {
    set(produce((state: AppState) => {
      state.errors.errors = state.errors.errors.filter(e => !e.isResolved);
    }));
  },
  
  // Error reporting
  reportError: (error, context) => {
    return get().addError({
      type: 'system',
      severity: 'high',
      message: error.message,
      details: error.name,
      stack: error.stack,
      context
    });
  },
  
  reportNetworkError: (url, status, message) => {
    return get().addError({
      type: 'network',
      severity: status >= 500 ? 'high' : 'medium',
      message: `Network error: ${message}`,
      details: `${status} - ${url}`,
      context: { url, status, type: 'network' }
    });
  },
  
  reportAPIError: (endpoint, error) => {
    return get().addError({
      type: 'network',
      severity: 'medium',
      message: `API error: ${endpoint}`,
      details: error.message || String(error),
      context: { endpoint, error, type: 'api' }
    });
  },
  
  reportUIError: (component, error) => {
    return get().addError({
      type: 'ui',
      severity: 'medium',
      message: `UI error in ${component}`,
      details: error.message,
      stack: error.stack,
      context: { component, type: 'ui' }
    });
  },
  
  // Error analysis
  getErrorsByType: (type) => {
    return get().errors.errors.filter(e => e.type === type);
  },
  
  getErrorsBySeverity: (severity) => {
    return get().errors.errors.filter(e => e.severity === severity);
  },
  
  getUnresolvedErrors: () => {
    return get().errors.errors.filter(e => !e.isResolved);
  },
  
  getCriticalErrors: () => {
    return get().errors.errors.filter(e => e.severity === 'critical' && !e.isResolved);
  },
  
  getErrorStats: () => {
    const { errors } = get().errors;
    
    const byType = errors.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1;
      return acc;
    }, {} as Record<AppError['type'], number>);
    
    const bySeverity = errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<AppError['severity'], number>);
    
    const resolved = errors.filter(e => e.isResolved).length;
    const unresolved = errors.length - resolved;
    
    // Last week calculation
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const lastWeek = errors.filter(e => e.timestamp > weekAgo).length;
    
    // Most common error type
    const mostCommon = Object.entries(byType).reduce(
      (max, [type, count]) => count > max.count ? { type: type as AppError['type'], count } : max,
      { type: null as AppError['type'] | null, count: 0 }
    ).type;
    
    return {
      total: errors.length,
      byType,
      bySeverity,
      resolved,
      unresolved,
      lastWeek,
      mostCommon
    };
  },
  
  // Debug mode
  setDebugMode: (enabled) => {
    set(produce((state: AppState) => {
      state.errors.debugMode = enabled;
    }));
    
    if (enabled) {
      setupConsoleCapture();
    }
  },
  
  toggleDebugMode: () => {
    const currentMode = get().errors.debugMode;
    get().setDebugMode(!currentMode);
  },
  
  getDebugInfo: () => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory || { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 };
    
    return {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date(),
      memory: {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      },
      performance: {
        timing: performance.timing,
        navigation: performance.navigation
      },
      errors: get().errors.errors,
      console: [...consoleHistory]
    };
  },
  
  // Error boundary
  triggerErrorBoundary: (error) => {
    set(produce((state: AppState) => {
      state.errors.isErrorBoundaryTriggered = true;
    }));
    
    get().reportError(error, { type: 'error_boundary' });
  },
  
  resetErrorBoundary: () => {
    set(produce((state: AppState) => {
      state.errors.isErrorBoundaryTriggered = false;
    }));
  },
  
  // Logging and reporting
  exportErrorLog: () => {
    const stats = get().getErrorStats();
    const debugInfo = get().getDebugInfo();
    
    return {
      errors: get().errors.errors,
      stats,
      debugInfo,
      exportedAt: new Date(),
      version: '1.0.0'
    };
  },
  
  sendErrorReport: async (errorIds) => {
    try {
      const errors = get().errors.errors.filter(e => errorIds.includes(e.id));
      const debugInfo = get().getDebugInfo();
      
      // Mock API call for error reporting
      const report = {
        errors,
        debugInfo,
        timestamp: new Date().toISOString()
      };
      
      console.log('Sending error report:', report);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('Failed to send error report:', error);
      return false;
    }
  },
  
  // Health monitoring
  checkSystemHealth: () => {
    const issues: HealthIssue[] = [];
    let score = 100;
    
    // Check memory usage
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    if (memory) {
      const memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      if (memoryUsage > 0.9) {
        issues.push({
          type: 'memory',
          severity: 'critical',
          message: 'Memory usage is critically high',
          recommendation: 'Refresh the application or close other tabs'
        });
        score -= 30;
      } else if (memoryUsage > 0.7) {
        issues.push({
          type: 'memory',
          severity: 'medium',
          message: 'Memory usage is elevated',
          recommendation: 'Consider refreshing the application'
        });
        score -= 15;
      }
    }
    
    // Check error count
    const criticalErrors = get().getCriticalErrors();
    if (criticalErrors.length > 0) {
      issues.push({
        type: 'performance',
        severity: 'high',
        message: `${criticalErrors.length} critical errors detected`,
        recommendation: 'Review and resolve critical errors'
      });
      score -= 20;
    }
    
    // Check performance
    const performanceIssues = get().detectPerformanceIssues();
    if (performanceIssues.length > 0) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: `${performanceIssues.length} performance issues detected`,
        recommendation: 'Check network and system performance'
      });
      score -= 10;
    }
    
    let overall: SystemHealth['overall'];
    if (score >= 80) overall = 'healthy';
    else if (score >= 50) overall = 'degraded';
    else overall = 'critical';
    
    return {
      overall,
      score: Math.max(0, score),
      issues,
      lastCheck: new Date()
    };
  },
  
  monitorMemoryUsage: () => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    if (!memory) return;
    
    const usage = memory.usedJSHeapSize;
    const limit = memory.jsHeapSizeLimit;
    const percentage = (usage / limit) * 100;
    
    // Add memory metric to UI performance tracking
    if (get().ui?.performance) {
      get().updatePerformanceMetrics({
        memoryUsage: usage
      });
    }
    
    // Report if memory usage is concerning
    if (percentage > 85) {
      get().addError({
        type: 'system',
        severity: 'high',
        message: 'High memory usage detected',
        details: `Memory usage: ${(usage / 1024 / 1024).toFixed(2)}MB (${percentage.toFixed(1)}%)`,
        context: { memoryUsage: usage, memoryLimit: limit, percentage }
      });
    }
  },
  
  detectPerformanceIssues: () => {
    const issues: PerformanceIssue[] = [];
    
    // Check for slow render times
    const renderTime = get().ui?.performance?.renderTime || 0;
    if (renderTime > 100) {
      issues.push({
        type: 'slow_render',
        detected: new Date(),
        metrics: { renderTime },
        suggestion: 'Consider optimizing component renders or reducing complexity'
      });
    }
    
    // Check FPS
    const fps = get().ui?.performance?.fps || 60;
    if (fps < 30) {
      issues.push({
        type: 'high_cpu',
        detected: new Date(),
        metrics: { fps },
        suggestion: 'High CPU usage detected - check for resource-intensive operations'
      });
    }
    
    return issues;
  },
  
  // Cleanup
  cleanup: () => {
    // Restore original console if captured
    if (originalConsole.log) {
      Object.assign(console, originalConsole);
      originalConsole = {};
    }
    
    // Clear console history
    consoleHistory = [];
    
    // Reset error state
    set(produce((state: AppState) => {
      state.errors = { ...defaultErrorState };
    }));
  }
});