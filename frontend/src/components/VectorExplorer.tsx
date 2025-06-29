// Vector Explorer Component
// Interactive exploration of embedding spaces and semantic similarity

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CubeIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  InformationCircleIcon,
  SparklesIcon,
  BeakerIcon
} from '@heroicons/react/24/outline';

interface EmbeddingPoint {
  id: string;
  documentId: string;
  content: string;
  documentType: 'transcript' | 'summary' | 'insight' | 'topic';
  coordinates: {
    x: number;
    y: number;
    z?: number;
  };
  originalDimensions: number;
  metadata: {
    meetingId?: string;
    speaker?: string;
    timestamp?: number;
    confidence?: number;
    keywords?: string[];
    similarity?: number;
  };
  clusterLabel?: string;
  isHighlighted?: boolean;
}

interface SimilarityResult {
  id: string;
  similarity: number;
  distance: number;
  explanation: string;
}

interface ClusterData {
  id: string;
  label: string;
  color: string;
  pointIds: string[];
  centroid: { x: number; y: number; z?: number };
  coherence: number;
  size: number;
}

interface ExplorerSettings {
  dimensionality: '2D' | '3D';
  reductionMethod: 'tsne' | 'umap' | 'pca';
  colorMode: 'type' | 'cluster' | 'similarity' | 'confidence' | 'meeting';
  pointSize: 'uniform' | 'confidence' | 'importance';
  showLabels: boolean;
  showClusters: boolean;
  enableAnimation: boolean;
  similarityThreshold: number;
  maxPoints: number;
  clusteringEnabled: boolean;
}

interface VectorExplorerProps {
  meetingIds?: string[];
  searchQuery?: string;
  onPointSelect?: (pointId: string, point: EmbeddingPoint) => void;
  onSimilaritySearch?: (query: string, results: SimilarityResult[]) => void;
  height?: number;
  width?: number;
  enableInteraction?: boolean;
  showControls?: boolean;
}

