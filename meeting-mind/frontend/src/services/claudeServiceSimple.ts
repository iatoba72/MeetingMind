// Simplified Claude Service for MeetingMind
// Basic implementation focusing on core functionality with proper TypeScript support

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'meeting_summary' | 'action_items' | 'key_insights' | 'follow_up' | 'analysis' | 'custom';
  template: string;
  variables: string[];
  metadata: {
    created_at: string;
    version: string;
    tags: string[];
    cost_estimate: {
      typical_input_tokens: number;
      typical_output_tokens: number;
      estimated_cost_cents: number;
    };
  };
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_cents: number;
  request_timestamp: string;
}

export interface PromptDebugInfo {
  prompt_id: string;
  template_used?: string;
  variables_substituted: Record<string, string>;
  token_count: {
    input: number;
    estimated_output: number;
    total_estimate: number;
  };
  cost_estimate: {
    input_cost_cents: number;
    output_cost_cents: number;
    total_cost_cents: number;
  };
  context_info: {
    context_length: number;
    messages_count: number;
    truncated: boolean;
  };
  optimization_suggestions: string[];
}

/**
 * Simplified Claude Service
 * Basic implementation that works with the backend API
 */
export class ClaudeServiceSimple {
  private templates: Map<string, PromptTemplate> = new Map();
  private usageHistory: TokenUsage[] = [];
  
  // Pricing constants (cents per token)
  private readonly PRICING = {
    'claude-3-5-sonnet-20241022': { input: 0.0003, output: 0.0015 },
    'claude-3-haiku-20240307': { input: 0.000025, output: 0.000125 }
  };

  constructor() {
    this.loadBuiltInTemplates();
  }

  private loadBuiltInTemplates(): void {
    // Basic templates for demo purposes
    const templates: PromptTemplate[] = [
      {
        id: 'meeting_summary_comprehensive',
        name: 'Comprehensive Meeting Summary',
        description: 'Generate a detailed meeting summary',
        category: 'meeting_summary',
        template: 'Please summarize the meeting: {{transcript}}',
        variables: ['transcript'],
        metadata: {
          created_at: '2024-12-06T00:00:00Z',
          version: '1.0',
          tags: ['summary'],
          cost_estimate: {
            typical_input_tokens: 2500,
            typical_output_tokens: 800,
            estimated_cost_cents: 1.95
          }
        }
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Process template with variable substitution
   */
  public processTemplate(templateId: string, variables: Record<string, string>) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let processedPrompt = template.template;
    const substituted: Record<string, string> = {};
    const warnings: string[] = [];

    template.variables.forEach(varName => {
      const placeholder = `{{${varName}}}`;
      const value = variables[varName] || `[${varName.toUpperCase()}_NOT_PROVIDED]`;
      
      if (processedPrompt.includes(placeholder)) {
        processedPrompt = processedPrompt.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        substituted[varName] = value;
      }
    });

    return {
      processed_prompt: processedPrompt,
      template_id: templateId,
      variables_substituted: substituted,
      warnings
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost estimate
   */
  public calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const modelKey = model as keyof typeof this.PRICING;
    const pricing = this.PRICING[modelKey] || this.PRICING['claude-3-5-sonnet-20241022'];
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }

  /**
   * Generate debug info for a prompt
   */
  public createDebugInfo(
    prompt: string,
    model: string,
    maxTokens: number,
    templateUsed?: string,
    variablesSubstituted: Record<string, string> = {}
  ): PromptDebugInfo {
    const estimatedInputTokens = this.estimateTokens(prompt);
    const estimatedOutputTokens = Math.min(maxTokens, 1000);

    return {
      prompt_id: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      template_used: templateUsed,
      variables_substituted: variablesSubstituted,
      token_count: {
        input: estimatedInputTokens,
        estimated_output: estimatedOutputTokens,
        total_estimate: estimatedInputTokens + estimatedOutputTokens
      },
      cost_estimate: {
        input_cost_cents: this.calculateCost(estimatedInputTokens, 0, model),
        output_cost_cents: this.calculateCost(0, estimatedOutputTokens, model),
        total_cost_cents: this.calculateCost(estimatedInputTokens, estimatedOutputTokens, model)
      },
      context_info: {
        context_length: estimatedInputTokens,
        messages_count: 1,
        truncated: false
      },
      optimization_suggestions: this.generateOptimizationSuggestions(prompt, estimatedInputTokens)
    };
  }

  private generateOptimizationSuggestions(prompt: string, tokenCount: number): string[] {
    const suggestions: string[] = [];

    if (tokenCount > 3000) {
      suggestions.push('Consider shortening the prompt to reduce token usage and costs');
    }

    if (!prompt.includes('format') && !prompt.includes('structure')) {
      suggestions.push('Consider specifying the desired output format for better results');
    }

    if (!prompt.toLowerCase().includes('example')) {
      suggestions.push('Adding examples can significantly improve response quality');
    }

    return suggestions;
  }

  /**
   * Get all available templates
   */
  public getTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  public getTemplatesByCategory(category: PromptTemplate['category']): PromptTemplate[] {
    return Array.from(this.templates.values()).filter(template => template.category === category);
  }

  /**
   * Get usage analytics
   */
  public getUsageAnalytics() {
    const totalRequests = this.usageHistory.length;
    const totalTokens = this.usageHistory.reduce((sum, usage) => sum + usage.total_tokens, 0);
    const totalCost = this.usageHistory.reduce((sum, usage) => sum + usage.estimated_cost_cents, 0);

    return {
      total_requests: totalRequests,
      total_tokens: totalTokens,
      total_cost_cents: totalCost,
      average_cost_per_request: totalRequests > 0 ? totalCost / totalRequests : 0,
      recent_usage: this.usageHistory.slice(-10)
    };
  }

  /**
   * Get model information
   */
  public getModelInfo(model: string = 'claude-3-5-sonnet-20241022') {
    const modelKey = model as keyof typeof this.PRICING;
    const pricing = this.PRICING[modelKey] || this.PRICING['claude-3-5-sonnet-20241022'];

    return {
      model,
      max_tokens: 200000,
      supports_streaming: true,
      supports_vision: true,
      pricing
    };
  }
}

// Export singleton instance
export const claudeService = new ClaudeServiceSimple();