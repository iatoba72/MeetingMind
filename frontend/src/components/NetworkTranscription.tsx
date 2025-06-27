/**
 * Network Transcription Component
 * Real-time transcription interface with network stream support
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TranscriptionSegment {
  id: string;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
  language: string;
  audio_quality: number;
  model_used: string;
  processing_latency_ms: number;
  timestamp: string;
}

interface StreamStatistics {
  stream_id: string;
  buffer_duration_s: number;
  buffer_fill_percent: number;
  resync_count: number;
  average_quality: number;
  average_packet_loss: number;
  last_transcription_age_s: number;
}

interface SyncStatistics {
  stream_id: string;
  current_av_offset_ms: number;
  current_sync_confidence: number;
  recent_drift_corrections: number;
  buffered_segments: number;
  video_fps: number;
  keyframes_detected: number;
  scene_changes_detected: number;
}

interface GlobalStatistics {
  transcription: {
    total_segments: number;
    average_latency_ms: number;
    quality_distribution: {
      high: number;
      medium: number;
      low: number;
    };
    model_usage: Record<string, number>;
    active_streams: number;
    is_running: boolean;
  };
  synchronization: {
    total_streams: number;
    active_streams: number;
    average_sync_quality: number;
    total_drift_corrections: number;
  };
}

interface ModelInfo {
  name: string;
  size_mb: number;
  speed: string;
  quality: string;
  recommended_for: string[];
}

export const NetworkTranscription: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stream management
  const [streams, setStreams] = useState<string[]>([]);
  const [selectedStream, setSelectedStream] = useState<string>('');
  const [streamStatistics, setStreamStatistics] = useState<StreamStatistics | null>(null);
  const [syncStatistics, setSyncStatistics] = useState<SyncStatistics | null>(null);
  
  // Global data
  const [globalStats, setGlobalStats] = useState<GlobalStatistics | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [transcriptionSegments, setTranscriptionSegments] = useState<TranscriptionSegment[]>([]);
  
  // Configuration
  const [streamConfig, setStreamConfig] = useState({
    model_size: 'base',
    language: '',
    task: 'transcribe',
    latency_mode: 'balanced',
    adaptive_model_selection: true,
    chunk_duration_s: 30.0,
    max_concurrent_streams: 4
  });
  
  // WebSocket connection
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Audio simulation
  const [isSimulating, setIsSimulating] = useState(false);
  const simulationRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadAvailableModels();
    loadGlobalStatistics();
    
    // Set up periodic statistics updates
    const statsInterval = setInterval(() => {
      loadGlobalStatistics();
      if (selectedStream) {
        loadStreamStatistics();
      }
    }, 5000);

    return () => {
      clearInterval(statsInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
      }
    };
  }, [selectedStream]);

  const loadAvailableModels = async () => {
    try {
      const response = await fetch('/api/network-transcription/models/available');
      const data = await response.json();
      
      if (data.success) {
        setAvailableModels(data.data.models);
      }
    } catch (err) {
      console.error('Error loading models:', err);
    }
  };

  const loadGlobalStatistics = async () => {
    try {
      const response = await fetch('/api/network-transcription/statistics/global');
      const data = await response.json();
      
      if (data.success) {
        setGlobalStats(data.data);
      }
    } catch (err) {
      console.error('Error loading global statistics:', err);
    }
  };

  const loadStreamStatistics = async () => {
    if (!selectedStream) return;
    
    try {
      const response = await fetch(`/api/network-transcription/streams/${selectedStream}/statistics`);
      const data = await response.json();
      
      if (data.success) {
        setStreamStatistics(data.data.transcription);
        setSyncStatistics(data.data.synchronization);
      }
    } catch (err) {
      console.error('Error loading stream statistics:', err);
    }
  };

  const createStream = async () => {
    setIsLoading(true);
    setError(null);
    
    const streamId = `stream_${Date.now()}`;
    
    try {
      const response = await fetch(`/api/network-transcription/streams/${streamId}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamConfig)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStreams(prev => [...prev, streamId]);
        setSelectedStream(streamId);
        
        // Connect WebSocket for real-time updates
        connectWebSocket(streamId);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Failed to create stream: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const removeStream = async (streamId: string) => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`/api/network-transcription/streams/${streamId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStreams(prev => prev.filter(id => id !== streamId));
        if (selectedStream === streamId) {
          setSelectedStream('');
          setStreamStatistics(null);
          setSyncStatistics(null);
        }
        
        // Disconnect WebSocket
        if (wsRef.current) {
          wsRef.current.close();
          setIsConnected(false);
        }
      }
    } catch (err) {
      setError(`Failed to remove stream: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebSocket = (streamId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const wsUrl = `ws://localhost:8000/api/network-transcription/streams/${streamId}/ws`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      setIsConnected(true);
      console.log(`WebSocket connected for stream ${streamId}`);
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'transcription') {
          setTranscriptionSegments(prev => [message.segment, ...prev.slice(0, 49)]); // Keep last 50
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };
    
    wsRef.current.onclose = () => {
      setIsConnected(false);
      console.log(`WebSocket disconnected for stream ${streamId}`);
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
  };

  const simulateAudioStream = () => {
    if (!selectedStream) {
      setError('Please select a stream first');
      return;
    }
    
    if (isSimulating) {
      // Stop simulation
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
      setIsSimulating(false);
      return;
    }
    
    // Start simulation
    setIsSimulating(true);
    let sequenceNumber = 0;
    let timestamp = 0;
    
    simulationRef.current = setInterval(async () => {
      try {
        // Generate fake audio data (white noise)
        const sampleRate = 16000;
        const chunkDuration = 0.02; // 20ms chunks
        const chunkSize = Math.floor(sampleRate * chunkDuration);
        const audioData = Array.from({ length: chunkSize }, () => (Math.random() - 0.5) * 0.1);
        
        // Simulate quality metrics
        const qualityMetrics = {
          snr_db: 15 + Math.random() * 10,
          thd_percent: Math.random() * 2,
          packet_loss: Math.random() * 1,
          jitter_ms: Math.random() * 20,
          bitrate_kbps: 128,
          overall_quality: 0.7 + Math.random() * 0.3
        };
        
        await fetch(`/api/network-transcription/streams/${selectedStream}/audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream_id: selectedStream,
            audio_data: audioData,
            timestamp: timestamp,
            sample_rate: sampleRate,
            sequence_number: sequenceNumber,
            quality_metrics: qualityMetrics
          })
        });
        
        sequenceNumber++;
        timestamp += chunkDuration;
        
      } catch (err) {
        console.error('Error sending simulated audio:', err);
      }
    }, 20); // Send every 20ms
  };

  const resyncStream = async () => {
    if (!selectedStream) return;
    
    try {
      const response = await fetch(`/api/network-transcription/streams/${selectedStream}/resync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_timestamp: Date.now() / 1000,
          video_frame_number: Math.floor(Math.random() * 1000)
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('Stream resynced successfully');
        loadStreamStatistics();
      }
    } catch (err) {
      setError(`Failed to resync stream: ${err}`);
    }
  };

  const getQualityColor = (quality: number) => {
    if (quality >= 0.8) return 'text-green-600';
    if (quality >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLatencyColor = (latency: number) => {
    if (latency <= 1000) return 'text-green-600';
    if (latency <= 3000) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="network-transcription p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            Network Transcription
          </h1>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-sm ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            <button
              onClick={createStream}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : '➕ New Stream'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: '📊' },
                { id: 'streams', label: 'Streams', icon: '🔊' },
                { id: 'transcription', label: 'Live Transcription', icon: '📝' },
                { id: 'models', label: 'Models', icon: '🤖' },
                { id: 'sync', label: 'Video Sync', icon: '🎬' },
                { id: 'settings', label: 'Settings', icon: '⚙️' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Transcription Overview</h2>
                
                {globalStats && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium text-gray-700 mb-2">Active Streams</h3>
                      <div className="text-3xl font-bold text-blue-600">
                        {globalStats.transcription.active_streams}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Total: {globalStats.synchronization.total_streams}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium text-gray-700 mb-2">Total Segments</h3>
                      <div className="text-3xl font-bold text-green-600">
                        {globalStats.transcription.total_segments}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Transcribed
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium text-gray-700 mb-2">Avg Latency</h3>
                      <div className={`text-3xl font-bold ${getLatencyColor(globalStats.transcription.average_latency_ms)}`}>
                        {globalStats.transcription.average_latency_ms.toFixed(0)}ms
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Processing time
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium text-gray-700 mb-2">Sync Quality</h3>
                      <div className={`text-3xl font-bold ${getQualityColor(globalStats.synchronization.average_sync_quality)}`}>
                        {(globalStats.synchronization.average_sync_quality * 100).toFixed(0)}%
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        A/V sync accuracy
                      </div>
                    </div>
                  </div>
                )}

                {/* Quality Distribution Chart */}
                {globalStats && (
                  <div className="bg-white border rounded-lg p-4">
                    <h3 className="font-medium mb-3">Quality Distribution</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {globalStats.transcription.quality_distribution.high}
                        </div>
                        <div className="text-sm text-gray-600">High Quality</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                          {globalStats.transcription.quality_distribution.medium}
                        </div>
                        <div className="text-sm text-gray-600">Medium Quality</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {globalStats.transcription.quality_distribution.low}
                        </div>
                        <div className="text-sm text-gray-600">Low Quality</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Streams Tab */}
            {activeTab === 'streams' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Stream Management</h2>
                  <select
                    value={selectedStream}
                    onChange={(e) => setSelectedStream(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select Stream</option>
                    {streams.map(streamId => (
                      <option key={streamId} value={streamId}>{streamId}</option>
                    ))}
                  </select>
                </div>

                {streams.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <div className="text-gray-500 mb-4">No active streams</div>
                    <button
                      onClick={createStream}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Create First Stream
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Stream Statistics */}
                    {streamStatistics && (
                      <div className="bg-white border rounded-lg p-4">
                        <h3 className="font-medium mb-3">Stream Statistics</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Buffer Duration:</span>
                            <span className="font-medium">{streamStatistics.buffer_duration_s.toFixed(1)}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Buffer Fill:</span>
                            <span className="font-medium">{streamStatistics.buffer_fill_percent.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Resync Count:</span>
                            <span className="font-medium">{streamStatistics.resync_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Audio Quality:</span>
                            <span className={`font-medium ${getQualityColor(streamStatistics.average_quality)}`}>
                              {(streamStatistics.average_quality * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Packet Loss:</span>
                            <span className="font-medium">{streamStatistics.average_packet_loss.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sync Statistics */}
                    {syncStatistics && (
                      <div className="bg-white border rounded-lg p-4">
                        <h3 className="font-medium mb-3">Synchronization</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>A/V Offset:</span>
                            <span className="font-medium">{syncStatistics.current_av_offset_ms.toFixed(1)}ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sync Confidence:</span>
                            <span className={`font-medium ${getQualityColor(syncStatistics.current_sync_confidence)}`}>
                              {(syncStatistics.current_sync_confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Video FPS:</span>
                            <span className="font-medium">{syncStatistics.video_fps.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Keyframes:</span>
                            <span className="font-medium">{syncStatistics.keyframes_detected}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Scene Changes:</span>
                            <span className="font-medium">{syncStatistics.scene_changes_detected}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Stream Controls */}
                {selectedStream && (
                  <div className="bg-white border rounded-lg p-4">
                    <h3 className="font-medium mb-3">Stream Controls</h3>
                    <div className="flex space-x-3">
                      <button
                        onClick={simulateAudioStream}
                        className={`px-4 py-2 rounded ${
                          isSimulating 
                            ? 'bg-red-500 text-white hover:bg-red-600' 
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {isSimulating ? '⏹️ Stop Simulation' : '▶️ Start Audio Simulation'}
                      </button>
                      
                      <button
                        onClick={resyncStream}
                        className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                      >
                        🔄 Resync Stream
                      </button>
                      
                      <button
                        onClick={() => removeStream(selectedStream)}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        🗑️ Remove Stream
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Live Transcription Tab */}
            {activeTab === 'transcription' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Live Transcription</h2>
                  <div className="text-sm text-gray-600">
                    Showing last {transcriptionSegments.length} segments
                  </div>
                </div>

                {transcriptionSegments.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <div className="text-gray-500 mb-4">No transcription data</div>
                    <div className="text-sm text-gray-400">
                      Start audio simulation on a stream to see transcriptions
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {transcriptionSegments.map((segment, index) => (
                      <div key={segment.id} className="bg-white border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="text-lg">{segment.text}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {segment.start_time.toFixed(1)}s - {segment.end_time.toFixed(1)}s
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <div className={`text-sm font-medium ${getQualityColor(segment.confidence)}`}>
                              {(segment.confidence * 100).toFixed(0)}% confidence
                            </div>
                            <div className="text-xs text-gray-500">
                              {segment.model_used} • {segment.processing_latency_ms.toFixed(0)}ms
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Quality: {(segment.audio_quality * 100).toFixed(0)}%</span>
                          <span>Language: {segment.language}</span>
                          <span>{new Date(segment.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Models Tab */}
            {activeTab === 'models' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Available Models</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableModels.map((model) => (
                    <div key={model.name} className="bg-white border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{model.name}</h3>
                        <span className="text-sm text-gray-500">{model.size_mb}MB</span>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Speed:</span>
                          <span className="font-medium">{model.speed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Quality:</span>
                          <span className="font-medium">{model.quality}</span>
                        </div>
                      </div>
                      
                      <div className="mt-3">
                        <div className="text-xs text-gray-600 mb-1">Recommended for:</div>
                        <div className="flex flex-wrap gap-1">
                          {model.recommended_for.map((use, index) => (
                            <span key={index} className="px-2 py-1 bg-gray-100 text-xs rounded">
                              {use}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Transcription Settings</h2>
                
                <div className="bg-white border rounded-lg p-6">
                  <h3 className="font-medium mb-4">Stream Configuration</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Model Size
                      </label>
                      <select
                        value={streamConfig.model_size}
                        onChange={(e) => setStreamConfig({...streamConfig, model_size: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="tiny">Tiny (fastest)</option>
                        <option value="base">Base (balanced)</option>
                        <option value="small">Small (good quality)</option>
                        <option value="medium">Medium (high quality)</option>
                        <option value="large-v3">Large-v3 (best quality)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Language
                      </label>
                      <input
                        type="text"
                        value={streamConfig.language}
                        onChange={(e) => setStreamConfig({...streamConfig, language: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="Auto-detect (leave empty)"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Latency Mode
                      </label>
                      <select
                        value={streamConfig.latency_mode}
                        onChange={(e) => setStreamConfig({...streamConfig, latency_mode: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="low_latency">Low Latency</option>
                        <option value="balanced">Balanced</option>
                        <option value="high_accuracy">High Accuracy</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chunk Duration (seconds)
                      </label>
                      <input
                        type="number"
                        value={streamConfig.chunk_duration_s}
                        onChange={(e) => setStreamConfig({...streamConfig, chunk_duration_s: parseFloat(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        min="5"
                        max="60"
                        step="5"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Concurrent Streams
                      </label>
                      <input
                        type="number"
                        value={streamConfig.max_concurrent_streams}
                        onChange={(e) => setStreamConfig({...streamConfig, max_concurrent_streams: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        min="1"
                        max="10"
                      />
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="adaptive_model"
                        checked={streamConfig.adaptive_model_selection}
                        onChange={(e) => setStreamConfig({...streamConfig, adaptive_model_selection: e.target.checked})}
                        className="mr-2"
                      />
                      <label htmlFor="adaptive_model" className="text-sm text-gray-700">
                        Adaptive Model Selection
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
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

export default NetworkTranscription;