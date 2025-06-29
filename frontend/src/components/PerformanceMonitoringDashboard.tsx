// Performance Monitoring Dashboard
// Real-time performance metrics and system health monitoring

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Monitor,
  Gauge,
  RefreshCw,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Calendar,
  Info
} from 'lucide-react';
import { cacheManager } from '../utils/CacheManager';
import { optimizedWebSocketService } from '../services/OptimizedWebSocketService';

interface PerformanceMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  history: number[];
  timestamp: number;
  threshold: {
    warning: number;
    critical: number;
  };
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  score: number;
  issues: string[];
  recommendations: string[];
}

interface PerformanceData {
  metrics: PerformanceMetric[];
  systemHealth: SystemHealth;
  lastUpdated: number;
}

interface DashboardConfig {
  autoRefresh: boolean;
  refreshInterval: number;
  showAllMetrics: boolean;
  alertThresholds: { [key: string]: number };
  chartTimeRange: number;
  compactView: boolean;
}

export const PerformanceMonitoringDashboard: React.FC<{
  className?: string;
  onMetricClick?: (metric: PerformanceMetric) => void;
  showControls?: boolean;
  initialConfig?: Partial<DashboardConfig>;
}> = ({
  className = '',
  onMetricClick,
  showControls = true,
  initialConfig = {}
}) => {
  // State
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<DashboardConfig>({
    autoRefresh: true,
    refreshInterval: 5000,
    showAllMetrics: true,
    alertThresholds: {},
    chartTimeRange: 300000, // 5 minutes
    compactView: false,
    ...initialConfig
  });
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Performance monitoring functions
  const collectPerformanceMetrics = useCallback(async (): Promise<PerformanceData> => {
    const metrics: PerformanceMetric[] = [];
    const now = Date.now();

    // Memory metrics
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      metrics.push({
        id: 'js_heap_used',
        name: 'JS Heap Used',
        value: Math.round(memInfo.usedJSHeapSize / 1024 / 1024),
        unit: 'MB',
        status: memInfo.usedJSHeapSize > 100 * 1024 * 1024 ? 'warning' : 'good',
        trend: 'stable',
        history: [],
        timestamp: now,
        threshold: { warning: 100, critical: 200 }
      });

      metrics.push({
        id: 'js_heap_total',
        name: 'JS Heap Total',
        value: Math.round(memInfo.totalJSHeapSize / 1024 / 1024),
        unit: 'MB',
        status: memInfo.totalJSHeapSize > 150 * 1024 * 1024 ? 'warning' : 'good',
        trend: 'stable',
        history: [],
        timestamp: now,
        threshold: { warning: 150, critical: 300 }
      });
    }

    // Network metrics
    const wsStats = optimizedWebSocketService.getStats();
    metrics.push({
      id: 'websocket_latency',
      name: 'WebSocket Latency',
      value: Math.round(wsStats.averageLatency),
      unit: 'ms',
      status: wsStats.averageLatency > 200 ? 'warning' : wsStats.averageLatency > 500 ? 'critical' : 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 200, critical: 500 }
    });

    metrics.push({
      id: 'websocket_messages',
      name: 'Messages/sec',
      value: wsStats.messagesSent + wsStats.messagesReceived,
      unit: '/sec',
      status: 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 1000, critical: 2000 }
    });

    // Cache metrics
    const cacheStats = cacheManager.getGlobalStats();
    const totalHitRate = cacheStats.transcript.hitRate + cacheStats.meeting.hitRate + cacheStats.api.hitRate;
    const avgHitRate = totalHitRate / 3;

    metrics.push({
      id: 'cache_hit_rate',
      name: 'Cache Hit Rate',
      value: Math.round(avgHitRate * 100),
      unit: '%',
      status: avgHitRate < 0.7 ? 'warning' : avgHitRate < 0.5 ? 'critical' : 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 70, critical: 50 }
    });

    metrics.push({
      id: 'cache_memory_usage',
      name: 'Cache Memory',
      value: Math.round((cacheStats.transcript.memoryUsage + cacheStats.meeting.memoryUsage + cacheStats.api.memoryUsage) / 1024 / 1024),
      unit: 'MB',
      status: 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 50, critical: 100 }
    });

    // Rendering metrics
    const renderTimes = await measureRenderPerformance();
    metrics.push({
      id: 'avg_render_time',
      name: 'Avg Render Time',
      value: Math.round(renderTimes.average),
      unit: 'ms',
      status: renderTimes.average > 16 ? 'warning' : renderTimes.average > 33 ? 'critical' : 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 16, critical: 33 }
    });

    // Frame rate
    const fps = await measureFrameRate();
    metrics.push({
      id: 'frame_rate',
      name: 'Frame Rate',
      value: Math.round(fps),
      unit: 'FPS',
      status: fps < 30 ? 'critical' : fps < 50 ? 'warning' : 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 50, critical: 30 }
    });

    // Bundle size metrics
    const bundleSize = await estimateBundleSize();
    metrics.push({
      id: 'bundle_size',
      name: 'Bundle Size',
      value: Math.round(bundleSize / 1024),
      unit: 'KB',
      status: bundleSize > 2048 * 1024 ? 'warning' : bundleSize > 5120 * 1024 ? 'critical' : 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 2048, critical: 5120 }
    });

    // Component count
    const componentCount = countActiveComponents();
    metrics.push({
      id: 'component_count',
      name: 'Active Components',
      value: componentCount,
      unit: 'components',
      status: componentCount > 100 ? 'warning' : componentCount > 200 ? 'critical' : 'good',
      trend: 'stable',
      history: [],
      timestamp: now,
      threshold: { warning: 100, critical: 200 }
    });

    // Calculate system health
    const systemHealth = calculateSystemHealth(metrics);

    return {
      metrics,
      systemHealth,
      lastUpdated: now
    };
  }, []);

  const measureRenderPerformance = async (): Promise<{ average: number; min: number; max: number }> => {
    return new Promise(resolve => {
      const times: number[] = [];
      let measureCount = 0;
      const maxMeasures = 10;

      const measure = () => {
        const start = performance.now();
        
        requestAnimationFrame(() => {
          const end = performance.now();
          times.push(end - start);
          measureCount++;
          
          if (measureCount < maxMeasures) {
            setTimeout(measure, 10);
          } else {
            resolve({
              average: times.reduce((sum, time) => sum + time, 0) / times.length,
              min: Math.min(...times),
              max: Math.max(...times)
            });
          }
        });
      };

      measure();
    });
  };

  const measureFrameRate = (): Promise<number> => {
    return new Promise(resolve => {
      let frameCount = 0;
      const startTime = performance.now();
      const duration = 1000; // 1 second

      const countFrame = () => {
        frameCount++;
        const elapsed = performance.now() - startTime;
        
        if (elapsed < duration) {
          requestAnimationFrame(countFrame);
        } else {
          const fps = (frameCount / elapsed) * 1000;
          resolve(fps);
        }
      };

      requestAnimationFrame(countFrame);
    });
  };

  const estimateBundleSize = async (): Promise<number> => {
    // Rough estimation based on loaded resources
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    let totalSize = 0;

    for (const resource of resources) {
      if (resource.name.includes('.js') || resource.name.includes('.css')) {
        totalSize += resource.transferSize || 0;
      }
    }

    return totalSize;
  };

  const countActiveComponents = (): number => {
    // Estimate based on DOM elements with React fiber properties
    const elements = document.querySelectorAll('[data-reactroot], [data-react-component]');
    return elements.length || Math.floor(document.querySelectorAll('*').length / 10);
  };

  const calculateSystemHealth = (metrics: PerformanceMetric[]): SystemHealth => {
    const criticalCount = metrics.filter(m => m.status === 'critical').length;
    const warningCount = metrics.filter(m => m.status === 'warning').length;
    const goodCount = metrics.filter(m => m.status === 'good').length;

    let overall: SystemHealth['overall'] = 'healthy';
    let score = 100;
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (criticalCount > 0) {
      overall = 'critical';
      score = Math.max(0, 100 - (criticalCount * 30) - (warningCount * 10));
      issues.push(`${criticalCount} critical performance issue${criticalCount > 1 ? 's' : ''}`);
      recommendations.push('Immediate action required to resolve critical issues');
    } else if (warningCount > 2) {
      overall = 'degraded';
      score = Math.max(50, 100 - (warningCount * 15));
      issues.push(`${warningCount} performance warning${warningCount > 1 ? 's' : ''}`);
      recommendations.push('Monitor and optimize performance bottlenecks');
    }

    // Specific recommendations based on metrics
    metrics.forEach(metric => {
      if (metric.status === 'critical' || metric.status === 'warning') {
        switch (metric.id) {
          case 'js_heap_used':
            recommendations.push('Consider memory optimization and garbage collection');
            break;
          case 'websocket_latency':
            recommendations.push('Check network connection and server performance');
            break;
          case 'cache_hit_rate':
            recommendations.push('Review caching strategy and increase cache size');
            break;
          case 'avg_render_time':
            recommendations.push('Optimize component rendering with memoization');
            break;
          case 'frame_rate':
            recommendations.push('Reduce animation complexity and optimize graphics');
            break;
        }
      }
    });

    return {
      overall,
      score,
      issues,
      recommendations: [...new Set(recommendations)] // Remove duplicates
    };
  };

  // Data loading
  const loadPerformanceData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await collectPerformanceMetrics();
      
      // Merge with existing history
      if (performanceData) {
        data.metrics = data.metrics.map(metric => {
          const existing = performanceData.metrics.find(m => m.id === metric.id);
          if (existing) {
            const history = [...existing.history, metric.value];
            // Keep only last 100 data points
            if (history.length > 100) {
              history.shift();
            }
            
            // Calculate trend
            if (history.length >= 2) {
              const recent = history.slice(-5);
              const older = history.slice(-10, -5);
              const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
              const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
              
              if (recentAvg > olderAvg * 1.1) {
                metric.trend = 'up';
              } else if (recentAvg < olderAvg * 0.9) {
                metric.trend = 'down';
              } else {
                metric.trend = 'stable';
              }
            }
            
            metric.history = history;
          }
          return metric;
        });
      }
      
      setPerformanceData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setIsLoading(false);
    }
  }, [collectPerformanceMetrics, performanceData]);

  // Auto-refresh
  useEffect(() => {
    loadPerformanceData();

    if (config.autoRefresh) {
      const interval = setInterval(loadPerformanceData, config.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [loadPerformanceData, config.autoRefresh, config.refreshInterval]);

  // Filtered metrics
  const filteredMetrics = useMemo(() => {
    if (!performanceData) return [];
    
    if (config.showAllMetrics) {
      return performanceData.metrics;
    }
    
    return performanceData.metrics.filter(metric => 
      metric.status === 'warning' || metric.status === 'critical'
    );
  }, [performanceData, config.showAllMetrics]);

  // Render metric card
  const renderMetricCard = (metric: PerformanceMetric) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'good': return 'text-green-600 bg-green-50 border-green-200';
        case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        case 'critical': return 'text-red-600 bg-red-50 border-red-200';
        default: return 'text-gray-600 bg-gray-50 border-gray-200';
      }
    };

    const getTrendIcon = (trend: string) => {
      switch (trend) {
        case 'up': return <TrendingUp size={16} className="text-red-500" />;
        case 'down': return <TrendingDown size={16} className="text-green-500" />;
        default: return <Activity size={16} className="text-gray-500" />;
      }
    };

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'good': return <CheckCircle size={16} className="text-green-500" />;
        case 'warning': return <AlertTriangle size={16} className="text-yellow-500" />;
        case 'critical': return <XCircle size={16} className="text-red-500" />;
        default: return <Info size={16} className="text-gray-500" />;
      }
    };

    return (
      <div
        key={metric.id}
        className={`metric-card p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
          config.compactView ? 'p-3' : 'p-4'
        } ${getStatusColor(metric.status)} ${
          selectedMetric === metric.id ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={() => {
          setSelectedMetric(selectedMetric === metric.id ? null : metric.id);
          onMetricClick?.(metric);
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {getStatusIcon(metric.status)}
            <h3 className={`font-medium ${config.compactView ? 'text-sm' : 'text-base'}`}>
              {metric.name}
            </h3>
          </div>
          {getTrendIcon(metric.trend)}
        </div>
        
        <div className="flex items-baseline gap-1 mb-2">
          <span className={`font-bold ${config.compactView ? 'text-xl' : 'text-2xl'}`}>
            {metric.value.toLocaleString()}
          </span>
          <span className="text-sm text-gray-600">{metric.unit}</span>
        </div>
        
        {!config.compactView && metric.history.length > 1 && (
          <div className="h-8 w-full">
            <svg className="w-full h-full" viewBox="0 0 100 30">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                points={metric.history
                  .slice(-20)
                  .map((value, index) => {
                    const x = (index / 19) * 100;
                    const max = Math.max(...metric.history);
                    const min = Math.min(...metric.history);
                    const y = 30 - ((value - min) / (max - min || 1)) * 30;
                    return `${x},${y}`;
                  })
                  .join(' ')
                }
              />
            </svg>
          </div>
        )}
        
        <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
          <span>Warning: {metric.threshold.warning}{metric.unit}</span>
          <span>Critical: {metric.threshold.critical}{metric.unit}</span>
        </div>
      </div>
    );
  };

  // Render system health
  const renderSystemHealth = () => {
    if (!performanceData) return null;

    const { systemHealth } = performanceData;
    const getHealthColor = (health: string) => {
      switch (health) {
        case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
        case 'degraded': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        case 'critical': return 'text-red-600 bg-red-50 border-red-200';
        default: return 'text-gray-600 bg-gray-50 border-gray-200';
      }
    };

    return (
      <div className={`system-health p-4 rounded-lg border ${getHealthColor(systemHealth.overall)}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">System Health</h2>
          <div className="flex items-center gap-2">
            <Gauge size={20} />
            <span className="text-2xl font-bold">{systemHealth.score}%</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {systemHealth.issues.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Issues</h4>
              <ul className="space-y-1 text-sm">
                {systemHealth.issues.map((issue, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <AlertTriangle size={14} />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {systemHealth.recommendations.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Recommendations</h4>
              <ul className="space-y-1 text-sm">
                {systemHealth.recommendations.slice(0, 3).map((rec, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Info size={14} />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render controls
  const renderControls = () => {
    if (!showControls) return null;

    return (
      <div className="controls p-4 bg-gray-50 rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setConfig(c => ({ ...c, autoRefresh: !c.autoRefresh }))}
              className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors ${
                config.autoRefresh 
                  ? 'bg-green-100 text-green-700 border-green-300' 
                  : 'bg-gray-100 text-gray-700 border-gray-300'
              }`}
            >
              <RefreshCw size={16} className={config.autoRefresh ? 'animate-spin' : ''} />
              Auto Refresh
            </button>
            
            <button
              onClick={() => setConfig(c => ({ ...c, showAllMetrics: !c.showAllMetrics }))}
              className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors ${
                config.showAllMetrics 
                  ? 'bg-blue-100 text-blue-700 border-blue-300' 
                  : 'bg-gray-100 text-gray-700 border-gray-300'
              }`}
            >
              {config.showAllMetrics ? <Eye size={16} /> : <EyeOff size={16} />}
              {config.showAllMetrics ? 'All Metrics' : 'Issues Only'}
            </button>
            
            <button
              onClick={() => setConfig(c => ({ ...c, compactView: !c.compactView }))}
              className="flex items-center gap-2 px-3 py-2 rounded border bg-gray-100 text-gray-700 border-gray-300"
            >
              {config.compactView ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              {config.compactView ? 'Expand' : 'Compact'}
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Refresh every</span>
            <select
              value={config.refreshInterval}
              onChange={(e) => setConfig(c => ({ ...c, refreshInterval: Number(e.target.value) }))}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`performance-dashboard ${className}`}>
        <div className="error-state p-8 text-center">
          <XCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load performance data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadPerformanceData}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`performance-dashboard ${className}`}>
      {/* Header */}
      <div className="header p-4 bg-white border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor size={24} className="text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold">Performance Monitor</h1>
              {performanceData && (
                <p className="text-sm text-gray-600">
                  Last updated: {new Date(performanceData.lastUpdated).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={loadPerformanceData}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-gray-600 hover:text-gray-900"
            >
              {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="content p-4 space-y-6">
        {/* Controls */}
        {renderControls()}

        {/* System Health */}
        {performanceData && renderSystemHealth()}

        {/* Loading State */}
        {isLoading && !performanceData && (
          <div className="loading-state flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <RefreshCw size={24} className="animate-spin" />
              <span>Loading performance data...</span>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        {performanceData && (
          <div className={`metrics-grid grid gap-4 ${
            config.compactView 
              ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' 
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}>
            {filteredMetrics.map(renderMetricCard)}
          </div>
        )}

        {/* No Metrics */}
        {performanceData && filteredMetrics.length === 0 && (
          <div className="no-metrics text-center py-12">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">All metrics are healthy</h3>
            <p className="text-gray-600">No performance issues detected</p>
          </div>
        )}
      </div>
    </div>
  );
};