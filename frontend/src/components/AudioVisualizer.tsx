// Enhanced Audio Visualization Component
// Provides real-time waveform and frequency spectrum visualization for multiple sources
// Educational component demonstrating Web Audio API concepts

import { useEffect, useRef, useState } from 'react';
import { AudioSource } from '../utils/AudioPipeline';

interface AudioVisualizerProps {
  // Legacy props for backwards compatibility
  audioData?: Float32Array | null;
  frequencyData?: Uint8Array | null;
  isActive?: boolean;
  
  // New props for multi-source support
  sources?: AudioSource[];
  primarySourceId?: string | null;
  getVisualizationData?: (sourceId: string) => { frequency: Uint8Array; time: Uint8Array } | null;
  
  // Configuration
  width?: number;
  height?: number;
  showWaveform?: boolean;
  showSpectrum?: boolean;
  showMultiSource?: boolean;
  color?: string;
  visualizationType?: 'combined' | 'waveform' | 'spectrum' | 'vu_meters';
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
  // Legacy props
  audioData,
  frequencyData,
  isActive = false,
  
  // New props
  sources = [],
  primarySourceId,
  getVisualizationData,
  
  // Configuration
  width = 400,
  height = 200,
  showWaveform = true,
  showSpectrum = true,
  showMultiSource = false,
  color = '#3b82f6',
  visualizationType = 'combined'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [visualizerStats, setVisualizerStats] = useState({
    peakAmplitude: 0,
    averageAmplitude: 0,
    dominantFrequency: 0,
    spectralCentroid: 0
  });

  // Determine if using multi-source mode
  const isMultiSource = sources.length > 0 && showMultiSource;
  const activeSources = sources.filter(s => s.status === 'active');
  const effectiveIsActive = isMultiSource ? activeSources.length > 0 : isActive;
  
  // Set default selected source
  useEffect(() => {
    if (isMultiSource && !selectedSource && activeSources.length > 0) {
      setSelectedSource(primarySourceId || activeSources[0].id);
    }
  }, [isMultiSource, selectedSource, activeSources, primarySourceId]);

  // Animation loop for smooth visualization updates
  useEffect(() => {
    if (!effectiveIsActive) {
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
  }, [effectiveIsActive, audioData, frequencyData, showWaveform, showSpectrum, sources, selectedSource, visualizationType]);
  
  // Main drawing function
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas with background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    
    if (isMultiSource) {
      drawMultiSourceVisualization(ctx);
    } else {
      drawLegacyVisualization(ctx);
    }
    
    // Update statistics
    updateVisualizerStats();
  };

  // Draw visualization for multiple sources
  const drawMultiSourceVisualization = (ctx: CanvasRenderingContext2D) => {
    if (activeSources.length === 0) {
      drawNoSignal(ctx);
      return;
    }

    switch (visualizationType) {
      case 'combined':
        drawCombinedVisualization(ctx);
        break;
      case 'waveform':
        drawMultiSourceWaveform(ctx);
        break;
      case 'spectrum':
        drawMultiSourceSpectrum(ctx);
        break;
      case 'vu_meters':
        drawVUMeters(ctx);
        break;
    }
  };

  // Legacy visualization for backwards compatibility
  const drawLegacyVisualization = (ctx: CanvasRenderingContext2D) => {
    const halfHeight = height / 2;
    
    if (showWaveform && audioData) {
      drawWaveform(ctx, audioData, 0, 0, width, showSpectrum ? halfHeight : height);
    }
    
    if (showSpectrum && frequencyData) {
      const yOffset = showWaveform ? halfHeight : 0;
      const vizHeight = showWaveform ? halfHeight : height;
      drawSpectrum(ctx, frequencyData, 0, yOffset, width, vizHeight);
    }
  };

