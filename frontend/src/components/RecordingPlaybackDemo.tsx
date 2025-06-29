// Complete Recording and Playback Demo
// Showcases all the implemented recording and playback features

import React, { useState, useCallback } from 'react';
import { RecordingControls } from './RecordingControls';
import { MediaPlayback } from './MediaPlayback';
import { StudyMode } from './StudyMode';
import { WaveformVisualization } from './WaveformVisualization';
import { TranscriptionSegment } from '../store/types';

// Sample data for demonstration
const sampleTranscript = [
  {
    id: '1',
    start_time: 0,
    end_time: 5.2,
    text: 'Welcome everyone to our weekly team meeting. Today we have several important topics to discuss.',
    words: [
      { word: 'Welcome', start: 0, end: 0.8, probability: 0.95 },
      { word: 'everyone', start: 0.8, end: 1.3, probability: 0.92 },
      { word: 'to', start: 1.3, end: 1.5, probability: 0.98 },
    ],
    confidence: 0.95,
    speaker: 'John Smith',
  },
  {
    id: '2',
    start_time: 5.5,
    end_time: 12.1,
    text: 'First on our agenda is the quarterly results review. Sarah, could you please share the latest numbers?',
    words: [],
    confidence: 0.91,
    speaker: 'John Smith',
  },
  {
    id: '3',
    start_time: 12.5,
    end_time: 18.7,
    text: 'Absolutely, John. I have the Q3 report ready. Revenue is up 15% compared to last quarter.',
    words: [],
    confidence: 0.93,
    speaker: 'Sarah Johnson',
  },
  {
    id: '4',
    start_time: 19.0,
    end_time: 25.3,
    text: 'That\'s excellent news! What about our customer acquisition metrics?',
    words: [],
    confidence: 0.88,
    speaker: 'Mike Davis',
  },
];

const sampleStudySession = {
  id: 'demo_session',
  name: 'Team Meeting - Q3 Review',
  mediaUrl: '/demo-audio.mp3', // Would be a real URL in production
  mediaType: 'audio' as const,
  transcript: sampleTranscript,
  notes: [
    {
      id: 'note1',
      timestamp: 15.0,
      title: 'Q3 Revenue Growth',
      content: 'Revenue increased by 15% - need to understand the key drivers behind this growth.',
      tags: ['revenue', 'growth', 'q3'],
      type: 'insight' as const,
      color: '#10B981',
      createdAt: new Date('2024-01-15T10:30:00'),
      updatedAt: new Date('2024-01-15T10:30:00'),
    },
    {
      id: 'note2',
      timestamp: 22.0,
      title: 'Customer Acquisition Question',
      content: 'Mike asked about customer acquisition metrics - should prepare detailed CAC analysis.',
      tags: ['customer-acquisition', 'metrics', 'action'],
      type: 'action' as const,
      color: '#F59E0B',
      createdAt: new Date('2024-01-15T10:31:00'),
      updatedAt: new Date('2024-01-15T10:31:00'),
    },
  ],
  bookmarks: [
    {
      id: 'bookmark1',
      timestamp: 12.5,
      title: 'Q3 Results Start',
      description: 'Sarah begins presenting quarterly results',
      color: '#3B82F6',
      createdAt: new Date('2024-01-15T10:25:00'),
    },
  ],
  loopSections: [
    {
      id: 'loop1',
      start: 12.5,
      end: 18.7,
      title: 'Q3 Revenue Discussion',
      description: 'Important discussion about revenue growth',
      playCount: 2,
      targetPlays: 3,
      difficulty: 'medium' as const,
      masteryLevel: 67,
      notes: ['Revenue up 15%', 'Need to analyze drivers'],
      isActive: true,
    },
  ],
  totalStudyTime: 45, // minutes
  completionPercentage: 67,
  createdAt: new Date('2024-01-15T09:00:00'),
  lastAccessed: new Date('2024-01-15T10:30:00'),
};

interface RecordingPlaybackDemoProps {
  className?: string;
}

