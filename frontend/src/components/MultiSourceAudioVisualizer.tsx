/**
 * Multi-Source Audio Visualizer Component
 * Specialized component for visualizing multiple audio sources simultaneously
 */

import React, { useRef, useEffect, useState } from 'react';
import { AudioSource } from '../utils/AudioPipeline';

interface MultiSourceAudioVisualizerProps {
  sources: AudioSource[];
  primarySourceId?: string | null;
  getVisualizationData?: (sourceId: string) => { frequency: Uint8Array; time: Uint8Array } | null;
  width?: number;
  height?: number;
  className?: string;
}

export const MultiSourceAudioVisualizer: React.FC<MultiSourceAudioVisualizerProps> = ({
  sources,
  primarySourceId,
  getVisualizationData,
  width = 800,
  height = 600,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'stacked' | 'overlay'>('grid');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  const activeSources = sources.filter(s => s.status === 'active');

  useEffect(() => {
    // Initialize selected sources with all active sources
    if (activeSources.length > 0 && selectedSources.size === 0) {
      setSelectedSources(new Set(activeSources.map(s => s.id)));
    }
  }, [activeSources, selectedSources]);

  useEffect(() => {
    if (activeSources.length === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const animate = () => {
      draw();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeSources, viewMode, selectedSources]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    const visibleSources = activeSources.filter(s => selectedSources.has(s.id));

    if (visibleSources.length === 0) {
      drawNoSources(ctx);
      return;
    }

    switch (viewMode) {
      case 'grid':
        drawGridView(ctx, visibleSources);
        break;
      case 'stacked':
        drawStackedView(ctx, visibleSources);
        break;
      case 'overlay':
        drawOverlayView(ctx, visibleSources);
        break;
    }
  };

  const drawNoSources = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No Sources Selected', width / 2, height / 2);
  };

  const drawGridView = (ctx: CanvasRenderingContext2D, visibleSources: AudioSource[]) => {
    const cols = Math.ceil(Math.sqrt(visibleSources.length));
    const rows = Math.ceil(visibleSources.length / cols);
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    visibleSources.forEach((source, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * cellWidth;
      const y = row * cellHeight;

      drawSourceVisualization(ctx, source, x, y, cellWidth, cellHeight, index);
    });
  };

  const drawStackedView = (ctx: CanvasRenderingContext2D, visibleSources: AudioSource[]) => {
    const sourceHeight = height / visibleSources.length;

    visibleSources.forEach((source, index) => {
      const y = index * sourceHeight;
      drawSourceVisualization(ctx, source, 0, y, width, sourceHeight, index);
    });
  };

  const drawOverlayView = (ctx: CanvasRenderingContext2D, visibleSources: AudioSource[]) => {
    visibleSources.forEach((source, index) => {
      ctx.globalAlpha = 0.7 / visibleSources.length + 0.3; // Ensure visibility
      drawSourceVisualization(ctx, source, 0, 0, width, height, index);
    });
    ctx.globalAlpha = 1;
  };

  const drawSourceVisualization = (
    ctx: CanvasRenderingContext2D,
    source: AudioSource,
    x: number,
    y: number,
    w: number,
    h: number,
    colorIndex: number
  ) => {
    if (!getVisualizationData) return;

    const data = getVisualizationData(source.id);
    if (!data) return;

    const colors = [
      '#3b82f6', // Blue
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#8b5cf6', // Violet
      '#06b6d4', // Cyan
      '#84cc16', // Lime
      '#f97316'  // Orange
    ];

    const color = colors[colorIndex % colors.length];

    // Draw border for grid view
    if (viewMode === 'grid') {
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }

    const contentX = x + 5;
    const contentY = y + 25;
    const contentW = w - 10;
    const contentH = h - 35;

    // Split visualization area
    const spectrumHeight = contentH * 0.6;
    const waveformHeight = contentH * 0.4;

    // Draw frequency spectrum
    drawSpectrum(ctx, data.frequency, contentX, contentY, contentW, spectrumHeight, color);

    // Draw waveform
    const timeData = new Float32Array(data.time.length);
    for (let i = 0; i < data.time.length; i++) {
      timeData[i] = (data.time[i] - 128) / 128.0;
    }
    drawWaveform(ctx, timeData, contentX, contentY + spectrumHeight, contentW, waveformHeight, color);

    // Draw source info
    drawSourceInfo(ctx, source, x, y, w, color);
  };

  const drawSpectrum = (
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ) => {
    const barWidth = w / data.length;

    for (let i = 0; i < data.length; i++) {
      const barHeight = (data[i] / 255) * h;
      const alpha = Math.max(0.3, data[i] / 255);

      ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.fillRect(x + i * barWidth, y + h - barHeight, barWidth - 1, barHeight);
    }
  };

  const drawWaveform = (
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ) => {
    const barWidth = w / data.length;
    const centerY = y + h / 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const amplitude = data[i];
      const plotY = centerY + (amplitude * h * 0.4);
      const plotX = x + i * barWidth;

      if (i === 0) {
        ctx.moveTo(plotX, plotY);
      } else {
        ctx.lineTo(plotX, plotY);
      }
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, centerY);
    ctx.lineTo(x + w, centerY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawSourceInfo = (
    ctx: CanvasRenderingContext2D,
    source: AudioSource,
    x: number,
    y: number,
    w: number,
    color: string
  ) => {
    // Background for info
    ctx.fillStyle = '#1f2937cc';
    ctx.fillRect(x, y, w, 22);

    // Source name
    ctx.fillStyle = color;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(source.name, x + 5, y + 15);

    // Primary indicator
    if (source.isPrimary) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('PRIMARY', x + 5, y + 35);
    }

    // Metrics
    ctx.fillStyle = '#d1d5db';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    const rms = (source.metrics.volumeLevel * 100).toFixed(0);
    const vad = source.metrics.voiceActivityPercent.toFixed(0);
    ctx.fillText(`RMS: ${rms}% | VAD: ${vad}%`, x + w - 5, y + 15);
  };

  const toggleSourceVisibility = (sourceId: string) => {
    const newSelected = new Set(selectedSources);
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId);
    } else {
      newSelected.add(sourceId);
    }
    setSelectedSources(newSelected);
  };

  return (
    <div className={`multi-source-audio-visualizer ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium">View Mode:</span>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as any)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="grid">Grid</option>
            <option value="stacked">Stacked</option>
            <option value="overlay">Overlay</option>
          </select>
        </div>

        <div className="text-sm text-gray-600">
          {selectedSources.size} of {activeSources.length} sources visible
        </div>
      </div>

      {/* Source toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {activeSources.map((source, index) => {
          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
          const color = colors[index % colors.length];
          const isSelected = selectedSources.has(source.id);

          return (
            <button
              key={source.id}
              onClick={() => toggleSourceVisibility(source.id)}
              className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                isSelected
                  ? 'text-white shadow-md'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={isSelected ? { backgroundColor: color } : {}}
            >
              {source.name}
              {source.isPrimary && ' ★'}
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="border border-gray-300 rounded overflow-hidden">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block bg-gray-900"
        />
      </div>

      {/* Source summary */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeSources.map((source) => (
          <div
            key={source.id}
            className={`p-3 rounded border ${
              selectedSources.has(source.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">{source.name}</h4>
              {source.isPrimary && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                  PRIMARY
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div>Volume: {(source.metrics.volumeLevel * 100).toFixed(1)}%</div>
              <div>Voice Activity: {source.metrics.voiceActivityPercent.toFixed(1)}%</div>
              <div>Chunks: {source.metrics.chunksProcessed}</div>
              <div>Type: {source.type}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiSourceAudioVisualizer;