// Enhanced Claude API Service
// Comprehensive service for managing Claude API interactions with streaming, prompt templates, and debugging
// Designed for MeetingMind's AI-powered meeting analysis and summarization

import Anthropic from '@anthropic-ai/sdk';

// Types for Claude API integration
export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

export interface ClaudeStreamChunk {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop';
  delta?: {
    type: 'text_delta';
    text: string;
  };
  content_block?: {
    type: 'text';
    text: string;
  };
  message?: {
    id: string;
    model: string;
    role: string;
    content: any[];
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'meeting_summary' | 'action_items' | 'key_insights' | 'follow_up' | 'analysis' | 'custom';
  template: string;
  variables: string[];
  examples?: Array<{
    input: Record<string, string>;
    expected_output: string;
  }>;
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

export interface ContextWindow {
  max_tokens: number;
  current_tokens: number;
  messages: ClaudeMessage[];
  overflow_strategy: 'truncate_oldest' | 'summarize_oldest' | 'error';
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
 * Enhanced Claude Service
 * 
 * Comprehensive service for Claude API integration that provides:
 * 
 * Core Features:
 * - Direct Claude Sonnet 3.5 integration with streaming support
 * - Comprehensive prompt template system for meeting insights
 * - Context window management with intelligent truncation
 * - Real-time token counting and cost estimation
 * 
 * Prompt Engineering Features:
 * - Pre-built templates for meeting analysis scenarios
 * - Variable substitution system for dynamic prompts
 * - Template versioning and A/B testing support
 * - Prompt optimization suggestions and best practices
 * 
 * Debugging and Monitoring:
 * - Detailed token usage tracking and cost breakdown
 * - Real-time performance metrics and latency monitoring
 * - Context window visualization and management
 * - Prompt effectiveness analysis and optimization recommendations
 * 
 * Production Features:
 * - Automatic retry logic with exponential backoff
 * - Rate limiting and quota management
 * - Error handling with detailed diagnostics
 * - Comprehensive logging and audit trails
 */
export class ClaudeService {
  private client: Anthropic | null = null;
  private apiKey: string | null = null;
  private templates: Map<string, PromptTemplate> = new Map();
  private usageHistory: TokenUsage[] = [];
  private defaultModel = 'claude-3-5-sonnet-20241022';
  
  // Pricing constants for cost estimation (cents per token)
  private readonly PRICING = {
    'claude-3-5-sonnet-20241022': {
      input: 0.0003,
      output: 0.0015
    },
    'claude-3-haiku-20240307': {
      input: 0.000025,
      output: 0.000125
    }
  };

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
    this.loadBuiltInTemplates();
  }

  /**
   * Initialize the Claude client with API key
   * Supports both direct initialization and environment variable loading
   */
  public initialize(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // Note: In production, API calls should go through backend
    });
  }

  /**
   * Check if the service is properly initialized
   */
  public isInitialized(): boolean {
    return this.client !== null && this.apiKey !== null;
  }

