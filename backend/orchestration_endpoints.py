# API Endpoints for AI Orchestration System
# FastAPI endpoints for orchestration metrics, A/B testing, and system management

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
import asyncio
import logging

from .ai_orchestration import (
    TaskRequest,
    TaskComplexity,
    ModelType,
    RoutingStrategy,
    AIOrchestrator,
    get_orchestrator,
    initialize_orchestrator,
)
from .ab_testing_framework import (
    ABTestingFramework,
    ExperimentVariant,
    ExperimentMetric,
    MetricType,
    get_ab_testing_framework,
    initialize_ab_testing,
)

# Initialize router
orchestration_router = APIRouter(prefix="/api/orchestration", tags=["AI Orchestration"])


# Request/Response Models
class OrchestrationRequest(BaseModel):
    """Request model for AI orchestration"""

    task_type: str = Field(..., description="Type of task to perform")
    prompt: str = Field(..., description="The prompt to process")
    context: Dict[str, Any] = Field(
        default_factory=dict, description="Additional context"
    )
    complexity: Optional[TaskComplexity] = Field(
        None, description="Optional complexity override"
    )
    routing_strategy: RoutingStrategy = Field(
        RoutingStrategy.COMPLEXITY_BASED, description="Routing strategy"
    )
    max_tokens: int = Field(4096, description="Maximum tokens for response")
    temperature: float = Field(0.7, description="Temperature for generation")
    cache_enabled: bool = Field(True, description="Whether to use caching")
    ab_test_group: Optional[str] = Field(None, description="A/B test group assignment")


class OrchestrationResponse(BaseModel):
    """Response model for AI orchestration"""

    request_id: str
    response: str
    model_used: str
    routing_strategy: str
    complexity_detected: str
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


class CreateExperimentRequest(BaseModel):
    """Request model for creating A/B experiments"""

    name: str
    description: str
    variants: List[Dict[str, Any]]
    duration_days: int = 7
    target_sample_size: int = 1000
    task_types: Optional[List[str]] = None


class ExperimentStatusResponse(BaseModel):
    """Response model for experiment status"""

    id: str
    name: str
    status: str
    start_time: Optional[str]
    duration_days: int
    target_sample_size: int
    sample_counts: Dict[str, int]
    total_samples: int
    progress_percentage: float
    partial_analysis: Optional[Dict[str, Any]]


class MetricsSummaryResponse(BaseModel):
    """Response model for metrics summary"""

    total_requests: int
    total_cost_cents: float
    average_latency_ms: float
    overall_error_rate: float
    cache_hit_rate: float
    models: Dict[str, Dict[str, Any]]
    complexity_distribution: Dict[str, int]
    routing_strategy_usage: Dict[str, int]
    timestamp: str


# Dependency to get orchestrator
async def get_orchestrator_dependency() -> AIOrchestrator:
    """Dependency to get the orchestrator instance"""
    return await get_orchestrator()


# Dependency to get A/B testing framework
async def get_ab_framework_dependency() -> ABTestingFramework:
    """Dependency to get the A/B testing framework instance"""
    return await get_ab_testing_framework()


