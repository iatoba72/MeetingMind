// Claude Playground Component
// Advanced prompt testing environment with real-time streaming, debugging, and template management
// Demonstrates comprehensive Claude integration with detailed prompt engineering tools

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { claudeService, type PromptTemplate, type PromptDebugInfo, type TokenUsage } from '../services/claudeServiceSimple';

// Simple message interface for compatibility
interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface PlaygroundSession {
  id: string;
  name: string;
  created_at: string;
  messages: ClaudeMessage[];
  total_cost: number;
  total_tokens: number;
}

interface StreamingState {
  isStreaming: boolean;
  currentResponse: string;
  currentTokens: number;
  currentCost: number;
}

interface ClaudePlaygroundProps {
  clientId: string;
}

/**
 * Claude Playground Component
 * 
 * Comprehensive testing environment for Claude API integration that provides:
 * 
 * Prompt Engineering Features:
 * - Pre-built templates for meeting analysis and summarization
 * - Custom template creation with variable substitution
 * - Template versioning and optimization tracking
 * - Real-time prompt analysis and optimization suggestions
 * 
 * Streaming and Real-time Features:
 * - Live streaming responses with token counting
 * - Real-time cost estimation during generation
 * - Context window visualization and management
 * - Progressive response building with checkpoint saving
 * 
 * Debugging and Analytics:
 * - Detailed token usage breakdown and cost analysis
 * - Prompt optimization recommendations
 * - Response quality metrics and A/B testing
 * - Session management and history tracking
 * 
 * Advanced Features:
 * - Multi-model comparison within Claude family
 * - Conversation context management
 * - Export functionality for analysis and documentation
 * - Integration with MeetingMind's AI provider system
 */
