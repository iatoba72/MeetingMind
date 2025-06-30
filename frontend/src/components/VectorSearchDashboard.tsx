// Vector Search Dashboard
// Comprehensive interface for semantic search and vector exploration

import React, { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  CubeIcon,
  Square3Stack3DIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  SparklesIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { KnowledgeGraphVisualization } from './KnowledgeGraphVisualization';
import { VectorExplorer } from './VectorExplorer';
import { vectorSearchService, type EnhancedSearchResult, type EmbeddingStatistics } from '../services/vectorSearchService';

interface SearchFilters {
  documentTypes: string[];
  meetingIds: string[];
  dateRange: [string, string] | null;
  speakers: string[];
  confidenceThreshold: number;
  similarityThreshold: number;
}

interface VectorSearchDashboardProps {
  meetingId?: string;
  onResultSelect?: (result: EnhancedSearchResult) => void;
  initialQuery?: string;
  height?: number;
}

export const VectorSearchDashboard: React.FC<VectorSearchDashboardProps> = ({
  meetingId,
  onResultSelect,
  initialQuery = '',
  height = 800
}) => {
  const [currentView, setCurrentView] = useState<'search' | 'explorer' | 'graph' | 'analytics'>('search');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<EnhancedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<EnhancedSearchResult | null>(null);
  const [statistics, setStatistics] = useState<EmbeddingStatistics | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const [filters, setFilters] = useState<SearchFilters>({
    documentTypes: ['transcript_segment', 'meeting_summary', 'insight'],
    meetingIds: meetingId ? [meetingId] : [],
    dateRange: null,
    speakers: [],
    confidenceThreshold: 0.6,
    similarityThreshold: 0.3
  });

  // Load initial data
  useEffect(() => {
    loadStatistics();
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [loadStatistics, performSearch, initialQuery]);

  // Load embedding statistics
  const loadStatistics = useCallback(async () => {
    try {
      const stats = await vectorSearchService.getEmbeddingStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }, []);

  // Perform semantic search
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await vectorSearchService.advancedSearch(
        query,
        {
          meetingId: filters.meetingIds[0],
          documentTypes: filters.documentTypes,
          timeRange: filters.dateRange,
          speakerFilter: filters.speakers[0]
        },
        20
      );

      setSearchResults(results.results);
      
      // Update suggestions based on search
      if (results.suggestions) {
        setSearchSuggestions(results.suggestions.map(s => s.suggestion));
      }

    } catch (error) {
      setSearchError('Search failed. Please try again.');
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [filters]);

  // Handle search input changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    
    // Debounced search
    const timeoutId = setTimeout(() => {
      if (value.trim()) {
        performSearch(value);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [performSearch]);

  // Handle result selection
  const handleResultSelect = useCallback((result: EnhancedSearchResult) => {
    setSelectedResult(result);
    onResultSelect?.(result);
  }, [onResultSelect]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <MagnifyingGlassIcon className="w-7 h-7 mr-3" />
            Vector Search & Exploration
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Semantic search, knowledge graphs, and embedding space exploration
            {statistics && (
              <span className="ml-2 text-blue-600">
                • {statistics.totalDocuments.toLocaleString()} documents indexed
              </span>
            )}
          </p>
        </div>

        {/* Quick Stats */}
        {statistics && (
          <div className="flex items-center space-x-6 text-sm">
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{statistics.totalDocuments.toLocaleString()}</div>
              <div className="text-gray-500">Documents</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">{statistics.embeddingDimension}</div>
              <div className="text-gray-500">Dimensions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-purple-600">{(statistics.cacheHitRate * 100).toFixed(0)}%</div>
              <div className="text-gray-500">Cache Hit</div>
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Main Search Input */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for insights, topics, action items, or any content..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`
              px-4 py-3 rounded-lg border transition-colors flex items-center
              ${showAdvancedFilters 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            <Cog6ToothIcon className="w-5 h-5 mr-2" />
            Filters
          </button>
        </div>

        {/* Search Suggestions */}
        {searchSuggestions.length > 0 && !searchQuery && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Suggested searches:</p>
            <div className="flex flex-wrap gap-2">
              {searchSuggestions.slice(0, 5).map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSearchQuery(suggestion);
                    performSearch(suggestion);
                  }}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Document Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Document Types</label>
                <div className="space-y-1">
                  {[
                    { value: 'transcript_segment', label: 'Transcripts' },
                    { value: 'meeting_summary', label: 'Summaries' },
                    { value: 'insight', label: 'Insights' },
                    { value: 'action_item', label: 'Action Items' }
                  ].map(type => (
                    <label key={type.value} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.documentTypes.includes(type.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilters(prev => ({
                              ...prev,
                              documentTypes: [...prev.documentTypes, type.value]
                            }));
                          } else {
                            setFilters(prev => ({
                              ...prev,
                              documentTypes: prev.documentTypes.filter(t => t !== type.value)
                            }));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Confidence Threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Confidence: {(filters.confidenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={filters.confidenceThreshold}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    confidenceThreshold: parseFloat(e.target.value)
                  }))}
                  className="w-full"
                />
              </div>

              {/* Similarity Threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Similarity: {(filters.similarityThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={filters.similarityThreshold}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    similarityThreshold: parseFloat(e.target.value)
                  }))}
                  className="w-full"
                />
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <button
                  onClick={() => setFilters({
                    documentTypes: ['transcript_segment', 'meeting_summary', 'insight'],
                    meetingIds: meetingId ? [meetingId] : [],
                    dateRange: null,
                    speakers: [],
                    confidenceThreshold: 0.6,
                    similarityThreshold: 0.3
                  })}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* View Selector */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {[
          { id: 'search', label: 'Search Results', icon: MagnifyingGlassIcon, count: searchResults.length },
          { id: 'explorer', label: 'Vector Explorer', icon: CubeIcon },
          { id: 'graph', label: 'Knowledge Graph', icon: Square3Stack3DIcon },
          { id: 'analytics', label: 'Analytics', icon: ChartBarIcon }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCurrentView(tab.id as any)}
            className={`
              flex-1 py-3 px-4 text-center border-b-2 transition-colors
              ${currentView === tab.id 
                ? 'border-blue-500 text-blue-600 bg-blue-50' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex items-center justify-center space-x-2">
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ minHeight: height - 200 }}>
        {currentView === 'search' && (
          <div className="space-y-4">
            {searchError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{searchError}</p>
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !isSearching && (
              <div className="text-center py-12">
                <MagnifyingGlassIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
                <p className="text-gray-600 mb-4">
                  Try adjusting your search query or filters
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Clear search
                </button>
              </div>
            )}

            {searchResults.length === 0 && !searchQuery && (
              <div className="text-center py-12">
                <SparklesIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Semantic Search</h3>
                <p className="text-gray-600">
                  Enter a search query to find semantically similar content across meetings
                </p>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    {searchResults.length} Results for "{searchQuery}"
                  </h3>
                  <div className="text-sm text-gray-500">
                    Powered by semantic similarity
                  </div>
                </div>

                <div className="space-y-3">
                  {searchResults.map((result, index) => (
                    <div
                      key={result.baseResult.document.id}
                      className={`
                        p-4 border rounded-lg transition-all cursor-pointer
                        ${selectedResult?.baseResult.document.id === result.baseResult.document.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                        }
                      `}
                      onClick={() => handleResultSelect(result)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <DocumentTextIcon className="w-5 h-5 text-gray-400" />
                          <span className="font-medium text-gray-900 capitalize">
                            {result.baseResult.document.documentType.replace('_', ' ')}
                          </span>
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            {(result.baseResult.similarityScore * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">#{index + 1}</span>
                      </div>

                      <p className="text-sm text-gray-700 mb-2 line-clamp-3">
                        {result.snippet}
                      </p>

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center space-x-4">
                          {result.meetingContext.meetingId && (
                            <span>Meeting: {result.meetingContext.meetingId.slice(-8)}</span>
                          )}
                          {result.baseResult.document.metadata.speaker && (
                            <span>Speaker: {result.baseResult.document.metadata.speaker}</span>
                          )}
                          {result.baseResult.document.metadata.timestamp && (
                            <span>
                              {new Date(result.baseResult.document.metadata.timestamp).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span>Confidence: {(result.contextScore * 100).toFixed(0)}%</span>
                      </div>

                      {result.relevanceExplanation && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-600">{result.relevanceExplanation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'explorer' && (
          <VectorExplorer
            meetingIds={filters.meetingIds}
            searchQuery={searchQuery}
            onPointSelect={() => {
              // Vector point selected
            }}
            onSimilaritySearch={() => {
              // Similarity search performed
            }}
            height={height - 100}
            width={1200}
            enableInteraction={true}
            showControls={true}
          />
        )}

        {currentView === 'graph' && (
          <KnowledgeGraphVisualization
            meetingIds={filters.meetingIds}
            selectedNode={selectedResult?.baseResult.document.id}
            onNodeSelect={() => {
              // Graph node selected
            }}
            onEdgeSelect={() => {
              // Graph edge selected
            }}
            onClusterSelect={() => {
              // Graph cluster selected
            }}
            height={height - 100}
            width={1200}
            enableInteraction={true}
            showControls={true}
          />
        )}

        {currentView === 'analytics' && statistics && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Vector Search Analytics</h3>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {statistics.totalDocuments.toLocaleString()}
                  </div>
                  <div className="text-gray-600">Total Documents</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Across {Object.keys(statistics.documentsByType).length} types
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {statistics.embeddingDimension}
                  </div>
                  <div className="text-gray-600">Embedding Dimensions</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Model: {statistics.embeddingModel.split('/').pop()}
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {statistics.totalSearches.toLocaleString()}
                  </div>
                  <div className="text-gray-600">Total Searches</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Avg: {statistics.avgEmbeddingTime.toFixed(2)}ms
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {(statistics.cacheHitRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-gray-600">Cache Hit Rate</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {statistics.cacheSize} cached items
                  </div>
                </div>
              </div>
            </div>

            {/* Document Distribution */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h4 className="font-medium mb-4">Document Type Distribution</h4>
              <div className="space-y-3">
                {Object.entries(statistics.documentsByType).map(([type, count]) => {
                  const percentage = (count / statistics.totalDocuments * 100).toFixed(1);
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm capitalize font-medium">
                        {type.replace('_', ' ')}
                      </span>
                      <div className="flex items-center space-x-3">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600 w-16 text-right">
                          {count.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500 w-12 text-right">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* System Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h4 className="font-medium mb-4">System Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Embedding Model:</span>
                  <span className="ml-2 font-medium">{statistics.embeddingModel}</span>
                </div>
                <div>
                  <span className="text-gray-600">Computing Device:</span>
                  <span className="ml-2 font-medium uppercase">{statistics.device}</span>
                </div>
                <div>
                  <span className="text-gray-600">Vector Dimensions:</span>
                  <span className="ml-2 font-medium">{statistics.embeddingDimension}</span>
                </div>
                <div>
                  <span className="text-gray-600">Avg Embedding Time:</span>
                  <span className="ml-2 font-medium">{statistics.avgEmbeddingTime.toFixed(2)}ms</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};