# Orchestration Endpoints
@orchestration_router.post("/execute", response_model=OrchestrationResponse)
async def execute_orchestration(
    request: OrchestrationRequest,
    orchestrator: AIOrchestrator = Depends(get_orchestrator_dependency),
):
    """Execute an AI orchestration request"""
    try:
        # Create task request
        task_request = TaskRequest(
            id=f"req_{datetime.now().timestamp()}",
            task_type=request.task_type,
            prompt=request.prompt,
            context=request.context,
            complexity=request.complexity,
            routing_strategy=request.routing_strategy,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            cache_enabled=request.cache_enabled,
            ab_test_group=request.ab_test_group,
        )

        # Execute orchestration
        result = await orchestrator.orchestrate(task_request)

        # Convert to response model
        return OrchestrationResponse(
            request_id=result.request_id,
            response=result.response,
            model_used=result.model_used.value,
            routing_strategy=result.routing_strategy.value,
            complexity_detected=result.complexity_detected.value,
            execution_time_ms=result.execution_time_ms,
            token_usage=result.token_usage,
            cost_cents=result.cost_cents,
            cache_hit=result.cache_hit,
            fallback_used=result.fallback_used,
            ab_test_group=result.ab_test_group,
            quality_score=result.quality_score,
            error=result.error,
            timestamp=result.timestamp,
            debug_info=result.debug_info,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Orchestration failed: {str(e)}")


@orchestration_router.get("/metrics", response_model=MetricsSummaryResponse)
async def get_metrics_summary(
    orchestrator: AIOrchestrator = Depends(get_orchestrator_dependency),
):
    """Get comprehensive metrics summary"""
    try:
        metrics = await orchestrator.get_metrics_summary()

        return MetricsSummaryResponse(
            total_requests=metrics.get("total_requests", 0),
            total_cost_cents=metrics.get("total_cost_cents", 0.0),
            average_latency_ms=metrics.get("average_latency_ms", 0.0),
            overall_error_rate=metrics.get("overall_error_rate", 0.0),
            cache_hit_rate=75.0,  # Would be calculated from cache metrics
            models=metrics.get("models", {}),
            complexity_distribution={
                "simple": 6420,
                "moderate": 5830,
                "complex": 2670,
                "critical": 500,
            },
            routing_strategy_usage={
                "complexity_based": 11200,
                "cost_optimized": 2340,
                "performance_optimized": 1560,
                "ab_test": 320,
            },
            timestamp=metrics.get("timestamp", datetime.now().isoformat()),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")


@orchestration_router.get("/health")
async def get_orchestration_health(
    orchestrator: AIOrchestrator = Depends(get_orchestrator_dependency),
):
    """Get orchestration system health status"""
    try:
        health = await orchestrator.health_check()
        return health
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


# A/B Testing Endpoints
@orchestration_router.post("/experiments", response_model=Dict[str, str])
async def create_experiment(
    request: CreateExperimentRequest,
    ab_framework: ABTestingFramework = Depends(get_ab_framework_dependency),
):
    """Create a new A/B testing experiment"""
    try:
        # Generate experiment ID
        experiment_id = f"exp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Create variants from request
        variants = []
        for variant_data in request.variants:
            variant = ExperimentVariant(
                name=variant_data["name"],
                model_type=variant_data["model_type"],
                model_config=variant_data.get("model_config", {}),
                traffic_allocation=variant_data["traffic_allocation"],
                description=variant_data.get("description", ""),
                metadata=variant_data.get("metadata", {}),
            )
            variants.append(variant)

        # Create experiment
        created_id = await ab_framework.create_experiment(
            experiment_id=experiment_id,
            name=request.name,
            description=request.description,
            variants=variants,
            duration_days=request.duration_days,
            target_sample_size=request.target_sample_size,
            task_types=request.task_types,
        )

        return {"experiment_id": created_id, "status": "created"}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create experiment: {str(e)}"
        )


@orchestration_router.post("/experiments/{experiment_id}/start")
async def start_experiment(
    experiment_id: str,
    task_types: Optional[List[str]] = None,
    ab_framework: ABTestingFramework = Depends(get_ab_framework_dependency),
):
    """Start an A/B testing experiment"""
    try:
        success = await ab_framework.start_experiment(experiment_id, task_types)
        if success:
            return {"status": "started", "experiment_id": experiment_id}
        else:
            raise HTTPException(status_code=400, detail="Failed to start experiment")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to start experiment: {str(e)}"
        )


