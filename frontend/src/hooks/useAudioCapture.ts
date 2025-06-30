// Custom React hook for browser-based audio capture and streaming
// This hook demonstrates real-time audio processing, MediaRecorder API usage,
// and WebSocket binary data streaming for meeting transcription

import { useCallback, useEffect, useRef, useState } from 'react';

// Audio capture configuration interface
export interface AudioCaptureConfig {
  // Audio format settings
  mimeType?: string;           // Audio format (webm, mp4, etc.)
  audioBitsPerSecond?: number; // Bitrate for audio encoding
  sampleRate?: number;         // Sample rate in Hz (8000, 16000, 44100, 48000)
  channelCount?: number;       // Mono (1) or Stereo (2)
  
  // Streaming settings
  chunkDuration?: number;      // Duration of each audio chunk in ms
  
  // Device selection
  deviceId?: string;           // Specific audio input device ID
  
  // Analysis settings
  enableAnalysis?: boolean;    // Enable real-time audio analysis
  fftSize?: number;           // FFT size for frequency analysis (256, 512, 1024, 2048)
}

// Audio device information
export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
  kind: MediaDeviceKind;
}

// Real-time audio statistics for educational purposes
export interface AudioStats {
  // Format information
  mimeType: string;
  sampleRate: number;
  channelCount: number;
  bitrate: number;
  
  // Streaming metrics
  chunkCount: number;
  totalDataSent: number;      // Total bytes sent
  averageChunkSize: number;   // Average chunk size in bytes
  streamingDuration: number;  // Total streaming time in seconds
  
  // Real-time metrics
  currentVolume: number;      // Current volume level (0-1)
  peakVolume: number;         // Peak volume since recording started
  
  // Latency metrics
  captureLatency: number;     // Time between capture and processing
  streamingLatency: number;   // Network streaming latency estimate
  
  // Frequency analysis (when enabled)
  frequencyData?: Uint8Array; // Current frequency spectrum
  dominantFrequency?: number; // Primary frequency component
}

// Audio capture states
export enum AudioCaptureState {
  IDLE = 'idle',                    // Not recording
  REQUESTING_PERMISSION = 'requesting_permission', // Asking for microphone access
  INITIALIZING = 'initializing',    // Setting up audio capture
  RECORDING = 'recording',          // Actively capturing audio
  PAUSED = 'paused',               // Recording paused
  ERROR = 'error'                  // Error occurred
}

// Hook return interface
export interface AudioCaptureHook {
  // State
  state: AudioCaptureState;
  isRecording: boolean;
  isSupported: boolean;
  
  // Device management
  availableDevices: AudioDevice[];
  selectedDevice: AudioDevice | null;
  
  // Statistics and analysis
  stats: AudioStats | null;
  audioData: Float32Array | null;  // Current audio waveform data
  
  // Controls
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  selectDevice: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  
  // Error information
  error: string | null;
  
  // Callbacks for streaming
  onAudioChunk?: (chunk: Blob, stats: AudioStats) => void;
}

/**
 * useAudioCapture Hook
 * 
 * This hook provides comprehensive audio capture capabilities for real-time streaming.
 * It demonstrates several important web audio concepts:
 * 
 * Audio Formats and Encoding:
 * - WebM: Google's open container format, widely supported
 * - MP4: Standard container, good compatibility
 * - Opus: Modern audio codec with excellent compression
 * - AAC: Widely compatible codec for MP4 containers
 * 
 * Sample Rates Explained:
 * - 8000 Hz: Telephone quality, minimal bandwidth
 * - 16000 Hz: Wideband speech, good for transcription
 * - 44100 Hz: CD quality, standard for music
 * - 48000 Hz: Professional audio, preferred for video
 * 
 * Chunk Duration Considerations:
 * - Smaller chunks (100-250ms): Lower latency, more processing overhead
 * - Larger chunks (500-1000ms): Higher latency, more efficient processing
 * - 250ms is optimal balance for real-time transcription
 * 
 * @param config - Audio capture configuration
 * @param onAudioChunk - Callback for streaming audio chunks
 */
