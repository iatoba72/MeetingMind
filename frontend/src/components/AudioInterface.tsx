// Main Audio Interface Component
// Combines all audio functionality into a comprehensive interface
// Demonstrates real-time audio capture, streaming, and visualization

import { useState, useCallback } from 'react';
import { useAudioStreaming } from '../hooks/useAudioStreaming';
import { AudioVisualizer } from './AudioVisualizer';
import { AudioDeviceSelector } from './AudioDeviceSelector';
import { AudioStatistics } from './AudioStatistics';

interface AudioInterfaceProps {
  clientId: string;
  websocketUrl: string;
}

/**
 * AudioInterface Component
 * 
 * This is the main audio interface that demonstrates a complete
 * real-time audio streaming system. It combines:
 * 
 * Audio Capture Pipeline:
 * 1. Device selection and permission management
 * 2. MediaRecorder API for audio capture
 * 3. Real-time audio analysis with Web Audio API
 * 4. Audio visualization (waveform and frequency spectrum)
 * 
 * Streaming Pipeline:
 * 1. Audio chunking (250ms segments)
 * 2. WebSocket binary data transmission
 * 3. Server-side audio processing
 * 4. Quality monitoring and adaptive streaming
 * 
 * Educational Features:
 * 1. Real-time statistics and performance metrics
 * 2. Learning mode with detailed explanations
 * 3. Audio format and quality information
 * 4. Network performance monitoring
 * 
 * Production Considerations:
 * - Error handling and recovery
 * - Device switching during recording
 * - Network disconnection handling
 * - Audio quality optimization
 * - Latency monitoring and optimization
 */
