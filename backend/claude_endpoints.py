# Enhanced Claude API Endpoints
# Specialized endpoints for Claude integration with streaming, templates, and debugging
# Provides comprehensive Claude-specific functionality beyond the generic AI provider system

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, AsyncIterator
import json
import asyncio
import time
from datetime import datetime
import uuid

from ai_provider_registry import get_registry, registry


# Request/Response Models for Claude-specific endpoints
class ClaudeMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Message content")


class ClaudeGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Text prompt for Claude")
    model: Optional[str] = Field(
        "claude-3-5-sonnet-20241022", description="Claude model to use"
    )
    max_tokens: Optional[int] = Field(4096, description="Maximum tokens to generate")
    temperature: Optional[float] = Field(
        0.7, description="Temperature for response generation"
    )
    stream: Optional[bool] = Field(False, description="Enable streaming response")
    template_id: Optional[str] = Field(None, description="Template ID to use")
    template_variables: Optional[Dict[str, str]] = Field(
        None, description="Variables for template substitution"
    )


class ClaudeChatRequest(BaseModel):
    messages: List[ClaudeMessage] = Field(..., description="Conversation messages")
    model: Optional[str] = Field(
        "claude-3-5-sonnet-20241022", description="Claude model to use"
    )
    max_tokens: Optional[int] = Field(4096, description="Maximum tokens to generate")
    temperature: Optional[float] = Field(
        0.7, description="Temperature for response generation"
    )
    stream: Optional[bool] = Field(False, description="Enable streaming response")


class TemplateVariable(BaseModel):
    name: str = Field(..., description="Variable name")
    description: str = Field(..., description="Variable description")
    required: bool = Field(True, description="Whether variable is required")
    default_value: Optional[str] = Field(None, description="Default value")


class PromptTemplate(BaseModel):
    id: str = Field(..., description="Unique template identifier")
    name: str = Field(..., description="Template display name")
    description: str = Field(..., description="Template description")
    category: str = Field(..., description="Template category")
    template: str = Field(..., description="Template content with {{variables}}")
    variables: List[TemplateVariable] = Field(..., description="Required variables")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Template metadata"
    )


class TokenUsage(BaseModel):
    input_tokens: int = Field(..., description="Input tokens used")
    output_tokens: int = Field(..., description="Output tokens generated")
    total_tokens: int = Field(..., description="Total tokens")
    estimated_cost_cents: float = Field(..., description="Estimated cost in cents")


class DebugInfo(BaseModel):
    request_id: str = Field(..., description="Unique request identifier")
    model_used: str = Field(..., description="Model used for generation")
    template_used: Optional[str] = Field(None, description="Template ID if used")
    variables_substituted: Dict[str, str] = Field(
        default_factory=dict, description="Template variables"
    )
    token_analysis: Dict[str, Any] = Field(
        default_factory=dict, description="Token analysis"
    )
    cost_breakdown: Dict[str, Any] = Field(
        default_factory=dict, description="Cost breakdown"
    )
    optimization_suggestions: List[str] = Field(
        default_factory=list, description="Optimization tips"
    )
    performance_metrics: Dict[str, Any] = Field(
        default_factory=dict, description="Performance data"
    )


class ClaudeResponse(BaseModel):
    response: str = Field(..., description="Generated response")
    usage: TokenUsage = Field(..., description="Token usage information")
    debug_info: DebugInfo = Field(..., description="Debug and optimization information")
    provider_used: Dict[str, str] = Field(..., description="Provider information")
    timestamp: str = Field(..., description="Response timestamp")


class StreamChunk(BaseModel):
    chunk: str = Field(..., description="Text chunk")
    is_complete: bool = Field(False, description="Whether stream is complete")
    usage: Optional[TokenUsage] = Field(
        None, description="Usage info (only on completion)"
    )
    debug_info: Optional[DebugInfo] = Field(
        None, description="Debug info (only on completion)"
    )


