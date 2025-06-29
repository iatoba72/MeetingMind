/**
 * Unified Audio Pipeline for MeetingMind
 * Handles both local browser audio capture and network stream reception
 * Provides a single interface for all audio sources with real-time processing
 */

import { AudioCapture, AudioChunk, AudioMetrics, AudioCaptureConfig } from './AudioCapture';

export interface AudioFeatures {
  spectralCentroid: number;
  spectralRolloff: number;
  zeroCrossingRate: number;
  mfcc?: number[];
  pitch?: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  sourceId: string;
  timestamp: number;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface WebSocketMessage {
  type: 'network_audio' | 'source_status' | 'metrics_update' | 'transcription_result' | 'chunk_processed' | 'error' | string;
  data?: NetworkAudioData | TranscriptionResult | Record<string, unknown>;
  sourceId?: string;
  status?: string;
  metrics?: AudioMetrics;
  message?: string;
}

export interface NetworkAudioData {
  sourceId: string;
  chunk: NetworkAudioChunk;
  streamInfo: StreamInfo;
}

export interface NetworkAudioChunk {
  chunk_id: string;
  timestamp: number;
  duration_ms: number;
  sample_rate: number;
  channels: number;
  rms_level: number;
  has_voice: boolean;
}

export interface StreamInfo {
  bytes_received: number;
  packets_received: number;
  jitter: number;
  latency: number;
  state: string;
}

export interface ChunkProcessedMessage {
  source_id: string;
  result: {
    processed: boolean;
    timestamp: number;
    features?: AudioFeatures;
    error?: string;
  };
}

export interface NetworkAudioSource {
  id: string;
  type: 'rtmp' | 'srt' | 'websocket';
  url: string;
  status: 'connecting' | 'connected' | 'streaming' | 'error' | 'disconnected';
  lastReceived?: number;
  bytesReceived: number;
  packetsReceived: number;
  jitter: number;
  latency: number;
}

export interface AudioSource {
  id: string;
  name: string;
  type: 'microphone' | 'system' | 'network';
  status: 'active' | 'inactive' | 'error';
  isPrimary: boolean;
  volume: number;
  config: AudioCaptureConfig;
  metrics: AudioMetrics;
  networkInfo?: NetworkAudioSource;
}

export interface PipelineConfig {
  enableAutoSwitching: boolean;
  primarySourceTimeout: number; // milliseconds
  bufferSize: number;
  maxSources: number;
  enableRecording: boolean;
  recordingPath?: string;
  enableVisualization: boolean;
  processingInterval: number; // milliseconds for sending chunks to backend
}

export interface ProcessedAudioChunk extends AudioChunk {
  sourceId: string;
  processedAt: number;
  features: AudioFeatures;
}

export class AudioPipeline {
  private sources: Map<string, AudioSource> = new Map();
  private audioCaptures: Map<string, AudioCapture> = new Map();
  private websocket: WebSocket | null = null;
  private isRunning = false;
  private primarySource: string | null = null;
  private config: PipelineConfig;
  
  // Audio processing
  private audioContext: AudioContext | null = null;
  private mixerNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private processingBuffer: ProcessedAudioChunk[] = [];
  private processingTimer: number | null = null;
  
