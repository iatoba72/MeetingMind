// AI Playground Component
// Interactive testing environment for AI providers with real-time comparison
// Demonstrates different AI capabilities and allows side-by-side provider testing

import React, { useState, useCallback } from 'react';

interface PlaygroundRequest {
  id: string;
  timestamp: string;
  provider_id?: string;
  prompt: string;
  model?: string;
  temperature: number;
  max_tokens: number;
  type: 'generate' | 'chat';
}

interface PlaygroundResponse {
  request_id: string;
  response: string;
  provider_used: {
    id: string;
    name: string;
    type: string;
  };
  cost_cents?: number;
  latency_ms?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  timestamp: string;
  error?: string;
}

interface AIPlaygroundProps {
  clientId: string;
}

/**
 * AIPlayground Component
 * 
 * Interactive testing environment for AI providers that demonstrates:
 * 
 * Testing Capabilities:
 * - Side-by-side provider comparison with identical prompts
 * - Real-time response generation and performance metrics
 * - Cost estimation and token usage tracking
 * - Different conversation modes (single prompt vs chat)
 * 
 * Educational Features:
 * - Pre-built prompt templates for common use cases
 * - Parameter explanations (temperature, max_tokens, etc.)
 * - Performance comparison visualization
 * - Best practices and optimization tips
 * 
 * Advanced Features:
 * - Batch testing across multiple providers
 * - Response quality evaluation tools
 * - Export functionality for analysis
 * - Historical comparison tracking
 * 
 * Use Cases:
 * - Evaluate provider performance for specific tasks
 * - Test cost-effectiveness of different models
 * - Compare response quality and style
 * - Prototype AI integrations before implementation
 */
