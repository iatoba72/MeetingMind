// Knowledge Graph Visualization Component
// Interactive visualization of document relationships and knowledge connections

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  ArrowsPointingOutIcon,
  Square3Stack3DIcon,
  ChartBarIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface Node {
  id: string;
  label: string;
  type: 'meeting' | 'topic' | 'insight' | 'speaker' | 'document';
  size: number;
  color: string;
  metadata: {
    documentType?: string;
    confidence?: number;
    timestamp?: number;
    meetingId?: string;
    speaker?: string;
    insightType?: string;
    keywords?: string[];
  };
  position?: { x: number; y: number };
}

interface Edge {
  id: string;
  source: string;
  target: string;
  weight: number;
  type: 'similarity' | 'temporal' | 'speaker' | 'topic' | 'contains';
  color: string;
  metadata: {
    similarityScore?: number;
    relationship?: string;
    strength?: number;
  };
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
  clusters: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    coherenceScore: number;
    centroid: { x: number; y: number };
  }>;
  statistics: {
    totalNodes: number;
    totalEdges: number;
    avgConnectivity: number;
    clusterCount: number;
    topTopics: string[];
  };
}

interface VisualizationSettings {
  layout: 'force' | 'hierarchical' | 'circular' | 'cluster';
  nodeSize: 'uniform' | 'confidence' | 'connections' | 'importance';
  edgeThickness: 'uniform' | 'similarity' | 'frequency';
  colorScheme: 'type' | 'cluster' | 'confidence' | 'meeting';
  showLabels: boolean;
  showClusters: boolean;
  minSimilarity: number;
  maxNodes: number;
  enablePhysics: boolean;
  highlightNeighbors: boolean;
}

interface KnowledgeGraphVisualizationProps {
  meetingIds?: string[];
  selectedNode?: string;
  onNodeSelect?: (nodeId: string, nodeData: Node) => void;
  onClusterSelect?: (clusterId: string) => void;
  height?: number;
  width?: number;
  enableInteraction?: boolean;
  showControls?: boolean;
}

