// Simplified Prompt Debugger Component
// Basic debugging tool for Claude prompts

import React, { useState, useCallback, useEffect } from 'react';
import { claudeService } from '../services/claudeServiceSimple';

interface PromptDebuggerSimpleProps {
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  showAdvancedAnalytics?: boolean;
}

export const PromptDebuggerSimple: React.FC<PromptDebuggerSimpleProps> = ({
  prompt = '',
  onPromptChange,
}) => {
  const [currentPrompt, setCurrentPrompt] = useState(prompt);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState('claude-3-5-sonnet-20241022');

  // Update debug info when prompt changes
  useEffect(() => {
    if (currentPrompt.trim()) {
      const info = claudeService.createDebugInfo(
        currentPrompt,
        selectedModel,
        4096
      );
      setDebugInfo(info);
    } else {
      setDebugInfo(null);
    }
  }, [currentPrompt, selectedModel]);

  const handlePromptChange = useCallback((newPrompt: string) => {
    setCurrentPrompt(newPrompt);
    onPromptChange?.(newPrompt);
  }, [onPromptChange]);

  const formatCost = (cents: number) => {
    if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
    return `$${(cents / 100).toFixed(3)}`;
  };

  const formatTokens = (count: number) => count.toLocaleString();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Prompt Debugger</h2>
            <p className="text-gray-600 mt-1">
              Analyze and optimize your Claude prompts
            </p>
          </div>
          
          {debugInfo && (
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {formatTokens(debugInfo.token_count.total_estimate)}
              </div>
              <div className="text-sm text-gray-600">Est. Tokens</div>
              <div className="text-lg font-semibold text-green-600 mt-1">
                {formatCost(debugInfo.cost_estimate.total_cost_cents)}
              </div>
              <div className="text-xs text-gray-500">Est. Cost</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        
        {debugInfo && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Characters:</span>
              <span className="font-mono">{currentPrompt.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Tokens:</span>
              <span className="font-mono">{formatTokens(debugInfo.token_count.input)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Cost:</span>
              <span className="font-mono">{formatCost(debugInfo.cost_estimate.total_cost_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Model:</span>
              <span className="font-mono text-xs">
                {selectedModel.split('-').slice(-1)[0]}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Results */}
      {debugInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Token Analysis */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Analysis</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatTokens(debugInfo.token_count.input)}
                  </div>
                  <div className="text-blue-700 text-sm">Input Tokens</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {formatTokens(debugInfo.token_count.estimated_output)}
                  </div>
                  <div className="text-green-700 text-sm">Est. Output</div>
                </div>
              </div>

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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optimization Suggestions */}
      {debugInfo && debugInfo.optimization_suggestions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Suggestions</h3>
          
          <div className="space-y-3">
            {debugInfo.optimization_suggestions.map((suggestion: string, index: number) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <span className="text-yellow-600 mt-0.5">💡</span>
                <span className="text-yellow-800 text-sm">{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Panel */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-green-900 mb-2">🎓 Prompt Debugging Features:</h4>
        <ul className="text-green-800 text-sm space-y-1">
          <li>• Real-time token counting and cost estimation</li>
          <li>• Automated optimization suggestions</li>
          <li>• Cost projection tools for budget planning</li>
          <li>• Model comparison and efficiency analysis</li>
          <li>• Context window utilization tracking</li>
        </ul>
      </div>
    </div>
  );
};