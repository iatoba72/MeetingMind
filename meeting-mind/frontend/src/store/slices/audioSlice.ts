/**
 * Audio Management Slice
 * Handles audio recording, processing, device management, and real-time audio state
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  AudioState, 
  AudioSettings, 
  AudioQuality,
  AppState,
  StoreActions 
} from '../types';

export interface AudioSlice {
  // State
  audio: AudioState;
  
  // Device management
  availableDevices: MediaDeviceInfo[];
  selectedDevice: string | null;
  devicePermissions: {
    microphone: 'granted' | 'denied' | 'prompt' | 'unknown';
    camera: 'granted' | 'denied' | 'prompt' | 'unknown';
  };
  
  // Audio processing
  audioContext: AudioContext | null;
  analyserNode: AnalyserNode | null;
  mediaStream: MediaStream | null;
  
  // Real-time metrics
  realTimeMetrics: {
    volume: number;
    frequency: number[];
    waveform: number[];
    speechProbability: number;
    noiseLevel: number;
    lastUpdate: Date;
  };
  
  // Actions
  initializeAudio: () => Promise<boolean>;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  
  // Device management
  requestPermissions: () => Promise<boolean>;
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  selectDevice: (deviceId: string) => Promise<boolean>;
  testDevice: (deviceId: string) => Promise<AudioTestResult>;
  
  // Settings management
  updateAudioSettings: (settings: Partial<AudioSettings>) => void;
  resetAudioSettings: () => void;
  optimizeForEnvironment: (environment: 'quiet' | 'noisy' | 'conference' | 'outdoor') => void;
  
  // Quality monitoring
  updateAudioQuality: (quality: Partial<AudioQuality>) => void;
  getQualityHistory: (duration: number) => AudioQuality[];
  
  // Audio processing
  processAudioFrame: (audioData: Float32Array) => void;
  enableNoiseReduction: (enabled: boolean) => void;
  enableEchoCancellation: (enabled: boolean) => void;
  enableAutoGainControl: (enabled: boolean) => void;
  
  // Advanced features
  setLatencyMode: (mode: AudioSettings['latencyMode']) => void;
  calibrateAudio: () => Promise<CalibrationResult>;
  exportAudioSettings: () => AudioSettingsExport;
  importAudioSettings: (settings: AudioSettingsExport) => boolean;
  
  // Cleanup
  cleanup: () => void;
}

export interface AudioTestResult {
  deviceId: string;
  success: boolean;
  latency: number;
  quality: AudioQuality;
  supportedSampleRates: number[];
  supportedChannels: number[];
  error?: string;
}

export interface CalibrationResult {
  optimalSettings: AudioSettings;
  environmentType: 'quiet' | 'noisy' | 'conference' | 'outdoor';
  backgroundNoise: number;
  roomSize: 'small' | 'medium' | 'large';
  recommendations: string[];
}

export interface AudioSettingsExport {
  settings: AudioSettings;
  quality: AudioQuality;
  deviceInfo: {
    deviceId: string;
    label: string;
  };
  exportedAt: Date;
  version: string;
}

const defaultAudioSettings: AudioSettings = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  enhancedProcessing: false,
  bufferSize: 4096,
  latencyMode: 'balanced'
};

const defaultAudioQuality: AudioQuality = {
  snr: 0,
  clarity: 0,
  stability: 0,
  overall: 0
};

const defaultAudioState: AudioState = {
  isRecording: false,
  isProcessing: false,
  currentLevel: 0,
  deviceId: undefined,
  sampleRate: 44100,
  channels: 1,
  quality: defaultAudioQuality,
  settings: defaultAudioSettings
};

export const createAudioSlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  AudioSlice
> = (set, get) => ({
  // Initial state
  audio: defaultAudioState,
  availableDevices: [],
  selectedDevice: null,
  devicePermissions: {
    microphone: 'unknown',
    camera: 'unknown'
  },
  audioContext: null,
  analyserNode: null,
  mediaStream: null,
  realTimeMetrics: {
    volume: 0,
    frequency: [],
    waveform: [],
    speechProbability: 0,
    noiseLevel: 0,
    lastUpdate: new Date()
  },
  
  // Audio initialization
  initializeAudio: async () => {
    try {
      // Request permissions first
      const hasPermissions = await get().requestPermissions();
      if (!hasPermissions) {
        return false;
      }
      
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyserNode = audioContext.createAnalyser();
      
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.8;
      
      set(produce((state: AppState) => {
        state.audio.isProcessing = true;
      }));
      
      // Store audio context and analyzer
      set({ audioContext, analyserNode });
      
      // Enumerate and select default device
      const devices = await get().enumerateDevices();
      const defaultDevice = devices.find(d => d.kind === 'audioinput' && d.deviceId !== 'default');
      
      if (defaultDevice) {
        await get().selectDevice(defaultDevice.deviceId);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      set(produce((state: AppState) => {
        state.audio.isProcessing = false;
      }));
      return false;
    }
  },
  
  // Recording control
  startRecording: async () => {
    try {
      const { audioContext, selectedDevice, audio } = get();
      
      if (!audioContext || !selectedDevice) {
        console.error('Audio not initialized or no device selected');
        return false;
      }
      
      // Get media stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: selectedDevice },
          echoCancellation: audio.settings.echoCancellation,
          noiseSuppression: audio.settings.noiseSuppression,
          autoGainControl: audio.settings.autoGainControl,
          sampleRate: audio.sampleRate,
          channelCount: audio.channels
        }
      });
      
      // Connect to audio context
      const source = audioContext.createMediaStreamSource(mediaStream);
      const { analyserNode } = get();
      
      if (analyserNode) {
        source.connect(analyserNode);
      }
      
      set(produce((state: AppState) => {
        state.audio.isRecording = true;
        state.audio.isProcessing = true;
      }));
      
      set({ mediaStream });
      
      // Start audio processing loop
      get().startAudioProcessing();
      
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  },
  
  stopRecording: () => {
    const { mediaStream } = get();
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    
    set(produce((state: AppState) => {
      state.audio.isRecording = false;
      state.audio.isProcessing = false;
      state.audio.currentLevel = 0;
    }));
    
    set({ mediaStream: null });
  },
  
  pauseRecording: () => {
    set(produce((state: AppState) => {
      state.audio.isRecording = false;
    }));
  },
  
  resumeRecording: () => {
    set(produce((state: AppState) => {
      state.audio.isRecording = true;
    }));
  },
  
  // Device management
  requestPermissions: async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      set(produce((state: AppState) => {
        state.devicePermissions.microphone = 'granted';
      }));
      
      return true;
    } catch (error) {
      set(produce((state: AppState) => {
        state.devicePermissions.microphone = 'denied';
      }));
      
      return false;
    }
  },
  
  enumerateDevices: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      set({ availableDevices: audioDevices });
      return audioDevices;
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  },
  
  selectDevice: async (deviceId: string) => {
    try {
      // Test the device first
      const testResult = await get().testDevice(deviceId);
      
      if (!testResult.success) {
        return false;
      }
      
      set(produce((state: AppState) => {
        state.audio.deviceId = deviceId;
        state.selectedDevice = deviceId;
        state.audio.quality = testResult.quality;
      }));
      
      return true;
    } catch (error) {
      console.error('Failed to select device:', error);
      return false;
    }
  },
  
  testDevice: async (deviceId: string): Promise<AudioTestResult> => {
    const startTime = performance.now();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      
      const latency = performance.now() - startTime;
      
      // Quick quality assessment
      const quality: AudioQuality = {
        snr: 20, // Would be calculated from actual audio analysis
        clarity: 0.8,
        stability: 0.9,
        overall: 0.8
      };
      
      stream.getTracks().forEach(track => track.stop());
      
      return {
        deviceId,
        success: true,
        latency,
        quality,
        supportedSampleRates: [44100, 48000],
        supportedChannels: [1, 2]
      };
    } catch (error) {
      return {
        deviceId,
        success: false,
        latency: 0,
        quality: defaultAudioQuality,
        supportedSampleRates: [],
        supportedChannels: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
  
  // Settings management
  updateAudioSettings: (newSettings) => {
    set(produce((state: AppState) => {
      Object.assign(state.audio.settings, newSettings);
    }));
  },
  
  resetAudioSettings: () => {
    set(produce((state: AppState) => {
      state.audio.settings = { ...defaultAudioSettings };
    }));
  },
  
  optimizeForEnvironment: (environment) => {
    const optimizedSettings: Record<typeof environment, Partial<AudioSettings>> = {
      quiet: {
        noiseSuppression: false,
        autoGainControl: false,
        enhancedProcessing: false,
        latencyMode: 'low'
      },
      noisy: {
        noiseSuppression: true,
        autoGainControl: true,
        enhancedProcessing: true,
        latencyMode: 'high'
      },
      conference: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        enhancedProcessing: true,
        latencyMode: 'balanced'
      },
      outdoor: {
        noiseSuppression: true,
        autoGainControl: true,
        enhancedProcessing: true,
        latencyMode: 'high'
      }
    };
    
    get().updateAudioSettings(optimizedSettings[environment]);
  },
  
  // Quality monitoring
  updateAudioQuality: (qualityUpdate) => {
    set(produce((state: AppState) => {
      Object.assign(state.audio.quality, qualityUpdate);
    }));
  },
  
  getQualityHistory: (duration) => {
    // In a real implementation, this would return historical quality data
    // For now, return current quality repeated
    const { audio } = get();
    return Array(Math.floor(duration / 1000)).fill(audio.quality);
  },
  
  // Audio processing
  processAudioFrame: (audioData) => {
    const { analyserNode, realTimeMetrics } = get();
    
    if (!analyserNode) return;
    
    // Calculate volume (RMS)
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const volume = Math.sqrt(sum / audioData.length);
    
    // Get frequency data
    const frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(frequencyData);
    
    // Get waveform data
    const waveformData = new Uint8Array(analyserNode.fftSize);
    analyserNode.getByteTimeDomainData(waveformData);
    
    // Simple speech detection (would be more sophisticated in reality)
    const speechProbability = volume > 0.01 ? Math.min(volume * 10, 1) : 0;
    
    // Update real-time metrics
    set(produce((state: AppState) => {
      state.realTimeMetrics = {
        volume,
        frequency: Array.from(frequencyData).map(v => v / 255),
        waveform: Array.from(waveformData).map(v => (v - 128) / 128),
        speechProbability,
        noiseLevel: volume < 0.005 ? volume : realTimeMetrics.noiseLevel,
        lastUpdate: new Date()
      };
      
      state.audio.currentLevel = volume;
    }));
  },
  
  // Audio processing controls
  enableNoiseReduction: (enabled) => {
    get().updateAudioSettings({ noiseSuppression: enabled });
  },
  
  enableEchoCancellation: (enabled) => {
    get().updateAudioSettings({ echoCancellation: enabled });
  },
  
  enableAutoGainControl: (enabled) => {
    get().updateAudioSettings({ autoGainControl: enabled });
  },
  
  setLatencyMode: (mode) => {
    get().updateAudioSettings({ latencyMode: mode });
  },
  
  // Advanced features
  calibrateAudio: async (): Promise<CalibrationResult> => {
    // This would perform actual audio calibration
    // For now, return mock calibration result
    const { realTimeMetrics } = get();
    
    const backgroundNoise = realTimeMetrics.noiseLevel;
    const environmentType = backgroundNoise < 0.01 ? 'quiet' : 
                           backgroundNoise < 0.05 ? 'conference' : 'noisy';
    
    const optimalSettings: AudioSettings = {
      ...defaultAudioSettings,
      noiseSuppression: backgroundNoise > 0.02,
      autoGainControl: backgroundNoise > 0.01,
      enhancedProcessing: backgroundNoise > 0.03
    };
    
    return {
      optimalSettings,
      environmentType,
      backgroundNoise,
      roomSize: 'medium', // Would be detected from acoustic analysis
      recommendations: [
        'Consider using a headset for better audio quality',
        'Position microphone 6-8 inches from your mouth',
        'Minimize background noise sources'
      ]
    };
  },
  
  exportAudioSettings: (): AudioSettingsExport => {
    const { audio, selectedDevice, availableDevices } = get();
    const device = availableDevices.find(d => d.deviceId === selectedDevice);
    
    return {
      settings: audio.settings,
      quality: audio.quality,
      deviceInfo: {
        deviceId: selectedDevice || '',
        label: device?.label || 'Unknown Device'
      },
      exportedAt: new Date(),
      version: '1.0.0'
    };
  },
  
  importAudioSettings: (settingsExport): boolean => {
    try {
      get().updateAudioSettings(settingsExport.settings);
      get().updateAudioQuality(settingsExport.quality);
      return true;
    } catch (error) {
      console.error('Failed to import audio settings:', error);
      return false;
    }
  },
  
  // Audio processing loop
  startAudioProcessing: () => {
    const processFrame = () => {
      const { analyserNode, audio } = get();
      
      if (!analyserNode || !audio.isRecording) {
        return;
      }
      
      const bufferLength = analyserNode.fftSize;
      const dataArray = new Float32Array(bufferLength);
      analyserNode.getFloatTimeDomainData(dataArray);
      
      get().processAudioFrame(dataArray);
      
      // Continue processing
      requestAnimationFrame(processFrame);
    };
    
    processFrame();
  },
  
  // Cleanup
  cleanup: () => {
    const { mediaStream, audioContext } = get();
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
    
    set({
      mediaStream: null,
      audioContext: null,
      analyserNode: null
    });
    
    set(produce((state: AppState) => {
      state.audio = { ...defaultAudioState };
    }));
  }
});