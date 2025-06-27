// Speaker Timeline Visualization Component
// Visual timeline showing speaker activity throughout a meeting

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  PlayIcon, 
  PauseIcon, 
  SpeakerWaveIcon, 
  ClockIcon,
  UserIcon,
  ChartBarIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon
} from '@heroicons/react/24/outline';

interface SpeakerSegment {
  speakerId: string;
  speakerName?: string;
  startTime: number;
  endTime: number;
  confidence: number;
  text?: string;
}

interface SpeakerInfo {
  id: string;
  name: string;
  color: string;
  totalTime: number;
  percentage: number;
  segmentCount: number;
  averageConfidence: number;
}

interface SpeakerTimelineVisualizationProps {
  sessionId: string;
  segments: SpeakerSegment[];
  totalDuration: number;
  currentTime?: number;
  onTimeSeek?: (time: number) => void;
  onSegmentClick?: (segment: SpeakerSegment) => void;
  height?: number;
  showStats?: boolean;
  showControls?: boolean;
  autoPlay?: boolean;
}

export const SpeakerTimelineVisualization: React.FC<SpeakerTimelineVisualizationProps> = ({
  sessionId,
  segments,
  totalDuration,
  currentTime = 0,
  onTimeSeek,
  onSegmentClick,
  height = 400,
  showStats = true,
  showControls = true,
  autoPlay = false
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [playbackTime, setPlaybackTime] = useState(currentTime);
  const [hoveredSegment, setHoveredSegment] = useState<SpeakerSegment | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<{ start: number; end: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportStart, setViewportStart] = useState(0);
  const [showConfidence, setShowConfidence] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Define colors for speakers
  const speakerColors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  // Calculate speaker statistics
  const speakerStats = useMemo(() => {
    const stats: Record<string, SpeakerInfo> = {};
    
    segments.forEach((segment, index) => {
      const speakerId = segment.speakerId;
      const duration = segment.endTime - segment.startTime;
      
      if (!stats[speakerId]) {
        stats[speakerId] = {
          id: speakerId,
          name: segment.speakerName || `Speaker ${speakerId.replace('speaker_', '')}`,
          color: speakerColors[Object.keys(stats).length % speakerColors.length],
          totalTime: 0,
          percentage: 0,
          segmentCount: 0,
          averageConfidence: 0
        };
      }
      
      stats[speakerId].totalTime += duration;
      stats[speakerId].segmentCount += 1;
      stats[speakerId].averageConfidence += segment.confidence;
    });

    // Calculate percentages and average confidence
    Object.values(stats).forEach(speaker => {
      speaker.percentage = (speaker.totalTime / totalDuration) * 100;
      speaker.averageConfidence = speaker.averageConfidence / speaker.segmentCount;
    });

    return Object.values(stats).sort((a, b) => b.totalTime - a.totalTime);
  }, [segments, totalDuration]);

  // Playback control
  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackTime(prev => {
          const newTime = prev + 0.1;
          if (newTime >= totalDuration) {
            setIsPlaying(false);
            return totalDuration;
          }
          return newTime;
        });
      }, 100);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // Sync with external current time
  useEffect(() => {
    setPlaybackTime(currentTime);
  }, [currentTime]);

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const timelineWidth = rect.width;
    const clickedTime = (clickX / timelineWidth) * totalDuration;
    
    setPlaybackTime(clickedTime);
    onTimeSeek?.(clickedTime);
  };

  const handleSegmentClick = (segment: SpeakerSegment) => {
    setPlaybackTime(segment.startTime);
    onTimeSeek?.(segment.startTime);
    onSegmentClick?.(segment);
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 2, 10));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 2, 1));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSegmentWidth = (segment: SpeakerSegment): string => {
    const duration = segment.endTime - segment.startTime;
    return `${(duration / totalDuration) * 100}%`;
  };

  const getSegmentLeft = (segment: SpeakerSegment): string => {
    return `${(segment.startTime / totalDuration) * 100}%`;
  };

  const getCurrentSpeaker = (): SpeakerInfo | null => {
    const currentSegment = segments.find(
      segment => playbackTime >= segment.startTime && playbackTime <= segment.endTime
    );
    
    if (currentSegment) {
      return speakerStats.find(speaker => speaker.id === currentSegment.speakerId) || null;
    }
    
    return null;
  };

  const currentSpeaker = getCurrentSpeaker();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Speaker Timeline</h3>
          <p className="text-gray-600">
            Visual representation of speaker activity over time
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Current Speaker Indicator */}
          {currentSpeaker && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-lg">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: currentSpeaker.color }}
              />
              <span className="text-sm font-medium">{currentSpeaker.name}</span>
            </div>
          )}
          
          {/* Time Display */}
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-gray-900">
              {formatTime(playbackTime)}
            </div>
            <div className="text-sm text-gray-500">
              / {formatTime(totalDuration)}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlayback}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full"
            >
              {isPlaying ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
            </button>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1}
                className="p-1 text-gray-600 hover:text-gray-800 disabled:text-gray-400"
              >
                <ArrowsPointingInIcon className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                {zoomLevel.toFixed(1)}x
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 10}
                className="p-1 text-gray-600 hover:text-gray-800 disabled:text-gray-400"
              >
                <ArrowsPointingOutIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showConfidence}
                onChange={(e) => setShowConfidence(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show Confidence</span>
            </label>
          </div>
        </div>
      )}

      {/* Timeline Visualization */}
      <div className="space-y-4">
        {/* Time Markers */}
        <div className="relative h-6 border-b border-gray-200">
          {Array.from({ length: Math.ceil(totalDuration / 60) + 1 }, (_, i) => i * 60).map(time => (
            <div
              key={time}
              className="absolute transform -translate-x-1/2"
              style={{ left: `${(time / totalDuration) * 100}%` }}
            >
              <div className="w-px h-4 bg-gray-300" />
              <div className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                {formatTime(time)}
              </div>
            </div>
          ))}
        </div>

        {/* Speaker Tracks */}
        <div className="space-y-2">
          {speakerStats.map((speaker) => (
            <div key={speaker.id} className="relative">
              <div className="flex items-center mb-1">
                <div className="flex items-center space-x-2 w-32 flex-shrink-0">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: speaker.color }}
                  />
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {speaker.name}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {formatTime(speaker.totalTime)} ({speaker.percentage.toFixed(1)}%)
                </div>
              </div>
              
              <div 
                ref={timelineRef}
                className="relative h-8 bg-gray-100 rounded cursor-pointer"
                onClick={handleTimelineClick}
              >
                {/* Speaker Segments */}
                {segments
                  .filter(segment => segment.speakerId === speaker.id)
                  .map((segment, index) => (
                    <div
                      key={`${segment.speakerId}-${index}`}
                      className="absolute h-full rounded transition-all duration-200 hover:shadow-lg cursor-pointer"
                      style={{
                        left: getSegmentLeft(segment),
                        width: getSegmentWidth(segment),
                        backgroundColor: speaker.color,
                        opacity: showConfidence ? segment.confidence : 0.8
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSegmentClick(segment);
                      }}
                      onMouseEnter={() => setHoveredSegment(segment)}
                      onMouseLeave={() => setHoveredSegment(null)}
                    />
                  ))}

                {/* Current Time Indicator */}
                <div
                  className="absolute top-0 w-0.5 h-full bg-red-500 z-10 pointer-events-none"
                  style={{ left: `${(playbackTime / totalDuration) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Segment Tooltip */}
        {hoveredSegment && (
          <div className="absolute z-20 bg-black text-white text-sm rounded px-2 py-1 pointer-events-none"
            style={{
              transform: 'translate(-50%, -100%)',
              top: '-10px'
            }}
          >
            <div>
              {formatTime(hoveredSegment.startTime)} - {formatTime(hoveredSegment.endTime)}
            </div>
            <div>Confidence: {Math.round(hoveredSegment.confidence * 100)}%</div>
            {hoveredSegment.text && (
              <div className="max-w-xs truncate">
                "{hoveredSegment.text}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Speaker Statistics */}
      {showStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {speakerStats.slice(0, 4).map((speaker) => (
            <div key={speaker.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: speaker.color }}
                />
                <span className="font-medium text-gray-900 truncate">
                  {speaker.name}
                </span>
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Speaking Time:</span>
                  <span className="font-medium">{formatTime(speaker.totalTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Percentage:</span>
                  <span className="font-medium">{speaker.percentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Segments:</span>
                  <span className="font-medium">{speaker.segmentCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Confidence:</span>
                  <span className="font-medium">{Math.round(speaker.averageConfidence * 100)}%</span>
                </div>
              </div>
              
              {/* Speaking Time Bar */}
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${speaker.percentage}%`,
                      backgroundColor: speaker.color
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Statistics */}
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-900">
              {speakerStats.length}
            </div>
            <div className="text-blue-700 text-sm">Total Speakers</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-900">
              {segments.length}
            </div>
            <div className="text-blue-700 text-sm">Total Segments</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-900">
              {formatTime(totalDuration)}
            </div>
            <div className="text-blue-700 text-sm">Total Duration</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-900">
              {Math.round(segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length * 100)}%
            </div>
            <div className="text-blue-700 text-sm">Avg Confidence</div>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="flex justify-end space-x-2">
        <button
          onClick={() => {
            const data = {
              sessionId,
              segments,
              speakerStats,
              totalDuration,
              timestamp: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `speaker-timeline-${sessionId}.json`;
            a.click();
          }}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Export Data
        </button>
        
        <button
          onClick={() => {
            // Generate SVG visualization for export
            const svgData = generateTimelineSVG(segments, speakerStats, totalDuration);
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `speaker-timeline-${sessionId}.svg`;
            a.click();
          }}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
        >
          Export Visualization
        </button>
      </div>
    </div>
  );
};

// Helper function to generate SVG visualization
function generateTimelineSVG(
  segments: SpeakerSegment[], 
  speakerStats: SpeakerInfo[], 
  totalDuration: number
): string {
  const width = 800;
  const height = speakerStats.length * 40 + 100;
  const trackHeight = 30;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" fill="white"/>`;
  
  // Title
  svg += `<text x="20" y="30" font-family="Arial" font-size="18" font-weight="bold" fill="black">Speaker Timeline</text>`;
  
  // Time axis
  const timeMarkers = Math.ceil(totalDuration / 60);
  for (let i = 0; i <= timeMarkers; i++) {
    const x = 20 + (i * 60 / totalDuration) * (width - 40);
    const time = i * 60;
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    svg += `<line x1="${x}" y1="50" x2="${x}" y2="60" stroke="gray" stroke-width="1"/>`;
    svg += `<text x="${x}" y="75" font-family="Arial" font-size="10" text-anchor="middle" fill="gray">${minutes}:${seconds.toString().padStart(2, '0')}</text>`;
  }
  
  // Speaker tracks
  speakerStats.forEach((speaker, index) => {
    const y = 90 + index * 40;
    
    // Speaker label
    svg += `<text x="15" y="${y + 20}" font-family="Arial" font-size="12" fill="black">${speaker.name}</text>`;
    
    // Track background
    svg += `<rect x="150" y="${y + 5}" width="${width - 170}" height="${trackHeight}" fill="#f3f4f6" rx="3"/>`;
    
    // Speaker segments
    segments
      .filter(segment => segment.speakerId === speaker.id)
      .forEach(segment => {
        const segmentX = 150 + (segment.startTime / totalDuration) * (width - 170);
        const segmentWidth = ((segment.endTime - segment.startTime) / totalDuration) * (width - 170);
        
        svg += `<rect x="${segmentX}" y="${y + 5}" width="${segmentWidth}" height="${trackHeight}" fill="${speaker.color}" opacity="0.8" rx="2"/>`;
      });
  });
  
  svg += '</svg>';
  return svg;
}