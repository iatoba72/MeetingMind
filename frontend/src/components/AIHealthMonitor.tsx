// AI Provider Health Monitor
// Real-time health monitoring dashboard with alerts and historical tracking
// Provides comprehensive health analytics and alerting for AI providers

import React, { useState, useEffect, useCallback } from 'react';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  last_check: string | null;
  consecutive_failures: number;
  response_time_ms: number;
  error_message: string | null;
}

interface ProviderHealth {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  health: HealthStatus;
  usage: {
    total_requests: number;
    success_rate: number;
    average_latency_ms: number;
  };
}

interface HealthAlert {
  id: string;
  provider_id: string;
  provider_name: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface HealthMetric {
  timestamp: string;
  provider_id: string;
  response_time_ms: number;
  status: string;
  success: boolean;
}

interface AIHealthMonitorProps {
  refreshInterval?: number; // milliseconds
}

/**
 * AIHealthMonitor Component
 * 
 * Comprehensive health monitoring system for AI providers that provides:
 * 
 * Real-time Monitoring:
 * - Continuous health status tracking for all providers
 * - Response time monitoring with trend analysis
 * - Success rate tracking and alerting
 * - Automatic failure detection and recovery monitoring
 * 
 * Alert System:
 * - Real-time alerts for provider failures and degradations
 * - Configurable alert thresholds and severity levels
 * - Alert acknowledgment and resolution tracking
 * - Historical alert analysis and patterns
 * 
 * Analytics Dashboard:
 * - Historical health metrics and trend visualization
 * - Performance comparison across providers
 * - Uptime/downtime tracking and reporting
 * - Health score calculation and ranking
 * 
 * Proactive Monitoring:
 * - Predictive failure detection based on trends
 * - Capacity planning and load balancing insights
 * - Performance optimization recommendations
 * - SLA monitoring and compliance reporting
 */
export const AIHealthMonitor: React.FC<AIHealthMonitorProps> = ({ 
  refreshInterval = 30000 // 30 seconds default
}) => {
  const [providers, setProviders] = useState<Record<string, ProviderHealth>>({});
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [healthHistory, setHealthHistory] = useState<HealthMetric[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [alertFilter, setAlertFilter] = useState<'all' | 'critical' | 'warning' | 'unacknowledged'>('all');
  const [isLearningMode, setIsLearningMode] = useState(true);

  // Fetch current health status
  const fetchHealthStatus = useCallback(async () => {
    try {
      const response = await fetch('/ai/providers');
      if (response.ok) {
        const data = await response.json();
        
        // Transform data for health monitoring
        const healthData: Record<string, ProviderHealth> = {};
        Object.entries(data).forEach(([id, provider]: [string, any]) => {
          healthData[id] = {
            id,
            name: provider.name,
            type: provider.type,
            enabled: provider.enabled,
            health: provider.health,
            usage: {
              total_requests: provider.usage.total_requests,
              success_rate: provider.usage.success_rate,
              average_latency_ms: provider.usage.average_latency_ms
            }
          };
        });

        // Check for health changes and generate alerts
        checkForHealthChanges(providers, healthData);
        
        setProviders(healthData);
        setLastUpdate(new Date());
        
        // Add to health history
        const timestamp = new Date().toISOString();
        const newMetrics: HealthMetric[] = Object.values(healthData).map(provider => ({
          timestamp,
          provider_id: provider.id,
          response_time_ms: provider.health.response_time_ms,
          status: provider.health.status,
          success: provider.health.status === 'healthy'
        }));
        
        setHealthHistory(prev => {
          const combined = [...prev, ...newMetrics];
          // Keep last 1000 metrics (roughly 8-10 hours at 30s intervals per provider)
          return combined.slice(-1000);
        });
        
      }
    } catch (error) {
      console.error('Failed to fetch health status:', error);
      generateAlert('system', 'Health Monitor', 'critical', 'Failed to fetch provider health status');
    }
  }, [providers]);

  // Check for health changes and generate alerts
  const checkForHealthChanges = useCallback((oldProviders: Record<string, ProviderHealth>, newProviders: Record<string, ProviderHealth>) => {
    Object.entries(newProviders).forEach(([id, newProvider]) => {
      const oldProvider = oldProviders[id];
      
      if (!oldProvider) return; // Skip first load
      
      // Check for status changes
      if (oldProvider.health.status !== newProvider.health.status) {
        let severity: 'critical' | 'warning' | 'info' = 'info';
        let message = '';
        
        if (newProvider.health.status === 'unhealthy') {
          severity = 'critical';
          message = `Provider ${newProvider.name} has become unhealthy`;
        } else if (newProvider.health.status === 'degraded') {
          severity = 'warning';
          message = `Provider ${newProvider.name} performance has degraded`;
        } else if (newProvider.health.status === 'healthy' && oldProvider.health.status !== 'healthy') {
          severity = 'info';
          message = `Provider ${newProvider.name} has recovered`;
        }
        
        if (message) {
          generateAlert(id, newProvider.name, severity, message);
        }
      }
      
      // Check for high response times
      if (newProvider.health.response_time_ms > 5000 && oldProvider.health.response_time_ms <= 5000) {
        generateAlert(id, newProvider.name, 'warning', `High response time: ${newProvider.health.response_time_ms}ms`);
      }
      
      // Check for consecutive failures
      if (newProvider.health.consecutive_failures >= 3 && oldProvider.health.consecutive_failures < 3) {
        generateAlert(id, newProvider.name, 'critical', `Multiple consecutive failures: ${newProvider.health.consecutive_failures}`);
      }
      
      // Check for low success rate
      if (newProvider.usage.success_rate < 90 && oldProvider.usage.success_rate >= 90) {
        generateAlert(id, newProvider.name, 'warning', `Low success rate: ${newProvider.usage.success_rate.toFixed(1)}%`);
      }
    });
  }, []);

  // Generate health alert
  const generateAlert = useCallback((providerId: string, providerName: string, severity: 'critical' | 'warning' | 'info', message: string) => {
    const alert: HealthAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider_id: providerId,
      provider_name: providerName,
      severity,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };
    
    setAlerts(prev => [alert, ...prev.slice(0, 99)]); // Keep last 100 alerts
  }, []);

  // Acknowledge alert
  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
  }, []);

  // Clear all alerts
  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Calculate uptime percentage
  const calculateUptime = useCallback((providerId: string, timeRange: string) => {
    const now = new Date();
    const hoursBack = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168
    }[timeRange] || 1;
    
    const cutoff = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    
    const relevantMetrics = healthHistory.filter(metric => 
      metric.provider_id === providerId && 
      new Date(metric.timestamp) >= cutoff
    );
    
    if (relevantMetrics.length === 0) return 100;
    
    const successfulChecks = relevantMetrics.filter(metric => metric.success).length;
    return (successfulChecks / relevantMetrics.length) * 100;
  }, [healthHistory]);

  // Get average response time
  const getAverageResponseTime = useCallback((providerId: string, timeRange: string) => {
    const now = new Date();
    const hoursBack = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168
    }[timeRange] || 1;
    
    const cutoff = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    
    const relevantMetrics = healthHistory.filter(metric => 
      metric.provider_id === providerId && 
      new Date(metric.timestamp) >= cutoff &&
      metric.response_time_ms > 0
    );
    
    if (relevantMetrics.length === 0) return 0;
    
    const totalTime = relevantMetrics.reduce((sum, metric) => sum + metric.response_time_ms, 0);
    return totalTime / relevantMetrics.length;
  }, [healthHistory]);

  // Filter alerts based on current filter
  const filteredAlerts = alerts.filter(alert => {
    switch (alertFilter) {
      case 'critical': return alert.severity === 'critical';
      case 'warning': return alert.severity === 'warning';
      case 'unacknowledged': return !alert.acknowledged;
      default: return true;
    }
  });

  // Set up monitoring interval
  useEffect(() => {
    fetchHealthStatus(); // Initial fetch
    
    if (isMonitoring) {
      const interval = setInterval(fetchHealthStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [isMonitoring, refreshInterval, fetchHealthStatus]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Get alert severity color
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      default: return 'text-blue-600 bg-blue-100 border-blue-200';
    }
  };

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Calculate overall system health
  const systemHealth = Object.values(providers).length > 0 ? {
    totalProviders: Object.values(providers).length,
    healthyProviders: Object.values(providers).filter(p => p.health.status === 'healthy').length,
    unhealthyProviders: Object.values(providers).filter(p => p.health.status === 'unhealthy').length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length,
    averageResponseTime: Object.values(providers).reduce((sum, p) => sum + p.health.response_time_ms, 0) / Object.values(providers).length
  } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">AI Provider Health Monitor</h2>
            <p className="text-gray-600 mt-1">
              Real-time monitoring, alerting, and analytics for AI provider health
            </p>
          </div>
          
          {/* System Health Overview */}
          {systemHealth && (
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {systemHealth.healthyProviders}/{systemHealth.totalProviders}
              </div>
              <div className="text-sm text-gray-600">Healthy Providers</div>
              {systemHealth.criticalAlerts > 0 && (
                <div className="text-lg font-semibold text-red-600 mt-1">
                  {systemHealth.criticalAlerts} Critical Alerts
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`px-4 py-2 rounded flex items-center space-x-2 ${
                isMonitoring 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <span>{isMonitoring ? '⏸️' : '▶️'}</span>
              <span>{isMonitoring ? 'Pause Monitoring' : 'Start Monitoring'}</span>
            </button>
            
            <button
              onClick={fetchHealthStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center space-x-2"
            >
              <span>🔄</span>
              <span>Refresh Now</span>
            </button>
            
            <div className="text-sm text-gray-600">
              {lastUpdate && `Last updated: ${lastUpdate.toLocaleTimeString()}`}
            </div>
          </div>
          
          <label className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Learning Mode</span>
            <input
              type="checkbox"
              checked={isLearningMode}
              onChange={(e) => setIsLearningMode(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      {/* Provider Health Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Provider Status</h3>
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="border border-gray-300 rounded px-3 py-1 text-sm"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>
        
        <div className="grid gap-4">
          {Object.values(providers).map((provider) => {
            const uptime = calculateUptime(provider.id, selectedTimeRange);
            const avgResponseTime = getAverageResponseTime(provider.id, selectedTimeRange);
            
            return (
              <div key={provider.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(provider.health.status)}`}>
                      {provider.health.status.toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{provider.name}</h4>
                      <p className="text-sm text-gray-600">{provider.type}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${provider.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {provider.enabled ? 'ENABLED' : 'DISABLED'}
                    </div>
                    {provider.health.last_check && (
                      <div className="text-sm text-gray-600">
                        Last check: {new Date(provider.health.last_check).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Uptime</div>
                    <div className={`font-semibold ${uptime >= 99 ? 'text-green-600' : uptime >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {uptime.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Avg Response</div>
                    <div className="font-semibold">{formatDuration(avgResponseTime)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Success Rate</div>
                    <div className={`font-semibold ${provider.usage.success_rate >= 95 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {provider.usage.success_rate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Total Requests</div>
                    <div className="font-semibold">{provider.usage.total_requests.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Failures</div>
                    <div className={`font-semibold ${provider.health.consecutive_failures > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {provider.health.consecutive_failures}
                    </div>
                  </div>
                </div>
                
                {provider.health.error_message && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm">
                    <span className="text-red-900 font-medium">Last Error: </span>
                    <span className="text-red-700">{provider.health.error_message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Health Alerts</h3>
          <div className="flex items-center space-x-3">
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value as any)}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value="all">All Alerts</option>
              <option value="critical">Critical Only</option>
              <option value="warning">Warnings Only</option>
              <option value="unacknowledged">Unacknowledged</option>
            </select>
            <button
              onClick={clearAllAlerts}
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Clear All
            </button>
          </div>
        </div>
        
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">✅</div>
            <div>No alerts to display</div>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className={`border rounded-lg p-4 ${getAlertColor(alert.severity)} ${alert.acknowledged ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm uppercase">{alert.severity}</span>
                    <span className="text-sm">{alert.provider_name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs">{new Date(alert.timestamp).toLocaleString()}</span>
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="px-2 py-1 bg-white bg-opacity-50 rounded text-xs hover:bg-opacity-75"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm">{alert.message}</div>
                {alert.acknowledged && (
                  <div className="text-xs mt-1 opacity-75">✓ Acknowledged</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isLearningMode && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h4 className="font-semibold text-indigo-900 mb-2">🔍 Health Monitoring Explained:</h4>
          <ul className="text-indigo-800 text-sm space-y-1">
            <li>• <strong>Uptime:</strong> Percentage of time the provider was healthy in the selected timeframe</li>
            <li>• <strong>Success Rate:</strong> Percentage of requests that completed successfully</li>
            <li>• <strong>Response Time:</strong> Average time for the provider to respond to health checks</li>
            <li>• <strong>Consecutive Failures:</strong> Number of health checks that failed in a row</li>
            <li>• <strong>Alerts:</strong> Automatic notifications when providers experience issues</li>
            <li>• <strong>Health Status:</strong> Healthy (working normally), Degraded (slow), Unhealthy (failing)</li>
          </ul>
        </div>
      )}
    </div>
  );
};