export const KnowledgeGraphVisualization: React.FC<KnowledgeGraphVisualizationProps> = ({
  meetingIds = [],
  selectedNode,
  onNodeSelect,
  onClusterSelect,
  height = 600,
  width = 800,
  enableInteraction = true,
  showControls = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'clusters' | 'statistics'>('graph');
  
  const [settings, setSettings] = useState<VisualizationSettings>({
    layout: 'force',
    nodeSize: 'connections',
    edgeThickness: 'similarity',
    colorScheme: 'type',
    showLabels: true,
    showClusters: true,
    minSimilarity: 0.3,
    maxNodes: 100,
    enablePhysics: true,
    highlightNeighbors: true
  });

  // Generate sample knowledge graph data
  const generateSampleData = useCallback((): GraphData => {
    const nodeTypes = ['meeting', 'topic', 'insight', 'speaker', 'document'] as const;
    const edgeTypes = ['similarity', 'temporal', 'speaker', 'topic', 'contains'] as const;
    
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // Create nodes
    for (let i = 0; i < Math.min(settings.maxNodes, 50); i++) {
      const type = nodeTypes[Math.floor(Math.random() * nodeTypes.length)];
      const confidence = Math.random();
      
      nodes.push({
        id: `node_${i}`,
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}`,
        type,
        size: type === 'meeting' ? 20 : type === 'topic' ? 15 : 10,
        color: {
          meeting: '#3B82F6',
          topic: '#10B981',
          insight: '#F59E0B',
          speaker: '#8B5CF6',
          document: '#6B7280'
        }[type],
        metadata: {
          confidence,
          timestamp: Date.now() - Math.random() * 86400000 * 30,
          meetingId: meetingIds[Math.floor(Math.random() * Math.max(1, meetingIds.length))] || `meeting_${Math.floor(Math.random() * 5)}`,
          keywords: ['keyword1', 'keyword2', 'keyword3'].slice(0, Math.floor(Math.random() * 3) + 1)
        },
        position: {
          x: Math.random() * width,
          y: Math.random() * height
        }
      });
    }
    
    // Create edges based on similarity threshold
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = Math.random();
        if (similarity >= settings.minSimilarity) {
          const edgeType = edgeTypes[Math.floor(Math.random() * edgeTypes.length)];
          
          edges.push({
            id: `edge_${i}_${j}`,
            source: nodes[i].id,
            target: nodes[j].id,
            weight: similarity,
            type: edgeType,
            color: similarity > 0.7 ? '#059669' : similarity > 0.5 ? '#D97706' : '#6B7280',
            metadata: {
              similarityScore: similarity,
              relationship: edgeType,
              strength: similarity
            }
          });
        }
      }
    }
    
    // Create clusters using simple grouping
    const clusters = [];
    for (let i = 0; i < 5; i++) {
      const clusterNodes = nodes.filter((_, idx) => idx % 5 === i);
      if (clusterNodes.length > 0) {
        clusters.push({
          id: `cluster_${i}`,
          label: `Cluster ${i + 1}`,
          nodeIds: clusterNodes.map(n => n.id),
          coherenceScore: Math.random() * 0.5 + 0.5,
          centroid: {
            x: clusterNodes.reduce((sum, n) => sum + (n.position?.x || 0), 0) / clusterNodes.length,
            y: clusterNodes.reduce((sum, n) => sum + (n.position?.y || 0), 0) / clusterNodes.length
          }
        });
      }
    }
    
    return {
      nodes,
      edges,
      clusters,
      statistics: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgConnectivity: edges.length / nodes.length,
        clusterCount: clusters.length,
        topTopics: ['Project Planning', 'Budget Discussion', 'Technical Issues', 'Team Updates']
      }
    };
  }, [settings.maxNodes, settings.minSimilarity, meetingIds, width, height]);

  // Load graph data
  const loadGraphData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // In a real implementation, this would call the backend API
      // For now, generate sample data
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      const data = generateSampleData();
      setGraphData(data);
    } catch (err) {
      setError('Failed to load knowledge graph data');
      console.error('Error loading graph data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [generateSampleData]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Canvas drawing logic
  const drawGraph = useCallback(() => {
    if (!graphData || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw clusters if enabled
    if (settings.showClusters) {
      graphData.clusters.forEach(cluster => {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = selectedCluster === cluster.id ? '#3B82F6' : '#E5E7EB';
        ctx.beginPath();
        ctx.arc(cluster.centroid.x, cluster.centroid.y, 80, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      });
    }
    
    // Draw edges
    graphData.edges.forEach(edge => {
      const sourceNode = graphData.nodes.find(n => n.id === edge.source);
      const targetNode = graphData.nodes.find(n => n.id === edge.target);
      
      if (!sourceNode?.position || !targetNode?.position) return;
      
      ctx.save();
      
      // Highlight edges connected to hovered node
      if (hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode)) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
      } else {
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = settings.edgeThickness === 'similarity' ? edge.weight * 3 : 1;
      }
      
      ctx.strokeStyle = edge.color;
      ctx.beginPath();
      ctx.moveTo(sourceNode.position.x, sourceNode.position.y);
      ctx.lineTo(targetNode.position.x, targetNode.position.y);
      ctx.stroke();
      ctx.restore();
    });
    
    // Draw nodes
    graphData.nodes.forEach(node => {
      if (!node.position) return;
      
      ctx.save();
      
      // Highlight selected or hovered nodes
      if (selectedNode === node.id || hoveredNode === node.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#1F2937';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(node.position.x, node.position.y, node.size + 5, 0, 2 * Math.PI);
        ctx.stroke();
      }
      
      // Draw node
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.position.x, node.position.y, node.size, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw labels if enabled
      if (settings.showLabels && (hoveredNode === node.id || selectedNode === node.id)) {
        ctx.fillStyle = '#1F2937';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.position.x, node.position.y + node.size + 15);
      }
      
      ctx.restore();
    });
    
  }, [graphData, settings, hoveredNode, selectedNode, selectedCluster]);

  // Redraw when data or settings change
  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  // Handle canvas mouse events
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!graphData || !enableInteraction) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find clicked node
    const clickedNode = graphData.nodes.find(node => {
      if (!node.position) return false;
      const distance = Math.sqrt(
        Math.pow(x - node.position.x, 2) + Math.pow(y - node.position.y, 2)
      );
      return distance <= node.size;
    });
    
    if (clickedNode && onNodeSelect) {
      onNodeSelect(clickedNode.id, clickedNode);
    }
  }, [graphData, enableInteraction, onNodeSelect]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!graphData || !enableInteraction) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find hovered node
    const hoveredNodeId = graphData.nodes.find(node => {
      if (!node.position) return false;
      const distance = Math.sqrt(
        Math.pow(x - node.position.x, 2) + Math.pow(y - node.position.y, 2)
      );
      return distance <= node.size;
    })?.id || null;
    
    setHoveredNode(hoveredNodeId);
  }, [graphData, enableInteraction]);

  // Filter nodes based on search
  const filteredNodes = graphData?.nodes.filter(node =>
    !searchQuery || 
    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.metadata.keywords?.some(keyword => 
      keyword.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🕸️</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Graph</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadGraphData}
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
          <h2 className="text-xl font-semibold text-gray-900">Knowledge Graph</h2>
          <p className="text-sm text-gray-600">
            Interactive visualization of document relationships and knowledge connections
          </p>
        </div>
        
        {showControls && (
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            {/* View Mode */}
            <div className="flex border rounded-lg">
              {[
                { id: 'graph', icon: Square3Stack3DIcon, label: 'Graph' },
                { id: 'clusters', icon: ArrowsPointingOutIcon, label: 'Clusters' },
                { id: 'statistics', icon: ChartBarIcon, label: 'Stats' }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as 'semantic' | 'timeline' | 'speakers' | 'topics')}
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
                Visualization Settings
              </h3>
              
              <div className="space-y-4">
                {/* Layout */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Layout</label>
                  <select
                    value={settings.layout}
                    onChange={(e) => setSettings(prev => ({ ...prev, layout: e.target.value as 'force' | 'hierarchical' | 'circular' | 'cluster' }))}
                    className="w-full text-xs border border-gray-300 rounded-md p-2"
                  >
                    <option value="force">Force Directed</option>
                    <option value="hierarchical">Hierarchical</option>
                    <option value="circular">Circular</option>
                    <option value="cluster">Clustered</option>
                  </select>
                </div>
                
                {/* Node Size */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Node Size</label>
                  <select
                    value={settings.nodeSize}
                    onChange={(e) => setSettings(prev => ({ ...prev, nodeSize: e.target.value as 'uniform' | 'confidence' | 'connections' | 'importance' }))}
                    className="w-full text-xs border border-gray-300 rounded-md p-2"
                  >
                    <option value="uniform">Uniform</option>
                    <option value="confidence">By Confidence</option>
                    <option value="connections">By Connections</option>
                    <option value="importance">By Importance</option>
                  </select>
                </div>
                
                {/* Similarity Threshold */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Min Similarity: {settings.minSimilarity.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.minSimilarity}
                    onChange={(e) => setSettings(prev => ({ ...prev, minSimilarity: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* Max Nodes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Max Nodes: {settings.maxNodes}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="10"
                    value={settings.maxNodes}
                    onChange={(e) => setSettings(prev => ({ ...prev, maxNodes: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* Toggles */}
                <div className="space-y-2">
                  {[
                    { key: 'showLabels', label: 'Show Labels' },
                    { key: 'showClusters', label: 'Show Clusters' },
                    { key: 'enablePhysics', label: 'Physics Simulation' },
                    { key: 'highlightNeighbors', label: 'Highlight Neighbors' }
                  ].map(option => (
                    <label key={option.key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings[option.key as keyof VisualizationSettings] as boolean}
                        onChange={(e) => setSettings(prev => ({ ...prev, [option.key]: e.target.checked }))}
                        className="mr-2"
                      />
                      <span className="text-xs text-gray-600">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Statistics Panel */}
            {graphData && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <InformationCircleIcon className="w-4 h-4 mr-2" />
                  Graph Statistics
                </h3>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nodes:</span>
                    <span className="font-medium">{graphData.statistics.totalNodes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Edges:</span>
                    <span className="font-medium">{graphData.statistics.totalEdges}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Clusters:</span>
                    <span className="font-medium">{graphData.statistics.clusterCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Connectivity:</span>
                    <span className="font-medium">{graphData.statistics.avgConnectivity.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Filtered:</span>
                    <span className="font-medium">{filteredNodes.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Visualization Area */}
        <div className={`${showControls ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {viewMode === 'graph' && (
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
                
                {/* Node Info Tooltip */}
                {hoveredNode && graphData && (
                  <div className="absolute top-4 right-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg max-w-xs">
                    {(() => {
                      const node = graphData.nodes.find(n => n.id === hoveredNode);
                      if (!node) return null;
                      
                      return (
                        <div>
                          <div className="font-medium text-sm mb-1">{node.label}</div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>Type: {node.type}</div>
                            {node.metadata.confidence && (
                              <div>Confidence: {(node.metadata.confidence * 100).toFixed(0)}%</div>
                            )}
                            {node.metadata.keywords && (
                              <div>Keywords: {node.metadata.keywords.join(', ')}</div>
                            )}
                          </div>
                        </div>
                      );
                    })()} 
                  </div>
                )}
              </div>
            )}
            
            {viewMode === 'clusters' && graphData && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Document Clusters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {graphData.clusters.map(cluster => (
                    <div
                      key={cluster.id}
                      className={`
                        p-4 border rounded-lg cursor-pointer transition-all
                        ${selectedCluster === cluster.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                        }
                      `}
                      onClick={() => {
                        setSelectedCluster(cluster.id);
                        onClusterSelect?.(cluster.id);
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{cluster.label}</h4>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {cluster.nodeIds.length} nodes
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Coherence: {(cluster.coherenceScore * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {viewMode === 'statistics' && graphData && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Knowledge Graph Analytics</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{graphData.statistics.totalNodes}</div>
                    <div className="text-sm text-gray-600">Total Nodes</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{graphData.statistics.totalEdges}</div>
                    <div className="text-sm text-gray-600">Connections</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{graphData.statistics.clusterCount}</div>
                    <div className="text-sm text-gray-600">Clusters</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {graphData.statistics.avgConnectivity.toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-600">Avg Connectivity</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-3">Top Topics</h4>
                  <div className="space-y-2">
                    {graphData.statistics.topTopics.map((topic, index) => (
                      <div key={topic} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{topic}</span>
                        <span className="text-xs text-gray-500">#{index + 1}</span>
                      </div>
                    ))}
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