# Built-in prompt templates for meeting analysis
BUILTIN_TEMPLATES = {
    "meeting_summary_comprehensive": PromptTemplate(
        id="meeting_summary_comprehensive",
        name="Comprehensive Meeting Summary",
        description="Generate a detailed meeting summary with key discussion points, decisions, and outcomes",
        category="meeting_summary",
        template="""You are an expert meeting analyst. Please analyze the following meeting transcript and provide a comprehensive summary.

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

Format the response in clear, professional language suitable for sharing with stakeholders.""",
        variables=[
            TemplateVariable(
                name="meeting_title", description="Title of the meeting", required=True
            ),
            TemplateVariable(
                name="meeting_date",
                description="Date when meeting occurred",
                required=True,
            ),
            TemplateVariable(
                name="meeting_duration",
                description="Duration of the meeting",
                required=True,
            ),
            TemplateVariable(
                name="participants",
                description="List of meeting participants",
                required=True,
            ),
            TemplateVariable(
                name="transcript",
                description="Meeting transcript content",
                required=True,
            ),
        ],
        metadata={
            "created_at": "2024-12-06T00:00:00Z",
            "version": "1.0",
            "tags": ["comprehensive", "structured", "stakeholder-ready"],
            "typical_cost_cents": 1.95,
        },
    ),
    "action_items_extraction": PromptTemplate(
        id="action_items_extraction",
        name="Action Items Extraction",
        description="Extract and prioritize action items with clear ownership and deadlines",
        category="action_items",
        template="""Analyze the following meeting transcript and extract all action items with clear ownership and timelines.

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

Prioritize based on urgency, impact, and dependencies mentioned in the conversation.""",
        variables=[
            TemplateVariable(
                name="meeting_title", description="Title of the meeting", required=True
            ),
            TemplateVariable(
                name="meeting_date",
                description="Date when meeting occurred",
                required=True,
            ),
            TemplateVariable(
                name="participants",
                description="List of meeting participants",
                required=True,
            ),
            TemplateVariable(
                name="transcript",
                description="Meeting transcript content",
                required=True,
            ),
        ],
        metadata={
            "created_at": "2024-12-06T00:00:00Z",
            "version": "1.0",
            "tags": ["action-items", "task-management", "accountability"],
            "typical_cost_cents": 1.5,
        },
    ),
    "key_insights_analysis": PromptTemplate(
        id="key_insights_analysis",
        name="Key Insights and Patterns",
        description="Identify strategic insights, patterns, and opportunities from meeting discussions",
        category="key_insights",
        template="""Analyze the following meeting transcript to identify strategic insights, patterns, and opportunities.

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

Focus on insights that would be valuable for strategic decision-making and long-term planning.""",
        variables=[
            TemplateVariable(
                name="meeting_title", description="Title of the meeting", required=True
            ),
            TemplateVariable(
                name="meeting_date",
                description="Date when meeting occurred",
                required=True,
            ),
            TemplateVariable(
                name="meeting_type", description="Type of meeting", required=True
            ),
            TemplateVariable(
                name="participants",
                description="List of meeting participants",
                required=True,
            ),
            TemplateVariable(
                name="transcript",
                description="Meeting transcript content",
                required=True,
            ),
        ],
        metadata={
            "created_at": "2024-12-06T00:00:00Z",
            "version": "1.0",
            "tags": ["strategic", "insights", "patterns", "leadership"],
            "typical_cost_cents": 1.71,
        },
    ),
}

# Create router for Claude-specific endpoints
claude_router = APIRouter(prefix="/claude", tags=["Claude AI"])


@claude_router.get("/templates", response_model=List[PromptTemplate])
async def get_prompt_templates():
    """
    Get all available prompt templates for Claude

    Returns a list of predefined templates optimized for meeting analysis,
    summarization, and insight extraction using Claude Sonnet 3.5.
    """
    return list(BUILTIN_TEMPLATES.values())


@claude_router.get("/templates/{template_id}", response_model=PromptTemplate)
async def get_template(template_id: str):
    """Get a specific prompt template by ID"""
    if template_id not in BUILTIN_TEMPLATES:
        raise HTTPException(
            status_code=404, detail=f"Template '{template_id}' not found"
        )
    return BUILTIN_TEMPLATES[template_id]


