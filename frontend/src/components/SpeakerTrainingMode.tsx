// Speaker Training Mode Component
// Allows users to create voice profiles for speaker identification

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MicrophoneIcon, 
  StopIcon, 
  UserIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  TrashIcon,
  PlayIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface TrainingSample {
  id: string;
  duration: number;
  qualityScore: number;
  addedAt: string;
  audioBlob?: Blob;
}

interface TrainingSession {
  sessionId: string;
  speakerName: string;
  status: 'active' | 'completed' | 'failed';
  sampleCount: number;
  totalDuration: number;
  averageQuality: number;
  startedAt: string;
  completedAt?: string;
}

interface SpeakerTrainingModeProps {
  onProfileCreated?: (speakerId: string, speakerName: string) => void;
  onTrainingCancelled?: () => void;
  organizationId?: string;
}

export const SpeakerTrainingMode: React.FC<SpeakerTrainingModeProps> = ({
  onProfileCreated,
  onTrainingCancelled,
  organizationId
}) => {
  const [step, setStep] = useState<'setup' | 'recording' | 'review' | 'processing' | 'complete'>('setup');
  const [speakerName, setSpeakerName] = useState('');
  const [speakerEmail, setSpeakerEmail] = useState('');
  const [currentSession, setCurrentSession] = useState<TrainingSession | null>(null);
  const [samples, setSamples] = useState<TrainingSample[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const trainingInstructions = [
    {
      title: "Say your name clearly",
      description: "Please state your full name in a clear, natural voice",
      duration: 3,
      example: "Hi, my name is John Smith"
    },
    {
      title: "Count from 1 to 10",
      description: "Count slowly and clearly for voice pattern analysis",
      duration: 5,
      example: "One, two, three, four, five..."
    },
    {
      title: "Read this sentence",
      description: "Read the following sentence naturally",
      duration: 4,
      example: "The quick brown fox jumps over the lazy dog"
    },
    {
      title: "Describe your role",
      description: "Briefly describe your role or position",
      duration: 5,
      example: "I work as a project manager in the engineering team"
    },
    {
      title: "Free speech sample",
      description: "Talk about anything you'd like for voice consistency",
      duration: 6,
      example: "Tell us about your hobbies, work, or interests"
    }
  ];

  const requiredSamples = trainingInstructions.length;
  const currentInstruct = trainingInstructions[currentInstruction];

  // Audio level monitoring
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    setAudioLevel(average / 255);
    
    if (isRecording) {
      requestAnimationFrame(updateAudioLevel);
    }
  }, [isRecording]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  const startTrainingSession = async () => {
    try {
      setError(null);
      setIsProcessing(true);

      const response = await fetch('http://localhost:8000/speaker-training/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          speaker_name: speakerName,
          speaker_email: speakerEmail || null,
          organization_id: organizationId || null
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start training: ${response.statusText}`);
      }

      const result = await response.json();
      setCurrentSession({
        sessionId: result.session_id,
        speakerName: speakerName,
        status: 'active',
        sampleCount: 0,
        totalDuration: 0,
        averageQuality: 0,
        startedAt: new Date().toISOString()
      });

      setStep('recording');
      setCurrentInstruction(0);

    } catch (err) {
      setError('Failed to start training session: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
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
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processSample(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

    } catch (err) {
      setError('Failed to start recording: ' + (err as Error).message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    setIsRecording(false);
    setAudioLevel(0);
  };

  const processSample = async (audioBlob: Blob) => {
    if (!currentSession) return;

    try {
      setIsProcessing(true);

      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await fetch(`http://localhost:8000/speaker-training/${currentSession.sessionId}/add-sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_data: base64Audio,
          sample_rate: 16000
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to process sample: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to process audio sample');
        return;
      }

      // Add sample to list
      const newSample: TrainingSample = {
        id: `sample_${samples.length}`,
        duration: recordingTime,
        qualityScore: result.quality_score,
        addedAt: new Date().toISOString(),
        audioBlob: audioBlob
      };

      setSamples(prev => [...prev, newSample]);

      // Update session info
      setCurrentSession(prev => prev ? {
        ...prev,
        sampleCount: result.sample_count,
        totalDuration: result.total_duration,
        averageQuality: result.average_quality
      } : null);

      // Move to next instruction or complete
      if (currentInstruction < trainingInstructions.length - 1) {
        setCurrentInstruction(prev => prev + 1);
      } else if (samples.length + 1 >= requiredSamples) {
        setStep('review');
      }

    } catch (err) {
      setError('Failed to process sample: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteSample = (sampleId: string) => {
    setSamples(prev => prev.filter(s => s.id !== sampleId));
    // Note: In a full implementation, you'd also need to remove from the backend
  };

  const playSample = (sample: TrainingSample) => {
    if (sample.audioBlob) {
      const audio = new Audio(URL.createObjectURL(sample.audioBlob));
      audio.play();
    }
  };

  const completeTraining = async () => {
    if (!currentSession) return;

    try {
      setIsProcessing(true);
      setStep('processing');

      const response = await fetch(`http://localhost:8000/speaker-training/${currentSession.sessionId}/complete`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to complete training: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to complete training');
        setStep('review');
        return;
      }

      setStep('complete');
      onProfileCreated?.(result.speaker_id, speakerName);

    } catch (err) {
      setError('Failed to complete training: ' + (err as Error).message);
      setStep('review');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetTraining = () => {
    setStep('setup');
    setSpeakerName('');
    setSpeakerEmail('');
    setCurrentSession(null);
    setSamples([]);
    setCurrentInstruction(0);
    setError(null);
  };

  const getQualityColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualityLabel = (score: number): string => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <UserIcon className="w-12 h-12 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Speaker Training Mode</h2>
        <p className="text-gray-600">Create a voice profile for accurate speaker identification</p>
      </div>

      {/* Progress Indicator */}
      <div className="flex justify-center">
        <div className="flex items-center space-x-4">
          {['Setup', 'Recording', 'Review', 'Processing', 'Complete'].map((stepName, index) => {
            const stepNumber = index + 1;
            const isActive = step === stepName.toLowerCase();
            const isCompleted = ['setup', 'recording', 'review', 'processing', 'complete'].indexOf(step) > index;
            
            return (
              <div key={stepName} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCompleted ? 'bg-green-500 text-white' :
                  isActive ? 'bg-blue-500 text-white' :
                  'bg-gray-200 text-gray-600'
                }`}>
                  {isCompleted ? '✓' : stepNumber}
                </div>
                <span className={`ml-2 text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                  {stepName}
                </span>
                {index < 4 && <div className="w-8 h-px bg-gray-300 mx-4" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex">
            <XCircleIcon className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Setup Step */}
      {step === 'setup' && (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-4">Getting Started</h3>
            <div className="space-y-3 text-blue-800">
              <p>• You'll record {requiredSamples} short voice samples</p>
              <p>• Each sample helps train the AI to recognize your voice</p>
              <p>• Ensure you're in a quiet environment</p>
              <p>• Speak clearly and at normal volume</p>
              <p>• The entire process takes about 5-10 minutes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                value={speakerEmail}
                onChange={(e) => setSpeakerEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-center space-x-4">
            <button
              onClick={() => onTrainingCancelled?.()}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={startTrainingSession}
              disabled={!speakerName.trim() || isProcessing}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md"
            >
              {isProcessing ? 'Starting...' : 'Start Training'}
            </button>
          </div>
        </div>
      )}

      {/* Recording Step */}
      {step === 'recording' && currentInstruct && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mb-4">
              <span className="text-sm text-gray-600">
                Sample {currentInstruction + 1} of {requiredSamples}
              </span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {currentInstruct.title}
            </h3>
            <p className="text-gray-600 mb-4">
              {currentInstruct.description}
            </p>
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <p className="text-gray-800 italic">
                Example: "{currentInstruct.example}"
              </p>
            </div>
          </div>

          {/* Recording Controls */}
          <div className="text-center space-y-4">
            {/* Audio Level Meter */}
            <div className="flex justify-center items-center space-x-4">
              <span className="text-sm text-gray-600">Audio Level:</span>
              <div className="w-48 h-4 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-100 ${
                    audioLevel > 0.7 ? 'bg-red-500' : 
                    audioLevel > 0.4 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${audioLevel * 100}%` }}
                />
              </div>
            </div>

            {/* Recording Button */}
            <div className="flex justify-center items-center space-x-6">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="w-20 h-20 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <MicrophoneIcon className="w-8 h-8" />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 bg-gray-600 hover:bg-gray-700 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <StopIcon className="w-8 h-8" />
                </button>
              )}
            </div>

            {/* Recording Status */}
            {isRecording && (
              <div className="space-y-2">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-600 font-medium">Recording</span>
                </div>
                <div className="text-2xl font-mono font-bold text-gray-900">
                  {formatTime(recordingTime)}
                </div>
                <div className="text-sm text-gray-600">
                  Recommended: {currentInstruct.duration} seconds
                </div>
              </div>
            )}

            {!isRecording && recordingTime === 0 && (
              <p className="text-gray-600">Click the microphone to start recording</p>
            )}

            {isProcessing && (
              <div className="flex items-center justify-center space-x-2">
                <ArrowPathIcon className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="text-blue-600">Processing sample...</span>
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Training Progress</span>
              <span>{samples.length} / {requiredSamples} samples</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(samples.length / requiredSamples) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Review Step */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Review Your Voice Samples
            </h3>
            <p className="text-gray-600">
              Review the quality of your samples before creating your voice profile
            </p>
          </div>

          {/* Session Summary */}
          {currentSession && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-900">
                    {currentSession.sampleCount}
                  </div>
                  <div className="text-blue-700 text-sm">Samples</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-900">
                    {formatTime(Math.round(currentSession.totalDuration))}
                  </div>
                  <div className="text-blue-700 text-sm">Total Duration</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${getQualityColor(currentSession.averageQuality)}`}>
                    {Math.round(currentSession.averageQuality * 100)}%
                  </div>
                  <div className="text-blue-700 text-sm">Avg Quality</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-900">
                    {getQualityLabel(currentSession.averageQuality)}
                  </div>
                  <div className="text-blue-700 text-sm">Overall Rating</div>
                </div>
              </div>
            </div>
          )}

          {/* Sample List */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Voice Samples</h4>
            {samples.map((sample, index) => (
              <div key={sample.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-sm font-medium text-gray-900">
                      Sample {index + 1}
                    </div>
                    <div className="text-sm text-gray-600">
                      {formatTime(sample.duration)}
                    </div>
                    <div className={`text-sm font-medium ${getQualityColor(sample.qualityScore)}`}>
                      {getQualityLabel(sample.qualityScore)} ({Math.round(sample.qualityScore * 100)}%)
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => playSample(sample)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                      title="Play sample"
                    >
                      <PlayIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteSample(sample.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                      title="Delete sample"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => setStep('recording')}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Record More
            </button>
            <button
              onClick={resetTraining}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Start Over
            </button>
            <button
              onClick={completeTraining}
              disabled={samples.length < 3 || isProcessing}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md"
            >
              {isProcessing ? 'Creating Profile...' : 'Create Voice Profile'}
            </button>
          </div>

          {samples.length < 3 && (
            <div className="text-center text-yellow-600 text-sm">
              At least 3 samples are required to create a voice profile
            </div>
          )}
        </div>
      )}

      {/* Processing Step */}
      {step === 'processing' && (
        <div className="text-center space-y-6">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto" />
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Creating Your Voice Profile
            </h3>
            <p className="text-gray-600">
              Analyzing voice patterns and building your unique speaker profile...
            </p>
          </div>
        </div>
      )}

      {/* Complete Step */}
      {step === 'complete' && (
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircleIcon className="w-16 h-16 text-green-500" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Voice Profile Created Successfully!
            </h3>
            <p className="text-gray-600 mb-4">
              Your voice profile for <strong>{speakerName}</strong> has been created and is ready for use.
            </p>
            <p className="text-sm text-gray-500">
              The system can now identify you in future meetings and conversations.
            </p>
          </div>
          
          <button
            onClick={resetTraining}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            Create Another Profile
          </button>
        </div>
      )}
    </div>
  );
};