// AI Provider Configuration Manager
// React component for managing AI provider configurations with real-time status monitoring
// Demonstrates provider management, cost tracking, and health monitoring

import { useState, useEffect, useCallback } from 'react';

interface AIProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    last_check: string | null;
    consecutive_failures: number;
    response_time_ms: number;
    error_message: string | null;
  };
  usage: {
    total_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_cents: number;
    average_latency_ms: number;
    success_rate: number;
  };
}

interface UsageSummary {
  total_requests: number;
  total_cost_cents: number;
  total_cost_usd: number;
  total_tokens: number;
  active_providers: number;
  providers_count: number;
}

interface TestResult {
  success: boolean;
  error?: string;
  latency_ms?: number;
  cost_cents?: number;
  response?: string;
}

interface AIProviderManagerProps {
  className?: string;
}

/**
 * AIProviderManager Component
 * 
 * Comprehensive AI provider management interface that demonstrates:
 * 
 * Provider Management:
 * - Real-time status monitoring for all configured providers
 * - Health check visualization with status indicators
 * - Cost tracking and usage analytics per provider
 * - Provider testing with custom prompts
 * 
 * Configuration Features:
 * - Priority management for provider selection
 * - Enable/disable providers dynamically
 * - Cost analysis and budget monitoring
 * - Performance metrics and optimization suggestions
 * 
 * Educational Features:
 * - Provider comparison with capability matrices
 * - Cost estimation tools for different usage patterns
 * - Real-time performance monitoring
 * - Best practices and optimization recommendations
 * 
 * Production Features:
 * - Health monitoring with automatic failover
 * - Usage analytics and cost optimization
 * - Provider testing and validation
 * - Configuration management and persistence
 */
