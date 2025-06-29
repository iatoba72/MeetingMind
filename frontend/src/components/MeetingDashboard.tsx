// Meeting Dashboard Component
// Comprehensive meeting management interface with create, list, and delete operations
// Integrates with FastAPI backend for real-time meeting data management

import React, { useState, useEffect } from 'react';
import { CreateMeetingModal } from './CreateMeetingModal';
import { MeetingCard } from './MeetingCard';
import { MeetingFilters } from './MeetingFilters';
import { MeetingStatistics } from './MeetingStatistics';

// TypeScript interfaces for type safety
interface Meeting {
  id: string;
  title: string;
  description: string;
  meeting_number: string;
  status: 'not_started' | 'active' | 'paused' | 'ended' | 'cancelled';
  scheduled_start: string;
  scheduled_end: string;
  participant_count: number;
  created_by: string;
  created_at: string;
}

interface MeetingFilters {
  status?: string;
  created_by?: string;
  organization_id?: string;
  search?: string;
}

interface PaginationInfo {
  total_count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  has_next: boolean;
  has_prev: boolean;
}

interface MeetingDashboardProps {
  clientId: string;
}

export const MeetingDashboard: React.FC<MeetingDashboardProps> = ({ clientId }) => {
  // State management for meetings and UI
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [, setSelectedMeeting] = useState<Meeting | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  
  // Filter and pagination state
  const [filters, setFilters] = useState<MeetingFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch meetings from the backend
  const fetchMeetings = async (page = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      // Build query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: sortBy,
        sort_order: sortOrder
      });

      // Add filters if they exist
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          params.append(key, value);
        }
      });

      const response = await fetch(`http://localhost:8000/meetings?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch meetings: ${response.statusText}`);
      }

      const data = await response.json();
      setMeetings(data.meetings);
      setPagination(data.pagination);
      setCurrentPage(page);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch meetings');
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Create a new meeting
  const createMeeting = async (meetingData: { title: string; description: string; scheduled_start: string; scheduled_end: string; [key: string]: unknown }) => {
    const response = await fetch('http://localhost:8000/meetings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...meetingData,
        created_by: clientId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to create meeting');
    }

    const newMeeting = await response.json();
    
    // Refresh the meetings list
    await fetchMeetings(currentPage);
    
    // Close the modal
    setShowCreateModal(false);
    
    return newMeeting;
  };

  // Delete a meeting
  const deleteMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/meetings/${meetingId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete meeting');
      }

      // Refresh the meetings list
      await fetchMeetings(currentPage);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meeting');
      console.error('Error deleting meeting:', err);
    }
  };

  // Update meeting status
  const updateMeetingStatus = async (meetingId: string, newStatus: string) => {
    try {
      const response = await fetch(`http://localhost:8000/meetings/${meetingId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update meeting status');
      }

      // Refresh the meetings list
      await fetchMeetings(currentPage);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update meeting status');
      console.error('Error updating meeting status:', err);
    }
  };

  // Apply filters and refresh data
  const applyFilters = (newFilters: MeetingFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filtering
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    fetchMeetings(page);
  };

  // Load meetings on component mount and when dependencies change
  useEffect(() => {
    fetchMeetings(currentPage);
  }, [filters, sortBy, sortOrder, pageSize, currentPage, fetchMeetings]);

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Meeting Dashboard</h2>
          <p className="text-gray-600">Manage your meetings and track their progress</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2"
        >
          <span>📅</span>
          <span>Create Meeting</span>
        </button>
      </div>

      {/* Meeting Statistics */}
      <MeetingStatistics 
        totalMeetings={pagination?.total_count || 0}
        meetings={meetings}
      />

      {/* Filters and Search */}
      <MeetingFilters
        filters={filters}
        onFiltersChange={applyFilters}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
      />

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex">
            <span className="text-red-500 mr-2">⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading meetings...</span>
        </div>
      )}

      {/* Meetings List */}
      {!loading && meetings.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="text-gray-400 text-6xl mb-4">📅</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No meetings found</h3>
          <p className="text-gray-600 mb-4">
            {Object.keys(filters).some(key => filters[key as keyof MeetingFilters])
              ? 'Try adjusting your filters or create a new meeting.'
              : 'Get started by creating your first meeting.'
            }
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Create Your First Meeting
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onDelete={deleteMeeting}
              onStatusUpdate={updateMeetingStatus}
              onSelect={setSelectedMeeting}
              showControls={true}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 border-t border-gray-200 rounded-lg">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!pagination.has_prev}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!pagination.has_next}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * pageSize, pagination.total_count)}
                </span>{' '}
                of{' '}
                <span className="font-medium">{pagination.total_count}</span> results
              </p>
            </div>
            
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.has_prev}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const pageNum = Math.max(1, currentPage - 2) + i;
                  if (pageNum > pagination.total_pages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        pageNum === currentPage
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.has_next}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <CreateMeetingModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createMeeting}
        />
      )}
    </div>
  );
};