export const RecordingPlaybackDemo: React.FC<RecordingPlaybackDemoProps> = ({
  className = ''
}) => {
  const [currentTab, setCurrentTab] = useState<'recording' | 'playback' | 'study' | 'waveform'>('recording');
  const [recordings, setRecordings] = useState<Array<{ id: string; name: string; url: string; duration: number; transcription?: TranscriptionSegment[] }>>([]);
  const [selectedRecording, setSelectedRecording] = useState<{ id: string; name: string; url: string; duration: number; transcription?: TranscriptionSegment[] } | null>(null);
  const [studySession, setStudySession] = useState(sampleStudySession);

  // Handle recording completion
  const handleRecordingComplete = useCallback((sessionId: string, mediaFile: { url: string; duration: number }) => {
    const newRecording = {
      id: sessionId,
      ...mediaFile,
      transcript: [], // Would be populated when transcription completes
      createdAt: new Date(),
    };
    
    setRecordings(prev => [...prev, newRecording]);
    setSelectedRecording(newRecording);
    
    // Auto-switch to playback tab
    setCurrentTab('playback');
  }, []);

  // Handle transcription ready
  const handleTranscriptionReady = useCallback((sessionId: string, segments: TranscriptionSegment[]) => {
    setRecordings(prev => prev.map(recording => 
      recording.id === sessionId 
        ? { ...recording, transcript: segments }
        : recording
    ));
    
    if (selectedRecording?.id === sessionId) {
      setSelectedRecording(prev => ({ ...prev, transcript: segments }));
    }
  }, [selectedRecording]);

  // Handle study session updates
  const handleStudySessionUpdate = useCallback((updatedSession: typeof sampleStudySession) => {
    setStudySession(updatedSession);
  }, []);

  return (
    <div className={`max-w-7xl mx-auto p-6 ${className}`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🎥 Recording & Playback System Demo
        </h1>
        <p className="text-gray-600">
          Complete demonstration of MeetingMind's advanced recording and playback capabilities
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        {[
          { id: 'recording', label: 'Recording', icon: '🎙️', description: 'Record audio/video' },
          { id: 'playback', label: 'Playback', icon: '▶️', description: 'Media playback with sync' },
          { id: 'study', label: 'Study Mode', icon: '📚', description: 'Learning tools' },
          { id: 'waveform', label: 'Waveform', icon: '〰️', description: 'Audio visualization' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id as 'record' | 'playback' | 'analysis')}
            className={`
              flex-1 py-4 px-6 text-center border-b-2 transition-colors
              ${currentTab === tab.id 
                ? 'border-blue-500 text-blue-600 bg-blue-50' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex flex-col items-center space-y-1">
              <span className="text-2xl">{tab.icon}</span>
              <span className="font-medium">{tab.label}</span>
              <span className="text-xs text-gray-500">{tab.description}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200">
        {/* Recording Tab */}
        {currentTab === 'recording' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Audio/Video Recording</h2>
              <p className="text-gray-600">
                Record meetings, lectures, or interviews with advanced device management and quality controls.
              </p>
            </div>
            
            <RecordingControls
              onRecordingComplete={handleRecordingComplete}
              onTranscriptionReady={handleTranscriptionReady}
              enableVideo={true}
              enableAutoUpload={true}
              className="max-w-4xl mx-auto"
            />
            
            {/* Recording List */}
            {recordings.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Recent Recordings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recordings.map(recording => (
                    <div
                      key={recording.id}
                      className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedRecording(recording);
                        setCurrentTab('playback');
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium truncate">{recording.session?.name || 'Untitled Recording'}</h4>
                        <span className="text-xs text-gray-500">
                          {new Date(recording.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>Type: {recording.session?.type || 'Unknown'}</div>
                        <div>Duration: {recording.metadata?.duration ? Math.round(recording.metadata.duration / 1000) : 0}s</div>
                        <div>Status: {recording.transcript?.length > 0 ? 'Transcribed' : 'Processing'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Playback Tab */}
        {currentTab === 'playback' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Advanced Media Playback</h2>
              <p className="text-gray-600">
                Synchronized transcript playback with bookmarks, annotations, and advanced controls.
              </p>
            </div>
            
            {selectedRecording || sampleTranscript.length > 0 ? (
              <MediaPlayback
                audioUrl={selectedRecording?.url || '/demo-audio.mp3'}
                segments={selectedRecording?.transcript || sampleTranscript}
                enableBookmarks={true}
                enableAnnotations={true}
                enableStudyMode={true}
                enableSpeedControl={true}
                enableSkipSilence={true}
                showWaveform={true}
                onBookmarkAdd={(bookmark) => {
                  console.log('Bookmark added:', bookmark);
                }}
                onAnnotationAdd={(annotation) => {
                  console.log('Annotation added:', annotation);
                }}
                onSegmentClick={(segment) => {
                  console.log('Segment clicked:', segment);
                }}
                className="max-w-6xl mx-auto"
              />
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🎵</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Recording Selected</h3>
                <p className="text-gray-600 mb-4">
                  Record something first or select from your recent recordings to see playback features.
                </p>
                <button
                  onClick={() => setCurrentTab('recording')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Start Recording
                </button>
              </div>
            )}
          </div>
        )}

        {/* Study Mode Tab */}
        {currentTab === 'study' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Study Mode</h2>
              <p className="text-gray-600">
                Advanced learning tools with loop sections, note-taking, and progress tracking.
              </p>
            </div>
            
            <StudyMode
              session={studySession}
              onSessionUpdate={handleStudySessionUpdate}
              className="max-w-full"
            />
          </div>
        )}

        {/* Waveform Tab */}
        {currentTab === 'waveform' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Waveform Visualization</h2>
              <p className="text-gray-600">
                Interactive audio waveform with zoom, regions, markers, and real-time analysis.
              </p>
            </div>
            
            <div className="space-y-8">
              {/* Static Waveform Demo */}
              <div>
                <h3 className="text-lg font-medium mb-4">Static Audio Waveform</h3>
                <div className="bg-gray-50 rounded-lg p-6">
                  <WaveformVisualization
                    audioUrl="/demo-audio.mp3"
                    width={800}
                    height={200}
                    showGrid={true}
                    showTimeLabels={true}
                    normalize={true}
                    smoothing={true}
                    regions={[
                      {
                        id: 'region1',
                        start: 12.5,
                        end: 18.7,
                        color: '#3B82F6',
                        label: 'Q3 Results',
                        opacity: 0.3,
                      },
                      {
                        id: 'region2',
                        start: 19.0,
                        end: 25.3,
                        color: '#10B981',
                        label: 'Customer Metrics',
                        opacity: 0.2,
                      },
                    ]}
                    markers={[
                      {
                        id: 'marker1',
                        time: 12.5,
                        color: '#DC2626',
                        label: 'Start',
                        type: 'bookmark',
                      },
                      {
                        id: 'marker2',
                        time: 22.0,
                        color: '#F59E0B',
                        label: 'Question',
                        type: 'annotation',
                      },
                    ]}
                    onSeek={(time) => {
                      console.log('Seek to:', time);
                    }}
                    onRegionSelect={(start, end) => {
                      console.log('Region selected:', start, end);
                    }}
                    className="mx-auto"
                  />
                </div>
              </div>
              
              {/* Feature Showcase */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-blue-50 rounded-lg p-6">
                  <h4 className="font-semibold text-blue-900 mb-2">🎯 Interactive Features</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Click to seek to specific time</li>
                    <li>• Drag to select regions</li>
                    <li>• Ctrl+Scroll to zoom in/out</li>
                    <li>• Scroll to pan left/right</li>
                    <li>• Visual markers and bookmarks</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 rounded-lg p-6">
                  <h4 className="font-semibold text-green-900 mb-2">📊 Visualization Options</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• Grid lines for precise timing</li>
                    <li>• Amplitude normalization</li>
                    <li>• Smooth waveform rendering</li>
                    <li>• Custom color schemes</li>
                    <li>• Time and amplitude labels</li>
                  </ul>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-6">
                  <h4 className="font-semibold text-purple-900 mb-2">⚡ Performance</h4>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• Canvas-based rendering</li>
                    <li>• Efficient peak detection</li>
                    <li>• Level-of-detail zooming</li>
                    <li>• Real-time audio analysis</li>
                    <li>• Memory-efficient caching</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feature Summary */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">🚀 Complete Feature Set</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Recording</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ Audio/Video capture</li>
              <li>✅ Device management</li>
              <li>✅ Quality presets</li>
              <li>✅ Real-time monitoring</li>
              <li>✅ Chunked processing</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Upload & Storage</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ Chunked uploads</li>
              <li>✅ Resume capability</li>
              <li>✅ Compression options</li>
              <li>✅ Storage tiers</li>
              <li>✅ Metadata management</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Playback</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ Synchronized transcript</li>
              <li>✅ Speed controls</li>
              <li>✅ Skip silence</li>
              <li>✅ Bookmarks</li>
              <li>✅ Annotations</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Study Tools</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ Loop sections</li>
              <li>✅ Note-taking</li>
              <li>✅ Progress tracking</li>
              <li>✅ Study analytics</li>
              <li>✅ Export options</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};