// Audio streaming hook that combines WebSocket communication with audio capture
// This hook demonstrates binary data streaming over WebSocket for real-time audio processing

import { useCallback, useRef, useState, useEffect } from 'react';
import { useWebSocket, WebSocketMessage } from './useWebSocket';
import { useAudioCapture, AudioStats, AudioCaptureConfig } from './useAudioCapture';

// Audio streaming configuration
export interface AudioStreamingConfig extends AudioCaptureConfig {
  // WebSocket settings
  websocketUrl: string;
  clientId: string;
  
  // Streaming optimization
  enableCompression?: boolean;    // Enable audio compression
  bufferSize?: number;           // Internal buffer size for chunks
  maxRetries?: number;           // Retry attempts for failed chunks
  
  // Quality settings
  adaptiveQuality?: boolean;     // Adjust quality based on network conditions
  minBitrate?: number;          // Minimum bitrate during adaptive quality
  maxBitrate?: number;          // Maximum bitrate during adaptive quality
}

// Streaming statistics that extend audio statistics
export interface StreamingStats extends AudioStats {
  // Network metrics
  packetsLost: number;          // Number of failed transmissions
  retransmissions: number;      // Number of retries
  networkLatency: number;       // Round-trip time to server
  throughput: number;           // Current data throughput (bytes/sec)
  
  // Buffer metrics
  bufferSize: number;           // Current buffer size
  bufferUtilization: number;    // Buffer usage percentage
  
  // Quality metrics
  qualityScore: number;         // Overall quality score (0-100)
  adaptiveQualityEnabled: boolean;
  currentBitrate: number;       // Current streaming bitrate
}

// Streaming states
export enum StreamingState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  STREAMING = 'streaming',
  PAUSED = 'paused',
  BUFFERING = 'buffering',
  ERROR = 'error'
}

// Server response for audio processing
export interface AudioProcessingResponse {
  chunkId: string;
  processed: boolean;
  duration: number;
  sampleRate: number;
  channels: number;
  volume: number;
  error?: string;
}

// Hook return interface
export interface AudioStreamingHook {
  // Combined state from WebSocket and audio capture
  streamingState: StreamingState;
  isStreaming: boolean;
  isConnected: boolean;
  
  // Audio capture integration
  audioCapture: ReturnType<typeof useAudioCapture>;
  
  // Streaming statistics
  streamingStats: StreamingStats | null;
  
  // Server responses
  serverResponses: AudioProcessingResponse[];
  lastResponse: AudioProcessingResponse | null;
  
  // Controls
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
  pauseStreaming: () => void;
  resumeStreaming: () => void;
  
  // Quality control
  adjustQuality: (bitrate: number) => void;
  
  // Error handling
  streamingError: string | null;
}

/**
 * useAudioStreaming Hook
 * 
 * This hook combines WebSocket communication with audio capture to create
 * a complete real-time audio streaming solution. It demonstrates:
 * 
 * Binary Data Streaming:
 * - WebSocket can handle both text and binary data
 * - Binary frames are more efficient for audio data
 * - ArrayBuffer and Blob APIs for binary data handling
 * 
 * Chunk Management:
 * - Audio is captured in small chunks (250ms default)
 * - Each chunk is immediately streamed to reduce latency
 * - Buffering strategies for network resilience
 * 
 * Quality Adaptation:
 * - Monitor network conditions and adjust bitrate
 * - Graceful degradation during poor connectivity
 * - Maintain acceptable latency vs quality balance
 * 
 * Error Recovery:
 * - Retry failed transmissions
 * - Reconnection handling
 * - Buffer management during network issues
 * 
 * @param config - Combined audio and streaming configuration
 */
