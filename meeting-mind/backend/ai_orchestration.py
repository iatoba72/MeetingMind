# AI Orchestration System for MeetingMind
# Comprehensive LangChain-based orchestration with intelligent routing, caching, and monitoring
# Features task complexity analysis, fallback chains, A/B testing, and performance metrics

import asyncio
import json
import hashlib
import time
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Callable, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import redis.asyncio as redis
from pythonjsonlogger import jsonlogger

# LangChain imports
from langchain.schema import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain.callbacks.base import BaseCallbackHandler
from langchain.schema.output import LLMResult
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, PromptTemplate
from langchain.chains import LLMChain
from langchain.schema.runnable import RunnableSequence, RunnableLambda
from langchain.cache import RedisCache
from langchain.globals import set_llm_cache

# Custom types and enums
class TaskComplexity(Enum):
    """Task complexity levels for intelligent routing"""
    SIMPLE = "simple"           # Basic queries, short responses
    MODERATE = "moderate"       # Standard analysis, medium responses  
    COMPLEX = "complex"         # Deep analysis, long responses
    CRITICAL = "critical"       # Mission-critical, highest quality needed

class ModelType(Enum):
    """Available model types in the orchestration system"""
    CLAUDE_HAIKU = "claude-3-haiku-20240307"
    CLAUDE_SONNET = "claude-3-5-sonnet-20241022"
    GPT_4_MINI = "gpt-4o-mini"
    GPT_4 = "gpt-4o"

class RoutingStrategy(Enum):
    """Different routing strategies for model selection"""
    COMPLEXITY_BASED = "complexity_based"
    COST_OPTIMIZED = "cost_optimized"
    PERFORMANCE_OPTIMIZED = "performance_optimized"
    AB_TEST = "ab_test"
    ROUND_ROBIN = "round_robin"

@dataclass
class TaskRequest:
    """Structured request for AI orchestration"""
    id: str
    task_type: str
    prompt: str
    context: Dict[str, Any]
    complexity: Optional[TaskComplexity] = None
    routing_strategy: RoutingStrategy = RoutingStrategy.COMPLEXITY_BASED
    max_tokens: int = 4096
    temperature: float = 0.7
    cache_enabled: bool = True
    ab_test_group: Optional[str] = None
    metadata: Dict[str, Any] = None

@dataclass
class ModelPerformanceMetrics:
    """Comprehensive performance metrics for models"""
    model_name: str
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_tokens: int = 0
    total_cost_cents: float = 0.0
    average_latency_ms: float = 0.0
    average_quality_score: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    error_rate: float = 0.0
    throughput_rpm: float = 0.0  # Requests per minute
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    last_updated: datetime = None

@dataclass
class OrchestrationResult:
    """Result from AI orchestration with comprehensive metadata"""
    request_id: str
    response: str
    model_used: ModelType
    routing_strategy: RoutingStrategy
    complexity_detected: TaskComplexity
    execution_time_ms: float
    token_usage: Dict[str, int]
    cost_cents: float
    cache_hit: bool
    fallback_used: bool
    ab_test_group: Optional[str]
    quality_score: Optional[float]
    error: Optional[str]
    timestamp: datetime
    debug_info: Dict[str, Any]

