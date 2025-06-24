/**
 * Source Switcher Manager Component
 * Provides interface for managing automatic source switching
 */

import React, { useState, useEffect } from 'react';

interface AudioSource {
  source_id: string;
  source_type: string;
  name: string;
  state: string;
  priority: number;
  quality_score: number;
  last_activity: string;
  bytes_received: number;
  sample_rate: number;
  channels: number;
  bitrate_kbps: number;
  latency_ms: number;
  packet_loss_rate: number;
  signal_to_noise_ratio: number;
  metadata: Record<string, any>;
}

interface SwitcherConfig {
  switching_mode: string;
  auto_switch_enabled: boolean;
  fallback_timeout_seconds: number;
  quality_threshold: number;
  max_latency_ms: number;
  max_packet_loss_rate: number;
  min_signal_to_noise_ratio: number;
  priority_weights: Record<string, number>;
  blacklisted_sources: string[];
  preferred_sources: string[];
  sticky_switching: boolean;
  switch_cooldown_seconds: number;
}

interface SwitcherStats {
  total_switches: number;
  automatic_switches: number;
  manual_switches: number;
  failed_switches: number;
  switch_history: Array<{
    timestamp: string;
    from_source: string | null;
    to_source: string;
    reason: string;
    quality_score: number;
  }>;
  uptime_seconds: number;
  active_source_id: string | null;
  total_sources: number;
  available_sources: number;
}

