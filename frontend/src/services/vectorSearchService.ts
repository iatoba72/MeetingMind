// Vector Search Service
// API integration for semantic search and vector operations

interface VectorDocument {
  id: string;
  content: string;
  documentType: 'transcript_segment' | 'meeting_summary' | 'insight' | 'action_item' | 'topic' | 'speaker_profile';
  metadata: {
    meetingId?: string;
    speaker?: string;
    timestamp?: number;
    confidence?: number;
    insightType?: string;
    keywords?: string[];
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  document: VectorDocument;
  similarityScore: number;
  distance: number;
  rank: number;
  explanation: string;
}

interface EnhancedSearchResult {
  baseResult: SearchResult;
  contextScore: number;
  relevanceExplanation: string;
  relatedDocuments: string[];
  snippet: string;
  highlights: string[];
  meetingContext: {
    meetingId?: string;
    meetingDate?: string;
    participants?: string[];
    duration?: number;
    meetingType?: string;
  };
}

interface SearchContextInfo {
  meetingId?: string;
  speakerFilter?: string;
  timeRange?: [string, string]; // ISO date strings
  topicFilter?: string;
  documentTypes?: string[];
  priorityBoost?: Record<string, number>;
}

interface SimilarityMatrix {
  documentIds: string[];
  similarityMatrix: number[][];
  clusteringInfo: Array<{
    clusterId: number;
    centroid: number[];
    documents: string[];
    label: string;
    coherenceScore: number;
    topics: string[];
  }>;
  dimensionalityReduction: {
    tsne?: Array<[number, number]>;
    umap?: Array<[number, number]>;
  };
}

interface EmbeddingStatistics {
  totalDocuments: number;
  documentsByType: Record<string, number>;
  embeddingModel: string;
  embeddingDimension: number;
  device: string;
  cacheSize: number;
  cacheHitRate: number;
  avgEmbeddingTime: number;
  totalSearches: number;
}

interface CachedResult<T> {
  data: T;
  timestamp: number;
}

class VectorSearchService {
  private baseUrl: string;
  private cache: Map<string, CachedResult<EnhancedSearchResult[] | SimilarityMatrix | EmbeddingStatistics>> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Perform semantic search across documents
   */
  async semanticSearch(
    query: string,
    options: {
      documentTypes?: string[];
      searchMode?: 'semantic' | 'hybrid' | 'temporal' | 'speaker' | 'topic';
      limit?: number;
      metadataFilter?: Record<string, any>;
      similarityThreshold?: number;
      context?: SearchContextInfo;
    } = {}
  ): Promise<EnhancedSearchResult[]> {
    const cacheKey = `search:${JSON.stringify({ query, options })}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/vector/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          document_types: options.documentTypes,
          search_mode: options.searchMode || 'semantic',
          limit: options.limit || 10,
          metadata_filter: options.metadataFilter,
          similarity_threshold: options.similarityThreshold || 0.3,
          context: options.context
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const results: EnhancedSearchResult[] = await response.json();
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: results,
        timestamp: Date.now()
      });

      return results;
    } catch (error) {
      console.error('Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * Find similar meetings to a given meeting
   */
  async findSimilarMeetings(
    meetingId: string,
    options: {
      limit?: number;
      similarityThreshold?: number;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.similarityThreshold) params.append('threshold', options.similarityThreshold.toString());
      
      const queryString = params.toString();
      const url = `${this.baseUrl}/vector/similar-meetings/${meetingId}${queryString ? `?${queryString}` : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Similar meetings search failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Similar meetings search failed:', error);
      throw error;
    }
  }