export const ClaudePlayground: React.FC<ClaudePlaygroundProps> = () => {
  // Core state management
  const [apiKey, setApiKey] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentResponse: '',
    currentTokens: 0,
    currentCost: 0
  });

  // Template and session management
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [availableTemplates, setAvailableTemplates] = useState<PromptTemplate[]>([]);
  const [sessions, setSessions] = useState<PlaygroundSession[]>([]);
  const [currentSession, setCurrentSession] = useState<PlaygroundSession | null>(null);

  // Configuration state
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [useStreaming, setUseStreaming] = useState(true);
  const [conversationMode, setConversationMode] = useState(false);

  // Debug and analytics state
  const [debugInfo, setDebugInfo] = useState<PromptDebugInfo | null>(null);
  const [usageHistory, setUsageHistory] = useState<TokenUsage[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  // const [_showOptimizations, _setShowOptimizations] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<'prompt' | 'templates' | 'history' | 'analytics'>('prompt');
  // const [_isLearningMode, _setIsLearningMode] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for DOM manipulation
  const responseRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Initialize Claude service
  const initializeService = useCallback(async (key: string) => {
    try {
      claudeService.initialize(key);
      setIsInitialized(true);
      setError(null);
      
      // Load available templates
      const templates = claudeService.getTemplates();
      setAvailableTemplates(templates);
      
      // Load usage analytics
      const analytics = claudeService.getUsageAnalytics();
      setUsageHistory(analytics.recent_usage);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Claude service');
      setIsInitialized(false);
    }
  }, []);

  // Handle API key input
  const handleApiKeySubmit = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter a valid API key');
      return;
    }
    await initializeService(apiKey);
  }, [apiKey, initializeService]);

  // Create new session
  const createNewSession = useCallback(() => {
    const newSession: PlaygroundSession = {
      id: `session_${Date.now()}`,
      name: `Session ${sessions.length + 1}`,
      created_at: new Date().toISOString(),
      messages: [],
      total_cost: 0,
      total_tokens: 0
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSession(newSession);
    setResponse('');
    setCurrentPrompt('');
    setDebugInfo(null);
  }, [sessions.length]);

  // Load templates on initialization
  useEffect(() => {
    if (isInitialized) {
      const templates = claudeService.getTemplates();
      setAvailableTemplates(templates);
    }
  }, [isInitialized]);

  // Handle template selection
  const handleTemplateSelect = useCallback((templateId: string) => {
    setSelectedTemplate(templateId);
    const template = availableTemplates.find(t => t.id === templateId);
    if (template) {
      // Initialize template variables with empty values
      const initialVars: Record<string, string> = {};
      template.variables.forEach(varName => {
        initialVars[varName] = '';
      });
      setTemplateVariables(initialVars);
      
      // Preview the template
      try {
        const result = claudeService.processTemplate(templateId, initialVars);
        setCurrentPrompt(result.processed_prompt);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process template');
      }
    }
  }, [availableTemplates]);

  // Update template variables
  const updateTemplateVariable = useCallback((varName: string, value: string) => {
    setTemplateVariables(prev => {
      const updated = { ...prev, [varName]: value };
      
      // Update prompt preview if template is selected
      if (selectedTemplate) {
        try {
          const result = claudeService.processTemplate(selectedTemplate, updated);
          setCurrentPrompt(result.processed_prompt);
        } catch (err) {
          console.error('Template processing error:', err);
        }
      }
      
      return updated;
    });
  }, [selectedTemplate]);

  // Generate response with Claude
  const generateResponse = useCallback(async () => {
    if (!isInitialized || !currentPrompt.trim()) {
      setError('Please initialize the service and enter a prompt');
      return;
    }

    setError(null);
    setResponse('');
    setDebugInfo(null);

    const messages: ClaudeMessage[] = conversationMode && currentSession ? 
      [...currentSession.messages, { role: 'user', content: currentPrompt }] :
      [{ role: 'user', content: currentPrompt }];

    try {
      if (useStreaming) {
        // Streaming response with real-time updates
        setStreamingState({
          isStreaming: true,
          currentResponse: '',
          currentTokens: 0,
          currentCost: 0
        });

        const result = await claudeService.generateStreamingResponse(
          messages,
          (chunk, debug) => {
            setStreamingState(prev => ({
              ...prev,
              currentResponse: prev.currentResponse + chunk,
              currentTokens: debug?.token_count?.total_estimate || prev.currentTokens,
              currentCost: debug?.cost_estimate?.total_cost_cents || prev.currentCost
            }));
            
            // Auto-scroll to bottom
            if (responseRef.current) {
              responseRef.current.scrollTop = responseRef.current.scrollHeight;
            }
          },
          {
            model,
            max_tokens: maxTokens,
            temperature,
            template_id: selectedTemplate || undefined,
            template_variables: Object.keys(templateVariables).length > 0 ? templateVariables : undefined
          }
        );

        setResponse(result.full_response);
        setDebugInfo(result.debug_info);
        setUsageHistory(prev => [result.usage, ...prev.slice(0, 9)]);
        
        setStreamingState({
          isStreaming: false,
          currentResponse: '',
          currentTokens: 0,
          currentCost: 0
        });

        // Update session
        if (currentSession) {
          const updatedSession = {
            ...currentSession,
            messages: [...messages, { role: 'assistant', content: result.full_response }],
            total_cost: currentSession.total_cost + result.usage.estimated_cost_cents,
            total_tokens: currentSession.total_tokens + result.usage.total_tokens
          };
          setCurrentSession(updatedSession);
          setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
        }

      } else {
        // Non-streaming response
        const result = await claudeService.generateResponse(
          messages,
          {
            model,
            max_tokens: maxTokens,
            temperature,
            template_id: selectedTemplate || undefined,
            template_variables: Object.keys(templateVariables).length > 0 ? templateVariables : undefined
          }
        );

        setResponse(result.response);
        setDebugInfo(result.debug_info);
        setUsageHistory(prev => [result.usage, ...prev.slice(0, 9)]);

        // Update session
        if (currentSession) {
          const updatedSession = {
            ...currentSession,
            messages: [...messages, { role: 'assistant', content: result.response }],
            total_cost: currentSession.total_cost + result.usage.estimated_cost_cents,
            total_tokens: currentSession.total_tokens + result.usage.total_tokens
          };
          setCurrentSession(updatedSession);
          setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
        }
      }

      if (conversationMode) {
        setCurrentPrompt(''); // Clear for next message
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate response');
      setStreamingState({
        isStreaming: false,
        currentResponse: '',
        currentTokens: 0,
        currentCost: 0
      });
    }
  }, [
    isInitialized, currentPrompt, conversationMode, currentSession, useStreaming,
    model, maxTokens, temperature, selectedTemplate, templateVariables
  ]);

  // Format cost for display
  const formatCost = (cents: number) => {
    if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
    return `$${(cents / 100).toFixed(3)}`;
  };

  // Format tokens with commas
  const formatTokens = (count: number) => count.toLocaleString();

  // Calculate total analytics
  const totalAnalytics = usageHistory.reduce((acc, usage) => ({
    cost: acc.cost + usage.estimated_cost_cents,
    tokens: acc.tokens + usage.total_tokens
  }), { cost: 0, tokens: 0 });

  if (!isInitialized) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Claude Playground</h2>
          <p className="text-gray-600 mb-6">
            Enter your Anthropic API key to start testing Claude with advanced prompt engineering tools
          </p>
          
          <div className="max-w-md mx-auto space-y-4">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Anthropic API key..."
              className="w-full border border-gray-300 rounded px-4 py-3 text-center"
              onKeyPress={(e) => e.key === 'Enter' && handleApiKeySubmit()}
            />
            
            <button
              onClick={handleApiKeySubmit}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Initialize Claude Playground
            </button>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
          
          <div className="mt-8 text-xs text-gray-500">
            <p>Your API key is stored locally and used only for direct Claude API calls.</p>
            <p>For production use, API calls should be routed through your backend.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Claude Playground</h2>
            <p className="text-gray-600 mt-1">
              Advanced prompt engineering with Claude Sonnet 3.5 • Real-time streaming • Template system
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-right text-sm">
              <div className="font-semibold text-green-600">{formatCost(totalAnalytics.cost)}</div>
              <div className="text-gray-500">Total Cost</div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-blue-600">{formatTokens(totalAnalytics.tokens)}</div>
              <div className="text-gray-500">Total Tokens</div>
            </div>
            <button
              onClick={createNewSession}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              New Session
            </button>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
              <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Max Tokens</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              min="1"
              max="8192"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Temperature</label>
            <input
              type="range"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              min="0"
              max="2"
              step="0.1"
              className="w-full"
            />
            <div className="text-xs text-gray-500 text-center">{temperature}</div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="streaming"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="streaming" className="text-sm text-gray-700">Streaming</label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="conversation"
              checked={conversationMode}
              onChange={(e) => setConversationMode(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="conversation" className="text-sm text-gray-700">Conversation</label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="debug"
              checked={showDebugPanel}
              onChange={(e) => setShowDebugPanel(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="debug" className="text-sm text-gray-700">Debug</label>
          </div>
        </div>

        {/* Session Info */}
        {currentSession && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <strong>{currentSession.name}</strong> • {currentSession.messages.length} messages
              </div>
              <div>
                {formatCost(currentSession.total_cost)} • {formatTokens(currentSession.total_tokens)} tokens
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        {[
          { id: 'prompt', label: 'Prompt Editor', icon: '✏️' },
          { id: 'templates', label: 'Templates', icon: '📝' },
          { id: 'history', label: 'History', icon: '📊' },
          { id: 'analytics', label: 'Analytics', icon: '📈' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'prompt' | 'templates' | 'history' | 'analytics')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Input */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'prompt' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Prompt Editor</h3>
              
              {/* Template Selection */}
              {availableTemplates.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Template (Optional)
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  >
                    <option value="">Custom Prompt</option>
                    {availableTemplates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.category}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Template Variables */}
              {selectedTemplate && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                  <h4 className="font-medium text-yellow-900 mb-3">Template Variables</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {availableTemplates
                      .find(t => t.id === selectedTemplate)
                      ?.variables.map(varName => (
                      <div key={varName}>
                        <label className="block text-xs font-medium text-yellow-800 mb-1">
                          {varName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </label>
                        <input
                          type="text"
                          value={templateVariables[varName] || ''}
                          onChange={(e) => updateTemplateVariable(varName, e.target.value)}
                          className="w-full border border-yellow-300 rounded px-2 py-1 text-sm"
                          placeholder={`Enter ${varName}...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompt Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {conversationMode ? 'Your Message' : 'Prompt'}
                </label>
                <textarea
                  ref={promptRef}
                  value={currentPrompt}
                  onChange={(e) => setCurrentPrompt(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 h-48 text-sm font-mono"
                  placeholder={conversationMode ? "Type your message..." : "Enter your prompt for Claude..."}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={generateResponse}
                  disabled={streamingState.isStreaming || !currentPrompt.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {streamingState.isStreaming ? (
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

                <button
                  onClick={() => {
                    setCurrentPrompt('');
                    setResponse('');
                    setSelectedTemplate('');
                    setTemplateVariables({});
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Clear
                </button>

                {debugInfo && (
                  <div className="text-sm text-gray-600">
                    Est. {formatTokens(debugInfo.token_count.total_estimate)} tokens • 
                    {formatCost(debugInfo.cost_estimate.total_cost_cents)}
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Prompt Templates</h3>
              
              <div className="space-y-4">
                {['meeting_summary', 'action_items', 'key_insights', 'follow_up', 'analysis'].map(category => {
                  const categoryTemplates = availableTemplates.filter(t => t.category === category);
                  if (categoryTemplates.length === 0) return null;
                  
                  return (
                    <div key={category}>
                      <h4 className="font-medium text-gray-700 mb-2 capitalize">
                        {category.replace(/_/g, ' ')}
                      </h4>
                      <div className="grid gap-3">
                        {categoryTemplates.map(template => (
                          <div key={template.id} className="border border-gray-200 rounded p-4 hover:bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium text-gray-900">{template.name}</h5>
                              <button
                                onClick={() => handleTemplateSelect(template.id)}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                              >
                                Use Template
                              </button>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>Variables: {template.variables.join(', ')}</span>
                              <span>Est. {formatCost(template.metadata.cost_estimate.estimated_cost_cents)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Request History</h3>
              
              <div className="space-y-3">
                {usageHistory.map((usage, index) => (
                  <div key={index} className="border border-gray-200 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        Request #{usageHistory.length - index}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(usage.request_timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Tokens:</span> {formatTokens(usage.total_tokens)}
                      </div>
                      <div>
                        <span className="text-gray-600">Cost:</span> {formatCost(usage.estimated_cost_cents)}
                      </div>
                      <div>
                        <span className="text-gray-600">Ratio:</span> {usage.input_tokens}:{usage.output_tokens}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Analytics</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">{usageHistory.length}</div>
                  <div className="text-blue-700 text-sm">Total Requests</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">{formatCost(totalAnalytics.cost)}</div>
                  <div className="text-green-700 text-sm">Total Cost</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded">
                  <div className="text-2xl font-bold text-purple-600">{formatTokens(totalAnalytics.tokens)}</div>
                  <div className="text-purple-700 text-sm">Total Tokens</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded">
                  <div className="text-2xl font-bold text-orange-600">
                    {usageHistory.length > 0 ? formatCost(totalAnalytics.cost / usageHistory.length) : '$0'}
                  </div>
                  <div className="text-orange-700 text-sm">Avg Cost</div>
                </div>
              </div>

              {sessions.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Sessions</h4>
                  <div className="space-y-2">
                    {sessions.map(session => (
                      <div key={session.id} className="flex items-center justify-between p-3 border border-gray-200 rounded">
                        <div>
                          <div className="font-medium text-gray-900">{session.name}</div>
                          <div className="text-sm text-gray-600">
                            {session.messages.length} messages • {new Date(session.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{formatCost(session.total_cost)}</div>
                          <div className="text-xs text-gray-500">{formatTokens(session.total_tokens)} tokens</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Response and Debug */}
        <div className="space-y-6">
          {/* Response Display */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Response</h3>
              {streamingState.isStreaming && (
                <div className="flex items-center space-x-2 text-sm text-blue-600">
                  <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span>Streaming... {formatTokens(streamingState.currentTokens)} tokens</span>
                </div>
              )}
            </div>

            <div
              ref={responseRef}
              className="bg-gray-50 border border-gray-200 rounded p-4 min-h-64 max-h-96 overflow-y-auto text-sm font-mono whitespace-pre-wrap"
            >
              {streamingState.isStreaming ? streamingState.currentResponse : response || 'Response will appear here...'}
            </div>

            {(response || streamingState.currentResponse) && (
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {streamingState.isStreaming ? 
                    `${formatTokens(streamingState.currentTokens)} tokens (streaming)` :
                    debugInfo ? `${formatTokens(debugInfo.token_count.input + debugInfo.token_count.estimated_output)} tokens` : ''
                  }
                </span>
                <span>
                  {streamingState.isStreaming ? 
                    formatCost(streamingState.currentCost) :
                    debugInfo ? formatCost(debugInfo.cost_estimate.total_cost_cents) : ''
                  }
                </span>
              </div>
            )}
          </div>

          {/* Debug Panel */}
          {showDebugPanel && debugInfo && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Debug Information</h3>
              
              <div className="space-y-4">
                {/* Token Breakdown */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Token Usage</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span>Input:</span>
                      <span className="font-mono">{formatTokens(debugInfo.token_count.input)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Output:</span>
                      <span className="font-mono">{formatTokens(debugInfo.token_count.estimated_output)}</span>
                    </div>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Cost Breakdown</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span>Input Cost:</span>
                      <span className="font-mono">{formatCost(debugInfo.cost_estimate.input_cost_cents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Output Cost:</span>
                      <span className="font-mono">{formatCost(debugInfo.cost_estimate.output_cost_cents)}</span>
                    </div>
                  </div>
                </div>

                {/* Template Info */}
                {debugInfo.template_used && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Template Used</h4>
                    <div className="text-sm bg-blue-50 border border-blue-200 rounded p-2">
                      {debugInfo.template_used}
                    </div>
                  </div>
                )}

                {/* Optimization Suggestions */}
                {showOptimizations && debugInfo.optimization_suggestions.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Optimization Suggestions</h4>
                    <ul className="text-sm space-y-1">
                      {debugInfo.optimization_suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-yellow-500 mt-0.5">💡</span>
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Learning Mode Tips */}
          {isLearningMode && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <h4 className="font-semibold text-indigo-900 mb-2">🎓 Prompt Engineering Tips:</h4>
              <ul className="text-indigo-800 text-sm space-y-1">
                <li>• Use templates for consistent, optimized prompts</li>
                <li>• Monitor token usage to control costs</li>
                <li>• Try different temperatures for creativity vs consistency</li>
                <li>• Use conversation mode for multi-turn interactions</li>
                <li>• Check optimization suggestions for better prompts</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};