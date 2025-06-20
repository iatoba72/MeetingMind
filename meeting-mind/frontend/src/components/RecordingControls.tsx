// Comprehensive Recording Controls Component
// Complete recording interface with device management, quality settings, and upload handling

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useMediaRecorder, RecordingConfig } from '../hooks/useMediaRecorder';
import { useChunkedUpload, ChunkedUploadConfig } from '../hooks/useChunkedUpload';
import { getStorageManager, StoragePolicies, UploadPolicy } from '../utils/mediaStorage';

interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  type: 'meeting' | 'lecture' | 'interview' | 'other';
  startTime: Date;
  endTime?: Date;
  participants?: string[];
  tags: string[];
}

interface RecordingControlsProps {
  onRecordingComplete?: (sessionId: string, mediaFile: any) => void;
  onTranscriptionReady?: (sessionId: string, segments: any[]) => void;
  defaultConfig?: Partial<RecordingConfig>;
  enableVideo?: boolean;
  enableAutoUpload?: boolean;
  className?: string;
}

/**
 * Recording Implementation Strategy:
 * 
 * 1. Device Management:
 *    - Auto-detection of available audio/video devices
 *    - Real-time device switching during recording
 *    - Audio level monitoring and visual feedback
 *    - Quality presets based on use case
 * 
 * 2. Recording Workflow:
 *    - Pre-recording device and quality checks
 *    - Real-time recording with live preview
 *    - Automatic chunking for large recordings
 *    - Background processing and compression
 * 
 * 3. Quality Management:
 *    - Adaptive bitrate based on available bandwidth
 *    - Multiple quality profiles (meeting, lecture, interview)
 *    - Real-time quality monitoring
 *    - Post-recording optimization
 * 
 * 4. Upload and Storage:
 *    - Automatic upload with resumable chunks
 *    - Background transcription processing
 *    - Intelligent storage class selection
 *    - Progress tracking and error recovery
 */

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  onRecordingComplete,
  onTranscriptionReady,
  defaultConfig,
  enableVideo = true,
  enableAutoUpload = true,
  className = ''
}) => {
  // Recording state
  const [recordingSession, setRecordingSession] = useState<RecordingSession | null>(null);
  const [recordingConfig, setRecordingConfig] = useState<RecordingConfig>({
    audio: true,
    video: enableVideo,
    audioBitsPerSecond: 128000,
    videoBitsPerSecond: 2500000,
    chunkDuration: 5000,
    maxFileSize: 500 * 1024 * 1024, // 500MB
    ...defaultConfig,
  });
  
  // UI state
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [showQualitySettings, setShowQualitySettings] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [recordingName, setRecordingName] = useState('');
  const [recordingType, setRecordingType] = useState<RecordingSession['type']>('meeting');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Hooks
  const mediaRecorder = useMediaRecorder();
  const chunkedUpload = useChunkedUpload();
  
  // Storage manager
  const storageManager = useMemo(() => getStorageManager(), []);
  
  // Quality presets
  const qualityPresets = useMemo(() => ({
    low: {
      audioBitsPerSecond: 64000,
      videoBitsPerSecond: 1000000,
      description: 'Basic quality - smaller file size',
    },
    medium: {
      audioBitsPerSecond: 128000,
      videoBitsPerSecond: 2500000,
      description: 'Good quality - balanced size and quality',
    },
    high: {
      audioBitsPerSecond: 192000,
      videoBitsPerSecond: 5000000,
      description: 'High quality - larger file size',
    },
    ultra: {
      audioBitsPerSecond: 320000,
      videoBitsPerSecond: 8000000,
      description: 'Ultra quality - maximum file size',
    },
  }), []);
  
  // Current quality preset
  const currentQuality = useMemo(() => {
    for (const [key, preset] of Object.entries(qualityPresets)) {
      if (preset.audioBitsPerSecond === recordingConfig.audioBitsPerSecond &&
          preset.videoBitsPerSecond === recordingConfig.videoBitsPerSecond) {
        return key;
      }
    }
    return 'custom';
  }, [recordingConfig, qualityPresets]);
  
  // Handle device changes
  const handleDeviceChange = useCallback((type: 'audio' | 'video', deviceId: string) => {
    if (type === 'audio') {
      mediaRecorder.setSelectedAudioDevice(deviceId);
    } else {
      mediaRecorder.setSelectedVideoDevice(deviceId);
    }
  }, [mediaRecorder]);
  
  // Handle quality preset change
  const handleQualityChange = useCallback((preset: string) => {
    if (preset === 'custom') return;
    
    const settings = qualityPresets[preset as keyof typeof qualityPresets];
    if (settings) {
      setRecordingConfig(prev => ({
        ...prev,
        audioBitsPerSecond: settings.audioBitsPerSecond,
        videoBitsPerSecond: settings.videoBitsPerSecond,
      }));
    }
  }, [qualityPresets]);
  
  // Start recording session
  const startRecording = useCallback(async () => {
    if (!recordingSession) {
      setShowSessionDialog(true);
      return;
    }
    
    try {
      await mediaRecorder.startRecording(recordingConfig);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording. Please check your microphone/camera permissions.');
    }
  }, [mediaRecorder, recordingConfig, recordingSession]);
  
  // Stop recording and handle upload
  const stopRecording = useCallback(async () => {
    if (!recordingSession) return;
    
    mediaRecorder.stopRecording();
    
    // If auto-upload is enabled, start upload process
    if (enableAutoUpload && mediaRecorder.chunks.length > 0) {
      setIsUploading(true);
      
      try {
        // Combine chunks into single blob
        const allChunks = mediaRecorder.chunks.map(chunk => chunk.data);
        const recordingBlob = new Blob(allChunks, { 
          type: recordingConfig.video ? 'video/webm' : 'audio/webm' 
        });
        
        // Create file with session name
        const fileName = `${recordingSession.name}_${new Date().toISOString()}.webm`;
        const recordingFile = new File([recordingBlob], fileName, {
          type: recordingBlob.type,
          lastModified: Date.now(),
        });
        
        // Get appropriate upload policy
        const uploadPolicy: UploadPolicy = StoragePolicies[recordingSession.type] || StoragePolicies.meeting;
        
        // Configure upload
        const uploadConfig: ChunkedUploadConfig = {
          endpoint: '/api/media',
          chunkSize: 2 * 1024 * 1024, // 2MB chunks
          maxConcurrentUploads: 3,
          retryAttempts: 3,
          validateChunks: true,
          onProgress: (progress) => {
            setUploadProgress(progress.percentage);
          },
          onComplete: async (sessionId, mediaUrl) => {
            setIsUploading(false);
            setUploadProgress(0);
            
            // Update session with completed recording
            const completedSession = {
              ...recordingSession,
              endTime: new Date(),
            };
            setRecordingSession(completedSession);
            
            // Notify parent component
            onRecordingComplete?.(sessionId, {
              id: sessionId,
              url: mediaUrl,
              session: completedSession,
              metadata: mediaRecorder.metadata,
            });
            
            // Start transcription if enabled
            if (uploadPolicy.autoTranscription) {
              startTranscription(sessionId);
            }
          },
          onError: (error) => {
            console.error('Upload failed:', error);
            setIsUploading(false);
            setUploadProgress(0);
            alert('Upload failed. Please try again.');
          },
        };
        
        // Start upload
        await chunkedUpload.startUpload(recordingFile, fileName, uploadConfig);
        
      } catch (error) {
        console.error('Failed to process recording:', error);
        setIsUploading(false);
        alert('Failed to process recording. Please try again.');
      }
    }
  }, [
    mediaRecorder,
    recordingSession,
    recordingConfig,
    enableAutoUpload,
    chunkedUpload,
    onRecordingComplete
  ]);
  
  // Start transcription process
  const startTranscription = useCallback(async (mediaId: string) => {
    try {
      const response = await fetch(`/api/media/${mediaId}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'auto',
          modelSize: 'base',
          enableSpeakerDetection: true,
        }),
      });
      
      if (response.ok) {
        const { jobId } = await response.json();
        
        // Poll for transcription completion
        const pollTranscription = async () => {
          try {
            const statusResponse = await fetch(`/api/transcription/${jobId}/status`);
            const { status, segments } = await statusResponse.json();
            
            if (status === 'completed') {
              onTranscriptionReady?.(mediaId, segments);
            } else if (status === 'failed') {
              console.error('Transcription failed');
            } else {
              // Continue polling
              setTimeout(pollTranscription, 5000);
            }
          } catch (error) {
            console.error('Transcription polling error:', error);
          }
        };
        
        pollTranscription();
      }
    } catch (error) {
      console.error('Failed to start transcription:', error);
    }
  }, [onTranscriptionReady]);
  
  // Create new recording session
  const createSession = useCallback((sessionData: {
    name: string;
    type: RecordingSession['type'];
    description?: string;
    participants?: string[];
    tags?: string[];
  }) => {
    const session: RecordingSession = {
      id: `session_${Date.now()}`,
      name: sessionData.name,
      description: sessionData.description,
      type: sessionData.type,
      startTime: new Date(),
      participants: sessionData.participants || [],
      tags: sessionData.tags || [],
    };
    
    setRecordingSession(session);
    setShowSessionDialog(false);
    
    // Auto-start recording
    setTimeout(() => {
      mediaRecorder.startRecording(recordingConfig);
    }, 100);
  }, [mediaRecorder, recordingConfig]);
  
  // Format time display
  const formatTime = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }, []);
  
  // Format file size
  const formatFileSize = useCallback((bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }, []);

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Recording Controls</h2>
            {recordingSession && (
              <p className="text-sm text-gray-600 mt-1">
                Session: {recordingSession.name}
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Recording status indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                mediaRecorder.isRecording 
                  ? 'bg-red-500 animate-pulse' 
                  : 'bg-gray-300'
              }`} />
              <span className={`text-sm font-medium ${
                mediaRecorder.isRecording ? 'text-red-600' : 'text-gray-500'
              }`}>
                {mediaRecorder.isRecording 
                  ? mediaRecorder.isPaused ? 'Paused' : 'Recording'
                  : 'Ready'
                }
              </span>
            </div>
            
            {/* Recording time */}
            {mediaRecorder.isRecording && (
              <div className="text-lg font-mono text-gray-900">
                {formatTime(mediaRecorder.recordingDuration)}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Main Controls */}
      <div className="p-6">
        {/* Device Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Devices</h3>
            <button
              onClick={() => setShowDeviceSettings(!showDeviceSettings)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showDeviceSettings ? 'Hide' : 'Configure'}
            </button>
          </div>
          
          {showDeviceSettings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              {/* Audio device */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Microphone
                </label>
                <select
                  value={mediaRecorder.selectedAudioDevice || ''}
                  onChange={(e) => handleDeviceChange('audio', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  disabled={mediaRecorder.isRecording}
                >
                  <option value="">Default</option>
                  {mediaRecorder.availableDevices
                    .filter(device => device.kind === 'audioinput')
                    .map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      </option>
                    ))
                  }
                </select>
              </div>
              
              {/* Video device */}
              {enableVideo && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Camera
                  </label>
                  <select
                    value={mediaRecorder.selectedVideoDevice || ''}
                    onChange={(e) => handleDeviceChange('video', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    disabled={mediaRecorder.isRecording}
                  >
                    <option value="">Default</option>
                    {mediaRecorder.availableDevices
                      .filter(device => device.kind === 'videoinput')
                      .map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}
            </div>
          )}
          
          {/* Audio level indicator */}
          <div className="mt-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">Audio Level:</span>
              <div className="flex-1 max-w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-100 ${
                    mediaRecorder.audioLevel > 0.8 ? 'bg-red-500' :
                    mediaRecorder.audioLevel > 0.5 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${mediaRecorder.audioLevel * 100}%` }}
                />
              </div>
              <span className="text-sm text-gray-500 w-8">
                {Math.round(mediaRecorder.audioLevel * 100)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Quality Settings */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Quality</h3>
            <button
              onClick={() => setShowQualitySettings(!showQualitySettings)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showQualitySettings ? 'Hide' : 'Configure'}
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <select
              value={currentQuality}
              onChange={(e) => handleQualityChange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              disabled={mediaRecorder.isRecording}
            >
              {Object.entries(qualityPresets).map(([key, preset]) => (
                <option key={key} value={key}>
                  {key.charAt(0).toUpperCase() + key.slice(1)} - {preset.description}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={recordingConfig.audio}
                onChange={(e) => setRecordingConfig(prev => ({
                  ...prev,
                  audio: e.target.checked
                }))}
                disabled={mediaRecorder.isRecording}
              />
              <label>Audio</label>
            </div>
            
            {enableVideo && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={recordingConfig.video}
                  onChange={(e) => setRecordingConfig(prev => ({
                    ...prev,
                    video: e.target.checked
                  }))}
                  disabled={mediaRecorder.isRecording}
                />
                <label>Video</label>
              </div>
            )}
          </div>
          
          {showQualitySettings && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Audio Bitrate (kbps)
                  </label>
                  <input
                    type="number"
                    value={Math.round((recordingConfig.audioBitsPerSecond || 0) / 1000)}
                    onChange={(e) => setRecordingConfig(prev => ({
                      ...prev,
                      audioBitsPerSecond: Number(e.target.value) * 1000
                    }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    disabled={mediaRecorder.isRecording}
                    min="32"
                    max="320"
                  />
                </div>
                
                {enableVideo && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Video Bitrate (kbps)
                    </label>
                    <input
                      type="number"
                      value={Math.round((recordingConfig.videoBitsPerSecond || 0) / 1000)}
                      onChange={(e) => setRecordingConfig(prev => ({
                        ...prev,
                        videoBitsPerSecond: Number(e.target.value) * 1000
                      }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      disabled={mediaRecorder.isRecording}
                      min="500"
                      max="10000"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Recording Status */}
        {mediaRecorder.isRecording && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Duration</div>
                <div className="font-semibold">{formatTime(mediaRecorder.recordingDuration)}</div>
              </div>
              
              <div>
                <div className="text-gray-600">File Size</div>
                <div className="font-semibold">{formatFileSize(mediaRecorder.currentSize)}</div>
              </div>
              
              <div>
                <div className="text-gray-600">Chunks</div>
                <div className="font-semibold">{mediaRecorder.chunks.length}</div>
              </div>
              
              <div>
                <div className="text-gray-600">Quality</div>
                <div className="font-semibold capitalize">{currentQuality}</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Upload Progress */}
        {isUploading && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-900">Uploading...</span>
              <span className="text-sm text-green-700">{Math.round(uploadProgress)}%</span>
            </div>
            <div className="w-full bg-green-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Error Display */}
        {mediaRecorder.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="text-red-500">⚠️</span>
              <span className="text-red-700">{mediaRecorder.error}</span>
              <button
                onClick={mediaRecorder.clearError}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        
        {/* Control Buttons */}
        <div className="flex items-center justify-center space-x-4">
          {!mediaRecorder.isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={isUploading}
            >
              <span className="w-4 h-4 rounded-full bg-white"></span>
              <span>Start Recording</span>
            </button>
          ) : (
            <>
              <button
                onClick={mediaRecorder.isPaused ? mediaRecorder.resumeRecording : mediaRecorder.pauseRecording}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                {mediaRecorder.isPaused ? (
                  <>
                    <span>▶️</span>
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <span>⏸️</span>
                    <span>Pause</span>
                  </>
                )}
              </button>
              
              <button
                onClick={stopRecording}
                className="flex items-center space-x-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <span>⏹️</span>
                <span>Stop Recording</span>
              </button>
            </>
          )}
          
          <button
            onClick={mediaRecorder.reset}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={mediaRecorder.isRecording || isUploading}
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Session Creation Dialog */}
      {showSessionDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">New Recording Session</h3>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createSession({
                  name: formData.get('name') as string,
                  type: formData.get('type') as RecordingSession['type'],
                  description: formData.get('description') as string || undefined,
                  participants: (formData.get('participants') as string || '')
                    .split(',').map(p => p.trim()).filter(p => p.length > 0),
                  tags: (formData.get('tags') as string || '')
                    .split(',').map(t => t.trim()).filter(t => t.length > 0),
                });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session Name *
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Weekly team meeting"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    name="type"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="meeting">Meeting</option>
                    <option value="lecture">Lecture</option>
                    <option value="interview">Interview</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    rows={3}
                    placeholder="Optional description..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Participants (comma-separated)
                  </label>
                  <input
                    name="participants"
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="John Doe, Jane Smith"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    name="tags"
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="important, weekly, team"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowSessionDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Start Recording
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};