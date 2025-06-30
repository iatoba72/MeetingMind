/**
 * Stream Recorder Manager Component
 * Provides interface for managing stream recording
 */

import React, { useState, useEffect } from 'react';

interface RecordingConfig {
  output_directory: string;
  filename_template: string;
  format: string;
  quality: string;
  sample_rate: number;
  channels: number;
  auto_start: boolean;
  max_file_size_mb: number;
  max_duration_minutes: number;
  split_on_silence: boolean;
  silence_threshold_db: number;
  silence_duration_seconds: number;
  enable_metadata: boolean;
  compress_on_complete: boolean;
  delete_source_after_compress: boolean;
}

interface RecorderStats {
  state: string;
  session_id: string;
  source_id: string;
  total_chunks_received: number;
  total_bytes_recorded: number;
  recording_duration_seconds: number;
  average_chunk_size: number;
  peak_buffer_size: number;
  files_created: number;
  last_chunk_time: number | null;
  session_info?: {
    session_id: string;
    source_id: string;
    start_time: string;
    end_time: string | null;
    state: string;
    output_file: string;
    file_size_bytes: number;
    duration_seconds: number;
    total_chunks: number;
    sample_rate: number;
    channels: number;
  };
}

interface RecordingFile {
  filename: string;
  path: string;
  size_bytes: number;
  created_time: number;
  modified_time: number;
  extension: string;
}

interface RecordingStatistics {
  total_recorders: number;
  active_recordings: number;
  total_files_created: number;
  total_bytes_recorded: number;
  total_recording_time_seconds: number;
  active_sessions: Array<{
    source_id: string;
    session_id: string;
    start_time: string;
    duration: number;
  }>;
  recording_efficiency: number;
}

