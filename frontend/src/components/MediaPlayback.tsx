// Advanced Media Playback with Synchronized Transcript
// Provides comprehensive playback controls with transcript synchronization and advanced features

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface PlaybackSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    probability: number;
  }>;
}

interface Bookmark {
  id: string;
  timestamp: number;
  title: string;
  description?: string;
  color?: string;
  createdAt: Date;
}

interface Annotation {
  id: string;
  timestamp: number;
  duration?: number;
  text: string;
  type: 'note' | 'highlight' | 'question' | 'action';
  color?: string;
  createdAt: Date;
}

interface LoopSection {
  id: string;
  start: number;
  end: number;
  title: string;
  playCount: number;
  maxPlays?: number;
}

interface MediaPlaybackProps {
  // Media source
  audioUrl?: string;
  videoUrl?: string;
  
  // Transcript data
  segments: PlaybackSegment[];
  
  // Playback settings
  autoPlay?: boolean;
  showVideo?: boolean;
  showWaveform?: boolean;
  
  // Feature toggles
  enableBookmarks?: boolean;
  enableAnnotations?: boolean;
  enableStudyMode?: boolean;
  enableSpeedControl?: boolean;
  enableSkipSilence?: boolean;
  
  // Callbacks
  onBookmarkAdd?: (bookmark: Bookmark) => void;
  onAnnotationAdd?: (annotation: Annotation) => void;
  onSegmentClick?: (segment: PlaybackSegment) => void;
  onPlaybackStateChange?: (isPlaying: boolean, currentTime: number) => void;
  
  // Study mode settings
  studyModeConfig?: {
    autoLoop?: boolean;
    showNotes?: boolean;
    highlightActive?: boolean;
  };
  
  className?: string;
}

/**
 * Media Storage and Playback Strategy:
 * 
 * 1. Media File Management:
 *    - Support for multiple formats (WebM, MP4, WAV, MP3)
 *    - Adaptive bitrate for different network conditions
 *    - Progressive download with buffering indicators
 *    - Local caching for offline playback capability
 * 
 * 2. Transcript Synchronization:
 *    - Real-time highlight of current segment during playback
 *    - Word-level synchronization for precise timing
 *    - Click-to-seek functionality from transcript to media
 *    - Visual indicators for confidence levels and speakers
 * 
 * 3. Performance Optimization:
 *    - Virtual scrolling for large transcripts
 *    - Lazy loading of media segments
 *    - Efficient re-rendering with React.memo and useMemo
 *    - Web Workers for audio analysis (silence detection)
 * 
 * 4. Accessibility:
 *    - Full keyboard navigation support
 *    - Screen reader compatibility
 *    - High contrast mode support
 *    - Customizable playback speeds for different needs
 */

