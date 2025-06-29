// Advanced Media Recording Hook with Audio/Video Capabilities
// Provides comprehensive recording functionality with error handling and storage optimization

import { useState, useRef, useCallback, useEffect } from 'react';

export interface RecordingConfig {
  audio: boolean;
  video: boolean;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  mimeType?: string;
  chunkDuration?: number; // in milliseconds
  maxFileSize?: number; // in bytes
}

export interface RecordingChunk {
  data: Blob;
  timestamp: number;
  duration: number;
  size: number;
}

export interface RecordingMetadata {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  totalSize: number;
  chunkCount: number;
  config: RecordingConfig;
  deviceInfo: {
    audioDeviceId?: string;
    videoDeviceId?: string;
    audioLabel?: string;
    videoLabel?: string;
  };
}

export interface UseMediaRecorderReturn {
  // Recording state
  isRecording: boolean;
  isPaused: boolean;
  recordingDuration: number;
  currentSize: number;
  
  // Recording controls
  startRecording: (config: RecordingConfig) => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  
  // Data and metadata
  chunks: RecordingChunk[];
  metadata: RecordingMetadata | null;
  error: string | null;
  
  // Stream and device management
  stream: MediaStream | null;
  availableDevices: MediaDeviceInfo[];
  selectedAudioDevice: string | null;
  selectedVideoDevice: string | null;
  setSelectedAudioDevice: (deviceId: string | null) => void;
  setSelectedVideoDevice: (deviceId: string | null) => void;
  
  // Audio level monitoring
  audioLevel: number;
  
  // Cleanup
  clearError: () => void;
  reset: () => void;
}