  const drawNoSignal = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#6b7280';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No Active Audio Sources', width / 2, height / 2);
  };

  const drawCombinedVisualization = (ctx: CanvasRenderingContext2D) => {
    const topHeight = height * 0.6;
    const bottomHeight = height * 0.4;

    // Get data for selected source
    const source = activeSources.find(s => s.id === selectedSource) || 
                   activeSources.find(s => s.id === primarySourceId) ||
                   activeSources[0];
    
    if (!source || !getVisualizationData) return;

    const data = getVisualizationData(source.id);
    if (!data) return;

    // Draw frequency spectrum in top area
    drawSpectrum(ctx, data.frequency, 0, 0, width, topHeight);

    // Draw separator
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, topHeight);
    ctx.lineTo(width, topHeight);
    ctx.stroke();

    // Convert Uint8Array to Float32Array for waveform
    const timeData = new Float32Array(data.time.length);
    for (let i = 0; i < data.time.length; i++) {
      timeData[i] = (data.time[i] - 128) / 128.0;
    }

    // Draw waveform in bottom area
    drawWaveform(ctx, timeData, 0, topHeight, width, bottomHeight);
  };

  const drawMultiSourceWaveform = (ctx: CanvasRenderingContext2D) => {
    const sourceHeight = height / Math.max(activeSources.length, 1);
    
    activeSources.forEach((source, index) => {
      if (!getVisualizationData) return;
      
      const data = getVisualizationData(source.id);
      if (!data) return;

      const yOffset = index * sourceHeight;
      
      // Convert Uint8Array to Float32Array
      const timeData = new Float32Array(data.time.length);
      for (let i = 0; i < data.time.length; i++) {
        timeData[i] = (data.time[i] - 128) / 128.0;
      }

      drawWaveform(ctx, timeData, 0, yOffset, width, sourceHeight, getSourceColor(index), source.name);
    });
  };

  const drawMultiSourceSpectrum = (ctx: CanvasRenderingContext2D) => {
    const source = activeSources.find(s => s.id === selectedSource) || 
                   activeSources.find(s => s.id === primarySourceId) ||
                   activeSources[0];
    
    if (!source || !getVisualizationData) return;

    const data = getVisualizationData(source.id);
    if (!data) return;

    drawSpectrum(ctx, data.frequency, 0, 0, width, height);
  };

  const drawVUMeters = (ctx: CanvasRenderingContext2D) => {
    const meterWidth = 60;
    const meterHeight = height - 60;
    const meterSpacing = (width - (activeSources.length * meterWidth)) / (activeSources.length + 1);

    activeSources.forEach((source, index) => {
      const x = meterSpacing + index * (meterWidth + meterSpacing);
      const y = 30;

      // Background
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x, y, meterWidth, meterHeight);

      // Border
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, meterWidth, meterHeight);

      // VU level
      const level = Math.min(source.metrics.volumeLevel * 100, 100);
      const fillHeight = (level / 100) * meterHeight;

      // Color based on level
      let fillColor = '#10b981'; // Green
      if (level > 70) fillColor = '#f59e0b'; // Amber
      if (level > 90) fillColor = '#ef4444'; // Red

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y + meterHeight - fillHeight, meterWidth, fillHeight);

      // Peak indicator
      const peak = Math.min(source.metrics.peakLevel * 100, 100);
      const peakY = y + meterHeight - (peak / 100) * meterHeight;
      
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(x, peakY - 2, meterWidth, 4);

      // Labels
      ctx.fillStyle = '#374151';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(source.name.substring(0, 8), x + meterWidth / 2, y + meterHeight + 15);
      ctx.fillText(`${level.toFixed(0)}%`, x + meterWidth / 2, y - 5);
    });
  };

  const getSourceColor = (index: number): string => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    return colors[index % colors.length];
  };
  
  // Draw waveform visualization (time domain)
  const drawWaveform = (
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    x: number,
    y: number,
    w: number,
    h: number,
    waveColor?: string,
    sourceName?: string
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
      const baseColor = waveColor || color;
      const opacity = 0.3 + Math.abs(amplitude) * 0.7;
      
      if (amplitude >= 0) {
        // Positive amplitude
        ctx.fillStyle = baseColor + Math.floor(opacity * 255).toString(16).padStart(2, '0');
        ctx.fillRect(barX, centerY - barHeight, barWidth - 1, barHeight);
      } else {
        // Negative amplitude - slightly darker
        ctx.fillStyle = baseColor + Math.floor(opacity * 128).toString(16).padStart(2, '0');
        ctx.fillRect(barX, centerY, barWidth - 1, barHeight);
      }
    }
    
    // Draw amplitude scale labels
    drawAmplitudeScale(ctx, x, y, w, h);
    
    // Add title
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    const title = sourceName ? `${sourceName} - Waveform` : 'Waveform (Time Domain)';
    ctx.fillText(title, x + 5, y + 15);
  };
  
  // Draw frequency spectrum visualization
  const drawSpectrum = (
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
  };
  
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
    const nyquistFreq = 8000; // Hz
    const freqLabels = ['0', '2k', '4k', '6k', '8k'];
    
    freqLabels.forEach((label, index) => {
      const xPos = x + (index * w) / (freqLabels.length - 1);
      ctx.fillText(label, xPos, y + h - 2);
    });
    
    ctx.textAlign = 'left';
  };
  
  // Calculate visualization statistics
  const updateVisualizerStats = () => {
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
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Audio Visualization</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${effectiveIsActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-gray-600">
            {isMultiSource 
              ? `${activeSources.length} Active Sources` 
              : effectiveIsActive ? 'Recording' : 'Inactive'
            }
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
        {isMultiSource ? (
          <>
            {/* Multi-source controls */}
            <div className="flex items-center space-x-2">
              <label>Visualization Type:</label>
              <select
                value={visualizationType}
                onChange={(e) => {
                  // In a real implementation, you'd lift this state up
                  console.log('Change visualization type:', e.target.value);
                }}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="combined">Combined</option>
                <option value="waveform">Waveform</option>
                <option value="spectrum">Spectrum</option>
                <option value="vu_meters">VU Meters</option>
              </select>
            </div>
            
            {/* Source selector */}
            {activeSources.length > 1 && (
              <div className="flex items-center space-x-2">
                <label>Focus Source:</label>
                <select
                  value={selectedSource || ''}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  {activeSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} {source.isPrimary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Legacy controls */}
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showWaveform}
                onChange={(e) => {
                  console.log('Toggle waveform:', e.target.checked);
                }}
                className="rounded border-gray-300"
              />
              <span>Waveform</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showSpectrum}
                onChange={(e) => {
                  console.log('Toggle spectrum:', e.target.checked);
                }}
                className="rounded border-gray-300"
              />
              <span>Spectrum</span>
            </label>
          </>
        )}
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