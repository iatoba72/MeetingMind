// Audio Statistics and Learning Mode Component
// Educational interface showing detailed audio metrics and streaming performance
// Helps users understand audio processing concepts and optimize their setup

import { useState, useEffect } from 'react';
import { AudioStats } from '../hooks/useAudioCapture';
import { StreamingStats } from '../hooks/useAudioStreaming';

interface AudioStatisticsProps {
  audioStats: AudioStats | null;
  streamingStats: StreamingStats | null;
  isLearningMode: boolean;
  onToggleLearningMode: (enabled: boolean) => void;
}

/**
 * AudioStatistics Component
 * 
 * This educational component provides comprehensive audio metrics and explanations:
 * 
 * Audio Format Metrics:
 * - Sample Rate: How many samples per second (Hz)
 * - Bit Rate: Data transmission rate (bits per second)
 * - Channels: Mono (1) vs Stereo (2) audio
 * - Chunk Size: Amount of data per transmission
 * 
 * Quality Metrics:
 * - Volume Levels: Current and peak audio levels
 * - Signal Quality: Assessment of audio clarity
 * - Latency: Time delay from capture to processing
 * - Packet Loss: Network transmission reliability
 * 
 * Performance Metrics:
 * - Throughput: Data transmission rate
 * - Buffer Status: Memory usage and efficiency
 * - Processing Rate: Chunks processed per second
 * - Error Rate: Percentage of failed operations
 * 
 * Learning Mode Features:
 * - Detailed explanations of each metric
 * - Real-time performance visualization
 * - Optimization recommendations
 * - Troubleshooting guidance
 */
