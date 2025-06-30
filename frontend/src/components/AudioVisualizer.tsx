// Audio Visualization Component
// Provides real-time waveform and frequency spectrum visualization
// Educational component demonstrating Web Audio API concepts

import { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  audioData: Float32Array | null;
  frequencyData: Uint8Array | null;
  isActive: boolean;
  width?: number;
  height?: number;
  showWaveform?: boolean;
  showSpectrum?: boolean;
  color?: string;
}

/**
 * AudioVisualizer Component
 * 
 * This component demonstrates real-time audio visualization techniques:
 * 
 * Waveform Visualization:
 * - Time domain representation of audio signal
 * - Shows amplitude changes over time
 * - Useful for monitoring audio levels and quality
 * - Green bars represent positive amplitudes, red for negative
 * 
 * Frequency Spectrum:
 * - Frequency domain representation via FFT analysis
 * - Shows energy distribution across frequency bands
 * - Helps identify dominant frequencies and audio characteristics
 * - Useful for audio quality assessment and filtering
 * 
 * Canvas Rendering:
 * - Uses HTML5 Canvas for efficient real-time graphics
 * - 60fps updates synchronized with requestAnimationFrame
 * - Smooth animations and responsive design
 * 
 * Web Audio API Integration:
 * - Processes data from AnalyserNode
 * - Demonstrates time and frequency domain analysis
 * - Shows practical application of audio processing concepts
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioData,
  frequencyData,
  isActive,
  width = 400,
  height = 200,
  showWaveform = true,
  showSpectrum = true,
  // color: _color = '#3b82f6'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [visualizerStats, setVisualizerStats] = useState({
    peakAmplitude: 0,
    averageAmplitude: 0,
    dominantFrequency: 0,
    spectralCentroid: 0
  });
  
  // Animation loop for smooth visualization updates
  useEffect(() => {
    if (!isActive) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }
    
    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, audioData, frequencyData, showWaveform, showSpectrum, draw]);
  
  
  // Draw waveform visualization (time domain)
  const drawWaveform = useCallback((
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    // Draw background grid for better readability
    drawGrid(ctx, x, y, w, h, '#e2e8f0');
    
    // Draw center line (zero amplitude)
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Calculate bar width based on data length
    const barWidth = w / data.length;
    const centerY = y + h / 2;
    
    // Draw waveform as vertical bars
    for (let i = 0; i < data.length; i++) {
      const amplitude = data[i];
      const barHeight = Math.abs(amplitude) * (h / 2) * 0.8; // Scale to 80% of available height
      const barX = x + i * barWidth;
      
      // Color based on amplitude polarity
      if (amplitude >= 0) {
        // Positive amplitude - green gradient
        ctx.fillStyle = `rgba(34, 197, 94, ${0.3 + Math.abs(amplitude) * 0.7})`;
        ctx.fillRect(barX, centerY - barHeight, barWidth - 1, barHeight);
      } else {
        // Negative amplitude - red gradient
        ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + Math.abs(amplitude) * 0.7})`;
        ctx.fillRect(barX, centerY, barWidth - 1, barHeight);
      }
    }
    
    // Draw amplitude scale labels
    drawAmplitudeScale(ctx, x, y, w, h);
    
    // Add title
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    ctx.fillText('Waveform (Time Domain)', x + 5, y + 15);
  }, []);
  
  // Draw frequency spectrum visualization
  const drawSpectrum = useCallback((
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    // Draw background grid
    drawGrid(ctx, x, y, w, h, '#e2e8f0');
    
    const barWidth = w / data.length;
    const maxBarHeight = h * 0.9; // Leave space for labels
    
    // Find peak for normalization
    const peak = Math.max(...data);
    const scale = peak > 0 ? maxBarHeight / peak : 1;
    
    // Draw frequency bars
    for (let i = 0; i < data.length; i++) {
      const amplitude = data[i];
      const barHeight = amplitude * scale;
      const barX = x + i * barWidth;
      const barY = y + h - barHeight - 10; // Leave space for frequency labels
      
      // Color gradient based on frequency (blue to red spectrum)
      const hue = (i / data.length) * 240; // Blue (240°) to Red (0°)
      const saturation = 70;
      const lightness = 50 + (amplitude / 255) * 30; // Brightness based on amplitude
      
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fillRect(barX, barY, barWidth - 1, barHeight);
    }
    
    // Draw frequency scale labels
    drawFrequencyScale(ctx, x, y, w, h);
    
    // Add title
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    ctx.fillText('Frequency Spectrum (Frequency Domain)', x + 5, y + 15);
  }, []);
  
  // Draw grid lines for better readability
  const drawGrid = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    
    // Vertical grid lines
    const verticalLines = 8;
    for (let i = 1; i < verticalLines; i++) {
      const lineX = x + (i * w) / verticalLines;
      ctx.beginPath();
      ctx.moveTo(lineX, y);
      ctx.lineTo(lineX, y + h);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    const horizontalLines = 4;
    for (let i = 1; i < horizontalLines; i++) {
      const lineY = y + (i * h) / horizontalLines;
      ctx.beginPath();
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + w, lineY);
      ctx.stroke();
    }
    
    ctx.setLineDash([]);
  };
  
  // Draw amplitude scale for waveform
  const drawAmplitudeScale = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    
    // Draw scale markers
    const scaleValues = [1.0, 0.5, 0.0, -0.5, -1.0];
    scaleValues.forEach((value, index) => {
      const yPos = y + (index * h) / (scaleValues.length - 1);
      ctx.fillText(value.toFixed(1), x + w - 5, yPos + 3);
    });
    
    ctx.textAlign = 'left';
  };
  
  // Draw frequency scale for spectrum
  const drawFrequencyScale = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    
    // Assuming 16kHz sample rate, Nyquist frequency is 8kHz
    // const _nyquistFreq = 8000; // Hz
    const freqLabels = ['0', '2k', '4k', '6k', '8k'];
    
    freqLabels.forEach((label, index) => {
      const xPos = x + (index * w) / (freqLabels.length - 1);
      ctx.fillText(label, xPos, y + h - 2);
    });
    
    ctx.textAlign = 'left';
  };
  
  // Calculate visualization statistics
  const updateVisualizerStats = useCallback(() => {
    if (!audioData && !frequencyData) return;
    
    let peakAmplitude = 0;
    let averageAmplitude = 0;
    let dominantFrequency = 0;
    let spectralCentroid = 0;
    
    // Analyze waveform data
    if (audioData) {
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        const abs = Math.abs(audioData[i]);
        sum += abs;
        peakAmplitude = Math.max(peakAmplitude, abs);
      }
      averageAmplitude = sum / audioData.length;
    }
    
    // Analyze frequency data
    if (frequencyData) {
      let maxAmplitude = 0;
      let maxIndex = 0;
      let weightedSum = 0;
      let totalAmplitude = 0;
      
      for (let i = 0; i < frequencyData.length; i++) {
        const amplitude = frequencyData[i];
        
        // Find dominant frequency
        if (amplitude > maxAmplitude) {
          maxAmplitude = amplitude;
          maxIndex = i;
        }
        
        // Calculate spectral centroid
        weightedSum += i * amplitude;
        totalAmplitude += amplitude;
      }
      
      // Convert bin index to frequency (assuming 16kHz sample rate)
      dominantFrequency = (maxIndex * 8000) / frequencyData.length;
      spectralCentroid = totalAmplitude > 0 ? (weightedSum * 8000) / (frequencyData.length * totalAmplitude) : 0;
    }
    
    setVisualizerStats({
      peakAmplitude: Math.round(peakAmplitude * 1000) / 1000,
      averageAmplitude: Math.round(averageAmplitude * 1000) / 1000,
      dominantFrequency: Math.round(dominantFrequency),
      spectralCentroid: Math.round(spectralCentroid)
    });
  }, [audioData, frequencyData]);

  // Main drawing function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas with background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate layout for dual visualization
    const halfHeight = height / 2;
    
    if (showWaveform && audioData) {
      drawWaveform(ctx, audioData, 0, 0, width, showSpectrum ? halfHeight : height);
    }
    
    if (showSpectrum && frequencyData) {
      const yOffset = showWaveform ? halfHeight : 0;
      const vizHeight = showWaveform ? halfHeight : height;
      drawSpectrum(ctx, frequencyData, 0, yOffset, width, vizHeight);
    }
    
    // Update statistics
    updateVisualizerStats();
  }, [audioData, frequencyData, showWaveform, showSpectrum, width, height, drawWaveform, drawSpectrum, updateVisualizerStats]);
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Audio Visualization</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-gray-600">
            {isActive ? 'Recording' : 'Inactive'}
          </span>
        </div>
      </div>
      
      {/* Canvas for visualization */}
      <div className="mb-4 border border-gray-200 rounded">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-auto"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
      
      {/* Visualization Controls */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showWaveform}
            onChange={() => {
              // In a real implementation, you'd lift this state up
            }}
            className="rounded border-gray-300"
          />
          <span>Waveform</span>
        </label>
        
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showSpectrum}
            onChange={() => {
              // In a real implementation, you'd lift this state up
            }}
            className="rounded border-gray-300"
          />
          <span>Spectrum</span>
        </label>
      </div>
      
      {/* Visualization Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="text-center p-2 bg-blue-50 rounded">
          <div className="font-semibold text-blue-900">
            {visualizerStats.peakAmplitude.toFixed(3)}
          </div>
          <div className="text-blue-700 text-xs">Peak Amplitude</div>
        </div>
        
        <div className="text-center p-2 bg-green-50 rounded">
          <div className="font-semibold text-green-900">
            {visualizerStats.averageAmplitude.toFixed(3)}
          </div>
          <div className="text-green-700 text-xs">Avg Amplitude</div>
        </div>
        
        <div className="text-center p-2 bg-purple-50 rounded">
          <div className="font-semibold text-purple-900">
            {visualizerStats.dominantFrequency} Hz
          </div>
          <div className="text-purple-700 text-xs">Dominant Freq</div>
        </div>
        
        <div className="text-center p-2 bg-orange-50 rounded">
          <div className="font-semibold text-orange-900">
            {visualizerStats.spectralCentroid} Hz
          </div>
          <div className="text-orange-700 text-xs">Spectral Centroid</div>
        </div>
      </div>
      
      {/* Educational Information */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <div className="font-semibold text-blue-900 mb-2">📊 Visualization Concepts:</div>
        <ul className="text-blue-800 space-y-1">
          <li>• <strong>Waveform:</strong> Shows audio amplitude over time (time domain)</li>
          <li>• <strong>Spectrum:</strong> Shows frequency distribution (frequency domain via FFT)</li>
          <li>• <strong>Peak Amplitude:</strong> Maximum signal level (indicates volume)</li>
          <li>• <strong>Spectral Centroid:</strong> "Center of mass" of frequency spectrum</li>
        </ul>
      </div>
    </div>
  );
};