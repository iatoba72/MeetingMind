// Whisper Model Selection Component
// UI for selecting and managing Whisper transcription models

import React, { useState, useEffect } from 'react';

interface ModelInfo {
  size: string;
  parameters: string;
  vram_required: string;
  relative_speed: string;
  multilingual: boolean;
  accuracy: string;
  download_size: string;
}

interface SystemInfo {
  device: string;
  compute_type: string;
  cuda_available: boolean;
  cuda_version?: string;
  gpu_name?: string;
  gpu_memory_total: number;
  current_model?: string;
  loaded_models: string[];
  session_count: number;
}

interface WhisperModelSelectorProps {
  onModelChange?: (modelSize: string) => void;
  disabled?: boolean;
}

export const WhisperModelSelector: React.FC<WhisperModelSelectorProps> = ({ 
  onModelChange, 
  disabled = false 
}) => {
  const [models, setModels] = useState<Record<string, ModelInfo>>({});
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('base');
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Fetch available models and system info
  const fetchModels = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/transcription/models');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      setModels(data.models || {});
      setSystemInfo(data.system_info || null);
      
      if (data.current_model) {
        setSelectedModel(data.current_model);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
      console.error('Error fetching models:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load a specific model
  const loadModel = async (modelSize: string) => {
    setLoadingModel(modelSize);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/transcription/load-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model_size: modelSize }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load model');
      }

      const result = await response.json();
      setSelectedModel(modelSize);
      
      // Refresh system info
      await fetchModels();
      
      // Notify parent component
      onModelChange?.(modelSize);

      console.log(`Model ${modelSize} loaded successfully`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
      console.error('Error loading model:', err);
    } finally {
      setLoadingModel(null);
    }
  };

  // Get model recommendation based on system
  const getModelRecommendation = (): string => {
    if (!systemInfo) return 'base';

    if (!systemInfo.cuda_available) {
      return 'tiny'; // CPU only
    }

    const gpuMemory = systemInfo.gpu_memory_total;
    if (gpuMemory >= 10) {
      return 'large-v3'; // High-end GPU
    } else if (gpuMemory >= 6) {
      return 'medium'; // Mid-range GPU
    } else if (gpuMemory >= 2) {
      return 'small'; // Low-end GPU
    } else {
      return 'base'; // Limited GPU memory
    }
  };

  // Get model performance indicator
  const getPerformanceIndicator = (modelSize: string): string => {
    const model = models[modelSize];
    if (!model) return '';

    const speed = model.relative_speed;
    if (speed.includes('32x')) return '🟢'; // Very fast
    if (speed.includes('16x')) return '🟢'; // Fast
    if (speed.includes('6x')) return '🟡'; // Medium
    if (speed.includes('2x')) return '🟠'; // Slow
    return '🔴'; // Very slow
  };

  // Get accuracy indicator
  const getAccuracyIndicator = (modelSize: string): string => {
    const model = models[modelSize];
    if (!model) return '';

    const accuracy = model.accuracy;
    if (accuracy.includes('Best') || accuracy.includes('Excellent')) return '🟢';
    if (accuracy.includes('Very Good') || accuracy.includes('Good+')) return '🟡';
    if (accuracy.includes('Good') || accuracy.includes('Better')) return '🟠';
    return '🔴';
  };

  // Get system status color
  const getSystemStatusColor = (): string => {
    if (!systemInfo) return 'text-gray-500';
    if (systemInfo.cuda_available) return 'text-green-600';
    return 'text-orange-600';
  };

  // Load models on component mount
  useEffect(() => {
    fetchModels();
  }, []);

  if (loading && !models) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading models...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Whisper Model Selection</h3>
          <p className="text-gray-600">Choose the transcription model that best fits your needs</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showDetails ? '▼' : '▶'} System Details
          </button>
          
          {systemInfo && (
            <div className={`text-sm font-medium ${getSystemStatusColor()}`}>
              {systemInfo.cuda_available ? '🚀 GPU Ready' : '💻 CPU Mode'}
            </div>
          )}
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

      {/* System Information */}
      {showDetails && systemInfo && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <h4 className="font-medium text-gray-900">System Information</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-600 mb-1">Device</div>
              <div className={`font-medium ${getSystemStatusColor()}`}>
                {systemInfo.device.toUpperCase()}
                {systemInfo.cuda_available && ' (CUDA)'}
              </div>
            </div>
            
            {systemInfo.gpu_name && (
              <div>
                <div className="text-gray-600 mb-1">GPU</div>
                <div className="font-medium text-gray-900">{systemInfo.gpu_name}</div>
              </div>
            )}
            
            {systemInfo.gpu_memory_total > 0 && (
              <div>
                <div className="text-gray-600 mb-1">GPU Memory</div>
                <div className="font-medium text-gray-900">
                  {systemInfo.gpu_memory_total.toFixed(1)} GB
                </div>
              </div>
            )}
            
            <div>
              <div className="text-gray-600 mb-1">Current Model</div>
              <div className="font-medium text-gray-900">
                {systemInfo.current_model || 'None loaded'}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Recommended</div>
              <div className="font-medium text-blue-600">
                {getModelRecommendation()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model Selection Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900">Available Models</h4>
          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-1">
              <span>🟢 Fast</span>
              <span>🟡 Medium</span>
              <span>🔴 Slow</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(models).map(([modelSize, modelInfo]) => {
            const isSelected = selectedModel === modelSize;
            const isLoading = loadingModel === modelSize;
            const isRecommended = getModelRecommendation() === modelSize;
            
            return (
              <div
                key={modelSize}
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !disabled && !isLoading && loadModel(modelSize)}
              >
                {/* Recommended Badge */}
                {isRecommended && (
                  <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                    Recommended
                  </div>
                )}

                {/* Model Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-semibold text-gray-900">{modelSize}</h5>
                    {isSelected && (
                      <span className="text-blue-600 text-sm">✓ Active</span>
                    )}
                  </div>
                  
                  <div className="flex space-x-1">
                    <span title="Speed">{getPerformanceIndicator(modelSize)}</span>
                    <span title="Accuracy">{getAccuracyIndicator(modelSize)}</span>
                  </div>
                </div>

                {/* Model Details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Parameters:</span>
                    <span className="font-medium">{modelInfo.parameters}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Speed:</span>
                    <span className="font-medium">{modelInfo.relative_speed}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Accuracy:</span>
                    <span className="font-medium">{modelInfo.accuracy}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">VRAM:</span>
                    <span className="font-medium">{modelInfo.vram_required}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Download:</span>
                    <span className="font-medium">{modelInfo.download_size}</span>
                  </div>
                </div>

                {/* Loading Overlay */}
                {isLoading && (
                  <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center rounded-lg">
                    <div className="flex flex-col items-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                      <span className="text-sm text-gray-600">Loading...</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Model Comparison */}
      {Object.keys(models).length > 0 && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-3">Model Selection Guide</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h5 className="font-medium text-blue-800 mb-2">For Real-time Transcription:</h5>
              <ul className="text-blue-700 space-y-1">
                <li>• <strong>tiny/base:</strong> Best for live streaming</li>
                <li>• <strong>small:</strong> Good balance of speed/accuracy</li>
                <li>• Prioritize speed over accuracy</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-medium text-blue-800 mb-2">For High Accuracy:</h5>
              <ul className="text-blue-700 space-y-1">
                <li>• <strong>large-v3:</strong> Best accuracy available</li>
                <li>• <strong>medium:</strong> Good compromise</li>
                <li>• Process audio chunks offline</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-3 p-3 bg-blue-100 rounded">
            <p className="text-blue-800 text-sm">
              <strong>💡 Tip:</strong> Use smaller models for real-time transcription during meetings, 
              then reprocess with larger models for final accuracy.
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200">
        <button
          onClick={fetchModels}
          disabled={loading}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        
        <div className="text-sm text-gray-600">
          {systemInfo?.current_model ? (
            <span>✓ {systemInfo.current_model} model loaded</span>
          ) : (
            <span>No model loaded</span>
          )}
        </div>
      </div>
    </div>
  );
};