// Lazy Loading Meeting History Component
// Efficient pagination and loading for large meeting datasets

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Calendar, 
  Clock, 
  Users, 
  FileText, 
  Search, 
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MoreHorizontal,
  Eye,
  Download,
  Trash2,
  Star,
  StarOff,
  PlayCircle,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  participants: Participant[];
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  recordingUrl?: string;
  transcriptUrl?: string;
  summaryUrl?: string;
  tags: string[];
  isStarred: boolean;
  createdBy: string;
  lastModified: string;
  size: number; // bytes
  hasAI: boolean;
}

interface Participant {
  id: string;
  name: string;
  email: string;
  role: 'host' | 'presenter' | 'attendee';
  avatar?: string;
  joinedAt?: string;
  leftAt?: string;
}

interface LazyMeetingHistoryProps {
  onMeetingSelect?: (meeting: Meeting) => void;
  onMeetingAction?: (action: string, meeting: Meeting) => void;
  pageSize?: number;
  searchQuery?: string;
  dateRange?: { start: string; end: string };
  statusFilter?: string[];
  sortBy?: 'date' | 'title' | 'duration' | 'participants';
  sortOrder?: 'asc' | 'desc';
  enableInfiniteScroll?: boolean;
  showPreview?: boolean;
  className?: string;
}

interface LoadingState {
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error?: string;
}

// Mock API service
class MeetingHistoryService {
  private static cache = new Map<string, any>();
  private static totalMeetings = 2500; // Simulate large dataset

  static async fetchMeetings(params: {
    page: number;
    pageSize: number;
    search?: string;
    dateRange?: { start: string; end: string };
    statusFilter?: string[];
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ meetings: Meeting[]; totalCount: number; hasMore: boolean }> {
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
    
    const cacheKey = JSON.stringify(params);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Generate mock meetings
    const meetings: Meeting[] = [];
    const startIndex = (params.page - 1) * params.pageSize;
    
    for (let i = 0; i < params.pageSize; i++) {
      const meetingIndex = startIndex + i;
      if (meetingIndex >= this.totalMeetings) break;
      
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - Math.floor(Math.random() * 365));
      startTime.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
      
      const duration = 15 + Math.floor(Math.random() * 120); // 15-135 minutes
      const endTime = new Date(startTime.getTime() + duration * 60000);
      
      const participantCount = 2 + Math.floor(Math.random() * 8);
      const participants: Participant[] = [];
      
      for (let p = 0; p < participantCount; p++) {
        participants.push({
          id: `user_${meetingIndex}_${p}`,
          name: `User ${meetingIndex}-${p}`,
          email: `user${meetingIndex}${p}@example.com`,
          role: p === 0 ? 'host' : (p === 1 ? 'presenter' : 'attendee'),
          joinedAt: startTime.toISOString(),
          leftAt: endTime.toISOString()
        });
      }
      
      const meeting: Meeting = {
        id: `meeting_${meetingIndex}`,
        title: `Meeting ${meetingIndex + 1} - ${['Weekly Sync', 'Project Review', 'Team Standup', 'Client Call', 'Strategy Session'][Math.floor(Math.random() * 5)]}`,
        description: `This is a detailed description for meeting ${meetingIndex + 1}. It covers various topics and agenda items.`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        participants,
        status: Math.random() > 0.1 ? 'completed' : (Math.random() > 0.5 ? 'ongoing' : 'scheduled'),
        recordingUrl: Math.random() > 0.3 ? `recording_${meetingIndex}.mp4` : undefined,
        transcriptUrl: Math.random() > 0.2 ? `transcript_${meetingIndex}.txt` : undefined,
        summaryUrl: Math.random() > 0.4 ? `summary_${meetingIndex}.pdf` : undefined,
        tags: ['important', 'weekly', 'project-x', 'team-alpha'].slice(0, Math.floor(Math.random() * 3) + 1),
        isStarred: Math.random() > 0.8,
        createdBy: participants[0].id,
        lastModified: new Date(startTime.getTime() + Math.random() * 86400000).toISOString(),
        size: Math.floor(Math.random() * 500000000), // Up to 500MB
        hasAI: Math.random() > 0.3
      };
      
      meetings.push(meeting);
    }
    
    // Apply filters
    let filteredMeetings = meetings;
    
    if (params.search) {
      const query = params.search.toLowerCase();
      filteredMeetings = filteredMeetings.filter(m => 
        m.title.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query) ||
        m.participants.some(p => p.name.toLowerCase().includes(query))
      );
    }
    