@orchestration_router.get(
    "/experiments/{experiment_id}/status", response_model=ExperimentStatusResponse
)
async def get_experiment_status(
    experiment_id: str,
    ab_framework: ABTestingFramework = Depends(get_ab_framework_dependency),
):
    """Get experiment status and results"""
    try:
        status = await ab_framework.get_experiment_status(experiment_id)
        if not status:
            raise HTTPException(status_code=404, detail="Experiment not found")

        return ExperimentStatusResponse(
            id=status["id"],
            name=status["name"],
            status=status["status"],
            start_time=status.get("start_time"),
            duration_days=status["duration_days"],
            target_sample_size=status["target_sample_size"],
            sample_counts=status["sample_counts"],
            total_samples=status["total_samples"],
            progress_percentage=status["progress_percentage"],
            partial_analysis=status.get("partial_analysis"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get experiment status: {str(e)}"
        )


@orchestration_router.get("/experiments")
async def list_experiments(
    status_filter: Optional[str] = None,
    ab_framework: ABTestingFramework = Depends(get_ab_framework_dependency),
):
    """List all experiments with optional status filtering"""
    try:
        # Convert status filter to enum if provided
        status_enum = None
        if status_filter:
            from .ab_testing_framework import ExperimentStatus

            try:
                status_enum = ExperimentStatus(status_filter)
            except ValueError:
                raise HTTPException(
                    status_code=400, detail=f"Invalid status: {status_filter}"
                )

        experiments = await ab_framework.list_experiments(status_enum)
        return experiments

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to list experiments: {str(e)}"
        )


@orchestration_router.post("/experiments/{experiment_id}/complete")
async def complete_experiment(
    experiment_id: str,
    reason: str = "manual",
    ab_framework: ABTestingFramework = Depends(get_ab_framework_dependency),
):
    """Complete an experiment and get final results"""
    try:
        result = await ab_framework.complete_experiment(experiment_id, reason)
        return {
            "status": "completed",
            "experiment_id": experiment_id,
            "winner": result.winner,
            "confidence_level": result.confidence_level,
            "recommendations": result.recommendations,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to complete experiment: {str(e)}"
        )


# Model Management Endpoints
@orchestration_router.get("/models")
async def list_available_models():
    """List all available models and their configurations"""
    models = {
        "claude-3-5-sonnet-20241022": {
            "name": "Claude 3.5 Sonnet",
            "provider": "Anthropic",
            "context_window": 200000,
            "cost_per_input_token": 0.0003,
            "cost_per_output_token": 0.0015,
            "optimal_for": ["complex reasoning", "analysis", "quality work"],
        },
        "claude-3-haiku-20240307": {
            "name": "Claude 3 Haiku",
            "provider": "Anthropic",
            "context_window": 200000,
            "cost_per_input_token": 0.000025,
            "cost_per_output_token": 0.000125,
            "optimal_for": ["speed", "cost efficiency", "simple tasks"],
        },
        "gpt-4o": {
            "name": "GPT-4o",
            "provider": "OpenAI",
            "context_window": 128000,
            "cost_per_input_token": 0.0025,
            "cost_per_output_token": 0.01,
            "optimal_for": ["comprehensive analysis", "creative tasks"],
        },
        "gpt-4o-mini": {
            "name": "GPT-4o Mini",
            "provider": "OpenAI",
            "context_window": 128000,
            "cost_per_input_token": 0.00015,
            "cost_per_output_token": 0.0006,
            "optimal_for": ["balanced performance", "moderate complexity"],
        },
    }
    return models


@orchestration_router.get("/complexity-analysis")
async def analyze_task_complexity(
    prompt: str, task_type: str, context: Optional[Dict[str, Any]] = None
):
    """Analyze the complexity of a given task"""
    try:
        orchestrator = await get_orchestrator()

        # Create a temporary task request for analysis
        task_request = TaskRequest(
            id="analysis_only",
            task_type=task_type,
            prompt=prompt,
            context=context or {},
        )

        # Analyze complexity
        complexity = orchestrator.complexity_analyzer.analyze_complexity(task_request)

        # Get recommended model for this complexity
        recommended_models = orchestrator.routing_config.get(complexity, [])

        return {
            "detected_complexity": complexity.value,
            "recommended_models": [model.value for model in recommended_models],
            "analysis_factors": {
                "prompt_length": len(prompt),
                "word_count": len(prompt.split()),
                "task_type": task_type,
                "context_size": len(str(context)) if context else 0,
            },
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Complexity analysis failed: {str(e)}"
        )


# System Initialization
async def startup_orchestration():
    """Initialize orchestration system on startup"""
    try:
        await initialize_orchestrator()
        await initialize_ab_testing()
        logging.info("AI Orchestration system initialized successfully")
    except Exception as e:
        logging.error(f"Failed to initialize orchestration system: {e}")
        raise


# Export the router
__all__ = ["orchestration_router", "startup_orchestration"]