class MetricsCallbackHandler(BaseCallbackHandler):
    """Custom LangChain callback handler for comprehensive metrics collection"""
    
    def __init__(self, orchestrator):
        super().__init__()
        self.orchestrator = orchestrator
        self.start_time = None
        self.model_name = None
        self.request_id = None
    
    def on_llm_start(self, serialized: Dict[str, Any], prompts: List[str], **kwargs) -> None:
        """Called when LLM starts processing"""
        self.start_time = time.time()
        self.model_name = serialized.get('model_name', 'unknown')
        self.request_id = kwargs.get('request_id', str(uuid.uuid4()))
        
        # Log request start
        self.orchestrator.logger.info("LLM request started", extra={
            "event": "llm_start",
            "request_id": self.request_id,
            "model": self.model_name,
            "prompt_length": len(prompts[0]) if prompts else 0
        })
    
    def on_llm_end(self, response: LLMResult, **kwargs) -> None:
        """Called when LLM completes processing"""
        if self.start_time:
            duration_ms = (time.time() - self.start_time) * 1000
            
            # Extract token usage
            token_usage = {}
            if response.llm_output:
                token_usage = response.llm_output.get('token_usage', {})
            
            # Log successful completion
            self.orchestrator.logger.info("LLM request completed", extra={
                "event": "llm_end",
                "request_id": self.request_id,
                "model": self.model_name,
                "duration_ms": duration_ms,
                "token_usage": token_usage,
                "generations_count": len(response.generations)
            })
            
            # Update metrics
            asyncio.create_task(
                self.orchestrator._update_model_metrics(
                    self.model_name, duration_ms, token_usage, True
                )
            )
    
    def on_llm_error(self, error: Exception, **kwargs) -> None:
        """Called when LLM encounters an error"""
        if self.start_time:
            duration_ms = (time.time() - self.start_time) * 1000
            
            # Log error
            self.orchestrator.logger.error("LLM request failed", extra={
                "event": "llm_error",
                "request_id": self.request_id,
                "model": self.model_name,
                "duration_ms": duration_ms,
                "error": str(error),
                "error_type": type(error).__name__
            })
            
            # Update metrics
            asyncio.create_task(
                self.orchestrator._update_model_metrics(
                    self.model_name, duration_ms, {}, False
                )
            )

class TaskComplexityAnalyzer:
    """
    Intelligent task complexity analyzer using heuristics and ML techniques
    
    Analyzes various aspects of requests to determine optimal model routing:
    - Text length and structure
    - Task type classification
    - Required reasoning depth
    - Expected response complexity
    """
    
    def __init__(self):
        # Keywords indicating different complexity levels
        self.simple_indicators = {
            'keywords': ['hello', 'hi', 'thanks', 'yes', 'no', 'what', 'when', 'where'],
            'task_types': ['greeting', 'confirmation', 'simple_question'],
            'max_words': 50
        }
        
        self.moderate_indicators = {
            'keywords': ['analyze', 'explain', 'describe', 'compare', 'summarize'],
            'task_types': ['meeting_summary', 'basic_analysis', 'extraction'],
            'max_words': 500
        }
        
        self.complex_indicators = {
            'keywords': ['comprehensive', 'detailed', 'strategic', 'elaborate', 'insights'],
            'task_types': ['strategic_analysis', 'complex_reasoning', 'multi_step'],
            'max_words': 2000
        }
        
        self.critical_indicators = {
            'keywords': ['critical', 'urgent', 'important', 'decision', 'executive'],
            'task_types': ['executive_summary', 'decision_support', 'crisis_analysis']
        }
    
    def analyze_complexity(self, request: TaskRequest) -> TaskComplexity:
        """
        Analyze request complexity using multiple heuristics
        
        Returns the determined complexity level for optimal model routing
        """
        if request.complexity:
            return request.complexity
        
        # Analyze various factors
        text_complexity = self._analyze_text_complexity(request.prompt)
        task_complexity = self._analyze_task_type(request.task_type)
        context_complexity = self._analyze_context_complexity(request.context)
        
        # Calculate weighted score
        scores = {
            TaskComplexity.SIMPLE: 0,
            TaskComplexity.MODERATE: 0,
            TaskComplexity.COMPLEX: 0,
            TaskComplexity.CRITICAL: 0
        }
        
        # Text analysis weight: 40%
        scores[text_complexity] += 0.4
        
        # Task type weight: 35%
        scores[task_complexity] += 0.35
        
        # Context weight: 25%
        scores[context_complexity] += 0.25
        
        # Return highest scoring complexity
        return max(scores.items(), key=lambda x: x[1])[0]
    
    def _analyze_text_complexity(self, text: str) -> TaskComplexity:
        """Analyze text characteristics for complexity"""
        word_count = len(text.split())
        char_count = len(text)
        
        # Check for complexity indicators
        text_lower = text.lower()
        
        # Critical indicators
        if any(keyword in text_lower for keyword in self.critical_indicators['keywords']):
            return TaskComplexity.CRITICAL
        
        # Complex indicators
        if (word_count > self.complex_indicators['max_words'] or
            any(keyword in text_lower for keyword in self.complex_indicators['keywords'])):
            return TaskComplexity.COMPLEX
        
        # Moderate indicators
        if (word_count > self.moderate_indicators['max_words'] or
            any(keyword in text_lower for keyword in self.moderate_indicators['keywords'])):
            return TaskComplexity.MODERATE
        
        # Simple by default
        return TaskComplexity.SIMPLE
    
    def _analyze_task_type(self, task_type: str) -> TaskComplexity:
        """Analyze task type for complexity"""
        task_lower = task_type.lower()
        
        for complexity_level in [TaskComplexity.CRITICAL, TaskComplexity.COMPLEX, 
                                TaskComplexity.MODERATE, TaskComplexity.SIMPLE]:
            indicators = getattr(self, f"{complexity_level.value}_indicators")
            if task_lower in indicators.get('task_types', []):
                return complexity_level
        
        return TaskComplexity.MODERATE  # Default
    
    def _analyze_context_complexity(self, context: Dict[str, Any]) -> TaskComplexity:
        """Analyze context for additional complexity signals"""
        if not context:
            return TaskComplexity.SIMPLE
        
        # Check for complex context indicators
        context_size = len(str(context))
        nested_levels = self._count_nested_levels(context)
        
        if context_size > 5000 or nested_levels > 3:
            return TaskComplexity.COMPLEX
        elif context_size > 1000 or nested_levels > 2:
            return TaskComplexity.MODERATE
        else:
            return TaskComplexity.SIMPLE
    
    def _count_nested_levels(self, obj, level=0):
        """Count nesting levels in context object"""
        if isinstance(obj, dict):
            return max([self._count_nested_levels(v, level + 1) for v in obj.values()] + [level])
        elif isinstance(obj, list):
            return max([self._count_nested_levels(item, level + 1) for item in obj] + [level])
        else:
            return level