    if (params.statusFilter && params.statusFilter.length > 0) {
      filteredMeetings = filteredMeetings.filter(m => params.statusFilter!.includes(m.status));
    }
    
    // Sort
    if (params.sortBy) {
      filteredMeetings.sort((a, b) => {
        let aValue: any, bValue: any;
        
        switch (params.sortBy) {
          case 'date':
            aValue = new Date(a.startTime).getTime();
            bValue = new Date(b.startTime).getTime();
            break;
          case 'title':
            aValue = a.title.toLowerCase();
            bValue = b.title.toLowerCase();
            break;
          case 'duration':
            aValue = a.duration;
            bValue = b.duration;
            break;
          case 'participants':
            aValue = a.participants.length;
            bValue = b.participants.length;
            break;
          default:
            return 0;
        }
        
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return params.sortOrder === 'desc' ? -comparison : comparison;
      });
    }
    
    const result = {
      meetings: filteredMeetings,
      totalCount: this.totalMeetings,
      hasMore: startIndex + params.pageSize < this.totalMeetings
    };
    
    this.cache.set(cacheKey, result);
    return result;
  }
  
  static clearCache() {
    this.cache.clear();
  }
}

export const LazyMeetingHistory: React.FC<LazyMeetingHistoryProps> = ({
  onMeetingSelect,
  onMeetingAction,
  pageSize = 20,
  searchQuery = '',
  dateRange,
  statusFilter = [],
  sortBy = 'date',
  sortOrder = 'desc',
  enableInfiniteScroll = true,
  showPreview = true,
  className = ''
}) => {
  // State
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState<LoadingState>({
    isLoading: true,
    isLoadingMore: false,
    hasMore: true
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Refs
  const observerRef = useRef<IntersectionObserver>();
  const lastMeetingElementRef = useRef<HTMLDivElement>(null);

  // Memoized fetch parameters
  const fetchParams = useMemo(() => ({
    search: searchQuery,
    dateRange,
    statusFilter,
    sortBy,
    sortOrder,
    pageSize
  }), [searchQuery, dateRange, statusFilter, sortBy, sortOrder, pageSize]);

  // Load meetings function
  const loadMeetings = useCallback(async (page: number, append = false) => {
    try {
      setLoading(prev => ({
        ...prev,
        isLoading: !append,
        isLoadingMore: append,
        error: undefined
      }));

      const result = await MeetingHistoryService.fetchMeetings({
        page,
        ...fetchParams
      });

      setMeetings(prev => append ? [...prev, ...result.meetings] : result.meetings);
      setTotalCount(result.totalCount);
      setLoading(prev => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false,
        hasMore: result.hasMore
      }));
      setRetryCount(0);

    } catch (error) {
      console.error('Failed to load meetings:', error);
      setLoading(prev => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false,
        error: 'Failed to load meetings. Please try again.'
      }));
    }
  }, [fetchParams]);

  // Load initial data
  useEffect(() => {
    setCurrentPage(1);
    setMeetings([]);
    MeetingHistoryService.clearCache(); // Clear cache when filters change
    loadMeetings(1, false);
  }, [loadMeetings]);

  // Load more data
  const loadMore = useCallback(() => {
    if (loading.isLoadingMore || !loading.hasMore) return;
    
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    loadMeetings(nextPage, true);
  }, [currentPage, loading.isLoadingMore, loading.hasMore, loadMeetings]);

  // Intersection observer for infinite scroll
  const lastMeetingRef = useCallback((node: HTMLDivElement) => {
    if (loading.isLoadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && loading.hasMore && enableInfiniteScroll) {
        loadMore();
      }
    }, {
      rootMargin: '100px' // Load more when 100px away from bottom
    });
    
    if (node) observerRef.current.observe(node);
  }, [loading.isLoadingMore, loading.hasMore, enableInfiniteScroll, loadMore]);

  // Retry function
  const retry = useCallback(() => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      loadMeetings(currentPage, false);
    }
  }, [retryCount, currentPage, loadMeetings]);

  // Meeting actions
  const handleMeetingAction = useCallback((action: string, meeting: Meeting) => {
    switch (action) {
      case 'star':
        setMeetings(prev => prev.map(m => 
          m.id === meeting.id ? { ...m, isStarred: !m.isStarred } : m
        ));
        break;
      case 'select':
        setSelectedMeeting(meeting);
        onMeetingSelect?.(meeting);
        break;
      default:
        onMeetingAction?.(action, meeting);
    }
  }, [onMeetingSelect, onMeetingAction]);

  // Format functions
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'ongoing': return 'bg-blue-100 text-blue-800';
      case 'scheduled': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Render meeting card
  const renderMeetingCard = (meeting: Meeting, index: number) => {
    const isLast = index === meetings.length - 1;
    
    return (
      <div
        key={meeting.id}
        ref={isLast ? lastMeetingRef : undefined}
        className={`meeting-card p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer ${
          selectedMeeting?.id === meeting.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white'
        }`}
        onClick={() => handleMeetingAction('select', meeting)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {meeting.title}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMeetingAction('star', meeting);
                }}
                className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
              >
                {meeting.isStarred ? (
                  <Star size={16} className="text-yellow-500 fill-current" />
                ) : (
                  <StarOff size={16} className="text-gray-400" />
                )}
              </button>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {formatDate(meeting.startTime)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {formatDuration(meeting.duration)}
              </span>
              <span className="flex items-center gap-1">
                <Users size={14} />
                {meeting.participants.length}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(meeting.status)}`}>
              {meeting.status}
            </span>
            
            <div className="relative">
              <button className="p-1 hover:bg-gray-100 rounded">
                <MoreHorizontal size={16} />
              </button>
              {/* Action menu would go here */}
            </div>
          </div>
        </div>

        {/* Description */}
        {meeting.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {meeting.description}
          </p>
        )}

        {/* Features & Tags */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {meeting.recordingUrl && (
              <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                <PlayCircle size={12} />
                Recording
              </span>
            )}
            {meeting.transcriptUrl && (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                <FileText size={12} />
                Transcript
              </span>
            )}
            {meeting.hasAI && (
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                AI
              </span>
            )}
          </div>
          
          <div className="text-xs text-gray-500">
            {formatFileSize(meeting.size)}
          </div>
        </div>

        {/* Tags */}
        {meeting.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {meeting.tags.map((tag, i) => (
              <span
                key={i}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Participants Preview */}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            {meeting.participants.slice(0, 4).map((participant, i) => (
              <div
                key={i}
                className="w-8 h-8 bg-gray-300 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-gray-700"
                title={participant.name}
              >
                {participant.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {meeting.participants.length > 4 && (
              <div className="w-8 h-8 bg-gray-100 rounded-full border-2 border-white flex items-center justify-center text-xs text-gray-500">
                +{meeting.participants.length - 4}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMeetingAction('view', meeting);
              }}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="View Details"
            >
              <Eye size={16} />
            </button>
            {meeting.recordingUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMeetingAction('download', meeting);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="Download Recording"
              >
                <Download size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`meeting-history ${className}`}>
      {/* Header with stats */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Meeting History</h2>
          <span className="text-sm text-gray-600">
            {totalCount.toLocaleString()} meetings
          </span>
          {meetings.length > 0 && (
            <span className="text-sm text-gray-500">
              Showing {meetings.length} of {totalCount.toLocaleString()}
            </span>
          )}
        </div>
        
        <button
          onClick={() => loadMeetings(1, false)}
          disabled={loading.isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading.isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Loading state */}
        {loading.isLoading && meetings.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading meetings...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {loading.error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle size={48} className="text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load meetings</h3>
            <p className="text-gray-600 mb-4">{loading.error}</p>
            <button
              onClick={retry}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Try Again {retryCount > 0 && `(${retryCount}/3)`}
            </button>
          </div>
        )}

        {/* Meetings grid */}
        {!loading.isLoading && !loading.error && (
          <>
            {meetings.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {meetings.map((meeting, index) => renderMeetingCard(meeting, index))}
                </div>

                {/* Load more indicator */}
                {loading.isLoadingMore && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-gray-600">
                      <Loader2 size={20} className="animate-spin" />
                      <span>Loading more meetings...</span>
                    </div>
                  </div>
                )}

                {/* Load more button (for non-infinite scroll) */}
                {!enableInfiniteScroll && loading.hasMore && !loading.isLoadingMore && (
                  <div className="flex justify-center py-8">
                    <button
                      onClick={loadMore}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Load More Meetings
                    </button>
                  </div>
                )}

                {/* End indicator */}
                {!loading.hasMore && meetings.length > 0 && (
                  <div className="flex items-center justify-center py-8 text-gray-500">
                    <CheckCircle size={20} className="mr-2" />
                    <span>All meetings loaded ({meetings.length} total)</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar size={48} className="text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No meetings found</h3>
                <p className="text-gray-600">
                  {searchQuery ? 'Try adjusting your search criteria' : 'Start by scheduling your first meeting'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};