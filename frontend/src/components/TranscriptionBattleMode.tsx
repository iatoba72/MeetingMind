// Transcription Battle Mode Component
// Side-by-side comparison of multiple transcription providers in real-time

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChartBarIcon, CurrencyDollarIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface BattleProvider {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  cost: number;
  processingTime: number;
  confidence: number;
  wordCount: number;
  errorCount: number;
}

interface BattleResult {
  provider: string;
  text: string;
  segments: Array<{
    id: string;
    text: string;
    start_time: number;
    end_time: number;
    confidence: number;
    words: Array<{
      word: string;
      start: number;
      end: number;
      probability: number;
    }>;
  }>;
  metrics: {
    word_error_rate: number;
    character_error_rate: number;
    bleu_score: number;
    confidence_score: number;
    processing_time_ms: number;
    cost: number;
  };
}

interface BattleComparison {
  jobId: string;
  referenceText?: string;
  results: BattleResult[];
  rankings: Array<{
    provider: string;
    score: number;
    rank: number;
  }>;
  costEffectiveness: Array<{
    provider: string;
    scorePerDollar: number;
  }>;
  winner: string;
  analysis: {
    totalCost: number;
    avgAccuracy: number;
    speedWinner: string;
    accuracyWinner: string;
    costWinner: string;
  };
}

interface TranscriptionBattleModeProps {
  sessionId: string;
  onBattleComplete?: (comparison: BattleComparison) => void;
  enabledProviders?: string[];
  referenceText?: string;
  autoStart?: boolean;
}

