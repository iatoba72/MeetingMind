/**
 * Audio Pipeline Test Component
 * Demonstrates the unified audio pipeline functionality
 */

import React, { useState, useEffect, useRef } from 'react';
import AudioPipeline, { AudioSource, ProcessedAudioChunk } from '../utils/AudioPipeline';
// import { AudioMetrics } from '../utils/AudioCapture';
import { AudioVisualizer } from './AudioVisualizer';

interface AudioPipelineTestProps {
  className?: string;
}

const AudioPipelineTest: React.FC<AudioPipelineTestProps> = ({ className }) => {
  const [pipeline, setPipeline] = useState<AudioPipeline | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sources, setSources] = useState<AudioSource[]>([]);
  const [primarySource, setPrimarySourceState] = useState<AudioSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [transcriptions, setTranscriptions] = useState<Array<{ timestamp: number; text: string; speaker?: string }>>([]);
  // Config state for future use
  // const [config, setConfig] = useState<PipelineConfig>({
  //   enableAutoSwitching: true,
  //   primarySourceTimeout: 5000,
  //   bufferSize: 4096,
  //   maxSources: 4,
  //   enableRecording: false,
  //   enableVisualization: true,
  //   processingInterval: 100
  // });

  // Audio visualization
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Metrics tracking
  const [globalMetrics, setGlobalMetrics] = useState<{
    totalChunks: number;
    totalDuration: number;
    averageLatency: number;
    activeSources: number;
  }>({
    totalChunks: 0,
    totalDuration: 0,
    averageLatency: 0,
    activeSources: 0
  });

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-9), `[${timestamp}] ${message}`]);
  };

  useEffect(() => {
    return () => {
      if (pipeline) {
        pipeline.dispose();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [pipeline]);

  const initializePipeline = async () => {
    try {
      addLog('Initializing AudioPipeline...');
      
      const newPipeline = new AudioPipeline({});
      
      // Set up event handlers
      newPipeline.onChunk((chunk: ProcessedAudioChunk) => {
        addLog(`Received chunk from ${chunk.sourceId}: ${chunk.duration}ms, RMS: ${chunk.rms.toFixed(3)}, Voice: ${chunk.hasVoice}`);
        
        setGlobalMetrics(prev => ({
          totalChunks: prev.totalChunks + 1,
          totalDuration: prev.totalDuration + chunk.duration,
          averageLatency: (prev.averageLatency + (performance.now() - chunk.processedAt)) / 2,
          activeSources: sources.filter(s => s.status === 'active').length
        }));
      });

      newPipeline.onSourceChange((newSources: AudioSource[]) => {
        setSources(newSources);
        const primary = newSources.find(s => s.isPrimary) || null;
        setPrimarySourceState(primary);
        addLog(`Sources updated: ${newSources.length} total, Primary: ${primary?.name || 'None'}`);
      });

      newPipeline.onMetrics(() => {
        // Update source metrics in state if needed
      });

      newPipeline.onError((error: Error, sourceId?: string) => {
        const errorMsg = `Error${sourceId ? ` (${sourceId})` : ''}: ${error.message}`;
        setError(errorMsg);
        addLog(errorMsg);
      });

      newPipeline.onTranscription((result: { timestamp: number; text: string; speaker?: string }) => {
        addLog(`Transcription received: ${JSON.stringify(result)}`);
        setTranscriptions(prev => [...prev.slice(-9), result]);
      });

      await newPipeline.initialize();
      
      setPipeline(newPipeline);
      setIsInitialized(true);
      setError(null);
      addLog('AudioPipeline initialized successfully');
      
      // Start visualization
      startVisualization(newPipeline);
      
    } catch (err) {
      const errorMsg = `Failed to initialize: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const startVisualization = (pipelineInstance: AudioPipeline) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const visualData = pipelineInstance.getVisualizationData();
      if (!visualData) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const { frequency, time } = visualData;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw frequency spectrum
      ctx.fillStyle = '#4CAF50';
      const barWidth = canvas.width / frequency.length;
      
      for (let i = 0; i < frequency.length; i++) {
        const barHeight = (frequency[i] / 255) * canvas.height * 0.8;
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
      }
      
      // Draw time domain (waveform) overlay
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      for (let i = 0; i < time.length; i++) {
        const x = (i / time.length) * canvas.width;
        const y = ((time[i] - 128) / 128) * (canvas.height / 4) + canvas.height / 2;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const startPipeline = async () => {
    if (!pipeline) return;
    
    try {
      await pipeline.startPipeline();
      setIsRunning(true);
      addLog('Pipeline started');
    } catch (err) {
      const errorMsg = `Failed to start pipeline: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const stopPipeline = async () => {
    if (!pipeline) return;
    
    try {
      await pipeline.stopPipeline();
      setIsRunning(false);
      addLog('Pipeline stopped');
    } catch (err) {
      const errorMsg = `Failed to stop pipeline: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const addMicrophoneSource = async () => {
    if (!pipeline) return;
    
    try {
      const sourceId = await pipeline.addLocalSource('microphone', {
        sampleRate: 44100,
        channelCount: 1,
        enableVAD: true,
        vadThreshold: 0.01
      });
      addLog(`Added microphone source: ${sourceId}`);
    } catch (err) {
      const errorMsg = `Failed to add microphone: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const addSystemAudioSource = async () => {
    if (!pipeline) return;
    
    try {
      const sourceId = await pipeline.addLocalSource('system');
      addLog(`Added system audio source: ${sourceId}`);
    } catch (err) {
      const errorMsg = `Failed to add system audio: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const addNetworkSource = async (type: 'rtmp' | 'srt') => {
    if (!pipeline) return;
    
    try {
      const url = type === 'rtmp' 
        ? 'rtmp://localhost:1935/live/stream'
        : 'srt://localhost:9998';
      
      const sourceId = await pipeline.addNetworkSource(url, type);
      addLog(`Added ${type.toUpperCase()} network source: ${sourceId}`);
    } catch (err) {
      const errorMsg = `Failed to add ${type} source: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const startSource = async (sourceId: string) => {
    if (!pipeline) return;
    
    try {
      await pipeline.startSource(sourceId);
      addLog(`Started source: ${sourceId}`);
    } catch (err) {
      const errorMsg = `Failed to start source ${sourceId}: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const stopSource = async (sourceId: string) => {
    if (!pipeline) return;
    
    try {
      await pipeline.stopSource(sourceId);
      addLog(`Stopped source: ${sourceId}`);
    } catch (err) {
      const errorMsg = `Failed to stop source ${sourceId}: ${err}`;
      setError(errorMsg);
      addLog(errorMsg);
    }
  };

  const setPrimarySource = (sourceId: string) => {
    if (!pipeline) return;
    
    pipeline.setPrimarySource(sourceId);
    addLog(`Set primary source: ${sourceId}`);
  };

  const removeSource = (sourceId: string) => {
    if (!pipeline) return;
    
    pipeline.removeSource(sourceId);
    addLog(`Removed source: ${sourceId}`);
  };

  return (
    <div className={`audio-pipeline-test p-6 bg-gray-100 min-h-screen ${className}`}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          Audio Pipeline Test
        </h1>

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Control Panel</h2>
          
          <div className="flex flex-wrap gap-4 mb-4">
            <button
              onClick={initializePipeline}
              disabled={isInitialized}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Initialize Pipeline
            </button>
            
            <button
              onClick={startPipeline}
              disabled={!isInitialized || isRunning}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              Start Pipeline
            </button>
            
            <button
              onClick={stopPipeline}
              disabled={!isRunning}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              Stop Pipeline
            </button>
          </div>

          {/* Add Sources */}
          <div className="flex flex-wrap gap-4">
            <button
              onClick={addMicrophoneSource}
              disabled={!isInitialized}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
            >
              Add Microphone
            </button>
            
            <button
              onClick={addSystemAudioSource}
              disabled={!isInitialized}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
            >
              Add System Audio
            </button>
            
            <button
              onClick={() => addNetworkSource('rtmp')}
              disabled={!isInitialized}
              className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              Add RTMP Source
            </button>
            
            <button
              onClick={() => addNetworkSource('srt')}
              disabled={!isInitialized}
              className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:opacity-50"
            >
              Add SRT Source
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Pipeline Status</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Initialized:</span>
                <span className={isInitialized ? 'text-green-600' : 'text-red-600'}>
                  {isInitialized ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Running:</span>
                <span className={isRunning ? 'text-green-600' : 'text-red-600'}>
                  {isRunning ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Primary Source:</span>
                <span className="text-blue-600">
                  {primarySource?.name || 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Sources:</span>
                <span className="text-blue-600">{sources.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Global Metrics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Chunks Processed:</span>
                <span className="text-blue-600">{globalMetrics.totalChunks}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Duration:</span>
                <span className="text-blue-600">{(globalMetrics.totalDuration / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Latency:</span>
                <span className="text-blue-600">{globalMetrics.averageLatency.toFixed(1)}ms</span>
              </div>
              <div className="flex justify-between">
                <span>Active Sources:</span>
                <span className="text-blue-600">{globalMetrics.activeSources}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Sources */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Audio Sources</h3>
          {sources.length === 0 ? (
            <p className="text-gray-500">No sources configured</p>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={`border rounded-lg p-4 ${
                    source.isPrimary ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <h4 className="font-medium">{source.name}</h4>
                      {source.isPrimary && (
                        <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded">
                          PRIMARY
                        </span>
                      )}
                      <span className={`px-2 py-1 text-xs rounded ${
                        source.status === 'active' ? 'bg-green-100 text-green-800' :
                        source.status === 'error' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {source.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex space-x-2">
                      {source.status === 'inactive' && (
                        <button
                          onClick={() => startSource(source.id)}
                          className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                        >
                          Start
                        </button>
                      )}
                      
                      {source.status === 'active' && (
                        <button
                          onClick={() => stopSource(source.id)}
                          className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                        >
                          Stop
                        </button>
                      )}
                      
                      {!source.isPrimary && source.status === 'active' && (
                        <button
                          onClick={() => setPrimarySource(source.id)}
                          className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                        >
                          Set Primary
                        </button>
                      )}
                      
                      <button
                        onClick={() => removeSource(source.id)}
                        className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2">{source.type}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Volume:</span>
                      <span className="ml-2">{(source.metrics.volumeLevel * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Voice Activity:</span>
                      <span className="ml-2">{source.metrics.voiceActivityPercent.toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Chunks:</span>
                      <span className="ml-2">{source.metrics.chunksProcessed}</span>
                    </div>
                  </div>

                  {source.networkInfo && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Protocol:</span>
                          <span className="ml-2">{source.networkInfo.type.toUpperCase()}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Bytes:</span>
                          <span className="ml-2">{source.networkInfo.bytesReceived}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Jitter:</span>
                          <span className="ml-2">{source.networkInfo.jitter.toFixed(1)}ms</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Latency:</span>
                          <span className="ml-2">{source.networkInfo.latency.toFixed(1)}ms</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audio Visualization */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <AudioVisualizer
            sources={sources}
            primarySourceId={primarySource?.id}
            getVisualizationData={() => {
              // This would get actual visualization data from the pipeline
              return pipeline?.getVisualizationData();
            }}
            showMultiSource={true}
            visualizationType="combined"
            width={800}
            height={400}
          />
        </div>

        {/* Transcription Results */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Transcription Results</h3>
          <div className="max-h-48 overflow-y-auto">
            {transcriptions.length === 0 ? (
              <p className="text-gray-500">No transcriptions yet...</p>
            ) : (
              <div className="space-y-3">
                {transcriptions.map((transcription, index) => (
                  <div key={index} className="border border-gray-200 rounded p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm text-gray-500">
                        Source: {transcription.source_id}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(transcription.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-sm">
                      <strong>Result:</strong> {JSON.stringify(transcription.result, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Logs</h3>
          <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded max-h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <strong>Error:</strong> {error}
            <button
              onClick={() => setError(null)}
              className="float-right font-bold text-red-700 hover:text-red-900"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioPipelineTest;