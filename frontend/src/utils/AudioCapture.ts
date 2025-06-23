/**
 * Advanced Audio Capture System for MeetingMind
 * Supports browser MediaRecorder API with real-time processing
 */

export interface AudioCaptureConfig {
  sampleRate: number;
  channelCount: number;
  bitDepth: number;
  codec: string;
  bufferSize: number;
  enableEchoCancellation: boolean;
  enableNoiseSuppression: boolean;
  enableAutoGainControl: boolean;
  enableVAD: boolean; // Voice Activity Detection
  vadThreshold: number;
  chunkDuration: number; // milliseconds
}

export interface AudioChunk {
  id: string;
  timestamp: number;
  duration: number;
  data: ArrayBuffer;
  sampleRate: number;
  channelCount: number;
  rms: number; // Root Mean Square for volume level
  hasVoice: boolean; // Voice Activity Detection result
  source: 'microphone' | 'system' | 'network';
}

export interface AudioMetrics {
  volumeLevel: number;
  peakLevel: number;
  averageLevel: number;
  voiceActivityPercent: number;
  totalDuration: number;
  chunksProcessed: number;
  droppedChunks: number;
  latency: number;
}

export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  
  private config: AudioCaptureConfig;
  private isCapturing = false;
  private isPaused = false;
  private startTime = 0;
  private metrics: AudioMetrics;
  private chunkId = 0;
  
  // Event handlers
  private onChunkCallback?: (chunk: AudioChunk) => void;
  private onMetricsCallback?: (metrics: AudioMetrics) => void;
  private onErrorCallback?: (error: Error) => void;
  private onStateChangeCallback?: (state: 'starting' | 'recording' | 'paused' | 'stopped' | 'error') => void;
  
  // Audio analysis
  private frequencyData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;
  private volumeHistory: number[] = [];
  private vadHistory: boolean[] = [];
  
  constructor(config: Partial<AudioCaptureConfig> = {}) {
    this.config = {
      sampleRate: 44100,
      channelCount: 1,
      bitDepth: 16,
      codec: 'audio/webm;codecs=opus',
      bufferSize: 4096,
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
      enableAutoGainControl: true,
      enableVAD: true,
      vadThreshold: 0.01,
      chunkDuration: 1000, // 1 second chunks
      ...config
    };
    
    this.metrics = {
      volumeLevel: 0,
      peakLevel: 0,
      averageLevel: 0,
      voiceActivityPercent: 0,
      totalDuration: 0,
      chunksProcessed: 0,
      droppedChunks: 0,
      latency: 0
    };
  }
  
  // Event handler setters
  onChunk(callback: (chunk: AudioChunk) => void): void {
    this.onChunkCallback = callback;
  }
  
  onMetrics(callback: (metrics: AudioMetrics) => void): void {
    this.onMetricsCallback = callback;
  }
  
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }
  
  onStateChange(callback: (state: string) => void): void {
    this.onStateChangeCallback = callback;
  }
  
  async initialize(): Promise<void> {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported');
      }
      
      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder API not supported');
      }
      
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
        latencyHint: 'interactive'
      });
      
      // Load audio worklet for advanced processing
      try {
        await this.audioContext.audioWorklet.addModule('/audio-processor-worklet.js');
      } catch (error) {
        console.warn('AudioWorklet not available, falling back to ScriptProcessorNode');
      }
      
      console.log('AudioCapture initialized successfully');
    } catch (error) {
      this.handleError(new Error(`Failed to initialize audio capture: ${error}`));
      throw error;
    }
  }
  
  async requestPermissions(): Promise<boolean> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: this.config.enableEchoCancellation,
          noiseSuppression: this.config.enableNoiseSuppression,
          autoGainControl: this.config.enableAutoGainControl,
          latency: 0.01 // Request low latency
        },
        video: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Test the stream and then stop it
      stream.getTracks().forEach(track => track.stop());
      
      return true;
    } catch (error) {
      console.error('Failed to get microphone permissions:', error);
      return false;
    }
  }
  
  async startCapture(source: 'microphone' | 'system' = 'microphone'): Promise<void> {
    try {
      if (this.isCapturing) {
        throw new Error('Already capturing audio');
      }
      
      this.setState('starting');
      
      // Get media stream
      this.stream = await this.getMediaStream(source);
      
      // Set up audio analysis
      await this.setupAudioAnalysis();
      
      // Set up MediaRecorder
      this.setupMediaRecorder();
      
      // Start recording
      this.mediaRecorder!.start(this.config.chunkDuration);
      this.startTime = Date.now();
      this.isCapturing = true;
      this.isPaused = false;
      
      this.setState('recording');
      
      console.log(`Started audio capture from ${source}`);
    } catch (error) {
      this.handleError(new Error(`Failed to start capture: ${error}`));
      throw error;
    }
  }
  
  private async getMediaStream(source: 'microphone' | 'system'): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      video: false,
      audio: source === 'system' ? {
        // System audio capture (Chrome only with screen sharing)
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: 'screen'
        }
      } as any : {
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channelCount,
        echoCancellation: this.config.enableEchoCancellation,
        noiseSuppression: this.config.enableNoiseSuppression,
        autoGainControl: this.config.enableAutoGainControl,
        latency: 0.01
      }
    };
    
    if (source === 'system') {
      // For system audio, we need to use getDisplayMedia
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: true
      });
      
      return displayStream;
    } else {
      return await navigator.mediaDevices.getUserMedia(constraints);
    }
  }
  
  private async setupAudioAnalysis(): Promise<void> {
    if (!this.audioContext || !this.stream) return;
    
    // Create audio source
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    
    // Create analyser for visualization and VAD
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.frequencyBinCount);
    
    // Try to use AudioWorklet for better performance
    if (this.audioContext.audioWorklet) {
      try {
        this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor', {
          processorOptions: {
            bufferSize: this.config.bufferSize,
            sampleRate: this.config.sampleRate,
            vadThreshold: this.config.vadThreshold
          }
        });
        
        this.workletNode.port.onmessage = (event) => {
          this.handleAudioData(event.data);
        };
        
        this.source.connect(this.workletNode);
        this.workletNode.connect(this.analyser);
      } catch (error) {
        console.warn('AudioWorklet failed, using ScriptProcessorNode:', error);
        this.setupScriptProcessor();
      }
    } else {
      this.setupScriptProcessor();
    }
    
    // Start analysis loop
    this.startAnalysisLoop();
  }
  
  private setupScriptProcessor(): void {
    if (!this.audioContext || !this.source || !this.analyser) return;
    
    // Fallback to ScriptProcessorNode
    this.processor = this.audioContext.createScriptProcessor(this.config.bufferSize, this.config.channelCount, this.config.channelCount);
    
    this.processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const rms = this.calculateRMS(inputData);
      const hasVoice = this.detectVoiceActivity(rms);
      
      this.handleAudioData({
        rms,
        hasVoice,
        samples: Array.from(inputData)
      });
    };
    
    this.source.connect(this.processor);
    this.processor.connect(this.analyser);
  }
  
  private setupMediaRecorder(): void {
    if (!this.stream) return;
    
    // Check codec support
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    
    let selectedMimeType = this.config.codec;
    if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
      selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
      console.warn(`Codec ${this.config.codec} not supported, using ${selectedMimeType}`);
    }
    
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: selectedMimeType,
      audioBitsPerSecond: this.config.sampleRate * this.config.bitDepth * this.config.channelCount
    });
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.handleRecordedChunk(event.data);
      }
    };
    
    this.mediaRecorder.onerror = (event) => {
      this.handleError(new Error(`MediaRecorder error: ${event}`));
    };
    
    this.mediaRecorder.onstop = () => {
      this.setState('stopped');
    };
  }
  
  private async handleRecordedChunk(blob: Blob): Promise<void> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const chunkData = new Uint8Array(arrayBuffer);
      
      // Get current audio metrics
      const currentRMS = this.volumeHistory.length > 0 ? 
        this.volumeHistory[this.volumeHistory.length - 1] : 0;
      const hasVoice = this.vadHistory.length > 0 ? 
        this.vadHistory[this.vadHistory.length - 1] : false;
      
      const chunk: AudioChunk = {
        id: `chunk_${this.chunkId++}`,
        timestamp: Date.now(),
        duration: this.config.chunkDuration,
        data: arrayBuffer,
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channelCount,
        rms: currentRMS,
        hasVoice,
        source: 'microphone' // This will be updated based on actual source
      };
      
      this.metrics.chunksProcessed++;
      this.metrics.totalDuration += chunk.duration;
      
      // Call chunk callback
      if (this.onChunkCallback) {
        this.onChunkCallback(chunk);
      }
      
    } catch (error) {
      this.metrics.droppedChunks++;
      this.handleError(new Error(`Failed to process audio chunk: ${error}`));
    }
  }
  
  private handleAudioData(data: { rms: number; hasVoice: boolean; samples?: number[] }): void {
    // Update volume history
    this.volumeHistory.push(data.rms);
    if (this.volumeHistory.length > 100) {
      this.volumeHistory.shift();
    }
    
    // Update VAD history
    this.vadHistory.push(data.hasVoice);
    if (this.vadHistory.length > 100) {
      this.vadHistory.shift();
    }
    
    // Update metrics
    this.metrics.volumeLevel = data.rms;
    this.metrics.peakLevel = Math.max(this.metrics.peakLevel, data.rms);
    this.metrics.averageLevel = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
    this.metrics.voiceActivityPercent = (this.vadHistory.filter(v => v).length / this.vadHistory.length) * 100;
  }
  
  private startAnalysisLoop(): void {
    const updateAnalysis = () => {
      if (!this.isCapturing || !this.analyser) return;
      
      // Get frequency and time domain data
      this.analyser.getByteFrequencyData(this.frequencyData!);
      this.analyser.getByteTimeDomainData(this.timeData!);
      
      // Update metrics callback
      if (this.onMetricsCallback) {
        this.onMetricsCallback({ ...this.metrics });
      }
      
      // Continue loop
      requestAnimationFrame(updateAnalysis);
    };
    
    updateAnalysis();
  }
  
  private calculateRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
  
  private detectVoiceActivity(rms: number): boolean {
    return rms > this.config.vadThreshold;
  }
  
  pauseCapture(): void {
    if (!this.isCapturing || this.isPaused) return;
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.setState('paused');
    }
  }
  
  resumeCapture(): void {
    if (!this.isCapturing || !this.isPaused) return;
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.setState('recording');
    }
  }
  
  stopCapture(): void {
    if (!this.isCapturing) return;
    
    try {
      // Stop MediaRecorder
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      
      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
      
      // Disconnect audio nodes
      if (this.source) {
        this.source.disconnect();
      }
      if (this.processor) {
        this.processor.disconnect();
      }
      if (this.workletNode) {
        this.workletNode.disconnect();
      }
      if (this.analyser) {
        this.analyser.disconnect();
      }
      
      // Reset state
      this.isCapturing = false;
      this.isPaused = false;
      this.stream = null;
      this.mediaRecorder = null;
      this.source = null;
      this.processor = null;
      this.workletNode = null;
      this.analyser = null;
      
      this.setState('stopped');
      console.log('Audio capture stopped');
      
    } catch (error) {
      this.handleError(new Error(`Failed to stop capture: ${error}`));
    }
  }
  
  getFrequencyData(): Uint8Array | null {
    return this.frequencyData;
  }
  
  getTimeData(): Uint8Array | null {
    return this.timeData;
  }
  
  getMetrics(): AudioMetrics {
    return { ...this.metrics };
  }
  
  getState(): { isCapturing: boolean; isPaused: boolean; isInitialized: boolean } {
    return {
      isCapturing: this.isCapturing,
      isPaused: this.isPaused,
      isInitialized: this.audioContext !== null
    };
  }
  
  // Configuration updates
  updateConfig(config: Partial<AudioCaptureConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AudioCaptureConfig {
    return { ...this.config };
  }
  
  // Audio device management
  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error);
      return [];
    }
  }
  
  async switchAudioDevice(deviceId: string): Promise<void> {
    if (this.isCapturing) {
      // Need to restart capture with new device
      const wasCapturing = true;
      this.stopCapture();
      
      // Update constraints to use specific device
      this.config = {
        ...this.config,
        // Store device ID for next capture
      };
      
      if (wasCapturing) {
        await this.startCapture();
      }
    }
  }
  
  private setState(state: 'starting' | 'recording' | 'paused' | 'stopped' | 'error'): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
  }
  
  private handleError(error: Error): void {
    console.error('AudioCapture error:', error);
    this.setState('error');
    
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }
  
  // Cleanup
  dispose(): void {
    this.stopCapture();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    
    this.audioContext = null;
    this.onChunkCallback = undefined;
    this.onMetricsCallback = undefined;
    this.onErrorCallback = undefined;
    this.onStateChangeCallback = undefined;
  }
}

// Audio Worklet Processor code (to be saved as a separate file)
export const AudioProcessorWorkletCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions?.bufferSize || 4096;
    this.vadThreshold = options.processorOptions?.vadThreshold || 0.01;
    this.sampleRate = options.processorOptions?.sampleRate || 44100;
    this.buffer = [];
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (input.length > 0) {
      const inputChannel = input[0];
      
      // Copy input to output (passthrough)
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].set(inputChannel);
      }
      
      // Calculate RMS for voice activity detection
      let sum = 0;
      for (let i = 0; i < inputChannel.length; i++) {
        sum += inputChannel[i] * inputChannel[i];
      }
      const rms = Math.sqrt(sum / inputChannel.length);
      const hasVoice = rms > this.vadThreshold;
      
      // Send analysis data to main thread
      this.port.postMessage({
        rms,
        hasVoice,
        samples: Array.from(inputChannel.slice(0, 128)) // Send first 128 samples for analysis
      });
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;

export default AudioCapture;