export const StreamRecorderManager: React.FC = () => {
  const [recorders, setRecorders] = useState<Record<string, RecorderStats>>({});
  const [recordingFiles, setRecordingFiles] = useState<RecordingFile[]>([]);
  const [statistics, setStatistics] = useState<RecordingStatistics | null>(null);
  const [supportedFormats, setSupportedFormats] = useState<{ codecs: string[]; containers: string[]; profiles: string[] } | null>(null);
  const [newRecorderSource, setNewRecorderSource] = useState<string>('');
  const [config, setConfig] = useState<RecordingConfig>({
    output_directory: './recordings',
    filename_template: '{source_id}_{timestamp}_{session_id}',
    format: 'wav',
    quality: 'high',
    sample_rate: 48000,
    channels: 2,
    auto_start: false,
    max_file_size_mb: 1024,
    max_duration_minutes: 180,
    split_on_silence: false,
    silence_threshold_db: -40.0,
    silence_duration_seconds: 5.0,
    enable_metadata: true,
    compress_on_complete: false,
    delete_source_after_compress: false
  });
  const [selectedRecorder, setSelectedRecorder] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'recorders' | 'files' | 'statistics'>('recorders');

  useEffect(() => {
    fetchRecorders();
    fetchRecordingFiles();
    fetchStatistics();
    fetchSupportedFormats();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchRecorders();
      fetchRecordingFiles();
      fetchStatistics();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchRecorders = async () => {
    try {
      const response = await fetch('/api/recording/recorders');
      const data = await response.json();
      
      if (data.success) {
        setRecorders(data.data.recorders || {});
      }
    } catch (err) {
      console.error('Error fetching recorders:', err);
    }
  };

  const fetchRecordingFiles = async () => {
    try {
      const response = await fetch('/api/recording/files');
      const data = await response.json();
      
      if (data.success) {
        setRecordingFiles(data.data.files || []);
      }
    } catch (err) {
      console.error('Error fetching recording files:', err);
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/recording/statistics');
      const data = await response.json();
      
      if (data.success) {
        setStatistics(data.data.statistics);
      }
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  };

  const fetchSupportedFormats = async () => {
    try {
      const response = await fetch('/api/recording/formats');
      const data = await response.json();
      
      if (data.success) {
        setSupportedFormats(data.data);
      }
    } catch (err) {
      console.error('Error fetching supported formats:', err);
    }
  };

  const createRecorder = async () => {
    if (!newRecorderSource.trim()) {
      setError('Please enter a source ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/recording/recorders/${newRecorderSource}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.success) {
        setNewRecorderSource('');
        await fetchRecorders();
      } else {
        setError(data.message || 'Failed to create recorder');
      }
    } catch (err) {
      setError(`Error creating recorder: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const removeRecorder = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/recording/recorders/${sourceId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecorders();
        if (selectedRecorder === sourceId) {
          setSelectedRecorder('');
        }
      } else {
        setError(data.message || 'Failed to remove recorder');
      }
    } catch (err) {
      setError(`Error removing recorder: ${err}`);
    }
  };

  const startRecording = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/recording/recorders/${sourceId}/start`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecorders();
      } else {
        setError(data.message || 'Failed to start recording');
      }
    } catch (err) {
      setError(`Error starting recording: ${err}`);
    }
  };

  const stopRecording = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/recording/recorders/${sourceId}/stop`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecorders();
        await fetchRecordingFiles();
      } else {
        setError(data.message || 'Failed to stop recording');
      }
    } catch (err) {
      setError(`Error stopping recording: ${err}`);
    }
  };

  const pauseRecording = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/recording/recorders/${sourceId}/pause`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecorders();
      } else {
        setError(data.message || 'Failed to pause recording');
      }
    } catch (err) {
      setError(`Error pausing recording: ${err}`);
    }
  };

  const resumeRecording = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/recording/recorders/${sourceId}/resume`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecorders();
      } else {
        setError(data.message || 'Failed to resume recording');
      }
    } catch (err) {
      setError(`Error resuming recording: ${err}`);
    }
  };

  const stopAllRecordings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/recording/stop-all', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecorders();
      } else {
        setError(data.message || 'Failed to stop all recordings');
      }
    } catch (err) {
      setError(`Error stopping all recordings: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFile = async (filename: string) => {
    try {
      const response = await fetch(`/api/recording/files/${filename}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchRecordingFiles();
      } else {
        setError(data.message || 'Failed to delete file');
      }
    } catch (err) {
      setError(`Error deleting file: ${err}`);
    }
  };

  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'recording': return 'text-red-600';
      case 'paused': return 'text-yellow-600';
      case 'stopped': return 'text-gray-600';
      case 'idle': return 'text-blue-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStateIcon = (state: string): string => {
    switch (state) {
      case 'recording': return '🔴';
      case 'paused': return '⏸️';
      case 'stopped': return '⏹️';
      case 'idle': return '💤';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  // const selectedRecorderStats = selectedRecorder ? recorders[selectedRecorder] : null;

  return (
    <div className="stream-recorder-manager p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          Stream Recorder Manager
        </h1>

        {/* System Statistics */}
        {statistics && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">System Overview</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {statistics.total_recorders}
                </div>
                <div className="text-sm text-blue-800">Total Recorders</div>
              </div>
              
              <div className="text-center p-3 bg-red-50 rounded">
                <div className="text-2xl font-bold text-red-600">
                  {statistics.active_recordings}
                </div>
                <div className="text-sm text-red-800">Active Recordings</div>
              </div>
              
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">
                  {statistics.total_files_created}
                </div>
                <div className="text-sm text-green-800">Files Created</div>
              </div>
              
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-600">
                  {formatDuration(statistics.total_recording_time_seconds)}
                </div>
                <div className="text-sm text-purple-800">Total Recording Time</div>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Storage Used: {formatFileSize(statistics.total_bytes_recorded)}
              </div>
              <div className="text-sm text-gray-600">
                Efficiency: {statistics.recording_efficiency.toFixed(1)}%
              </div>
              <button
                onClick={stopAllRecordings}
                disabled={isLoading || statistics.active_recordings === 0}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                Stop All Recordings
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              {[
                { id: 'recorders', label: 'Recorders', icon: '🎙️' },
                { id: 'files', label: 'Recording Files', icon: '📁' },
                { id: 'statistics', label: 'Statistics', icon: '📊' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'status' | 'settings' | 'recordings' | 'analytics')}
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
            {/* Recorders Tab */}
            {activeTab === 'recorders' && (
              <div className="space-y-6">
                {/* Recorder Creation */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Create New Recorder</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Source ID
                      </label>
                      <input
                        type="text"
                        value={newRecorderSource}
                        onChange={(e) => setNewRecorderSource(e.target.value)}
                        placeholder="Enter source ID"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Format
                      </label>
                      <select
                        value={config.format}
                        onChange={(e) => setConfig({...config, format: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        {supportedFormats?.formats?.map((format: string) => (
                          <option key={format} value={format}>
                            {format.toUpperCase()} - {supportedFormats.format_info[format]?.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quality
                      </label>
                      <select
                        value={config.quality}
                        onChange={(e) => setConfig({...config, quality: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        {supportedFormats?.qualities?.map((quality: string) => (
                          <option key={quality} value={quality}>
                            {quality.charAt(0).toUpperCase() + quality.slice(1)} - {supportedFormats.quality_info[quality]?.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max File Size (MB)
                      </label>
                      <input
                        type="number"
                        value={config.max_file_size_mb}
                        onChange={(e) => setConfig({...config, max_file_size_mb: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>

                  {showAdvanced && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Sample Rate
                        </label>
                        <select
                          value={config.sample_rate}
                          onChange={(e) => setConfig({...config, sample_rate: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                          <option value={44100}>44.1 kHz</option>
                          <option value={48000}>48 kHz</option>
                          <option value={96000}>96 kHz</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Channels
                        </label>
                        <select
                          value={config.channels}
                          onChange={(e) => setConfig({...config, channels: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                          <option value={1}>Mono</option>
                          <option value={2}>Stereo</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Duration (minutes)
                        </label>
                        <input
                          type="number"
                          value={config.max_duration_minutes}
                          onChange={(e) => setConfig({...config, max_duration_minutes: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Output Directory
                        </label>
                        <input
                          type="text"
                          value={config.output_directory}
                          onChange={(e) => setConfig({...config, output_directory: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-4 mb-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={config.auto_start}
                        onChange={(e) => setConfig({...config, auto_start: e.target.checked})}
                        className="mr-2"
                      />
                      Auto Start Recording
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={config.enable_metadata}
                        onChange={(e) => setConfig({...config, enable_metadata: e.target.checked})}
                        className="mr-2"
                      />
                      Enable Metadata
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={config.split_on_silence}
                        onChange={(e) => setConfig({...config, split_on_silence: e.target.checked})}
                        className="mr-2"
                      />
                      Split on Silence
                    </label>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={createRecorder}
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      Create Recorder
                    </button>
                    
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                    </button>
                  </div>
                </div>

                {/* Active Recorders */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Active Recorders ({Object.keys(recorders).length})
                  </h3>
                  
                  {Object.keys(recorders).length === 0 ? (
                    <p className="text-gray-500">No recorders created</p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(recorders).map(([sourceId, stats]) => (
                        <div 
                          key={sourceId} 
                          className={`border rounded-lg p-4 ${
                            selectedRecorder === sourceId 
                              ? 'border-blue-300 bg-blue-50' 
                              : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <span className="text-xl">{getStateIcon(stats.state)}</span>
                              <div>
                                <h4 className="font-medium">{sourceId}</h4>
                                <span className={`text-sm ${getStateColor(stats.state)}`}>
                                  {stats.state.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              {stats.state === 'idle' && (
                                <button
                                  onClick={() => startRecording(sourceId)}
                                  className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                                >
                                  Start
                                </button>
                              )}
                              
                              {stats.state === 'recording' && (
                                <>
                                  <button
                                    onClick={() => pauseRecording(sourceId)}
                                    className="px-3 py-1 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600"
                                  >
                                    Pause
                                  </button>
                                  <button
                                    onClick={() => stopRecording(sourceId)}
                                    className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                                  >
                                    Stop
                                  </button>
                                </>
                              )}
                              
                              {stats.state === 'paused' && (
                                <>
                                  <button
                                    onClick={() => resumeRecording(sourceId)}
                                    className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                                  >
                                    Resume
                                  </button>
                                  <button
                                    onClick={() => stopRecording(sourceId)}
                                    className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                                  >
                                    Stop
                                  </button>
                                </>
                              )}
                              
                              <button
                                onClick={() => setSelectedRecorder(selectedRecorder === sourceId ? '' : sourceId)}
                                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                              >
                                {selectedRecorder === sourceId ? 'Hide Details' : 'Show Details'}
                              </button>
                              
                              <button
                                onClick={() => removeRecorder(sourceId)}
                                className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Duration:</span>
                              <span className="ml-2">{formatDuration(stats.recording_duration_seconds)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Chunks:</span>
                              <span className="ml-2">{stats.total_chunks_received.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Size:</span>
                              <span className="ml-2">{formatFileSize(stats.total_bytes_recorded)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Files:</span>
                              <span className="ml-2">{stats.files_created}</span>
                            </div>
                          </div>

                          {/* Detailed View */}
                          {selectedRecorder === sourceId && stats.session_info && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h5 className="font-medium mb-2">Session Details</h5>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">Session ID:</span>
                                  <span className="ml-2 font-mono text-xs">{stats.session_info.session_id}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Output File:</span>
                                  <span className="ml-2">{stats.session_info.output_file}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Sample Rate:</span>
                                  <span className="ml-2">{stats.session_info.sample_rate} Hz</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Channels:</span>
                                  <span className="ml-2">{stats.session_info.channels}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Start Time:</span>
                                  <span className="ml-2">{new Date(stats.session_info.start_time).toLocaleString()}</span>
                                </div>
                                {stats.session_info.end_time && (
                                  <div>
                                    <span className="text-gray-500">End Time:</span>
                                    <span className="ml-2">{new Date(stats.session_info.end_time).toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Files Tab */}
            {activeTab === 'files' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Recording Files ({recordingFiles.length})
                </h3>
                
                {recordingFiles.length === 0 ? (
                  <p className="text-gray-500">No recording files found</p>
                ) : (
                  <div className="space-y-4">
                    {recordingFiles.map((file, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{file.filename}</h4>
                            <p className="text-sm text-gray-500">{file.path}</p>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => deleteFile(file.filename)}
                              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Size:</span>
                            <span className="ml-2">{formatFileSize(file.size_bytes)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Format:</span>
                            <span className="ml-2">{file.extension.toUpperCase()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Created:</span>
                            <span className="ml-2">{new Date(file.created_time * 1000).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Modified:</span>
                            <span className="ml-2">{new Date(file.modified_time * 1000).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Statistics Tab */}
            {activeTab === 'statistics' && statistics && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Detailed Statistics</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">System Metrics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Recorders:</span>
                        <span className="font-medium">{statistics.total_recorders}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Recordings:</span>
                        <span className="font-medium">{statistics.active_recordings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Files Created:</span>
                        <span className="font-medium">{statistics.total_files_created}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Storage:</span>
                        <span className="font-medium">{formatFileSize(statistics.total_bytes_recorded)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Recording Time:</span>
                        <span className="font-medium">{formatDuration(statistics.total_recording_time_seconds)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>System Efficiency:</span>
                        <span className="font-medium">{statistics.recording_efficiency.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Active Sessions</h4>
                    {statistics.active_sessions.length === 0 ? (
                      <p className="text-gray-500 text-sm">No active recording sessions</p>
                    ) : (
                      <div className="space-y-2">
                        {statistics.active_sessions.map((session, index) => (
                          <div key={index} className="bg-gray-50 p-3 rounded">
                            <div className="font-medium text-sm">{session.source_id}</div>
                            <div className="text-xs text-gray-600">
                              Duration: {formatDuration(session.duration)}
                            </div>
                            <div className="text-xs text-gray-600">
                              Started: {new Date(session.start_time).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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

export default StreamRecorderManager;