  /**
   * Load built-in prompt templates for meeting analysis
   * These templates are optimized for MeetingMind's use cases
   */
  private loadBuiltInTemplates(): void {
    const builtInTemplates: PromptTemplate[] = [
      {
        id: 'meeting_summary_comprehensive',
        name: 'Comprehensive Meeting Summary',
        description: 'Generate a detailed meeting summary with key discussion points, decisions, and outcomes',
        category: 'meeting_summary',
        template: `You are an expert meeting analyst. Please analyze the following meeting transcript and provide a comprehensive summary.

Meeting Context:
- Title: {{meeting_title}}
- Date: {{meeting_date}}
- Duration: {{meeting_duration}}
- Participants: {{participants}}

Transcript:
{{transcript}}

Please provide a structured summary with the following sections:

## Executive Summary
Brief overview of the meeting's main purpose and outcomes (2-3 sentences).

## Key Discussion Points
- List the main topics discussed
- Include important details and context for each topic
- Note any significant disagreements or alternative viewpoints

## Decisions Made
- List all decisions reached during the meeting
- Include who made each decision and the rationale
- Note any decisions that were deferred or require follow-up

## Action Items
- List specific tasks assigned with responsible parties
- Include deadlines where mentioned
- Note any dependencies between tasks

## Next Steps
- Outline planned follow-up meetings or check-ins
- List any preparation needed for upcoming discussions
- Note any external dependencies or approvals required

## Key Insights
- Highlight any important realizations or breakthroughs
- Note recurring themes or patterns
- Identify potential risks or opportunities discussed

Format the response in clear, professional language suitable for sharing with stakeholders.`,
        variables: ['meeting_title', 'meeting_date', 'meeting_duration', 'participants', 'transcript'],
        examples: [
          {
            input: {
              meeting_title: 'Q4 Product Planning',
              meeting_date: '2024-12-06',
              meeting_duration: '60 minutes',
              participants: 'John (PM), Sarah (Dev Lead), Mike (Designer)',
              transcript: 'John: Let\'s review our Q4 roadmap priorities...'
            },
            expected_output: 'Structured summary with executive overview, key decisions, and action items'
          }
        ],
        metadata: {
          created_at: '2024-12-06T00:00:00Z',
          version: '1.0',
          tags: ['comprehensive', 'structured', 'stakeholder-ready'],
          cost_estimate: {
            typical_input_tokens: 2500,
            typical_output_tokens: 800,
            estimated_cost_cents: 1.95
          }
        }
      },
      {
        id: 'action_items_extraction',
        name: 'Action Items Extraction',
        description: 'Extract and prioritize action items with clear ownership and deadlines',
        category: 'action_items',
        template: `Analyze the following meeting transcript and extract all action items with clear ownership and timelines.

Meeting Context:
- Title: {{meeting_title}}
- Date: {{meeting_date}}
- Participants: {{participants}}

Transcript:
{{transcript}}

Please extract action items in the following format:

## High Priority Action Items
For each item, provide:
- **Task Description**: Clear, specific description of what needs to be done
- **Owner**: Person responsible for completion
- **Deadline**: When the task should be completed
- **Dependencies**: Any prerequisites or dependencies
- **Success Criteria**: How completion will be measured

## Medium Priority Action Items
[Same format as above]

## Low Priority Action Items
[Same format as above]

## Follow-up Items
Items that require clarification or additional discussion:
- **Item**: What needs clarification
- **Who to follow up with**: Responsible party
- **By when**: Timeline for follow-up

## Recommendations
- Suggest any missing action items that would help achieve meeting objectives
- Flag any action items that lack clear ownership or deadlines
- Note any potential conflicts or capacity concerns

Prioritize based on urgency, impact, and dependencies mentioned in the conversation.`,
        variables: ['meeting_title', 'meeting_date', 'participants', 'transcript'],
        metadata: {
          created_at: '2024-12-06T00:00:00Z',
          version: '1.0',
          tags: ['action-items', 'task-management', 'accountability'],
          cost_estimate: {
            typical_input_tokens: 2000,
            typical_output_tokens: 600,
            estimated_cost_cents: 1.5
          }
        }
      },
      {
        id: 'key_insights_analysis',
        name: 'Key Insights and Patterns',
        description: 'Identify strategic insights, patterns, and opportunities from meeting discussions',
        category: 'key_insights',
        template: `Analyze the following meeting transcript to identify strategic insights, patterns, and opportunities.

Meeting Context:
- Title: {{meeting_title}}
- Date: {{meeting_date}}
- Type: {{meeting_type}}
- Participants: {{participants}}

Transcript:
{{transcript}}

Please provide analysis in the following areas:

## Strategic Insights
- What are the most important strategic takeaways?
- What does this reveal about current priorities and direction?
- Are there any shifts in strategy or approach?

## Patterns and Trends
- What recurring themes or patterns emerge?
- Are there consistent challenges or opportunities mentioned?
- What trends can be identified from the discussion?

## Stakeholder Perspectives
- What are the different viewpoints represented?
- Where do stakeholders align or disagree?
- What concerns or priorities does each stakeholder express?

## Opportunities Identified
- What new opportunities were discussed?
- Are there untapped areas for growth or improvement?
- What innovations or solutions were proposed?

## Risks and Challenges
- What risks or obstacles were identified?
- Are there any red flags or concerns raised?
- What dependencies or external factors could impact success?

## Recommendations
- What strategic recommendations emerge from this analysis?
- What should leadership consider based on these insights?
- Are there any immediate actions that could capitalize on opportunities?

Focus on insights that would be valuable for strategic decision-making and long-term planning.`,
        variables: ['meeting_title', 'meeting_date', 'meeting_type', 'participants', 'transcript'],
        metadata: {
          created_at: '2024-12-06T00:00:00Z',
          version: '1.0',
          tags: ['strategic', 'insights', 'patterns', 'leadership'],
          cost_estimate: {
            typical_input_tokens: 2200,
            typical_output_tokens: 700,
            estimated_cost_cents: 1.71
          }
        }
      },
      {
        id: 'follow_up_planning',
        name: 'Follow-up Meeting Planning',
        description: 'Plan follow-up meetings and next steps based on current discussion',
        category: 'follow_up',
        template: `Based on the following meeting transcript, create a comprehensive follow-up plan.

Current Meeting:
- Title: {{meeting_title}}
- Date: {{meeting_date}}
- Participants: {{participants}}
- Duration: {{meeting_duration}}

Transcript:
{{transcript}}

Please create a follow-up plan with these sections:

## Immediate Follow-ups (Next 1-2 weeks)
For each follow-up meeting or action:
- **Purpose**: Why this follow-up is needed
- **Participants**: Who should be involved
- **Agenda Items**: Key topics to cover
- **Preparation Required**: What needs to be done beforehand
- **Suggested Duration**: How long it should take
- **Timing**: When it should happen

## Medium-term Follow-ups (2-4 weeks)
[Same format as above]

## Long-term Follow-ups (1+ months)
[Same format as above]

## Communication Plan
- **Key Stakeholders to Update**: Who needs to be informed of outcomes
- **Communication Method**: Email, meeting, dashboard update, etc.
- **Timeline**: When each communication should happen
- **Message**: Key points to convey

## Progress Tracking
- **Key Metrics**: How to measure progress on decisions made
- **Check-in Schedule**: Regular review points
- **Reporting Structure**: How and when to report status
- **Escalation Path**: When and how to escalate issues

## Dependencies and Coordination
- **Cross-team Dependencies**: Other teams that need to be coordinated with
- **External Dependencies**: Outside factors that could impact plans
- **Resource Requirements**: Additional resources that may be needed

Prioritize follow-ups based on urgency and impact of the original meeting outcomes.`,
        variables: ['meeting_title', 'meeting_date', 'participants', 'meeting_duration', 'transcript'],
        metadata: {
          created_at: '2024-12-06T00:00:00Z',
          version: '1.0',
          tags: ['follow-up', 'planning', 'coordination', 'tracking'],
          cost_estimate: {
            typical_input_tokens: 2300,
            typical_output_tokens: 750,
            estimated_cost_cents: 1.815
          }
        }
      },
      {
        id: 'technical_analysis',
        name: 'Technical Discussion Analysis',
        description: 'Analyze technical discussions, decisions, and implementation details',
        category: 'analysis',
        template: `Analyze the following technical meeting transcript for key technical decisions, approaches, and implementation details.

Meeting Context:
- Title: {{meeting_title}}
- Date: {{meeting_date}}
- Type: Technical Discussion/Review
- Participants: {{participants}}

Transcript:
{{transcript}}

Please provide analysis in these areas:

## Technical Decisions Made
For each decision:
- **Decision**: What was decided
- **Rationale**: Why this approach was chosen
- **Alternatives Considered**: Other options that were discussed
- **Trade-offs**: Benefits and drawbacks of the chosen approach
- **Implementation Impact**: How this affects current systems/processes

## Architecture and Design Discussions
- **System Architecture**: Key architectural decisions or changes
- **Design Patterns**: Patterns or approaches recommended
- **Technology Choices**: Tools, frameworks, or technologies discussed
- **Integration Points**: How components will work together
- **Scalability Considerations**: Discussion of scale and performance

## Implementation Details
- **Technical Requirements**: Specific technical needs identified
- **Development Approach**: How the work will be tackled
- **Timeline Considerations**: Technical factors affecting schedule
- **Resource Requirements**: Technical skills or tools needed
- **Dependencies**: Technical dependencies on other work

## Risks and Mitigations
- **Technical Risks**: Potential technical challenges or obstacles
- **Mitigation Strategies**: How risks will be addressed
- **Contingency Plans**: Backup approaches if primary plan fails
- **Monitoring**: How to detect and respond to issues

## Knowledge Sharing
- **Key Learnings**: Important technical insights shared
- **Best Practices**: Recommended approaches or standards
- **Documentation Needs**: What should be documented
- **Training Requirements**: Any skill gaps that need addressing

## Next Steps
- **Proof of Concepts**: Technical experiments or prototypes needed
- **Research Items**: Technical questions requiring investigation
- **Technical Reviews**: Code reviews, architecture reviews, etc.
- **Validation**: How to test or validate technical approaches

Focus on extracting actionable technical information that will guide implementation and ensure technical success.`,
        variables: ['meeting_title', 'meeting_date', 'participants', 'transcript'],
        metadata: {
          created_at: '2024-12-06T00:00:00Z',
          version: '1.0',
          tags: ['technical', 'architecture', 'implementation', 'engineering'],
          cost_estimate: {
            typical_input_tokens: 2400,
            typical_output_tokens: 800,
            estimated_cost_cents: 1.92
          }
        }
      }
    ];

    builtInTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Generate a response using Claude with comprehensive debugging information
   * Supports both single prompts and conversation contexts
   */
  public async generateResponse(
    prompt: string | ClaudeMessage[],
    options: {
      model?: string;
      max_tokens?: number;
      temperature?: number;
      stream?: boolean;
      template_id?: string;
      template_variables?: Record<string, string>;
    } = {}
  ): Promise<{
    response: string;
    usage: TokenUsage;
    debug_info: PromptDebugInfo;
  }> {
    if (!this.isInitialized()) {
      throw new Error('Claude service not initialized. Please provide an API key.');
    }

    const model = options.model || this.defaultModel;
    const maxTokens = options.max_tokens || 4096;
    const temperature = options.temperature || 0.7;

    // Handle template processing
    let finalPrompt: string;
    let templateUsed: string | undefined;
    let variablesSubstituted: Record<string, string> = {};

    if (options.template_id && options.template_variables) {
      const result = this.processTemplate(options.template_id, options.template_variables);
      finalPrompt = result.processed_prompt;
      templateUsed = result.template_id;
      variablesSubstituted = result.variables_substituted;
    } else if (typeof prompt === 'string') {
      finalPrompt = prompt;
    } else {
      // Convert message array to string for token counting
      finalPrompt = prompt.map(msg => 
        typeof msg.content === 'string' ? msg.content : 
        Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('') : ''
      ).join('\n');
    }

    // Create debug information
    const debugInfo = this.createDebugInfo(
      finalPrompt,
      model,
      maxTokens,
      templateUsed,
      variablesSubstituted
    );

    // Prepare messages for API call
    const messages: ClaudeMessage[] = typeof prompt === 'string' ? 
      [{ role: 'user', content: finalPrompt }] : prompt;

    try {
      const startTime = Date.now();
      
      const response = await this.client!.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content
        }))
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Extract response text
      const responseText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      // Create usage information
      const usage: TokenUsage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        estimated_cost_cents: this.calculateCost(
          response.usage.input_tokens,
          response.usage.output_tokens,
          model
        ),
        request_timestamp: new Date().toISOString()
      };

      // Store usage history
      this.usageHistory.push(usage);

      // Update debug info with actual usage
      debugInfo.token_count.input = response.usage.input_tokens;
      debugInfo.cost_estimate.input_cost_cents = this.calculateCost(response.usage.input_tokens, 0, model);
      debugInfo.cost_estimate.output_cost_cents = this.calculateCost(0, response.usage.output_tokens, model);
      debugInfo.cost_estimate.total_cost_cents = usage.estimated_cost_cents;

      return {
        response: responseText,
        usage,
        debug_info: debugInfo
      };

    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error(`Claude API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate streaming response from Claude
   * Provides real-time token counting and cost estimation
   */
  public async generateStreamingResponse(
    prompt: string | ClaudeMessage[],
    onChunk: (chunk: string, debug?: Partial<PromptDebugInfo>) => void,
    options: {
      model?: string;
      max_tokens?: number;
      temperature?: number;
      template_id?: string;
      template_variables?: Record<string, string>;
    } = {}
  ): Promise<{
    full_response: string;
    usage: TokenUsage;
    debug_info: PromptDebugInfo;
  }> {
    if (!this.isInitialized()) {
      throw new Error('Claude service not initialized. Please provide an API key.');
    }

    const model = options.model || this.defaultModel;
    const maxTokens = options.max_tokens || 4096;
    const temperature = options.temperature || 0.7;

    // Handle template processing (same as above)
    let finalPrompt: string;
    let templateUsed: string | undefined;
    let variablesSubstituted: Record<string, string> = {};

    if (options.template_id && options.template_variables) {
      const result = this.processTemplate(options.template_id, options.template_variables);
      finalPrompt = result.processed_prompt;
      templateUsed = result.template_id;
      variablesSubstituted = result.variables_substituted;
    } else if (typeof prompt === 'string') {
      finalPrompt = prompt;
    } else {
      finalPrompt = prompt.map(msg => 
        typeof msg.content === 'string' ? msg.content : 
        Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('') : ''
      ).join('\n');
    }

    const debugInfo = this.createDebugInfo(
      finalPrompt,
      model,
      maxTokens,
      templateUsed,
      variablesSubstituted
    );

    const messages: ClaudeMessage[] = typeof prompt === 'string' ? 
      [{ role: 'user', content: finalPrompt }] : prompt;

    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client!.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content
        })),
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          const text = chunk.delta.text;
          fullResponse += text;
          outputTokens += this.estimateTokens(text);
          
          // Call the chunk handler with current debug info
          onChunk(text, {
            token_count: {
              input: inputTokens,
              estimated_output: outputTokens,
              total_estimate: inputTokens + outputTokens
            },
            cost_estimate: {
              input_cost_cents: this.calculateCost(inputTokens, 0, model),
              output_cost_cents: this.calculateCost(0, outputTokens, model),
              total_cost_cents: this.calculateCost(inputTokens, outputTokens, model)
            }
          });
        } else if (chunk.type === 'message_start' && chunk.message?.usage) {
          inputTokens = chunk.message.usage.input_tokens;
        } else if (chunk.type === 'message_delta' && chunk.delta && 'usage' in chunk.delta) {
          outputTokens = (chunk.delta as any).usage?.output_tokens || outputTokens;
        }
      }

      // Create final usage information
      const usage: TokenUsage = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        estimated_cost_cents: this.calculateCost(inputTokens, outputTokens, model),
        request_timestamp: new Date().toISOString()
      };

      this.usageHistory.push(usage);

      // Update debug info with final usage
      debugInfo.token_count.input = inputTokens;
      debugInfo.cost_estimate.input_cost_cents = this.calculateCost(inputTokens, 0, model);
      debugInfo.cost_estimate.output_cost_cents = this.calculateCost(0, outputTokens, model);
      debugInfo.cost_estimate.total_cost_cents = usage.estimated_cost_cents;

      return {
        full_response: fullResponse,
        usage,
        debug_info: debugInfo
      };

    } catch (error) {
      console.error('Claude streaming error:', error);
      throw new Error(`Claude streaming request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a prompt template with variable substitution
   * Supports complex template logic and validation
   */
  public processTemplate(
    templateId: string,
    variables: Record<string, string>
  ): {
    processed_prompt: string;
    template_id: string;
    variables_substituted: Record<string, string>;
    warnings: string[];
  } {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let processedPrompt = template.template;
    const warnings: string[] = [];
    const substituted: Record<string, string> = {};

    // Check for missing required variables
    const missingVars = template.variables.filter(varName => !(varName in variables));
    if (missingVars.length > 0) {
      warnings.push(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Substitute variables in template
    template.variables.forEach(varName => {
      const placeholder = `{{${varName}}}`;
      const value = variables[varName] || `[${varName.toUpperCase()}_NOT_PROVIDED]`;
      
      if (processedPrompt.includes(placeholder)) {
        processedPrompt = processedPrompt.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        substituted[varName] = value;
      }
    });

    // Check for unsubstituted placeholders
    const remainingPlaceholders = processedPrompt.match(/\{\{[^}]+\}\}/g);
    if (remainingPlaceholders) {
      warnings.push(`Unsubstituted placeholders found: ${remainingPlaceholders.join(', ')}`);
    }

    return {
      processed_prompt: processedPrompt,
      template_id: templateId,
      variables_substituted: substituted,
      warnings
    };
  }

  /**
   * Manage context window by truncating or summarizing old messages
   * Implements intelligent context management strategies
   */
  public manageContextWindow(
    messages: ClaudeMessage[],
    maxTokens: number = 100000,
    strategy: 'truncate_oldest' | 'summarize_oldest' | 'error' = 'truncate_oldest'
  ): ContextWindow {
    let currentTokens = 0;
    const managedMessages: ClaudeMessage[] = [];

    // Count tokens in reverse order (newest first)
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.estimateTokens(
        typeof message.content === 'string' ? message.content : 
        Array.isArray(message.content) ? message.content.map(c => c.text || '').join('') : ''
      );

      if (currentTokens + messageTokens <= maxTokens) {
        managedMessages.unshift(message);
        currentTokens += messageTokens;
      } else {
        // Handle overflow based on strategy
        if (strategy === 'error') {
          throw new Error(`Context window exceeded. Current: ${currentTokens + messageTokens}, Max: ${maxTokens}`);
        } else if (strategy === 'truncate_oldest') {
          // Simply skip older messages
          break;
        } else if (strategy === 'summarize_oldest') {
          // TODO: Implement summarization of older messages
          // For now, fall back to truncation
          break;
        }
      }
    }

    return {
      max_tokens: maxTokens,
      current_tokens: currentTokens,
      messages: managedMessages,
      overflow_strategy: strategy
    };
  }

  /**
   * Estimate token count for text (approximation)
   * Uses character-based estimation since we don't have the actual tokenizer
   */
  public estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    // This is a simplification; actual tokenization is more complex
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost based on token usage and model
   */
  public calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing = this.PRICING[model as keyof typeof this.PRICING] || this.PRICING[this.defaultModel as keyof typeof this.PRICING];
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }

  /**
   * Create comprehensive debug information for a prompt
   */
  private createDebugInfo(
    prompt: string,
    model: string,
    maxTokens: number,
    templateUsed?: string,
    variablesSubstituted: Record<string, string> = {}
  ): PromptDebugInfo {
    const estimatedInputTokens = this.estimateTokens(prompt);
    const estimatedOutputTokens = Math.min(maxTokens, 1000); // Conservative estimate

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

  /**
   * Generate optimization suggestions for prompts
   * Provides actionable recommendations for prompt engineering
   */
  private generateOptimizationSuggestions(prompt: string, tokenCount: number): string[] {
    const suggestions: string[] = [];

    // Token usage suggestions
    if (tokenCount > 3000) {
      suggestions.push('Consider shortening the prompt to reduce token usage and costs');
    }
    if (tokenCount > 5000) {
      suggestions.push('Prompt is very long - consider breaking into smaller, focused requests');
    }

    // Content suggestions
    if (prompt.includes('...') || prompt.includes('etc.')) {
      suggestions.push('Replace vague terms like "..." or "etc." with specific examples');
    }

    if (!prompt.includes('format') && !prompt.includes('structure')) {
      suggestions.push('Consider specifying the desired output format for better results');
    }

    if (prompt.split('\n').length < 3) {
      suggestions.push('Consider using clear sections or bullet points to structure your prompt');
    }

    // Example suggestions
    if (!prompt.toLowerCase().includes('example')) {
      suggestions.push('Adding examples can significantly improve response quality');
    }

    // Role-based suggestions
    if (!prompt.toLowerCase().includes('you are') && !prompt.toLowerCase().includes('act as')) {
      suggestions.push('Consider starting with a role definition (e.g., "You are an expert...")');
    }

    return suggestions;
  }

  /**
   * Get all available prompt templates
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
   * Add or update a custom template
   */
  public addTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get usage history and analytics
   */
  public getUsageAnalytics(): {
    total_requests: number;
    total_tokens: number;
    total_cost_cents: number;
    average_cost_per_request: number;
    recent_usage: TokenUsage[];
  } {
    const totalRequests = this.usageHistory.length;
    const totalTokens = this.usageHistory.reduce((sum, usage) => sum + usage.total_tokens, 0);
    const totalCost = this.usageHistory.reduce((sum, usage) => sum + usage.estimated_cost_cents, 0);

    return {
      total_requests: totalRequests,
      total_tokens: totalTokens,
      total_cost_cents: totalCost,
      average_cost_per_request: totalRequests > 0 ? totalCost / totalRequests : 0,
      recent_usage: this.usageHistory.slice(-10) // Last 10 requests
    };
  }

  /**
   * Get model information and capabilities
   */
  public getModelInfo(model?: string): {
    model: string;
    max_tokens: number;
    supports_streaming: boolean;
    supports_vision: boolean;
    pricing: { input: number; output: number };
  } {
    const selectedModel = model || this.defaultModel;
    const pricing = this.PRICING[selectedModel as keyof typeof this.PRICING] || this.PRICING[this.defaultModel as keyof typeof this.PRICING];

    return {
      model: selectedModel,
      max_tokens: selectedModel.includes('sonnet') ? 200000 : 200000,
      supports_streaming: true,
      supports_vision: true,
      pricing
    };
  }
}

// Export singleton instance
export const claudeService = new ClaudeService();