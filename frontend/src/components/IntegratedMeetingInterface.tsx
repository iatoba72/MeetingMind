// Integrated Meeting Interface with AI-Powered Insights
// Complete interface combining transcription, recording, and automatic insight generation

import React, { useState, useCallback, useEffect } from 'react';
import { 
  MicrophoneIcon, StopIcon, PlayIcon, PauseIcon,
  LightBulbIcon, DocumentTextIcon, UserGroupIcon,
  ChartBarIcon, CogIcon, SparklesIcon
} from '@heroicons/react/24/outline';
import { RecordingControls } from './RecordingControls';
import { MediaPlayback } from './MediaPlayback';
import { AdvancedTranscriptDisplay } from './AdvancedTranscriptDisplay';
import { RealtimeTranscription } from './RealtimeTranscription';
import { BrowserCompatibility } from './BrowserCompatibility';
import { ErrorBoundary, RecordingErrorBoundary, PlaybackErrorBoundary } from './ErrorBoundary';
import { InsightsTimeline } from './InsightsTimeline';
import { InsightStudio } from './InsightStudio';

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

interface TopicData {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  confidence: number;
  keywords: string[];
}

interface MeetingAnalytics {
  duration: number;
  speakers: string[];
  topicsDiscussed: number;
  insightsGenerated: number;
  actionItemsIdentified: number;
  averageConfidence: number;
  meetingPhase: string;
}

interface Meeting {
  id: string;
  name: string;
  startTime: Date;
  participants: string[];
  recordings: MeetingRecording[];
  liveTranscript: any[];
  insights: InsightData[];
  topics: TopicData[];
  analytics: MeetingAnalytics;
  status: 'scheduled' | 'live' | 'ended';
}

interface MeetingRecording {
  id: string;
  url: string;
  transcript: any[];
  duration: number;
  createdAt: Date;
  metadata: any;
}

interface IntegratedMeetingInterfaceProps {
  meeting?: Meeting;
  onMeetingUpdate?: (meeting: Meeting) => void;
}