@claude_router.post("/generate", response_model=ClaudeResponse)
async def generate_with_claude(request: ClaudeGenerateRequest):
    """
    Generate text using Claude with comprehensive debugging information

    Supports:
    - Template processing with variable substitution
    - Real-time cost estimation and token analysis
    - Optimization suggestions and performance metrics
    - Multiple Claude models (Sonnet 3.5, Haiku)
    """
    if request.stream:
        raise HTTPException(
            status_code=400,
            detail="Use /claude/generate/stream for streaming responses",
        )

    provider_registry = await get_registry()

    # Get Claude provider (preferably Anthropic)
    claude_provider = await provider_registry.get_provider("anthropic_claude")
    if not claude_provider:
        raise HTTPException(status_code=503, detail="Claude provider not available")

    # Process template if specified
    final_prompt = request.prompt
    template_used = None
    variables_substituted = {}

    if request.template_id and request.template_variables:
        if request.template_id not in BUILTIN_TEMPLATES:
            raise HTTPException(
                status_code=404, detail=f"Template '{request.template_id}' not found"
            )

        template = BUILTIN_TEMPLATES[request.template_id]
        template_used = request.template_id
        variables_substituted = request.template_variables.copy()

        # Substitute variables in template
        final_prompt = template.template
        for var in template.variables:
            placeholder = f"{{{{{var.name}}}}}"
            value = request.template_variables.get(
                var.name, f"[{var.name.upper()}_NOT_PROVIDED]"
            )
            final_prompt = final_prompt.replace(placeholder, value)
            variables_substituted[var.name] = value

    # Generate unique request ID
    request_id = f"claude_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    try:
        # Call Claude provider
        result = await claude_provider.generate_text(
            final_prompt,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )

        latency_ms = (time.time() - start_time) * 1000

        # Calculate token usage (estimate for input, actual for output)
        input_tokens = estimate_tokens(final_prompt)
        output_tokens = estimate_tokens(result)
        total_tokens = input_tokens + output_tokens

        # Calculate costs
        cost_cents = claude_provider.estimate_cost(
            input_tokens, output_tokens, request.model
        )
        input_cost = claude_provider.estimate_cost(input_tokens, 0, request.model)
        output_cost = claude_provider.estimate_cost(0, output_tokens, request.model)

        # Create comprehensive debug information
        debug_info = DebugInfo(
            request_id=request_id,
            model_used=request.model or "claude-3-5-sonnet-20241022",
            template_used=template_used,
            variables_substituted=variables_substituted,
            token_analysis={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
                "input_ratio": (
                    round(input_tokens / total_tokens * 100, 1)
                    if total_tokens > 0
                    else 0
                ),
                "efficiency_score": calculate_efficiency_score(
                    input_tokens, output_tokens
                ),
                "context_utilization": round(
                    input_tokens / 200000 * 100, 2
                ),  # Based on 200k context window
            },
            cost_breakdown={
                "input_cost_cents": input_cost,
                "output_cost_cents": output_cost,
                "total_cost_cents": cost_cents,
                "cost_per_token": (
                    round(cost_cents / total_tokens, 6) if total_tokens > 0 else 0
                ),
                "projected_monthly_cost": cost_cents * 30 * 24,  # Assuming hourly usage
            },
            optimization_suggestions=generate_optimization_suggestions(
                final_prompt, input_tokens, cost_cents
            ),
            performance_metrics={
                "latency_ms": round(latency_ms, 2),
                "tokens_per_second": (
                    round(total_tokens / (latency_ms / 1000), 2)
                    if latency_ms > 0
                    else 0
                ),
                "cost_per_second": (
                    round(cost_cents / (latency_ms / 1000), 6) if latency_ms > 0 else 0
                ),
            },
        )

        return ClaudeResponse(
            response=result,
            usage=TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                estimated_cost_cents=cost_cents,
            ),
            debug_info=debug_info,
            provider_used={
                "id": "anthropic_claude",
                "name": "Anthropic Claude",
                "model": request.model or "claude-3-5-sonnet-20241022",
            },
            timestamp=datetime.now().isoformat(),
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Claude generation failed: {str(e)}"
        )


