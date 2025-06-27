/**
 * SRT Server Manager Component
 * Provides interface for managing the SRT server and monitoring streams
 */

import React, { useState, useEffect } from 'react';

interface SRTServerConfig {
  port: number;
  max_connections: number;
  latency_ms: number;
  recv_buffer_size: number;
  peer_latency_ms: number;
  passphrase: string | null;
  pbkeylen: number;
  recording_enabled: boolean;
  recording_path: string;
  enable_stats: boolean;
  timeout_seconds: number;
  max_bw: number;
  inputbw: number;
}

interface SRTStreamInfo {
  stream_id: string;
  client_ip: string;
  client_port: number;
  stream_name: string;
  state: string;
  start_time: string;
  last_activity: string;
  bytes_received: number;
  packets_received: number;
  packets_lost: number;
  packets_retransmitted: number;
  rtt_ms: number;
  bandwidth_mbps: number;
  bitrate_kbps: number;
  resolution: string;
  fps: number;
  codec: string;
  audio_codec: string;
  audio_sample_rate: number;
  audio_channels: number;
  duration_seconds: number;
  latency_ms: number;
}

interface SRTServerStatus {
  state: string;
  uptime_seconds: number;
  total_connections: number;
  current_connections: number;
  active_streams: number;
  average_latency_ms: number;
  average_bandwidth_mbps: number;
  total_packets_lost: number;
  total_packets_retransmitted: number;
}

