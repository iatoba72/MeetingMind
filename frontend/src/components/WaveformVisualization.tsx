// Advanced Waveform Visualization Component
// Real-time and static waveform rendering with interactive features

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';

interface WaveformProps {
  // Audio source
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  audioContext?: AudioContext;
  liveAudioStream?: MediaStream;
  
  // Visualization settings
  width?: number;
  height?: number;
  barWidth?: number;
  barGap?: number;
  barColor?: string;
  progressColor?: string;
  backgroundColor?: string;
  
  // Playback integration
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  
  // Interactive features
  onSeek?: (time: number) => void;
  onRegionSelect?: (start: number, end: number) => void;
  
  // Display options
  showGrid?: boolean;
  showTimeLabels?: boolean;
  showAmplitudeLabels?: boolean;
  normalize?: boolean;
  smoothing?: boolean;
  
  // Regions and markers
  regions?: WaveformRegion[];
  markers?: WaveformMarker[];
  
  className?: string;
}

interface WaveformRegion {
  id: string;
  start: number;
  end: number;
  color: string;
  label?: string;
  opacity?: number;
}

interface WaveformMarker {
  id: string;
  time: number;
  color: string;
  label?: string;
  type?: 'bookmark' | 'annotation' | 'segment';
}

interface WaveformData {
  peaks: Float32Array;
  duration: number;
  sampleRate: number;
  channels: number;
}

/**
 * Waveform Visualization Strategy:
 * 
 * 1. Audio Processing:
 *    - Web Audio API for real-time analysis
 *    - Efficient peak detection algorithms
 *    - Multi-channel support with channel mixing
 *    - Adaptive sampling for different zoom levels
 * 
 * 2. Rendering Optimization:
 *    - Canvas-based rendering for performance
 *    - Virtual scrolling for long audio files
 *    - Level-of-detail rendering based on zoom
 *    - Efficient redraw only when necessary
 * 
 * 3. Interaction Features:
 *    - Click-to-seek functionality
 *    - Drag selection for regions
 *    - Zoom and pan controls
 *    - Real-time cursor tracking
 * 
 * 4. Advanced Features:
 *    - Spectrogram overlay option
 *    - Multiple visualization modes
 *    - Export capabilities
 *    - Integration with playback controls
 */

