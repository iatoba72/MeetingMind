// Advanced Transcript Display Component
// Features: Virtual scrolling, search/filter, editing, timestamp navigation, export, keyboard shortcuts, presentation mode

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}

interface TranscriptionSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  words: TranscriptionWord[];
  confidence: number;
  speaker?: string;
  is_final: boolean;
  edited?: boolean;
  original_text?: string;
}

interface SearchMatch {
  segmentId: string;
  wordIndex: number;
  matchText: string;
}

interface AdvancedTranscriptDisplayProps {
  segments: TranscriptionSegment[];
  onSegmentEdit?: (segmentId: string, newText: string) => void;
  onSegmentDelete?: (segmentId: string) => void;
  onJumpToTime?: (timestamp: number) => void;
  showSpeakerLabels?: boolean;
  showTimestamps?: boolean;
  showConfidence?: boolean;
  isEditable?: boolean;
  className?: string;
  height?: number;
}

export const AdvancedTranscriptDisplay: React.FC<AdvancedTranscriptDisplayProps> = ({
  segments,
  onSegmentEdit,
  onSegmentDelete,
  onJumpToTime,
  showSpeakerLabels = true,
  showTimestamps = true,
  showConfidence = true,
  isEditable = true,
  className = '',
  height = 600
}) => {
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [filterBySpeaker, setFilterBySpeaker] = useState<string>('');
  const [filterByConfidence, setFilterByConfidence] = useState<number>(0);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [presentationMode, setPresentationMode] = useState(false);
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  
  // Refs
  const listRef = useRef<List>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Get unique speakers for filter
  const speakers = useMemo(() => {
    const speakerSet = new Set<string>();
    segments.forEach(segment => {
      if (segment.speaker) speakerSet.add(segment.speaker);
    });
    return Array.from(speakerSet);
  }, [segments]);

  // Filter segments based on search and filters
  const filteredSegments = useMemo(() => {
    let filtered = segments;

    // Filter by speaker
    if (filterBySpeaker) {
      filtered = filtered.filter(segment => segment.speaker === filterBySpeaker);
    }

    // Filter by confidence
    if (filterByConfidence > 0) {
      filtered = filtered.filter(segment => segment.confidence >= filterByConfidence / 100);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(segment => 
        segment.text.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [segments, filterBySpeaker, filterByConfidence, searchTerm]);

  // Search functionality
  const performSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const matches: SearchMatch[] = [];
    const searchLower = searchTerm.toLowerCase();

    segments.forEach(segment => {
      const textLower = segment.text.toLowerCase();
      let startIndex = 0;
      
      while (true) {
        const index = textLower.indexOf(searchLower, startIndex);
        if (index === -1) break;
        
        matches.push({
          segmentId: segment.id,
          wordIndex: index,
          matchText: segment.text.substring(index, index + searchTerm.length)
        });
        
        startIndex = index + 1;
      }
    });

    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, [searchTerm, segments]);

  // Navigate search results
  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return;

    let newIndex;
    if (direction === 'next') {
      newIndex = currentMatchIndex < searchMatches.length - 1 ? currentMatchIndex + 1 : 0;
    } else {
      newIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : searchMatches.length - 1;
    }

    setCurrentMatchIndex(newIndex);

    // Scroll to the match
    const match = searchMatches[newIndex];
    const segmentIndex = filteredSegments.findIndex(s => s.id === match.segmentId);
    if (segmentIndex !== -1 && listRef.current) {
      listRef.current.scrollToItem(segmentIndex, 'center');
    }
  }, [searchMatches, currentMatchIndex, filteredSegments]);

  const saveEdit = useCallback(() => {
    if (editingSegmentId && editingText.trim() !== '') {
      onSegmentEdit?.(editingSegmentId, editingText.trim());
      setEditingSegmentId(null);
      setEditingText('');
    }
  }, [editingSegmentId, editingText, onSegmentEdit]);

  const exportTranscript = useCallback((format: 'txt' | 'srt' | 'json') => {
    let content: string;
    let filename: string;
    let mimeType: string;

    const exportSegments = selectedSegments.size > 0 
      ? filteredSegments.filter(s => selectedSegments.has(s.id))
      : filteredSegments;

    switch (format) {
      case 'txt':
        content = exportSegments.map(segment => {
          const timestamp = showTimestamps ? `[${formatTimestamp(segment.start_time)}] ` : '';
          const speaker = showSpeakerLabels && segment.speaker ? `${segment.speaker}: ` : '';
          return `${timestamp}${speaker}${segment.text}`;
        }).join('\n\n');
        filename = 'transcript.txt';
        mimeType = 'text/plain';
        break;

      case 'srt': {
        content = exportSegments.map((segment, index) => {
          const startTime = formatSRTTime(segment.start_time);
          const endTime = formatSRTTime(segment.end_time);
          const speaker = segment.speaker ? `${segment.speaker}: ` : '';
          return `${index + 1}\n${startTime} --> ${endTime}\n${speaker}${segment.text}\n`;
        }).join('\n');
        filename = 'transcript.srt';
        mimeType = 'text/plain';
        break;
      }

      case 'json':
        content = JSON.stringify({
          segments: exportSegments,
          metadata: {
            exportDate: new Date().toISOString(),
            totalSegments: exportSegments.length,
            speakers: speakers,
            filters: {
              speaker: filterBySpeaker,
              confidence: filterByConfidence,
              search: searchTerm
            }
          }
        }, null, 2);
        filename = 'transcript.json';
        mimeType = 'application/json';
        break;
    }

    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedSegments, filteredSegments, showTimestamps, showSpeakerLabels, speakers, filterBySpeaker, filterByConfidence, searchTerm]);

  // Keyboard shortcuts
  useEffect(() => {
    const cancelEdit = () => {
      setEditingSegmentId(null);
      setEditingText('');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd combinations
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'f':
            e.preventDefault();
            searchInputRef.current?.focus();
            break;
          case 'e':
            e.preventDefault();
            exportTranscript('txt');
            break;
          case 'p':
            e.preventDefault();
            setPresentationMode(!presentationMode);
            break;
          case 'a':
            e.preventDefault();
            if (filteredSegments.length > 0) {
              setSelectedSegments(new Set(filteredSegments.map(s => s.id)));
            }
            break;
        }
      }

      // Other shortcuts
      switch (e.key) {
        case 'Escape':
          if (editingSegmentId) {
            cancelEdit();
          } else if (searchTerm) {
            setSearchTerm('');
            setSearchMatches([]);
          }
          break;
        case 'F3':
          e.preventDefault();
          if (e.shiftKey) {
            navigateSearch('prev');
          } else {
            navigateSearch('next');
          }
          break;
        case 'Enter':
          if (e.ctrlKey && editingSegmentId) {
            saveEdit();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [presentationMode, searchTerm, editingSegmentId, navigateSearch, exportTranscript, saveEdit, filteredSegments]);

  // Perform search when search term changes
  useEffect(() => {
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [performSearch]);

  // Format timestamp
  const formatTimestamp = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Start editing a segment
  const startEdit = (segment: TranscriptionSegment) => {
    if (!isEditable) return;
    setEditingSegmentId(segment.id);
    setEditingText(segment.text);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingSegmentId(null);
    setEditingText('');
  };

  // Delete segment
  const deleteSegment = (segmentId: string) => {
    if (window.confirm('Are you sure you want to delete this segment?')) {
      onSegmentDelete?.(segmentId);
    }
  };

  // Format time for SRT format
  const formatSRTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const milliseconds = Math.floor((secs % 1) * 1000);
    const wholeSeconds = Math.floor(secs);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  };

  // Toggle segment selection
  const toggleSegmentSelection = (segmentId: string) => {
    const newSelection = new Set(selectedSegments);
    if (newSelection.has(segmentId)) {
      newSelection.delete(segmentId);
    } else {
      newSelection.add(segmentId);
    }
    setSelectedSegments(newSelection);
  };

  // Highlight search matches in text
  const highlightText = (text: string, segmentId: string): React.ReactNode => {
    if (!searchTerm || !searchMatches.length) return text;

    const segmentMatches = searchMatches.filter(match => match.segmentId === segmentId);
    if (segmentMatches.length === 0) return text;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    segmentMatches.forEach((match, index) => {
      const startIndex = match.wordIndex;
      const endIndex = startIndex + searchTerm.length;

      // Add text before match
      if (startIndex > lastIndex) {
        parts.push(text.substring(lastIndex, startIndex));
      }

      // Add highlighted match
      const isCurrentMatch = searchMatches.indexOf(match) === currentMatchIndex;
      parts.push(
        <span
          key={`match-${index}`}
          className={`${isCurrentMatch ? 'bg-yellow-300' : 'bg-yellow-100'} px-1 rounded`}
        >
          {text.substring(startIndex, endIndex)}
        </span>
      );

      lastIndex = endIndex;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  // Render individual segment
  const renderSegment = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const segment = filteredSegments[index];
    const isSelected = selectedSegments.has(segment.id);
    const isEditing = editingSegmentId === segment.id;

    return (
      <div style={style} className="px-4 py-2">
        <div className={`
          bg-white rounded-lg border transition-all duration-200
          ${isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}
          ${presentationMode ? 'p-6' : 'p-4'}
        `}>
          {/* Segment Header */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-3">
              {/* Selection checkbox */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSegmentSelection(segment.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label={`Select segment ${index + 1}`}
              />

              {/* Timestamp */}
              {showTimestamps && (
                <button
                  onClick={() => onJumpToTime?.(segment.start_time)}
                  className={`
                    text-blue-600 hover:text-blue-800 font-mono transition-colors
                    ${presentationMode ? 'text-lg' : 'text-sm'}
                  `}
                  title="Jump to this time"
                >
                  {formatTimestamp(segment.start_time)}
                </button>
              )}

              {/* Speaker label */}
              {showSpeakerLabels && segment.speaker && (
                <span className={`
                  px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium
                  ${presentationMode ? 'text-base' : 'text-xs'}
                `}>
                  {segment.speaker}
                </span>
              )}

              {/* Confidence score */}
              {showConfidence && (
                <span className={`
                  font-medium ${getConfidenceColor(segment.confidence)}
                  ${presentationMode ? 'text-base' : 'text-xs'}
                `}>
                  {Math.round(segment.confidence * 100)}%
                </span>
              )}

              {/* Edited indicator */}
              {segment.edited && (
                <span className={`
                  text-orange-600
                  ${presentationMode ? 'text-base' : 'text-xs'}
                `} title="This segment has been edited">
                  ✏️ Edited
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center space-x-2">
              {isEditable && !isEditing && (
                <>
                  <button
                    onClick={() => startEdit(segment)}
                    className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                    title="Edit segment (Ctrl+E)"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteSegment(segment.id)}
                    className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                    title="Delete segment"
                  >
                    🗑️
                  </button>
                </>
              )}

              {isEditing && (
                <>
                  <button
                    onClick={saveEdit}
                    className="p-1 text-green-600 hover:text-green-800 transition-colors"
                    title="Save (Ctrl+Enter)"
                  >
                    ✅
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                    title="Cancel (Esc)"
                  >
                    ❌
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Segment Content */}
          <div className={`
            leading-relaxed
            ${presentationMode ? 'text-2xl' : 'text-base'}
          `}>
            {isEditing ? (
              <textarea
                ref={editInputRef}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    saveEdit();
                  } else if (e.key === 'Escape') {
                    cancelEdit();
                  }
                }}
                className={`
                  w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none
                  ${presentationMode ? 'text-2xl min-h-[120px]' : 'text-base min-h-[80px]'}
                `}
                autoFocus
              />
            ) : (
              <div className="text-gray-900">
                {highlightText(segment.text, segment.id)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
      {/* Header Controls */}
      <div className="p-4 border-b border-gray-200 bg-white rounded-t-lg">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          {/* Search */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search transcript... (Ctrl+F)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
              />
              <span className="absolute left-2 top-2.5 text-gray-400">🔍</span>
            </div>

            {searchMatches.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {currentMatchIndex + 1} of {searchMatches.length}
                </span>
                <button
                  onClick={() => navigateSearch('prev')}
                  className="p-1 text-gray-500 hover:text-gray-700"
                  title="Previous match (Shift+F3)"
                >
                  ⬆️
                </button>
                <button
                  onClick={() => navigateSearch('next')}
                  className="p-1 text-gray-500 hover:text-gray-700"
                  title="Next match (F3)"
                >
                  ⬇️
                </button>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            {/* Speaker filter */}
            {speakers.length > 0 && (
              <select
                value={filterBySpeaker}
                onChange={(e) => setFilterBySpeaker(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Speakers</option>
                {speakers.map(speaker => (
                  <option key={speaker} value={speaker}>{speaker}</option>
                ))}
              </select>
            )}

            {/* Confidence filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Min Confidence:</label>
              <input
                type="range"
                min="0"
                max="100"
                value={filterByConfidence}
                onChange={(e) => setFilterByConfidence(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-gray-600 w-8">{filterByConfidence}%</span>
            </div>
          </div>

          {/* Mode Toggle */}
          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className={`
              px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${presentationMode 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }
            `}
            title="Toggle presentation mode (Ctrl+P)"
          >
            {presentationMode ? '📺 Presentation' : '📄 Normal'}
          </button>
        </div>

        {/* Second row of controls */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {filteredSegments.length} of {segments.length} segments
            </span>
            
            {selectedSegments.size > 0 && (
              <span className="text-sm text-blue-600">
                {selectedSegments.size} selected
              </span>
            )}
          </div>

          {/* Export options */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Export:</span>
            <button
              onClick={() => exportTranscript('txt')}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              title="Export as TXT (Ctrl+E)"
            >
              TXT
            </button>
            <button
              onClick={() => exportTranscript('srt')}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              SRT
            </button>
            <button
              onClick={() => exportTranscript('json')}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* Virtual Scrolling List */}
      <div className="relative">
        {filteredSegments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm || filterBySpeaker || filterByConfidence > 0 
              ? 'No segments match your filters'
              : 'No transcript segments available'
            }
          </div>
        ) : (
          <List
            ref={listRef}
            height={height}
            width="100%"
            itemCount={filteredSegments.length}
            itemSize={presentationMode ? 200 : 120}
            className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          >
            {renderSegment}
          </List>
        )}
      </div>

      {/* Keyboard shortcuts help */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer hover:text-gray-800">Keyboard Shortcuts</summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+F</kbd> Search</div>
            <div><kbd className="bg-gray-200 px-1 rounded">F3</kbd> Next match</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Shift+F3</kbd> Prev match</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+P</kbd> Presentation mode</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+E</kbd> Export TXT</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+A</kbd> Select all</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Esc</kbd> Cancel/Clear</div>
            <div><kbd className="bg-gray-200 px-1 rounded">Ctrl+Enter</kbd> Save edit</div>
          </div>
        </details>
      </div>
    </div>
  );
};