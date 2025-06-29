// Transcription Performance Metrics Component
// Displays real-time performance metrics for transcription processing

import React, { useState, useEffect } from 'react';

interface SystemMetrics {
  device: string;
  cuda_available: boolean;
  gpu_name?: string;
  gpu_memory_total: number;
  current_model?: string;
  session_count: number;
}

interface QueueMetrics {
  total_queued: number;
  processing: number;
  completed: number;
  failed: number;
  average_processing_time: number;
  average_queue_wait_time: number;
  worker_count: number;
  system_load: number;
  estimated_wait_time: number;
}

interface TranscriptionMetricsProps {
  sessionId?: string;
  refreshInterval?: number;
  showSystemInfo?: boolean;
  showQueueStats?: boolean;
  compact?: boolean;
}

export const TranscriptionMetrics: React.FC<TranscriptionMetricsProps> = ({
  sessionId,
  refreshInterval = 5000,
  showSystemInfo = true,
  showQueueStats = true,
  compact = false
}) => {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [queueMetrics, setQueueMetrics] = useState<QueueMetrics | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch system information
  const fetchSystemMetrics = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcription/system-info');
      if (!response.ok) throw new Error('Failed to fetch system metrics');
      
      const data = await response.json();
      setSystemMetrics(data.transcription_service);
    } catch (err) {
      setError('Failed to fetch system metrics: ' + (err as Error).message);
    }
  };

  // Fetch queue statistics
  const fetchQueueMetrics = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcription/queue/stats');
      if (!response.ok) throw new Error('Failed to fetch queue metrics');
      
      const data = await response.json();
      setQueueMetrics(data);
    } catch (err) {
      setError('Failed to fetch queue metrics: ' + (err as Error).message);
    }
  };

  // Fetch session-specific metrics
  const fetchSessionMetrics = async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`http://localhost:8000/transcription/session/${sessionId}/metrics`);
      if (!response.ok) throw new Error('Failed to fetch session metrics');
      
      const data = await response.json();
      setSessionMetrics(data);
    } catch (err) {
      setError('Failed to fetch session metrics: ' + (err as Error).message);
    }
  };

  // Fetch all metrics
  const fetchAllMetrics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        showSystemInfo && fetchSystemMetrics(),
        showQueueStats && fetchQueueMetrics(),
        sessionId && fetchSessionMetrics()
      ]);
      
      setLastUpdate(new Date());
    } catch {
      // Individual errors are handled in each fetch function
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh metrics
  useEffect(() => {
    fetchAllMetrics();
    
    const interval = setInterval(fetchAllMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [sessionId, refreshInterval, showSystemInfo, showQueueStats]);

  // Format duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Get performance color
  const getPerformanceColor = (value: number, thresholds: [number, number]): string => {
    if (value <= thresholds[0]) return 'text-green-600';
    if (value <= thresholds[1]) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get system health status
  const getSystemHealth = (): { status: string; color: string } => {
    if (!systemMetrics || !queueMetrics) return { status: 'Unknown', color: 'text-gray-500' };
    
    const issues = [];
    
    if (!systemMetrics.cuda_available) issues.push('No GPU acceleration');
    if (queueMetrics.system_load > 0.8) issues.push('High system load');
    if (queueMetrics.failed > queueMetrics.completed * 0.1) issues.push('High failure rate');
    
    if (issues.length === 0) return { status: 'Healthy', color: 'text-green-600' };
    if (issues.length <= 2) return { status: 'Warning', color: 'text-yellow-600' };
    return { status: 'Critical', color: 'text-red-600' };
  };

  if (loading && !systemMetrics) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading metrics...</span>
        </div>
      </div>
    );
  }

  const health = getSystemHealth();

  if (compact) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className={`w-3 h-3 rounded-full ${
              health.color.includes('green') ? 'bg-green-500' :
              health.color.includes('yellow') ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="font-medium text-gray-900">Transcription Status</span>
          </div>
          
          <div className="flex items-center space-x-6 text-sm">
            {queueMetrics && (
              <>
                <div>
                  <span className="text-gray-600">Queue: </span>
                  <span className="font-medium">{queueMetrics.total_queued}</span>
                </div>
                <div>
                  <span className="text-gray-600">Processing: </span>
                  <span className="font-medium">{queueMetrics.processing}</span>
                </div>
                <div>
                  <span className="text-gray-600">Load: </span>
                  <span className={`font-medium ${getPerformanceColor(queueMetrics.system_load, [0.5, 0.8])}`}>
                    {Math.round(queueMetrics.system_load * 100)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Transcription Metrics</h3>
          <p className="text-gray-600">Real-time performance monitoring</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-2 ${health.color}`}>
            <div className={`w-3 h-3 rounded-full ${
              health.color.includes('green') ? 'bg-green-500' :
              health.color.includes('yellow') ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="font-medium">{health.status}</span>
          </div>
          
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex">
            <span className="text-red-500 mr-2">⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* System Information */}
      {showSystemInfo && systemMetrics && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">System Information</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600 mb-1">Device</div>
              <div className={`font-medium ${
                systemMetrics.cuda_available ? 'text-green-600' : 'text-orange-600'
              }`}>
                {systemMetrics.device.toUpperCase()}
                {systemMetrics.cuda_available && ' (CUDA)'}
              </div>
            </div>
            
            {systemMetrics.gpu_name && (
              <div>
                <div className="text-gray-600 mb-1">GPU</div>
                <div className="font-medium text-gray-900" title={systemMetrics.gpu_name}>
                  {systemMetrics.gpu_name.length > 20 
                    ? systemMetrics.gpu_name.substring(0, 20) + '...'
                    : systemMetrics.gpu_name}
                </div>
              </div>
            )}
            
            {systemMetrics.gpu_memory_total > 0 && (
              <div>
                <div className="text-gray-600 mb-1">GPU Memory</div>
                <div className="font-medium text-gray-900">
                  {systemMetrics.gpu_memory_total.toFixed(1)} GB
                </div>
              </div>
            )}
            
            <div>
              <div className="text-gray-600 mb-1">Current Model</div>
              <div className="font-medium text-blue-600">
                {systemMetrics.current_model || 'None'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue Statistics */}
      {showQueueStats && queueMetrics && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-3">Queue Statistics</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-blue-700 mb-1">Queued</div>
              <div className="font-semibold text-blue-900">
                {queueMetrics.total_queued}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">Processing</div>
              <div className="font-semibold text-blue-900">
                {queueMetrics.processing}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">Completed</div>
              <div className="font-semibold text-green-600">
                {queueMetrics.completed}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">Failed</div>
              <div className="font-semibold text-red-600">
                {queueMetrics.failed}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">Avg Processing</div>
              <div className="font-semibold text-blue-900">
                {formatDuration(queueMetrics.average_processing_time * 1000)}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">Avg Wait Time</div>
              <div className="font-semibold text-blue-900">
                {formatDuration(queueMetrics.average_queue_wait_time * 1000)}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">Workers</div>
              <div className="font-semibold text-blue-900">
                {queueMetrics.worker_count}
              </div>
            </div>
            
            <div>
              <div className="text-blue-700 mb-1">System Load</div>
              <div className={`font-semibold ${getPerformanceColor(queueMetrics.system_load, [0.5, 0.8])}`}>
                {Math.round(queueMetrics.system_load * 100)}%
              </div>
            </div>
          </div>
          
          {queueMetrics.estimated_wait_time > 0 && (
            <div className="mt-3 p-3 bg-blue-100 rounded">
              <div className="text-blue-800 text-sm">
                <strong>Estimated wait time for new requests:</strong> {formatDuration(queueMetrics.estimated_wait_time * 1000)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session Metrics */}
      {sessionId && sessionMetrics && (
        <div className="bg-green-50 rounded-lg p-4">
          <h4 className="font-medium text-green-900 mb-3">Session Metrics ({sessionId})</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-green-700 mb-1">Chunks Processed</div>
              <div className="font-semibold text-green-900">
                {sessionMetrics.total_chunks_processed}
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Total Audio</div>
              <div className="font-semibold text-green-900">
                {formatDuration(sessionMetrics.total_audio_duration_ms)}
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Processing Time</div>
              <div className="font-semibold text-green-900">
                {formatDuration(sessionMetrics.total_processing_time_ms)}
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Avg RTF</div>
              <div className={`font-semibold ${getPerformanceColor(sessionMetrics.average_real_time_factor, [1, 2])}`}>
                {sessionMetrics.average_real_time_factor.toFixed(2)}x
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Avg Confidence</div>
              <div className={`font-semibold ${getPerformanceColor(1 - sessionMetrics.average_confidence_score, [0.2, 0.4])}`}>
                {Math.round(sessionMetrics.average_confidence_score * 100)}%
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Words Transcribed</div>
              <div className="font-semibold text-green-900">
                {sessionMetrics.total_words_transcribed}
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Model Used</div>
              <div className="font-semibold text-green-900">
                {sessionMetrics.model_used}
              </div>
            </div>
            
            <div>
              <div className="text-green-700 mb-1">Device</div>
              <div className="font-semibold text-green-900">
                {sessionMetrics.device_used}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Recommendations */}
      {systemMetrics && queueMetrics && (
        <div className="bg-yellow-50 rounded-lg p-4">
          <h4 className="font-medium text-yellow-900 mb-3">Performance Recommendations</h4>
          
          <div className="space-y-2 text-sm text-yellow-800">
            {!systemMetrics.cuda_available && (
              <div className="flex items-start space-x-2">
                <span>💡</span>
                <span>Install CUDA drivers for GPU acceleration to improve processing speed</span>
              </div>
            )}
            
            {queueMetrics.system_load > 0.8 && (
              <div className="flex items-start space-x-2">
                <span>⚠️</span>
                <span>High system load detected. Consider using a smaller model or reducing concurrent processing</span>
              </div>
            )}
            
            {queueMetrics.average_processing_time > 5 && (
              <div className="flex items-start space-x-2">
                <span>🐌</span>
                <span>Slow processing detected. Consider using a smaller model for real-time transcription</span>
              </div>
            )}
            
            {queueMetrics.failed > 0 && queueMetrics.failed / Math.max(1, queueMetrics.completed) > 0.1 && (
              <div className="flex items-start space-x-2">
                <span>❌</span>
                <span>High failure rate detected. Check audio quality and model compatibility</span>
              </div>
            )}
            
            {systemMetrics.gpu_memory_total > 0 && systemMetrics.gpu_memory_total < 4 && (
              <div className="flex items-start space-x-2">
                <span>💾</span>
                <span>Limited GPU memory. Use tiny/base models for optimal performance</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};