export const SRTServerManager: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<SRTServerStatus | null>(null);
  const [activeStreams, setActiveStreams] = useState<Record<string, SRTStreamInfo>>({});
  const [config, setConfig] = useState<SRTServerConfig>({
    port: 9998,
    max_connections: 50,
    latency_ms: 200,
    recv_buffer_size: 12058624,
    peer_latency_ms: 0,
    passphrase: null,
    pbkeylen: 16,
    recording_enabled: false,
    recording_path: './recordings',
    enable_stats: true,
    timeout_seconds: 30,
    max_bw: -1,
    inputbw: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState<any>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetchServerStatus();
    fetchActiveStreams();
    fetchServerConfig();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchServerStatus();
      fetchActiveStreams();
    }, 3000); // More frequent updates for SRT

    return () => clearInterval(interval);
  }, []);

  const fetchServerStatus = async () => {
    try {
      const response = await fetch('/api/srt/status');
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
      const response = await fetch('/api/srt/streams');
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
      const response = await fetch('/api/srt/config');
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
      const response = await fetch('/api/srt/start', {
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
        setError(data.message || 'Failed to start SRT server');
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
      const response = await fetch('/api/srt/stop', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchServerStatus();
        setActiveStreams({});
      } else {
        setError(data.message || 'Failed to stop SRT server');
      }
    } catch (err) {
      setError(`Error stopping server: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectStream = async (streamId: string) => {
    try {
      const response = await fetch(`/api/srt/streams/${streamId}`, {
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
      const response = await fetch('/api/srt/instructions');
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

  const getPacketLossColor = (lossRate: number): string => {
    if (lossRate === 0) return 'text-green-600';
    if (lossRate < 1) return 'text-yellow-600';
    if (lossRate < 5) return 'text-orange-600';
    return 'text-red-600';
  };

  const getLatencyColor = (latency: number): string => {
    if (latency < 50) return 'text-green-600';
    if (latency < 100) return 'text-yellow-600';
    if (latency < 200) return 'text-orange-600';
    return 'text-red-600';
  };

  const isServerRunning = serverStatus?.state === 'running';

  return (
    <div className="srt-server-manager p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          SRT Server Manager
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
                <div className={`text-2xl font-bold ${getLatencyColor(serverStatus.average_latency_ms)}`}>
                  {serverStatus.average_latency_ms.toFixed(1)}ms
                </div>
                <div className="text-sm text-purple-800">Avg Latency</div>
              </div>
              
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="text-2xl font-bold text-orange-600">
                  {serverStatus.average_bandwidth_mbps.toFixed(1)} Mbps
                </div>
                <div className="text-sm text-orange-800">Avg Bandwidth</div>
              </div>
            </div>
          )}

          {/* Packet Loss Statistics */}
          {serverStatus && (serverStatus.total_packets_lost > 0 || serverStatus.total_packets_retransmitted > 0) && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-red-50 rounded">
                <div className="text-2xl font-bold text-red-600">
                  {serverStatus.total_packets_lost}
                </div>
                <div className="text-sm text-red-800">Packets Lost</div>
              </div>
              
              <div className="text-center p-3 bg-yellow-50 rounded">
                <div className="text-2xl font-bold text-yellow-600">
                  {serverStatus.total_packets_retransmitted}
                </div>
                <div className="text-sm text-yellow-800">Packets Retransmitted</div>
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
              OBS SRT Setup
            </button>
          </div>
        </div>

        {/* Server Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Server Configuration</h2>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
            >
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>
          
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
                Latency (ms)
              </label>
              <input
                type="number"
                value={config.latency_ms}
                onChange={(e) => setConfig({...config, latency_ms: parseInt(e.target.value)})}
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

            {showAdvanced && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Passphrase (Optional)
                  </label>
                  <input
                    type="password"
                    value={config.passphrase || ''}
                    onChange={(e) => setConfig({...config, passphrase: e.target.value || null})}
                    disabled={isServerRunning}
                    placeholder="Leave empty for no encryption"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Length
                  </label>
                  <select
                    value={config.pbkeylen}
                    onChange={(e) => setConfig({...config, pbkeylen: parseInt(e.target.value)})}
                    disabled={isServerRunning}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                  >
                    <option value={16}>16 (AES-128)</option>
                    <option value={24}>24 (AES-192)</option>
                    <option value={32}>32 (AES-256)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Bandwidth (bps, -1 = unlimited)
                  </label>
                  <input
                    type="number"
                    value={config.max_bw}
                    onChange={(e) => setConfig({...config, max_bw: parseInt(e.target.value)})}
                    disabled={isServerRunning}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Input Bandwidth (bps, 0 = auto)
                  </label>
                  <input
                    type="number"
                    value={config.inputbw}
                    onChange={(e) => setConfig({...config, inputbw: parseInt(e.target.value)})}
                    disabled={isServerRunning}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                  />
                </div>
              </>
            )}
            
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
              {Object.entries(activeStreams).map(([streamId, stream]) => {
                const packetLossRate = stream.packets_received > 0 
                  ? (stream.packets_lost / stream.packets_received) * 100 
                  : 0;
                const retransmissionRate = stream.packets_received > 0 
                  ? (stream.packets_retransmitted / stream.packets_received) * 100 
                  : 0;

                return (
                  <div key={streamId} className="border border-gray-200 rounded-lg p-4">
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
                        onClick={() => disconnectStream(streamId)}
                        className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                      >
                        Disconnect
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
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
                        <span className="text-gray-500">Bandwidth:</span>
                        <span className="ml-2">{stream.bandwidth_mbps.toFixed(1)} Mbps</span>
                      </div>
                      <div>
                        <span className="text-gray-500">RTT:</span>
                        <span className={`ml-2 ${getLatencyColor(stream.rtt_ms)}`}>
                          {stream.rtt_ms.toFixed(1)}ms
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Latency:</span>
                        <span className="ml-2">{stream.latency_ms}ms</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Packets:</span>
                        <span className="ml-2">{stream.packets_received}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Lost:</span>
                        <span className={`ml-2 ${getPacketLossColor(packetLossRate)}`}>
                          {stream.packets_lost} ({packetLossRate.toFixed(2)}%)
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Retrans:</span>
                        <span className="ml-2">{stream.packets_retransmitted} ({retransmissionRate.toFixed(2)}%)</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Audio:</span>
                        <span className="ml-2">{stream.audio_sample_rate}Hz, {stream.audio_channels}ch</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Started:</span>
                        <span className="ml-2">{new Date(stream.start_time).toLocaleTimeString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Data:</span>
                        <span className="ml-2">{formatBytes(stream.bytes_received)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                <h3 className="text-xl font-semibold">OBS SRT Setup Instructions</h3>
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
                    <div><strong>Latency:</strong> {instructions.obs_settings.latency_ms}ms</div>
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

                <div>
                  <h4 className="font-medium mb-2">Advanced Settings</h4>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    {Object.entries(instructions.advanced_settings).map(([key, value]) => (
                      <div key={key}>
                        <strong>{key}:</strong> {value as string}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Troubleshooting</h4>
                  <div className="space-y-2 text-sm">
                    {Object.entries(instructions.troubleshooting).map(([key, value]) => (
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

export default SRTServerManager;