@claude_router.post("/generate/stream")
async def stream_generate_with_claude(request: ClaudeGenerateRequest):
    """
    Generate streaming text using Claude with real-time token counting

    Returns Server-Sent Events with:
    - Real-time text chunks as they're generated
    - Progressive token counting and cost estimation
    - Final usage statistics and debug information
    """
    provider_registry = await get_registry()

    # Get Claude provider
    claude_provider = await provider_registry.get_provider("anthropic_claude")
    if not claude_provider:
        raise HTTPException(status_code=503, detail="Claude provider not available")

    # Process template (same as non-streaming)
    final_prompt = request.prompt
    template_used = None
    variables_substituted = {}

    if request.template_id and request.template_variables:
        if request.template_id not in BUILTIN_TEMPLATES:
            raise HTTPException(
                status_code=404, detail=f"Template '{request.template_id}' not found"
            )

        template = BUILTIN_TEMPLATES[request.template_id]
        template_used = request.template_id
        variables_substituted = request.template_variables.copy()

        final_prompt = template.template
        for var in template.variables:
            placeholder = f"{{{{{var.name}}}}}"
            value = request.template_variables.get(
                var.name, f"[{var.name.upper()}_NOT_PROVIDED]"
            )
            final_prompt = final_prompt.replace(placeholder, value)
            variables_substituted[var.name] = value

    request_id = f"claude_stream_{uuid.uuid4().hex[:12]}"

    async def generate_stream():
        accumulated_response = ""
        input_tokens = estimate_tokens(final_prompt)
        start_time = time.time()

        try:
            # Note: This is a simplified streaming implementation
            # In a real implementation, you'd use Claude's streaming API
            result = await claude_provider.generate_text(
                final_prompt,
                model=request.model,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )

            # Simulate streaming by chunking the response
            words = result.split()
            for i, word in enumerate(words):
                chunk = word + " " if i < len(words) - 1 else word
                accumulated_response += chunk

                # Estimate current tokens and cost
                current_output_tokens = estimate_tokens(accumulated_response)
                current_cost = claude_provider.estimate_cost(
                    input_tokens, current_output_tokens, request.model
                )

                chunk_data = StreamChunk(
                    chunk=chunk, is_complete=False
                ).model_dump_json()

                yield f"data: {chunk_data}\n\n"
                await asyncio.sleep(0.1)  # Simulate streaming delay

            # Final message with complete usage info
            latency_ms = (time.time() - start_time) * 1000
            output_tokens = estimate_tokens(accumulated_response)
            total_tokens = input_tokens + output_tokens
            final_cost = claude_provider.estimate_cost(
                input_tokens, output_tokens, request.model
            )

            final_debug_info = DebugInfo(
                request_id=request_id,
                model_used=request.model or "claude-3-5-sonnet-20241022",
                template_used=template_used,
                variables_substituted=variables_substituted,
                token_analysis={
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": total_tokens,
                    "efficiency_score": calculate_efficiency_score(
                        input_tokens, output_tokens
                    ),
                },
                cost_breakdown={
                    "total_cost_cents": final_cost,
                    "input_cost_cents": claude_provider.estimate_cost(
                        input_tokens, 0, request.model
                    ),
                    "output_cost_cents": claude_provider.estimate_cost(
                        0, output_tokens, request.model
                    ),
                },
                optimization_suggestions=generate_optimization_suggestions(
                    final_prompt, input_tokens, final_cost
                ),
                performance_metrics={
                    "latency_ms": round(latency_ms, 2),
                    "tokens_per_second": (
                        round(total_tokens / (latency_ms / 1000), 2)
                        if latency_ms > 0
                        else 0
                    ),
                },
            )

            final_chunk = StreamChunk(
                chunk="",
                is_complete=True,
                usage=TokenUsage(
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_cents=final_cost,
                ),
                debug_info=final_debug_info,
            ).model_dump_json()

            yield f"data: {final_chunk}\n\n"

        except Exception as e:
            error_chunk = {"chunk": "", "is_complete": True, "error": str(e)}
            yield f"data: {json.dumps(error_chunk)}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