export const TranscriptionBattleMode: React.FC<TranscriptionBattleModeProps> = ({
  sessionId,
  onBattleComplete,
  // _enabledProviders = ['local_whisper', 'openai_whisper', 'assemblyai'],
  referenceText,
  autoStart = false
}) => {
  const [providers, setProviders] = useState<BattleProvider[]>([
    {
      id: 'local_whisper',
      name: 'Local Whisper',
      enabled: true,
      color: 'bg-blue-500',
      status: 'idle',
      cost: 0,
      processingTime: 0,
      confidence: 0,
      wordCount: 0,
      errorCount: 0
    },
    {
      id: 'openai_whisper',
      name: 'OpenAI Whisper',
      enabled: true,
      color: 'bg-green-500',
      status: 'idle',
      cost: 0,
      processingTime: 0,
      confidence: 0,
      wordCount: 0,
      errorCount: 0
    },
    {
      id: 'assemblyai',
      name: 'AssemblyAI',
      enabled: true,
      color: 'bg-purple-500',
      status: 'idle',
      cost: 0,
      processingTime: 0,
      confidence: 0,
      wordCount: 0,
      errorCount: 0
    }
  ]);

  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  // const [results, setResults] = useState<Record<string, BattleResult>>({});
  const [comparison, setComparison] = useState<BattleComparison | null>(null);
  const [battlePhase, setBattlePhase] = useState<'setup' | 'recording' | 'processing' | 'results'>('setup');
  // const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Timer for recording duration
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // Auto-start recording if enabled
  useEffect(() => {
    if (autoStart && battlePhase === 'setup') {
      startBattle();
    }
  }, [autoStart, battlePhase, startBattle]);

  const toggleProvider = (providerId: string) => {
    setProviders(prev => prev.map(p => 
      p.id === providerId ? { ...p, enabled: !p.enabled } : p
    ));
  };

  const startBattle = useCallback(async () => {
    try {
      setError(null);
      setBattlePhase('recording');
      setElapsedTime(0);
      
      // Reset provider states
      setProviders(prev => prev.map(p => ({ 
        ...p, 
        status: 'idle',
        cost: 0,
        processingTime: 0,
        confidence: 0,
        wordCount: 0,
        errorCount: 0
      })));

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
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processBattleAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

    } catch (err) {
      setError('Failed to start recording: ' + (err as Error).message);
      setBattlePhase('setup');
    }
  }, []);

  const stopBattle = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    setIsRecording(false);
    setAudioLevel(0);
    setBattlePhase('processing');
  };

  const processBattleAudio = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      // Get enabled providers
      const enabledProviderIds = providers.filter(p => p.enabled).map(p => p.id);
      
      // Submit battle job
      const response = await fetch('http://localhost:8000/cloud-transcription/battle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          audio_data: base64Audio,
          audio_duration: elapsedTime,
          providers: enabledProviderIds,
          reference_text: referenceText
        }),
      });

      if (!response.ok) {
        throw new Error(`Battle request failed: ${response.statusText}`);
      }

      const battleJob = await response.json();
      setCurrentJobId(battleJob.job_id);
      
      // Update provider statuses to processing
      setProviders(prev => prev.map(p => 
        p.enabled ? { ...p, status: 'processing' } : p
      ));

      // Poll for results
      await pollBattleResults(battleJob.job_id);

    } catch (err) {
      setError('Battle processing failed: ' + (err as Error).message);
      setBattlePhase('setup');
    }
  };

  const pollBattleResults = async (jobId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`http://localhost:8000/cloud-transcription/battle/${jobId}/status`);
        
        if (!response.ok) {
          throw new Error(`Failed to get battle status: ${response.statusText}`);
        }

        const status = await response.json();
        
        // Update provider statuses based on attempts
        setProviders(prev => prev.map(provider => {
          const attempt = status.attempts.find((a: any) => a.provider === provider.id);
          if (attempt) {
            return {
              ...provider,
              status: attempt.success ? 'completed' : attempt.error_message ? 'error' : 'processing',
              cost: attempt.cost || 0,
              processingTime: attempt.processing_time || 0,
              confidence: attempt.result?.metrics?.confidence_score || 0,
              wordCount: attempt.result?.full_text?.split(' ').length || 0
            };
          }
          return provider;
        }));

        if (status.completed_at) {
          // Battle completed, get final comparison
          await getBattleComparison(jobId);
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          throw new Error('Battle timed out');
        }

      } catch (err) {
        setError('Failed to get battle results: ' + (err as Error).message);
        setBattlePhase('setup');
      }
    };

    poll();
  };

  const getBattleComparison = async (jobId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/cloud-transcription/battle/${jobId}/comparison`);
      
      if (!response.ok) {
        throw new Error(`Failed to get comparison: ${response.statusText}`);
      }

      const comparisonData = await response.json();
      setComparison(comparisonData);
      setBattlePhase('results');
      
      onBattleComplete?.(comparisonData);

    } catch (err) {
      setError('Failed to get battle comparison: ' + (err as Error).message);
    }
  };

  const resetBattle = () => {
    setBattlePhase('setup');
    setResults({});
    setComparison(null);
    setCurrentJobId(null);
    setElapsedTime(0);
    setError(null);
    
    setProviders(prev => prev.map(p => ({ 
      ...p, 
      status: 'idle',
      cost: 0,
      processingTime: 0,
      confidence: 0,
      wordCount: 0,
      errorCount: 0
    })));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCost = (cost: number): string => {
    return cost === 0 ? 'FREE' : `$${cost.toFixed(4)}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'processing':
        return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <div className="w-5 h-5 rounded-full bg-gray-300" />;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-gray-900">🥊 Transcription Battle Mode</h3>
          <p className="text-gray-600">Compare multiple transcription providers side-by-side</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-blue-600">
              {formatTime(elapsedTime)}
            </div>
            <div className="text-sm text-gray-500">
              {battlePhase.charAt(0).toUpperCase() + battlePhase.slice(1)}
            </div>
          </div>
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

      {/* Setup Phase */}
      {battlePhase === 'setup' && (
        <div className="space-y-6">
          {/* Provider Selection */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Select Competitors</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    provider.enabled
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleProvider(provider.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-4 h-4 rounded-full ${provider.color}`} />
                    <div className={`w-5 h-5 rounded border-2 ${
                      provider.enabled ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {provider.enabled && (
                        <CheckCircleIcon className="w-full h-full text-white" />
                      )}
                    </div>
                  </div>
                  
                  <h5 className="font-semibold text-gray-900">{provider.name}</h5>
                  <p className="text-sm text-gray-600">
                    {provider.id === 'local_whisper' && 'Free • Real-time capable'}
                    {provider.id === 'openai_whisper' && '$0.006/min • High accuracy'}
                    {provider.id === 'assemblyai' && '$0.00037/min • Speaker detection'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Reference Text */}
          {referenceText && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <h4 className="font-medium text-yellow-900 mb-2">Reference Text (for accuracy comparison)</h4>
              <p className="text-yellow-800 text-sm">{referenceText}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center">
            <button
              onClick={startBattle}
              disabled={!providers.some(p => p.enabled)}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              🎙️ Start Battle
            </button>
          </div>
        </div>
      )}

      {/* Recording Phase */}
      {battlePhase === 'recording' && (
        <div className="text-center space-y-6">
          <div className="flex justify-center items-center space-x-6">
            {/* Audio Level Visualization */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Audio:</span>
              <div className="w-32 h-4 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 transition-all duration-100"
                  style={{ width: `${audioLevel * 100}%` }}
                />
              </div>
            </div>
            
            {/* Recording Indicator */}
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-600 font-medium">RECORDING</span>
            </div>
          </div>

          <p className="text-gray-600">Speak clearly into your microphone</p>

          <button
            onClick={stopBattle}
            className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg"
          >
            ⏹️ Stop & Process
          </button>
        </div>
      )}

      {/* Processing Phase */}
      {(battlePhase === 'processing' || battlePhase === 'results') && (
        <div className="space-y-6">
          {/* Provider Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {providers.filter(p => p.enabled).map((provider) => (
              <div key={provider.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${provider.color}`} />
                    <h5 className="font-medium text-gray-900">{provider.name}</h5>
                  </div>
                  {getStatusIcon(provider.status)}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cost:</span>
                    <span className="font-medium">{formatCost(provider.cost)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    <span className="font-medium">{provider.processingTime.toFixed(2)}s</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Confidence:</span>
                    <span className="font-medium">{Math.round(provider.confidence * 100)}%</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Words:</span>
                    <span className="font-medium">{provider.wordCount}</span>
                  </div>
                </div>

                {/* Progress bar for processing */}
                {provider.status === 'processing' && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full animate-pulse w-2/3" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Results Display */}
          {comparison && battlePhase === 'results' && (
            <div className="space-y-6">
              {/* Winner Announcement */}
              <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="text-3xl mb-2">🏆</div>
                <h4 className="text-xl font-bold text-yellow-900">
                  Winner: {comparison.winner}
                </h4>
                <p className="text-yellow-800">
                  Best overall score: {comparison.rankings[0]?.score.toFixed(3)}
                </p>
              </div>

              {/* Battle Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <ChartBarIcon className="w-5 h-5 text-green-600" />
                    <h5 className="font-medium text-green-900">Accuracy Winner</h5>
                  </div>
                  <p className="text-green-800 font-semibold">{comparison.analysis.accuracyWinner}</p>
                  <p className="text-green-700 text-sm">{comparison.analysis.avgAccuracy.toFixed(1)}% avg accuracy</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <ClockIcon className="w-5 h-5 text-blue-600" />
                    <h5 className="font-medium text-blue-900">Speed Winner</h5>
                  </div>
                  <p className="text-blue-800 font-semibold">{comparison.analysis.speedWinner}</p>
                  <p className="text-blue-700 text-sm">Fastest processing</p>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <CurrencyDollarIcon className="w-5 h-5 text-purple-600" />
                    <h5 className="font-medium text-purple-900">Value Winner</h5>
                  </div>
                  <p className="text-purple-800 font-semibold">{comparison.analysis.costWinner}</p>
                  <p className="text-purple-700 text-sm">${comparison.analysis.totalCost.toFixed(4)} total cost</p>
                </div>
              </div>

              {/* Detailed Rankings */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Final Rankings</h4>
                <div className="space-y-2">
                  {comparison.rankings.map((ranking, index) => (
                    <div key={ranking.provider} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                          index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-400'
                        }`}>
                          {index + 1}
                        </div>
                        <span className="font-medium">{ranking.provider}</span>
                      </div>
                      <span className="font-mono font-semibold">{ranking.score.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transcription Results */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Transcription Results</h4>
                <div className="space-y-4">
                  {comparison.results.map((result) => (
                    <div key={result.provider} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="font-medium text-gray-900">{result.provider}</h5>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>WER: {(result.metrics.word_error_rate * 100).toFixed(1)}%</span>
                          <span>BLEU: {result.metrics.bleu_score.toFixed(3)}</span>
                          <span>{formatCost(result.metrics.cost)}</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded p-3">
                        <p className="text-gray-800">{result.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={resetBattle}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              🔄 New Battle
            </button>
            
            {comparison && (
              <button
                onClick={() => {
                  const dataStr = JSON.stringify(comparison, null, 2);
                  const blob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `battle-results-${comparison.jobId}.json`;
                  a.click();
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                📊 Export Results
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};