  /**
   * Add a document to the vector store
   */
  async addDocument(
    content: string,
    documentType: string,
    metadata: Record<string, any> = {},
    documentId?: string
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/vector/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          document_type: documentType,
          metadata,
          document_id: documentId
        }),
      });

      if (!response.ok) {
        throw new Error(`Document addition failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.document_id;
    } catch (error) {
      console.error('Document addition failed:', error);
      throw error;
    }
  }

  /**
   * Generate similarity matrix for visualization
   */
  async generateSimilarityMatrix(
    options: {
      documentIds?: string[];
      documentTypes?: string[];
      maxDocuments?: number;
    } = {}
  ): Promise<SimilarityMatrix> {
    const cacheKey = `similarity_matrix:${JSON.stringify(options)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/vector/similarity-matrix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_ids: options.documentIds,
          document_types: options.documentTypes,
          max_documents: options.maxDocuments || 100
        }),
      });

      if (!response.ok) {
        throw new Error(`Similarity matrix generation failed: ${response.statusText}`);
      }

      const matrix: SimilarityMatrix = await response.json();
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: matrix,
        timestamp: Date.now()
      });

      return matrix;
    } catch (error) {
      console.error('Similarity matrix generation failed:', error);
      throw error;
    }
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStatistics(): Promise<EmbeddingStatistics> {
    const cacheKey = 'embedding_statistics';
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/vector/statistics`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Statistics retrieval failed: ${response.statusText}`);
      }

      const stats: EmbeddingStatistics = await response.json();
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: stats,
        timestamp: Date.now()
      });

      return stats;
    } catch (error) {
      console.error('Statistics retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Get documents by metadata filter
   */
  async getDocumentsByMetadata(
    metadataFilter: Record<string, any>,
    documentTypes?: string[]
  ): Promise<VectorDocument[]> {
    try {
      const response = await fetch(`${this.baseUrl}/vector/documents/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata_filter: metadataFilter,
          document_types: documentTypes
        }),
      });

      if (!response.ok) {
        throw new Error(`Document search failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Document search failed:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Generate embeddings for text (for analysis purposes)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/vector/embedding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Embedding generation failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.embedding;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Batch operations for multiple documents
   */
  async batchAddDocuments(
    documents: Array<{
      content: string;
      documentType: string;
      metadata?: Record<string, any>;
      documentId?: string;
    }>
  ): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/vector/documents/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documents }),
      });

      if (!response.ok) {
        throw new Error(`Batch document addition failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.document_ids;
    } catch (error) {
      console.error('Batch document addition failed:', error);
      throw error;
    }
  }

  /**
   * Advanced search with query analysis
   */
  async advancedSearch(
    query: string,
    context?: SearchContextInfo,
    limit: number = 10
  ): Promise<{
    results: EnhancedSearchResult[];
    queryAnalysis: {
      queryType: string;
      intent: string;
      entities: string[];
      keywords: string[];
      confidence: number;
    };
    suggestions: Array<{
      suggestion: string;
      description: string;
      queryType: string;
      estimatedResults: number;
    }>;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/semantic/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          context,
          limit
        }),
      });

      if (!response.ok) {
        throw new Error(`Advanced search failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Advanced search failed:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions
   */
  async getSearchSuggestions(
    partialQuery: string,
    limit: number = 5
  ): Promise<Array<{
    suggestion: string;
    description: string;
    queryType: string;
    estimatedResults: number;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/semantic/suggestions?query=${encodeURIComponent(partialQuery)}&limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Search suggestions failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Search suggestions failed:', error);
      return [];
    }
  }

  /**
   * Get search statistics
   */
  async getSearchStatistics(): Promise<{
    totalSearches: number;
    queriesByType: Record<string, number>;
    avgResponseTime: number;
    popularQueries: Record<string, number>;
    zeroResultQueries: string[];
    cacheSize: number;
    cacheHitRate: number;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/semantic/statistics`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Search statistics failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Search statistics failed:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
export const vectorSearchService = new VectorSearchService();

// Export types for use in components
export type {
  VectorDocument,
  SearchResult,
  EnhancedSearchResult,
  SearchContextInfo,
  SimilarityMatrix,
  EmbeddingStatistics
};

export default VectorSearchService;