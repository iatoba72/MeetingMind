// Meeting Filters Component
// Search and filter controls for the meeting dashboard

import React, { useState, useEffect } from 'react';

interface MeetingFilters {
  status?: string;
  created_by?: string;
  organization_id?: string;
  search?: string;
}

interface MeetingFiltersProps {
  filters: MeetingFilters;
  onFiltersChange: (filters: MeetingFilters) => void;
  sortBy: string;
  onSortByChange: (sortBy: string) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
}

export const MeetingFilters: React.FC<MeetingFiltersProps> = ({
  filters,
  onFiltersChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange
}) => {
  const [localFilters, setLocalFilters] = useState<MeetingFilters>(filters);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Handle filter changes with debouncing for search
  const handleFilterChange = (key: keyof MeetingFilters, value: string) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    
    if (key === 'search') {
      // Debounce search input
      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }
      
      const timeout = setTimeout(() => {
        onFiltersChange(newFilters);
      }, 300); // 300ms debounce
      
      setSearchDebounce(timeout);
    } else {
      // Apply other filters immediately
      onFiltersChange(newFilters);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    const emptyFilters: MeetingFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(localFilters).some(value => value && value.trim() !== '');

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }
    };
  }, [searchDebounce]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Filters & Search</h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* Search and Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Search */}
        <div className="lg:col-span-2">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              id="search"
              value={localFilters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search meetings..."
            />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="status"
            value={localFilters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="not_started">⏳ Not Started</option>
            <option value="active">🟢 Active</option>
            <option value="paused">⏸️ Paused</option>
            <option value="ended">✅ Ended</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
        </div>

        {/* Quick Filters */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quick Filters
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFilterChange('status', 'active')}
              className={`px-3 py-1 text-xs rounded-full border ${
                localFilters.status === 'active'
                  ? 'bg-green-100 border-green-300 text-green-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              🟢 Active
            </button>
            <button
              onClick={() => handleFilterChange('status', 'not_started')}
              className={`px-3 py-1 text-xs rounded-full border ${
                localFilters.status === 'not_started'
                  ? 'bg-gray-100 border-gray-300 text-gray-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              ⏳ Upcoming
            </button>
          </div>
        </div>
      </div>

      {/* Sorting Row */}
      <div className="flex items-center space-x-4 pt-4 border-t border-gray-200">
        <div className="flex items-center space-x-2">
          <label htmlFor="sortBy" className="text-sm font-medium text-gray-700">
            Sort by:
          </label>
          <select
            id="sortBy"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="created_at">Created Date</option>
            <option value="scheduled_start">Start Time</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
            <option value="participant_count">Participants</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">
            Order:
          </label>
          <div className="flex rounded-md border border-gray-300 overflow-hidden">
            <button
              onClick={() => onSortOrderChange('desc')}
              className={`px-3 py-1 text-sm ${
                sortOrder === 'desc'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              ↓ Desc
            </button>
            <button
              onClick={() => onSortOrderChange('asc')}
              className={`px-3 py-1 text-sm border-l border-gray-300 ${
                sortOrder === 'asc'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              ↑ Asc
            </button>
          </div>
        </div>

        {/* Filter indicators */}
        <div className="flex-1 flex items-center justify-end space-x-2">
          {hasActiveFilters && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Active filters:</span>
              <div className="flex space-x-1">
                {localFilters.search && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    Search: "{localFilters.search}"
                  </span>
                )}
                {localFilters.status && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    Status: {localFilters.status.replace('_', ' ')}
                  </span>
                )}
                {localFilters.created_by && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    Creator: {localFilters.created_by}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Filter Options (Collapsible) */}
      <details className="pt-2">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
          Advanced Filters
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="created_by" className="block text-sm font-medium text-gray-700 mb-1">
              Created By
            </label>
            <input
              type="text"
              id="created_by"
              value={localFilters.created_by || ''}
              onChange={(e) => handleFilterChange('created_by', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Filter by creator..."
            />
          </div>

          <div>
            <label htmlFor="organization_id" className="block text-sm font-medium text-gray-700 mb-1">
              Organization
            </label>
            <input
              type="text"
              id="organization_id"
              value={localFilters.organization_id || ''}
              onChange={(e) => handleFilterChange('organization_id', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Filter by organization..."
            />
          </div>
        </div>
      </details>
    </div>
  );
};