export const useAudioStreaming = (config: AudioStreamingConfig): AudioStreamingHook => {
  const {
    websocketUrl,
    clientId,
    enableCompression = false,
    bufferSize = 1024 * 1024, // 1MB buffer
    maxRetries = 3,
    adaptiveQuality = true,
    minBitrate = 16000,       // 16kbps minimum
    maxBitrate = 128000,      // 128kbps maximum
    ...audioConfig
  } = config;
  
  // State management
  const [streamingState, setStreamingState] = useState<StreamingState>(StreamingState.IDLE);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const [serverResponses, setServerResponses] = useState<AudioProcessingResponse[]>([]);
  const [lastResponse, setLastResponse] = useState<AudioProcessingResponse | null>(null);
  const [streamingError, setStreamingError] = useState<string | null>(null);
  
  // Streaming management refs
  const chunkBufferRef = useRef<Blob[]>([]);
  const chunkIdCounterRef = useRef<number>(0);
  const retryQueueRef = useRef<Map<string, { chunk: Blob, retries: number }>>(new Map());
  const throughputMeasurementRef = useRef<{ bytes: number, timestamp: number }[]>([]);
  const latencyMeasurementRef = useRef<Map<string, number>>(new Map());
  
  // WebSocket for streaming communication
  const websocket = useWebSocket({
    url: websocketUrl,
    debug: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 5
  });
  
  // Audio capture for real-time recording
  const audioCapture = useAudioCapture(
    audioConfig,
    handleAudioChunk // Callback when audio chunk is available
  );
  
  // Initialize streaming statistics
  const initializeStreamingStats = useCallback(() => {
    if (!audioCapture.stats) return null;
    
    const stats: StreamingStats = {
      ...audioCapture.stats,
      packetsLost: 0,
      retransmissions: 0,
      networkLatency: 0,
      throughput: 0,
      bufferSize: 0,
      bufferUtilization: 0,
      qualityScore: 100,
      adaptiveQualityEnabled: adaptiveQuality,
      currentBitrate: audioConfig.audioBitsPerSecond || 32000
    };
    
    setStreamingStats(stats);
    return stats;
  }, [audioCapture.stats, adaptiveQuality, audioConfig.audioBitsPerSecond]);
  
  // Calculate network throughput
  const calculateThroughput = useCallback(() => {
    const now = Date.now();
    const measurements = throughputMeasurementRef.current;
    
    // Keep only measurements from last 5 seconds
    const recentMeasurements = measurements.filter(m => now - m.timestamp < 5000);
    throughputMeasurementRef.current = recentMeasurements;
    
    if (recentMeasurements.length < 2) return 0;
    
    const totalBytes = recentMeasurements.reduce((sum, m) => sum + m.bytes, 0);
    const timeSpan = (now - recentMeasurements[0].timestamp) / 1000; // seconds
    
    return totalBytes / timeSpan; // bytes per second
  }, []);
  
  // Update streaming statistics
  const updateStreamingStats = useCallback(() => {
    if (!streamingStats || !audioCapture.stats) return;
    
    const throughput = calculateThroughput();
    const bufferUtilization = (chunkBufferRef.current.length / 10) * 100; // Assume max 10 chunks
    const qualityScore = Math.max(0, 100 - (streamingStats.packetsLost * 10) - (streamingStats.networkLatency / 10));
    
    const updatedStats: StreamingStats = {
      ...audioCapture.stats,
      packetsLost: streamingStats.packetsLost,
      retransmissions: streamingStats.retransmissions,
      networkLatency: streamingStats.networkLatency,
      throughput,
      bufferSize: chunkBufferRef.current.length,
      bufferUtilization: Math.min(100, bufferUtilization),
      qualityScore: Math.max(0, qualityScore),
      adaptiveQualityEnabled: adaptiveQuality,
      currentBitrate: streamingStats.currentBitrate
    };
    
    setStreamingStats(updatedStats);
  }, [streamingStats, audioCapture.stats, calculateThroughput, adaptiveQuality]);
  
  // Handle incoming WebSocket messages
  useEffect(() => {
    if (websocket.lastMessage?.type === 'audio_processing_response') {
      const response: AudioProcessingResponse = websocket.lastMessage.data;
      
      // Update latency measurements
      const chunkId = response.chunkId;
      const sentTime = latencyMeasurementRef.current.get(chunkId);
      if (sentTime) {
        const latency = Date.now() - sentTime;
        latencyMeasurementRef.current.delete(chunkId);
        
        // Update streaming stats with new latency
        if (streamingStats) {
          setStreamingStats(prev => prev ? {
            ...prev,
            networkLatency: latency
          } : null);
        }
      }
      
      // Add to responses
      setServerResponses(prev => [...prev.slice(-49), response]); // Keep last 50
      setLastResponse(response);
      
      // Handle errors
      if (response.error) {
        console.error('Server audio processing error:', response.error);
        setStreamingError(`Server error: ${response.error}`);
      }
    }
  }, [websocket.lastMessage, streamingStats]);
  
  // Stream audio chunk to server
  const streamAudioChunk = useCallback(async (chunk: Blob) => {
    if (!websocket.isConnected) {
      console.warn('Cannot stream audio: WebSocket not connected');
      return false;
    }
    
    try {
      const chunkId = `chunk_${chunkIdCounterRef.current++}`;
      
      // Convert Blob to ArrayBuffer for binary transmission
      const arrayBuffer = await chunk.arrayBuffer();
      
      // Create message with audio metadata
      const audioMessage = {
        type: 'audio_chunk',
        data: {
          chunkId,
          timestamp: Date.now(),
          size: arrayBuffer.byteLength,
          mimeType: chunk.type,
          sampleRate: audioCapture.stats?.sampleRate,
          channels: audioCapture.stats?.channelCount,
          duration: audioConfig.chunkDuration || 250
        }
      };
      
      // Send metadata first
      websocket.sendMessage('audio_chunk_metadata', audioMessage.data);
      
      // Then send binary data
      // Note: In a real implementation, you'd send the binary data directly
      // For this demo, we'll base64 encode it to send as text
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      websocket.sendMessage('audio_chunk_data', {
        chunkId,
        data: base64Data
      });
      
      // Track for latency measurement
      latencyMeasurementRef.current.set(chunkId, Date.now());
      
      // Update throughput measurement
      throughputMeasurementRef.current.push({
        bytes: arrayBuffer.byteLength,
        timestamp: Date.now()
      });
      
      console.log(`Streamed audio chunk ${chunkId}:`, {
        size: arrayBuffer.byteLength,
        duration: audioConfig.chunkDuration,
        mimeType: chunk.type
      });
      
      return true;
      
    } catch (error) {
      console.error('Error streaming audio chunk:', error);
      
      // Update error statistics
      if (streamingStats) {
        setStreamingStats(prev => prev ? {
          ...prev,
          packetsLost: prev.packetsLost + 1
        } : null);
      }
      
      return false;
    }
  }, [
    websocket.isConnected,
    websocket.sendMessage,
    audioCapture.stats,
    audioConfig.chunkDuration,
    streamingStats
  ]);
  
  // Handle audio chunk from capture
  async function handleAudioChunk(chunk: Blob, stats: AudioStats) {
    if (streamingState !== StreamingState.STREAMING) return;
    
    // Add to buffer
    chunkBufferRef.current.push(chunk);
    
    // Process buffer
    await processChunkBuffer();
    
    // Update statistics
    updateStreamingStats();
  }
  
  // Process buffered audio chunks
  const processChunkBuffer = useCallback(async () => {
    const buffer = chunkBufferRef.current;
    
    while (buffer.length > 0 && streamingState === StreamingState.STREAMING) {
      const chunk = buffer.shift()!;
      
      const success = await streamAudioChunk(chunk);
      
      if (!success) {
        // Add to retry queue
        const chunkId = `retry_${Date.now()}`;
        retryQueueRef.current.set(chunkId, { chunk, retries: 0 });
      }
      
      // Prevent overwhelming the connection
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Process retry queue
    await processRetryQueue();
  }, [streamingState, streamAudioChunk]);
  
  // Process failed chunk retries
  const processRetryQueue = useCallback(async () => {
    const retryQueue = retryQueueRef.current;
    
    for (const [chunkId, { chunk, retries }] of retryQueue.entries()) {
      if (retries >= maxRetries) {
        retryQueue.delete(chunkId);
        console.warn(`Dropping chunk ${chunkId} after ${maxRetries} retries`);
        continue;
      }
      
      const success = await streamAudioChunk(chunk);
      
      if (success) {
        retryQueue.delete(chunkId);
      } else {
        retryQueue.set(chunkId, { chunk, retries: retries + 1 });
        
        // Update retry statistics
        if (streamingStats) {
          setStreamingStats(prev => prev ? {
            ...prev,
            retransmissions: prev.retransmissions + 1
          } : null);
        }
      }
    }
  }, [maxRetries, streamAudioChunk, streamingStats]);
  
  // Adaptive quality adjustment
  const adjustQuality = useCallback((bitrate: number) => {
    const clampedBitrate = Math.max(minBitrate, Math.min(maxBitrate, bitrate));
    
    if (streamingStats) {
      setStreamingStats(prev => prev ? {
        ...prev,
        currentBitrate: clampedBitrate
      } : null);
    }
    
    console.log(`Adjusted audio quality to ${clampedBitrate}bps`);
  }, [minBitrate, maxBitrate, streamingStats]);
  
  // Auto-adjust quality based on network conditions
  useEffect(() => {
    if (!adaptiveQuality || !streamingStats) return;
    
    const interval = setInterval(() => {
      const { networkLatency, packetsLost, qualityScore } = streamingStats;
      
      // Reduce quality if network conditions are poor
      if (networkLatency > 500 || packetsLost > 5 || qualityScore < 50) {
        const newBitrate = Math.max(minBitrate, streamingStats.currentBitrate * 0.8);
        adjustQuality(newBitrate);
      }
      // Increase quality if network conditions are good
      else if (networkLatency < 100 && packetsLost === 0 && qualityScore > 80) {
        const newBitrate = Math.min(maxBitrate, streamingStats.currentBitrate * 1.1);
        adjustQuality(newBitrate);
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [adaptiveQuality, streamingStats, adjustQuality, minBitrate, maxBitrate]);
  
  // Start streaming
  const startStreaming = useCallback(async () => {
    try {
      setStreamingError(null);
      setStreamingState(StreamingState.CONNECTING);
      
      // Ensure WebSocket connection
      if (!websocket.isConnected) {
        console.log('Connecting to WebSocket for audio streaming...');
        websocket.connect();
        
        // Wait for connection
        let attempts = 0;
        while (!websocket.isConnected && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        if (!websocket.isConnected) {
          throw new Error('Failed to establish WebSocket connection');
        }
      }
      
      // Initialize statistics
      initializeStreamingStats();
      
      // Start audio capture
      await audioCapture.startRecording();
      
      setStreamingState(StreamingState.STREAMING);
      console.log('Audio streaming started');
      
    } catch (error) {
      console.error('Error starting audio streaming:', error);
      setStreamingError(error instanceof Error ? error.message : 'Failed to start streaming');
      setStreamingState(StreamingState.ERROR);
    }
  }, [websocket, audioCapture, initializeStreamingStats]);
  
  // Stop streaming
  const stopStreaming = useCallback(() => {
    audioCapture.stopRecording();
    chunkBufferRef.current = [];
    retryQueueRef.current.clear();
    latencyMeasurementRef.current.clear();
    throughputMeasurementRef.current.length = 0;
    
    setStreamingState(StreamingState.IDLE);
    setStreamingStats(null);
    setServerResponses([]);
    setLastResponse(null);
    
    console.log('Audio streaming stopped');
  }, [audioCapture]);
  
  // Pause streaming
  const pauseStreaming = useCallback(() => {
    audioCapture.pauseRecording();
    setStreamingState(StreamingState.PAUSED);
  }, [audioCapture]);
  
  // Resume streaming
  const resumeStreaming = useCallback(() => {
    audioCapture.resumeRecording();
    setStreamingState(StreamingState.STREAMING);
  }, [audioCapture]);
  
  // Update statistics periodically
  useEffect(() => {
    if (streamingState === StreamingState.STREAMING) {
      const interval = setInterval(updateStreamingStats, 1000);
      return () => clearInterval(interval);
    }
  }, [streamingState, updateStreamingStats]);
  
  return {
    // State
    streamingState,
    isStreaming: streamingState === StreamingState.STREAMING,
    isConnected: websocket.isConnected,
    
    // Audio capture integration
    audioCapture,
    
    // Statistics
    streamingStats,
    
    // Server communication
    serverResponses,
    lastResponse,
    
    // Controls
    startStreaming,
    stopStreaming,
    pauseStreaming,
    resumeStreaming,
    
    // Quality control
    adjustQuality,
    
    // Error handling
    streamingError
  };
};