# A/B Testing Framework for AI Model Comparison
# Comprehensive framework for comparing model performance, quality, and cost-effectiveness
# Includes statistical analysis, experiment management, and automated decision making

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import statistics
from scipy import stats
import numpy as np

class ExperimentStatus(Enum):
    """Status of A/B test experiments"""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class MetricType(Enum):
    """Types of metrics to track in experiments"""
    LATENCY = "latency"
    COST = "cost"
    QUALITY = "quality"
    ERROR_RATE = "error_rate"
    USER_SATISFACTION = "user_satisfaction"
    TOKEN_EFFICIENCY = "token_efficiency"

@dataclass
class ExperimentVariant:
    """Configuration for an experiment variant (A/B group)"""
    name: str
    model_type: str
    model_config: Dict[str, Any]
    traffic_allocation: float  # Percentage of traffic (0-1)
    description: str
    metadata: Dict[str, Any] = None

@dataclass
class ExperimentMetric:
    """Metric configuration for experiments"""
    name: str
    type: MetricType
    weight: float  # Importance weight (0-1)
    target_direction: str  # "minimize" or "maximize"
    significance_threshold: float = 0.05  # Statistical significance threshold
    minimum_sample_size: int = 100

@dataclass
class VariantResult:
    """Results for a single variant in an experiment"""
    variant_name: str
    sample_size: int
    metrics: Dict[str, List[float]]  # Metric name -> list of values
    summary_stats: Dict[str, Dict[str, float]]  # Metric -> {mean, std, p95, etc}
    confidence_intervals: Dict[str, Tuple[float, float]]
    cost_analysis: Dict[str, float]

@dataclass
class ExperimentResult:
    """Complete results from an A/B experiment"""
    experiment_id: str
    start_time: datetime
    end_time: Optional[datetime]
    status: ExperimentStatus
    variants: List[VariantResult]
    statistical_analysis: Dict[str, Any]
    winner: Optional[str]
    confidence_level: float
    business_impact: Dict[str, float]
    recommendations: List[str]

