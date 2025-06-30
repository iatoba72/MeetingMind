// Speaker Labeling Interface Component
// UI for labeling unknown speakers in meetings

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  UserIcon, 
  MagnifyingGlassIcon, 
  PlusIcon, 
  CheckIcon, 
  SpeakerWaveIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface UnknownSpeaker {
  speakerId: string;
  segmentCount: number;
  totalSpeakingTime: number;
  speakingPercentage: number;
  averageConfidence: number;
  firstAppearedAt: number;
  lastAppearedAt: number;
  sampleSegments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    audioBlob?: Blob;
  }>;
}

interface KnownSpeaker {
  id: string;
  name: string;
  email?: string;
  role: string;
  confidence: number;
  lastSeen?: string;
}


interface SpeakerLabelingInterfaceProps {
  sessionId: string;
  unknownSpeakers: UnknownSpeaker[];
  knownSpeakers: KnownSpeaker[];
  onSpeakerLabeled: (speakerId: string, labeledAs: string, method: string) => void;
  onCreateNewSpeaker: (speakerData: { name: string; email?: string; role: string }) => void;
  onSkipSpeaker: (speakerId: string) => void;
}

export const SpeakerLabelingInterface: React.FC<SpeakerLabelingInterfaceProps> = ({
  sessionId,
  unknownSpeakers,
  knownSpeakers,
  onSpeakerLabeled,
  onCreateNewSpeaker,
  onSkipSpeaker
}) => {
  const [selectedSpeaker, setSelectedSpeaker] = useState<UnknownSpeaker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewSpeakerForm, setShowNewSpeakerForm] = useState(false);
  const [newSpeakerData, setNewSpeakerData] = useState({
    name: '',
    email: '',
    role: 'participant'
  });
  const [playingSegment, setPlayingSegment] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ speaker: KnownSpeaker; confidence: number }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Auto-select first unknown speaker
  useEffect(() => {
    if (unknownSpeakers.length > 0 && !selectedSpeaker) {
      setSelectedSpeaker(unknownSpeakers[0]);
    }
  }, [unknownSpeakers, selectedSpeaker]);

  // Get suggestions when speaker is selected
  useEffect(() => {
    if (selectedSpeaker) {
      getSpeakerSuggestions(selectedSpeaker.speakerId);
    }
  }, [selectedSpeaker, getSpeakerSuggestions]);

  const getSpeakerSuggestions = useCallback(async (speakerId: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`http://localhost:8000/speaker-detection/${sessionId}/suggestions/${speakerId}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to get speaker suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [sessionId]);

  const filteredKnownSpeakers = knownSpeakers.filter(speaker =>
    speaker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (speaker.email && speaker.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const playAudioSegment = (segment: UnknownSpeaker['sampleSegments'][0]) => {
    if (segment.audioBlob && audioRef.current) {
      const audioUrl = URL.createObjectURL(segment.audioBlob);
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setPlayingSegment(segment.id);
      
      audioRef.current.onended = () => {
        setPlayingSegment(null);
        URL.revokeObjectURL(audioUrl);
      };
    }
  };

  const handleLabelSpeaker = (knownSpeakerId: string, method: string = 'manual') => {
    if (selectedSpeaker) {
      onSpeakerLabeled(selectedSpeaker.speakerId, knownSpeakerId, method);
      // Move to next unknown speaker
      const currentIndex = unknownSpeakers.findIndex(s => s.speakerId === selectedSpeaker.speakerId);
      if (currentIndex < unknownSpeakers.length - 1) {
        setSelectedSpeaker(unknownSpeakers[currentIndex + 1]);
      } else {
        setSelectedSpeaker(null);
      }
    }
  };

  const handleCreateNewSpeaker = () => {
    if (newSpeakerData.name.trim()) {
      onCreateNewSpeaker(newSpeakerData);
      setNewSpeakerData({ name: '', email: '', role: 'participant' });
      setShowNewSpeakerForm(false);
      
      // Move to next speaker
      if (selectedSpeaker) {
        const currentIndex = unknownSpeakers.findIndex(s => s.speakerId === selectedSpeaker.speakerId);
        if (currentIndex < unknownSpeakers.length - 1) {
          setSelectedSpeaker(unknownSpeakers[currentIndex + 1]);
        } else {
          setSelectedSpeaker(null);
        }
      }
    }
  };

  const handleSkipSpeaker = () => {
    if (selectedSpeaker) {
      onSkipSpeaker(selectedSpeaker.speakerId);
      const currentIndex = unknownSpeakers.findIndex(s => s.speakerId === selectedSpeaker.speakerId);
      if (currentIndex < unknownSpeakers.length - 1) {
        setSelectedSpeaker(unknownSpeakers[currentIndex + 1]);
      } else {
        setSelectedSpeaker(null);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRoleColor = (role: string): string => {
    switch (role.toLowerCase()) {
      case 'host': return 'bg-purple-100 text-purple-800';
      case 'presenter': return 'bg-blue-100 text-blue-800';
      case 'participant': return 'bg-green-100 text-green-800';
      case 'guest': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (unknownSpeakers.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <CheckIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          All Speakers Identified!
        </h3>
        <p className="text-gray-600">
          All speakers in this session have been successfully identified.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Speaker Identification</h3>
          <p className="text-gray-600">
            {unknownSpeakers.length} unknown speaker{unknownSpeakers.length !== 1 ? 's' : ''} to identify
          </p>
        </div>
        
        <div className="text-right">
          <div className="text-sm text-gray-600">Session: {sessionId}</div>
          <div className="text-sm text-gray-500">
            {selectedSpeaker ? `Speaker ${unknownSpeakers.findIndex(s => s.speakerId === selectedSpeaker.speakerId) + 1} of ${unknownSpeakers.length}` : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unknown Speakers List */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Unknown Speakers</h4>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {unknownSpeakers.map((speaker) => (
              <div
                key={speaker.speakerId}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  selectedSpeaker?.speakerId === speaker.speakerId
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedSpeaker(speaker)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <span className="font-medium text-gray-900">
                      {speaker.speakerId.replace('speaker_', 'Speaker ')}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {Math.round(speaker.speakingPercentage)}%
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div className="flex items-center space-x-1">
                    <SpeakerWaveIcon className="w-3 h-3" />
                    <span>{speaker.segmentCount} segments</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <ClockIcon className="w-3 h-3" />
                    <span>{formatTime(speaker.totalSpeakingTime)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Speaker Details & Audio */}
        <div className="space-y-4">
          {selectedSpeaker ? (
            <>
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">
                  {selectedSpeaker.speakerId.replace('speaker_', 'Speaker ')} Details
                </h4>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Speaking Time:</span>
                      <div className="font-medium">{formatTime(selectedSpeaker.totalSpeakingTime)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Percentage:</span>
                      <div className="font-medium">{Math.round(selectedSpeaker.speakingPercentage)}%</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Segments:</span>
                      <div className="font-medium">{selectedSpeaker.segmentCount}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Confidence:</span>
                      <div className="font-medium">{Math.round(selectedSpeaker.averageConfidence * 100)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Audio Samples */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-3">Voice Samples</h5>
                
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedSpeaker.sampleSegments.map((segment) => (
                    <div key={segment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex-1 mr-3">
                        <div className="text-sm font-medium text-gray-900">
                          {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {segment.text || 'No transcription available'}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => playAudioSegment(segment)}
                        disabled={!segment.audioBlob}
                        className={`p-2 rounded ${
                          playingSegment === segment.id
                            ? 'bg-blue-600 text-white'
                            : segment.audioBlob
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <SpeakerWaveIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Suggestions */}
              {suggestions.length > 0 && (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                  <h5 className="font-medium text-blue-900 mb-3">
                    🤖 AI Suggestions
                  </h5>
                  {isAnalyzing ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-blue-700 text-sm mt-2">Analyzing voice patterns...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.slice(0, 3).map((suggestion) => (
                        <div key={suggestion.speaker.id} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div>
                            <div className="font-medium text-gray-900">{suggestion.speaker.name}</div>
                            <div className="text-sm text-gray-600">{suggestion.speaker.role}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-blue-600 font-medium">
                              {Math.round(suggestion.confidence * 100)}%
                            </span>
                            <button
                              onClick={() => handleLabelSpeaker(suggestion.speaker.id, 'suggested')}
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select an unknown speaker to see details
            </div>
          )}
        </div>

        {/* Known Speakers & Actions */}
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Identify As</h4>
            
            {/* Search */}
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search speakers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Known Speakers List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredKnownSpeakers.map((speaker) => (
                <div
                  key={speaker.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleLabelSpeaker(speaker.id)}
                >
                  <div>
                    <div className="font-medium text-gray-900">{speaker.name}</div>
                    {speaker.email && (
                      <div className="text-sm text-gray-600">{speaker.email}</div>
                    )}
                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${getRoleColor(speaker.role)}`}>
                      {speaker.role}
                    </span>
                  </div>
                  <CheckIcon className="w-5 h-5 text-green-600" />
                </div>
              ))}
            </div>
            
            {filteredKnownSpeakers.length === 0 && searchTerm && (
              <div className="text-center py-4 text-gray-500">
                No speakers found matching "{searchTerm}"
              </div>
            )}
          </div>

          {/* New Speaker Form */}
          <div className="border-t pt-4">
            {!showNewSpeakerForm ? (
              <button
                onClick={() => setShowNewSpeakerForm(true)}
                className="w-full flex items-center justify-center space-x-2 p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700"
              >
                <PlusIcon className="w-5 h-5" />
                <span>Create New Speaker</span>
              </button>
            ) : (
              <div className="space-y-3">
                <h5 className="font-medium text-gray-900">New Speaker</h5>
                
                <input
                  type="text"
                  placeholder="Full name"
                  value={newSpeakerData.name}
                  onChange={(e) => setNewSpeakerData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={newSpeakerData.email}
                  onChange={(e) => setNewSpeakerData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <select
                  value={newSpeakerData.role}
                  onChange={(e) => setNewSpeakerData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="participant">Participant</option>
                  <option value="host">Host</option>
                  <option value="presenter">Presenter</option>
                  <option value="guest">Guest</option>
                </select>
                
                <div className="flex space-x-2">
                  <button
                    onClick={handleCreateNewSpeaker}
                    disabled={!newSpeakerData.name.trim()}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewSpeakerForm(false)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {selectedSpeaker && (
            <div className="border-t pt-4 space-y-2">
              <button
                onClick={handleSkipSpeaker}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Skip This Speaker
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
};