export const AudioInterface: React.FC<AudioInterfaceProps> = ({
  clientId,
  websocketUrl
}) => {
  // UI state management
  const [activeTab, setActiveTab] = useState<'device' | 'visualizer' | 'stats'>('device');
  const [isLearningMode, setIsLearningMode] = useState(true);
  const [audioConfig, setAudioConfig] = useState({
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 32000,
    sampleRate: 16000,
    channelCount: 1,
    chunkDuration: 250,
    enableAnalysis: true,
    fftSize: 1024
  });
  
  // Audio streaming hook with all functionality
  const audioStreaming = useAudioStreaming({
    websocketUrl,
    clientId,
    ...audioConfig
  });
  
  // Handle audio configuration changes
  const handleConfigChange = useCallback((key: string, value: string | number | boolean) => {
    setAudioConfig(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);
  
  // Initialize audio session when starting
  const handleStartStreaming = useCallback(async () => {
    try {
      // Send audio session start message
      audioStreaming.audioCapture.sendMessage?.('audio_start_session', {
        config: audioConfig
      });
      
      // Start streaming
      await audioStreaming.startStreaming();
    } catch (error) {
      console.error('Failed to start audio streaming:', error);
    }
  }, [audioStreaming, audioConfig]);
  
  // Get current audio status
  const getAudioStatus = () => {
    if (audioStreaming.streamingError) {
      return { status: 'error', message: audioStreaming.streamingError, color: 'text-red-600' };
    }
    
    if (audioStreaming.isStreaming) {
      return { status: 'streaming', message: 'Audio streaming active', color: 'text-green-600' };
    }
    
    if (audioStreaming.audioCapture.isRecording) {
      return { status: 'recording', message: 'Recording audio locally', color: 'text-blue-600' };
    }
    
    if (audioStreaming.isConnected) {
      return { status: 'connected', message: 'Connected, ready to stream', color: 'text-gray-600' };
    }
    
    return { status: 'disconnected', message: 'Not connected', color: 'text-gray-400' };
  };
  
  const audioStatus = getAudioStatus();
  
  return (
    <div className="space-y-6">
      {/* Audio Interface Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Audio Capture & Streaming</h2>
            <p className="text-gray-600 mt-1">
              Real-time audio processing with WebSocket streaming
            </p>
          </div>
          
          {/* Audio Status Indicator */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className={`text-sm font-medium ${audioStatus.color}`}>
                {audioStatus.message}
              </div>
              <div className="text-xs text-gray-500">
                {audioStreaming.streamingStats ? 
                  `${audioStreaming.streamingStats.chunkCount} chunks processed` :
                  'No audio data'
                }
              </div>
            </div>
            <div className={`w-4 h-4 rounded-full ${
              audioStreaming.isStreaming ? 'bg-green-400 animate-pulse' :
              audioStreaming.audioCapture.isRecording ? 'bg-blue-400 animate-pulse' :
              audioStreaming.isConnected ? 'bg-gray-400' : 'bg-red-400'
            }`}></div>
          </div>
        </div>
        
        {/* Audio Controls */}
        <div className="flex flex-wrap gap-3">
          {!audioStreaming.isStreaming ? (
            <button
              onClick={handleStartStreaming}
              disabled={!audioStreaming.isConnected || !audioStreaming.audioCapture.selectedDevice}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <span>🎤</span>
              <span>Start Recording & Streaming</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={audioStreaming.pauseStreaming}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 flex items-center space-x-2"
              >
                <span>⏸️</span>
                <span>Pause</span>
              </button>
              
              <button
                onClick={audioStreaming.stopStreaming}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
              >
                <span>⏹️</span>
                <span>Stop</span>
              </button>
            </div>
          )}
          
          {/* Audio Configuration */}
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Quality:</label>
            <select
              value={audioConfig.audioBitsPerSecond}
              onChange={(e) => handleConfigChange('audioBitsPerSecond', parseInt(e.target.value))}
              disabled={audioStreaming.isStreaming}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value={16000}>16 kbps (Low)</option>
              <option value={32000}>32 kbps (Medium)</option>
              <option value={64000}>64 kbps (High)</option>
              <option value={128000}>128 kbps (Very High)</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Sample Rate:</label>
            <select
              value={audioConfig.sampleRate}
              onChange={(e) => handleConfigChange('sampleRate', parseInt(e.target.value))}
              disabled={audioStreaming.isStreaming}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value={8000}>8 kHz (Phone)</option>
              <option value={16000}>16 kHz (Speech)</option>
              <option value={22050}>22 kHz (FM Radio)</option>
              <option value={44100}>44.1 kHz (CD Quality)</option>
              <option value={48000}>48 kHz (Professional)</option>
            </select>
          </div>
        </div>
        
        {/* Learning Mode Toggle */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Configure audio settings above, then start recording to see real-time analysis
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
      
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('device')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'device'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🎚️ Device Selection
        </button>
        <button
          onClick={() => setActiveTab('visualizer')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'visualizer'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📊 Audio Visualization
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'stats'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📈 Statistics & Learning
        </button>
      </div>
      
      {/* Tab Content */}
      {activeTab === 'device' && (
        <div className="space-y-4">
          <AudioDeviceSelector
            availableDevices={audioStreaming.audioCapture.availableDevices}
            selectedDevice={audioStreaming.audioCapture.selectedDevice}
            onDeviceSelect={audioStreaming.audioCapture.selectDevice}
            onRefreshDevices={audioStreaming.audioCapture.refreshDevices}
            isRecording={audioStreaming.audioCapture.isRecording}
          />
          
          {isLearningMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">🎓 Device Selection Learning Points:</h4>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>• <strong>Permission Required:</strong> Browser needs microphone access to show device names</li>
                <li>• <strong>Device Quality:</strong> USB microphones typically provide better audio than built-in ones</li>
                <li>• <strong>Proximity Matters:</strong> Closer microphone placement reduces background noise</li>
                <li>• <strong>Environment:</strong> Quiet rooms with soft furnishings reduce echo and noise</li>
                <li>• <strong>Bluetooth Latency:</strong> Wireless devices may introduce additional delay</li>
              </ul>
            </div>
          )}
        </div>
      )}
      
      {activeTab === 'visualizer' && (
        <div className="space-y-4">
          <AudioVisualizer
            audioData={audioStreaming.audioCapture.audioData}
            frequencyData={audioStreaming.audioCapture.stats?.frequencyData || null}
            isActive={audioStreaming.audioCapture.isRecording}
            width={800}
            height={300}
            showWaveform={true}
            showSpectrum={true}
          />
          
          {isLearningMode && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-2">📊 Visualization Learning Points:</h4>
              <ul className="text-green-800 text-sm space-y-1">
                <li>• <strong>Waveform (Top):</strong> Shows audio amplitude over time - good for monitoring levels</li>
                <li>• <strong>Spectrum (Bottom):</strong> Shows frequency content - helps identify voice vs noise</li>
                <li>• <strong>Color Coding:</strong> Green/red bars indicate positive/negative waveform values</li>
                <li>• <strong>Frequency Range:</strong> Human speech typically 300-3000 Hz, shown in left portion</li>
                <li>• <strong>Real-time Analysis:</strong> Updates 60 times per second for smooth visualization</li>
              </ul>
            </div>
          )}
        </div>
      )}
      
      {activeTab === 'stats' && (
        <div className="space-y-4">
          <AudioStatistics
            audioStats={audioStreaming.audioCapture.stats}
            streamingStats={audioStreaming.streamingStats}
            isLearningMode={isLearningMode}
            onToggleLearningMode={setIsLearningMode}
          />
          
          {/* Server Response Display */}
          {audioStreaming.lastResponse && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Latest Server Response</h3>
              <div className="bg-gray-50 rounded p-3 font-mono text-sm overflow-auto">
                <pre>{JSON.stringify(audioStreaming.lastResponse, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Error Display */}
      {(audioStreaming.streamingError || audioStreaming.audioCapture.error) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-red-600">⚠️</span>
            <div>
              <div className="font-medium text-red-900">Audio Error</div>
              <div className="text-sm text-red-700 mt-1">
                {audioStreaming.streamingError || audioStreaming.audioCapture.error}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Quick Tips */}
      {isLearningMode && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h4 className="font-semibold text-indigo-900 mb-2">💡 Quick Tips for Best Results:</h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-indigo-800">
            <div>
              <div className="font-medium mb-1">Audio Setup:</div>
              <ul className="space-y-1">
                <li>• Use a dedicated microphone if possible</li>
                <li>• Position mic 6-12 inches from mouth</li>
                <li>• Test in a quiet environment</li>
                <li>• Monitor volume levels (30-80% optimal)</li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Network Optimization:</div>
              <ul className="space-y-1">
                <li>• Use stable wired internet when possible</li>
                <li>• Close bandwidth-heavy applications</li>
                <li>• Monitor latency in statistics tab</li>
                <li>• Reduce quality if network issues occur</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};