export const useMediaRecorder = (): UseMediaRecorderReturn => {
  // Core recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [currentSize, setCurrentSize] = useState(0);
  const [chunks, setChunks] = useState<RecordingChunk[]>([]);
  const [metadata, setMetadata] = useState<RecordingMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Device and stream state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string | null>(null);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Refs for MediaRecorder and timing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sessionIdRef = useRef<string>('');

  // Audio level monitoring
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate RMS (Root Mean Square) for more accurate audio level
    const rms = Math.sqrt(
      dataArray.reduce((sum, value) => sum + value * value, 0) / dataArray.length
    );
    
    setAudioLevel(rms / 255);
    
    if (isRecording && !isPaused) {
      requestAnimationFrame(monitorAudioLevel);
    }
  }, [isRecording, isPaused]);

  // Setup audio analysis
  const setupAudioAnalysis = useCallback(async (mediaStream: MediaStream) => {
    try {
      // Create AudioContext for real-time audio analysis
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const source = audioContextRef.current.createMediaStreamSource(mediaStream);
      source.connect(analyserRef.current);
      
      monitorAudioLevel();
    } catch (err) {
      console.warn('Audio analysis setup failed:', err);
    }
  }, [monitorAudioLevel]);

  // Get available media devices
  const getAvailableDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices(devices);
      
      // Auto-select default devices if none selected
      if (!selectedAudioDevice) {
        const defaultAudio = devices.find(d => d.kind === 'audioinput');
        if (defaultAudio) setSelectedAudioDevice(defaultAudio.deviceId);
      }
      
      if (!selectedVideoDevice) {
        const defaultVideo = devices.find(d => d.kind === 'videoinput');
        if (defaultVideo) setSelectedVideoDevice(defaultVideo.deviceId);
      }
    } catch (err) {
      setError('Failed to enumerate media devices: ' + (err as Error).message);
    }
  }, [selectedAudioDevice, selectedVideoDevice]);

  // Initialize devices on mount
  useEffect(() => {
    getAvailableDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getAvailableDevices);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getAvailableDevices);
    };
  }, [getAvailableDevices]);

  // Duration tracking
  useEffect(() => {
    if (isRecording && !isPaused) {
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
    
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Determine optimal recording settings based on device capabilities
  const getOptimalRecordingSettings = useCallback(async (config: RecordingConfig) => {
    const constraints: MediaStreamConstraints = {};
    
    // Audio constraints with device selection
    if (config.audio) {
      constraints.audio = {
        deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
        sampleRate: 48000, // High quality audio
        channelCount: 2,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
    }
    
    // Video constraints with device selection
    if (config.video) {
      constraints.video = {
        deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined,
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
      };
    }
    
    // Determine optimal MIME type
    let mimeType = config.mimeType;
    if (!mimeType) {
      const supportedTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'audio/webm;codecs=opus',
        'audio/webm',
      ];
      
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
    }
    
    return { constraints, mimeType };
  }, [selectedAudioDevice, selectedVideoDevice]);

  // Start recording with comprehensive setup
  const startRecording = useCallback(async (config: RecordingConfig) => {
    try {
      setError(null);
      
      // Generate unique session ID
      sessionIdRef.current = `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get optimal settings
      const { constraints, mimeType } = await getOptimalRecordingSettings(config);
      
      // Request user media with optimized constraints
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      // Setup audio analysis if audio is enabled
      if (config.audio) {
        await setupAudioAnalysis(mediaStream);
      }
      
      // Create MediaRecorder with optimal settings
      const options: MediaRecorderOptions = {
        mimeType: mimeType || 'video/webm',
      };
      
      // Set bitrates for quality/size balance
      if (config.audioBitsPerSecond) {
        options.audioBitsPerSecond = config.audioBitsPerSecond;
      }
      if (config.videoBitsPerSecond) {
        options.videoBitsPerSecond = config.videoBitsPerSecond;
      }
      
      const mediaRecorder = new MediaRecorder(mediaStream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      // Setup data handling with chunked approach
      const chunkDuration = config.chunkDuration || 5000; // Default 5 seconds
      let chunkStartTime = Date.now();
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const chunkEndTime = Date.now();
          const chunk: RecordingChunk = {
            data: event.data,
            timestamp: chunkStartTime,
            duration: chunkEndTime - chunkStartTime,
            size: event.data.size,
          };
          
          setChunks(prev => [...prev, chunk]);
          setCurrentSize(prev => prev + event.data.size);
          
          chunkStartTime = chunkEndTime;
          
          // Check file size limits
          if (config.maxFileSize && (currentSize + event.data.size) > config.maxFileSize) {
            console.warn('Recording size limit reached, stopping recording');
            stopRecording();
          }
        }
      };
      
      mediaRecorder.onerror = (event) => {
        setError('MediaRecorder error: ' + (event as Event & { error?: string }).error);
      };
      
      mediaRecorder.onstop = () => {
        // Cleanup on stop
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        setIsRecording(false);
        setIsPaused(false);
        setAudioLevel(0);
        
        // Finalize metadata
        setMetadata(prev => prev ? {
          ...prev,
          endTime: new Date(),
          duration: Date.now() - startTimeRef.current,
        } : null);
      };
      
      // Create initial metadata
      const deviceInfo = {
        audioDeviceId: selectedAudioDevice || undefined,
        videoDeviceId: selectedVideoDevice || undefined,
        audioLabel: availableDevices.find(d => d.deviceId === selectedAudioDevice)?.label,
        videoLabel: availableDevices.find(d => d.deviceId === selectedVideoDevice)?.label,
      };
      
      setMetadata({
        sessionId: sessionIdRef.current,
        startTime: new Date(),
        duration: 0,
        totalSize: 0,
        chunkCount: 0,
        config,
        deviceInfo,
      });
      
      // Start recording with chunked timeslices
      startTimeRef.current = Date.now();
      mediaRecorder.start(chunkDuration);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      setCurrentSize(0);
      setChunks([]);
      
    } catch (err) {
      setError('Failed to start recording: ' + (err as Error).message);
      
      // Cleanup on error
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  }, [
    getOptimalRecordingSettings,
    setupAudioAnalysis,
    selectedAudioDevice,
    selectedVideoDevice,
    availableDevices,
    currentSize,
    stream
  ]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    // Clear intervals
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, [isRecording, stream]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, [isRecording, isPaused]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, [isRecording, isPaused]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    stopRecording();
    setChunks([]);
    setMetadata(null);
    setRecordingDuration(0);
    setCurrentSize(0);
    setError(null);
    setAudioLevel(0);
  }, [stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    // Recording state
    isRecording,
    isPaused,
    recordingDuration,
    currentSize,
    
    // Recording controls
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    
    // Data and metadata
    chunks,
    metadata,
    error,
    
    // Stream and device management
    stream,
    availableDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    setSelectedAudioDevice,
    setSelectedVideoDevice,
    
    // Audio monitoring
    audioLevel,
    
    // Utilities
    clearError,
    reset,
  };
};