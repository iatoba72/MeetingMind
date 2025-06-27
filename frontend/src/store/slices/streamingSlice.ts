/**
 * Streaming Management Slice
 * Handles streaming connections, quality monitoring, and network management
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  StreamState, 
  StreamInfo, 
  StreamQuality,
  StreamStatistics,
  StreamSettings,
  StreamError,
  NetworkQuality,
  AppState,
  StoreActions 
} from '../types';

export interface StreamingSlice {
  // State
  streams: StreamState;
  
  // Stream management
  createStream: (stream: Omit<StreamInfo, 'id' | 'statistics'>) => string;
  updateStream: (id: string, updates: Partial<StreamInfo>) => void;
  deleteStream: (id: string) => void;
  setActiveStream: (id: string | null) => void;
  
  // Connection management
  connectStream: (id: string) => Promise<boolean>;
  disconnectStream: (id: string) => void;
  reconnectStream: (id: string) => Promise<boolean>;
  testStreamConnection: (id: string) => Promise<StreamTestResult>;
  
  // Quality monitoring
  updateStreamQuality: (id: string, quality: Partial<StreamQuality>) => void;
  updateStreamStatistics: (id: string, stats: Partial<StreamStatistics>) => void;
  getStreamHealth: (id: string) => StreamHealth | null;
  
  // Network management
  updateNetworkQuality: (quality: Partial<NetworkQuality>) => void;
  checkNetworkQuality: () => Promise<NetworkQuality>;
  optimizeForNetwork: (quality: NetworkQuality) => void;
  
  // Settings management
  updateStreamSettings: (id: string, settings: Partial<StreamSettings>) => void;
  applyGlobalSettings: (settings: Partial<StreamSettings>) => void;
  exportStreamConfig: (id: string) => StreamConfig | null;
  importStreamConfig: (config: StreamConfig) => string | null;
  
  // Error handling
  reportStreamError: (id: string, error: Omit<StreamError, 'timestamp'>) => void;
  clearStreamErrors: (id: string) => void;
  getStreamErrors: (id: string) => StreamError[];
  
  // Analytics
  getStreamAnalytics: (id: string, duration: number) => StreamAnalytics | null;
  getBandwidthUsage: () => BandwidthAnalytics;
  
  // Cleanup
  cleanup: () => void;
}

export interface StreamTestResult {
  streamId: string;
  success: boolean;
  latency: number;
  bandwidth: number;
  packetLoss: number;
  jitter: number;
  error?: string;
}

export interface StreamHealth {
  overall: number; // 0-1
  connection: number;
  quality: number;
  stability: number;
  lastUpdate: Date;
}

export interface StreamConfig {
  stream: StreamInfo;
  exportedAt: Date;
  version: string;
}

export interface StreamAnalytics {
  streamId: string;
  duration: number;
  averageQuality: StreamQuality;
  qualityHistory: Array<{ timestamp: Date; quality: StreamQuality }>;
  errorCount: number;
  uptime: number;
  totalBytes: number;
}

export interface BandwidthAnalytics {
  total: number;
  upload: number;
  download: number;
  byStream: Record<string, number>;
  history: Array<{ timestamp: Date; usage: number }>;
}

const defaultStreamState: StreamState = {
  streams: {},
  activeStreamId: undefined,
  totalBandwidthUsage: 0,
  networkQuality: {
    overall: 0,
    stability: 0,
    latency: 0,
    bandwidth: 0,
    lastChecked: new Date()
  }
};

const defaultStreamStatistics: StreamStatistics = {
  duration: 0,
  bytesTransferred: 0,
  framesProcessed: 0,
  droppedFrames: 0,
  averageLatency: 0,
  errorCount: 0
};

const defaultStreamSettings: StreamSettings = {
  autoReconnect: true,
  maxRetries: 3,
  bufferSize: 1024,
  adaptiveBitrate: true,
  lowLatencyMode: false
};

const generateStreamId = () => `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createStreamingSlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  StreamingSlice
> = (set, get) => ({
  // Initial state
  streams: defaultStreamState,
  
  // Stream management
  createStream: (streamData) => {
    const id = generateStreamId();
    const stream: StreamInfo = {
      id,
      ...streamData,
      status: 'idle',
      statistics: { ...defaultStreamStatistics },
      settings: { ...defaultStreamSettings, ...streamData.settings }
    };
    
    set(produce((state: AppState) => {
      state.streams.streams[id] = stream;
    }));
    
    return id;
  },
  
  updateStream: (id, updates) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        Object.assign(state.streams.streams[id], updates);
      }
    }));
  },
  
  deleteStream: (id) => {
    set(produce((state: AppState) => {
      delete state.streams.streams[id];
      if (state.streams.activeStreamId === id) {
        state.streams.activeStreamId = undefined;
      }
    }));
  },
  
  setActiveStream: (id) => {
    set(produce((state: AppState) => {
      state.streams.activeStreamId = id || undefined;
    }));
  },
  
  // Connection management
  connectStream: async (id) => {
    const stream = get().streams.streams[id];
    if (!stream) return false;
    
    try {
      set(produce((state: AppState) => {
        if (state.streams.streams[id]) {
          state.streams.streams[id].status = 'connecting';
        }
      }));
      
      // Simulate connection logic (would be actual WebSocket/WebRTC connection)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      set(produce((state: AppState) => {
        if (state.streams.streams[id]) {
          state.streams.streams[id].status = 'connected';
        }
      }));
      
      return true;
    } catch (error) {
      get().reportStreamError(id, {
        code: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : 'Connection failed',
        severity: 'high'
      });
      
      set(produce((state: AppState) => {
        if (state.streams.streams[id]) {
          state.streams.streams[id].status = 'error';
        }
      }));
      
      return false;
    }
  },
  
  disconnectStream: (id) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        state.streams.streams[id].status = 'disconnected';
      }
    }));
  },
  
  reconnectStream: async (id) => {
    const stream = get().streams.streams[id];
    if (!stream) return false;
    
    // Disconnect first
    get().disconnectStream(id);
    
    // Wait a moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Attempt reconnection
    return get().connectStream(id);
  },
  
  testStreamConnection: async (id): Promise<StreamTestResult> => {
    const stream = get().streams.streams[id];
    if (!stream) {
      return {
        streamId: id,
        success: false,
        latency: 0,
        bandwidth: 0,
        packetLoss: 0,
        jitter: 0,
        error: 'Stream not found'
      };
    }
    
    const startTime = performance.now();
    
    try {
      // Simulate network test
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
      
      const latency = performance.now() - startTime;
      
      return {
        streamId: id,
        success: true,
        latency,
        bandwidth: Math.random() * 1000 + 500, // Mock bandwidth
        packetLoss: Math.random() * 0.01, // Mock packet loss
        jitter: Math.random() * 5 + 1 // Mock jitter
      };
    } catch (error) {
      return {
        streamId: id,
        success: false,
        latency: 0,
        bandwidth: 0,
        packetLoss: 0,
        jitter: 0,
        error: error instanceof Error ? error.message : 'Test failed'
      };
    }
  },
  
  // Quality monitoring
  updateStreamQuality: (id, qualityUpdate) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        Object.assign(state.streams.streams[id].quality, qualityUpdate);
      }
    }));
  },
  
  updateStreamStatistics: (id, statsUpdate) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        Object.assign(state.streams.streams[id].statistics, statsUpdate);
      }
    }));
  },
  
  getStreamHealth: (id) => {
    const stream = get().streams.streams[id];
    if (!stream) return null;
    
    const { quality, statistics } = stream;
    
    // Calculate health metrics
    const connectionHealth = stream.status === 'connected' || stream.status === 'streaming' ? 1 : 0;
    const qualityHealth = (quality.video.quality + quality.audio.quality) / 2;
    const stabilityHealth = Math.max(0, 1 - (statistics.droppedFrames / Math.max(statistics.framesProcessed, 1)));
    
    const overall = (connectionHealth + qualityHealth + stabilityHealth) / 3;
    
    return {
      overall,
      connection: connectionHealth,
      quality: qualityHealth,
      stability: stabilityHealth,
      lastUpdate: new Date()
    };
  },
  
  // Network management
  updateNetworkQuality: (qualityUpdate) => {
    set(produce((state: AppState) => {
      Object.assign(state.streams.networkQuality, qualityUpdate);
      state.streams.networkQuality.lastChecked = new Date();
    }));
  },
  
  checkNetworkQuality: async () => {
    // Simulate network quality check
    const latency = Math.random() * 100 + 20;
    const bandwidth = Math.random() * 1000 + 100;
    const stability = Math.random() * 0.3 + 0.7;
    const overall = (Math.min(latency / 100, 1) + bandwidth / 1000 + stability) / 3;
    
    const quality: NetworkQuality = {
      overall,
      stability,
      latency,
      bandwidth,
      lastChecked: new Date()
    };
    
    get().updateNetworkQuality(quality);
    return quality;
  },
  
  optimizeForNetwork: (networkQuality) => {
    const { streams } = get().streams;
    
    // Apply optimization based on network quality
    Object.keys(streams).forEach(streamId => {
      const optimizedSettings: Partial<StreamSettings> = {};
      
      if (networkQuality.overall < 0.5) {
        // Poor network - optimize for reliability
        optimizedSettings.lowLatencyMode = true;
        optimizedSettings.adaptiveBitrate = true;
        optimizedSettings.bufferSize = 2048;
      } else if (networkQuality.overall > 0.8) {
        // Good network - optimize for quality
        optimizedSettings.lowLatencyMode = false;
        optimizedSettings.bufferSize = 512;
      }
      
      get().updateStreamSettings(streamId, optimizedSettings);
    });
  },
  
  // Settings management
  updateStreamSettings: (id, settingsUpdate) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        Object.assign(state.streams.streams[id].settings, settingsUpdate);
      }
    }));
  },
  
  applyGlobalSettings: (settings) => {
    const { streams } = get().streams;
    
    Object.keys(streams).forEach(streamId => {
      get().updateStreamSettings(streamId, settings);
    });
  },
  
  exportStreamConfig: (id) => {
    const stream = get().streams.streams[id];
    if (!stream) return null;
    
    return {
      stream,
      exportedAt: new Date(),
      version: '1.0.0'
    };
  },
  
  importStreamConfig: (config) => {
    try {
      const id = get().createStream(config.stream);
      return id;
    } catch (error) {
      console.error('Failed to import stream config:', error);
      return null;
    }
  },
  
  // Error handling
  reportStreamError: (id, errorData) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        const error: StreamError = {
          ...errorData,
          timestamp: new Date()
        };
        
        state.streams.streams[id].error = error;
        state.streams.streams[id].statistics.errorCount += 1;
      }
    }));
  },
  
  clearStreamErrors: (id) => {
    set(produce((state: AppState) => {
      if (state.streams.streams[id]) {
        state.streams.streams[id].error = undefined;
      }
    }));
  },
  
  getStreamErrors: (id) => {
    const stream = get().streams.streams[id];
    return stream?.error ? [stream.error] : [];
  },
  
  // Analytics
  getStreamAnalytics: (id, duration) => {
    const stream = get().streams.streams[id];
    if (!stream) return null;
    
    // Mock analytics calculation
    const analytics: StreamAnalytics = {
      streamId: id,
      duration,
      averageQuality: stream.quality,
      qualityHistory: [{ timestamp: new Date(), quality: stream.quality }],
      errorCount: stream.statistics.errorCount,
      uptime: stream.statistics.duration,
      totalBytes: stream.statistics.bytesTransferred
    };
    
    return analytics;
  },
  
  getBandwidthUsage: () => {
    const { streams } = get().streams;
    
    let totalUpload = 0;
    let totalDownload = 0;
    const byStream: Record<string, number> = {};
    
    Object.entries(streams).forEach(([id, stream]) => {
      const streamBandwidth = stream.statistics.bytesTransferred / Math.max(stream.statistics.duration / 1000, 1);
      byStream[id] = streamBandwidth;
      totalUpload += streamBandwidth;
    });
    
    return {
      total: totalUpload + totalDownload,
      upload: totalUpload,
      download: totalDownload,
      byStream,
      history: [{ timestamp: new Date(), usage: totalUpload + totalDownload }]
    };
  },
  
  // Cleanup
  cleanup: () => {
    const { streams } = get().streams;
    
    // Disconnect all active streams
    Object.keys(streams).forEach(streamId => {
      if (streams[streamId].status === 'connected' || streams[streamId].status === 'streaming') {
        get().disconnectStream(streamId);
      }
    });
    
    // Reset state
    set(produce((state: AppState) => {
      state.streams = { ...defaultStreamState };
    }));
  }
});