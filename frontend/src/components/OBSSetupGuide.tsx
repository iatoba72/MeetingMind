/**
 * OBS Setup Guide Component
 * Comprehensive guide for setting up OBS Studio with MeetingMind
 */

import React, { useState, useEffect } from 'react';

interface OBSGuide {
  protocol: string;
  version: string;
  quality: string;
  settings: {
    protocol: string;
    server_url: string;
    stream_key: string;
    video_bitrate: number;
    audio_bitrate: number;
    video_resolution: string;
    video_fps: number;
    encoder: string;
    rate_control: string;
    keyframe_interval: number;
    audio_sample_rate: number;
    audio_channels: number;
    advanced_settings: Record<string, any>;
  };
  setup_steps: string[];
  troubleshooting: Record<string, string>;
  performance_tips: string[];
  advanced_configuration: Record<string, any>;
  scene_setup: string[];
  audio_setup: string[];
  plugin_recommendations: Array<{
    name: string;
    description: string;
    url: string;
    category: string;
  }>;
}

interface Protocol {
  protocol: string;
  port: number;
  description: string;
  advantages: string[];
  disadvantages: string[];
}

interface QualityPreset {
  video_bitrate: number;
  audio_bitrate: number;
  video_resolution: string;
  video_fps: number;
  encoder: string;
  description: string;
  estimated_bandwidth: number;
  recommended_upload: number;
}

