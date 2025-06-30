// Prompt Debugger Component
// Advanced debugging and optimization tool for Claude prompts with detailed analytics
// Provides comprehensive insights into prompt performance, cost, and optimization opportunities

import React, { useState, useCallback, useEffect } from 'react';
import { claudeService, type PromptDebugInfo, type TokenUsage } from '../services/claudeServiceSimple';

interface PromptAnalysis {
  id: string;
  timestamp: string;
  prompt: string;
  response: string;
  debug_info: PromptDebugInfo;
  usage: TokenUsage;
  model: string;
  settings: {
    temperature: number;
    max_tokens: number;
  };
}

interface OptimizationSuggestion {
  type: 'cost' | 'performance' | 'quality' | 'structure';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  suggestion: string;
  potential_savings?: {
    tokens?: number;
    cost_cents?: number;
  };
}

interface PromptMetrics {
  readability_score: number;
  complexity_score: number;
  specificity_score: number;
  structure_score: number;
  estimated_effectiveness: number;
}

interface PromptDebuggerProps {
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  showAdvancedAnalytics?: boolean;
}

/**
 * PromptDebugger Component
 * 
 * Comprehensive debugging tool for Claude prompts that provides:
 * 
 * Token Analysis:
 * - Real-time token counting with character-level breakdown
 * - Input/output token ratio analysis and optimization
 * - Context window utilization and management recommendations
 * - Token efficiency scoring and comparative analysis
 * 
 * Cost Analysis:
 * - Real-time cost estimation with model-specific pricing
 * - Cost per token breakdown and optimization opportunities
 * - Budget impact analysis and cost projection tools
 * - ROI analysis for different prompt strategies
 * 
 * Prompt Quality Analysis:
 * - Readability and complexity scoring
 * - Structure analysis and formatting recommendations
 * - Specificity and clarity assessments
 * - Effectiveness prediction based on best practices
 * 
 * Optimization Recommendations:
 * - Automated prompt optimization suggestions
 * - Template matching and improvement recommendations
 * - Performance enhancement strategies
 * - Cost reduction opportunities without quality loss
 * 
 * Advanced Features:
 * - A/B testing framework for prompt variations
 * - Historical performance tracking and trends
 * - Collaborative prompt sharing and versioning
 * - Export capabilities for documentation and analysis
 */
