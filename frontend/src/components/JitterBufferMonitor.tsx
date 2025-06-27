/**
 * Jitter Buffer Monitor Component
 * Provides interface for monitoring and managing network jitter buffers
 */

import React, { useState, useEffect } from 'react';

interface JitterBufferConfig {
  target_delay_ms: number;
  min_delay_ms: number;
  max_delay_ms: number;
  adaptive_sizing: boolean;
  packet_timeout_ms: number;
  max_buffer_packets: number;
  playout_interval_ms: number;
  loss_concealment: boolean;
  late_packet_threshold_ms: number;
  statistics_window_size: number;
}

interface BufferStatus {
  source_id: string;
  state: string;
  buffer_size: number;
  target_buffer_size: number;
  current_target_delay_ms: number;
  next_expected_sequence: number;
  highest_sequence_received: number;
  last_playout_time: number | null;
  config: JitterBufferConfig;
}

interface BufferStatistics {
  uptime_seconds: number;
  total_packets: number;
  lost_packets: number;
  late_packets: number;
  duplicate_packets: number;
  concealed_packets: number;
  loss_rate: number;
  late_rate: number;
  duplicate_rate: number;
  average_jitter_ms: number;
  max_jitter_ms: number;
  p95_jitter_ms: number;
  average_buffer_level: number;
  max_buffer_level: number;
  current_buffer_level: number;
  buffer_status: BufferStatus;
}

interface PerformanceMetrics {
  total_packets_processed: number;
  overall_loss_rate: number;
  overall_late_rate: number;
  overall_concealment_rate: number;
  overall_average_jitter_ms: number;
  overall_average_buffer_level: number;
  active_buffers: number;
  buffer_efficiency: number;
}