export const WaveformVisualization: React.FC<WaveformProps> = React.memo(({
  audioUrl,
  audioBuffer,
  audioContext,
  liveAudioStream,
  width = 800,
  height = 200,
  barWidth = 2,
  barGap = 1,
  barColor = '#3B82F6',
  progressColor = '#1D4ED8',
  backgroundColor = '#F3F4F6',
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  onSeek,
  onRegionSelect,
  showGrid = false,
  showTimeLabels = true,
  showAmplitudeLabels = false,
  normalize = true,
  smoothing = true,
  regions = [],
  markers = [],
  className = ''
}) => {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio processing refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  // State
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  
  // Real-time audio data for live streams
  const [liveData, setLiveData] = useState<Float32Array | null>(null);
  
  // Calculate samples per pixel based on zoom
  const samplesPerPixel = useMemo(() => {
    if (!waveformData) return 1;
    const totalSamples = waveformData.peaks.length;
    const availableWidth = width - 40; // Account for padding
    return Math.max(1, Math.floor(totalSamples / (availableWidth * zoom)));
  }, [waveformData, width, zoom]);
  
  // Process audio file to extract waveform data
  const processAudioFile = useCallback(async (url: string) => {
    if (!audioContext) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Extract peaks from audio buffer
      const peaks = extractPeaks(decodedBuffer, width * 2); // Higher resolution for zooming
      
      setWaveformData({
        peaks,
        duration: decodedBuffer.duration,
        sampleRate: decodedBuffer.sampleRate,
        channels: decodedBuffer.numberOfChannels,
      });
      
    } catch (error) {
      console.error('Failed to process audio file:', error);
    } finally {
      setIsLoading(false);
    }
  }, [audioContext, width, extractPeaks]);
  
  // Extract peaks from AudioBuffer
  const extractPeaks = useCallback((buffer: AudioBuffer, resolution: number): Float32Array => {
    const channelData = buffer.getChannelData(0); // Use first channel
    const peaks = new Float32Array(resolution);
    const samplesPerPeak = Math.floor(channelData.length / resolution);
    
    for (let i = 0; i < resolution; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);
      
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      
      peaks[i] = max;
    }
    
    return peaks;
  }, []);
  
  // Setup live audio analysis
  const setupLiveAnalysis = useCallback(async (stream: MediaStream) => {
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = smoothing ? 0.8 : 0;
      analyserRef.current = analyser;
      
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      
      // Start real-time analysis
      const updateLiveData = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Float32Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getFloatTimeDomainData(dataArray);
        
        setLiveData(dataArray);
        
        if (isPlaying) {
          animationFrameRef.current = requestAnimationFrame(updateLiveData);
        }
      };
      
      updateLiveData();
      
    } catch (error) {
      console.error('Failed to setup live analysis:', error);
    }
  }, [smoothing, isPlaying]);
  
  // Initialize audio processing
  useEffect(() => {
    if (audioUrl && audioContext) {
      processAudioFile(audioUrl);
    } else if (audioBuffer) {
      const peaks = extractPeaks(audioBuffer, width * 2);
      setWaveformData({
        peaks,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      });
    } else if (liveAudioStream) {
      setupLiveAnalysis(liveAudioStream);
    }
  }, [audioUrl, audioBuffer, liveAudioStream, audioContext, processAudioFile, extractPeaks, width, setupLiveAnalysis]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Draw waveform
  const drawWaveform = useCallback((canvas: HTMLCanvasElement, data: Float32Array, showProgress: boolean = true) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid if enabled
    if (showGrid) {
      drawGrid(ctx);
    }
    
    // Calculate bar dimensions
    const totalBars = Math.floor(width / (barWidth + barGap));
    const progressPosition = showProgress && duration > 0 ? (currentTime / duration) * width : 0;
    
    // Draw waveform bars
    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + barGap);
      const dataIndex = Math.floor((i + offset) * samplesPerPixel) % data.length;
      
      let amplitude = data[dataIndex] || 0;
      if (normalize) {
        amplitude = Math.min(amplitude * 2, 1); // Boost and normalize
      }
      
      const barHeight = amplitude * (height - 20); // Leave space for labels
      const y = (height - barHeight) / 2;
      
      // Choose color based on progress
      ctx.fillStyle = showProgress && x <= progressPosition ? progressColor : barColor;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    
    // Draw progress line
    if (showProgress && duration > 0) {
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressPosition, 0);
      ctx.lineTo(progressPosition, height);
      ctx.stroke();
    }
    
    // Draw time labels
    if (showTimeLabels) {
      drawTimeLabels(ctx);
    }
    
    // Draw amplitude labels
    if (showAmplitudeLabels) {
      drawAmplitudeLabels(ctx);
    }
  }, [
    width, height, barWidth, barGap, barColor, progressColor, backgroundColor,
    currentTime, duration, showGrid, showTimeLabels, showAmplitudeLabels,
    normalize, samplesPerPixel, offset, drawAmplitudeLabels, drawGrid, drawTimeLabels
  ]);
  
  // Draw overlay elements (regions, markers, selections)
  const drawOverlay = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear overlay
    ctx.clearRect(0, 0, width, height);
    
    // Draw regions
    regions.forEach(region => {
      if (!waveformData) return;
      
      const startX = (region.start / waveformData.duration) * width;
      const endX = (region.end / waveformData.duration) * width;
      const regionWidth = endX - startX;
      
      ctx.fillStyle = `${region.color}${Math.round((region.opacity || 0.3) * 255).toString(16)}`;
      ctx.fillRect(startX, 0, regionWidth, height);
      
      // Draw region label
      if (region.label) {
        ctx.fillStyle = region.color;
        ctx.font = '12px sans-serif';
        ctx.fillText(region.label, startX + 4, 16);
      }
    });
    
    // Draw markers
    markers.forEach(marker => {
      if (!waveformData) return;
      
      const x = (marker.time / waveformData.duration) * width;
      
      ctx.strokeStyle = marker.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      // Draw marker label
      if (marker.label) {
        ctx.fillStyle = marker.color;
        ctx.font = '10px sans-serif';
        ctx.fillText(marker.label, x + 2, 12);
      }
    });
    
    // Draw selection
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const startX = Math.min(dragStart, dragEnd);
      const endX = Math.max(dragStart, dragEnd);
      
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(startX, 0, endX - startX, height);
      
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, 0, endX - startX, height);
    }
  }, [width, height, regions, markers, waveformData, isDragging, dragStart, dragEnd]);
  
  // Draw grid
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    
    // Vertical lines (time)
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines (amplitude)
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [width, height]);
  
  // Draw time labels
  const drawTimeLabels = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#6B7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    
    const labelCount = Math.min(10, Math.floor(width / 80));
    for (let i = 0; i <= labelCount; i++) {
      const time = (i / labelCount) * duration;
      const x = (i / labelCount) * width;
      const label = formatTime(time);
      
      ctx.fillText(label, x, height - 4);
    }
  }, [width, height, duration, formatTime]);
  
  // Draw amplitude labels
  const drawAmplitudeLabels = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 4; i++) {
      const amplitude = (4 - i) / 4;
      const y = (i / 4) * height + 4;
      const label = amplitude.toFixed(1);
      
      ctx.fillText(label, width - 4, y);
    }
  }, [width, height]);
  
  // Format time for display
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);
  
  // Handle canvas interactions
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !waveformData) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / width) * waveformData.duration;
    
    onSeek(Math.max(0, Math.min(time, waveformData.duration)));
  }, [onSeek, waveformData, width]);
  
  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onRegionSelect) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    setIsDragging(true);
    setDragStart(x);
    setDragEnd(x);
  }, [onRegionSelect]);
  
  // Handle drag move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !onRegionSelect) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    setDragEnd(x);
  }, [isDragging, onRegionSelect]);
  
  // Handle drag end
  const handleMouseUp = useCallback(() => {
    if (!isDragging || !onRegionSelect || !waveformData || dragStart === null || dragEnd === null) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    
    const startTime = (Math.min(dragStart, dragEnd) / width) * waveformData.duration;
    const endTime = (Math.max(dragStart, dragEnd) / width) * waveformData.duration;
    
    if (Math.abs(endTime - startTime) > 0.1) { // Minimum selection duration
      onRegionSelect(startTime, endTime);
    }
    
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, onRegionSelect, waveformData, dragStart, dragEnd, width]);
  
  // Redraw when data or display options change
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    
    if (!canvas || !overlayCanvas) return;
    
    if (liveData) {
      // Draw live audio data
      drawWaveform(canvas, liveData, false);
    } else if (waveformData) {
      // Draw static waveform
      drawWaveform(canvas, waveformData.peaks, true);
    }
    
    // Draw overlay elements
    drawOverlay(overlayCanvas);
  }, [waveformData, liveData, drawWaveform, drawOverlay]);
  
  // Handle scroll/zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(0.1, Math.min(prev * zoomFactor, 10)));
    } else {
      // Scroll
      const scrollAmount = e.deltaY * 0.01;
      setOffset(prev => Math.max(0, prev + scrollAmount));
    }
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
      
      {/* Main waveform canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 cursor-pointer"
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
      
      {/* Overlay canvas for interactive elements */}
      <canvas
        ref={overlayCanvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 pointer-events-none"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
      
      {/* Controls */}
      <div className="absolute top-2 right-2 flex items-center space-x-2 bg-white bg-opacity-90 rounded px-2 py-1">
        {/* Zoom controls */}
        <button
          onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
          className="text-sm px-2 py-1 border rounded hover:bg-gray-50"
          title="Zoom out"
        >
          -
        </button>
        <span className="text-xs text-gray-600">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(prev => Math.min(10, prev * 1.25))}
          className="text-sm px-2 py-1 border rounded hover:bg-gray-50"
          title="Zoom in"
        >
          +
        </button>
        
        {/* Reset zoom */}
        <button
          onClick={() => {
            setZoom(1);
            setOffset(0);
          }}
          className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          title="Reset zoom"
        >
          Reset
        </button>
      </div>
      
      {/* Instructions */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 bg-white bg-opacity-90 rounded px-2 py-1">
        Click to seek • Drag to select • Ctrl+Scroll to zoom
      </div>
    </div>
  );
});