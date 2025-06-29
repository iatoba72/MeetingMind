/**
 * Observability Integration Demo Component
 * Demonstrates how to integrate observability features into React components
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useObservability,
  usePerformanceMonitoring,
  useUserInteractionTracking,
  useHealthMonitoring,
  useBusinessEvents,
  useMetricsMonitoring,
  useDebugMode,
  useTracedFetch,
  useAsyncOperation,
} from '../observability/hooks';
import { LogLevel } from '../observability/logging';
import { HealthStatus } from '../observability/health';

interface ObservabilityDemoProps {
  meetingId?: string;
}

const ObservabilityDemo: React.FC<ObservabilityDemoProps> = ({ meetingId }) => {
  // Core observability hook
  const {
    log,
    logError,
    logUserAction: _logUserAction,
    recordPerformance,
    trace: _trace,
    componentName,
    isInitialized,
  } = useObservability('ObservabilityDemo');

  // Performance monitoring
  const { renderCount } = usePerformanceMonitoring('ObservabilityDemo');

  // User interaction tracking
  const { trackClick, trackInput, trackFormSubmit } = useUserInteractionTracking('ObservabilityDemo');

  // Health monitoring
  const {
    healthSummary,
    isChecking,
    checkHealth,
    isHealthy,
    isDegraded,
    isUnhealthy,
    score,
  } = useHealthMonitoring();

  // Business events
  const {
    trackMeetingEvent,
    trackAudioEvent: _trackAudioEvent,
    trackAIEvent,
    trackUserEvent,
  } = useBusinessEvents();

  // Real-time metrics
  const {
    metrics,
    isPerformanceGood,
    isMemoryHigh,
    isNetworkSlow,
  } = useMetricsMonitoring();

  // Debug mode
  const {
    isDebugEnabled,
    enableDebugMode,
    disableDebugMode,
    exportData,
    isExporting,
  } = useDebugMode();

  // Traced fetch
  const tracedFetch = useTracedFetch();

  // Async operation tracing
  const traceAsync = useAsyncOperation();

  // Local state
  const [demoData, setDemoData] = useState<{ metrics: Record<string, number>; logs: Array<{ timestamp: number; level: string; message: string }>; traces: Array<{ id: string; duration: number; status: string }> } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Component initialization logging
  useEffect(() => {
    if (isInitialized) {
      log(LogLevel.INFO, 'ObservabilityDemo component initialized', {
        meetingId,
        renderCount,
      });

      if (meetingId) {
        trackMeetingEvent('demo_viewed', meetingId, {
          component: 'ObservabilityDemo',
        });
      }
    }
  }, [isInitialized, meetingId, log, trackMeetingEvent, renderCount]);

  // Traced API call example
  const loadDemoData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const startTime = performance.now();

      // Example of traced fetch
      const response = await tracedFetch('/api/demo-data', {
        method: 'GET',
      }, {
        operation: 'load_demo_data',
        meetingId,
      });

      const data = await response.json();
      setDemoData(data);

      const duration = performance.now() - startTime;
      recordPerformance('loadDemoData', duration, {
        dataSize: JSON.stringify(data).length,
        success: true,
      });

      log(LogLevel.INFO, 'Demo data loaded successfully', {
        duration,
        dataSize: JSON.stringify(data).length,
      });

      trackUserEvent('demo_data_loaded', {
        duration,
        success: true,
      });

    } catch (err) {
      const error = err as Error;
      setError(error.message);
      logError(error, {
        operation: 'loadDemoData',
        meetingId,
      });

      trackUserEvent('demo_data_load_failed', {
        error: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tracedFetch, meetingId, recordPerformance, log, logError, trackUserEvent]);

  // Traced async operation example
  const performComplexOperation = useCallback(async () => {
    return traceAsync(
      'complex_operation',
      async () => {
        // Simulate complex work
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Simulate AI processing
        trackAIEvent('demo_processing', 'mock_provider', {
          operation: 'complex_demo',
          duration: 1000,
        });

        return { result: 'Complex operation completed' };
      },
      {
        operation: 'demo_complex',
        meetingId,
      }
    );
  }, [traceAsync, trackAIEvent, meetingId]);

  // User interaction handlers with tracking
  const handleButtonClick = useCallback((buttonId: string) => {
    trackClick(buttonId, {
      meetingId,
      timestamp: new Date().toISOString(),
    });

    switch (buttonId) {
      case 'load-data':
        loadDemoData();
        break;
      case 'complex-operation':
        performComplexOperation().then(result => {
          log(LogLevel.INFO, 'Complex operation result', result);
        });
        break;
      case 'check-health':
        checkHealth();
        break;
      case 'enable-debug':
        enableDebugMode();
        break;
      case 'disable-debug':
        disableDebugMode();
        break;
      case 'export-data':
        exportData().then(() => {
          log(LogLevel.INFO, 'Observability data exported');
        });
        break;
      case 'simulate-error':
        try {
          throw new Error('Simulated error for testing');
        } catch (err) {
          logError(err as Error, {
            simulated: true,
            trigger: 'user_action',
          });
        }
        break;
    }
  }, [
    trackClick,
    meetingId,
    loadDemoData,
    performComplexOperation,
    checkHealth,
    enableDebugMode,
    disableDebugMode,
    exportData,
    log,
    logError,
  ]);

  const handleInputChange = useCallback((inputName: string, value: string) => {
    trackInput(inputName, value, {
      length: value.length,
    });
  }, [trackInput]);

  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    trackFormSubmit('demo_form', {
      meetingId,
    });
    
    log(LogLevel.INFO, 'Demo form submitted');
  }, [trackFormSubmit, log, meetingId]);

  // Health status color
  const getHealthColor = () => {
    if (isHealthy) return 'text-green-600';
    if (isDegraded) return 'text-yellow-600';
    if (isUnhealthy) return 'text-red-600';
    return 'text-gray-600';
  };

  if (!isInitialized) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">Observability not initialized yet...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-4">Observability Integration Demo</h1>
        <p className="text-gray-600 mb-4">
          This component demonstrates comprehensive observability integration including
          tracing, logging, metrics, health monitoring, and user interaction tracking.
        </p>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Component:</strong> {componentName}
          </div>
          <div>
            <strong>Render Count:</strong> {renderCount}
          </div>
          <div>
            <strong>Meeting ID:</strong> {meetingId || 'None'}
          </div>
          <div>
            <strong>Debug Mode:</strong> {isDebugEnabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
      </div>

      {/* Health Status */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">System Health</h2>
        <div className="flex items-center justify-between mb-4">
          <div className={`text-lg font-medium ${getHealthColor()}`}>
            Status: {healthSummary?.overall || 'Unknown'}
          </div>
          <div className="text-lg font-medium">
            Score: {score}/100
          </div>
        </div>
        
        <button
          onClick={() => handleButtonClick('check-health')}
          disabled={isChecking}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isChecking ? 'Checking...' : 'Run Health Check'}
        </button>

        {healthSummary && (
          <div className="mt-4 space-y-2">
            {healthSummary.checks.map((check) => (
              <div key={check.name} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="font-medium">{check.name}</span>
                <span className={`px-2 py-1 rounded text-sm ${
                  check.status === HealthStatus.HEALTHY ? 'bg-green-100 text-green-800' :
                  check.status === HealthStatus.DEGRADED ? 'bg-yellow-100 text-yellow-800' :
                  check.status === HealthStatus.UNHEALTHY ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {check.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className={`text-2xl font-bold ${metrics.fps > 45 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.fps.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">FPS</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${!isMemoryHigh ? 'text-green-600' : 'text-red-600'}`}>
              {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">Memory (MB)</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${metrics.renderTime < 20 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.renderTime.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">Render (ms)</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${!isNetworkSlow ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.networkLatency.toFixed(0)}
            </div>
            <div className="text-sm text-gray-600">Network (ms)</div>
          </div>
        </div>
        
        <div className="mt-4">
          <div className={`p-3 rounded ${isPerformanceGood ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
            Performance Status: {isPerformanceGood ? 'Good' : 'Needs Attention'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Observability Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => handleButtonClick('load-data')}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load Data'}
          </button>
          
          <button
            onClick={() => handleButtonClick('complex-operation')}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Complex Op
          </button>
          
          <button
            onClick={() => handleButtonClick('simulate-error')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Simulate Error
          </button>
          
          <button
            onClick={() => handleButtonClick(isDebugEnabled ? 'disable-debug' : 'enable-debug')}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            {isDebugEnabled ? 'Disable' : 'Enable'} Debug
          </button>
          
          <button
            onClick={() => handleButtonClick('export-data')}
            disabled={isExporting}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export Data'}
          </button>
        </div>
      </div>

      {/* Demo Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Interaction Tracking Demo</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Demo Input
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => handleInputChange('demo_input', e.target.value)}
              placeholder="Type something to track input events..."
            />
          </div>
          
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Submit Form
          </button>
        </form>
      </div>

      {/* Data Display */}
      {demoData && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Loaded Data</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(demoData, null, 2)}
          </pre>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
};

export default ObservabilityDemo;