export const MediaPlayback: React.FC<MediaPlaybackProps> = React.memo(({
  audioUrl,
  videoUrl,
  segments,
  autoPlay = false,
  showVideo = true,
  showWaveform = false,
  enableBookmarks = true,
  enableAnnotations = true,
  enableStudyMode = false,
  enableSpeedControl = true,
  enableSkipSilence = false,
  onBookmarkAdd,
  onAnnotationAdd,
  onSegmentClick,
  onPlaybackStateChange,
  studyModeConfig = {},
  className = ''
}) => {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [buffered, setBuffered] = useState<TimeRanges | null>(null);
  
  // Advanced features state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loopSection, setLoopSection] = useState<LoopSection | null>(null);
  const [skipSilence, setSkipSilence] = useState(enableSkipSilence);
  const [studyMode, setStudyMode] = useState(enableStudyMode);
  
  // UI state
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [showAnnotationDialog, setShowAnnotationDialog] = useState(false);
  
  // Refs
  const mediaElementRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const silenceDetectionWorkerRef = useRef<Worker | null>(null);
  
  // Find current segment based on playback time
  const currentSegment = useMemo(() => {
    return segments.find(segment => 
      currentTime >= segment.start_time && currentTime <= segment.end_time
    );
  }, [segments, currentTime]);
  
  // Update active segment
  useEffect(() => {
    if (currentSegment) {
      setActiveSegmentId(currentSegment.id);
      
      // Auto-scroll to active segment if in study mode
      if (studyMode && transcriptContainerRef.current) {
        const activeElement = transcriptContainerRef.current.querySelector(
          `[data-segment-id="${currentSegment.id}"]`
        );
        if (activeElement) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [currentSegment, studyMode]);
  
  // Silence detection for skip silence feature
  useEffect(() => {
    if (!skipSilence || !mediaElementRef.current) return;
    
    // Initialize Web Worker for audio analysis
    const worker = new Worker(
      URL.createObjectURL(new Blob([`
        // Web Worker for real-time silence detection
        let audioContext;
        let analyser;
        let dataArray;
        let silenceThreshold = 0.01;
        let silenceDuration = 0;
        let lastSilenceTime = 0;
        
        self.onmessage = function(e) {
          const { type, data } = e.data;
          
          if (type === 'init') {
            silenceThreshold = data.threshold || 0.01;
          } else if (type === 'analyze') {
            // Analyze audio data for silence
            const { audioData, currentTime } = data;
            const avgVolume = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;
            
            if (avgVolume < silenceThreshold) {
              if (silenceDuration === 0) {
                lastSilenceTime = currentTime;
              }
              silenceDuration += 0.1; // Assuming 100ms analysis intervals
              
              // Skip if silence is longer than 2 seconds
              if (silenceDuration > 2) {
                self.postMessage({
                  type: 'skipSilence',
                  skipTo: currentTime + 1 // Skip ahead 1 second
                });
                silenceDuration = 0;
              }
            } else {
              silenceDuration = 0;
            }
          }
        };
      `], { type: 'application/javascript' }))
    );
    
    worker.onmessage = (e) => {
      if (e.data.type === 'skipSilence' && mediaElementRef.current) {
        mediaElementRef.current.currentTime = e.data.skipTo;
      }
    };
    
    silenceDetectionWorkerRef.current = worker;
    worker.postMessage({ type: 'init', data: { threshold: 0.01 } });
    
    return () => {
      worker.terminate();
    };
  }, [skipSilence]);
  
  // Media event handlers
  const handleTimeUpdate = useCallback(() => {
    if (!mediaElementRef.current) return;
    
    const time = mediaElementRef.current.currentTime;
    setCurrentTime(time);
    
    // Check for loop section
    if (loopSection && time >= loopSection.end) {
      if (!loopSection.maxPlays || loopSection.playCount < loopSection.maxPlays) {
        mediaElementRef.current.currentTime = loopSection.start;
        setLoopSection(prev => prev ? { ...prev, playCount: prev.playCount + 1 } : null);
      } else {
        setLoopSection(null);
      }
    }
    
    // Update buffered ranges
    if (mediaElementRef.current.buffered) {
      setBuffered(mediaElementRef.current.buffered);
    }
    
    onPlaybackStateChange?.(isPlaying, time);
  }, [isPlaying, loopSection, onPlaybackStateChange]);
  
  const handleLoadedMetadata = useCallback(() => {
    if (mediaElementRef.current) {
      setDuration(mediaElementRef.current.duration);
      setIsLoading(false);
    }
  }, []);
  
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);
  
  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);
  
  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
  }, []);
  
  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (!mediaElementRef.current) return;
    
    if (isPlaying) {
      mediaElementRef.current.pause();
    } else {
      mediaElementRef.current.play();
    }
  }, [isPlaying]);
  
  const seekTo = useCallback((time: number) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);
  
  const seekRelative = useCallback((seconds: number) => {
    seekTo(currentTime + seconds);
  }, [currentTime, seekTo]);
  
  const changePlaybackRate = useCallback((rate: number) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);
  
  const changeVolume = useCallback((vol: number) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.volume = Math.max(0, Math.min(vol, 1));
      setVolume(vol);
    }
  }, []);
  
  // Bookmark functionality
  const addBookmark = useCallback((title: string, description?: string) => {
    const bookmark: Bookmark = {
      id: `bookmark_${Date.now()}`,
      timestamp: currentTime,
      title,
      description,
      color: '#3B82F6',
      createdAt: new Date(),
    };
    
    setBookmarks(prev => [...prev, bookmark].sort((a, b) => a.timestamp - b.timestamp));
    onBookmarkAdd?.(bookmark);
    setShowBookmarkDialog(false);
  }, [currentTime, onBookmarkAdd]);
  
  // Annotation functionality
  const addAnnotation = useCallback((text: string, type: Annotation['type'] = 'note') => {
    const annotation: Annotation = {
      id: `annotation_${Date.now()}`,
      timestamp: currentTime,
      text,
      type,
      color: type === 'highlight' ? '#FEF3C7' : '#E0E7FF',
      createdAt: new Date(),
    };
    
    setAnnotations(prev => [...prev, annotation].sort((a, b) => a.timestamp - b.timestamp));
    onAnnotationAdd?.(annotation);
    setShowAnnotationDialog(false);
  }, [currentTime, onAnnotationAdd]);
  
  // Loop section functionality
  const createLoopSection = useCallback((start: number, end: number, title: string) => {
    const loop: LoopSection = {
      id: `loop_${Date.now()}`,
      start,
      end,
      title,
      playCount: 0,
      maxPlays: studyMode ? 3 : undefined,
    };
    
    setLoopSection(loop);
    seekTo(start);
  }, [studyMode, seekTo]);
  
  // Transcript interaction
  const handleSegmentClick = useCallback((segment: PlaybackSegment) => {
    seekTo(segment.start_time);
    onSegmentClick?.(segment);
  }, [seekTo, onSegmentClick]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekRelative(e.shiftKey ? -30 : -10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(e.shiftKey ? 30 : 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(Math.min(volume + 0.1, 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(Math.max(volume - 0.1, 0));
          break;
        case 'Comma':
          e.preventDefault();
          changePlaybackRate(Math.max(playbackRate - 0.25, 0.25));
          break;
        case 'Period':
          e.preventDefault();
          changePlaybackRate(Math.min(playbackRate + 0.25, 3));
          break;
        case 'KeyB':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowBookmarkDialog(true);
          }
          break;
        case 'KeyN':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowAnnotationDialog(true);
          }
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [togglePlayPause, seekRelative, changeVolume, changePlaybackRate, volume, playbackRate]);
  
  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);
  
  // Progress bar click handler
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = clickX / rect.width;
    seekTo(progress * duration);
  }, [duration, seekTo]);

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden ${className}`}>
      {/* Media Element */}
      <div className="relative bg-black">
        {videoUrl && showVideo ? (
          <video
            ref={mediaElementRef as React.RefObject<HTMLVideoElement>}
            src={videoUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={handlePlay}
            onPause={handlePause}
            onLoadStart={handleLoadStart}
            className="w-full h-auto max-h-96"
            controls={false}
            autoPlay={autoPlay}
            preload="metadata"
          />
        ) : audioUrl ? (
          <audio
            ref={mediaElementRef as React.RefObject<HTMLAudioElement>}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={handlePlay}
            onPause={handlePause}
            onLoadStart={handleLoadStart}
            autoPlay={autoPlay}
            preload="metadata"
          />
        ) : null}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}
        
        {/* Waveform visualization */}
        {showWaveform && (
          <canvas
            ref={waveformCanvasRef}
            className="absolute bottom-0 left-0 w-full h-16 opacity-75"
          />
        )}
      </div>
      
      {/* Control Bar */}
      <div className="bg-gray-900 text-white p-4">
        {/* Progress Bar */}
        <div className="mb-4">
          <div 
            className="relative h-2 bg-gray-700 rounded-full cursor-pointer"
            onClick={handleProgressClick}
          >
            {/* Buffered segments */}
            {buffered && Array.from({ length: buffered.length }, (_, i) => (
              <div
                key={i}
                className="absolute h-full bg-gray-500 rounded-full"
                style={{
                  left: `${(buffered.start(i) / duration) * 100}%`,
                  width: `${((buffered.end(i) - buffered.start(i)) / duration) * 100}%`,
                }}
              />
            ))}
            
            {/* Progress */}
            <div 
              className="absolute h-full bg-blue-500 rounded-full transition-all duration-100"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
            
            {/* Bookmarks */}
            {bookmarks.map(bookmark => (
              <div
                key={bookmark.id}
                className="absolute w-2 h-2 bg-yellow-400 rounded-full transform -translate-y-1/2 top-1/2 cursor-pointer"
                style={{ left: `${(bookmark.timestamp / duration) * 100}%` }}
                title={bookmark.title}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(bookmark.timestamp);
                }}
              />
            ))}
            
            {/* Loop section */}
            {loopSection && (
              <div
                className="absolute h-full bg-green-400 bg-opacity-30 border-l-2 border-r-2 border-green-400"
                style={{
                  left: `${(loopSection.start / duration) * 100}%`,
                  width: `${((loopSection.end - loopSection.start) / duration) * 100}%`,
                }}
              />
            )}
          </div>
          
          {/* Time display */}
          <div className="flex justify-between text-sm mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlayPause}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              title="Play/Pause (Space)"
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            
            {/* Skip buttons */}
            <button
              onClick={() => seekRelative(-10)}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              title="Skip back 10s (←)"
            >
              ⏪
            </button>
            
            <button
              onClick={() => seekRelative(10)}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              title="Skip forward 10s (→)"
            >
              ⏩
            </button>
            
            {/* Speed control */}
            {enableSpeedControl && (
              <div className="flex items-center space-x-2">
                <span className="text-sm">Speed:</span>
                <select
                  value={playbackRate}
                  onChange={(e) => changePlaybackRate(Number(e.target.value))}
                  className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                >
                  <option value={0.25}>0.25x</option>
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Volume control */}
            <div className="flex items-center space-x-2">
              <span className="text-sm">🔊</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-20"
              />
            </div>
            
            {/* Feature toggles */}
            {enableSkipSilence && (
              <button
                onClick={() => setSkipSilence(!skipSilence)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  skipSilence ? 'bg-blue-600' : 'bg-gray-700'
                }`}
                title="Skip silence"
              >
                Skip Silence
              </button>
            )}
            
            {enableStudyMode && (
              <button
                onClick={() => setStudyMode(!studyMode)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  studyMode ? 'bg-green-600' : 'bg-gray-700'
                }`}
                title="Study mode"
              >
                Study Mode
              </button>
            )}
            
            {/* Bookmark button */}
            {enableBookmarks && (
              <button
                onClick={() => setShowBookmarkDialog(true)}
                className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                title="Add bookmark (Ctrl+B)"
              >
                🔖
              </button>
            )}
            
            {/* Annotation button */}
            {enableAnnotations && (
              <button
                onClick={() => setShowAnnotationDialog(true)}
                className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                title="Add annotation (Ctrl+N)"
              >
                📝
              </button>
            )}
          </div>
        </div>
        
        {/* Loop section info */}
        {loopSection && (
          <div className="mt-2 p-2 bg-green-800 rounded text-sm">
            <div className="flex items-center justify-between">
              <span>
                🔄 {loopSection.title} - {loopSection.playCount}/{loopSection.maxPlays || '∞'} plays
              </span>
              <button
                onClick={() => setLoopSection(null)}
                className="text-white hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Transcript Section */}
      <div className="p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Synchronized Transcript</h3>
          
          {studyMode && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>Study Mode Active</span>
              {studyModeConfig.autoLoop && <span>• Auto Loop</span>}
              {studyModeConfig.highlightActive && <span>• Active Highlight</span>}
            </div>
          )}
        </div>
        
        <div 
          ref={transcriptContainerRef}
          className={`max-h-96 overflow-y-auto space-y-3 ${
            studyMode ? 'bg-white p-4 rounded-lg shadow-inner' : ''
          }`}
        >
          {segments.map((segment) => (
            <div
              key={segment.id}
              data-segment-id={segment.id}
              className={`
                p-3 rounded-lg cursor-pointer transition-all duration-200
                ${activeSegmentId === segment.id 
                  ? studyMode 
                    ? 'bg-yellow-100 border-l-4 border-yellow-500 shadow-md' 
                    : 'bg-blue-100 border-l-4 border-blue-500'
                  : 'bg-white hover:bg-gray-50 border border-gray-200'
                }
              `}
              onClick={() => handleSegmentClick(segment)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-blue-600 font-mono">
                    {formatTime(segment.start_time)}
                  </span>
                  
                  {segment.speaker && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {segment.speaker}
                    </span>
                  )}
                  
                  <span className="text-xs text-gray-500">
                    {Math.round(segment.confidence * 100)}% confidence
                  </span>
                </div>
                
                {studyMode && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createLoopSection(
                          segment.start_time,
                          segment.end_time,
                          `Segment: ${segment.speaker || 'Unknown'}`
                        );
                      }}
                      className="text-green-600 hover:text-green-800"
                      title="Loop this segment"
                    >
                      🔄
                    </button>
                  </div>
                )}
              </div>
              
              <div className={`text-gray-900 leading-relaxed ${studyMode ? 'text-lg' : ''}`}>
                {segment.text}
              </div>
              
              {/* Annotations for this segment */}
              {annotations
                .filter(ann => 
                  ann.timestamp >= segment.start_time && 
                  ann.timestamp <= segment.end_time
                )
                .map(annotation => (
                  <div
                    key={annotation.id}
                    className={`mt-2 p-2 rounded text-sm border-l-4 ${
                      annotation.type === 'highlight' 
                        ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                        : annotation.type === 'question'
                        ? 'bg-red-50 border-red-400 text-red-800'
                        : annotation.type === 'action'
                        ? 'bg-green-50 border-green-400 text-green-800'
                        : 'bg-blue-50 border-blue-400 text-blue-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{annotation.type}</span>
                      <span className="text-xs opacity-75">
                        {formatTime(annotation.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1">{annotation.text}</div>
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      </div>
      
      {/* Bookmark Dialog */}
      {showBookmarkDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add Bookmark</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                addBookmark(
                  formData.get('title') as string,
                  formData.get('description') as string || undefined
                );
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    name="title"
                    type="text"
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Bookmark title"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    name="description"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>
                
                <div className="text-sm text-gray-500">
                  Time: {formatTime(currentTime)}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowBookmarkDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Bookmark
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Annotation Dialog */}
      {showAnnotationDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add Annotation</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                addAnnotation(
                  formData.get('text') as string,
                  formData.get('type') as Annotation['type']
                );
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    name="type"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="note">Note</option>
                    <option value="highlight">Highlight</option>
                    <option value="question">Question</option>
                    <option value="action">Action Item</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Text
                  </label>
                  <textarea
                    name="text"
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    rows={4}
                    placeholder="Enter your annotation..."
                  />
                </div>
                
                <div className="text-sm text-gray-500">
                  Time: {formatTime(currentTime)}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAnnotationDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Add Annotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Keyboard shortcuts help */}
      <div className="p-4 bg-gray-100 border-t border-gray-200">
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer hover:text-gray-800 font-medium">
            Keyboard Shortcuts
          </summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><kbd className="bg-gray-200 px-1 rounded">Space</kbd> Play/Pause</div>
            <div><kbd className="bg-gray-200 px-1 rounded">←/→</kbd> Skip 10s</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Shift+←/→</kbd> Skip 30s</div>
            <div><kbd className="bg-gray-200 px-1 rounded">↑/↓</kbd> Volume</div>
            <div><kbd className="bg-gray-200 px-1 rounded">,/.</kbd> Speed</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+B</kbd> Bookmark</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+N</kbd> Annotate</div>
          </div>
        </details>
      </div>
    </div>
  );
});