export const OBSSetupGuide: React.FC = () => {
  const [guide, setGuide] = useState<OBSGuide | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [qualityPresets, setQualityPresets] = useState<Record<string, QualityPreset>>({});
  const [selectedProtocol, setSelectedProtocol] = useState<string>('rtmp');
  const [selectedQuality, setSelectedQuality] = useState<string>('medium');
  const [activeTab, setActiveTab] = useState<string>('setup');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customSettings, setCustomSettings] = useState({
    video_bitrate: '',
    audio_bitrate: '',
    video_resolution: '',
    video_fps: '',
    encoder: '',
    server_url: '',
    stream_key: ''
  });
  const [showCustomSettings, setShowCustomSettings] = useState(false);

  useEffect(() => {
    fetchProtocols();
    fetchQualityPresets();
    generateGuide();
  }, [selectedProtocol, selectedQuality]);

  const fetchProtocols = async () => {
    try {
      const response = await fetch('/api/obs-setup/protocols');
      const data = await response.json();
      
      if (data.success) {
        setProtocols(data.data.protocols);
      }
    } catch (err) {
      console.error('Error fetching protocols:', err);
    }
  };

  const fetchQualityPresets = async () => {
    try {
      const response = await fetch('/api/obs-setup/quality-presets');
      const data = await response.json();
      
      if (data.success) {
        setQualityPresets(data.data.quality_presets);
      }
    } catch (err) {
      console.error('Error fetching quality presets:', err);
    }
  };

  const generateGuide = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let url = `/api/obs-setup/guide/${selectedProtocol}?quality=${selectedQuality}`;
      
      // Add custom settings if any are provided
      const customParams = Object.entries(customSettings)
        .filter(([_, value]) => value.trim() !== '')
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      
      if (customParams) {
        url += `&${customParams}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setGuide(data.data.guide);
      } else {
        setError(data.message || 'Failed to generate guide');
      }
    } catch (err) {
      setError(`Error generating guide: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };

  const downloadGuide = () => {
    if (!guide) return;

    const guideText = `
OBS Setup Guide - ${guide.protocol.toUpperCase()} Streaming to MeetingMind
Quality: ${guide.quality}

SETTINGS:
- Server URL: ${guide.settings.server_url}
- Stream Key: ${guide.settings.stream_key}
- Video Bitrate: ${guide.settings.video_bitrate} kbps
- Audio Bitrate: ${guide.settings.audio_bitrate} kbps
- Resolution: ${guide.settings.video_resolution}
- FPS: ${guide.settings.video_fps}
- Encoder: ${guide.settings.encoder}

SETUP STEPS:
${guide.setup_steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

PERFORMANCE TIPS:
${guide.performance_tips.map(tip => `- ${tip}`).join('\n')}

TROUBLESHOOTING:
${Object.entries(guide.troubleshooting).map(([issue, solution]) => `${issue}: ${solution}`).join('\n')}
    `.trim();

    const blob = new Blob([guideText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obs-setup-guide-${guide.protocol}-${guide.quality}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedPreset = qualityPresets[selectedQuality];

  return (
    <div className="obs-setup-guide p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            OBS Studio Setup Guide
          </h1>
          {guide && (
            <button
              onClick={downloadGuide}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              📄 Download Guide
            </button>
          )}
        </div>

        {/* Configuration Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Protocol Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Streaming Protocol
              </label>
              <select
                value={selectedProtocol}
                onChange={(e) => setSelectedProtocol(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {protocols.map((protocol) => (
                  <option key={protocol.protocol.toLowerCase()} value={protocol.protocol.toLowerCase()}>
                    {protocol.protocol.toUpperCase()} - {protocol.description}
                  </option>
                ))}
              </select>
              
              {protocols.find(p => p.protocol.toLowerCase() === selectedProtocol) && (
                <div className="mt-2 text-sm text-gray-600">
                  <div className="mb-1">
                    <strong>Advantages:</strong> {protocols.find(p => p.protocol.toLowerCase() === selectedProtocol)?.advantages.join(', ')}
                  </div>
                  <div>
                    <strong>Port:</strong> {protocols.find(p => p.protocol.toLowerCase() === selectedProtocol)?.port}
                  </div>
                </div>
              )}
            </div>

            {/* Quality Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quality Preset
              </label>
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {Object.entries(qualityPresets).map(([quality, preset]) => (
                  <option key={quality} value={quality}>
                    {quality.charAt(0).toUpperCase() + quality.slice(1)} - {preset.description}
                  </option>
                ))}
              </select>
              
              {selectedPreset && (
                <div className="mt-2 text-sm text-gray-600">
                  <div>Resolution: {selectedPreset.video_resolution} @ {selectedPreset.video_fps}fps</div>
                  <div>Bitrate: {selectedPreset.video_bitrate + selectedPreset.audio_bitrate} kbps total</div>
                  <div>Upload Required: {selectedPreset.recommended_upload.toFixed(1)} kbps</div>
                </div>
              )}
            </div>
          </div>

          {/* Custom Settings Toggle */}
          <div className="mt-4">
            <button
              onClick={() => setShowCustomSettings(!showCustomSettings)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {showCustomSettings ? 'Hide Custom Settings' : 'Show Custom Settings'}
            </button>
          </div>

          {/* Custom Settings */}
          {showCustomSettings && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Video Bitrate (kbps)
                </label>
                <input
                  type="number"
                  value={customSettings.video_bitrate}
                  onChange={(e) => setCustomSettings({...customSettings, video_bitrate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g., 4000"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Audio Bitrate (kbps)
                </label>
                <input
                  type="number"
                  value={customSettings.audio_bitrate}
                  onChange={(e) => setCustomSettings({...customSettings, audio_bitrate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g., 160"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resolution
                </label>
                <input
                  type="text"
                  value={customSettings.video_resolution}
                  onChange={(e) => setCustomSettings({...customSettings, video_resolution: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g., 1920x1080"
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={generateGuide}
              disabled={isLoading}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isLoading ? 'Generating...' : 'Generate Guide'}
            </button>
          </div>
        </div>

        {/* Guide Content */}
        {guide && (
          <div className="bg-white rounded-lg shadow-md">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8">
                {[
                  { id: 'setup', label: 'Setup Steps', icon: '🛠️' },
                  { id: 'settings', label: 'Settings', icon: '⚙️' },
                  { id: 'scenes', label: 'Scenes & Audio', icon: '🎬' },
                  { id: 'troubleshooting', label: 'Troubleshooting', icon: '🔧' },
                  { id: 'tips', label: 'Tips & Plugins', icon: '💡' }
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
              {/* Setup Steps Tab */}
              {activeTab === 'setup' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step-by-Step Setup</h3>
                  <div className="space-y-4">
                    {guide.setup_steps.map((step, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-700">{step}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">OBS Configuration Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Stream Settings */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-3">Stream Settings</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Service:</span>
                          <span className="font-medium">Custom</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Server:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium font-mono text-xs">{guide.settings.server_url}</span>
                            <button
                              onClick={() => copyToClipboard(guide.settings.server_url)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Copy to clipboard"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Stream Key:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{guide.settings.stream_key}</span>
                            <button
                              onClick={() => copyToClipboard(guide.settings.stream_key)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Copy to clipboard"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Video Settings */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-3">Video Settings</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Resolution:</span>
                          <span className="font-medium">{guide.settings.video_resolution}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">FPS:</span>
                          <span className="font-medium">{guide.settings.video_fps}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Video Bitrate:</span>
                          <span className="font-medium">{guide.settings.video_bitrate} kbps</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Encoder:</span>
                          <span className="font-medium">{guide.settings.encoder}</span>
                        </div>
                      </div>
                    </div>

                    {/* Audio Settings */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-3">Audio Settings</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Sample Rate:</span>
                          <span className="font-medium">{guide.settings.audio_sample_rate} Hz</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Channels:</span>
                          <span className="font-medium">{guide.settings.audio_channels === 2 ? 'Stereo' : 'Mono'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Audio Bitrate:</span>
                          <span className="font-medium">{guide.settings.audio_bitrate} kbps</span>
                        </div>
                      </div>
                    </div>

                    {/* Advanced Settings */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-3">Advanced Settings</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Rate Control:</span>
                          <span className="font-medium">{guide.settings.rate_control}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Keyframe Interval:</span>
                          <span className="font-medium">{guide.settings.keyframe_interval}s</span>
                        </div>
                        {Object.entries(guide.settings.advanced_settings).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-600">{key}:</span>
                            <span className="font-medium">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scenes & Audio Tab */}
              {activeTab === 'scenes' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Scene Setup Guide</h3>
                    <ul className="space-y-2">
                      {guide.scene_setup.map((step, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-blue-500">•</span>
                          <span className="text-gray-700">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Audio Setup Guide</h3>
                    <ul className="space-y-2">
                      {guide.audio_setup.map((step, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-green-500">•</span>
                          <span className="text-gray-700">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Troubleshooting Tab */}
              {activeTab === 'troubleshooting' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Common Issues & Solutions</h3>
                  <div className="space-y-4">
                    {Object.entries(guide.troubleshooting).map(([issue, solution]) => (
                      <div key={issue} className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-red-600 mb-2">{issue}</h4>
                        <p className="text-gray-700 text-sm">{solution}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips & Plugins Tab */}
              {activeTab === 'tips' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Performance Tips</h3>
                    <ul className="space-y-2">
                      {guide.performance_tips.map((tip, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-yellow-500">💡</span>
                          <span className="text-gray-700">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recommended Plugins</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {guide.plugin_recommendations.map((plugin, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{plugin.name}</h4>
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {plugin.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-3">{plugin.description}</p>
                          {plugin.url !== 'Built-in' && (
                            <a
                              href={plugin.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Download →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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

export default OBSSetupGuide;