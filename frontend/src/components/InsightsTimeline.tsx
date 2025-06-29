// Insights Timeline View Component
// Interactive timeline visualization for meeting insights

import React, { useState, useEffect } from 'react';
import { 
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface InsightData {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  title: string;
  content: string;
  summary: string;
  timestamp: number;
  meetingTimestamp: number;
  speaker?: string;
  topicContext?: string;
  keywords: string[];
  actionItems: string[];
  stakeholders: string[];
  status: 'pending' | 'generating' | 'completed' | 'reviewed' | 'dismissed';
}

interface TopicSegment {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  confidence: number;
  keywords: string[];
}

interface SpeakerSegment {
  speaker: string;
  startTime: number;
  endTime: number;
  segmentCount: number;
}

interface TimelineFilter {
  types: string[];
  priorities: string[];
  speakers: string[];
  topics: string[];
  timeRange: [number, number];
  confidenceRange: [number, number];
  showDismissed: boolean;
}

interface InsightsTimelineProps {
  meetingId?: string;
  insights?: InsightData[];
  topics?: TopicSegment[];
  speakers?: SpeakerSegment[];
  onInsightSelect?: (insight: InsightData) => void;
  onInsightUpdate?: (insightId: string, updates: Partial<InsightData>) => void;
  height?: number;
}

export const InsightsTimeline: React.FC<InsightsTimelineProps> = ({
  // meetingId: _,
  insights: propInsights,
  topics: propTopics,
  speakers: propSpeakers,
  onInsightSelect,
  onInsightUpdate,
  height = 600
}) => {
  const [insights, setInsights] = useState<InsightData[]>(propInsights || []);
  const [topics, setTopics] = useState<TopicSegment[]>(propTopics || []);
  const [speakers, setSpeakers] = useState<SpeakerSegment[]>(propSpeakers || []);
  const [filter, setFilter] = useState<TimelineFilter>({
    types: [],
    priorities: [],
    speakers: [],
    topics: [],
    timeRange: [0, 0],
    confidenceRange: [0, 1],
    showDismissed: false
  });

  const [selectedInsight, setSelectedInsight] = useState<InsightData | null>(null);
  const [timelineMode, setTimelineMode] = useState<'insights' | 'topics' | 'speakers' | 'combined'>('combined');
  // const [zoomLevel, setZoomLevel] = useState(1);
  // const [timelineOffset, setTimelineOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);

  // const timelineRef = useRef<HTMLDivElement>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sample data generation for demonstration
  useEffect(() => {
    if (!propInsights) {
      const sampleInsights: InsightData[] = [
        {
          id: 'insight_1',
          type: 'action_item',
          priority: 'high',
          confidence: 0.85,
          title: 'Assign database optimization task',
          content: 'John should optimize the database queries for the user dashboard by Friday.',
          summary: 'Database optimization needed',
          timestamp: Date.now() - 3600000,
          meetingTimestamp: 300,
          speaker: 'Sarah Chen',
          topicContext: 'Performance Issues',
          keywords: ['database', 'optimization', 'performance'],
          actionItems: ['Optimize database queries'],
          stakeholders: ['John'],
          status: 'completed'
        },
        {
          id: 'insight_2',
          type: 'decision',
          priority: 'critical',
          confidence: 0.92,
          title: 'Go-to-market strategy approved',
          content: 'Team decided to proceed with the Q2 product launch targeting enterprise customers.',
          summary: 'Q2 enterprise launch approved',
          timestamp: Date.now() - 3300000,
          meetingTimestamp: 650,
          speaker: 'Mike Johnson',
          topicContext: 'Product Strategy',
          keywords: ['launch', 'enterprise', 'Q2'],
          actionItems: ['Create launch plan'],
          stakeholders: ['Marketing Team'],
          status: 'completed'
        },
        {
          id: 'insight_3',
          type: 'concern',
          priority: 'medium',
          confidence: 0.73,
          title: 'Budget constraints for new features',
          content: 'Lisa raised concerns about the budget allocation for the new AI features.',
          summary: 'Budget concerns for AI features',
          timestamp: Date.now() - 2800000,
          meetingTimestamp: 1050,
          speaker: 'Lisa Wang',
          topicContext: 'Budget Planning',
          keywords: ['budget', 'AI', 'features'],
          actionItems: ['Review budget allocation'],
          stakeholders: ['Finance Team'],
          status: 'completed'
        },
        {
          id: 'insight_4',
          type: 'question',
          priority: 'medium',
          confidence: 0.68,
          title: 'Timeline clarification needed',
          content: 'Team needs clarification on the timeline for the security audit.',
          summary: 'Security audit timeline unclear',
          timestamp: Date.now() - 2400000,
          meetingTimestamp: 1420,
          speaker: 'David Kim',
          topicContext: 'Security Review',
          keywords: ['security', 'audit', 'timeline'],
          actionItems: ['Clarify audit timeline'],
          stakeholders: ['Security Team'],
          status: 'completed'
        },
        {
          id: 'insight_5',
          type: 'topic_transition',
          priority: 'low',
          confidence: 0.56,
          title: 'Moved from technical to business discussion',
          content: 'Discussion transitioned from technical implementation details to business impact.',
          summary: 'Topic shift: technical to business',
          timestamp: Date.now() - 1800000,
          meetingTimestamp: 1680,
          speaker: 'Sarah Chen',
          topicContext: 'Business Impact',
          keywords: ['transition', 'business', 'impact'],
          actionItems: [],
          stakeholders: [],
          status: 'completed'
        }
      ];

      const sampleTopics: TopicSegment[] = [
        {
          id: 'topic_1',
          label: 'Performance Issues',
          startTime: 0,
          endTime: 800,
          confidence: 0.87,
          keywords: ['performance', 'database', 'optimization']
        },
        {
          id: 'topic_2',
          label: 'Product Strategy',
          startTime: 800,
          endTime: 1200,
          confidence: 0.92,
          keywords: ['product', 'strategy', 'launch']
        },
        {
          id: 'topic_3',
          label: 'Budget Planning',
          startTime: 1200,
          endTime: 1500,
          confidence: 0.78,
          keywords: ['budget', 'planning', 'allocation']
        },
        {
          id: 'topic_4',
          label: 'Security Review',
          startTime: 1500,
          endTime: 1800,
          confidence: 0.84,
          keywords: ['security', 'audit', 'review']
        }
      ];

      const sampleSpeakers: SpeakerSegment[] = [
        { speaker: 'Sarah Chen', startTime: 0, endTime: 400, segmentCount: 8 },
        { speaker: 'Mike Johnson', startTime: 400, endTime: 900, segmentCount: 12 },
        { speaker: 'Lisa Wang', startTime: 900, endTime: 1300, segmentCount: 6 },
        { speaker: 'David Kim', startTime: 1300, endTime: 1800, segmentCount: 10 }
      ];

      setInsights(sampleInsights);
      setTopics(sampleTopics);
      setSpeakers(sampleSpeakers);
      
      // Set initial time range
      if (sampleInsights.length > 0) {
        const minTime = Math.min(...sampleInsights.map(i => i.meetingTimestamp));
        const maxTime = Math.max(...sampleInsights.map(i => i.meetingTimestamp));
        setFilter(prev => ({ ...prev, timeRange: [minTime, maxTime] }));
      }
    }
  }, [propInsights, propTopics, propSpeakers]);

  // Filter insights based on current filter settings
  const filteredInsights = insights.filter(insight => {
    if (filter.types.length > 0 && !filter.types.includes(insight.type)) return false;
    if (filter.priorities.length > 0 && !filter.priorities.includes(insight.priority)) return false;
    if (filter.speakers.length > 0 && insight.speaker && !filter.speakers.includes(insight.speaker)) return false;
    if (filter.topics.length > 0 && insight.topicContext && !filter.topics.includes(insight.topicContext)) return false;
    if (insight.meetingTimestamp < filter.timeRange[0] || insight.meetingTimestamp > filter.timeRange[1]) return false;
    if (insight.confidence < filter.confidenceRange[0] || insight.confidence > filter.confidenceRange[1]) return false;
    if (!filter.showDismissed && insight.status === 'dismissed') return false;
    
    return true;
  });

  // Prepare timeline data for charts
  const timelineData = filteredInsights.map(insight => ({
    time: insight.meetingTimestamp,
    confidence: insight.confidence,
    priority: insight.priority === 'critical' ? 4 : insight.priority === 'high' ? 3 : insight.priority === 'medium' ? 2 : 1,
    type: insight.type,
    insight: insight
  })).sort((a, b) => a.time - b.time);

  // Get unique values for filters
  const uniqueTypes = [...new Set(insights.map(i => i.type))];
  const uniquePriorities = ['low', 'medium', 'high', 'critical'];
  const uniqueSpeakers = [...new Set(insights.map(i => i.speaker).filter(Boolean))];
  const uniqueTopics = [...new Set(insights.map(i => i.topicContext).filter(Boolean))];

  // Color schemes
  const typeColors: Record<string, string> = {
    action_item: '#10B981',
    decision: '#3B82F6',
    concern: '#EF4444',
    question: '#F59E0B',
    summary: '#6B7280',
    topic_transition: '#8B5CF6',
    business_insight: '#EC4899'
  };

  const priorityColors: Record<string, string> = {
    low: '#9CA3AF',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#DC2626'
  };

  // Format time for display
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle insight selection
  const handleInsightClick = (insight: InsightData) => {
    setSelectedInsight(insight);
    onInsightSelect?.(insight);
  };

  // Handle insight status update
  const handleStatusUpdate = (insightId: string, newStatus: InsightData['status']) => {
    setInsights(prev => prev.map(insight => 
      insight.id === insightId ? { ...insight, status: newStatus } : insight
    ));
    onInsightUpdate?.(insightId, { status: newStatus });
  };

  // Playback controls
  const startPlayback = () => {
    setIsPlaying(true);
    const startTime = filter.timeRange[0];
    const endTime = filter.timeRange[1];
    const duration = endTime - startTime;
    
    playbackIntervalRef.current = setInterval(() => {
      setPlaybackTime(prev => {
        const next = prev + (duration / 100); // 100 steps for full timeline
        if (next >= endTime) {
          setIsPlaying(false);
          return startTime;
        }
        return next;
      });
    }, 100);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }
  };

  const resetPlayback = () => {
    stopPlayback();
    setPlaybackTime(filter.timeRange[0]);
  };

  // Custom tooltip for timeline
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { insight: InsightData } }>; label?: number }) => {
    if (active && payload && payload.length) {
      const insight = payload[0].payload.insight;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded shadow-lg max-w-xs">
          <p className="font-semibold text-sm">{insight.title}</p>
          <p className="text-xs text-gray-600 mt-1">
            Time: {formatTime(label)} | Speaker: {insight.speaker || 'Unknown'}
          </p>
          <p className="text-xs text-gray-600">
            Confidence: {(insight.confidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs mt-1">{insight.summary}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Meeting Insights Timeline</h2>
            <p className="text-gray-600 mt-1">
              Interactive visualization of insights, topics, and speaker activity
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <select
              value={timelineMode}
              onChange={(e) => setTimelineMode(e.target.value as 'insights' | 'topics' | 'speakers' | 'combined')}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value="combined">Combined View</option>
              <option value="insights">Insights Only</option>
              <option value="topics">Topics Only</option>
              <option value="speakers">Speakers Only</option>
            </select>
            
            <button
              onClick={isPlaying ? stopPlayback : startPlayback}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              {isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </button>
            
            <button
              onClick={resetPlayback}
              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              ⏹️ Reset
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredInsights.length}</div>
            <div className="text-gray-600">Total Insights</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {filteredInsights.filter(i => i.priority === 'critical' || i.priority === 'high').length}
            </div>
            <div className="text-gray-600">High Priority</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{topics.length}</div>
            <div className="text-gray-600">Topics</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {(filteredInsights.reduce((sum, i) => sum + i.confidence, 0) / filteredInsights.length * 100).toFixed(0)}%
            </div>
            <div className="text-gray-600">Avg. Confidence</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Types</label>
            <select
              multiple
              value={filter.types}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                types: Array.from(e.target.selectedOptions, option => option.value)
              }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm h-20"
            >
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              multiple
              value={filter.priorities}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                priorities: Array.from(e.target.selectedOptions, option => option.value)
              }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm h-20"
            >
              {uniquePriorities.map(priority => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </div>

          {/* Speaker Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Speakers</label>
            <select
              multiple
              value={filter.speakers}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                speakers: Array.from(e.target.selectedOptions, option => option.value)
              }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm h-20"
            >
              {uniqueSpeakers.map(speaker => (
                <option key={speaker} value={speaker}>{speaker}</option>
              ))}
            </select>
          </div>

          {/* Topic Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topics</label>
            <select
              multiple
              value={filter.topics}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                topics: Array.from(e.target.selectedOptions, option => option.value)
              }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm h-20"
            >
              {uniqueTopics.map(topic => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
          </div>

          {/* Confidence Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confidence: {(filter.confidenceRange[0] * 100).toFixed(0)}% - {(filter.confidenceRange[1] * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={filter.confidenceRange[0]}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                confidenceRange: [parseFloat(e.target.value), prev.confidenceRange[1]]
              }))}
              className="w-full"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={filter.confidenceRange[1]}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                confidenceRange: [prev.confidenceRange[0], parseFloat(e.target.value)]
              }))}
              className="w-full"
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filter.showDismissed}
                  onChange={(e) => setFilter(prev => ({ ...prev, showDismissed: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-sm">Show dismissed</span>
              </label>
            </div>
          </div>
        </div>

        {/* Clear Filters Button */}
        <div className="mt-4">
          <button
            onClick={() => setFilter({
              types: [],
              priorities: [],
              speakers: [],
              topics: [],
              timeRange: filter.timeRange,
              confidenceRange: [0, 1],
              showDismissed: false
            })}
            className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Timeline Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Timeline Visualization</h3>
          <div className="text-sm text-gray-600">
            {isPlaying && `Playback: ${formatTime(playbackTime)}`}
          </div>
        </div>

        {/* Main Timeline Chart */}
        <div style={{ height: height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time"
                type="number"
                scale="linear"
                domain={filter.timeRange}
                tickFormatter={formatTime}
              />
              <YAxis 
                dataKey="confidence"
                domain={[0, 1]}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              {/* Insights by type */}
              {uniqueTypes.map(type => (
                <Scatter
                  key={type}
                  name={type.replace('_', ' ')}
                  data={timelineData.filter(d => d.type === type)}
                  fill={typeColors[type] || '#6B7280'}
                />
              ))}
              
              {/* Playback indicator */}
              {isPlaying && (
                <ReferenceLine x={playbackTime} stroke="#EF4444" strokeWidth={2} />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Topic Bands */}
        {(timelineMode === 'topics' || timelineMode === 'combined') && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Topic Segments</h4>
            <div className="relative h-8 bg-gray-100 rounded">
              {topics.map(topic => (
                <div
                  key={topic.id}
                  className="absolute h-full rounded opacity-70 flex items-center px-2"
                  style={{
                    left: `${((topic.startTime - filter.timeRange[0]) / (filter.timeRange[1] - filter.timeRange[0])) * 100}%`,
                    width: `${((topic.endTime - topic.startTime) / (filter.timeRange[1] - filter.timeRange[0])) * 100}%`,
                    backgroundColor: `hsl(${topic.id.charCodeAt(0) * 137.5 % 360}, 70%, 80%)`
                  }}
                  title={`${topic.label} (${formatTime(topic.startTime)} - ${formatTime(topic.endTime)})`}
                >
                  <span className="text-xs font-medium truncate">{topic.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Speaker Activity */}
        {(timelineMode === 'speakers' || timelineMode === 'combined') && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Speaker Activity</h4>
            <div className="space-y-1">
              {speakers.map((speaker, index) => (
                <div key={speaker.speaker} className="flex items-center">
                  <div className="w-20 text-xs font-medium text-gray-600 truncate">
                    {speaker.speaker}
                  </div>
                  <div className="flex-1 relative h-4 bg-gray-100 rounded ml-2">
                    <div
                      className="absolute h-full rounded"
                      style={{
                        left: `${((speaker.startTime - filter.timeRange[0]) / (filter.timeRange[1] - filter.timeRange[0])) * 100}%`,
                        width: `${((speaker.endTime - speaker.startTime) / (filter.timeRange[1] - filter.timeRange[0])) * 100}%`,
                        backgroundColor: `hsl(${index * 60}, 70%, 70%)`
                      }}
                      title={`${speaker.speaker}: ${speaker.segmentCount} segments`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Insights List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Insights Cards */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Insights ({filteredInsights.length})
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredInsights.map(insight => (
              <div
                key={insight.id}
                className={`p-3 border rounded cursor-pointer transition-colors ${
                  selectedInsight?.id === insight.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleInsightClick(insight)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: typeColors[insight.type] || '#6B7280' }}
                      />
                      <span className="text-sm font-medium">{insight.title}</span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        priorityColors[insight.priority] === '#DC2626' ? 'bg-red-100 text-red-800' :
                        priorityColors[insight.priority] === '#EF4444' ? 'bg-red-100 text-red-800' :
                        priorityColors[insight.priority] === '#F59E0B' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {insight.priority}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">{insight.summary}</p>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatTime(insight.meetingTimestamp)} | {insight.speaker}</span>
                      <span>{(insight.confidence * 100).toFixed(0)}% confidence</span>
                    </div>
                  </div>
                  
                  <div className="ml-2 flex flex-col space-y-1">
                    <select
                      value={insight.status}
                      onChange={(e) => handleStatusUpdate(insight.id, e.target.value as InsightData['status'])}
                      className="text-xs border border-gray-300 rounded px-1 py-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="completed">Completed</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Insight Details */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Insight Details</h3>
          
          {selectedInsight ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900">{selectedInsight.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{selectedInsight.content}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Type:</span>
                  <span className="ml-2">{selectedInsight.type.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Priority:</span>
                  <span className="ml-2">{selectedInsight.priority}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Speaker:</span>
                  <span className="ml-2">{selectedInsight.speaker || 'Unknown'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Time:</span>
                  <span className="ml-2">{formatTime(selectedInsight.meetingTimestamp)}</span>
                </div>
              </div>
              
              {selectedInsight.keywords.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 text-sm">Keywords:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedInsight.keywords.map(keyword => (
                      <span key={keyword} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedInsight.actionItems.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 text-sm">Action Items:</span>
                  <ul className="mt-1 space-y-1">
                    {selectedInsight.actionItems.map((item, index) => (
                      <li key={index} className="text-sm text-gray-600">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {selectedInsight.stakeholders.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 text-sm">Stakeholders:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedInsight.stakeholders.map(stakeholder => (
                      <span key={stakeholder} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                        {stakeholder}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Select an insight from the timeline or list to view details
            </p>
          )}
        </div>
      </div>

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">📊 Timeline Features:</h4>
        <ul className="text-blue-800 text-sm space-y-1">
          <li>• Interactive scatter plot showing insights over time with confidence levels</li>
          <li>• Color-coded insights by type and priority for easy identification</li>
          <li>• Topic segments and speaker activity visualization</li>
          <li>• Playback mode to replay the meeting insights chronologically</li>
          <li>• Advanced filtering by type, priority, speaker, topic, and confidence</li>
          <li>• Click insights for detailed view and status management</li>
        </ul>
      </div>
    </div>
  );
};