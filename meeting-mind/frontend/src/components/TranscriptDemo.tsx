// Demo component showing the Advanced Transcript Display
import React, { useState } from 'react';
import { AdvancedTranscriptDisplay } from './AdvancedTranscriptDisplay';

// Sample transcript data for demonstration
const sampleSegments = [
  {
    id: '1',
    start_time: 0,
    end_time: 5.2,
    text: 'Welcome to our meeting today. We have several important topics to discuss.',
    words: [
      { word: 'Welcome', start: 0, end: 0.8, probability: 0.95 },
      { word: 'to', start: 0.8, end: 1.0, probability: 0.98 },
      { word: 'our', start: 1.0, end: 1.3, probability: 0.92 },
      { word: 'meeting', start: 1.3, end: 1.8, probability: 0.96 },
      { word: 'today', start: 1.8, end: 2.3, probability: 0.94 }
    ],
    confidence: 0.95,
    speaker: 'John Smith',
    is_final: true
  },
  {
    id: '2',
    start_time: 5.5,
    end_time: 12.1,
    text: 'First, let\'s review the quarterly results and discuss our performance metrics.',
    words: [
      { word: 'First', start: 5.5, end: 5.9, probability: 0.97 },
      { word: 'let\'s', start: 5.9, end: 6.3, probability: 0.89 },
      { word: 'review', start: 6.3, end: 6.9, probability: 0.94 }
    ],
    confidence: 0.91,
    speaker: 'John Smith',
    is_final: true
  },
  {
    id: '3',
    start_time: 12.5,
    end_time: 18.7,
    text: 'Thanks John. I have the Q3 report ready. Revenue is up 15% compared to last quarter.',
    words: [
      { word: 'Thanks', start: 12.5, end: 12.9, probability: 0.96 },
      { word: 'John', start: 12.9, end: 13.2, probability: 0.98 },
      { word: 'I', start: 13.5, end: 13.6, probability: 0.99 }
    ],
    confidence: 0.93,
    speaker: 'Sarah Johnson',
    is_final: true
  },
  {
    id: '4',
    start_time: 19.0,
    end_time: 25.3,
    text: 'That\'s excellent news! What about our customer acquisition metrics?',
    words: [],
    confidence: 0.88,
    speaker: 'Mike Davis',
    is_final: true
  },
  {
    id: '5',
    start_time: 25.6,
    end_time: 32.1,
    text: 'Customer acquisition is performing well. We gained 1,200 new customers this quarter.',
    words: [],
    confidence: 0.92,
    speaker: 'Sarah Johnson',
    is_final: true
  }
];

export const TranscriptDemo: React.FC = () => {
  const [segments, setSegments] = useState(sampleSegments);

  const handleSegmentEdit = (segmentId: string, newText: string) => {
    setSegments(prev => prev.map(segment => 
      segment.id === segmentId 
        ? { 
            ...segment, 
            text: newText
          }
        : segment
    ));
  };

  const handleSegmentDelete = (segmentId: string) => {
    setSegments(prev => prev.filter(segment => segment.id !== segmentId));
  };

  const handleJumpToTime = (timestamp: number) => {
    console.log(`Jumping to time: ${timestamp} seconds`);
    // In a real implementation, this would control audio/video playback
    alert(`Would jump to ${timestamp} seconds`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Advanced Transcript Display Demo
        </h1>
        <p className="text-gray-600">
          This demo showcases all the features of the advanced transcript display component:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
          <li><strong>Virtual Scrolling:</strong> Efficient rendering for large transcripts</li>
          <li><strong>Search & Filter:</strong> Search text, filter by speaker or confidence</li>
          <li><strong>Editing:</strong> Click the edit button to modify transcript text</li>
          <li><strong>Timestamp Navigation:</strong> Click timestamps to jump to that time</li>
          <li><strong>Export Options:</strong> Export as TXT, SRT, or JSON</li>
          <li><strong>Keyboard Shortcuts:</strong> Press Ctrl+F to search, Ctrl+P for presentation mode</li>
          <li><strong>Presentation Mode:</strong> Large text for screen sharing</li>
          <li><strong>Accessibility:</strong> Full keyboard navigation and screen reader support</li>
        </ul>
      </div>

      <AdvancedTranscriptDisplay
        segments={segments}
        onSegmentEdit={handleSegmentEdit}
        onSegmentDelete={handleSegmentDelete}
        onJumpToTime={handleJumpToTime}
        showSpeakerLabels={true}
        showTimestamps={true}
        showConfidence={true}
        isEditable={true}
        height={500}
        className="shadow-lg"
      />

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">How to Use:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <h4 className="font-medium">Search & Filter:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Use the search box to find specific text</li>
              <li>Filter by speaker using the dropdown</li>
              <li>Adjust minimum confidence with the slider</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Editing & Export:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Click the edit button (✏️) to modify text</li>
              <li>Select segments and export in various formats</li>
              <li>Use presentation mode for large displays</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};