export const VectorExplorer: React.FC<VectorExplorerProps> = ({
  meetingIds = [],
  searchQuery: externalSearchQuery,
  onPointSelect,
  onSimilaritySearch,
  height = 600,
  width = 800,
  enableInteraction = true,
  showControls = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [embeddingPoints, setEmbeddingPoints] = useState<EmbeddingPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(externalSearchQuery || '');
  const [similarityResults, setSimilarityResults] = useState<SimilarityResult[]>([]);
  const [viewMode, setViewMode] = useState<'explore' | 'similarity' | 'clusters' | 'analysis'>('explore');
  
  const [settings, setSettings] = useState<ExplorerSettings>({
    dimensionality: '2D',
    reductionMethod: 'tsne',
    colorMode: 'type',
    pointSize: 'uniform',
    showLabels: false,
    showClusters: true,
    enableAnimation: true,
    similarityThreshold: 0.5,
    maxPoints: 500,
    clusteringEnabled: true
  });

  // Generate sample embedding points
  const generateSampleEmbeddings = useCallback((): { points: EmbeddingPoint[], clusters: ClusterData[] } => {
    const documentTypes = ['transcript', 'summary', 'insight', 'topic'] as const;
    const points: EmbeddingPoint[] = [];
    const clusterColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];
    
    // Generate points
    for (let i = 0; i < Math.min(settings.maxPoints, 200); i++) {
      const docType = documentTypes[Math.floor(Math.random() * documentTypes.length)];
      const clusterId = Math.floor(Math.random() * 6);
      
      // Create clustered coordinates
      const clusterCenterX = (clusterId % 3) * (width / 3) + (width / 6);
      const clusterCenterY = Math.floor(clusterId / 3) * (height / 2) + (height / 4);
      
      const x = clusterCenterX + (Math.random() - 0.5) * 150;
      const y = clusterCenterY + (Math.random() - 0.5) * 150;
      const z = settings.dimensionality === '3D' ? Math.random() * 100 : undefined;
      
      points.push({
        id: `point_${i}`,
        documentId: `doc_${i}`,
        content: `Sample document content ${i + 1}. This represents ${docType} data from meeting analysis.`,
        documentType: docType,
        coordinates: { x, y, z },
        originalDimensions: 384, // Typical for sentence transformers
        metadata: {
          meetingId: meetingIds[Math.floor(Math.random() * Math.max(1, meetingIds.length))] || `meeting_${Math.floor(Math.random() * 5)}`,
          speaker: ['John Smith', 'Sarah Johnson', 'Mike Davis', 'Emily Chen'][Math.floor(Math.random() * 4)],
          timestamp: Date.now() - Math.random() * 86400000 * 30,
          confidence: Math.random() * 0.3 + 0.7,
          keywords: [`keyword${i}`, `topic${Math.floor(i/10)}`, `category${clusterId}`],
          similarity: selectedPoint ? Math.random() : undefined
        },
        clusterLabel: `Cluster ${clusterId + 1}`,
        isHighlighted: false
      });
    }
    
    // Generate cluster information
    const clusterData: ClusterData[] = [];
    for (let i = 0; i < 6; i++) {
      const clusterPoints = points.filter((_, idx) => Math.floor(idx * 6 / points.length) === i);
      if (clusterPoints.length > 0) {
        clusterData.push({
          id: `cluster_${i}`,
          label: `Topic Cluster ${i + 1}`,
          color: clusterColors[i],
          pointIds: clusterPoints.map(p => p.id),
          centroid: {
            x: clusterPoints.reduce((sum, p) => sum + p.coordinates.x, 0) / clusterPoints.length,
            y: clusterPoints.reduce((sum, p) => sum + p.coordinates.y, 0) / clusterPoints.length,
            z: settings.dimensionality === '3D' 
              ? clusterPoints.reduce((sum, p) => sum + (p.coordinates.z || 0), 0) / clusterPoints.length 
              : undefined
          },
          coherence: Math.random() * 0.3 + 0.7,
          size: clusterPoints.length
        });
      }
    }
    
    return { points, clusters: clusterData };
  }, [settings.maxPoints, settings.dimensionality, meetingIds, width, height, selectedPoint]);

  // Load embedding data
  const loadEmbeddingData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // In a real implementation, this would call the vector storage API
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
      const { points, clusters: clusterData } = generateSampleEmbeddings();
      setEmbeddingPoints(points);
      setClusters(clusterData);
    } catch (err) {
      setError('Failed to load embedding data');
      console.error('Error loading embeddings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [generateSampleEmbeddings]);

  // Perform similarity search
  const performSimilaritySearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSimilarityResults([]);
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Simulate API call for similarity search
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Generate mock similarity results
      const results: SimilarityResult[] = embeddingPoints
        .filter(point => 
          point.content.toLowerCase().includes(query.toLowerCase()) ||
          point.metadata.keywords?.some(k => k.toLowerCase().includes(query.toLowerCase()))
        )
        .slice(0, 10)
        .map(point => ({
          id: point.id,
          similarity: Math.random() * 0.4 + 0.6, // 0.6 to 1.0
          distance: Math.random() * 0.4, // 0.0 to 0.4
          explanation: `Matched based on semantic similarity to "${query}"`
        }))
        .sort((a, b) => b.similarity - a.similarity);
      
      setSimilarityResults(results);
      onSimilaritySearch?.(query, results);
      
      // Highlight similar points
      setEmbeddingPoints(prev => prev.map(point => ({
        ...point,
        isHighlighted: results.some(r => r.id === point.id),
        metadata: {
          ...point.metadata,
          similarity: results.find(r => r.id === point.id)?.similarity
        }
      })));
      
    } catch (err) {
      console.error('Similarity search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [embeddingPoints, onSimilaritySearch]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadEmbeddingData();
  }, [loadEmbeddingData]);

  // Handle external search query changes
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
      if (externalSearchQuery) {
        performSimilaritySearch(externalSearchQuery);
      }
    }
  }, [externalSearchQuery, performSimilaritySearch]);

  // Canvas drawing logic
  const drawEmbeddings = useCallback(() => {
    if (!canvasRef.current || embeddingPoints.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw clusters if enabled
    if (settings.showClusters) {
      clusters.forEach(cluster => {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = cluster.color;
        ctx.beginPath();
        
        if (settings.dimensionality === '2D') {
          ctx.arc(cluster.centroid.x, cluster.centroid.y, Math.sqrt(cluster.size) * 10, 0, 2 * Math.PI);
        } else {
          // Simplified 3D projection for cluster
          const projectedX = cluster.centroid.x + (cluster.centroid.z || 0) * 0.3;
          const projectedY = cluster.centroid.y + (cluster.centroid.z || 0) * 0.2;
          ctx.arc(projectedX, projectedY, Math.sqrt(cluster.size) * 8, 0, 2 * Math.PI);
        }
        
        ctx.fill();
        ctx.restore();
      });
    }
    
    // Draw embedding points
    embeddingPoints.forEach(point => {
      ctx.save();
      
      // Calculate point position (with 3D projection if needed)
      let x = point.coordinates.x;
      let y = point.coordinates.y;
      
      if (settings.dimensionality === '3D' && point.coordinates.z !== undefined) {
        x += point.coordinates.z * 0.3; // Simple perspective projection
        y += point.coordinates.z * 0.2;
      }
      
      // Determine point size
      let size = 4; // Default
      if (settings.pointSize === 'confidence' && point.metadata.confidence) {
        size = 3 + point.metadata.confidence * 4;
      } else if (settings.pointSize === 'importance') {
        size = point.isHighlighted ? 8 : 4;
      }
      
      // Determine point color
      let color = '#6B7280'; // Default gray
      if (settings.colorMode === 'type') {
        const typeColors = {
          transcript: '#3B82F6',
          summary: '#10B981',
          insight: '#F59E0B',
          topic: '#8B5CF6'
        };
        color = typeColors[point.documentType];
      } else if (settings.colorMode === 'cluster') {
        const cluster = clusters.find(c => c.pointIds.includes(point.id));
        color = cluster?.color || '#6B7280';
      } else if (settings.colorMode === 'similarity' && point.metadata.similarity) {
        const intensity = point.metadata.similarity;
        color = `hsl(${120 * intensity}, 70%, 50%)`; // Green gradient
      } else if (settings.colorMode === 'confidence' && point.metadata.confidence) {
        const intensity = point.metadata.confidence;
        color = `hsl(${240 * intensity}, 70%, 50%)`; // Blue gradient
      }
      
      // Highlight selected/hovered points
      if (selectedPoint === point.id || hoveredPoint === point.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#1F2937';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, size + 3, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (point.isHighlighted) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, size + 2, 0, 2 * Math.PI);
        ctx.stroke();
      }
      
      // Draw point
      ctx.globalAlpha = point.isHighlighted ? 1 : 0.8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw labels if enabled and point is selected/hovered
      if (settings.showLabels && (hoveredPoint === point.id || selectedPoint === point.id)) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1F2937';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        const label = `${point.documentType} ${point.id.slice(-4)}`;
        ctx.fillText(label, x, y + size + 15);
      }
      
      ctx.restore();
    });
    
  }, [embeddingPoints, clusters, settings, hoveredPoint, selectedPoint]);

  // Redraw when data or settings change
  useEffect(() => {
    drawEmbeddings();
  }, [drawEmbeddings]);

  // Handle canvas mouse events
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableInteraction || embeddingPoints.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find clicked point
    const clickedPoint = embeddingPoints.find(point => {
      let pointX = point.coordinates.x;
      let pointY = point.coordinates.y;
      
      if (settings.dimensionality === '3D' && point.coordinates.z !== undefined) {
        pointX += point.coordinates.z * 0.3;
        pointY += point.coordinates.z * 0.2;
      }
      
      const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
      return distance <= 8; // Click tolerance
    });
    
    if (clickedPoint) {
      setSelectedPoint(clickedPoint.id);
      onPointSelect?.(clickedPoint.id, clickedPoint);
    }
  }, [embeddingPoints, enableInteraction, settings.dimensionality, onPointSelect]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableInteraction || embeddingPoints.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find hovered point
    const hoveredPointId = embeddingPoints.find(point => {
      let pointX = point.coordinates.x;
      let pointY = point.coordinates.y;
      
      if (settings.dimensionality === '3D' && point.coordinates.z !== undefined) {
        pointX += point.coordinates.z * 0.3;
        pointY += point.coordinates.z * 0.2;
      }
      
      const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
      return distance <= 8;
    })?.id || null;
    
    setHoveredPoint(hoveredPointId);
  }, [embeddingPoints, enableInteraction, settings.dimensionality]);

  if (isLoading && embeddingPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading embedding space...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔬</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Embeddings</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadEmbeddingData}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <CubeIcon className="w-6 h-6 mr-2" />
            Vector Explorer
          </h2>
          <p className="text-sm text-gray-600">
            Interactive exploration of {embeddingPoints.length} embedding points in {settings.dimensionality} space
          </p>
        </div>
        
        {showControls && (
          <div className="flex items-center space-x-4">
            {/* Similarity Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for similar content..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) {
                    performSimilaritySearch(e.target.value);
                  } else {
                    setSimilarityResults([]);
                    setEmbeddingPoints(prev => prev.map(p => ({ ...p, isHighlighted: false })));
                  }
                }}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-64"
              />
              {isLoading && searchQuery && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                </div>
              )}
            </div>
            
            {/* View Mode */}
            <div className="flex border rounded-lg">
              {[
                { id: 'explore', icon: CubeIcon, label: 'Explore' },
                { id: 'similarity', icon: SparklesIcon, label: 'Similarity' },
                { id: 'clusters', icon: ArrowsPointingOutIcon, label: 'Clusters' },
                { id: 'analysis', icon: BeakerIcon, label: 'Analysis' }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as 'explore' | 'similarity' | 'clusters' | 'analysis')}
                  className={`
                    flex items-center px-3 py-2 text-sm
                    ${viewMode === mode.id 
                      ? 'bg-blue-50 text-blue-600 border-blue-200' 
                      : 'text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  <mode.icon className="w-4 h-4 mr-1" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Panel */}
        {showControls && (
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center">
                <AdjustmentsHorizontalIcon className="w-4 h-4 mr-2" />
                Vector Settings
              </h3>
              
              <div className="space-y-4">
                {/* Dimensionality */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Dimensionality</label>
                  <div className="flex border rounded-md">
                    {['2D', '3D'].map(dim => (
                      <button
                        key={dim}
                        onClick={() => setSettings(prev => ({ ...prev, dimensionality: dim as '2D' | '3D' }))}
                        className={`
                          flex-1 py-2 px-3 text-xs text-center
                          ${settings.dimensionality === dim 
                            ? 'bg-blue-50 text-blue-600' 
                            : 'text-gray-600 hover:bg-gray-50'
                          }
                        `}
                      >
                        {dim}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Reduction Method */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Reduction Method</label>
                  <select
                    value={settings.reductionMethod}
                    onChange={(e) => setSettings(prev => ({ ...prev, reductionMethod: e.target.value as 'tsne' | 'umap' | 'pca' }))}
                    className="w-full text-xs border border-gray-300 rounded-md p-2"
                  >
                    <option value="tsne">t-SNE</option>
                    <option value="umap">UMAP</option>
                    <option value="pca">PCA</option>
                  </select>
                </div>
                
                {/* Color Mode */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Color Mode</label>
                  <select
                    value={settings.colorMode}
                    onChange={(e) => setSettings(prev => ({ ...prev, colorMode: e.target.value as 'type' | 'cluster' | 'similarity' | 'confidence' | 'meeting' }))}
                    className="w-full text-xs border border-gray-300 rounded-md p-2"
                  >
                    <option value="type">Document Type</option>
                    <option value="cluster">Cluster</option>
                    <option value="similarity">Similarity</option>
                    <option value="confidence">Confidence</option>
                    <option value="meeting">Meeting</option>
                  </select>
                </div>
                
                {/* Point Size */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Point Size</label>
                  <select
                    value={settings.pointSize}
                    onChange={(e) => setSettings(prev => ({ ...prev, pointSize: e.target.value as 'uniform' | 'confidence' | 'importance' }))}
                    className="w-full text-xs border border-gray-300 rounded-md p-2"
                  >
                    <option value="uniform">Uniform</option>
                    <option value="confidence">By Confidence</option>
                    <option value="importance">By Importance</option>
                  </select>
                </div>
                
                {/* Similarity Threshold */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Similarity Threshold: {settings.similarityThreshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.similarityThreshold}
                    onChange={(e) => setSettings(prev => ({ ...prev, similarityThreshold: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* Max Points */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Max Points: {settings.maxPoints}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="50"
                    value={settings.maxPoints}
                    onChange={(e) => setSettings(prev => ({ ...prev, maxPoints: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* Toggles */}
                <div className="space-y-2">
                  {[
                    { key: 'showLabels', label: 'Show Labels' },
                    { key: 'showClusters', label: 'Show Clusters' },
                    { key: 'enableAnimation', label: 'Enable Animation' },
                    { key: 'clusteringEnabled', label: 'Auto Clustering' }
                  ].map(option => (
                    <label key={option.key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings[option.key as keyof ExplorerSettings] as boolean}
                        onChange={(e) => setSettings(prev => ({ ...prev, [option.key]: e.target.checked }))}
                        className="mr-2"
                      />
                      <span className="text-xs text-gray-600">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Stats Panel */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                <InformationCircleIcon className="w-4 h-4 mr-2" />
                Embedding Statistics
              </h3>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Points:</span>
                  <span className="font-medium">{embeddingPoints.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Clusters:</span>
                  <span className="font-medium">{clusters.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Dimensions:</span>
                  <span className="font-medium">{embeddingPoints[0]?.originalDimensions || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Highlighted:</span>
                  <span className="font-medium">{embeddingPoints.filter(p => p.isHighlighted).length}</span>
                </div>
                {similarityResults.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Similarity Results:</span>
                    <span className="font-medium">{similarityResults.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Visualization Area */}
        <div className={`${showControls ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {viewMode === 'explore' && (
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={width}
                  height={height}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  className="border border-gray-200 rounded cursor-pointer"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
                
                {/* Point Info Tooltip */}
                {hoveredPoint && (
                  <div className="absolute top-4 right-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg max-w-xs">
                    {(() => {
                      const point = embeddingPoints.find(p => p.id === hoveredPoint);
                      if (!point) return null;
                      
                      return (
                        <div>
                          <div className="font-medium text-sm mb-1">{point.documentType} Document</div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>ID: {point.id}</div>
                            <div>Cluster: {point.clusterLabel}</div>
                            {point.metadata.confidence && (
                              <div>Confidence: {(point.metadata.confidence * 100).toFixed(0)}%</div>
                            )}
                            {point.metadata.similarity && (
                              <div>Similarity: {(point.metadata.similarity * 100).toFixed(0)}%</div>
                            )}
                            <div className="text-xs text-gray-500 mt-2 max-w-48 truncate">
                              {point.content}
                            </div>
                          </div>
                        </div>
                      );
                    })()} 
                  </div>
                )}
              </div>
            )}
            
            {viewMode === 'similarity' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Similarity Search Results</h3>
                {similarityResults.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <SparklesIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Enter a search query to find similar documents</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {similarityResults.map(result => {
                      const point = embeddingPoints.find(p => p.id === result.id);
                      if (!point) return null;
                      
                      return (
                        <div
                          key={result.id}
                          className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            setSelectedPoint(result.id);
                            onPointSelect?.(result.id, point);
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">{point.documentType} - {point.id.slice(-6)}</span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              {(result.similarity * 100).toFixed(0)}% similar
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mb-1 line-clamp-2">{point.content}</p>
                          <p className="text-xs text-gray-500">{result.explanation}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            
            {viewMode === 'clusters' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Embedding Clusters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clusters.map(cluster => (
                    <div
                      key={cluster.id}
                      className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div
                            className="w-4 h-4 rounded-full mr-2"
                            style={{ backgroundColor: cluster.color }}
                          ></div>
                          <h4 className="font-medium">{cluster.label}</h4>
                        </div>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {cluster.size} points
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Coherence: {(cluster.coherence * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Center: ({cluster.centroid.x.toFixed(1)}, {cluster.centroid.y.toFixed(1)}
                        {cluster.centroid.z && `, ${cluster.centroid.z.toFixed(1)}`})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {viewMode === 'analysis' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Embedding Space Analysis</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{embeddingPoints.length}</div>
                    <div className="text-sm text-gray-600">Total Embeddings</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{clusters.length}</div>
                    <div className="text-sm text-gray-600">Clusters Found</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {embeddingPoints[0]?.originalDimensions || 0}
                    </div>
                    <div className="text-sm text-gray-600">Orig. Dimensions</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {clusters.length > 0 ? (clusters.reduce((sum, c) => sum + c.coherence, 0) / clusters.length * 100).toFixed(0) : 0}%
                    </div>
                    <div className="text-sm text-gray-600">Avg Coherence</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-3">Document Type Distribution</h4>
                  <div className="space-y-2">
                    {['transcript', 'summary', 'insight', 'topic'].map(type => {
                      const count = embeddingPoints.filter(p => p.documentType === type).length;
                      const percentage = (count / embeddingPoints.length * 100).toFixed(1);
                      
                      return (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{type}</span>
                          <div className="flex items-center">
                            <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-500 w-12">{percentage}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};