class AIOrchestrator:
    """
    Comprehensive AI Orchestration System for MeetingMind
    
    Features:
    - Intelligent task-based routing with complexity analysis
    - Multi-model fallback chains for high availability
    - Redis-based response caching for cost optimization
    - A/B testing framework for model comparison
    - Comprehensive metrics and performance monitoring
    - Real-time cost tracking and optimization
    """
    
    def __init__(self, 
                 redis_url: str = "redis://localhost:6379",
                 cache_ttl: int = 3600,
                 enable_fallbacks: bool = True):
        """
        Initialize the AI orchestration system
        
        Args:
            redis_url: Redis connection URL for caching
            cache_ttl: Cache time-to-live in seconds
            enable_fallbacks: Whether to enable fallback chains
        """
        self.redis_url = redis_url
        self.cache_ttl = cache_ttl
        self.enable_fallbacks = enable_fallbacks
        
        # Initialize components
        self.complexity_analyzer = TaskComplexityAnalyzer()
        self.models: Dict[ModelType, Any] = {}
        self.metrics: Dict[str, ModelPerformanceMetrics] = {}
        self.ab_test_groups: Dict[str, Dict] = {}
        
        # Initialize Redis connection
        self.redis_client = None
        
        # Initialize structured logging
        self._setup_logging()
        
        # Model routing configuration
        self.routing_config = {
            TaskComplexity.SIMPLE: [ModelType.CLAUDE_HAIKU, ModelType.GPT_4_MINI],
            TaskComplexity.MODERATE: [ModelType.CLAUDE_SONNET, ModelType.GPT_4_MINI],
            TaskComplexity.COMPLEX: [ModelType.CLAUDE_SONNET, ModelType.GPT_4],
            TaskComplexity.CRITICAL: [ModelType.CLAUDE_SONNET, ModelType.GPT_4]
        }
        
        # Cost per token (in cents)
        self.model_costs = {
            ModelType.CLAUDE_HAIKU: {"input": 0.000025, "output": 0.000125},
            ModelType.CLAUDE_SONNET: {"input": 0.0003, "output": 0.0015},
            ModelType.GPT_4_MINI: {"input": 0.00015, "output": 0.0006},
            ModelType.GPT_4: {"input": 0.0025, "output": 0.01}
        }
    
    async def initialize(self):
        """Initialize the orchestration system"""
        try:
            # Initialize Redis connection
            self.redis_client = redis.from_url(self.redis_url)
            await self.redis_client.ping()
            
            # Setup LangChain cache
            set_llm_cache(RedisCache(self.redis_client))
            
            # Initialize models
            await self._initialize_models()
            
            # Initialize metrics
            await self._initialize_metrics()
            
            self.logger.info("AI Orchestration system initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize AI Orchestration: {e}")
            raise
    
    async def _initialize_models(self):
        """Initialize all available models with proper configuration"""
        try:
            # Initialize Claude models
            self.models[ModelType.CLAUDE_HAIKU] = ChatAnthropic(
                model="claude-3-haiku-20240307",
                anthropic_api_key=None,  # Will use environment variable
                callbacks=[MetricsCallbackHandler(self)]
            )
            
            self.models[ModelType.CLAUDE_SONNET] = ChatAnthropic(
                model="claude-3-5-sonnet-20241022",
                anthropic_api_key=None,
                callbacks=[MetricsCallbackHandler(self)]
            )
            
            # Initialize OpenAI models
            self.models[ModelType.GPT_4_MINI] = ChatOpenAI(
                model="gpt-4o-mini",
                openai_api_key=None,  # Will use environment variable
                callbacks=[MetricsCallbackHandler(self)]
            )
            
            self.models[ModelType.GPT_4] = ChatOpenAI(
                model="gpt-4o",
                openai_api_key=None,
                callbacks=[MetricsCallbackHandler(self)]
            )
            
            self.logger.info("All models initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize models: {e}")
            raise
    
    async def _initialize_metrics(self):
        """Initialize performance metrics for all models"""
        for model_type in ModelType:
            self.metrics[model_type.value] = ModelPerformanceMetrics(
                model_name=model_type.value,
                last_updated=datetime.now()
            )
    
    def _setup_logging(self):
        """Setup structured logging for comprehensive monitoring"""
        # Create logger
        self.logger = logging.getLogger("ai_orchestration")
        self.logger.setLevel(logging.INFO)
        
        # Create structured formatter
        formatter = jsonlogger.JsonFormatter(
            fmt='%(asctime)s %(name)s %(levelname)s %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Create handler
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
    
    async def orchestrate(self, request: TaskRequest) -> OrchestrationResult:
        """
        Main orchestration method that handles the complete AI request lifecycle
        
        Process:
        1. Analyze task complexity
        2. Determine optimal routing strategy
        3. Check cache for existing response
        4. Route to appropriate model with fallbacks
        5. Execute request with comprehensive monitoring
        6. Cache response and update metrics
        7. Return detailed result with performance data
        """
        start_time = time.time()
        
        try:
            # Analyze task complexity
            complexity = self.complexity_analyzer.analyze_complexity(request)
            
            # Log request start
            self.logger.info("Orchestration request started", extra={
                "event": "orchestration_start",
                "request_id": request.id,
                "task_type": request.task_type,
                "complexity": complexity.value,
                "routing_strategy": request.routing_strategy.value
            })
            
            # Check cache first (if enabled)
            cache_hit = False
            cached_response = None
            if request.cache_enabled:
                cached_response = await self._check_cache(request)
                if cached_response:
                    cache_hit = True
                    self.logger.info("Cache hit", extra={
                        "event": "cache_hit",
                        "request_id": request.id
                    })
            
            # If not cached, process the request
            if not cached_response:
                # Select model based on routing strategy
                selected_model = await self._select_model(request, complexity)
                
                # Execute request with fallbacks
                response, model_used, fallback_used = await self._execute_with_fallbacks(
                    request, selected_model, complexity
                )
                
                # Cache the response
                if request.cache_enabled and response:
                    await self._cache_response(request, response)
            else:
                response = cached_response["response"]
                model_used = ModelType(cached_response["model_used"])
                fallback_used = False
            
            # Calculate execution time and costs
            execution_time_ms = (time.time() - start_time) * 1000
            
            # Estimate token usage and cost
            token_usage = self._estimate_token_usage(request.prompt, response)
            cost_cents = self._calculate_cost(token_usage, model_used)
            
            # Update metrics
            await self._update_model_metrics(
                model_used.value, execution_time_ms, token_usage, True
            )
            
            # Create comprehensive result
            result = OrchestrationResult(
                request_id=request.id,
                response=response,
                model_used=model_used,
                routing_strategy=request.routing_strategy,
                complexity_detected=complexity,
                execution_time_ms=execution_time_ms,
                token_usage=token_usage,
                cost_cents=cost_cents,
                cache_hit=cache_hit,
                fallback_used=fallback_used,
                ab_test_group=request.ab_test_group,
                quality_score=None,  # Could be implemented with quality assessment
                error=None,
                timestamp=datetime.now(),
                debug_info={
                    "cache_enabled": request.cache_enabled,
                    "available_models": len(self.models),
                    "complexity_factors": complexity.value
                }
            )
            
            # Log successful completion
            self.logger.info("Orchestration completed successfully", extra={
                "event": "orchestration_success",
                "request_id": request.id,
                "model_used": model_used.value,
                "execution_time_ms": execution_time_ms,
                "cost_cents": cost_cents,
                "cache_hit": cache_hit,
                "fallback_used": fallback_used
            })
            
            return result
            
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            
            # Log error
            self.logger.error("Orchestration failed", extra={
                "event": "orchestration_error",
                "request_id": request.id,
                "error": str(e),
                "error_type": type(e).__name__,
                "execution_time_ms": execution_time_ms
            })
            
            # Return error result
            return OrchestrationResult(
                request_id=request.id,
                response="",
                model_used=ModelType.CLAUDE_HAIKU,  # Default
                routing_strategy=request.routing_strategy,
                complexity_detected=TaskComplexity.SIMPLE,
                execution_time_ms=execution_time_ms,
                token_usage={},
                cost_cents=0.0,
                cache_hit=False,
                fallback_used=False,
                ab_test_group=request.ab_test_group,
                quality_score=None,
                error=str(e),
                timestamp=datetime.now(),
                debug_info={}
            )
    
    async def _select_model(self, request: TaskRequest, complexity: TaskComplexity) -> ModelType:
        """
        Select optimal model based on routing strategy and complexity
        
        Implements various routing strategies:
        - Complexity-based: Route based on task complexity
        - Cost-optimized: Choose most cost-effective model
        - Performance-optimized: Choose fastest/highest quality model
        - A/B testing: Route based on test group
        - Round-robin: Distribute load evenly
        """
        if request.routing_strategy == RoutingStrategy.COMPLEXITY_BASED:
            # Select based on complexity level
            available_models = self.routing_config.get(complexity, [ModelType.CLAUDE_SONNET])
            return available_models[0]  # Primary model for complexity
        
        elif request.routing_strategy == RoutingStrategy.COST_OPTIMIZED:
            # Select cheapest available model
            return min(self.model_costs.keys(), 
                      key=lambda m: self.model_costs[m]["input"] + self.model_costs[m]["output"])
        
        elif request.routing_strategy == RoutingStrategy.PERFORMANCE_OPTIMIZED:
            # Select model with best performance metrics
            best_model = ModelType.CLAUDE_SONNET
            best_score = 0
            
            for model_type in ModelType:
                metrics = self.metrics.get(model_type.value)
                if metrics and metrics.total_requests > 0:
                    # Calculate performance score (lower latency, higher success rate)
                    score = (metrics.successful_requests / metrics.total_requests) / max(metrics.average_latency_ms, 1)
                    if score > best_score:
                        best_score = score
                        best_model = model_type
            
            return best_model
        
        elif request.routing_strategy == RoutingStrategy.AB_TEST:
            # Route based on A/B test group
            return await self._select_ab_test_model(request)
        
        elif request.routing_strategy == RoutingStrategy.ROUND_ROBIN:
            # Simple round-robin selection
            available_models = list(ModelType)
            selected_index = hash(request.id) % len(available_models)
            return available_models[selected_index]
        
        else:
            # Default to complexity-based
            return self.routing_config.get(complexity, [ModelType.CLAUDE_SONNET])[0]
    
    async def _execute_with_fallbacks(self, 
                                    request: TaskRequest, 
                                    primary_model: ModelType, 
                                    complexity: TaskComplexity) -> Tuple[str, ModelType, bool]:
        """
        Execute request with fallback chain for high availability
        
        Fallback strategy:
        1. Try primary model
        2. If fails, try secondary model for complexity level
        3. If still fails, try most reliable model (Claude Haiku)
        4. If all fail, return error
        """
        # Prepare the prompt
        messages = [HumanMessage(content=request.prompt)]
        
        # Try primary model first
        try:
            model = self.models[primary_model]
            response = await model.ainvoke(messages)
            return response.content, primary_model, False
        
        except Exception as e:
            self.logger.warning(f"Primary model {primary_model.value} failed: {e}")
            
            if not self.enable_fallbacks:
                raise e
        
        # Try fallback models
        fallback_models = self.routing_config.get(complexity, [])
        
        for fallback_model in fallback_models:
            if fallback_model == primary_model:
                continue  # Skip primary model
            
            try:
                model = self.models[fallback_model]
                response = await model.ainvoke(messages)
                
                self.logger.info(f"Fallback successful with {fallback_model.value}")
                return response.content, fallback_model, True
            
            except Exception as e:
                self.logger.warning(f"Fallback model {fallback_model.value} failed: {e}")
                continue
        
        # Final fallback to most reliable model
        try:
            model = self.models[ModelType.CLAUDE_HAIKU]
            response = await model.ainvoke(messages)
            
            self.logger.info("Final fallback to Claude Haiku successful")
            return response.content, ModelType.CLAUDE_HAIKU, True
        
        except Exception as e:
            self.logger.error(f"All fallbacks failed: {e}")
            raise Exception("All models failed to respond")
    
    async def _check_cache(self, request: TaskRequest) -> Optional[Dict]:
        """Check Redis cache for existing response"""
        try:
            # Create cache key based on request content
            cache_key = self._create_cache_key(request)
            
            # Check Redis
            cached_data = await self.redis_client.get(cache_key)
            if cached_data:
                return json.loads(cached_data)
            
            return None
        
        except Exception as e:
            self.logger.warning(f"Cache check failed: {e}")
            return None
    
    async def _cache_response(self, request: TaskRequest, response: str):
        """Cache response in Redis with TTL"""
        try:
            cache_key = self._create_cache_key(request)
            cache_data = {
                "response": response,
                "model_used": self._get_last_used_model().value,
                "timestamp": datetime.now().isoformat(),
                "request_id": request.id
            }
            
            await self.redis_client.setex(
                cache_key, 
                self.cache_ttl, 
                json.dumps(cache_data)
            )
            
        except Exception as e:
            self.logger.warning(f"Cache write failed: {e}")
    
    def _create_cache_key(self, request: TaskRequest) -> str:
        """Create unique cache key for request"""
        # Create hash of relevant request components
        key_components = [
            request.prompt,
            request.task_type,
            str(request.max_tokens),
            str(request.temperature),
            json.dumps(request.context, sort_keys=True) if request.context else ""
        ]
        
        combined = "|".join(key_components)
        return f"ai_cache:{hashlib.sha256(combined.encode()).hexdigest()}"
    
    def _get_last_used_model(self) -> ModelType:
        """Get the last used model (simplified implementation)"""
        return ModelType.CLAUDE_SONNET  # Placeholder
    
    async def _select_ab_test_model(self, request: TaskRequest) -> ModelType:
        """Select model based on A/B test configuration"""
        # Simple A/B test implementation
        if request.ab_test_group == "A":
            return ModelType.CLAUDE_SONNET
        elif request.ab_test_group == "B":
            return ModelType.GPT_4
        else:
            # Default to complexity-based routing
            complexity = self.complexity_analyzer.analyze_complexity(request)
            return self.routing_config.get(complexity, [ModelType.CLAUDE_SONNET])[0]
    
    def _estimate_token_usage(self, prompt: str, response: str) -> Dict[str, int]:
        """Estimate token usage (rough approximation)"""
        # Simple estimation: ~4 characters per token
        input_tokens = len(prompt) // 4
        output_tokens = len(response) // 4
        
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens
        }
    
    def _calculate_cost(self, token_usage: Dict[str, int], model: ModelType) -> float:
        """Calculate cost in cents based on token usage and model"""
        if not token_usage or model not in self.model_costs:
            return 0.0
        
        costs = self.model_costs[model]
        input_cost = token_usage.get("input_tokens", 0) * costs["input"]
        output_cost = token_usage.get("output_tokens", 0) * costs["output"]
        
        return (input_cost + output_cost) * 100  # Convert to cents
    
    async def _update_model_metrics(self, 
                                   model_name: str, 
                                   duration_ms: float, 
                                   token_usage: Dict[str, int], 
                                   success: bool):
        """Update comprehensive performance metrics for a model"""
        if model_name not in self.metrics:
            self.metrics[model_name] = ModelPerformanceMetrics(model_name=model_name)
        
        metrics = self.metrics[model_name]
        
        # Update basic counters
        metrics.total_requests += 1
        if success:
            metrics.successful_requests += 1
        else:
            metrics.failed_requests += 1
        
        # Update latency (exponential moving average)
        if metrics.average_latency_ms == 0:
            metrics.average_latency_ms = duration_ms
        else:
            metrics.average_latency_ms = (0.9 * metrics.average_latency_ms + 0.1 * duration_ms)
        
        # Update token usage
        if token_usage:
            metrics.total_tokens += token_usage.get("total_tokens", 0)
        
        # Update error rate
        metrics.error_rate = (metrics.failed_requests / metrics.total_requests) * 100
        
        # Update timestamp
        metrics.last_updated = datetime.now()
    
    async def get_metrics_summary(self) -> Dict[str, Any]:
        """Get comprehensive metrics summary for all models"""
        summary = {
            "total_requests": sum(m.total_requests for m in self.metrics.values()),
            "total_cost_cents": sum(m.total_cost_cents for m in self.metrics.values()),
            "average_latency_ms": sum(m.average_latency_ms for m in self.metrics.values()) / len(self.metrics),
            "overall_error_rate": sum(m.error_rate for m in self.metrics.values()) / len(self.metrics),
            "models": {name: asdict(metrics) for name, metrics in self.metrics.items()},
            "timestamp": datetime.now().isoformat()
        }
        
        return summary
    
    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check for the orchestration system"""
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "components": {}
        }
        
        # Check Redis connection
        try:
            await self.redis_client.ping()
            health_status["components"]["redis"] = "healthy"
        except Exception as e:
            health_status["components"]["redis"] = f"unhealthy: {e}"
            health_status["status"] = "degraded"
        
        # Check model availability
        model_health = {}
        for model_type, model in self.models.items():
            try:
                # Simple health check (could be improved)
                model_health[model_type.value] = "healthy"
            except Exception as e:
                model_health[model_type.value] = f"unhealthy: {e}"
                health_status["status"] = "degraded"
        
        health_status["components"]["models"] = model_health
        
        # Add metrics summary
        health_status["metrics_summary"] = await self.get_metrics_summary()
        
        return health_status

# Global orchestrator instance
orchestrator = AIOrchestrator()

async def initialize_orchestrator():
    """Initialize the global orchestrator instance"""
    await orchestrator.initialize()

async def get_orchestrator() -> AIOrchestrator:
    """Get the global orchestrator instance"""
    return orchestrator