export const AIPlayground: React.FC<AIPlaygroundProps> = ({ clientId }) => {
  const [activeMode, setActiveMode] = useState<'single' | 'compare' | 'batch'>('single');
  const [prompt, setPrompt] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [conversationMode, setConversationMode] = useState<'generate' | 'chat'>('generate');
  
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState<Record<string, PlaygroundResponse>>({});
  const [requestHistory, setRequestHistory] = useState<PlaygroundRequest[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Record<string, any>>({});
  const [isLearningMode, setIsLearningMode] = useState(true);

  // Predefined prompt templates for common use cases
  const promptTemplates = [
    {
      category: 'Creative Writing',
      prompts: [
        'Write a short story about a robot learning to paint',
        'Create a poem about the beauty of code',
        'Describe a futuristic city from the perspective of a time traveler'
      ]
    },
    {
      category: 'Analysis & Reasoning',
      prompts: [
        'Explain the pros and cons of renewable energy sources',
        'Analyze the impact of social media on modern communication',
        'Compare and contrast different programming paradigms'
      ]
    },
    {
      category: 'Problem Solving',
      prompts: [
        'How would you design a system to manage a library\'s book inventory?',
        'What steps would you take to debug a slow web application?',
        'Explain how to optimize a database query for better performance'
      ]
    },
    {
      category: 'Code & Technical',
      prompts: [
        'Write a Python function to find the longest common subsequence',
        'Explain the concept of microservices architecture',
        'How would you implement a real-time chat system?'
      ]
    }
  ];

  // Fetch available providers
  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch('/ai/providers');
      if (response.ok) {
        const providers = await response.json();
        setAvailableProviders(providers);
        
        // Set default provider if none selected
        if (!selectedProvider && Object.keys(providers).length > 0) {
          const enabledProviders = Object.entries(providers).filter(([_, p]: [string, any]) => p.enabled);
          if (enabledProviders.length > 0) {
            setSelectedProvider(enabledProviders[0][0]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  }, [selectedProvider]);

  // Load providers on component mount
  React.useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Generate text with selected provider
  const generateText = useCallback(async (providerId?: string) => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }

    setIsLoading(true);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const request: PlaygroundRequest = {
      id: requestId,
      timestamp: new Date().toISOString(),
      provider_id: providerId || selectedProvider,
      prompt,
      model: selectedModel || undefined,
      temperature,
      max_tokens: maxTokens,
      type: conversationMode
    };

    setRequestHistory(prev => [request, ...prev]);

    try {
      let endpoint = '/ai/generate';
      let body: any = {
        prompt,
        provider_id: providerId || selectedProvider || undefined,
        model: selectedModel || undefined,
        temperature,
        max_tokens: maxTokens
      };

      if (conversationMode === 'chat') {
        endpoint = '/ai/chat';
        body = {
          messages: [
            ...chatMessages,
            { role: 'user', content: prompt }
          ],
          provider_id: providerId || selectedProvider || undefined,
          model: selectedModel || undefined,
          temperature,
          max_tokens: maxTokens
        };
      }

      const startTime = Date.now();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      const latency = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(result.detail || 'Request failed');
      }

      const playgroundResponse: PlaygroundResponse = {
        request_id: requestId,
        response: conversationMode === 'chat' ? result.message.content : result.response,
        provider_used: result.provider_used || { id: 'unknown', name: 'Unknown', type: 'unknown' },
        cost_cents: result.cost_cents,
        latency_ms: latency,
        usage: result.usage,
        timestamp: result.timestamp
      };

      setResponses(prev => ({ ...prev, [requestId]: playgroundResponse }));

      // Update chat history if in chat mode
      if (conversationMode === 'chat') {
        setChatMessages(prev => [
          ...prev,
          { role: 'user', content: prompt },
          { role: 'assistant', content: playgroundResponse.response }
        ]);
      }

      // Clear prompt for next input
      setPrompt('');

    } catch (error) {
      const errorResponse: PlaygroundResponse = {
        request_id: requestId,
        response: '',
        provider_used: { id: 'error', name: 'Error', type: 'error' },
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      setResponses(prev => ({ ...prev, [requestId]: errorResponse }));
    } finally {
      setIsLoading(false);
    }
  }, [prompt, selectedProvider, selectedModel, temperature, maxTokens, conversationMode, chatMessages]);

  // Compare across multiple providers
  const compareProviders = useCallback(async () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt for comparison');
      return;
    }

    const enabledProviders = Object.entries(availableProviders)
      .filter(([_, provider]: [string, any]) => provider.enabled)
      .map(([id, _]) => id);

    if (enabledProviders.length < 2) {
      alert('Need at least 2 enabled providers for comparison');
      return;
    }

    setIsLoading(true);
    
    // Generate requests for all enabled providers
    const promises = enabledProviders.map(providerId => generateText(providerId));
    
    try {
      await Promise.allSettled(promises);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, availableProviders, generateText]);

  // Format cost for display
  const formatCost = (cents?: number) => {
    if (!cents) return 'Free';
    if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
    return `$${(cents / 100).toFixed(3)}`;
  };

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const modes = [
    { id: 'single', label: 'Single Provider', icon: '🎯' },
    { id: 'compare', label: 'Compare Providers', icon: '⚖️' },
    { id: 'batch', label: 'Batch Testing', icon: '🔄' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">AI Playground</h2>
            <p className="text-gray-600 mt-1">
              Test and compare AI providers with interactive prompts and real-time responses
            </p>
          </div>
          
          <label className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Learning Mode</span>
            <input
              type="checkbox"
              checked={isLearningMode}
              onChange={(e) => setIsLearningMode(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>

        {/* Mode Selection */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id as any)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeMode === mode.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="mr-2">{mode.icon}</span>
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conversation Mode
            </label>
            <select
              value={conversationMode}
              onChange={(e) => setConversationMode(e.target.value as 'generate' | 'chat')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="generate">Single Prompt</option>
              <option value="chat">Chat Conversation</option>
            </select>
          </div>

          {activeMode === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Auto-select best</option>
                {Object.entries(availableProviders).map(([id, provider]: [string, any]) => (
                  <option key={id} value={id} disabled={!provider.enabled}>
                    {provider.name} {!provider.enabled ? '(disabled)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temperature
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-gray-500 text-center">{temperature}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Tokens
            </label>
            <input
              type="number"
              min="1"
              max="4096"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {isLearningMode && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <div className="font-medium text-blue-900 mb-1">Parameter Explanations:</div>
            <ul className="text-blue-800 space-y-1">
              <li>• <strong>Temperature:</strong> 0 = deterministic, 2 = very creative/random</li>
              <li>• <strong>Max Tokens:</strong> Limits response length (1 token ≈ 4 characters)</li>
              <li>• <strong>Single Prompt:</strong> One-off text generation</li>
              <li>• <strong>Chat:</strong> Maintains conversation context</li>
            </ul>
          </div>
        )}
      </div>

      {/* Prompt Templates */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Prompt Templates</h3>
        <div className="space-y-4">
          {promptTemplates.map((category) => (
            <div key={category.category}>
              <h4 className="font-medium text-gray-700 mb-2">{category.category}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {category.prompts.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => setPrompt(template)}
                    className="text-left p-3 border border-gray-200 rounded hover:bg-gray-50 text-sm"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="space-y-4">
          {conversationMode === 'chat' && chatMessages.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-4 max-h-60 overflow-y-auto">
              <h4 className="font-medium text-gray-700 mb-3">Conversation History</h4>
              <div className="space-y-2">
                {chatMessages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded text-sm ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white border border-gray-200'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setChatMessages([])}
                className="mt-3 text-sm text-red-600 hover:text-red-700"
              >
                Clear History
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {conversationMode === 'chat' ? 'Your Message' : 'Prompt'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              rows={4}
              placeholder={
                conversationMode === 'chat' 
                  ? "Type your message..." 
                  : "Enter your prompt to test AI providers..."
              }
            />
          </div>

          <div className="flex space-x-3">
            {activeMode === 'single' ? (
              <button
                onClick={() => generateText()}
                disabled={isLoading || !prompt.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Generate Response</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={compareProviders}
                disabled={isLoading || !prompt.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Comparing...</span>
                  </>
                ) : (
                  <>
                    <span>⚖️</span>
                    <span>Compare All Providers</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => {
                setResponses({});
                setRequestHistory([]);
                setChatMessages([]);
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Responses */}
      {requestHistory.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Responses</h3>
          
          {requestHistory.map((request) => {
            const response = responses[request.id];
            if (!response) return null;

            return (
              <div key={request.id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="font-medium text-gray-900">
                      {response.provider_used.name}
                    </div>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {response.provider_used.type}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>{formatDuration(response.latency_ms)}</span>
                    <span>{formatCost(response.cost_cents)}</span>
                    {response.usage && (
                      <span>
                        {response.usage.input_tokens + response.usage.output_tokens} tokens
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-sm text-gray-600 mb-1">Prompt:</div>
                  <div className="bg-gray-50 p-3 rounded border text-sm">
                    {request.prompt}
                  </div>
                </div>

                {response.error ? (
                  <div className="bg-red-50 border border-red-200 p-3 rounded">
                    <div className="text-red-900 font-medium">Error</div>
                    <div className="text-red-700 text-sm">{response.error}</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Response:</div>
                    <div className="bg-blue-50 p-3 rounded border text-sm whitespace-pre-wrap">
                      {response.response}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isLearningMode && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-2">🧪 Playground Tips:</h4>
          <ul className="text-green-800 text-sm space-y-1">
            <li>• <strong>Compare Mode:</strong> Test identical prompts across providers to evaluate quality</li>
            <li>• <strong>Temperature Testing:</strong> Try different values to see creativity vs consistency</li>
            <li>• <strong>Prompt Engineering:</strong> Experiment with different prompt styles and formats</li>
            <li>• <strong>Cost Awareness:</strong> Monitor token usage and costs for budget optimization</li>
            <li>• <strong>Use Cases:</strong> Test providers with your specific use case scenarios</li>
          </ul>
        </div>
      )}
    </div>
  );
};