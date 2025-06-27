/**
 * Audio Processor Worklet for real-time audio analysis
 * Handles Voice Activity Detection and audio metrics calculation
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions?.bufferSize || 4096;
    this.vadThreshold = options.processorOptions?.vadThreshold || 0.01;
    this.sampleRate = options.processorOptions?.sampleRate || 44100;
    this.frameCount = 0;
    this.volumeSmoothing = 0.9;
    this.smoothedVolume = 0;
    
    // Voice Activity Detection parameters
    this.vadWindowSize = 1024; // 23ms at 44.1kHz
    this.vadHangover = 8; // frames to keep VAD active after voice ends
    this.hangoverCount = 0;
    this.energyThreshold = this.vadThreshold * this.vadThreshold;
    
    // Audio features for analysis
    this.spectralCentroid = 0;
    this.spectralRolloff = 0;
    this.zeroCrossingRate = 0;
    
    console.log('AudioProcessor worklet initialized with options:', options.processorOptions);
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (input.length === 0) {
      return true;
    }
    
    const inputChannel = input[0];
    const frameLength = inputChannel.length;
    
    // Passthrough audio (copy input to output)
    if (output.length > 0) {
      for (let channel = 0; channel < output.length; channel++) {
        if (output[channel]) {
          output[channel].set(inputChannel);
        }
      }
    }
    
    // Calculate audio features
    const audioFeatures = this.calculateAudioFeatures(inputChannel);
    
    // Voice Activity Detection
    const vadResult = this.detectVoiceActivity(audioFeatures);
    
    // Send analysis data to main thread every few frames to avoid overwhelming
    if (this.frameCount % 4 === 0) { // Send every 4th frame (~5ms intervals at 128 samples/frame)
      this.port.postMessage({
        type: 'audioAnalysis',
        data: {
          rms: audioFeatures.rms,
          peak: audioFeatures.peak,
          energy: audioFeatures.energy,
          hasVoice: vadResult.hasVoice,
          vadConfidence: vadResult.confidence,
          spectralCentroid: audioFeatures.spectralCentroid,
          spectralRolloff: audioFeatures.spectralRolloff,
          zeroCrossingRate: audioFeatures.zeroCrossingRate,
          timestamp: currentTime,
          frameLength: frameLength,
          sampleRate: this.sampleRate
        }
      });
    }
    
    this.frameCount++;
    return true;
  }
  
  calculateAudioFeatures(samples) {
    const length = samples.length;
    let sum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    
    // Calculate RMS, peak, and zero crossing rate
    for (let i = 0; i < length; i++) {
      const sample = samples[i];
      const absSample = Math.abs(sample);
      
      sum += sample * sample;
      peak = Math.max(peak, absSample);
      
      // Zero crossing detection
      if (i > 0) {
        if ((samples[i-1] >= 0) !== (sample >= 0)) {
          zeroCrossings++;
        }
      }
    }
    
    const rms = Math.sqrt(sum / length);
    const energy = sum / length;
    const zeroCrossingRate = zeroCrossings / length;
    
    // Simple spectral analysis (approximation)
    const spectralCentroid = this.calculateSpectralCentroid(samples);
    const spectralRolloff = this.calculateSpectralRolloff(samples);
    
    // Smooth volume for better visualization
    this.smoothedVolume = this.volumeSmoothing * this.smoothedVolume + (1 - this.volumeSmoothing) * rms;
    
    return {
      rms: this.smoothedVolume,
      peak,
      energy,
      spectralCentroid,
      spectralRolloff,
      zeroCrossingRate
    };
  }
  
  detectVoiceActivity(features) {
    const { energy, spectralCentroid, zeroCrossingRate } = features;
    
    // Multi-feature VAD approach
    let confidence = 0;
    
    // Energy-based detection
    if (energy > this.energyThreshold) {
      confidence += 0.4;
    }
    
    // Spectral centroid indicates presence of higher frequencies (voice characteristics)
    if (spectralCentroid > 1000 && spectralCentroid < 4000) {
      confidence += 0.3;
    }
    
    // Zero crossing rate indicates voicing characteristics
    if (zeroCrossingRate > 0.02 && zeroCrossingRate < 0.3) {
      confidence += 0.3;
    }
    
    const hasVoiceNow = confidence > 0.5;
    
    // Apply hangover to smooth VAD decisions
    if (hasVoiceNow) {
      this.hangoverCount = this.vadHangover;
    } else if (this.hangoverCount > 0) {
      this.hangoverCount--;
    }
    
    const hasVoice = hasVoiceNow || this.hangoverCount > 0;
    
    return {
      hasVoice,
      confidence: Math.min(confidence, 1.0)
    };
  }
  
  calculateSpectralCentroid(samples) {
    // Simplified spectral centroid calculation
    // In practice, you'd want to use FFT for more accurate results
    const length = samples.length;
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < length; i++) {
      const magnitude = Math.abs(samples[i]);
      weightedSum += i * magnitude;
      magnitudeSum += magnitude;
    }
    
    if (magnitudeSum === 0) return 0;
    
    // Convert to frequency (approximate)
    const centroidBin = weightedSum / magnitudeSum;
    return (centroidBin / length) * (this.sampleRate / 2);
  }
  
  calculateSpectralRolloff(samples) {
    // Simplified spectral rolloff calculation
    const length = samples.length;
    let totalEnergy = 0;
    const magnitudes = [];
    
    for (let i = 0; i < length; i++) {
      const magnitude = Math.abs(samples[i]);
      magnitudes.push(magnitude);
      totalEnergy += magnitude;
    }
    
    const rolloffThreshold = 0.85 * totalEnergy;
    let cumulativeEnergy = 0;
    
    for (let i = 0; i < length; i++) {
      cumulativeEnergy += magnitudes[i];
      if (cumulativeEnergy >= rolloffThreshold) {
        // Convert to frequency (approximate)
        return (i / length) * (this.sampleRate / 2);
      }
    }
    
    return (this.sampleRate / 2);
  }
  
  // Handle messages from main thread
  static get parameterDescriptors() {
    return [];
  }
}

registerProcessor('audio-processor', AudioProcessor);