export const useAudioCapture = (
  config: AudioCaptureConfig = {},
  onAudioChunk?: (chunk: Blob, stats: AudioStats) => void
): AudioCaptureHook => {
  
  // Configuration with defaults optimized for speech transcription
  const {
    mimeType = 'audio/webm;codecs=opus',  // Opus codec for excellent compression
    audioBitsPerSecond = 32000,           // 32kbps good for speech
    sampleRate = 16000,                   // 16kHz optimal for speech recognition
    channelCount = 1,                     // Mono audio for speech
    chunkDuration = 250,                  // 250ms chunks for low latency
    deviceId: _deviceId, // eslint-disable-line @typescript-eslint/no-unused-vars
    enableAnalysis = true,
    fftSize = 1024                        // Good balance for frequency analysis
  } = config;
  
  // State management
  const [state, setState] = useState<AudioCaptureState>(AudioCaptureState.IDLE);
  const [availableDevices, setAvailableDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<AudioDevice | null>(null);
  const [stats, setStats] = useState<AudioStats | null>(null);
  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for audio components
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const statsRef = useRef<AudioStats | null>(null);
  
  // Check browser support for audio capture
  const isSupported = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  
  // Initialize audio statistics
  const initializeStats = useCallback(() => {
    const initialStats: AudioStats = {
      mimeType,
      sampleRate,
      channelCount,
      bitrate: audioBitsPerSecond,
      chunkCount: 0,
      totalDataSent: 0,
      averageChunkSize: 0,
      streamingDuration: 0,
      currentVolume: 0,
      peakVolume: 0,
      captureLatency: 0,
      streamingLatency: 0,
      frequencyData: enableAnalysis ? new Uint8Array(fftSize / 2) : undefined,
      dominantFrequency: 0
    };
    
    setStats(initialStats);
    statsRef.current = initialStats;
    return initialStats;
  }, [mimeType, sampleRate, channelCount, audioBitsPerSecond, enableAnalysis, fftSize]);
  
  // Refresh available audio devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          groupId: device.groupId,
          kind: device.kind
        }));
      
      setAvailableDevices(audioDevices);
      
      // Select default device if none selected
      if (!selectedDevice && audioDevices.length > 0) {
        setSelectedDevice(audioDevices[0]);
      }
      
    } catch (err) {
      console.error('Error enumerating devices:', err);
      setError('Failed to enumerate audio devices');
    }
  }, [selectedDevice]);
  
  // Select a specific audio device
  const selectDevice = useCallback(async (deviceId: string) => {
    const device = availableDevices.find(d => d.deviceId === deviceId);
    if (device) {
      setSelectedDevice(device);
      
      // If currently recording, restart with new device
      if (state === AudioCaptureState.RECORDING) {
        stopRecording();
        // Small delay to ensure cleanup
        setTimeout(() => startRecording(), 100);
      }
    }
  }, [availableDevices, state]);
  
  // Setup audio analysis (Web Audio API)
  const setupAudioAnalysis = useCallback((stream: MediaStream) => {
    if (!enableAnalysis) return;
    
    try {
      // Create audio context for real-time analysis
      // AudioContext provides low-level audio processing capabilities
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)({
        sampleRate: sampleRate
      });
      
      // Create analyser node for frequency analysis
      // AnalyserNode provides FFT analysis for visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = fftSize;
      analyserRef.current.smoothingTimeConstant = 0.8; // Smooth frequency data
      
      // Connect audio stream to analyser
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      console.log('Audio analysis setup complete:', {
        sampleRate: audioContextRef.current.sampleRate,
        fftSize: analyserRef.current.fftSize,
        frequencyBinCount: analyserRef.current.frequencyBinCount
      });
      
    } catch (err) {
      console.error('Error setting up audio analysis:', err);
    }
  }, [enableAnalysis, sampleRate, fftSize]);
  
  // Update audio statistics and analysis
  const updateAudioAnalysis = useCallback(() => {
    if (!analyserRef.current || !statsRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    
    // Get frequency domain data (0-255 values representing amplitude)
    const frequencyData = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(frequencyData);
    
    // Get time domain data for waveform visualization
    const timeData = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(timeData);
    
    // Calculate volume (RMS of time domain data)
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      sum += timeData[i] * timeData[i];
    }
    const volume = Math.sqrt(sum / timeData.length);
    
    // Find dominant frequency
    let maxAmplitude = 0;
    let dominantFrequencyBin = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxAmplitude) {
        maxAmplitude = frequencyData[i];
        dominantFrequencyBin = i;
      }
    }
    
    // Convert bin to actual frequency
    const nyquist = sampleRate / 2;
    const dominantFrequency = (dominantFrequencyBin * nyquist) / bufferLength;
    
    // Update statistics
    const updatedStats = {
      ...statsRef.current,
      currentVolume: volume,
      peakVolume: Math.max(statsRef.current.peakVolume, volume),
      frequencyData: frequencyData,
      dominantFrequency: dominantFrequency
    };
    
    statsRef.current = updatedStats;
    setStats(updatedStats);
    setAudioData(timeData);
    
  }, [sampleRate]);
  
  // Handle MediaRecorder data available event
  const handleDataAvailable = useCallback((event: BlobEvent) => {
    if (event.data.size > 0) {
      const chunk = event.data;
      chunksRef.current.push(chunk);
      
      // Update statistics
      if (statsRef.current) {
        const chunkSize = chunk.size;
        const updatedStats = {
          ...statsRef.current,
          chunkCount: statsRef.current.chunkCount + 1,
          totalDataSent: statsRef.current.totalDataSent + chunkSize,
          averageChunkSize: (statsRef.current.totalDataSent + chunkSize) / (statsRef.current.chunkCount + 1),
          streamingDuration: Date.now() / 1000 // Approximate
        };
        
        statsRef.current = updatedStats;
        setStats(updatedStats);
        
        console.log(`Audio chunk ${updatedStats.chunkCount}:`, {
          size: chunkSize,
          duration: chunkDuration,
          avgSize: Math.round(updatedStats.averageChunkSize),
          totalSent: Math.round(updatedStats.totalDataSent / 1024) + 'KB'
        });
      }
      
      // Stream chunk via callback
      if (onAudioChunk && statsRef.current) {
        onAudioChunk(chunk, statsRef.current);
      }
    }
  }, [chunkDuration, onAudioChunk]);
  
  // Start audio recording
  const startRecording = useCallback(async () => {
    try {
      setState(AudioCaptureState.REQUESTING_PERMISSION);
      setError(null);
      
      // Request microphone access with specific constraints
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDevice?.deviceId ? { exact: selectedDevice.deviceId } : undefined,
          sampleRate: { ideal: sampleRate },
          channelCount: { ideal: channelCount },
          echoCancellation: true,    // Reduce echo feedback
          noiseSuppression: true,    // Filter background noise
          autoGainControl: true      // Automatic volume adjustment
        }
      };
      
      console.log('Requesting microphone access with constraints:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      setState(AudioCaptureState.INITIALIZING);
      
      // Setup audio analysis
      setupAudioAnalysis(stream);
      
      // Check MediaRecorder support for specified format
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn(`MIME type ${mimeType} not supported, falling back to default`);
      }
      
      // Create MediaRecorder with optimized settings
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
        audioBitsPerSecond
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Setup event handlers
      mediaRecorder.ondataavailable = handleDataAvailable;
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred');
        setState(AudioCaptureState.ERROR);
      };
      
      // Initialize statistics
      initializeStats();
      
      // Start recording with chunk intervals
      // timeslice parameter determines how often 'dataavailable' events fire
      mediaRecorder.start(chunkDuration);
      
      setState(AudioCaptureState.RECORDING);
      
      console.log('Audio recording started:', {
        mimeType: mediaRecorder.mimeType,
        state: mediaRecorder.state,
        chunkDuration,
        sampleRate,
        channelCount
      });
      
      // Start analysis loop if enabled
      if (enableAnalysis) {
        const analysisLoop = () => {
          if (state === AudioCaptureState.RECORDING) {
            updateAudioAnalysis();
            requestAnimationFrame(analysisLoop);
          }
        };
        requestAnimationFrame(analysisLoop);
      }
      
    } catch (err) {
      console.error('Error starting audio capture:', err);
      let errorMessage = 'Failed to start audio capture';
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone permissions.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect an audio input device.';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Microphone is already in use by another application.';
        }
      }
      
      setError(errorMessage);
      setState(AudioCaptureState.ERROR);
    }
  }, [
    selectedDevice,
    sampleRate,
    channelCount,
    mimeType,
    audioBitsPerSecond,
    chunkDuration,
    setupAudioAnalysis,
    handleDataAvailable,
    initializeStats,
    enableAnalysis,
    updateAudioAnalysis,
    state
  ]);
  
  // Stop audio recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    chunksRef.current = [];
    setState(AudioCaptureState.IDLE);
    setAudioData(null);
    
    console.log('Audio recording stopped');
  }, []);
  
  // Pause audio recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setState(AudioCaptureState.PAUSED);
      console.log('Audio recording paused');
    }
  }, []);
  
  // Resume audio recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setState(AudioCaptureState.RECORDING);
      console.log('Audio recording resumed');
    }
  }, []);
  
  // Initialize devices on mount
  useEffect(() => {
    if (isSupported) {
      refreshDevices();
    }
  }, [isSupported, refreshDevices]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);
  
  return {
    // State
    state,
    isRecording: state === AudioCaptureState.RECORDING,
    isSupported,
    
    // Device management
    availableDevices,
    selectedDevice,
    
    // Statistics and analysis
    stats,
    audioData,
    
    // Controls
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    selectDevice,
    refreshDevices,
    
    // Error information
    error
  };
};