export const AudioStatistics: React.FC<AudioStatisticsProps> = ({
  audioStats,
  streamingStats,
  isLearningMode,
  onToggleLearningMode
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'format' | 'quality' | 'performance' | 'network'>('format');
  const [historicalData, setHistoricalData] = useState<{
    volume: number[];
    latency: number[];
    throughput: number[];
    timestamp: number[];
  }>({
    volume: [],
    latency: [],
    throughput: [],
    timestamp: []
  });
  
  // Update historical data for trend analysis
  useEffect(() => {
    if (streamingStats) {
      const now = Date.now();
      setHistoricalData(prev => {
        const maxPoints = 60; // Keep last 60 data points (1 minute at 1Hz)
        
        return {
          volume: [...prev.volume.slice(-maxPoints + 1), streamingStats.currentVolume],
          latency: [...prev.latency.slice(-maxPoints + 1), streamingStats.networkLatency],
          throughput: [...prev.throughput.slice(-maxPoints + 1), streamingStats.throughput],
          timestamp: [...prev.timestamp.slice(-maxPoints + 1), now]
        };
      });
    }
  }, [streamingStats]);
  
  // Calculate trend indicators
  const getTrend = (data: number[]) => {
    if (data.length < 2) return 'stable';
    const recent = data.slice(-5); // Last 5 points
    const avg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const prev = data.slice(-10, -5); // Previous 5 points
    const prevAvg = prev.length > 0 ? prev.reduce((sum, val) => sum + val, 0) / prev.length : avg;
    
    const change = ((avg - prevAvg) / (prevAvg || 1)) * 100;
    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  };
  
  // Format numbers for display
  const formatNumber = (value: number, decimals: number = 1) => {
    return value.toFixed(decimals);
  };
  
  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };
  
  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };
  
  // Get status color based on value ranges
  const getStatusColor = (value: number, type: 'volume' | 'latency' | 'quality' | 'throughput') => {
    switch (type) {
      case 'volume':
        if (value < 0.1) return 'text-yellow-600'; // Too quiet
        if (value > 0.9) return 'text-red-600';    // Too loud
        return 'text-green-600';                   // Good level
        
      case 'latency':
        if (value < 100) return 'text-green-600';  // Excellent
        if (value < 300) return 'text-yellow-600'; // Good
        return 'text-red-600';                     // Poor
        
      case 'quality':
        if (value > 80) return 'text-green-600';   // High quality
        if (value > 60) return 'text-yellow-600';  // Medium quality
        return 'text-red-600';                     // Low quality
        
      case 'throughput':
        if (value > 1000) return 'text-green-600'; // High throughput
        if (value > 500) return 'text-yellow-600'; // Medium throughput
        return 'text-red-600';                     // Low throughput
        
      default:
        return 'text-gray-600';
    }
  };
  
  // Get optimization recommendations
  const getRecommendations = () => {
    const recommendations = [];
    
    if (streamingStats) {
      if (streamingStats.networkLatency > 300) {
        recommendations.push({
          type: 'warning',
          message: 'High network latency detected. Check your internet connection.',
          action: 'Consider reducing audio quality or chunk duration.'
        });
      }
      
      if (streamingStats.packetsLost > 5) {
        recommendations.push({
          type: 'error',
          message: 'Packet loss detected. Network connectivity issues.',
          action: 'Enable adaptive quality or switch to a more stable connection.'
        });
      }
      
      if (streamingStats.currentVolume < 0.1) {
        recommendations.push({
          type: 'info',
          message: 'Low audio level detected.',
          action: 'Increase microphone gain or move closer to the microphone.'
        });
      }
      
      if (streamingStats.bufferUtilization > 80) {
        recommendations.push({
          type: 'warning',
          message: 'High buffer utilization.',
          action: 'Network may be unable to keep up with audio streaming rate.'
        });
      }
    }
    
    return recommendations;
  };
  
  const categories = [
    { id: 'format', label: 'Audio Format', icon: '🎵' },
    { id: 'quality', label: 'Quality', icon: '📊' },
    { id: 'performance', label: 'Performance', icon: '⚡' },
    { id: 'network', label: 'Network', icon: '🌐' }
  ];
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header with Learning Mode Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Audio Statistics</h3>
        <label className="flex items-center space-x-2">
          <span className="text-sm text-gray-600">Learning Mode</span>
          <input
            type="checkbox"
            checked={isLearningMode}
            onChange={(e) => onToggleLearningMode(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      </div>
      
      {/* Category Navigation */}
      <div className="flex space-x-1 mb-4 bg-gray-100 p-1 rounded-lg">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id as any)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              selectedCategory === category.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-1">{category.icon}</span>
            {category.label}
          </button>
        ))}
      </div>
      
      {/* Statistics Content */}
      <div className="space-y-4">
        
        {/* Format Information */}
        {selectedCategory === 'format' && audioStats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="font-semibold text-blue-900">{audioStats.sampleRate} Hz</div>
                <div className="text-blue-700 text-xs">Sample Rate</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="font-semibold text-green-900">{audioStats.bitrate} bps</div>
                <div className="text-green-700 text-xs">Bit Rate</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className="font-semibold text-purple-900">{audioStats.channelCount}</div>
                <div className="text-purple-700 text-xs">Channels</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="font-semibold text-orange-900">{formatBytes(audioStats.averageChunkSize)}</div>
                <div className="text-orange-700 text-xs">Avg Chunk Size</div>
              </div>
            </div>
            
            {isLearningMode && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                <div className="font-semibold text-blue-900 mb-2">📚 Audio Format Explained:</div>
                <ul className="text-blue-800 space-y-1">
                  <li>• <strong>Sample Rate:</strong> Higher rates (44.1kHz) = better quality, more data</li>
                  <li>• <strong>Bit Rate:</strong> Compression level - higher = better quality, larger files</li>
                  <li>• <strong>Channels:</strong> 1 = Mono (speech), 2 = Stereo (music)</li>
                  <li>• <strong>Chunk Size:</strong> Smaller chunks = lower latency, more overhead</li>
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* Quality Metrics */}
        {selectedCategory === 'quality' && streamingStats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-green-50 rounded">
                <div className={`font-semibold ${getStatusColor(streamingStats.currentVolume, 'volume')}`}>
                  {formatNumber(streamingStats.currentVolume * 100, 0)}%
                </div>
                <div className="text-green-700 text-xs">Current Volume</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="font-semibold text-blue-900">
                  {formatNumber(streamingStats.peakVolume * 100, 0)}%
                </div>
                <div className="text-blue-700 text-xs">Peak Volume</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className={`font-semibold ${getStatusColor(streamingStats.qualityScore, 'quality')}`}>
                  {formatNumber(streamingStats.qualityScore, 0)}
                </div>
                <div className="text-purple-700 text-xs">Quality Score</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="font-semibold text-orange-900">
                  {streamingStats.dominantFrequency ? `${streamingStats.dominantFrequency} Hz` : 'N/A'}
                </div>
                <div className="text-orange-700 text-xs">Dominant Freq</div>
              </div>
            </div>
            
            {/* Volume Trend Indicator */}
            <div className="p-3 bg-gray-50 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Volume Trend</span>
                <span className="text-xs text-gray-500">
                  {getTrend(historicalData.volume) === 'increasing' && '📈 Increasing'}
                  {getTrend(historicalData.volume) === 'decreasing' && '📉 Decreasing'}
                  {getTrend(historicalData.volume) === 'stable' && '➡️ Stable'}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${streamingStats.currentVolume * 100}%` }}
                ></div>
              </div>
            </div>
            
            {isLearningMode && (
              <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                <div className="font-semibold text-green-900 mb-2">📊 Quality Metrics:</div>
                <ul className="text-green-800 space-y-1">
                  <li>• <strong>Volume:</strong> 30-80% is optimal for speech recognition</li>
                  <li>• <strong>Quality Score:</strong> Composite metric including latency and packet loss</li>
                  <li>• <strong>Dominant Frequency:</strong> Primary frequency component (speech ≈ 300-3000 Hz)</li>
                  <li>• <strong>Trends:</strong> Monitor for consistency and stability over time</li>
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* Performance Metrics */}
        {selectedCategory === 'performance' && streamingStats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="font-semibold text-blue-900">{streamingStats.chunkCount}</div>
                <div className="text-blue-700 text-xs">Chunks Processed</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="font-semibold text-green-900">
                  {formatDuration(streamingStats.streamingDuration)}
                </div>
                <div className="text-green-700 text-xs">Stream Duration</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className="font-semibold text-purple-900">{streamingStats.bufferSize}</div>
                <div className="text-purple-700 text-xs">Buffer Size</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="font-semibold text-orange-900">
                  {formatNumber(streamingStats.bufferUtilization, 0)}%
                </div>
                <div className="text-orange-700 text-xs">Buffer Usage</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm font-medium text-gray-700 mb-1">Processing Rate</div>
                <div className="text-lg font-semibold text-gray-900">
                  {streamingStats.streamingDuration > 0 
                    ? formatNumber(streamingStats.chunkCount / streamingStats.streamingDuration, 1)
                    : '0'
                  } chunks/sec
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm font-medium text-gray-700 mb-1">Data Processed</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatBytes(streamingStats.totalDataSent)}
                </div>
              </div>
            </div>
            
            {isLearningMode && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded text-sm">
                <div className="font-semibold text-purple-900 mb-2">⚡ Performance Indicators:</div>
                <ul className="text-purple-800 space-y-1">
                  <li>• <strong>Processing Rate:</strong> Should match chunk interval (4 chunks/sec for 250ms)</li>
                  <li>• <strong>Buffer Usage:</strong> High usage may indicate network bottlenecks</li>
                  <li>• <strong>Stream Duration:</strong> Total time audio has been streaming</li>
                  <li>• <strong>Data Volume:</strong> Total amount of audio data processed</li>
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* Network Metrics */}
        {selectedCategory === 'network' && streamingStats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-green-50 rounded">
                <div className={`font-semibold ${getStatusColor(streamingStats.networkLatency, 'latency')}`}>
                  {streamingStats.networkLatency} ms
                </div>
                <div className="text-green-700 text-xs">Latency</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className={`font-semibold ${getStatusColor(streamingStats.throughput, 'throughput')}`}>
                  {formatBytes(streamingStats.throughput)}/s
                </div>
                <div className="text-blue-700 text-xs">Throughput</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded">
                <div className="font-semibold text-red-900">{streamingStats.packetsLost}</div>
                <div className="text-red-700 text-xs">Packets Lost</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded">
                <div className="font-semibold text-yellow-900">{streamingStats.retransmissions}</div>
                <div className="text-yellow-700 text-xs">Retransmissions</div>
              </div>
            </div>
            
            {/* Network Quality Indicator */}
            <div className="p-3 bg-gray-50 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Network Quality</span>
                <span className={`text-xs font-medium ${getStatusColor(streamingStats.qualityScore, 'quality')}`}>
                  {streamingStats.networkLatency < 100 && streamingStats.packetsLost === 0 && '🟢 Excellent'}
                  {streamingStats.networkLatency < 300 && streamingStats.packetsLost < 2 && '🟡 Good'}
                  {(streamingStats.networkLatency >= 300 || streamingStats.packetsLost >= 2) && '🔴 Poor'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className={`w-full h-2 rounded ${
                    streamingStats.networkLatency < 100 ? 'bg-green-400' :
                    streamingStats.networkLatency < 300 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}></div>
                  <div className="mt-1">Latency</div>
                </div>
                <div className="text-center">
                  <div className={`w-full h-2 rounded ${
                    streamingStats.packetsLost === 0 ? 'bg-green-400' :
                    streamingStats.packetsLost < 3 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}></div>
                  <div className="mt-1">Reliability</div>
                </div>
                <div className="text-center">
                  <div className={`w-full h-2 rounded ${
                    streamingStats.throughput > 1000 ? 'bg-green-400' :
                    streamingStats.throughput > 500 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}></div>
                  <div className="mt-1">Throughput</div>
                </div>
              </div>
            </div>
            
            {isLearningMode && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded text-sm">
                <div className="font-semibold text-orange-900 mb-2">🌐 Network Performance:</div>
                <ul className="text-orange-800 space-y-1">
                  <li>• <strong>Latency:</strong> Round-trip time to server (&lt;100ms excellent)</li>
                  <li>• <strong>Throughput:</strong> Data transmission rate (higher is better)</li>
                  <li>• <strong>Packet Loss:</strong> Failed transmissions (0% is ideal)</li>
                  <li>• <strong>Retransmissions:</strong> Automatic retry attempts for failed packets</li>
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* Optimization Recommendations */}
        {isLearningMode && (
          <div className="mt-6">
            <h4 className="font-semibold text-gray-900 mb-3">💡 Optimization Recommendations</h4>
            <div className="space-y-2">
              {getRecommendations().map((rec, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border ${
                    rec.type === 'error' ? 'bg-red-50 border-red-200' :
                    rec.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className={`font-medium ${
                    rec.type === 'error' ? 'text-red-900' :
                    rec.type === 'warning' ? 'text-yellow-900' :
                    'text-blue-900'
                  }`}>
                    {rec.message}
                  </div>
                  <div className={`text-sm mt-1 ${
                    rec.type === 'error' ? 'text-red-700' :
                    rec.type === 'warning' ? 'text-yellow-700' :
                    'text-blue-700'
                  }`}>
                    {rec.action}
                  </div>
                </div>
              ))}
              
              {getRecommendations().length === 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <div className="font-medium text-green-900">✅ All systems optimal!</div>
                  <div className="text-sm text-green-700 mt-1">
                    Audio capture and streaming are performing well.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};