export const IntegratedMeetingInterface: React.FC<IntegratedMeetingInterfaceProps> = ({
  meeting: initialMeeting,
  onMeetingUpdate,
}) => {
  // Meeting state
  const [meeting, setMeeting] = useState<Meeting>(initialMeeting || {
    id: 'demo_meeting',
    name: 'Weekly Team Standup',
    startTime: new Date(),
    participants: ['John Smith', 'Sarah Johnson', 'Mike Davis'],
    recordings: [],
    liveTranscript: [],
    insights: [],
    topics: [],
    analytics: {
      duration: 0,
      speakers: ['John Smith', 'Sarah Johnson', 'Mike Davis'],
      topicsDiscussed: 0,
      insightsGenerated: 0,
      actionItemsIdentified: 0,
      averageConfidence: 0,
      meetingPhase: 'starting'
    },
    status: 'scheduled',
  });

  // UI state
  const [currentView, setCurrentView] = useState<'live' | 'recordings' | 'transcripts' | 'insights' | 'studio' | 'analytics'>('live');
  const [selectedRecording, setSelectedRecording] = useState<MeetingRecording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string>('');
  const [insightSettings, setInsightSettings] = useState({
    autoGenerate: true,
    confidence: 0.6,
    realTimeMode: true,
    enableCustomRules: false
  });

  // Handle meeting updates
  const updateMeeting = useCallback((updates: Partial<Meeting>) => {
    const updatedMeeting = { ...meeting, ...updates };
    setMeeting(updatedMeeting);
    onMeetingUpdate?.(updatedMeeting);
  }, [meeting, onMeetingUpdate]);

  // Handle recording completion
  const handleRecordingComplete = useCallback((sessionId: string, mediaFile: any) => {
    const newRecording: MeetingRecording = {
      id: sessionId,
      url: mediaFile.url,
      transcript: mediaFile.transcript || [],
      duration: mediaFile.metadata?.duration || 0,
      createdAt: new Date(),
      metadata: mediaFile.metadata,
    };

    updateMeeting({
      recordings: [...meeting.recordings, newRecording],
    });

    setSelectedRecording(newRecording);
    setCurrentView('recordings');
    setIsRecording(false);
  }, [meeting.recordings, updateMeeting]);

  // Generate insights from transcript segment
  const generateInsightsFromSegment = useCallback((segment: any, timestamp: number) => {
    const text = segment.text.toLowerCase();
    const newInsights: InsightData[] = [];

    // Action item detection
    if (text.includes('action item') || text.includes('assign') || text.includes('take ownership')) {
      newInsights.push({
        id: `insight_action_${Date.now()}`,
        type: 'action_item',
        priority: 'high',
        confidence: 0.85,
        title: 'Action Item Identified',
        content: `Action item detected: ${segment.text}`,
        summary: 'Task assignment or action item identified',
        timestamp: Date.now(),
        meetingTimestamp: timestamp,
        speaker: segment.speaker,
        topicContext: 'Task Assignment',
        keywords: ['action', 'assign', 'ownership'],
        actionItems: [segment.text],
        stakeholders: [segment.speaker || 'Unknown'],
        status: 'completed'
      });
    }

    // Concern detection
    if (text.includes('concern') || text.includes('issue') || text.includes('problem')) {
      newInsights.push({
        id: `insight_concern_${Date.now()}`,
        type: 'concern',
        priority: 'high',
        confidence: 0.78,
        title: 'Concern Raised',
        content: `Concern identified: ${segment.text}`,
        summary: 'Issue or concern raised during discussion',
        timestamp: Date.now(),
        meetingTimestamp: timestamp,
        speaker: segment.speaker,
        topicContext: 'Risk Management',
        keywords: ['concern', 'issue', 'problem'],
        actionItems: [],
        stakeholders: [segment.speaker || 'Unknown'],
        status: 'completed'
      });
    }

    // Decision point detection
    if (text.includes('decide') || text.includes('decision') || text.includes('should we')) {
      newInsights.push({
        id: `insight_decision_${Date.now()}`,
        type: 'decision',
        priority: 'critical',
        confidence: 0.82,
        title: 'Decision Point',
        content: `Decision discussion: ${segment.text}`,
        summary: 'Decision point requiring team input',
        timestamp: Date.now(),
        meetingTimestamp: timestamp,
        speaker: segment.speaker,
        topicContext: 'Decision Making',
        keywords: ['decide', 'decision', 'should'],
        actionItems: [],
        stakeholders: ['Team'],
        status: 'completed'
      });
    }

    // Budget/business impact detection
    if (text.includes('budget') || text.includes('cost') || text.includes('finance')) {
      newInsights.push({
        id: `insight_business_${Date.now()}`,
        type: 'business_insight',
        priority: 'high',
        confidence: 0.75,
        title: 'Business Impact Discussion',
        content: `Financial considerations: ${segment.text}`,
        summary: 'Budget or financial impact discussed',
        timestamp: Date.now(),
        meetingTimestamp: timestamp,
        speaker: segment.speaker,
        topicContext: 'Financial Planning',
        keywords: ['budget', 'cost', 'finance'],
        actionItems: [],
        stakeholders: ['Finance Team'],
        status: 'completed'
      });
    }

    return newInsights;
  }, []);

  // Handle transcription updates with insight generation
  const handleTranscriptionUpdate = useCallback((result: any) => {
    const newSegments = result.segments || [];
    const updatedTranscript = [...meeting.liveTranscript, ...newSegments];
    
    // Generate insights from new segments if auto-generation is enabled
    let newInsights: InsightData[] = [];
    if (insightSettings.autoGenerate && meeting.status === 'live') {
      newSegments.forEach((segment: any) => {
        const timestamp = (Date.now() - meeting.startTime.getTime()) / 1000;
        const segmentInsights = generateInsightsFromSegment(segment, timestamp);
        newInsights = [...newInsights, ...segmentInsights];
        
        // Update current speaker
        if (segment.speaker) {
          setCurrentSpeaker(segment.speaker);
        }
      });
    }

    // Update analytics
    const updatedAnalytics = {
      ...meeting.analytics,
      duration: (Date.now() - meeting.startTime.getTime()) / 1000,
      insightsGenerated: meeting.insights.length + newInsights.length,
      actionItemsIdentified: [...meeting.insights, ...newInsights].filter(i => i.type === 'action_item').length,
      averageConfidence: [...meeting.insights, ...newInsights].length > 0 
        ? [...meeting.insights, ...newInsights].reduce((sum, i) => sum + i.confidence, 0) / [...meeting.insights, ...newInsights].length 
        : 0,
      meetingPhase: 'discussion' // Could be more sophisticated
    };

    updateMeeting({
      liveTranscript: updatedTranscript,
      insights: [...meeting.insights, ...newInsights],
      analytics: updatedAnalytics
    });
  }, [meeting.liveTranscript, meeting.insights, meeting.analytics, meeting.startTime, meeting.status, insightSettings.autoGenerate, updateMeeting, generateInsightsFromSegment]);

  // Start meeting
  const startMeeting = useCallback(() => {
    updateMeeting({
      status: 'live',
      startTime: new Date(),
    });
    setIsRecording(true);
  }, [updateMeeting]);

  // End meeting
  const endMeeting = useCallback(() => {
    updateMeeting({
      status: 'ended',
    });
    setIsRecording(false);
  }, [updateMeeting]);

  return (
    <BrowserCompatibility
      requireMediaRecorder={true}
      requireWebAudio={true}
      onUnsupported={(features) => {
        console.warn('Unsupported features:', features);
      }}
    >
      <ErrorBoundary>
        <div className="max-w-7xl mx-auto p-6">
          {/* Meeting Header */}
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{meeting.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center">
                    <span className={`w-3 h-3 rounded-full mr-2 ${
                      meeting.status === 'live' ? 'bg-red-500 animate-pulse' :
                      meeting.status === 'ended' ? 'bg-gray-400' : 'bg-yellow-500'
                    }`} />
                    <span className="capitalize">{meeting.status}</span>
                  </div>
                  
                  <div>
                    Started: {meeting.startTime.toLocaleTimeString()}
                  </div>
                  
                  <div>
                    Participants: {meeting.participants.length}
                  </div>
                  
                  <div>
                    Recordings: {meeting.recordings.length}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 mt-4 md:mt-0">
                {meeting.status === 'scheduled' && (
                  <button
                    onClick={startMeeting}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Start Meeting
                  </button>
                )}
                
                {meeting.status === 'live' && (
                  <button
                    onClick={endMeeting}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    End Meeting
                  </button>
                )}
                
                <div className="text-sm text-gray-500">
                  {meeting.status === 'live' && 'Recording in progress'}
                  {meeting.status === 'ended' && 'Meeting ended'}
                  {meeting.status === 'scheduled' && 'Ready to start'}
                </div>
              </div>
            </div>
          </div>

          {/* View Selector */}
          <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
            {[
              { id: 'live', label: 'Live Session', icon: '🔴', disabled: meeting.status !== 'live' },
              { id: 'insights', label: 'AI Insights', icon: '🧠', count: meeting.insights.length },
              { id: 'recordings', label: 'Recordings', icon: '📹', count: meeting.recordings.length },
              { id: 'transcripts', label: 'Transcripts', icon: '📝', count: meeting.liveTranscript.length },
              { id: 'studio', label: 'Insight Studio', icon: '🎛️' },
              { id: 'analytics', label: 'Analytics', icon: '📊' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id as any)}
                disabled={tab.disabled}
                className={`
                  flex-1 py-3 px-4 text-center border-b-2 transition-colors
                  ${currentView === tab.id 
                    ? 'border-blue-500 text-blue-600 bg-blue-50' 
                    : tab.disabled
                    ? 'border-transparent text-gray-400 cursor-not-allowed'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center justify-center space-x-2">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Content based on current view */}
          {currentView === 'live' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recording Controls */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Recording Controls</h2>
                <RecordingErrorBoundary>
                  <RecordingControls
                    onRecordingComplete={handleRecordingComplete}
                    onTranscriptionReady={(sessionId, segments) => {
                      console.log('Transcription ready:', sessionId, segments);
                    }}
                    enableVideo={true}
                    enableAutoUpload={true}
                    defaultConfig={{
                      audio: true,
                      video: false, // Audio-only for meetings by default
                      audioBitsPerSecond: 128000,
                    }}
                  />
                </RecordingErrorBoundary>
              </div>

              {/* Live Transcription */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Live Transcription</h2>
                <RealtimeTranscription
                  sessionId={meeting.id}
                  isActive={isRecording}
                  modelSize="base"
                  onTranscriptionUpdate={handleTranscriptionUpdate}
                  showMetrics={true}
                  showSpeakerLabels={true}
                  useAdvancedDisplay={false} // Use simple display for live
                />
              </div>
            </div>
          )}

          {currentView === 'recordings' && (
            <div className="space-y-6">
              {/* Recording List */}
              {meeting.recordings.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📹</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Recordings Yet</h3>
                  <p className="text-gray-600">
                    Start a live session to begin recording this meeting.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {meeting.recordings.map(recording => (
                      <div
                        key={recording.id}
                        className={`
                          p-4 border rounded-lg cursor-pointer transition-all
                          ${selectedRecording?.id === recording.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                          }
                        `}
                        onClick={() => setSelectedRecording(recording)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">Recording {recording.id.slice(-6)}</h3>
                          <span className="text-xs text-gray-500">
                            {recording.createdAt.toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>Duration: {Math.round(recording.duration / 1000)}s</div>
                          <div>Transcript: {recording.transcript.length} segments</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Selected Recording Playback */}
                  {selectedRecording && (
                    <div>
                      <h2 className="text-lg font-semibold mb-4">
                        Playback - Recording {selectedRecording.id.slice(-6)}
                      </h2>
                      <PlaybackErrorBoundary>
                        <MediaPlayback
                          audioUrl={selectedRecording.url}
                          segments={selectedRecording.transcript}
                          enableBookmarks={true}
                          enableAnnotations={true}
                          enableStudyMode={true}
                          enableSpeedControl={true}
                          enableSkipSilence={true}
                          onBookmarkAdd={(bookmark) => {
                            console.log('Bookmark added:', bookmark);
                          }}
                          onAnnotationAdd={(annotation) => {
                            console.log('Annotation added:', annotation);
                          }}
                        />
                      </PlaybackErrorBoundary>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {currentView === 'insights' && (
            <div className="space-y-6">
              {/* Insights Controls */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">AI Insights Settings</h3>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={insightSettings.autoGenerate}
                        onChange={(e) => setInsightSettings(prev => ({ ...prev, autoGenerate: e.target.checked }))}
                        className="mr-2"
                      />
                      <span className="text-sm">Auto-generate insights</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={insightSettings.realTimeMode}
                        onChange={(e) => setInsightSettings(prev => ({ ...prev, realTimeMode: e.target.checked }))}
                        className="mr-2"
                      />
                      <span className="text-sm">Real-time mode</span>
                    </label>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{meeting.insights.length}</div>
                    <div className="text-sm text-gray-600">Total Insights</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {meeting.insights.filter(i => i.priority === 'critical' || i.priority === 'high').length}
                    </div>
                    <div className="text-sm text-gray-600">High Priority</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{meeting.analytics.actionItemsIdentified}</div>
                    <div className="text-sm text-gray-600">Action Items</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {(meeting.analytics.averageConfidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-sm text-gray-600">Avg. Confidence</div>
                  </div>
                </div>
              </div>

              {/* Insights Timeline */}
              <InsightsTimeline
                insights={meeting.insights}
                topics={meeting.topics}
                speakers={meeting.analytics.speakers.map(speaker => ({
                  speaker,
                  startTime: 0,
                  endTime: meeting.analytics.duration,
                  segmentCount: meeting.liveTranscript.filter((s: any) => s.speaker === speaker).length
                }))}
                onInsightSelect={(insight) => {
                  console.log('Selected insight:', insight);
                }}
                onInsightUpdate={(insightId, updates) => {
                  const updatedInsights = meeting.insights.map(insight =>
                    insight.id === insightId ? { ...insight, ...updates } : insight
                  );
                  updateMeeting({ insights: updatedInsights });
                }}
              />
            </div>
          )}

          {currentView === 'studio' && (
            <InsightStudio
              onRuleCreated={(rule) => {
                console.log('Custom rule created:', rule);
              }}
              onRuleUpdated={(rule) => {
                console.log('Custom rule updated:', rule);
              }}
              onRuleDeleted={(ruleId) => {
                console.log('Custom rule deleted:', ruleId);
              }}
              existingRules={[]}
            />
          )}

          {currentView === 'analytics' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {Math.floor(meeting.analytics.duration / 60)}:{(meeting.analytics.duration % 60).toFixed(0).padStart(2, '0')}
                    </div>
                    <div className="text-gray-600">Meeting Duration</div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {meeting.analytics.speakers.length}
                    </div>
                    <div className="text-gray-600">Active Speakers</div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {meeting.analytics.insightsGenerated}
                    </div>
                    <div className="text-gray-600">Total Insights</div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-600">
                      {(meeting.analytics.averageConfidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-gray-600">Avg Confidence</div>
                  </div>
                </div>
              </div>

              {/* Meeting Phase and Real-time Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Progress</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Current Phase</span>
                        <span className="font-medium capitalize">{meeting.analytics.meetingPhase}</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Topics Discussed</span>
                        <span className="font-medium">{meeting.analytics.topicsDiscussed}</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Current Speaker</span>
                        <span className="font-medium">{currentSpeaker || 'None'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Insight Breakdown</h3>
                  <div className="space-y-3">
                    {['action_item', 'decision', 'concern', 'business_insight'].map(type => {
                      const count = meeting.insights.filter(i => i.type === type).length;
                      return (
                        <div key={type} className="flex justify-between items-center">
                          <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recent Insights Summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Insights</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {meeting.insights.slice(-5).reverse().map(insight => (
                    <div key={insight.id} className="p-3 border border-gray-100 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <LightBulbIcon className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm font-medium">{insight.title}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          insight.priority === 'critical' ? 'bg-red-100 text-red-800' :
                          insight.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                          insight.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {insight.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{insight.summary}</p>
                    </div>
                  ))}
                  {meeting.insights.length === 0 && (
                    <p className="text-center text-gray-500 py-4">
                      No insights generated yet
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentView === 'transcripts' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Meeting Transcripts</h2>
              
              {meeting.liveTranscript.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Transcript Available</h3>
                  <p className="text-gray-600">
                    Transcripts will appear here during live recording or after processing recordings.
                  </p>
                </div>
              ) : (
                <AdvancedTranscriptDisplay
                  segments={meeting.liveTranscript}
                  onSegmentEdit={(segmentId, newText) => {
                    const updatedTranscript = meeting.liveTranscript.map(segment =>
                      segment.id === segmentId 
                        ? { ...segment, text: newText, edited: true }
                        : segment
                    );
                    updateMeeting({ liveTranscript: updatedTranscript });
                  }}
                  onSegmentDelete={(segmentId) => {
                    const updatedTranscript = meeting.liveTranscript.filter(
                      segment => segment.id !== segmentId
                    );
                    updateMeeting({ liveTranscript: updatedTranscript });
                  }}
                  onJumpToTime={(timestamp) => {
                    console.log('Jump to time:', timestamp);
                    // Could integrate with recording playback
                  }}
                  showSpeakerLabels={true}
                  showTimestamps={true}
                  showConfidence={true}
                  isEditable={true}
                  height={600}
                />
              )}
            </div>
          )}

          {/* Meeting Summary */}
          <div className="mt-8 bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Meeting Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{meeting.participants.length}</div>
                <div className="text-sm text-gray-600">Participants</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-green-600">{meeting.recordings.length}</div>
                <div className="text-sm text-gray-600">Recordings</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-purple-600">{meeting.liveTranscript.length}</div>
                <div className="text-sm text-gray-600">Transcript Segments</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-yellow-600">{meeting.insights.length}</div>
                <div className="text-sm text-gray-600">AI Insights</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-red-600">{meeting.analytics.actionItemsIdentified}</div>
                <div className="text-sm text-gray-600">Action Items</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {meeting.status === 'live' 
                    ? Math.floor(meeting.analytics.duration / 60) + 'm'
                    : meeting.status === 'ended' ? 'Ended' : 'Ready'
                  }
                </div>
                <div className="text-sm text-gray-600">
                  {meeting.status === 'live' ? 'Duration' : 'Status'}
                </div>
              </div>
            </div>
            
            {/* AI Insights Summary */}
            {meeting.insights.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-md font-semibold mb-3 text-gray-900">🤖 AI-Generated Insights</h4>
                <div className="text-sm text-gray-600">
                  <p>
                    The AI system has automatically analyzed your meeting and generated {meeting.insights.length} insights 
                    including {meeting.analytics.actionItemsIdentified} action items. 
                    Average confidence: {(meeting.analytics.averageConfidence * 100).toFixed(0)}%.
                  </p>
                  <p className="mt-2">
                    Visit the <strong>AI Insights</strong> tab to view detailed analysis and the <strong>Insight Studio</strong> 
                    to customize insight generation rules.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </ErrorBoundary>
    </BrowserCompatibility>
  );
};