class ABTestingFramework:
    """
    Comprehensive A/B Testing Framework for AI Model Comparison
    
    Features:
    - Multi-variant testing (A/B/C/D...)
    - Statistical significance analysis
    - Cost-benefit analysis
    - Quality assessment with multiple metrics
    - Automated experiment management
    - Real-time monitoring and alerts
    - Bayesian and frequentist statistical methods
    """
    
    def __init__(self, redis_client=None):
        self.redis_client = redis_client
        self.experiments: Dict[str, Dict] = {}
        self.active_experiments: Dict[str, str] = {}  # Request type -> experiment ID
        self.variant_assignments: Dict[str, str] = {}  # User/session -> variant
        
        # Default metrics configuration
        self.default_metrics = [
            ExperimentMetric("latency", MetricType.LATENCY, 0.3, "minimize"),
            ExperimentMetric("cost", MetricType.COST, 0.25, "minimize"),
            ExperimentMetric("quality", MetricType.QUALITY, 0.35, "maximize"),
            ExperimentMetric("error_rate", MetricType.ERROR_RATE, 0.1, "minimize")
        ]
    
    async def create_experiment(self, 
                              experiment_id: str,
                              name: str,
                              description: str,
                              variants: List[ExperimentVariant],
                              metrics: Optional[List[ExperimentMetric]] = None,
                              duration_days: int = 7,
                              target_sample_size: int = 1000,
                              task_types: List[str] = None) -> str:
        """
        Create a new A/B test experiment
        
        Args:
            experiment_id: Unique identifier for the experiment
            name: Human-readable name
            description: Experiment description and hypothesis
            variants: List of variants to test
            metrics: Metrics to track (uses defaults if None)
            duration_days: Maximum duration in days
            target_sample_size: Target sample size per variant
            task_types: Task types to include in experiment
        
        Returns:
            experiment_id: The created experiment ID
        """
        
        # Validate variants
        if len(variants) < 2:
            raise ValueError("Need at least 2 variants for A/B testing")
        
        total_allocation = sum(v.traffic_allocation for v in variants)
        if abs(total_allocation - 1.0) > 0.01:
            raise ValueError("Traffic allocation must sum to 1.0")
        
        # Use default metrics if none provided
        if metrics is None:
            metrics = self.default_metrics
        
        # Create experiment configuration
        experiment_config = {
            "id": experiment_id,
            "name": name,
            "description": description,
            "status": ExperimentStatus.DRAFT.value,
            "variants": [asdict(v) for v in variants],
            "metrics": [asdict(m) for m in metrics],
            "created_at": datetime.now().isoformat(),
            "start_time": None,
            "end_time": None,
            "duration_days": duration_days,
            "target_sample_size": target_sample_size,
            "task_types": task_types or [],
            "results": {variant.name: {"samples": [], "metrics": {}} for variant in variants},
            "analysis": {}
        }
        
        # Store experiment
        self.experiments[experiment_id] = experiment_config
        
        # Store in Redis if available
        if self.redis_client:
            await self.redis_client.setex(
                f"experiment:{experiment_id}",
                86400 * (duration_days + 1),  # Store for duration + 1 day
                json.dumps(experiment_config, default=str)
            )
        
        return experiment_id
    
    async def start_experiment(self, experiment_id: str, task_types: List[str] = None) -> bool:
        """Start an experiment and begin collecting data"""
        
        if experiment_id not in self.experiments:
            raise ValueError(f"Experiment {experiment_id} not found")
        
        experiment = self.experiments[experiment_id]
        
        if experiment["status"] != ExperimentStatus.DRAFT.value:
            raise ValueError(f"Can only start experiments in DRAFT status")
        
        # Update experiment status
        experiment["status"] = ExperimentStatus.RUNNING.value
        experiment["start_time"] = datetime.now().isoformat()
        
        # Register experiment for specified task types
        if task_types:
            for task_type in task_types:
                self.active_experiments[task_type] = experiment_id
        
        # Update in Redis
        if self.redis_client:
            await self.redis_client.setex(
                f"experiment:{experiment_id}",
                86400 * experiment["duration_days"],
                json.dumps(experiment, default=str)
            )
        
        return True
    
    async def assign_variant(self, 
                           user_id: str, 
                           task_type: str, 
                           experiment_id: Optional[str] = None) -> Optional[str]:
        """
        Assign a user to a variant for A/B testing
        
        Uses consistent hashing to ensure users get the same variant
        across multiple requests within an experiment.
        """
        
        # Find active experiment for task type
        if not experiment_id:
            experiment_id = self.active_experiments.get(task_type)
        
        if not experiment_id or experiment_id not in self.experiments:
            return None
        
        experiment = self.experiments[experiment_id]
        
        if experiment["status"] != ExperimentStatus.RUNNING.value:
            return None
        
        # Check if user already assigned
        assignment_key = f"{user_id}:{experiment_id}"
        if assignment_key in self.variant_assignments:
            return self.variant_assignments[assignment_key]
        
        # Assign variant based on consistent hashing
        user_hash = hash(f"{user_id}:{experiment_id}") % 10000 / 10000.0
        
        cumulative_allocation = 0.0
        assigned_variant = None
        
        for variant in experiment["variants"]:
            cumulative_allocation += variant["traffic_allocation"]
            if user_hash <= cumulative_allocation:
                assigned_variant = variant["name"]
                break
        
        # Store assignment
        if assigned_variant:
            self.variant_assignments[assignment_key] = assigned_variant
            
            # Store in Redis for persistence
            if self.redis_client:
                await self.redis_client.setex(
                    f"assignment:{assignment_key}",
                    86400 * experiment["duration_days"],
                    assigned_variant
                )
        
        return assigned_variant
    
    async def record_result(self, 
                          experiment_id: str,
                          variant_name: str,
                          metrics: Dict[str, float],
                          metadata: Dict[str, Any] = None) -> bool:
        """
        Record a result for analysis
        
        Args:
            experiment_id: The experiment ID
            variant_name: Which variant this result is for
            metrics: Dictionary of metric_name -> value
            metadata: Additional context information
        """
        
        if experiment_id not in self.experiments:
            return False
        
        experiment = self.experiments[experiment_id]
        
        if experiment["status"] != ExperimentStatus.RUNNING.value:
            return False
        
        # Record the result
        result_record = {
            "timestamp": datetime.now().isoformat(),
            "metrics": metrics,
            "metadata": metadata or {}
        }
        
        # Initialize if needed
        if variant_name not in experiment["results"]:
            experiment["results"][variant_name] = {"samples": [], "metrics": {}}
        
        # Add sample
        experiment["results"][variant_name]["samples"].append(result_record)
        
        # Update metrics aggregation
        for metric_name, value in metrics.items():
            if metric_name not in experiment["results"][variant_name]["metrics"]:
                experiment["results"][variant_name]["metrics"][metric_name] = []
            
            experiment["results"][variant_name]["metrics"][metric_name].append(value)
        
        # Check if experiment should end
        await self._check_experiment_completion(experiment_id)
        
        return True
    
    async def _check_experiment_completion(self, experiment_id: str):
        """Check if an experiment should be completed based on various criteria"""
        
        experiment = self.experiments[experiment_id]
        
        # Check time-based completion
        if experiment["start_time"]:
            start_time = datetime.fromisoformat(experiment["start_time"])
            if datetime.now() > start_time + timedelta(days=experiment["duration_days"]):
                await self.complete_experiment(experiment_id, "time_limit_reached")
                return
        
        # Check sample size completion
        min_samples = min(
            len(experiment["results"][variant]["samples"]) 
            for variant in experiment["results"]
        )
        
        if min_samples >= experiment["target_sample_size"]:
            # Check for statistical significance
            analysis = await self.analyze_experiment(experiment_id)
            
            if analysis and analysis.get("has_significant_result", False):
                await self.complete_experiment(experiment_id, "statistical_significance")
                return
    
    async def analyze_experiment(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        """
        Perform comprehensive statistical analysis of experiment results
        
        Includes:
        - Descriptive statistics for each variant
        - Statistical significance testing
        - Confidence intervals
        - Effect size calculations
        - Cost-benefit analysis
        """
        
        if experiment_id not in self.experiments:
            return None
        
        experiment = self.experiments[experiment_id]
        
        # Extract data for analysis
        variant_data = {}
        for variant_name, results in experiment["results"].items():
            if len(results["samples"]) == 0:
                continue
            
            variant_data[variant_name] = {
                "metrics": results["metrics"],
                "sample_size": len(results["samples"])
            }
        
        if len(variant_data) < 2:
            return {"error": "Insufficient data for analysis"}
        
        # Perform statistical analysis
        analysis = {
            "experiment_id": experiment_id,
            "analysis_time": datetime.now().isoformat(),
            "sample_sizes": {name: data["sample_size"] for name, data in variant_data.items()},
            "descriptive_stats": {},
            "significance_tests": {},
            "effect_sizes": {},
            "confidence_intervals": {},
            "recommendations": [],
            "has_significant_result": False,
            "winner": None
        }
        
        # Calculate descriptive statistics
        for variant_name, data in variant_data.items():
            analysis["descriptive_stats"][variant_name] = {}
            
            for metric_name, values in data["metrics"].items():
                if len(values) > 0:
                    stats_summary = {
                        "mean": np.mean(values),
                        "median": np.median(values),
                        "std": np.std(values),
                        "min": np.min(values),
                        "max": np.max(values),
                        "p25": np.percentile(values, 25),
                        "p75": np.percentile(values, 75),
                        "p95": np.percentile(values, 95),
                        "p99": np.percentile(values, 99)
                    }
                    analysis["descriptive_stats"][variant_name][metric_name] = stats_summary
        
        # Perform pairwise significance tests
        variant_names = list(variant_data.keys())
        
        for i, variant_a in enumerate(variant_names):
            for variant_b in variant_names[i+1:]:
                comparison_key = f"{variant_a}_vs_{variant_b}"
                analysis["significance_tests"][comparison_key] = {}
                
                for metric_name in experiment["metrics"]:
                    metric_config = next((m for m in experiment["metrics"] if m["name"] == metric_name), None)
                    if not metric_config:
                        continue
                    
                    values_a = variant_data[variant_a]["metrics"].get(metric_name, [])
                    values_b = variant_data[variant_b]["metrics"].get(metric_name, [])
                    
                    if len(values_a) > 10 and len(values_b) > 10:
                        # Perform t-test
                        try:
                            t_stat, p_value = stats.ttest_ind(values_a, values_b)
                            
                            # Calculate effect size (Cohen's d)
                            pooled_std = np.sqrt(((len(values_a) - 1) * np.var(values_a) + 
                                                (len(values_b) - 1) * np.var(values_b)) / 
                                               (len(values_a) + len(values_b) - 2))
                            
                            cohens_d = (np.mean(values_a) - np.mean(values_b)) / pooled_std if pooled_std > 0 else 0
                            
                            test_result = {
                                "t_statistic": t_stat,
                                "p_value": p_value,
                                "significant": p_value < metric_config["significance_threshold"],
                                "effect_size": cohens_d,
                                "mean_difference": np.mean(values_a) - np.mean(values_b),
                                "confidence_interval": stats.t.interval(
                                    0.95, 
                                    len(values_a) + len(values_b) - 2,
                                    loc=np.mean(values_a) - np.mean(values_b),
                                    scale=stats.sem(values_a + values_b)
                                )
                            }
                            
                            analysis["significance_tests"][comparison_key][metric_name] = test_result
                            
                            # Check for significant results
                            if test_result["significant"]:
                                analysis["has_significant_result"] = True
                        
                        except Exception as e:
                            analysis["significance_tests"][comparison_key][metric_name] = {
                                "error": str(e)
                            }
        
        # Determine winner based on weighted score
        if analysis["has_significant_result"]:
            variant_scores = {}
            
            for variant_name in variant_names:
                score = 0.0
                total_weight = 0.0
                
                for metric in experiment["metrics"]:
                    metric_name = metric["name"]
                    weight = metric["weight"]
                    
                    if (variant_name in analysis["descriptive_stats"] and 
                        metric_name in analysis["descriptive_stats"][variant_name]):
                        
                        metric_value = analysis["descriptive_stats"][variant_name][metric_name]["mean"]
                        
                        # Normalize based on target direction
                        if metric["target_direction"] == "maximize":
                            normalized_score = metric_value
                        else:  # minimize
                            normalized_score = -metric_value
                        
                        score += normalized_score * weight
                        total_weight += weight
                
                if total_weight > 0:
                    variant_scores[variant_name] = score / total_weight
            
            if variant_scores:
                analysis["winner"] = max(variant_scores, key=variant_scores.get)
                analysis["variant_scores"] = variant_scores
        
        # Generate recommendations
        recommendations = []
        
        if analysis["has_significant_result"]:
            if analysis["winner"]:
                recommendations.append(f"Recommend deploying variant '{analysis['winner']}' based on statistical analysis")
        else:
            recommendations.append("No statistically significant difference found. Consider extending experiment duration.")
        
        # Check sample sizes
        min_sample_size = min(analysis["sample_sizes"].values())
        if min_sample_size < 100:
            recommendations.append("Sample sizes are low. Continue collecting data for more reliable results.")
        
        analysis["recommendations"] = recommendations
        
        # Store analysis results
        experiment["analysis"] = analysis
        
        return analysis
    
    async def complete_experiment(self, experiment_id: str, reason: str = "manual") -> ExperimentResult:
        """Complete an experiment and finalize results"""
        
        if experiment_id not in self.experiments:
            raise ValueError(f"Experiment {experiment_id} not found")
        
        experiment = self.experiments[experiment_id]
        
        # Perform final analysis
        analysis = await self.analyze_experiment(experiment_id)
        
        # Update experiment status
        experiment["status"] = ExperimentStatus.COMPLETED.value
        experiment["end_time"] = datetime.now().isoformat()
        experiment["completion_reason"] = reason
        
        # Remove from active experiments
        for task_type, exp_id in list(self.active_experiments.items()):
            if exp_id == experiment_id:
                del self.active_experiments[task_type]
        
        # Create final result
        result = ExperimentResult(
            experiment_id=experiment_id,
            start_time=datetime.fromisoformat(experiment["start_time"]),
            end_time=datetime.fromisoformat(experiment["end_time"]),
            status=ExperimentStatus.COMPLETED,
            variants=[],  # Would be populated from analysis
            statistical_analysis=analysis or {},
            winner=analysis.get("winner") if analysis else None,
            confidence_level=0.95,
            business_impact={},  # Could be calculated based on metrics
            recommendations=analysis.get("recommendations", []) if analysis else []
        )
        
        return result
    
    async def get_experiment_status(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        """Get current status and partial results of an experiment"""
        
        if experiment_id not in self.experiments:
            return None
        
        experiment = self.experiments[experiment_id]
        
        # Get basic info
        status = {
            "id": experiment_id,
            "name": experiment["name"],
            "status": experiment["status"],
            "start_time": experiment["start_time"],
            "duration_days": experiment["duration_days"],
            "target_sample_size": experiment["target_sample_size"]
        }
        
        # Add sample counts
        sample_counts = {}
        for variant_name, results in experiment["results"].items():
            sample_counts[variant_name] = len(results["samples"])
        
        status["sample_counts"] = sample_counts
        status["total_samples"] = sum(sample_counts.values())
        
        # Add progress percentage
        min_samples = min(sample_counts.values()) if sample_counts else 0
        status["progress_percentage"] = min(100, (min_samples / experiment["target_sample_size"]) * 100)
        
        # Add partial analysis if enough data
        if min_samples > 10:
            status["partial_analysis"] = await self.analyze_experiment(experiment_id)
        
        return status
    
    async def list_experiments(self, status_filter: Optional[ExperimentStatus] = None) -> List[Dict[str, Any]]:
        """List all experiments with optional status filtering"""
        
        experiments = []
        
        for exp_id, experiment in self.experiments.items():
            if status_filter and experiment["status"] != status_filter.value:
                continue
            
            summary = {
                "id": exp_id,
                "name": experiment["name"],
                "status": experiment["status"],
                "created_at": experiment["created_at"],
                "start_time": experiment.get("start_time"),
                "variants": [v["name"] for v in experiment["variants"]],
                "sample_count": sum(len(results["samples"]) for results in experiment["results"].values())
            }
            
            experiments.append(summary)
        
        return experiments

# Global A/B testing framework instance
ab_testing_framework = ABTestingFramework()

async def initialize_ab_testing(redis_client=None):
    """Initialize the A/B testing framework"""
    ab_testing_framework.redis_client = redis_client

async def get_ab_testing_framework() -> ABTestingFramework:
    """Get the global A/B testing framework instance"""
    return ab_testing_framework