  // Event handlers
  private onChunkCallback?: (chunk: ProcessedAudioChunk) => void;
  private onSourceChangeCallback?: (sources: AudioSource[]) => void;
  private onMetricsCallback?: (sourceId: string, metrics: AudioMetrics) => void;
  private onErrorCallback?: (error: Error, sourceId?: string) => void;
  private onTranscriptionCallback?: (result: TranscriptionResult) => void;
  
  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      enableAutoSwitching: true,
      primarySourceTimeout: 5000,
      bufferSize: 4096,
      maxSources: 4,
      enableRecording: false,
      enableVisualization: true,
      processingInterval: 100, // Send chunks every 100ms
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      // Initialize audio context for mixing and processing
      this.audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });

      // Create mixer node for combining multiple sources
      this.mixerNode = this.audioContext.createGain();
      this.mixerNode.gain.value = 1.0;

      // Create analyser for pipeline visualization
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.mixerNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);

      // Connect to backend WebSocket
      await this.connectWebSocket();

      console.log('AudioPipeline initialized successfully');
    } catch (error) {
      this.handleError(new Error(`Failed to initialize AudioPipeline: ${error}`));
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:8000/ws/audio-pipeline`;
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('AudioPipeline WebSocket connected');
        resolve();
      };

      this.websocket.onmessage = (event) => {
        this.handleWebSocketMessage(JSON.parse(event.data));
      };

      this.websocket.onerror = (error) => {
        console.error('AudioPipeline WebSocket error:', error);
        reject(error);
      };

      this.websocket.onclose = () => {
        console.log('AudioPipeline WebSocket disconnected');
        // Attempt to reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    });
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'network_audio':
        this.handleNetworkAudio(message.data);
        break;
      case 'source_status':
        this.updateSourceStatus(message.sourceId, message.status);
        break;
      case 'metrics_update':
        this.updateSourceMetrics(message.sourceId, message.metrics);
        break;
      case 'transcription_result':
        this.handleTranscriptionResult(message.data);
        break;
      case 'chunk_processed':
        this.handleChunkProcessed(message);
        break;
      case 'error':
        this.handleError(new Error(message.message));
        break;
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  async addLocalSource(
    type: 'microphone' | 'system',
    config: Partial<AudioCaptureConfig> = {}
  ): Promise<string> {
    const sourceId = `local_${type}_${Date.now()}`;
    
    // Create audio capture instance
    const audioCapture = new AudioCapture({
      ...config,
      channelCount: 1, // Mono for processing efficiency
      enableVAD: true
    });

    await audioCapture.initialize();

    // Set up event handlers
    audioCapture.onChunk((chunk) => {
      this.processAudioChunk(sourceId, chunk);
    });

    audioCapture.onMetrics((metrics) => {
      this.updateSourceMetrics(sourceId, metrics);
    });

    audioCapture.onError((error) => {
      this.handleError(error, sourceId);
    });

    audioCapture.onStateChange((state) => {
      this.updateSourceStatus(sourceId, state);
    });

    // Create audio source entry
    const source: AudioSource = {
      id: sourceId,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Audio`,
      type: type,
      status: 'inactive',
      isPrimary: this.sources.size === 0, // First source becomes primary
      volume: 1.0,
      config: audioCapture.getConfig(),
      metrics: audioCapture.getMetrics()
    };

    this.sources.set(sourceId, source);
    this.audioCaptures.set(sourceId, audioCapture);

    if (source.isPrimary) {
      this.primarySource = sourceId;
    }

    // Register source with backend
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'register_local_source',
        sourceId: sourceId,
        sourceType: type,
        config: {
          sampleRate: audioCapture.getConfig().sampleRate,
          channels: audioCapture.getConfig().channelCount,
          enableVAD: audioCapture.getConfig().enableVAD
        }
      }));
    }

    this.notifySourceChange();
    return sourceId;
  }

  async addNetworkSource(url: string, type: 'rtmp' | 'srt'): Promise<string> {
    const sourceId = `network_${type}_${Date.now()}`;

    const networkInfo: NetworkAudioSource = {
      id: sourceId,
      type: type,
      url: url,
      status: 'connecting',
      bytesReceived: 0,
      packetsReceived: 0,
      jitter: 0,
      latency: 0
    };

    const source: AudioSource = {
      id: sourceId,
      name: `${type.toUpperCase()} Stream`,
      type: 'network',
      status: 'inactive',
      isPrimary: false,
      volume: 1.0,
      config: {
        sampleRate: 44100,
        channelCount: 2,
        bitDepth: 16,
        codec: 'pcm',
        bufferSize: this.config.bufferSize,
        enableEchoCancellation: false,
        enableNoiseSuppression: false,
        enableAutoGainControl: false,
        enableVAD: true,
        vadThreshold: 0.01,
        chunkDuration: 1000
      },
      metrics: {
        volumeLevel: 0,
        peakLevel: 0,
        averageLevel: 0,
        voiceActivityPercent: 0,
        totalDuration: 0,
        chunksProcessed: 0,
        droppedChunks: 0,
        latency: 0
      },
      networkInfo
    };

    this.sources.set(sourceId, source);

    // Request backend to start network stream reception
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'start_network_source',
        sourceId: sourceId,
        config: {
          url: url,
          protocol: type,
          sampleRate: 44100,
          channels: 2
        }
      }));
    }

    this.notifySourceChange();
    return sourceId;
  }

  async startSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    if (source.type === 'microphone' || source.type === 'system') {
      const audioCapture = this.audioCaptures.get(sourceId);
      if (audioCapture) {
        await audioCapture.startCapture(source.type);
        source.status = 'active';
      }
    } else if (source.type === 'network') {
      // Network sources are managed by the backend
      source.status = 'active';
    }

    this.notifySourceChange();
  }

  async stopSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) return;

    if (source.type === 'microphone' || source.type === 'system') {
      const audioCapture = this.audioCaptures.get(sourceId);
      if (audioCapture) {
        audioCapture.stopCapture();
      }
    } else if (source.type === 'network') {
      // Request backend to stop network source
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({
          type: 'stop_network_source',
          sourceId: sourceId
        }));
      }
    }

    source.status = 'inactive';
    this.notifySourceChange();
  }

  removeSource(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    this.stopSource(sourceId);

    if (source.type === 'microphone' || source.type === 'system') {
      const audioCapture = this.audioCaptures.get(sourceId);
      if (audioCapture) {
        audioCapture.dispose();
        this.audioCaptures.delete(sourceId);
      }
    }

    this.sources.delete(sourceId);

    // If removing primary source, select new primary
    if (this.primarySource === sourceId) {
      this.selectNewPrimarySource();
    }

    this.notifySourceChange();
  }

  setPrimarySource(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    // Remove primary from current source
    if (this.primarySource) {
      const currentPrimary = this.sources.get(this.primarySource);
      if (currentPrimary) {
        currentPrimary.isPrimary = false;
      }
    }

    // Set new primary
    source.isPrimary = true;
    this.primarySource = sourceId;

    this.notifySourceChange();
  }

  private selectNewPrimarySource(): void {
    const activeSources = Array.from(this.sources.values()).filter(s => s.status === 'active');
    
    if (activeSources.length > 0) {
      // Prefer microphone sources, then system, then network
      const prioritized = activeSources.sort((a, b) => {
        const priority = { microphone: 0, system: 1, network: 2 };
        return priority[a.type] - priority[b.type];
      });

      this.setPrimarySource(prioritized[0].id);
    } else {
      this.primarySource = null;
    }
  }

  private processAudioChunk(sourceId: string, chunk: AudioChunk): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    // Calculate additional audio features
    const features = this.calculateAudioFeatures(chunk.data);

    const processedChunk: ProcessedAudioChunk = {
      ...chunk,
      sourceId: sourceId,
      processedAt: performance.now(),
      features: features
    };

    // Add to processing buffer
    this.processingBuffer.push(processedChunk);

    // Trigger chunk callback
    if (this.onChunkCallback) {
      this.onChunkCallback(processedChunk);
    }

    // Auto-switching logic
    if (this.config.enableAutoSwitching && sourceId !== this.primarySource) {
      this.handleAutoSwitching(sourceId, source);
    }
  }

  private calculateAudioFeatures(audioData: ArrayBuffer): AudioFeatures {
    // Convert ArrayBuffer to Float32Array for analysis
    const samples = new Float32Array(audioData);
    
    // Simple spectral analysis (in real implementation, use FFT)
    let spectralCentroid = 0;
    let spectralRolloff = 0;
    let zeroCrossingRate = 0;

    // Calculate zero crossing rate
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) {
        zeroCrossingRate++;
      }
    }
    zeroCrossingRate /= samples.length;

    // Simplified spectral calculations
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const magnitude = Math.abs(samples[i]);
      weightedSum += i * magnitude;
      magnitudeSum += magnitude;
    }
    
    if (magnitudeSum > 0) {
      spectralCentroid = (weightedSum / magnitudeSum / samples.length) * 22050; // Approximate
    }

    // Simple rolloff calculation
    let cumulativeEnergy = 0;
    const totalEnergy = magnitudeSum;
    const rolloffThreshold = 0.85 * totalEnergy;
    
    for (let i = 0; i < samples.length; i++) {
      cumulativeEnergy += Math.abs(samples[i]);
      if (cumulativeEnergy >= rolloffThreshold) {
        spectralRolloff = (i / samples.length) * 22050;
        break;
      }
    }

    return {
      spectralCentroid,
      spectralRolloff,
      zeroCrossingRate
    };
  }

  private handleAutoSwitching(sourceId: string, source: AudioSource): void {
    if (!this.primarySource) {
      this.setPrimarySource(sourceId);
      return;
    }

    const primarySource = this.sources.get(this.primarySource);
    if (!primarySource) return;

    // Check if primary source has timed out
    const now = Date.now();
    const timeSinceLastActivity = now - (source.metrics.totalDuration || 0);
    
    if (timeSinceLastActivity > this.config.primarySourceTimeout) {
      console.log(`Primary source ${this.primarySource} timed out, switching to ${sourceId}`);
      this.setPrimarySource(sourceId);
      return;
    }

    // Quality-based switching (prefer lower latency)
    if (source.metrics.latency < primarySource.metrics.latency - 50) {
      console.log(`Switching to lower latency source: ${sourceId}`);
      this.setPrimarySource(sourceId);
    }
  }

  private handleNetworkAudio(data: NetworkAudioData): void {
    const { sourceId, chunk, streamInfo } = data;
    const source = this.sources.get(sourceId);
    
    if (!source || !source.networkInfo) return;

    // Update network metrics
    source.networkInfo.bytesReceived = streamInfo.bytes_received;
    source.networkInfo.packetsReceived = streamInfo.packets_received;
    source.networkInfo.jitter = streamInfo.jitter;
    source.networkInfo.latency = streamInfo.latency;
    source.networkInfo.status = streamInfo.state;
    source.networkInfo.lastReceived = Date.now();

    // Update source metrics
    source.metrics = {
      volumeLevel: chunk.rms_level,
      peakLevel: Math.max(source.metrics.peakLevel, chunk.rms_level),
      averageLevel: source.metrics.averageLevel * 0.9 + chunk.rms_level * 0.1,
      voiceActivityPercent: chunk.has_voice ? 100 : 0,
      totalDuration: source.metrics.totalDuration + chunk.duration_ms,
      chunksProcessed: source.metrics.chunksProcessed + 1,
      droppedChunks: source.metrics.droppedChunks,
      latency: streamInfo.latency
    };

    // Create processed chunk
    const processedChunk: ProcessedAudioChunk = {
      id: chunk.chunk_id,
      timestamp: chunk.timestamp,
      duration: chunk.duration_ms,
      data: new ArrayBuffer(0), // Network audio data handled by backend
      sampleRate: chunk.sample_rate,
      channelCount: chunk.channels,
      rms: chunk.rms_level,
      hasVoice: chunk.has_voice,
      source: 'network',
      sourceId: sourceId,
      processedAt: performance.now(),
      features: {
        spectralCentroid: 0, // These would be calculated by backend
        spectralRolloff: 0,
        zeroCrossingRate: 0
      }
    };

    this.processingBuffer.push(processedChunk);

    if (this.onChunkCallback) {
      this.onChunkCallback(processedChunk);
    }
  }

  private updateSourceStatus(sourceId: string, status: string): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.status = status as AudioSource['status'];
      this.notifySourceChange();
    }
  }

  private updateSourceMetrics(sourceId: string, metrics: AudioMetrics): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.metrics = metrics;
      if (this.onMetricsCallback) {
        this.onMetricsCallback(sourceId, metrics);
      }
    }
  }

  private handleTranscriptionResult(data: TranscriptionResult): void {
    if (this.onTranscriptionCallback) {
      this.onTranscriptionCallback(data);
    }
  }

  private handleChunkProcessed(message: ChunkProcessedMessage): void {
    console.log('Chunk processed:', message.source_id, message.result);
  }

  async startPipeline(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start processing timer
    this.processingTimer = window.setInterval(() => {
      this.processBuffer();
    }, this.config.processingInterval);

    console.log('AudioPipeline started');
  }

  async stopPipeline(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop all sources
    for (const sourceId of this.sources.keys()) {
      await this.stopSource(sourceId);
    }

    // Clear processing timer
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    console.log('AudioPipeline stopped');
  }

  private processBuffer(): void {
    if (this.processingBuffer.length === 0) return;

    // Send buffered chunks to backend for processing
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const chunks = this.processingBuffer.splice(0); // Clear buffer
      
      this.websocket.send(JSON.stringify({
        type: 'audio_chunks',
        chunks: chunks.map(chunk => ({
          sourceId: chunk.sourceId,
          timestamp: chunk.timestamp,
          duration: chunk.duration,
          rms: chunk.rms,
          hasVoice: chunk.hasVoice,
          features: chunk.features
        }))
      }));
    }
  }

  private notifySourceChange(): void {
    if (this.onSourceChangeCallback) {
      this.onSourceChangeCallback(Array.from(this.sources.values()));
    }
  }

  private handleError(error: Error, sourceId?: string): void {
    console.error('AudioPipeline error:', error, sourceId);
    if (this.onErrorCallback) {
      this.onErrorCallback(error, sourceId);
    }
  }

  // Public API
  getSources(): AudioSource[] {
    return Array.from(this.sources.values());
  }

  getSource(sourceId: string): AudioSource | undefined {
    return this.sources.get(sourceId);
  }

  getPrimarySource(): AudioSource | null {
    return this.primarySource ? this.sources.get(this.primarySource) || null : null;
  }

  getVisualizationData(): { frequency: Uint8Array; time: Uint8Array } | null {
    if (!this.analyserNode) return null;

    const frequency = new Uint8Array(this.analyserNode.frequencyBinCount);
    const time = new Uint8Array(this.analyserNode.frequencyBinCount);

    this.analyserNode.getByteFrequencyData(frequency);
    this.analyserNode.getByteTimeDomainData(time);

    return { frequency, time };
  }

  setConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  // Event handlers
  onChunk(callback: (chunk: ProcessedAudioChunk) => void): void {
    this.onChunkCallback = callback;
  }

  onSourceChange(callback: (sources: AudioSource[]) => void): void {
    this.onSourceChangeCallback = callback;
  }

  onMetrics(callback: (sourceId: string, metrics: AudioMetrics) => void): void {
    this.onMetricsCallback = callback;
  }

  onError(callback: (error: Error, sourceId?: string) => void): void {
    this.onErrorCallback = callback;
  }

  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.onTranscriptionCallback = callback;
  }

  dispose(): void {
    this.stopPipeline();

    // Cleanup audio captures
    for (const audioCapture of this.audioCaptures.values()) {
      audioCapture.dispose();
    }
    this.audioCaptures.clear();
    this.sources.clear();

    // Cleanup WebSocket
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Cleanup audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.mixerNode = null;
    this.analyserNode = null;

    console.log('AudioPipeline disposed');
  }
}

export default AudioPipeline;