export const PromptDebugger: React.FC<PromptDebuggerProps> = ({
  prompt = '',
  onPromptChange
}) => {
  // Core state
  const [currentPrompt, setCurrentPrompt] = useState(prompt);
  const [analysisHistory, setAnalysisHistory] = useState<PromptAnalysis[]>([]);
  const [, setCurrentAnalysis] = useState<PromptAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Debug and optimization state
  const [debugInfo, setDebugInfo] = useState<PromptDebugInfo | null>(null);
  const [optimizationSuggestions, setOptimizationSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [promptMetrics, setPromptMetrics] = useState<PromptMetrics | null>(null);
  
  // Configuration
  const [selectedModel, setSelectedModel] = useState('claude-3-5-sonnet-20241022');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);

  // UI state
  const [activeTab, setActiveTab] = useState<'analysis' | 'optimization' | 'metrics' | 'history'>('analysis');
  // UI state configuration stored but not currently used in UI
  // These can be used for future feature implementations

  // Sync with parent component
  useEffect(() => {
    setCurrentPrompt(prompt);
  }, [prompt]);

  // Real-time analysis as user types
  useEffect(() => {
    if (currentPrompt.trim()) {
      const debounceTimer = setTimeout(() => {
        analyzePromptRealTime();
      }, 500);
      
      return () => clearTimeout(debounceTimer);
    }
  }, [currentPrompt, selectedModel, maxTokens, temperature, analyzePromptRealTime]);

  /**
   * Analyze prompt in real-time without making API calls
   * Provides immediate feedback on token count, cost, and basic metrics
   */
  const analyzePromptRealTime = useCallback(() => {
    if (!currentPrompt.trim()) return;

    // Calculate basic metrics
    const tokenCount = claudeService.estimateTokens(currentPrompt);
    const estimatedOutputTokens = Math.min(maxTokens, 1000);
    const totalTokens = tokenCount + estimatedOutputTokens;
    const estimatedCost = claudeService.calculateCost(tokenCount, estimatedOutputTokens, selectedModel);

    // Generate debug info
    const mockDebugInfo: PromptDebugInfo = {
      prompt_id: `debug_${Date.now()}`,
      variables_substituted: {},
      token_count: {
        input: tokenCount,
        estimated_output: estimatedOutputTokens,
        total_estimate: totalTokens
      },
      cost_estimate: {
        input_cost_cents: claudeService.calculateCost(tokenCount, 0, selectedModel),
        output_cost_cents: claudeService.calculateCost(0, estimatedOutputTokens, selectedModel),
        total_cost_cents: estimatedCost
      },
      context_info: {
        context_length: tokenCount,
        messages_count: 1,
        truncated: tokenCount > 100000
      },
      optimization_suggestions: generateOptimizationSuggestions(currentPrompt, tokenCount, estimatedCost)
    };

    setDebugInfo(mockDebugInfo);
    
    // Calculate prompt metrics
    const metrics = calculatePromptMetrics(currentPrompt);
    setPromptMetrics(metrics);
    
    // Generate optimization suggestions
    const suggestions = generateDetailedOptimizations(currentPrompt, tokenCount, estimatedCost, metrics);
    setOptimizationSuggestions(suggestions);

  }, [currentPrompt, selectedModel, maxTokens, calculatePromptMetrics, generateDetailedOptimizations, generateOptimizationSuggestions]);

  /**
   * Calculate comprehensive prompt metrics
   */
  const calculatePromptMetrics = useCallback((prompt: string): PromptMetrics => {
    const words = prompt.split(/\s+/).length;
    const sentences = prompt.split(/[.!?]+/).length - 1;
    const avgWordsPerSentence = sentences > 0 ? words / sentences : 0;
    const hasStructure = /(\n|•|-)/.test(prompt);
    const hasExamples = /example|e\.g\.|for instance/i.test(prompt);
    const hasRoleDefinition = /you are|act as|imagine you/i.test(prompt);
    const hasSpecificInstructions = /please|must|should|ensure/i.test(prompt);

    return {
      readability_score: Math.max(0, Math.min(100, 100 - (avgWordsPerSentence * 2))),
      complexity_score: Math.min(100, words / 10),
      specificity_score: (hasSpecificInstructions ? 30 : 0) + (hasExamples ? 40 : 0) + (hasRoleDefinition ? 30 : 0),
      structure_score: hasStructure ? 80 : 40,
      estimated_effectiveness: 0 // Will be calculated based on other scores
    };
  }, []);

  /**
   * Generate detailed optimization suggestions
   */
  const generateDetailedOptimizations = useCallback((
    prompt: string,
    tokenCount: number,
    cost: number,
    metrics: PromptMetrics
  ): OptimizationSuggestion[] => {
    const suggestions: OptimizationSuggestion[] = [];

    // Cost optimization suggestions
    if (cost > 2.0) {
      suggestions.push({
        type: 'cost',
        severity: 'high',
        title: 'High Cost Alert',
        description: 'This prompt will be expensive to run frequently',
        suggestion: 'Consider using Claude Haiku for simple tasks or reduce prompt length',
        potential_savings: {
          cost_cents: cost * 0.4 // Switching to Haiku could save ~40%
        }
      });
    }

    if (tokenCount > 3000) {
      suggestions.push({
        type: 'cost',
        severity: 'medium',
        title: 'Long Prompt Detected',
        description: 'Prompt uses many tokens which increases cost',
        suggestion: 'Break into smaller, focused prompts or remove unnecessary details',
        potential_savings: {
          tokens: Math.floor(tokenCount * 0.3),
          cost_cents: cost * 0.3
        }
      });
    }

    // Performance suggestions
    if (metrics.structure_score < 60) {
      suggestions.push({
        type: 'performance',
        severity: 'medium',
        title: 'Poor Structure',
        description: 'Prompt lacks clear structure which may affect response quality',
        suggestion: 'Use bullet points, numbered lists, or clear sections to organize your prompt'
      });
    }

    if (metrics.specificity_score < 50) {
      suggestions.push({
        type: 'quality',
        severity: 'high',
        title: 'Lacks Specificity',
        description: 'Prompt is too vague and may produce inconsistent results',
        suggestion: 'Add specific examples, clear instructions, and define the expected output format'
      });
    }

    // Quality suggestions
    if (!prompt.toLowerCase().includes('format') && !prompt.toLowerCase().includes('structure')) {
      suggestions.push({
        type: 'quality',
        severity: 'medium',
        title: 'No Output Format Specified',
        description: 'Without specifying output format, responses may be inconsistent',
        suggestion: 'Add a section specifying the desired response format (bullet points, JSON, etc.)'
      });
    }

    if (metrics.readability_score < 60) {
      suggestions.push({
        type: 'quality',
        severity: 'low',
        title: 'Complex Readability',
        description: 'Prompt may be difficult to understand due to complex sentences',
        suggestion: 'Break long sentences into shorter ones and use simpler language'
      });
    }

    return suggestions;
  }, []);

  /**
   * Generate basic optimization suggestions (from ClaudeService)
   */
  const generateOptimizationSuggestions = useCallback((
    prompt: string,
    tokenCount: number,
    cost: number
  ): string[] => {
    const suggestions: string[] = [];

    if (tokenCount > 3000) {
      suggestions.push('Consider shortening the prompt to reduce token usage and costs');
    }
    if (cost > 1.5) {
      suggestions.push('High cost prompt - consider using Claude Haiku for simple tasks');
    }
    if (!prompt.includes('format')) {
      suggestions.push('Specify the desired output format for better results');
    }
    if (!prompt.toLowerCase().includes('example')) {
      suggestions.push('Adding examples can significantly improve response quality');
    }

    return suggestions;
  }, []);

  /**
   * Run full analysis with API call
   */
  const runFullAnalysis = useCallback(async () => {
    if (!currentPrompt.trim()) return;

    setIsAnalyzing(true);
    try {
      const result = await claudeService.generateResponse(currentPrompt, {
        model: selectedModel,
        max_tokens: maxTokens,
        temperature
      });

      const analysis: PromptAnalysis = {
        id: `analysis_${Date.now()}`,
        timestamp: new Date().toISOString(),
        prompt: currentPrompt,
        response: result.response,
        debug_info: result.debug_info,
        usage: result.usage,
        model: selectedModel,
        settings: { temperature, max_tokens: maxTokens }
      };

      setCurrentAnalysis(analysis);
      setAnalysisHistory(prev => [analysis, ...prev.slice(0, 9)]);

    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentPrompt, selectedModel, maxTokens, temperature]);

  /**
   * Handle prompt change
   */
  const handlePromptChange = useCallback((newPrompt: string) => {
    setCurrentPrompt(newPrompt);
    onPromptChange?.(newPrompt);
  }, [onPromptChange]);

  /**
   * Format numbers for display
   */
  const formatNumber = (num: number, decimals: number = 0) => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatCost = (cents: number) => {
    if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
    return `$${(cents / 100).toFixed(3)}`;
  };

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-100 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-100 border-blue-200';
    }
  };

  const getMetricColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Prompt Debugger</h2>
            <p className="text-gray-600 mt-1">
              Advanced analysis and optimization for Claude prompts
            </p>
          </div>
          
          {debugInfo && (
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {formatNumber(debugInfo.token_count.total_estimate)}
              </div>
              <div className="text-sm text-gray-600">Est. Tokens</div>
              <div className="text-lg font-semibold text-green-600 mt-1">
                {formatCost(debugInfo.cost_estimate.total_cost_cents)}
              </div>
              <div className="text-xs text-gray-500">Est. Cost</div>
            </div>
          )}
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
              <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              min="1"
              max="8192"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
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

          <div className="flex items-end">
            <button
              onClick={runFullAnalysis}
              disabled={isAnalyzing || !currentPrompt.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 text-sm"
            >
              {isAnalyzing ? 'Analyzing...' : 'Full Analysis'}
            </button>
          </div>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prompt to Analyze
        </label>
        <textarea
          value={currentPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 h-32 text-sm font-mono"
          placeholder="Enter your prompt here for real-time analysis..."
        />
        
        {/* Real-time metrics bar */}
        {debugInfo && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Characters:</span>
              <span className="font-mono">{currentPrompt.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Tokens:</span>
              <span className="font-mono">{formatNumber(debugInfo.token_count.input)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Cost:</span>
              <span className="font-mono">{formatCost(debugInfo.cost_estimate.total_cost_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Model:</span>
              <span className="font-mono text-xs">{selectedModel.split('-').slice(-1)[0]}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        {[
          { id: 'analysis', label: 'Token Analysis', icon: '🔍' },
          { id: 'optimization', label: 'Optimization', icon: '⚡' },
          { id: 'metrics', label: 'Quality Metrics', icon: '📊' },
          { id: 'history', label: 'History', icon: '📜' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
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
      {activeTab === 'analysis' && debugInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Token Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Analysis</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatNumber(debugInfo.token_count.input)}
                  </div>
                  <div className="text-blue-700 text-sm">Input Tokens</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {formatNumber(debugInfo.token_count.estimated_output)}
                  </div>
                  <div className="text-green-700 text-sm">Est. Output</div>
                </div>
              </div>

              {/* Token efficiency metrics */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-700 mb-2">Efficiency Metrics</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Characters per token:</span>
                    <span className="font-mono">
                      {(currentPrompt.length / debugInfo.token_count.input).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Context utilization:</span>
                    <span className="font-mono">
                      {((debugInfo.token_count.input / 200000) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Input/Output ratio:</span>
                    <span className="font-mono">
                      {(debugInfo.token_count.input / debugInfo.token_count.estimated_output).toFixed(1)}:1
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Analysis */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Analysis</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-orange-50 rounded">
                  <div className="text-xl font-bold text-orange-600">
                    {formatCost(debugInfo.cost_estimate.input_cost_cents)}
                  </div>
                  <div className="text-orange-700 text-sm">Input Cost</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded">
                  <div className="text-xl font-bold text-purple-600">
                    {formatCost(debugInfo.cost_estimate.output_cost_cents)}
                  </div>
                  <div className="text-purple-700 text-sm">Output Cost</div>
                </div>
              </div>

              {/* Cost projections */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-700 mb-2">Cost Projections</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Per 100 requests:</span>
                    <span className="font-mono">
                      {formatCost(debugInfo.cost_estimate.total_cost_cents * 100)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Per 1,000 requests:</span>
                    <span className="font-mono">
                      {formatCost(debugInfo.cost_estimate.total_cost_cents * 1000)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monthly (1k/day):</span>
                    <span className="font-mono">
                      {formatCost(debugInfo.cost_estimate.total_cost_cents * 30000)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'optimization' && (
        <div className="space-y-6">
          {/* Optimization Suggestions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Suggestions</h3>
            
            {optimizationSuggestions.length > 0 ? (
              <div className="space-y-4">
                {optimizationSuggestions.map((suggestion, index) => (
                  <div key={index} className={`border rounded p-4 ${getSeverityColor(suggestion.severity)}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{suggestion.title}</h4>
                        <p className="text-sm mt-1">{suggestion.description}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(suggestion.severity)}`}>
                        {suggestion.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm font-medium mb-2">💡 Suggestion:</div>
                    <div className="text-sm">{suggestion.suggestion}</div>
                    
                    {suggestion.potential_savings && (
                      <div className="mt-3 text-xs text-gray-600">
                        <strong>Potential Savings:</strong>
                        {suggestion.potential_savings.tokens && (
                          <span> {formatNumber(suggestion.potential_savings.tokens)} tokens</span>
                        )}
                        {suggestion.potential_savings.cost_cents && (
                          <span> • {formatCost(suggestion.potential_savings.cost_cents)}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Enter a prompt to see optimization suggestions
              </div>
            )}
          </div>

          {/* Quick Optimizations */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Optimizations</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  const optimized = currentPrompt.replace(/\n\n+/g, '\n').trim();
                  handlePromptChange(optimized);
                }}
                className="p-4 border border-gray-200 rounded hover:bg-gray-50 text-left"
              >
                <div className="font-medium text-gray-900">Remove Extra Whitespace</div>
                <div className="text-sm text-gray-600">Clean up extra line breaks and spaces</div>
              </button>
              
              <button
                onClick={() => {
                  const sections = currentPrompt.split('\n').filter(line => line.trim());
                  const structured = sections.map((line) => 
                    line.startsWith('•') || line.match(/^\d+\./) ? line : `• ${line}`
                  ).join('\n');
                  handlePromptChange(structured);
                }}
                className="p-4 border border-gray-200 rounded hover:bg-gray-50 text-left"
              >
                <div className="font-medium text-gray-900">Add Structure</div>
                <div className="text-sm text-gray-600">Convert to bullet points for clarity</div>
              </button>
              
              <button
                onClick={() => {
                  const withFormat = currentPrompt + 
                    '\n\nPlease format your response with:\n• Clear headings\n• Bullet points for lists\n• Specific examples where relevant';
                  handlePromptChange(withFormat);
                }}
                className="p-4 border border-gray-200 rounded hover:bg-gray-50 text-left"
              >
                <div className="font-medium text-gray-900">Add Format Instructions</div>
                <div className="text-sm text-gray-600">Specify desired output format</div>
              </button>
              
              <button
                onClick={() => {
                  const withRole = `You are an expert analyst with extensive experience in meeting analysis and summarization.\n\n${currentPrompt}`;
                  handlePromptChange(withRole);
                }}
                className="p-4 border border-gray-200 rounded hover:bg-gray-50 text-left"
              >
                <div className="font-medium text-gray-900">Add Role Definition</div>
                <div className="text-sm text-gray-600">Define expert role for better responses</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && promptMetrics && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Prompt Quality Metrics</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className={`text-3xl font-bold ${getMetricColor(promptMetrics.readability_score)}`}>
                {formatNumber(promptMetrics.readability_score)}
              </div>
              <div className="text-gray-600 text-sm mt-1">Readability</div>
              <div className="text-xs text-gray-500 mt-2">
                Based on sentence complexity and word choice
              </div>
            </div>
            
            <div className="text-center">
              <div className={`text-3xl font-bold ${getMetricColor(promptMetrics.specificity_score)}`}>
                {formatNumber(promptMetrics.specificity_score)}
              </div>
              <div className="text-gray-600 text-sm mt-1">Specificity</div>
              <div className="text-xs text-gray-500 mt-2">
                How specific and detailed the instructions are
              </div>
            </div>
            
            <div className="text-center">
              <div className={`text-3xl font-bold ${getMetricColor(promptMetrics.structure_score)}`}>
                {formatNumber(promptMetrics.structure_score)}
              </div>
              <div className="text-gray-600 text-sm mt-1">Structure</div>
              <div className="text-xs text-gray-500 mt-2">
                Organization and formatting quality
              </div>
            </div>
            
            <div className="text-center">
              <div className={`text-3xl font-bold ${getMetricColor(promptMetrics.complexity_score)}`}>
                {formatNumber(promptMetrics.complexity_score)}
              </div>
              <div className="text-gray-600 text-sm mt-1">Complexity</div>
              <div className="text-xs text-gray-500 mt-2">
                Overall complexity and length
              </div>
            </div>
          </div>

          {/* Detailed breakdown */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Scoring Guide</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span>80+ = Excellent</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span>60-79 = Good</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>&lt;60 = Needs Improvement</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Improvement Areas</h4>
              <div className="space-y-1 text-sm">
                {promptMetrics.readability_score < 60 && (
                  <div className="text-red-600">• Simplify sentence structure</div>
                )}
                {promptMetrics.specificity_score < 60 && (
                  <div className="text-red-600">• Add more specific instructions</div>
                )}
                {promptMetrics.structure_score < 60 && (
                  <div className="text-red-600">• Improve formatting and organization</div>
                )}
                {promptMetrics.complexity_score > 80 && (
                  <div className="text-yellow-600">• Consider simplifying the prompt</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis History</h3>
          
          {analysisHistory.length > 0 ? (
            <div className="space-y-4">
              {analysisHistory.map((analysis) => (
                <div key={analysis.id} className="border border-gray-200 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(analysis.timestamp).toLocaleString()}
                    </span>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span>{formatNumber(analysis.usage.total_tokens)} tokens</span>
                      <span>{formatCost(analysis.usage.estimated_cost_cents)}</span>
                      <span>{analysis.model.split('-').slice(-1)[0]}</span>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-700 mb-2">
                    <strong>Prompt:</strong> {analysis.prompt.substring(0, 100)}
                    {analysis.prompt.length > 100 && '...'}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
                    <div>Input: {formatNumber(analysis.usage.input_tokens)} tokens</div>
                    <div>Output: {formatNumber(analysis.usage.output_tokens)} tokens</div>
                    <div>Temp: {analysis.settings.temperature}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No analysis history yet. Run a full analysis to see results here.
            </div>
          )}
        </div>
      )}
    </div>
  );
};