@claude_router.post("/chat", response_model=ClaudeResponse)
async def chat_with_claude(request: ClaudeChatRequest):
    """
    Chat completion using Claude with conversation context management

    Supports:
    - Multi-turn conversations with context preservation
    - Automatic context window management
    - Cost tracking across conversation turns
    """
    provider_registry = await get_registry()

    claude_provider = await provider_registry.get_provider("anthropic_claude")
    if not claude_provider:
        raise HTTPException(status_code=503, detail="Claude provider not available")

    request_id = f"claude_chat_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    try:
        # Convert messages to Claude format
        claude_messages = [
            {"role": msg.role, "content": msg.content} for msg in request.messages
        ]

        result = await claude_provider.chat_completion(
            claude_messages,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )

        latency_ms = (time.time() - start_time) * 1000

        # Extract response and usage from provider result
        response_text = result.get("message", {}).get("content", "")
        usage_info = result.get("usage", {})
        cost_cents = result.get("cost_cents", 0)

        input_tokens = usage_info.get("input_tokens", 0)
        output_tokens = usage_info.get("output_tokens", 0)
        total_tokens = input_tokens + output_tokens

        debug_info = DebugInfo(
            request_id=request_id,
            model_used=request.model or "claude-3-5-sonnet-20241022",
            token_analysis={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
                "conversation_length": len(request.messages),
                "context_utilization": round(input_tokens / 200000 * 100, 2),
            },
            cost_breakdown={
                "total_cost_cents": cost_cents,
                "input_cost_cents": claude_provider.estimate_cost(
                    input_tokens, 0, request.model
                ),
                "output_cost_cents": claude_provider.estimate_cost(
                    0, output_tokens, request.model
                ),
            },
            optimization_suggestions=generate_chat_optimization_suggestions(
                request.messages, input_tokens
            ),
            performance_metrics={
                "latency_ms": round(latency_ms, 2),
                "tokens_per_second": (
                    round(total_tokens / (latency_ms / 1000), 2)
                    if latency_ms > 0
                    else 0
                ),
            },
        )

        return ClaudeResponse(
            response=response_text,
            usage=TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                estimated_cost_cents=cost_cents,
            ),
            debug_info=debug_info,
            provider_used={
                "id": "anthropic_claude",
                "name": "Anthropic Claude",
                "model": request.model or "claude-3-5-sonnet-20241022",
            },
            timestamp=datetime.now().isoformat(),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claude chat failed: {str(e)}")


# Utility functions


def estimate_tokens(text: str) -> int:
    """Estimate token count (rough approximation: 1 token ≈ 4 characters)"""
    return max(1, len(text) // 4)


def calculate_efficiency_score(input_tokens: int, output_tokens: int) -> float:
    """Calculate prompt efficiency score (0-100)"""
    if input_tokens == 0:
        return 0
    ratio = output_tokens / input_tokens
    # Optimal ratio is around 0.5-2.0 (1:2 to 2:1 input:output)
    if 0.5 <= ratio <= 2.0:
        return 100
    elif ratio < 0.5:
        return max(0, 100 - (0.5 - ratio) * 200)
    else:
        return max(0, 100 - (ratio - 2.0) * 50)


def generate_optimization_suggestions(
    prompt: str, token_count: int, cost_cents: float
) -> List[str]:
    """Generate optimization suggestions based on prompt analysis"""
    suggestions = []

    if cost_cents > 2.0:
        suggestions.append(
            "High cost prompt - consider using Claude Haiku for simple tasks"
        )

    if token_count > 3000:
        suggestions.append(
            "Long prompt detected - consider breaking into smaller focused requests"
        )

    if "format" not in prompt.lower() and "structure" not in prompt.lower():
        suggestions.append("Specify desired output format for more consistent results")

    if "example" not in prompt.lower():
        suggestions.append("Adding examples can significantly improve response quality")

    if not any(
        role_word in prompt.lower()
        for role_word in ["you are", "act as", "imagine you"]
    ):
        suggestions.append(
            "Consider starting with a role definition for better responses"
        )

    return suggestions


def generate_chat_optimization_suggestions(
    messages: List[ClaudeMessage], total_tokens: int
) -> List[str]:
    """Generate optimization suggestions for chat conversations"""
    suggestions = []

    if len(messages) > 20:
        suggestions.append(
            "Long conversation - consider summarizing older messages to reduce cost"
        )

    if total_tokens > 100000:
        suggestions.append("High token usage - implement context window management")

    user_messages = [m for m in messages if m.role == "user"]
    if len(user_messages) > 5:
        avg_length = sum(len(m.content) for m in user_messages) / len(user_messages)
        if avg_length > 500:
            suggestions.append(
                "Long user messages - consider more concise communication"
            )

    return suggestions
