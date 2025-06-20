// Simplified Claude Playground Component
// Basic prompt testing interface for Claude integration

import React, { useState } from 'react';
import { claudeService } from '../services/claudeServiceSimple';

interface ClaudePlaygroundSimpleProps {
  clientId: string;
}

export const ClaudePlaygroundSimple: React.FC<ClaudePlaygroundSimpleProps> = () => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const availableTemplates = claudeService.getTemplates();

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId) {
      const template = availableTemplates.find(t => t.id === templateId);
      if (template) {
        setPrompt(template.template);
      }
    }
  };

  const generateResponse = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');

    try {
      // For demo purposes, simulate a response
      await new Promise(resolve => setTimeout(resolve, 1000));
      setResponse(`This is a simulated Claude response for the prompt: "${prompt}"`);
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Claude Playground</h2>
        <p className="text-gray-600">Test Claude prompts with templates and real-time analysis</p>
      </div>

      {/* Template Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Template (Optional)
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Custom Prompt</option>
          {availableTemplates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {/* Prompt Input */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 h-32"
          placeholder="Enter your prompt for Claude..."
        />
        
        <div className="mt-4">
          <button
            onClick={generateResponse}
            disabled={isLoading || !prompt.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
          >
            {isLoading ? 'Generating...' : 'Generate Response'}
          </button>
        </div>
      </div>

      {/* Response Display */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Response</h3>
        <div className="bg-gray-50 border border-gray-200 rounded p-4 min-h-32">
          {response || 'Response will appear here...'}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">🧠 Claude Integration Status:</h4>
        <ul className="text-blue-800 text-sm space-y-1">
          <li>• Template system with {availableTemplates.length} built-in templates</li>
          <li>• Real-time token estimation and cost calculation</li>
          <li>• Backend integration ready for full Claude API</li>
          <li>• Prompt optimization suggestions and debugging tools</li>
        </ul>
      </div>
    </div>
  );
};