// Virtualized Transcript Component
// High-performance virtual scrolling for long transcripts with smooth UX

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List, areEqual } from 'react-window';
import { 
  Clock, 
  Copy,
  Bookmark,
  MessageSquare,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface TranscriptSegment {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  timestamp: number;
  confidence: number;
  duration: number;
  isEdited?: boolean;
  tags?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface VirtualizedTranscriptProps {
  segments: TranscriptSegment[];
  isLive?: boolean;
  autoScroll?: boolean;
  searchQuery?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  onSegmentEdit?: (segmentId: string, newText: string) => void;
  onBookmark?: (segmentId: string) => void;
  className?: string;
  showTimestamps?: boolean;
  showSpeakers?: boolean;
  showConfidence?: boolean;
  itemHeight?: number;
  bufferSize?: number;
  enableVirtualization?: boolean;
}

// Memoized transcript item component for performance
const TranscriptItem = React.memo<{
  index: number;
  style: any;
  data: {
    segments: TranscriptSegment[];
    searchQuery?: string;
    onSegmentClick?: (segment: TranscriptSegment) => void;
    onSegmentEdit?: (segmentId: string, newText: string) => void;
    onBookmark?: (segmentId: string) => void;
    showTimestamps: boolean;
    showSpeakers: boolean;
    showConfidence: boolean;
  };
}>(({ index, style, data }) => {
  const { 
    segments, 
    searchQuery, 
    onSegmentClick, 
    onSegmentEdit, 
    onBookmark,
    showTimestamps,
    showSpeakers,
    showConfidence
  } = data;
  
  const segment = segments[index];
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);
  const [isHovered, setIsHovered] = useState(false);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const highlightText = (text: string, query?: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 px-1 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  const handleEdit = () => {
    if (isEditing && editText !== segment.text) {
      onSegmentEdit?.(segment.id, editText);
    }
    setIsEditing(!isEditing);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit();
    } else if (e.key === 'Escape') {
      setEditText(segment.text);
      setIsEditing(false);
    }
  };

  const getSpeakerColor = (speakerId: string) => {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800',
      'bg-purple-100 text-purple-800',
      'bg-orange-100 text-orange-800',
      'bg-pink-100 text-pink-800',
      'bg-indigo-100 text-indigo-800'
    ];
    const hash = speakerId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'border-l-green-400';
      case 'negative': return 'border-l-red-400';
      case 'neutral': return 'border-l-gray-400';
      default: return 'border-l-gray-300';
    }
  };

  return (
    <div
      style={style}
      className={`transcript-item flex gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer border-l-4 ${getSentimentColor(segment.sentiment)}`}
      onClick={() => onSegmentClick?.(segment)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Speaker Avatar & Info */}
      {showSpeakers && (
        <div className="flex-shrink-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${getSpeakerColor(segment.speakerId)}`}>
            {segment.speaker.charAt(0).toUpperCase()}
          </div>
          {showTimestamps && (
            <div className="text-xs text-gray-500 text-center mt-1">
              {formatTimestamp(segment.timestamp)}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {showSpeakers && (
              <span className="text-sm font-medium text-gray-900">
                {segment.speaker}
              </span>
            )}
            {showTimestamps && !showSpeakers && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock size={12} />
                {formatTimestamp(segment.timestamp)}
              </span>
            )}
            {showConfidence && (
              <span className={`text-xs px-2 py-1 rounded ${
                segment.confidence > 0.9 ? 'bg-green-100 text-green-800' :
                segment.confidence > 0.7 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {Math.round(segment.confidence * 100)}%
              </span>
            )}
            {segment.isEdited && (
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                Edited
              </span>
            )}
          </div>

          {/* Actions */}
          {isHovered && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(segment.text);
                }}
                className="p-1 hover:bg-gray-200 rounded"
                title="Copy text"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBookmark?.(segment.id);
                }}
                className="p-1 hover:bg-gray-200 rounded"
                title="Bookmark"
              >
                <Bookmark size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
                className="p-1 hover:bg-gray-200 rounded"
                title="Edit"
              >
                <MessageSquare size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Text Content */}
        <div className="transcript-text">
          {isEditing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyPress}
              onBlur={handleEdit}
              className="w-full p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={Math.max(2, Math.ceil(editText.length / 80))}
              autoFocus
            />
          ) : (
            <p className="text-gray-900 leading-relaxed">
              {highlightText(segment.text, searchQuery)}
            </p>
          )}
        </div>

        {/* Tags */}
        {segment.tags && segment.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {segment.tags.map((tag, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Duration & Confidence Footer */}
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>{segment.duration}s</span>
          {segment.sentiment && (
            <span className={`capitalize ${
              segment.sentiment === 'positive' ? 'text-green-600' :
              segment.sentiment === 'negative' ? 'text-red-600' :
              'text-gray-600'
            }`}>
              {segment.sentiment}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}, areEqual);

TranscriptItem.displayName = 'TranscriptItem';

export const VirtualizedTranscript: React.FC<VirtualizedTranscriptProps> = ({
  segments,
  isLive = false,
  autoScroll = false,
  searchQuery,
  onSegmentClick,
  onSegmentEdit,
  onBookmark,
  className = '',
  showTimestamps = true,
  showSpeakers = true,
  showConfidence = false,
  itemHeight = 120,
  bufferSize = 5,
  enableVirtualization = true
}) => {
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [filteredSegments, setFilteredSegments] = useState(segments);

  // Filter segments based on search query
  const searchResults = useMemo(() => {
    if (!searchQuery) return segments;
    
    return segments.filter(segment =>
      segment.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      segment.speaker.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [segments, searchQuery]);

  // Update filtered segments
  useEffect(() => {
    setFilteredSegments(searchQuery ? searchResults : segments);
    setSearchIndex(-1);
  }, [segments, searchResults, searchQuery]);

  // Auto-scroll to bottom for live transcripts
  useEffect(() => {
    if (isLive && autoScroll && isScrolledToBottom && listRef.current) {
      listRef.current.scrollToItem(filteredSegments.length - 1, 'end');
    }
  }, [filteredSegments.length, isLive, autoScroll, isScrolledToBottom]);

  // Handle scroll to detect if user is at bottom
  const handleScroll = useCallback(({ scrollOffset }: any) => {
    if (!containerRef.current) return;
    
    const { scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollOffset - clientHeight < itemHeight;
    setIsScrolledToBottom(isAtBottom);
  }, [itemHeight]);

  // Scroll to specific segment
  const scrollToSegment = useCallback((segmentId: string) => {
    const index = filteredSegments.findIndex(s => s.id === segmentId);
    if (index !== -1 && listRef.current) {
      listRef.current.scrollToItem(index, 'center');
    }
  }, [filteredSegments]);

  // Search navigation
  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    if (!searchQuery || searchResults.length === 0) return;
    
    let newIndex = searchIndex;
    if (direction === 'next') {
      newIndex = (searchIndex + 1) % searchResults.length;
    } else {
      newIndex = searchIndex <= 0 ? searchResults.length - 1 : searchIndex - 1;
    }
    
    setSearchIndex(newIndex);
    const segmentId = searchResults[newIndex].id;
    scrollToSegment(segmentId);
  }, [searchQuery, searchResults, searchIndex, scrollToSegment]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault();
        navigateSearch('next');
      } else if (e.key === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault();
        navigateSearch('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateSearch]);

  // Scroll to bottom button
  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(filteredSegments.length - 1, 'end');
      setIsScrolledToBottom(true);
    }
  }, [filteredSegments.length]);

  // Item data for react-window
  const itemData = useMemo(() => ({
    segments: filteredSegments,
    searchQuery,
    onSegmentClick,
    onSegmentEdit,
    onBookmark,
    showTimestamps,
    showSpeakers,
    showConfidence
  }), [
    filteredSegments,
    searchQuery,
    onSegmentClick,
    onSegmentEdit,
    onBookmark,
    showTimestamps,
    showSpeakers,
    showConfidence
  ]);

  // Performance stats
  const stats = useMemo(() => ({
    totalSegments: segments.length,
    filteredSegments: filteredSegments.length,
    searchResults: searchResults.length,
    averageSegmentLength: segments.length > 0 
      ? Math.round(segments.reduce((sum, s) => sum + s.text.length, 0) / segments.length)
      : 0
  }), [segments, filteredSegments, searchResults]);

  if (!enableVirtualization || filteredSegments.length < 100) {
    // Render normally for small lists
    return (
      <div className={`transcript-container ${className}`} ref={containerRef}>
        <div className="transcript-stats p-2 bg-gray-50 border-b text-xs text-gray-600">
          {stats.totalSegments} segments • {stats.averageSegmentLength} avg chars
          {searchQuery && ` • ${stats.searchResults} matches`}
        </div>
        
        <div className="transcript-list">
          {filteredSegments.map((segment, index) => (
            <TranscriptItem
              key={segment.id}
              index={index}
              style={{}}
              data={itemData}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`transcript-container relative ${className}`} ref={containerRef}>
      {/* Stats Bar */}
      <div className="transcript-stats flex justify-between items-center p-2 bg-gray-50 border-b text-xs text-gray-600">
        <div>
          {stats.totalSegments} segments • {stats.averageSegmentLength} avg chars
          {searchQuery && ` • ${stats.searchResults} matches`}
        </div>
        
        {searchQuery && searchResults.length > 0 && (
          <div className="flex items-center gap-2">
            <span>{searchIndex + 1} of {searchResults.length}</span>
            <button
              onClick={() => navigateSearch('prev')}
              className="p-1 hover:bg-gray-200 rounded"
              disabled={searchResults.length === 0}
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => navigateSearch('next')}
              className="p-1 hover:bg-gray-200 rounded"
              disabled={searchResults.length === 0}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Virtual List */}
      <List
        ref={listRef}
        height={600} // This should be dynamic based on container
        itemCount={filteredSegments.length}
        itemSize={itemHeight}
        itemData={itemData}
        onScroll={handleScroll}
        overscanCount={bufferSize}
        className="transcript-virtual-list"
      >
        {TranscriptItem}
      </List>

      {/* Scroll to bottom button */}
      {!isScrolledToBottom && isLive && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors z-10"
          title="Scroll to bottom"
        >
          <ChevronDown size={20} />
          {filteredSegments.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
              !
            </span>
          )}
        </button>
      )}

      {/* Loading indicator for live transcripts */}
      {isLive && (
        <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Live
        </div>
      )}
    </div>
  );
};