export const SourceSwitcherManager: React.FC = () => {
  const [stats, setStats] = useState<SwitcherStats | null>(null);
  const [activeSource, setActiveSource] = useState<AudioSource | null>(null);
  const [allSources, setAllSources] = useState<Record<string, AudioSource>>({});
  const [config, setConfig] = useState<SwitcherConfig>({
    switching_mode: 'automatic',
    auto_switch_enabled: true,
    fallback_timeout_seconds: 5,
    quality_threshold: 0.7,
    max_latency_ms: 500,
    max_packet_loss_rate: 0.05,
    min_signal_to_noise_ratio: 10.0,
    priority_weights: {},
    blacklisted_sources: [],
    preferred_sources: [],
    sticky_switching: true,
    switch_cooldown_seconds: 3
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetchSwitcherStatus();
    fetchSwitcherConfig();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchSwitcherStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const fetchSwitcherStatus = async () => {
    try {
      const response = await fetch('/api/source-switcher/status');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data.stats);
        setActiveSource(data.data.active_source);
        setAllSources(data.data.sources || {});
      }
    } catch (err) {
      console.error('Error fetching switcher status:', err);
    }
  };

  const fetchSwitcherConfig = async () => {
    try {
      const response = await fetch('/api/source-switcher/config');
      const data = await response.json();
      
      if (data.success) {
        setConfig(data.data.config);
      }
    } catch (err) {
      console.error('Error fetching switcher config:', err);
    }
  };

  const startSwitcher = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/source-switcher/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchSwitcherStatus();
      } else {
        setError(data.message || 'Failed to start source switcher');
      }
    } catch (err) {
      setError(`Error starting switcher: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopSwitcher = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/source-switcher/stop', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchSwitcherStatus();
      } else {
        setError(data.message || 'Failed to stop source switcher');
      }
    } catch (err) {
      setError(`Error stopping switcher: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const switchToSource = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/source-switcher/switch/${sourceId}`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchSwitcherStatus();
      } else {
        setError(data.message || 'Failed to switch source');
      }
    } catch (err) {
      setError(`Error switching source: ${err}`);
    }
  };

  const triggerEvaluation = async () => {
    try {
      const response = await fetch('/api/source-switcher/evaluate', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchSwitcherStatus();
      } else {
        setError(data.message || 'Failed to trigger evaluation');
      }
    } catch (err) {
      setError(`Error triggering evaluation: ${err}`);
    }
  };

  const updateConfig = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/source-switcher/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchSwitcherConfig();
      } else {
        setError(data.message || 'Failed to update configuration');
      }
    } catch (err) {
      setError(`Error updating config: ${err}`);
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

  const getQualityColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    if (score >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  };

  const getLatencyColor = (latency: number): string => {
    if (latency < 100) return 'text-green-600';
    if (latency < 200) return 'text-yellow-600';
    if (latency < 400) return 'text-orange-600';
    return 'text-red-600';
  };

  const getPacketLossColor = (lossRate: number): string => {
    if (lossRate === 0) return 'text-green-600';
    if (lossRate < 0.01) return 'text-yellow-600';
    if (lossRate < 0.05) return 'text-orange-600';
    return 'text-red-600';
  };

  const getSourceTypeIcon = (sourceType: string): string => {
    switch (sourceType) {
      case 'microphone': return '🎤';
      case 'rtmp_stream': return '📺';
      case 'srt_stream': return '🚀';
      case 'network_audio': return '🌐';
      case 'file_playback': return '📁';
      default: return '🔊';
    }
  };

  const isRunning = stats && stats.total_sources > 0;

  return (
    <div className="source-switcher-manager p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          Automatic Source Switcher
        </h1>

        {/* Switcher Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Switcher Status</h2>
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                isRunning ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className={`font-medium ${
                isRunning ? 'text-green-600' : 'text-red-600'
              }`}>
                {isRunning ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {stats.total_sources}
                </div>
                <div className="text-sm text-blue-800">Total Sources</div>
              </div>
              
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">
                  {stats.available_sources}
                </div>
                <div className="text-sm text-green-800">Available Sources</div>
              </div>
              
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-600">
                  {stats.total_switches}
                </div>
                <div className="text-sm text-purple-800">Total Switches</div>
              </div>
              
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="text-2xl font-bold text-orange-600">
                  {formatUptime(stats.uptime_seconds)}
                </div>
                <div className="text-sm text-orange-800">Uptime</div>
              </div>
            </div>
          )}

          {/* Active Source Display */}
          {activeSource && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-green-800 mb-2">Active Source</h3>
              <div className="flex items-center space-x-4">
                <span className="text-2xl">{getSourceTypeIcon(activeSource.source_type)}</span>
                <div>
                  <div className="font-medium">{activeSource.name}</div>
                  <div className="text-sm text-gray-600">
                    Quality: <span className={getQualityColor(activeSource.quality_score)}>
                      {(activeSource.quality_score * 100).toFixed(1)}%
                    </span>
                    {' | '}
                    Latency: <span className={getLatencyColor(activeSource.latency_ms)}>
                      {activeSource.latency_ms.toFixed(1)}ms
                    </span>
                    {' | '}
                    Bitrate: {activeSource.bitrate_kbps.toFixed(1)} kbps
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              onClick={startSwitcher}
              disabled={isLoading || isRunning}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isLoading ? 'Starting...' : 'Start Switcher'}
            </button>
            
            <button
              onClick={stopSwitcher}
              disabled={isLoading || !isRunning}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {isLoading ? 'Stopping...' : 'Stop Switcher'}
            </button>
            
            <button
              onClick={triggerEvaluation}
              disabled={!isRunning}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Evaluate Sources
            </button>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Configuration</h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </button>
              <button
                onClick={updateConfig}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Update Config
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Switching Mode
              </label>
              <select
                value={config.switching_mode}
                onChange={(e) => setConfig({...config, switching_mode: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
                <option value="priority_based">Priority Based</option>
                <option value="quality_based">Quality Based</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quality Threshold
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={config.quality_threshold}
                onChange={(e) => setConfig({...config, quality_threshold: parseFloat(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fallback Timeout (seconds)
              </label>
              <input
                type="number"
                value={config.fallback_timeout_seconds}
                onChange={(e) => setConfig({...config, fallback_timeout_seconds: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Switch Cooldown (seconds)
              </label>
              <input
                type="number"
                value={config.switch_cooldown_seconds}
                onChange={(e) => setConfig({...config, switch_cooldown_seconds: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {showAdvanced && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Latency (ms)
                  </label>
                  <input
                    type="number"
                    value={config.max_latency_ms}
                    onChange={(e) => setConfig({...config, max_latency_ms: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Packet Loss Rate
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={config.max_packet_loss_rate}
                    onChange={(e) => setConfig({...config, max_packet_loss_rate: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Signal-to-Noise Ratio (dB)
                  </label>
                  <input
                    type="number"
                    value={config.min_signal_to_noise_ratio}
                    onChange={(e) => setConfig({...config, min_signal_to_noise_ratio: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </>
            )}
            
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.auto_switch_enabled}
                  onChange={(e) => setConfig({...config, auto_switch_enabled: e.target.checked})}
                  className="mr-2"
                />
                Auto Switch Enabled
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.sticky_switching}
                  onChange={(e) => setConfig({...config, sticky_switching: e.target.checked})}
                  className="mr-2"
                />
                Sticky Switching
              </label>
            </div>
          </div>
        </div>

        {/* Available Sources */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            Available Sources ({Object.keys(allSources).length})
          </h2>
          
          {Object.keys(allSources).length === 0 ? (
            <p className="text-gray-500">No sources registered</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(allSources).map(([sourceId, source]) => (
                <div key={sourceId} className={`border rounded-lg p-4 ${
                  source.source_id === activeSource?.source_id 
                    ? 'border-green-300 bg-green-50' 
                    : 'border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getSourceTypeIcon(source.source_type)}</span>
                      <div>
                        <h3 className="font-medium">{source.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded ${
                          source.state === 'active' ? 'bg-green-100 text-green-800' :
                          source.state === 'available' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {source.state.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${getQualityColor(source.quality_score)}`}>
                        {(source.quality_score * 100).toFixed(1)}%
                      </span>
                      {source.state === 'available' && (
                        <button
                          onClick={() => switchToSource(sourceId)}
                          className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2">{source.source_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Priority:</span>
                      <span className="ml-2">{source.priority}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Bitrate:</span>
                      <span className="ml-2">{source.bitrate_kbps.toFixed(1)} kbps</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Latency:</span>
                      <span className={`ml-2 ${getLatencyColor(source.latency_ms)}`}>
                        {source.latency_ms.toFixed(1)}ms
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Packet Loss:</span>
                      <span className={`ml-2 ${getPacketLossColor(source.packet_loss_rate)}`}>
                        {(source.packet_loss_rate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">SNR:</span>
                      <span className="ml-2">{source.signal_to_noise_ratio.toFixed(1)} dB</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Audio:</span>
                      <span className="ml-2">{source.sample_rate}Hz, {source.channels}ch</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Last Activity:</span>
                      <span className="ml-2">{new Date(source.last_activity).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Switch History */}
        {stats && stats.switch_history && stats.switch_history.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Switches</h2>
            <div className="space-y-2">
              {stats.switch_history.slice(-10).reverse().map((switchEvent, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">
                      {new Date(switchEvent.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-sm">
                      {switchEvent.from_source ? `${switchEvent.from_source} →` : 'Started with'} {switchEvent.to_source}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded ${
                      switchEvent.reason === 'manual' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {switchEvent.reason}
                    </span>
                  </div>
                  <span className={`text-sm ${getQualityColor(switchEvent.quality_score)}`}>
                    {(switchEvent.quality_score * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
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

export default SourceSwitcherManager;