export const AIProviderManager: React.FC<AIProviderManagerProps> = () => {
  const [providers, setProviders] = useState<Record<string, AIProvider>>({});
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'usage' | 'testing' | 'config'>('status');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState('Hello, how are you?');
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [isLearningMode, setIsLearningMode] = useState(true);

  // Fetch provider status from API
  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [providersResponse, usageResponse] = await Promise.all([
        fetch('/ai/providers'),
        fetch('/ai/providers/usage')
      ]);
      
      if (!providersResponse.ok || !usageResponse.ok) {
        throw new Error('Failed to fetch provider data');
      }
      
      const providersData = await providersResponse.json();
      const usageData = await usageResponse.json();
      
      setProviders(providersData);
      setUsageSummary(usageData);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Failed to fetch providers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Test a specific provider
  const testProvider = useCallback(async (providerId: string, prompt: string = testPrompt) => {
    try {
      const response = await fetch(`/ai/providers/${providerId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId, test_prompt: prompt })
      });
      
      const result = await response.json();
      setTestResults(prev => ({ ...prev, [providerId]: result }));
      
      // Refresh provider status after test
      await fetchProviders();
      
    } catch (err) {
      console.error(`Failed to test provider ${providerId}:`, err);
      setTestResults(prev => ({ 
        ...prev, 
        [providerId]: { 
          success: false, 
          error: err instanceof Error ? err.message : 'Test failed' 
        } 
      }));
    }
  }, [testPrompt, fetchProviders]);

  // Reload configuration
  const reloadConfiguration = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/ai/reload-config', { method: 'POST' });
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Failed to reload configuration');
      }
      
      await fetchProviders();
      alert('Configuration reloaded successfully!');
      
    } catch (err) {
      console.error('Failed to reload configuration:', err);
      alert(`Failed to reload configuration: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [fetchProviders]);

  // Initialize data on component mount
  useEffect(() => {
    fetchProviders();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchProviders, 30000);
    return () => clearInterval(interval);
  }, [fetchProviders]);

  // Get status color for health indicators
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Format cost for display
  const formatCost = (cents: number) => {
    if (cents === 0) return 'Free';
    if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
    return `$${(cents / 100).toFixed(2)}`;
  };

  // Format numbers with appropriate precision
  const formatNumber = (num: number, decimals: number = 1) => {
    if (num === 0) return '0';
    if (num < 1) return num.toFixed(decimals + 1);
    return num.toFixed(decimals);
  };

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (isLoading && Object.keys(providers).length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Loading AI provider configuration...</p>
      </div>
    );
  }

  if (error && Object.keys(providers).length === 0) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <span className="text-red-600">⚠️</span>
          <h3 className="text-lg font-semibold text-red-900">Configuration Error</h3>
        </div>
        <p className="text-red-700 mb-4">{error}</p>
        <div className="flex space-x-3">
          <button
            onClick={fetchProviders}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
          <button
            onClick={reloadConfiguration}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Reload Configuration
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'status', label: 'Provider Status', icon: '🔧' },
    { id: 'usage', label: 'Usage & Costs', icon: '💰' },
    { id: 'testing', label: 'Provider Testing', icon: '🧪' },
    { id: 'config', label: 'Configuration', icon: '⚙️' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">AI Provider Management</h2>
            <p className="text-gray-600 mt-1">
              Monitor and manage AI providers with real-time status and cost tracking
            </p>
          </div>
          
          {/* Summary Stats */}
          {usageSummary && (
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {usageSummary.active_providers}/{usageSummary.providers_count}
              </div>
              <div className="text-sm text-gray-600">Active Providers</div>
              <div className="text-lg font-semibold text-green-600 mt-1">
                {formatCost(usageSummary.total_cost_cents)}
              </div>
              <div className="text-xs text-gray-500">Total Cost</div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchProviders}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 flex items-center space-x-2"
          >
            <span>🔄</span>
            <span>{isLoading ? 'Refreshing...' : 'Refresh Status'}</span>
          </button>
          
          <button
            onClick={reloadConfiguration}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center space-x-2"
          >
            <span>📁</span>
            <span>Reload Config</span>
          </button>
          
          <label className="flex items-center space-x-2 ml-auto">
            <span className="text-sm text-gray-600">Learning Mode</span>
            <input
              type="checkbox"
              checked={isLearningMode}
              onChange={(e) => setIsLearningMode(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'status' | 'usage' | 'testing' | 'config')}
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

      {/* Tab Content */}
      {activeTab === 'status' && (
        <div className="space-y-4">
          {/* Provider Status Cards */}
          <div className="grid gap-4">
            {Object.entries(providers).map(([providerId, provider]) => (
              <div key={providerId} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(provider.health.status)}`}>
                      {provider.health.status.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{provider.name}</h3>
                      <p className="text-sm text-gray-600">{provider.type} • Priority {provider.priority}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${provider.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {provider.enabled ? 'ENABLED' : 'DISABLED'}
                    </div>
                    {provider.health.response_time_ms > 0 && (
                      <div className="text-sm text-gray-600">
                        {formatDuration(provider.health.response_time_ms)} response
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Requests</div>
                    <div className="font-semibold">{provider.usage.total_requests.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Total Cost</div>
                    <div className="font-semibold">{formatCost(provider.usage.total_cost_cents)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Avg Latency</div>
                    <div className="font-semibold">{formatDuration(provider.usage.average_latency_ms)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Success Rate</div>
                    <div className="font-semibold">{formatNumber(provider.usage.success_rate, 1)}%</div>
                  </div>
                </div>
                
                {provider.health.error_message && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                    <div className="text-red-900 font-medium">Error Details:</div>
                    <div className="text-red-700 text-sm mt-1">{provider.health.error_message}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {isLearningMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">📚 Provider Status Explained:</h4>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>• <strong>Healthy:</strong> Provider responding normally with good performance</li>
                <li>• <strong>Degraded:</strong> Provider working but with slower response times</li>
                <li>• <strong>Unhealthy:</strong> Provider failing health checks or returning errors</li>
                <li>• <strong>Priority:</strong> Lower numbers = higher priority for automatic selection</li>
                <li>• <strong>Success Rate:</strong> Percentage of successful requests vs failures</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'usage' && usageSummary && (
        <div className="space-y-6">
          {/* Usage Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Usage Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">{usageSummary.total_requests.toLocaleString()}</div>
                <div className="text-blue-700 text-sm">Total Requests</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">{formatCost(usageSummary.total_cost_cents)}</div>
                <div className="text-green-700 text-sm">Total Cost</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-600">{usageSummary.total_tokens.toLocaleString()}</div>
                <div className="text-purple-700 text-sm">Total Tokens</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded">
                <div className="text-2xl font-bold text-orange-600">{usageSummary.active_providers}</div>
                <div className="text-orange-700 text-sm">Active Providers</div>
              </div>
            </div>
          </div>
          
          {/* Per-Provider Usage */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown by Provider</h3>
            <div className="space-y-4">
              {Object.entries(providers)
                .sort(([,a], [,b]) => b.usage.total_cost_cents - a.usage.total_cost_cents)
                .map(([providerId, provider]) => (
                <div key={providerId} className="flex items-center justify-between p-4 border border-gray-200 rounded">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${provider.enabled ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                    <div>
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-sm text-gray-600">{provider.usage.total_requests} requests</div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-semibold">{formatCost(provider.usage.total_cost_cents)}</div>
                    <div className="text-sm text-gray-600">
                      {provider.usage.total_input_tokens + provider.usage.total_output_tokens} tokens
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {isLearningMode && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-2">💰 Cost Optimization Tips:</h4>
              <ul className="text-green-800 text-sm space-y-1">
                <li>• <strong>Model Selection:</strong> Use smaller models for simple tasks (e.g., GPT-3.5 vs GPT-4)</li>
                <li>• <strong>Local Models:</strong> Consider Ollama for development and testing (zero cost)</li>
                <li>• <strong>Token Management:</strong> Optimize prompts to reduce input/output token usage</li>
                <li>• <strong>Provider Priority:</strong> Set cost-effective providers as higher priority</li>
                <li>• <strong>Usage Monitoring:</strong> Set up alerts for cost thresholds</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'testing' && (
        <div className="space-y-6">
          {/* Test Configuration */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Provider Testing</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Prompt
                </label>
                <textarea
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  rows={3}
                  placeholder="Enter a test prompt to send to providers..."
                />
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    Object.keys(providers).forEach(providerId => {
                      if (providers[providerId].enabled) {
                        testProvider(providerId);
                      }
                    });
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Test All Enabled Providers
                </button>
                
                <button
                  onClick={() => setTestResults({})}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Clear Results
                </button>
              </div>
            </div>
          </div>
          
          {/* Test Results */}
          <div className="space-y-4">
            {Object.entries(providers).map(([providerId, provider]) => (
              <div key={providerId} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-medium text-gray-900">{provider.name}</h4>
                  <button
                    onClick={() => testProvider(providerId)}
                    disabled={!provider.enabled}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                  >
                    Test Provider
                  </button>
                </div>
                
                {testResults[providerId] && (
                  <div className="mt-4">
                    {testResults[providerId].success ? (
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-green-600 font-medium">✅ Test Successful</span>
                          <span className="text-gray-600">
                            {formatDuration(testResults[providerId].latency_ms)} • 
                            {formatCost(testResults[providerId].cost_cents)}
                          </span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded border">
                          <div className="text-xs text-gray-600 mb-1">Response:</div>
                          <div className="text-sm">{testResults[providerId].response}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-200 p-3 rounded">
                        <div className="text-red-900 font-medium">❌ Test Failed</div>
                        <div className="text-red-700 text-sm mt-1">
                          {testResults[providerId].error}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {isLearningMode && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 mb-2">🧪 Testing Best Practices:</h4>
              <ul className="text-purple-800 text-sm space-y-1">
                <li>• <strong>Consistent Prompts:</strong> Use the same test prompt across providers for comparison</li>
                <li>• <strong>Response Quality:</strong> Evaluate both accuracy and coherence of responses</li>
                <li>• <strong>Performance Metrics:</strong> Compare latency and cost across providers</li>
                <li>• <strong>Error Handling:</strong> Test how providers handle edge cases and errors</li>
                <li>• <strong>Regular Testing:</strong> Periodically test providers to ensure consistent performance</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* Configuration Management */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Management</h3>
            
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                <h4 className="font-medium text-yellow-900 mb-2">⚠️ Configuration File Location</h4>
                <p className="text-yellow-800 text-sm">
                  Provider configurations are loaded from <code className="bg-yellow-100 px-1 rounded">shared/ai-provider-examples.json</code>.
                  Modify this file and reload to update provider settings.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Environment Variables Required</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <code className="bg-gray-100 px-2 py-1 rounded">ANTHROPIC_API_KEY</code>
                      <span className="text-gray-600">Anthropic Claude</span>
                    </div>
                    <div className="flex justify-between">
                      <code className="bg-gray-100 px-2 py-1 rounded">OPENAI_API_KEY</code>
                      <span className="text-gray-600">OpenAI GPT</span>
                    </div>
                    <div className="flex justify-between">
                      <code className="bg-gray-100 px-2 py-1 rounded">XAI_API_KEY</code>
                      <span className="text-gray-600">X.AI Grok</span>
                    </div>
                    <div className="flex justify-between">
                      <code className="bg-gray-100 px-2 py-1 rounded">AZURE_OPENAI_API_KEY</code>
                      <span className="text-gray-600">Azure OpenAI</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Provider Types Supported</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="w-3 h-3 bg-blue-400 rounded"></span>
                      <span>Anthropic Claude (anthropic)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-3 h-3 bg-green-400 rounded"></span>
                      <span>OpenAI GPT (openai)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-3 h-3 bg-purple-400 rounded"></span>
                      <span>X.AI Grok (xai)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-3 h-3 bg-orange-400 rounded"></span>
                      <span>Local Models (local)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-3 h-3 bg-indigo-400 rounded"></span>
                      <span>Azure OpenAI (azure_openai)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {isLearningMode && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <h4 className="font-semibold text-indigo-900 mb-2">⚙️ Configuration Best Practices:</h4>
              <ul className="text-indigo-800 text-sm space-y-1">
                <li>• <strong>Priority Management:</strong> Set reliable providers with lower priority numbers</li>
                <li>• <strong>Health Checks:</strong> Enable health monitoring for automatic failover</li>
                <li>• <strong>Cost Control:</strong> Start with free/cheap providers before premium ones</li>
                <li>• <strong>Security:</strong> Use environment variables for API keys, never hardcode</li>
                <li>• <strong>Backup Providers:</strong> Configure multiple providers for redundancy</li>
                <li>• <strong>Local Development:</strong> Use Ollama for offline development and testing</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};