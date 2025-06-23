/**
 * RTMP Server Manager Component
 * Provides interface for managing the RTMP server and monitoring streams
 */

import React, { useState, useEffect } from 'react';

interface RTMPServerConfig {
  port: number;
  max_connections: number;
  timeout_seconds: number;
  recording_enabled: boolean;
  recording_path: string;
  enable_stats: boolean;
}

interface RTMPStreamInfo {
  stream_key: string;
  client_ip: string;
  app_name: string;
  stream_name: string;
  state: string;
  start_time: string;
  bytes_received: number;
  frames_received: number;
  bitrate_kbps: number;
  duration_seconds: number;
  audio_sample_rate: number;
  audio_channels: number;
}

interface RTMPServerStatus {
  state: string;
  uptime_seconds: number;
  total_connections: number;
  current_connections: number;
  active_streams: number;
}

export const RTMPServerManager: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<RTMPServerStatus | null>(null);
  const [activeStreams, setActiveStreams] = useState<Record<string, RTMPStreamInfo>>({});
  const [config, setConfig] = useState<RTMPServerConfig>({
    port: 1935,
    max_connections: 100,
    timeout_seconds: 30,
    recording_enabled: false,
    recording_path: './recordings',
    enable_stats: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState<any>(null);

  useEffect(() => {
    fetchServerStatus();
    fetchActiveStreams();
    fetchServerConfig();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchServerStatus();
      fetchActiveStreams();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchServerStatus = async () => {
    try {
      const response = await fetch('/api/rtmp/status');
      const data = await response.json();
      
      if (data.success) {
        setServerStatus(data.data.status);
      }
    } catch (err) {
      console.error('Error fetching server status:', err);
    }
  };

  const fetchActiveStreams = async () => {
    try {
      const response = await fetch('/api/rtmp/streams');
      const data = await response.json();
      
      if (data.success) {
        setActiveStreams(data.data.streams || {});
      }
    } catch (err) {
      console.error('Error fetching active streams:', err);
    }
  };

  const fetchServerConfig = async () => {
    try {
      const response = await fetch('/api/rtmp/config');
      const data = await response.json();
      
      if (data.success) {
        setConfig(data.data.config);
      }
    } catch (err) {
      console.error('Error fetching server config:', err);
    }
  };

  const startServer = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rtmp/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchServerStatus();
      } else {
        setError(data.message || 'Failed to start RTMP server');
      }
    } catch (err) {
      setError(`Error starting server: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopServer = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rtmp/stop', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchServerStatus();
        setActiveStreams({});
      } else {
        setError(data.message || 'Failed to stop RTMP server');
      }
    } catch (err) {
      setError(`Error stopping server: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectStream = async (streamKey: string) => {
    try {
      const response = await fetch(`/api/rtmp/streams/${streamKey}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchActiveStreams();
      } else {
        setError(data.message || 'Failed to disconnect stream');
      }
    } catch (err) {
      setError(`Error disconnecting stream: ${err}`);
    }
  };

  const fetchInstructions = async () => {
    try {
      const response = await fetch('/api/rtmp/instructions');
      const data = await response.json();
      
      if (data.success) {
        setInstructions(data.data.instructions);
        setShowInstructions(true);
      }
    } catch (err) {
      console.error('Error fetching instructions:', err);
    }
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const isServerRunning = serverStatus?.state === 'running';

  return (
    <div className="rtmp-server-manager p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          RTMP Server Manager
        </h1>

        {/* Server Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Server Status</h2>
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                isServerRunning ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className={`font-medium ${
                isServerRunning ? 'text-green-600' : 'text-red-600'
              }`}>
                {serverStatus?.state?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
          </div>

          {serverStatus && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {serverStatus.active_streams}
                </div>
                <div className="text-sm text-blue-800">Active Streams</div>
              </div>
              
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">
                  {serverStatus.current_connections}
                </div>
                <div className="text-sm text-green-800">Current Connections</div>
              </div>
              
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-600">
                  {serverStatus.total_connections}
                </div>
                <div className="text-sm text-purple-800">Total Connections</div>
              </div>
              
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="text-2xl font-bold text-orange-600">
                  {formatUptime(serverStatus.uptime_seconds)}
                </div>
                <div className="text-sm text-orange-800">Uptime</div>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              onClick={startServer}
              disabled={isLoading || isServerRunning}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isLoading ? 'Starting...' : 'Start Server'}
            </button>
            
            <button
              onClick={stopServer}
              disabled={isLoading || !isServerRunning}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {isLoading ? 'Stopping...' : 'Stop Server'}
            </button>
            
            <button
              onClick={fetchInstructions}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              OBS Setup Instructions
            </button>
          </div>
        </div>

        {/* Server Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Server Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Port
              </label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({...config, port: parseInt(e.target.value)})}
                disabled={isServerRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Connections
              </label>
              <input
                type="number"
                value={config.max_connections}
                onChange={(e) => setConfig({...config, max_connections: parseInt(e.target.value)})}
                disabled={isServerRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={config.timeout_seconds}
                onChange={(e) => setConfig({...config, timeout_seconds: parseInt(e.target.value)})}
                disabled={isServerRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recording Path
              </label>
              <input
                type="text"
                value={config.recording_path}
                onChange={(e) => setConfig({...config, recording_path: e.target.value})}
                disabled={isServerRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.recording_enabled}
                  onChange={(e) => setConfig({...config, recording_enabled: e.target.checked})}
                  disabled={isServerRunning}
                  className="mr-2"
                />
                Enable Recording
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.enable_stats}
                  onChange={(e) => setConfig({...config, enable_stats: e.target.checked})}
                  disabled={isServerRunning}
                  className="mr-2"
                />
                Enable Statistics
              </label>
            </div>
          </div>
        </div>

        {/* Active Streams */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Active Streams ({Object.keys(activeStreams).length})
          </h2>
          
          {Object.keys(activeStreams).length === 0 ? (
            <p className="text-gray-500">No active streams</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(activeStreams).map(([streamKey, stream]) => (
                <div key={streamKey} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-medium">{stream.stream_name}</h3>
                      <span className={`px-2 py-1 text-xs rounded ${
                        stream.state === 'publishing' ? 'bg-green-100 text-green-800' :
                        stream.state === 'connected' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {stream.state.toUpperCase()}
                      </span>
                    </div>
                    
                    <button
                      onClick={() => disconnectStream(streamKey)}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                    >
                      Disconnect
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Client:</span>
                      <span className="ml-2">{stream.client_ip}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Duration:</span>
                      <span className="ml-2">{formatUptime(stream.duration_seconds)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Bitrate:</span>
                      <span className="ml-2">{stream.bitrate_kbps.toFixed(1)} kbps</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Data:</span>
                      <span className="ml-2">{formatBytes(stream.bytes_received)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Audio:</span>
                      <span className="ml-2">{stream.audio_sample_rate}Hz, {stream.audio_channels}ch</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Frames:</span>
                      <span className="ml-2">{stream.frames_received}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Started:</span>
                      <span className="ml-2">{new Date(stream.start_time).toLocaleTimeString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">App:</span>
                      <span className="ml-2">{stream.app_name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

        {/* Instructions Modal */}
        {showInstructions && instructions && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl max-h-screen overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">OBS Setup Instructions</h3>
                <button
                  onClick={() => setShowInstructions(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium mb-2">OBS Settings</h4>
                  <div className="bg-gray-100 p-3 rounded">
                    <div><strong>Service:</strong> {instructions.obs_settings.service}</div>
                    <div><strong>Server:</strong> {instructions.obs_settings.server}</div>
                    <div><strong>Stream Key:</strong> {instructions.obs_settings.stream_key}</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Setup Steps</h4>
                  <ol className="list-decimal list-inside space-y-1">
                    {instructions.setup_steps.map((step: string, index: number) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Recommended Settings</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(instructions.recommended_settings).map(([key, value]) => (
                      <div key={key}>
                        <strong>{key.replace(/_/g, ' ')}:</strong> {value as string}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RTMPServerManager;