export const JitterBufferMonitor: React.FC = () => {
  const [bufferStatistics, setBufferStatistics] = useState<Record<string, BufferStatistics>>({});
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [selectedBuffer, setSelectedBuffer] = useState<string>('');
  const [defaultConfig, setDefaultConfig] = useState<JitterBufferConfig | null>(null);
  const [newBufferSource, setNewBufferSource] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBufferStatus();
    fetchPerformanceMetrics();
    fetchDefaultConfig();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchBufferStatus();
      fetchPerformanceMetrics();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const fetchBufferStatus = async () => {
    try {
      const response = await fetch('/api/jitter-buffer/status');
      const data = await response.json();
      
      if (data.success) {
        setBufferStatistics(data.data.statistics.buffers || {});
      }
    } catch (err) {
      console.error('Error fetching buffer status:', err);
    }
  };

  const fetchPerformanceMetrics = async () => {
    try {
      const response = await fetch('/api/jitter-buffer/performance');
      const data = await response.json();
      
      if (data.success) {
        setPerformanceMetrics(data.data.performance);
      }
    } catch (err) {
      console.error('Error fetching performance metrics:', err);
    }
  };

  const fetchDefaultConfig = async () => {
    try {
      const response = await fetch('/api/jitter-buffer/config/defaults');
      const data = await response.json();
      
      if (data.success) {
        setDefaultConfig(data.data.default_config);
      }
    } catch (err) {
      console.error('Error fetching default config:', err);
    }
  };

  const createBuffer = async () => {
    if (!newBufferSource.trim()) {
      setError('Please enter a source ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jitter-buffer/buffers/${newBufferSource}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(defaultConfig),
      });

      const data = await response.json();
      
      if (data.success) {
        setNewBufferSource('');
        await fetchBufferStatus();
      } else {
        setError(data.message || 'Failed to create buffer');
      }
    } catch (err) {
      setError(`Error creating buffer: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const removeBuffer = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/jitter-buffer/buffers/${sourceId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchBufferStatus();
        if (selectedBuffer === sourceId) {
          setSelectedBuffer('');
        }
      } else {
        setError(data.message || 'Failed to remove buffer');
      }
    } catch (err) {
      setError(`Error removing buffer: ${err}`);
    }
  };

  const resetAllBuffers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/jitter-buffer/reset', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchBufferStatus();
        await fetchPerformanceMetrics();
        setSelectedBuffer('');
      } else {
        setError(data.message || 'Failed to reset buffers');
      }
    } catch (err) {
      setError(`Error resetting buffers: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'playing': return 'text-green-600';
      case 'filling': return 'text-blue-600';
      case 'underrun': return 'text-orange-600';
      case 'overrun': return 'text-red-600';
      case 'stopped': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const getStateIcon = (state: string): string => {
    switch (state) {
      case 'playing': return '▶️';
      case 'filling': return '⏳';
      case 'underrun': return '⚠️';
      case 'overrun': return '🔴';
      case 'stopped': return '⏹️';
      default: return '❓';
    }
  };

  const getLossRateColor = (rate: number): string => {
    if (rate === 0) return 'text-green-600';
    if (rate < 0.01) return 'text-yellow-600';
    if (rate < 0.05) return 'text-orange-600';
    return 'text-red-600';
  };

  const getJitterColor = (jitter: number): string => {
    if (jitter < 10) return 'text-green-600';
    if (jitter < 30) return 'text-yellow-600';
    if (jitter < 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getEfficiencyColor = (efficiency: number): string => {
    if (efficiency >= 95) return 'text-green-600';
    if (efficiency >= 90) return 'text-yellow-600';
    if (efficiency >= 80) return 'text-orange-600';
    return 'text-red-600';
  };

  const selectedBufferStats = selectedBuffer ? bufferStatistics[selectedBuffer] : null;

  return (
    <div className="jitter-buffer-monitor p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          Jitter Buffer Monitor
        </h1>

        {/* Overall Performance Metrics */}
        {performanceMetrics && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">System Performance</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {performanceMetrics.active_buffers}
                </div>
                <div className="text-sm text-blue-800">Active Buffers</div>
              </div>
              
              <div className="text-center p-3 bg-green-50 rounded">
                <div className={`text-2xl font-bold ${getEfficiencyColor(performanceMetrics.buffer_efficiency)}`}>
                  {performanceMetrics.buffer_efficiency.toFixed(1)}%
                </div>
                <div className="text-sm text-green-800">Efficiency</div>
              </div>
              
              <div className="text-center p-3 bg-yellow-50 rounded">
                <div className={`text-2xl font-bold ${getJitterColor(performanceMetrics.overall_average_jitter_ms)}`}>
                  {performanceMetrics.overall_average_jitter_ms.toFixed(1)}ms
                </div>
                <div className="text-sm text-yellow-800">Avg Jitter</div>
              </div>
              
              <div className="text-center p-3 bg-red-50 rounded">
                <div className={`text-2xl font-bold ${getLossRateColor(performanceMetrics.overall_loss_rate)}`}>
                  {(performanceMetrics.overall_loss_rate * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-red-800">Loss Rate</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Total Packets:</span>
                <span className="ml-2 font-medium">{performanceMetrics.total_packets_processed.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500">Late Rate:</span>
                <span className="ml-2 font-medium">{(performanceMetrics.overall_late_rate * 100).toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-gray-500">Concealment Rate:</span>
                <span className="ml-2 font-medium">{(performanceMetrics.overall_concealment_rate * 100).toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-gray-500">Avg Buffer Level:</span>
                <span className="ml-2 font-medium">{performanceMetrics.overall_average_buffer_level.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Buffer Management */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Buffer Management</h2>
            <button
              onClick={resetAllBuffers}
              disabled={isLoading}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              Reset All Buffers
            </button>
          </div>
          
          <div className="flex space-x-4 mb-4">
            <input
              type="text"
              value={newBufferSource}
              onChange={(e) => setNewBufferSource(e.target.value)}
              placeholder="Enter source ID"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              onClick={createBuffer}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Create Buffer
            </button>
          </div>
        </div>

        {/* Buffer List */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            Active Buffers ({Object.keys(bufferStatistics).length})
          </h2>
          
          {Object.keys(bufferStatistics).length === 0 ? (
            <p className="text-gray-500">No active jitter buffers</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(bufferStatistics).map(([sourceId, stats]) => (
                <div 
                  key={sourceId} 
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedBuffer === sourceId 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedBuffer(sourceId)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{getStateIcon(stats.buffer_status.state)}</span>
                      <div>
                        <h3 className="font-medium">{sourceId}</h3>
                        <span className={`text-sm ${getStateColor(stats.buffer_status.state)}`}>
                          {stats.buffer_status.state.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right text-sm">
                        <div className={`font-medium ${getLossRateColor(stats.loss_rate)}`}>
                          {(stats.loss_rate * 100).toFixed(2)}% loss
                        </div>
                        <div className={`${getJitterColor(stats.average_jitter_ms)}`}>
                          {stats.average_jitter_ms.toFixed(1)}ms jitter
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBuffer(sourceId);
                        }}
                        className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Buffer Size:</span>
                      <span className="ml-2">{stats.buffer_status.buffer_size}/{stats.buffer_status.target_buffer_size}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Packets:</span>
                      <span className="ml-2">{stats.total_packets.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Lost:</span>
                      <span className={`ml-2 ${getLossRateColor(stats.loss_rate)}`}>
                        {stats.lost_packets}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Late:</span>
                      <span className="ml-2">{stats.late_packets}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Concealed:</span>
                      <span className="ml-2">{stats.concealed_packets}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Uptime:</span>
                      <span className="ml-2">{formatUptime(stats.uptime_seconds)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Buffer Statistics */}
        {selectedBufferStats && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">
              Detailed Statistics: {selectedBuffer}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Packet Statistics */}
              <div>
                <h3 className="font-medium mb-3">Packet Statistics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Total Packets:</span>
                    <span className="font-medium">{selectedBufferStats.total_packets.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lost Packets:</span>
                    <span className={`font-medium ${getLossRateColor(selectedBufferStats.loss_rate)}`}>
                      {selectedBufferStats.lost_packets} ({(selectedBufferStats.loss_rate * 100).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Late Packets:</span>
                    <span className="font-medium">
                      {selectedBufferStats.late_packets} ({(selectedBufferStats.late_rate * 100).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duplicate Packets:</span>
                    <span className="font-medium">
                      {selectedBufferStats.duplicate_packets} ({(selectedBufferStats.duplicate_rate * 100).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Concealed Packets:</span>
                    <span className="font-medium">{selectedBufferStats.concealed_packets}</span>
                  </div>
                </div>
              </div>

              {/* Timing Statistics */}
              <div>
                <h3 className="font-medium mb-3">Timing & Jitter</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Average Jitter:</span>
                    <span className={`font-medium ${getJitterColor(selectedBufferStats.average_jitter_ms)}`}>
                      {selectedBufferStats.average_jitter_ms.toFixed(2)}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Jitter:</span>
                    <span className={`font-medium ${getJitterColor(selectedBufferStats.max_jitter_ms)}`}>
                      {selectedBufferStats.max_jitter_ms.toFixed(2)}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>95th Percentile Jitter:</span>
                    <span className={`font-medium ${getJitterColor(selectedBufferStats.p95_jitter_ms)}`}>
                      {selectedBufferStats.p95_jitter_ms.toFixed(2)}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target Delay:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.current_target_delay_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Expected Seq:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.next_expected_sequence}</span>
                  </div>
                </div>
              </div>

              {/* Buffer Status */}
              <div>
                <h3 className="font-medium mb-3">Buffer Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Current Size:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.buffer_size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target Size:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.target_buffer_size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Level:</span>
                    <span className="font-medium">{selectedBufferStats.average_buffer_level.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Level:</span>
                    <span className="font-medium">{selectedBufferStats.max_buffer_level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adaptive Sizing:</span>
                    <span className="font-medium">
                      {selectedBufferStats.buffer_status.config.adaptive_sizing ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div>
                <h3 className="font-medium mb-3">Configuration</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Target Delay:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.config.target_delay_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Min Delay:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.config.min_delay_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Delay:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.config.max_delay_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Packet Timeout:</span>
                    <span className="font-medium">{selectedBufferStats.buffer_status.config.packet_timeout_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Loss Concealment:</span>
                    <span className="font-medium">
                      {selectedBufferStats.buffer_status.config.loss_concealment ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <strong>Error:</strong> {error}
            <button
              onClick={() => setError(null)}
              className="float-right font-bold text-red-700 hover:text-red-900"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JitterBufferMonitor;