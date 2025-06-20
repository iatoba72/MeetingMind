// Real-time Transcription Display Component
// Shows live transcription with speaker timestamps and confidence indicators

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AdvancedTranscriptDisplay } from './AdvancedTranscriptDisplay';

interface TranscriptionSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  words: Array<{
    word: string;
    start: number;
    end: number;
    probability: number;
  }>;
  confidence: number;
  speaker?: string;
  is_final: boolean;
  edited?: boolean;
  original_text?: string;
}

interface TranscriptionMetrics {
  processing_time_ms: number;
  audio_duration_ms: number;
  real_time_factor: number;
  words_per_second: number;
  confidence_score: number;
}

interface TranscriptionResult {
  session_id: string;
  audio_chunk_id: string;
  segments: TranscriptionSegment[];
  language: string;
  language_probability: number;
  full_text: string;
  metrics: TranscriptionMetrics;
  timestamp: string;
}

interface RealtimeTranscriptionProps {
  sessionId: string;
  isActive: boolean;
  modelSize?: string;
  language?: string;
  onTranscriptionUpdate?: (result: TranscriptionResult) => void;
  showMetrics?: boolean;
  showSpeakerLabels?: boolean;
  useAdvancedDisplay?: boolean;
}

export const RealtimeTranscription: React.FC<RealtimeTranscriptionProps> = ({
  sessionId,
  isActive,
  modelSize = 'base',
  language,
  onTranscriptionUpdate,
  showMetrics = true,
  showSpeakerLabels = true,
  useAdvancedDisplay = false
}) => {
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [metrics, setMetrics] = useState<TranscriptionMetrics | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);

  // Handler for segment editing
  const handleSegmentEdit = (segmentId: string, newText: string) => {
    setSegments(prev => prev.map(segment => 
      segment.id === segmentId 
        ? { ...segment, text: newText, edited: true, original_text: segment.original_text || segment.text }
        : segment
    ));
  };

  // Handler for segment deletion
  const handleSegmentDelete = (segmentId: string) => {
    setSegments(prev => prev.filter(segment => segment.id !== segmentId));
  };

  // Handler for timestamp navigation
  const handleJumpToTime = (timestamp: number) => {
    // This would integrate with audio/video player controls
    console.log('Jump to time:', timestamp);
    // You can implement actual seeking functionality here
  };
  
  // Auto-scroll to bottom when new transcription arrives
  useEffect(() => {
    if (transcriptionContainerRef.current) {
      transcriptionContainerRef.current.scrollTop = transcriptionContainerRef.current.scrollHeight;
    }
  }, [segments]);

  // Audio level monitoring
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    setAudioLevel(average / 255);
    
    if (isActive) {
      requestAnimationFrame(updateAudioLevel);
    }
  }, [isActive]);

  // Start audio recording and transcription
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Setup audio context for level monitoring
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      updateAudioLevel();

      // Setup media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          await processAudioChunk(audioBlob);
        }
      };

      // Record in 3-second chunks for real-time processing
      mediaRecorder.start(3000);
      
      mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0 && isActive) {
          const audioBlob = new Blob([event.data], { type: 'audio/webm' });
          await processAudioChunk(audioBlob);
          
          // Continue recording if still active
          if (isActive && mediaRecorder.state === 'inactive') {
            chunksRef.current = [];
            mediaRecorder.start(3000);
          }
        }
      });

    } catch (err) {
      setError('Failed to access microphone: ' + (err as Error).message);
    }
  }, [isActive]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    setAudioLevel(0);
  }, []);

  // Process audio chunk for transcription
  const processAudioChunk = async (audioBlob: Blob) => {
    if (!isActive) return;
    
    setIsProcessing(true);
    
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      const response = await fetch('http://localhost:8000/transcription/process-chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          audio_data: base64Audio,
          sample_rate: 16000,
          model_size: modelSize,
          language: language || null,
          priority: 'high'
        }),
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result: TranscriptionResult = await response.json();
      
      if (result.segments && result.segments.length > 0) {
        // Process segments with speaker identification
        const processedSegments = result.segments.map(segment => ({
          ...segment,
          speaker: identifySpeaker(segment),
          is_final: true
        }));
        
        setSegments(prev => [...prev, ...processedSegments]);
        setMetrics(result.metrics);
        
        // Notify parent component
        onTranscriptionUpdate?.(result);
      }
      
    } catch (err) {
      setError('Transcription processing failed: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Simple speaker identification (placeholder)
  const identifySpeaker = (segment: TranscriptionSegment): string => {
    // This is a simplified speaker identification
    // In a real implementation, you'd use speaker diarization
    const avgConfidence = segment.confidence;
    
    if (avgConfidence > 0.8) {
      return 'Speaker A';
    } else if (avgConfidence > 0.6) {
      return 'Speaker B';
    } else {
      return 'Unknown';
    }
  };

  // Format timestamp
  const formatTimestamp = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Start/stop recording based on isActive prop
  useEffect(() => {
    if (isActive) {
      startRecording();
    } else {
      stopRecording();
    }
    
    return () => {
      stopRecording();
    };
  }, [isActive, startRecording, stopRecording]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Live Transcription</h3>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Session: {sessionId}</span>
            <span>Model: {modelSize}</span>
            {language && <span>Language: {language}</span>}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Audio Level Indicator */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Audio:</span>
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-100"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
          </div>
          
          {/* Status Indicator */}
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
            }`} />
            <span className={`text-sm font-medium ${
              isActive ? 'text-green-600' : 'text-gray-500'
            }`}>
              {isActive ? 'Recording' : 'Stopped'}
            </span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex">
            <span className="text-red-500 mr-2">⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Transcription Display */}
      {useAdvancedDisplay ? (
        <AdvancedTranscriptDisplay
          segments={segments}
          onSegmentEdit={handleSegmentEdit}
          onSegmentDelete={handleSegmentDelete}
          onJumpToTime={handleJumpToTime}
          showSpeakerLabels={showSpeakerLabels}
          showTimestamps={true}
          showConfidence={true}
          isEditable={true}
          height={400}
          className="mt-4"
        />
      ) : (
        <div 
          ref={transcriptionContainerRef}
          className="max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-4 space-y-3"
        >
          {segments.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {isActive ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span>Listening for speech...</span>
                </div>
              ) : (
                'No transcription available. Start recording to see live transcription.'
              )}
            </div>
          ) : (
            segments.map((segment) => (
              <div 
                key={segment.id}
                className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm"
              >
                {/* Segment Header */}
                <div className="flex justify-between items-center mb-2 text-xs text-gray-500">
                  <div className="flex items-center space-x-3">
                    <span className="font-medium">
                      {formatTimestamp(segment.start_time)} - {formatTimestamp(segment.end_time)}
                    </span>
                    
                    {showSpeakerLabels && segment.speaker && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {segment.speaker}
                      </span>
                    )}
                    
                    <span className={`font-medium ${getConfidenceColor(segment.confidence)}`}>
                      {Math.round(segment.confidence * 100)}% confidence
                    </span>
                  </div>
                  
                  {isProcessing && (
                    <div className="flex items-center space-x-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
                
                {/* Transcription Text */}
                <div className="text-gray-900 leading-relaxed">
                  {segment.words && segment.words.length > 0 ? (
                    <span>
                      {segment.words.map((word, index) => (
                        <span
                          key={index}
                          className={`inline ${getConfidenceColor(word.probability)} hover:bg-yellow-100 transition-colors duration-200`}
                          title={`${word.probability.toFixed(2)} confidence, ${formatTimestamp(word.start)}-${formatTimestamp(word.end)}`}
                        >
                          {word.word}
                          {index < segment.words.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </span>
                  ) : (
                    segment.text
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Performance Metrics */}
      {showMetrics && metrics && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Performance Metrics</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600 mb-1">Processing Time</div>
              <div className="font-semibold text-gray-900">
                {metrics.processing_time_ms.toFixed(0)}ms
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Real-time Factor</div>
              <div className={`font-semibold ${
                metrics.real_time_factor < 1 ? 'text-green-600' : 
                metrics.real_time_factor < 2 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {metrics.real_time_factor.toFixed(2)}x
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Words/Second</div>
              <div className="font-semibold text-gray-900">
                {metrics.words_per_second.toFixed(1)}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Avg Confidence</div>
              <div className={`font-semibold ${getConfidenceColor(metrics.confidence_score)}`}>
                {Math.round(metrics.confidence_score * 100)}%
              </div>
            </div>
          </div>
          
          <div className="mt-3 text-xs text-gray-500">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Controls */}
      {!useAdvancedDisplay && (
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            {segments.length} segments transcribed
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setSegments([])}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Clear
            </button>
            
            <button
              onClick={() => {
                const text = segments.map(s => s.text).join(' ');
                navigator.clipboard.writeText(text);
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Copy Text
            </button>
          </div>
        </div>
      )}
    </div>
  );
};